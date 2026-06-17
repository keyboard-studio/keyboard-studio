// CompilerService.compile() — wraps @keymanapp/kmc-kmn's KmnCompiler
// for in-browser compile of .kmn -> .kmx + .kvk + KMW .js.
//
// kmc-kmn is callback-IO based (no direct Node fs/path use); we bridge
// its callbacks to our VirtualFS so the compile pipeline runs entirely
// in the browser. The wasm-host.js + wasm-host.wasm vendored under
// /wasm/kmcmplib/ are used by kmc-kmn's internal loader (via its own
// '../import/kmcmplib/wasm-host.js' static import).

import type {
  CompilerService,
  CompileResult,
  CompileArtifact,
  CompilerDiagnostic,
  LintFinding,
  LintSeverity,
  VirtualFS,
} from "@keyboard-studio/contracts";
import { CompilerLoadError } from "@keyboard-studio/contracts";
import { parseKpjFlags, type CompilerOptions } from "./parseKpjFlags.js";
import { pathUtils } from "./pathUtils.js";

// ---------------------------------------------------------------------------
// Lazy kmc-kmn import + compiler singleton
// ---------------------------------------------------------------------------

export interface KmnCompilerLike {
  init(callbacks: unknown, options: unknown): Promise<boolean>;
  run(
    infile: string,
    outfile: string,
  ): Promise<KmnCompilerResult | null>;
}

interface KmnCompilerArtifact {
  filename: string;
  data: Uint8Array;
}

interface KmnCompilerResult {
  artifacts?: {
    kmx?: KmnCompilerArtifact;
    kvk?: KmnCompilerArtifact;
    js?: KmnCompilerArtifact;
  };
  extra?: unknown;
}

let _modulePromise: Promise<{ KmnCompiler: new () => KmnCompilerLike } | null> | null =
  null;
let _compilerCtor: (new () => KmnCompilerLike) | null = null;
let _compiler: KmnCompilerLike | null = null;
let _wasmDown = false;
let _wasmDownReason: string | null = null;

async function loadKmnCompiler(): Promise<
  { KmnCompiler: new () => KmnCompilerLike } | null
> {
  // Static import — Vite bundles the package + transitively the wasm-host
  // glue. The .wasm sibling is fetched via the glue's import.meta.url at
  // first init; we don't intervene. We cast via unknown because kmc-kmn's
  // KmnCompiler has private fields the structural type can't reach.
  const mod = (await import("@keymanapp/kmc-kmn")) as unknown as {
    KmnCompiler?: new () => KmnCompilerLike;
  };
  if (typeof mod.KmnCompiler !== "function") {
    throw new CompilerLoadError(
      "@keymanapp/kmc-kmn imported but KmnCompiler export missing",
    );
  }
  return { KmnCompiler: mod.KmnCompiler };
}

/** Begin loading kmc-kmn + the WASM host. Idempotent. */
export async function init(): Promise<void> {
  if (_compiler !== null) return;
  if (_wasmDown) {
    throw new CompilerLoadError(
      `kmcmplib compiler load failed earlier: ${_wasmDownReason ?? "unknown"}`,
    );
  }
  if (_modulePromise === null) {
    _modulePromise = loadKmnCompiler().catch((err) => {
      _wasmDown = true;
      _wasmDownReason = err instanceof Error ? err.message : String(err);
      return null;
    });
  }
  const result = await _modulePromise;
  if (result === null) {
    throw new CompilerLoadError(
      `kmc-kmn load failed: ${_wasmDownReason ?? "unknown"}`,
    );
  }
  _compilerCtor = result.KmnCompiler;
}

/** Synchronous ready check. */
export function isReady(): boolean {
  return _compiler !== null;
}

/**
 * Return the kmc-kmn KmnCompiler constructor, initializing the module
 * (and its WASM dependency) on first call. Lets the validator oracle
 * share the same cached kmc-kmn module/WASM as the compiler.
 */
