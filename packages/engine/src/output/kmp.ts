// buildKmp() — wraps @keymanapp/kmc-package's KmpCompiler to produce an
// installable Keyman package (.kmp) entirely in the browser, from the in-memory
// VirtualFS plus the compiled artifacts the .kmn compile produced.
//
// WHY THIS EXISTS: the source .zip requires the recipient to install Keyman
// Developer, unzip into a specific directory, open the project, and compile. A
// .kmp installs by double-clicking on Keyman for Windows, macOS, Linux, iOS,
// and Android. It is the artifact an ordinary author actually wants.
//
// Unlike the .kmn compiler (packages/engine/src/compiler/index.ts), kmc-package
// is PURE JS — no wasm. Its only deps are jszip + marked + @keymanapp/{common-
// types,developer-utils}, and it drives all I/O through a CompilerCallbacks
// object, so it runs against the VirtualFS with no filesystem behind it. The
// kmp.json schema validator that common-types ships is a precompiled ajv
// standalone module, so packaging needs no network either.
//
// A .kmp is a DEFLATE zip whose members are FLATTENED to basename: kmp.json,
// kmp.inf, then the .kmx/.kvk/.js and the doc files. The .kps <Files> list is
// what decides membership, so this module's job is to make every path that
// descriptor names resolve to a real VirtualFS key — see ./kmpPaths.ts.

import { devLog } from "@keyboard-studio/contracts/dev-log";
import {
  CompilerLoadError,
  createVirtualFS,
  type CompilerDiagnostic,
  type LintSeverity,
  type VirtualFS,
} from "@keyboard-studio/contracts";
import { kmpPathCallbacks, resolveFilename } from "./kmpPaths.js";
import { pathUtils } from "../compiler/pathUtils.js";

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/**
 * The compiled artifacts a `.kps` `<Files>` list expects to find under `build/`.
 *
 * These come from `CompilerService.compile()`'s `CompileArtifact.data`. The
 * descriptor derives its `<Files>` list from the `.kmn`'s `&TARGETS` /
 * `&VISUALKEYBOARD` stores, so which of the optional two it names varies per
 * keyboard — a listed-but-absent member fails the build with `KM04003`, which
 * is reported rather than thrown.
 */
export interface KmpBuildArtifacts {
  /** Always required — every package ships the desktop binary. */
  kmx: Uint8Array;
  /** Present iff the descriptor lists `..\build\<id>.kvk`. */
  kvk?: Uint8Array;
  /** Present iff the descriptor lists `..\build\<id>.js` (web/touch targets). */
  js?: Uint8Array;
}

export interface BuildKmpOptions {
  /** Upgrade kmc-package warnings to errors. Default `false`. */
  compilerWarningsAsErrors?: boolean;
  /**
   * kmc-package's filename-convention checks. Default `false`: an imported
   * keyboard's doc filenames are outside the author's control, and packaging
   * should not fail on a naming nit.
   */
  checkFilenameConventions?: boolean;
  /** Override the descriptor location. Default `source/<keyboardId>.kps`. */
  kpsPath?: string;
}

export interface BuildKmpResult {
  /** True iff kmc-package returned .kmp bytes with no error/fatal diagnostic. */
  success: boolean;
  /** The .kmp zip. Zero-length when `!success`. */
  bytes: Uint8Array;
  /** Intended download filename, e.g. `bambara.kmp`. */
  filename: string;
  /** Package-compiler diagnostics, mapped from kmc-package's CompilerEvents. */
  diagnostics: CompilerDiagnostic[];
  /** Wall-clock ms, including first-call dynamic-import cost. */
  buildMs: number;
}

// ---------------------------------------------------------------------------
// Lazy kmc-package import
// ---------------------------------------------------------------------------

interface KmpCompilerArtifact {
  filename: string;
  data: Uint8Array;
}

interface KmpCompilerRawResult {
  artifacts?: { kmp?: KmpCompilerArtifact };
}

export interface KmpCompilerLike {
  init(callbacks: unknown, options: unknown): Promise<boolean>;
  /**
   * Declared non-nullable upstream, but `KmnCompiler.run` returns `null` on
   * failure in practice and the kmn bridge already types it `| null`. Do not
   * trust the declared type.
   */
  run(inputFilename: string, outputFilename?: string): Promise<KmpCompilerRawResult | null>;
}