export async function getKmnCompilerCtor(): Promise<new () => KmnCompilerLike> {
  if (_compilerCtor !== null) return _compilerCtor;
  await init();
  if (_compilerCtor === null) {
    throw new CompilerLoadError("kmc-kmn ctor missing after init");
  }
  return _compilerCtor;
}

// ---------------------------------------------------------------------------
// VFS helpers
// ---------------------------------------------------------------------------

function entryContentAsBytes(
  fs: VirtualFS,
  path: string,
): Uint8Array | null {
  const e = fs.get(path);
  if (e === undefined) return null;
  if (typeof e.content === "string") {
    return new TextEncoder().encode(e.content);
  }
  return e.content;
}

function entryContentAsString(
  fs: VirtualFS,
  path: string,
): string | null {
  const e = fs.get(path);
  if (e === undefined) return null;
  if (typeof e.content === "string") return e.content;
  return new TextDecoder().decode(e.content);
}

function blobUrl(bytes: Uint8Array): string {
  if (
    typeof URL !== "undefined" &&
    typeof (URL as unknown as { createObjectURL?: unknown }).createObjectURL ===
      "function"
  ) {
    return URL.createObjectURL(new Blob([new Uint8Array(bytes)]));
  }
  const b64 =
    typeof Buffer !== "undefined" ? Buffer.from(bytes).toString("base64") : "";
  return `data:application/octet-stream;base64,${b64}`;
}

/**
 * Candidate VFS paths to probe when kmcmplib asks for a file by name.
 * The kmcmplib glue passes filenames in various shapes (with/without
 * the `source/` prefix, sometimes absolute-looking) — try each variant
 * so the lookup succeeds regardless of which form the WASM emits.
 */
function vfsPathCandidates(filename: string): string[] {
  const basename = filename.split(/[\\/]/).pop() ?? filename;
  return [
    filename,
    `source/${filename}`,
    filename.replace(/^source[\\/]/, ""),
    basename,
    `source/${basename}`,
  ];
}

function unavailableResult(
  isWarmCompile: boolean,
  compileMs: number,
  reason: string,
): CompileResult {
  const diag: CompilerDiagnostic = {
    code: "KM_WARN_ORACLE_UNAVAILABLE",
    severity: "warning",
    layer: "A",
    message: `WASM compiler unavailable: ${reason}`,
    hint: "Reload the studio; check the browser console for load errors.",
  };
  return {
    success: false,
    artifacts: [],
    diagnostics: [diag],
    compileMs,
    isWarmCompile,
  };
}

// Note: shared path-utility callbacks live in ./pathUtils.ts (also used by
// the validator oracle's WASM loader).

// ---------------------------------------------------------------------------
// compile()
// ---------------------------------------------------------------------------

/**
 * Compile the keyboard at `source/<keyboardId>.kmn` in the given VirtualFS
 * via the kmc-kmn pipeline. Produces .kmx (desktop binary), optional .kvk
 * (visual keyboard), and .js (KeymanWeb) artifacts as blob URLs.
 *
 * The kmc-kmn JS pipeline orchestrates two kmcmp_compile passes
 * (target=0 then target=1) and runs the WriteCompiledKeyboard step to
 * emit the KMW .js — we don't reimplement that.
 */