let _modulePromise: Promise<{ KmpCompiler: new () => KmpCompilerLike } | null> | null = null;
let _ctor: (new () => KmpCompilerLike) | null = null;
let _down = false;
let _downReason: string | null = null;

async function loadKmpCompiler(): Promise<{ KmpCompiler: new () => KmpCompilerLike }> {
  // A genuine dynamic import, unlike the kmn bridge's (which is static in
  // disguise because its Emscripten glue must resolve a .wasm sibling). Here it
  // really does defer jszip + marked out of the studio's entry chunk until the
  // author asks for a package.
  const mod = (await import("@keymanapp/kmc-package")) as unknown as {
    KmpCompiler?: new () => KmpCompilerLike;
  };
  if (typeof mod.KmpCompiler !== "function") {
    throw new CompilerLoadError(
      "@keymanapp/kmc-package imported but KmpCompiler export missing",
    );
  }
  return { KmpCompiler: mod.KmpCompiler };
}

/** Begin loading kmc-package. Idempotent; sticky on failure. */
export async function initKmpCompiler(): Promise<void> {
  if (_ctor !== null) return;
  if (_down) {
    throw new CompilerLoadError(
      `kmc-package load failed earlier: ${_downReason ?? "unknown"}`,
    );
  }
  _modulePromise ??= loadKmpCompiler().catch((err: unknown) => {
    // Sticky, mirroring the kmn bridge's `_wasmDown`: a chunk-load failure
    // must not retry-storm on every button press.
    _down = true;
    _downReason = err instanceof Error ? err.message : String(err);
    return null;
  });
  const result = await _modulePromise;
  if (result === null) {
    throw new CompilerLoadError(`kmc-package load failed: ${_downReason ?? "unknown"}`);
  }
  _ctor = result.KmpCompiler;
}

/** Synchronous ready check. Gated on the ctor, never on a shared instance. */
export function isKmpCompilerReady(): boolean {
  return _ctor !== null;
}

/** @internal Test seam — resets the sticky loader state between cases. */
export function __resetKmpCompilerForTests(): void {
  _modulePromise = null;
  _ctor = null;
  _down = false;
  _downReason = null;
}

// ---------------------------------------------------------------------------
// Diagnostic mapping
// ---------------------------------------------------------------------------

// Verified against @keymanapp/developer-utils@19.0.240-alpha's
// compiler-interfaces.js: CompilerErrorMask.Severity === 0x00F00000 and
// CompilerErrorMask.Error === 0x000FFFFF.
const SEVERITY_MASK = 0x00f00000;
const ERROR_MASK = 0x000fffff;

/**
 * `CompilerEvent` has NO `severity` field — severity is bit-packed into `code`.
 * (The kmn bridge reads a `message.severity` that never exists, which is why
 * every kmc-kmn diagnostic is currently labelled `warning`; that is a
 * pre-existing defect tracked separately. Do not copy it here.)
 *
 * Values are CompilerErrorSeverity: Debug 0, Verbose 0x100000, Info 0x200000,
 * Hint 0x300000, Warn 0x400000, Error 0x500000, Fatal 0x600000.
 */
const SEVERITY_BY_MASK: Record<number, LintSeverity> = {
  0x000000: "info", // Debug
  0x100000: "info", // Verbose
  0x200000: "info",
  0x300000: "hint",
  0x400000: "warning",
  0x500000: "error",
  0x600000: "fatal",
};

const CODE_PREFIX: Record<LintSeverity, string> = {
  fatal: "KM_FATAL",
  error: "KM_ERROR",
  warning: "KM_WARN",
  hint: "KM_HINT",
  info: "KM_INFO",
};

/**
 * Render kmc-package's numeric code in the `KM04003` form its own CLI and docs
 * print. Mirrors `CompilerError.formatCode` in developer-utils.
 *
 * The numeric form is deliberate: `PackageCompilerMessages`' TypeScript
 * identifiers are `@internal`, so keying our stable studio codes to them would
 * couple us to a private upstream surface — the same reasoning `LintCode`'s
 * docstring gives for having a studio namespace at all.
 */
export function formatKmCode(code: number): string {
  return Number.isInteger(code)
    ? `KM${(code & ERROR_MASK).toString(16).toUpperCase().padStart(5, "0")}`
    : "KM_UNKNOWN";
}

/** Expand a byte offset into a 1-based line/column against the descriptor text. */
function offsetToLineColumn(text: string, offset: number): { line: number; column: number } {
  const clamped = Math.max(0, Math.min(offset, text.length));
  const upto = text.slice(0, clamped);
  const line = (upto.match(/\n/g)?.length ?? 0) + 1;
  const column = clamped - (upto.lastIndexOf("\n") + 1) + 1;
  return { line, column };
}

/** @internal Exported for unit test; maps one kmc-package event. */
export function mapKmpEvent(
  event: unknown,
  kpsPath: string,
  kpsText: string,
): CompilerDiagnostic {
  const e = (event ?? {}) as {
    code?: number;
    message?: string;
    detail?: string;
    filename?: string;
    line?: number;
    column?: number;
    offset?: number;
  };
  const code = typeof e.code === "number" ? e.code : -1;
  const severity = SEVERITY_BY_MASK[code & SEVERITY_MASK] ?? "warning";
  const file = typeof e.filename === "string" && e.filename !== "" ? e.filename : kpsPath;

  let line = typeof e.line === "number" && e.line > 0 ? e.line : undefined;
  let column = typeof e.column === "number" && e.column > 0 ? e.column : undefined;
  if (line === undefined && typeof e.offset === "number" && e.offset >= 0) {
    const lc = offsetToLineColumn(kpsText, e.offset);
    line = lc.line;
    column = lc.column;
  }

  return {
    code: `${CODE_PREFIX[severity]}_KMP_${formatKmCode(code)}`,
    severity,
    layer: "A",
    message:
      typeof e.message === "string" && e.message !== ""
        ? e.message
        : `(no message; raw=${JSON.stringify(e).slice(0, 200)})`,
    ...(typeof e.detail === "string" && e.detail !== "" ? { hint: e.detail } : {}),
    ...(line !== undefined
      ? { location: { file, line, ...(column !== undefined ? { column } : {}) } }
      : {}),
  } as CompilerDiagnostic;
}

// ---------------------------------------------------------------------------
// VirtualFS callback adapter
// ---------------------------------------------------------------------------

interface LookupMiss {
  path: string;
  op: string;
}

/** A miss carries no bytes; kmc-package treats any falsy return as "not found". */
function encode(content: Uint8Array | string): Uint8Array {
  return typeof content === "string" ? new TextEncoder().encode(content) : content;
}