export async function compile(
  fs: VirtualFS,
  keyboardId: string,
): Promise<CompileResult> {
  const t0 = Date.now();
  const wasReady = _compiler !== null;

  const kmnPath = `source/${keyboardId}.kmn`;
  const kmnSourcePresent = entryContentAsString(fs, kmnPath);
  if (kmnSourcePresent === null) {
    throw new Error(
      `compile(): required file "${kmnPath}" not found in VirtualFS.`,
    );
  }

  // Apply .kpj flags if present (caller may also pass via options later).
  const kpjPath = `${keyboardId}.kpj`;
  const kpjText = entryContentAsString(fs, kpjPath);
  const options: Required<CompilerOptions> =
    kpjText !== null
      ? parseKpjFlags(kpjText)
      : { compilerWarningsAsErrors: false, warnDeprecatedCode: true };

  // Lazy init.
  try {
    await init();
  } catch (err) {
    return unavailableResult(
      wasReady,
      Date.now() - t0,
      err instanceof Error ? err.message : String(err),
    );
  }
  if (_compilerCtor === null) {
    return unavailableResult(wasReady, Date.now() - t0, "compiler ctor missing");
  }

  // Diagnostics collected by the reportMessage callback.
  const diagnostics: CompilerDiagnostic[] = [];

  // Build the kmc-kmn callback surface bridging to VFS.
  const callbacks = {
    reportMessage(message: Record<string, unknown>): void {
      console.info("[kmcmplib] reportMessage:", message);
      // kmc-kmn message shape (per kmn-compiler-messages.js): the
      // factories return { code, message, ... } where `message` is the
      // human-readable text. Older / lower-level shapes use `text` or
      // even just the raw code. Try them in order.
      const text =
        (typeof message.message === "string" && message.message) ||
        (typeof message.text === "string" && message.text) ||
        (typeof message.description === "string" && message.description) ||
        `(no message; raw=${JSON.stringify(message).slice(0, 200)})`;
      const severityRaw = String(message.severity ?? "warning").toLowerCase();
      const severity: LintSeverity = (
        ["fatal", "error", "warning", "hint", "info"] as const
      ).includes(severityRaw as LintSeverity)
        ? (severityRaw as LintSeverity)
        : "warning";
      const codeSuffix = String(message.code ?? message.errorCode ?? "UNKNOWN")
        .replace(/[^A-Z0-9_]/gi, "_")
        .toUpperCase();
      const code = `KM_${severity.toUpperCase()}_KMCMP_${codeSuffix}` as LintFinding["code"];
      const lineNumberRaw = message.lineNumber;
      const filenameRaw = message.filename;
      diagnostics.push({
        code,
        severity,
        layer: "A",
        message: text,
        ...(typeof lineNumberRaw === "number"
          ? {
              location: {
                file: typeof filenameRaw === "string" ? filenameRaw : kmnPath,
                line: lineNumberRaw,
              },
            }
          : {}),
      });
    },
    loadFile(filename: string): Uint8Array | null {
      for (const c of vfsPathCandidates(filename)) {
        const bytes = entryContentAsBytes(fs, c);
        if (bytes !== null) return bytes;
      }
      return null;
    },
    resolveFilename(baseFilename: string, filename: string): string {
      // If filename is absolute-ish or already includes a slash, return as-is.
      if (/^[/\\]/.test(filename) || /[/\\]/.test(filename)) return filename;
      // Otherwise resolve relative to baseFilename's directory.
      const base = pathUtils.dirname(baseFilename ?? "");
      return base === "" ? filename : `${base}/${filename}`;
    },
    fs: {
      // VFS-backed pieces of Node's fs API that kmc-kmn touches. We only
      // need existsSync (for the touch-layout file presence check) and
      // writeFileSync (a no-op — artifacts come back via .run()'s
      // return value).
      existsSync(filename: string): boolean {
        for (const c of vfsPathCandidates(filename)) {
          if (fs.get(c) !== undefined) return true;
        }
        return false;
      },
      writeFileSync(_filename: string, _data: Uint8Array): void {
        /* artifacts collected from KmnCompiler.run() return value */
      },
    },
    path: pathUtils,
  };

  // Construct a fresh compiler per call so the per-VFS callbacks are
  // wired correctly. kmc-kmn caches the WASM module at module scope, so
  // subsequent init() calls don't re-fetch the WASM — only the JS-side
  // state is fresh.
  // Use a LOCAL compiler instance for this call's init()/run(). Assigning the
  // module-scoped `_compiler` here and reading it back across the awaits below
  // lets a second, concurrent compile() (or the validator oracle, which shares
  // this module cache) clobber the reference mid-flight — the first call would
  // then run() against the wrong instance and emit zero artifacts. Keeping the
  // instance local makes concurrent compiles independent.
  const activeCompiler = new _compilerCtor();
  const ok = await activeCompiler.init(callbacks, {
    compilerWarningsAsErrors: options.compilerWarningsAsErrors,
    warnDeprecatedCode: options.warnDeprecatedCode,
  });
  if (!ok) {
    // Surface ANY diagnostics that kmc-kmn reported during init (e.g.
    // Fatal_MissingWasmModule) so the chain of cause is visible. If
    // none were reported, fall back to a bare "init returned false".
    if (diagnostics.length === 0) {
      diagnostics.push({
        code: "KM_WARN_ORACLE_UNAVAILABLE",
        severity: "warning",
        layer: "A",
        message: "KmnCompiler.init returned false (no further diagnostics)",
      });
    }
    return {
      success: false,
      artifacts: [],
      diagnostics,
      compileMs: Date.now() - t0,
      isWarmCompile: wasReady,
    };
  }

  // Mark the module warm for isReady()/warm-compile reporting. This is only a
  // readiness signal — the active run below always uses the local instance, so
  // a later concurrent compile reassigning _compiler cannot affect this run.
  _compiler = activeCompiler;

  // Run the compile.
  let raw: KmnCompilerResult | null;
  try {
    raw = await activeCompiler.run(kmnPath, `${keyboardId}.kmx`);
  } catch (err) {
    diagnostics.push({
      code: "KM_FATAL_KMCMP_THROWN",
      severity: "fatal",
      layer: "A",
      message: `KmnCompiler.run threw: ${err instanceof Error ? err.message : String(err)}`,
    });
    return {
      success: false,
      artifacts: [],
      diagnostics,
      compileMs: Date.now() - t0,
      isWarmCompile: wasReady,
    };
  }

  if (raw === null) {
    // KmnCompiler.run returned null — compile failed; diagnostics tell why.
    return {
      success: false,
      artifacts: [],
      diagnostics,
      compileMs: Date.now() - t0,
      isWarmCompile: wasReady,
    };
  }

  // Marshal artifacts to blob URLs. Raw bytes are preserved in the optional
  // `data` field so the headless simulator can decode the .js without a
  // round-trip through a blob URL (see CompileArtifact.data JSDoc).
  const artifacts: CompileArtifact[] = [];
  if (raw.artifacts?.kmx) {
    artifacts.push({
      filename: raw.artifacts.kmx.filename,
      url: blobUrl(raw.artifacts.kmx.data),
      sizeBytes: raw.artifacts.kmx.data.byteLength,
      data: new Uint8Array(raw.artifacts.kmx.data),
    });
  }
  if (raw.artifacts?.kvk) {
    artifacts.push({
      filename: raw.artifacts.kvk.filename,
      url: blobUrl(raw.artifacts.kvk.data),
      sizeBytes: raw.artifacts.kvk.data.byteLength,
      data: new Uint8Array(raw.artifacts.kvk.data),
    });
  }
  if (raw.artifacts?.js) {
    artifacts.push({
      filename: raw.artifacts.js.filename,
      url: blobUrl(raw.artifacts.js.data),
      sizeBytes: raw.artifacts.js.data.byteLength,
      data: new Uint8Array(raw.artifacts.js.data),
    });
  }

  console.info(
    `[kmcmplib] artifacts: ${artifacts.map((a) => `${a.filename}(${a.sizeBytes})`).join(", ")}`,
  );
  console.info(`[kmcmplib] diagnostics: ${diagnostics.length}`, diagnostics);

  const hasFatal = diagnostics.some(
    (d) => d.severity === "fatal" || d.severity === "error",
  );
  return {
    success: artifacts.length > 0 && !hasFatal,
    artifacts,
    diagnostics,
    compileMs: Date.now() - t0,
    isWarmCompile: wasReady,
  };
}

export const compilerService: CompilerService = {
  init,
  isReady,
  compile,
};

export { stripDanglingAssetStores } from "./stripDanglingAssetStores.js";