/** @internal Exported for unit test. */
export function createKmpCallbacks(
  fs: VirtualFS,
  kpsPath: string,
  diagnostics: CompilerDiagnostic[],
  misses: LookupMiss[],
): Record<string, unknown> {
  const kpsEntry = fs.get(kpsPath);
  const kpsText =
    kpsEntry === undefined
      ? ""
      : typeof kpsEntry.content === "string"
        ? kpsEntry.content
        : new TextDecoder().decode(kpsEntry.content);

  /**
   * Normalize before probing. `pathUtils.join` does NOT normalize, and
   * kmc-package can hand us a key it built by joining — so an incoming
   * `source/../LICENSE.md` must still find `LICENSE.md`. Do not remove this in
   * the belief that resolveFilename already normalized: the two paths into this
   * helper are not the same.
   */
  function entryAt(path: string): ReturnType<VirtualFS["get"]> {
    return fs.get(pathUtils.normalize(path.replace(/\\/g, "/")));
  }

  function bytesAt(path: string, op: string): Uint8Array | null {
    const entry = entryAt(path);
    if (entry === undefined) {
      misses.push({ path: pathUtils.normalize(path.replace(/\\/g, "/")), op });
      return null;
    }
    return encode(entry.content);
  }

  function blockedNet(kind: string, url: string): never {
    diagnostics.push({
      code: "KM_ERROR_KMP_NETWORK_BLOCKED",
      severity: "error",
      layer: "A",
      message: `Package build attempted a network ${kind} for "${url}"; packaging must be offline.`,
      hint: "Report this — a package should never need the network to build.",
    } as CompilerDiagnostic);
    throw new Error(`kmc-package network access blocked: ${url}`);
  }

  return {
    // -- the four members kmc-package actually calls -----------------------
    loadFile(filename: string): Uint8Array | null {
      return bytesAt(filename, "loadFile");
    },

    resolveFilename,

    reportMessage(event: unknown): void {
      devLog.info("[kmc-package] reportMessage:", event);
      diagnostics.push(mapKmpEvent(event, kpsPath, kpsText));
    },

    path: kmpPathCallbacks,

    fs: {
      /**
       * EXACT key, not the kmn bridge's fuzzy multi-candidate probe. A basename
       * fallback here would let `source/x.kmx` masquerade as `build/x.kmx` and
       * ship a package containing the wrong file under the right name.
       */
      existsSync(filename: string): boolean {
        return entryAt(filename) !== undefined;
      },

      /**
       * Throws on a miss, Node-style — deliberately UNLIKE `loadFile`'s falsy
       * contract, because callers may `try/catch` this one. Never reached by
       * kmc-package today; correct anyway.
       */
      readFileSync(
        path: string,
        options?: { encoding?: string | null; flag?: string } | string | null,
      ): Uint8Array | string {
        const entry = entryAt(path);
        if (entry === undefined) {
          const err = new Error(`ENOENT: no such file or directory, open '${path}'`);
          (err as Error & { code?: string }).code = "ENOENT";
          throw err;
        }
        const encoding = typeof options === "string" ? options : options?.encoding;
        if (encoding === undefined || encoding === null) return encode(entry.content);
        if (!/^utf-?8$/i.test(encoding)) {
          throw new Error(`Unsupported encoding "${encoding}" for VirtualFS read`);
        }
        return typeof entry.content === "string"
          ? entry.content
          : new TextDecoder().decode(entry.content);
      },

      /**
       * Immediate child NAMES, not paths. `fsAsync.readdir` joins each returned
       * name back onto the parent, so returning full paths would yield
       * `source/source/welcome.htm`.
       */
      readdirSync(name: string): string[] {
        const dir = pathUtils.normalize(name.replace(/\\/g, "/"));
        const prefix = dir === "" ? "" : `${dir}/`;
        const children = new Set<string>();
        for (const key of fs.list(prefix)) {
          const rest = key.slice(prefix.length);
          if (rest === "") continue;
          const head = rest.split("/")[0];
          if (head !== undefined && head !== "") children.add(head);
        }
        return [...children];
      },

      /**
       * Writes into the staging clone. Should be unreachable: `run()` returns
       * the artifact and `write()` is a separate KeymanCompiler method we never
       * call. Writing to the throwaway clone is correct whether or not it is
       * dead, and the warn is the tripwire if that assumption ever breaks.
       */
      writeFileSync(path: string, data: Uint8Array): void {
        devLog.warn(`[kmc-package] unexpected writeFileSync("${path}") — staging into clone`);
        fs.set(pathUtils.normalize(path.replace(/\\/g, "/")), data, true);
      },

      /** No directory objects exist; the VFS is a flat keyed map. */
      mkdirSync(path: string): string {
        return path;
      },
    },

    // -- interface completeness; never reached today -----------------------
    /**
     * `byteLength` of the ENCODED content, never `String.length` — a `.htm`
     * with non-ASCII text would otherwise be undercounted. `undefined` on a
     * miss, distinct from `0` for a genuinely empty file (the scaffolder's
     * placeholder `.ico` is legitimately zero bytes).
     */
    fileSize(filename: string): number | undefined {
      const entry = entryAt(filename);
      return entry === undefined ? undefined : encode(entry.content).byteLength;
    },

    isDirectory(filename: string): boolean {
      const dir = pathUtils.normalize(filename.replace(/\\/g, "/"));
      if (dir === "") return true; // the root
      if (entryAt(dir) !== undefined) return false; // it is a file
      return fs.list(`${dir}/`).length > 0;
    },

    fsAsync: {
      async readFile(filename: string): Promise<Uint8Array> {
        const bytes = bytesAt(filename, "fsAsync.readFile");
        if (bytes === null) throw new Error(`ENOENT: ${filename}`);
        return bytes;
      },
      async readdir(filename: string): Promise<{ filename: string; type: "file" | "dir" }[]> {
        const dir = pathUtils.normalize(filename.replace(/\\/g, "/"));
        const prefix = dir === "" ? "" : `${dir}/`;
        const children = new Set<string>();
        for (const key of fs.list(prefix)) {
          const rest = key.slice(prefix.length);
          if (rest === "") continue;
          const head = rest.split("/")[0];
          if (head !== undefined && head !== "") children.add(head);
        }
        return [...children].map((name) => ({
          filename: name,
          type: fs.get(prefix + name) === undefined ? ("dir" as const) : ("file" as const),
        }));
      },
      async exists(filename: string): Promise<boolean> {
        return entryAt(filename) !== undefined;
      },
      resolveFilename,
    },

    /**
     * Packaging must be offline. `async` so the throw becomes a rejection
     * regardless of whether kmc-package awaits inside a try. The diagnostic is
     * pushed BEFORE throwing so the URL is visible even if the rejection is
     * swallowed and `run()` merely returns null.
     *
     * Verified never reached: kmc-package@19.0.240-alpha's build/src contains
     * zero `.net.` references.
     */
    net: {
      async fetchJSON(url: string): Promise<unknown> {
        return blockedNet("fetchJSON", url);
      },
      async fetchBlob(url: string): Promise<Uint8Array> {
        return blockedNet("fetchBlob", url);
      },
    },

    debug(msg: string): void {
      devLog.info("[kmc-package] debug:", msg);
    },

    fileURLToPath(url: string | URL): string {
      const s = typeof url === "string" ? url : url.href;
      return s.replace(/^file:\/\/\/?/, "");
    },
  };
}

// ---------------------------------------------------------------------------
// buildKmp()
// ---------------------------------------------------------------------------

function failureResult(
  keyboardId: string,
  diagnostics: CompilerDiagnostic[],
  t0: number,
): BuildKmpResult {
  return {
    success: false,
    bytes: new Uint8Array(0),
    filename: `${keyboardId}.kmp`,
    diagnostics,
    buildMs: Date.now() - t0,
  };
}

/**
 * Build `<keyboardId>.kmp` from the descriptor at `source/<keyboardId>.kps`,
 * staging `artifacts` into `build/` first.
 *
 * NEVER THROWS for an expected failure — a missing descriptor, a listed-but-
 * absent member, or an unavailable packager all come back as `success: false`
 * with diagnostics explaining why. The caller renders those; it does not need a
 * try/catch.
 *
 * The caller's VirtualFS is NOT mutated: staging happens on a clone. That
 * matters because the same projected VFS feeds the source .zip and the GitHub
 * PR path, and compiled artifacts must not leak into a community PR.
 */
export async function buildKmp(
  fs: VirtualFS,
  keyboardId: string,
  artifacts: KmpBuildArtifacts,
  opts: BuildKmpOptions = {},
): Promise<BuildKmpResult> {
  const t0 = Date.now();
  const kpsPath = opts.kpsPath ?? `source/${keyboardId}.kps`;
  const diagnostics: CompilerDiagnostic[] = [];
  const misses: LookupMiss[] = [];

  // Stage the compiled artifacts into `build/` on a CLONE. Shallow-entry clone
  // matches the precedent in serializeWorkingCopy: the projection helpers
  // replace whole entries via set() rather than mutating content buffers.
  const staged = createVirtualFS(fs.entries());
  staged.set(`build/${keyboardId}.kmx`, artifacts.kmx, true);
  if (artifacts.kvk !== undefined) staged.set(`build/${keyboardId}.kvk`, artifacts.kvk, true);
  if (artifacts.js !== undefined) staged.set(`build/${keyboardId}.js`, artifacts.js, true);

  if (staged.get(kpsPath) === undefined) {
    diagnostics.push({
      code: "KM_ERROR_KMP_NO_DESCRIPTOR",
      severity: "error",
      layer: "A",
      message: `No package descriptor at "${kpsPath}" — cannot build an installable package.`,
      hint: "The descriptor is written during output projection; this indicates a projection failure.",
    } as CompilerDiagnostic);
    return failureResult(keyboardId, diagnostics, t0);
  }

  try {
    await initKmpCompiler();
  } catch (err: unknown) {
    diagnostics.push({
      code: "KM_WARN_KMP_COMPILER_UNAVAILABLE",
      severity: "warning",
      layer: "A",
      message: `.kmp packager unavailable: ${err instanceof Error ? err.message : String(err)}`,
      hint: "Reload the studio; check the browser console for load errors.",
    } as CompilerDiagnostic);
    return failureResult(keyboardId, diagnostics, t0);
  }
  if (_ctor === null) {
    diagnostics.push({
      code: "KM_WARN_KMP_COMPILER_UNAVAILABLE",
      severity: "warning",
      layer: "A",
      message: ".kmp packager unavailable: KmpCompiler ctor missing after init",
    } as CompilerDiagnostic);
    return failureResult(keyboardId, diagnostics, t0);
  }

  const callbacks = createKmpCallbacks(staged, kpsPath, diagnostics, misses);

  // Construct into a LOCAL, never a module-scoped instance read back across an
  // await — the clobbering bug documented in compiler/index.ts. Only the ctor
  // is cached, so concurrent builds against different VFSes stay independent.
  const compiler = new _ctor();

  let ok: boolean;
  try {
    ok = await compiler.init(callbacks, {
      compilerWarningsAsErrors: opts.compilerWarningsAsErrors ?? false,
      checkFilenameConventions: opts.checkFilenameConventions ?? false,
      warnDeprecatedCode: true,
      shouldAddCompilerVersion: true,
      saveDebug: false,
      logLevel: "info",
      logFormat: "formatted",
      // Explicit: the default is "detected from console", and there is no
      // console to detect in a browser worker context.
      color: false,
    });
  } catch (err: unknown) {
    diagnostics.push({
      code: "KM_FATAL_KMP_INIT_THREW",
      severity: "fatal",
      layer: "A",
      message: `KmpCompiler.init threw: ${err instanceof Error ? err.message : String(err)}`,
    } as CompilerDiagnostic);
    return failureResult(keyboardId, diagnostics, t0);
  }

  if (!ok) {
    if (diagnostics.length === 0) {
      diagnostics.push({
        code: "KM_ERROR_KMP_INIT_FAILED",
        severity: "error",
        layer: "A",
        message: "KmpCompiler.init returned false (no further diagnostics)",
      } as CompilerDiagnostic);
    }
    return failureResult(keyboardId, diagnostics, t0);
  }

  let raw: KmpCompilerRawResult | null;
  try {
    raw = await compiler.run(kpsPath, `${keyboardId}.kmp`);
  } catch (err: unknown) {
    diagnostics.push({
      code: "KM_FATAL_KMP_THROWN",
      severity: "fatal",
      layer: "A",
      message: `KmpCompiler.run threw: ${err instanceof Error ? err.message : String(err)}`,
    } as CompilerDiagnostic);
    return failureResult(keyboardId, diagnostics, t0);
  }

  const kmp = raw?.artifacts?.kmp;
  if (kmp === undefined || kmp.data.byteLength === 0) {
    // Name what was absent. kmc-package reports its own KM04003 per missing
    // member, but a miss recorded on a path it never reports would otherwise
    // vanish, and "no artifact, no reason" is the least debuggable failure.
    const seen = new Set<string>();
    for (const m of misses) {
      if (seen.has(m.path)) continue;
      seen.add(m.path);
      diagnostics.push({
        code: "KM_ERROR_KMP_FILE_MISSING",
        severity: "error",
        layer: "A",
        message: `Package member "${m.path}" is not present in the working copy (${m.op}).`,
        hint: "Compile the keyboard first, or remove the entry from the descriptor's <Files> list.",
        location: { file: kpsPath, line: 1 },
      } as CompilerDiagnostic);
    }
    if (diagnostics.length === 0) {
      diagnostics.push({
        code: "KM_ERROR_KMP_NO_ARTIFACT",
        severity: "error",
        layer: "A",
        message: "KmpCompiler.run produced no .kmp artifact and reported no diagnostics.",
      } as CompilerDiagnostic);
    }
    return failureResult(keyboardId, diagnostics, t0);
  }

  const hasBlocking = diagnostics.some(
    (d) => d.severity === "error" || d.severity === "fatal",
  );

  devLog.info(
    `[kmc-package] ${kmp.filename} (${kmp.data.byteLength} bytes), ${diagnostics.length} diagnostics`,
  );

  return {
    success: !hasBlocking,
    // Copy so nothing hands out a view onto jszip's internal buffer.
    bytes: new Uint8Array(kmp.data),
    filename: kmp.filename !== "" ? kmp.filename : `${keyboardId}.kmp`,
    diagnostics,
    buildMs: Date.now() - t0,
  };
}
