// Lazy in-browser Keyman compile of an LDML export (FR-070 trial). Product code: it follows the
// `output/kmp.ts` pattern (`_modulePromise`, sticky `_down`, `ensureBufferGlobal`).
//
// `@keymanapp/kmc-ldml` is reached only through a genuine dynamic `import()`, so the bundler keeps
// it, and the developer-utils it pulls, out of the entry chunk. Every export here is async or a
// type: a synchronous value export would invite a static import of the compiler.
import { CompilerLoadError } from "@keyboard-studio/contracts";
import type { CompilerCallbacks, CompilerEvent } from "@keymanapp/developer-utils";

export interface KeymanMessage {
  /** Symbolic name such as `ERROR_SchemaValidationError`, or the formatted numeric code. */
  code: string;
  severity: "debug" | "verbose" | "info" | "hint" | "warn" | "error" | "fatal";
  text: string;
  line?: number | undefined;
}

export interface KeymanCompileResult {
  messages: KeymanMessage[];
  /** False when init, load or validate failed. */
  ok: boolean;
}

interface LdmlCompilerLike {
  init(callbacks: CompilerCallbacks, options: never): Promise<boolean>;
  load(name: string): unknown;
  validate(source: never): Promise<boolean>;
}

interface LoadedCompiler {
  Compiler: new () => LdmlCompilerLike;
  nameOf: (code: number) => string;
  severityOf: (code: number) => KeymanMessage["severity"];
  imports: Readonly<Record<string, string>>;
}

const SOURCE_NAME = "keyboard.xml";
/** A virtual directory: nothing on disk. `loadFile` maps `<prefix>/46/<name>` to the bundled text. */
const IMPORTS_PREFIX = "/ldml-imports";

const SEVERITY_NAMES: Record<number, KeymanMessage["severity"]> = {
  0: "debug",
  1048576: "verbose",
  2097152: "info",
  3145728: "hint",
  4194304: "warn",
  5242880: "error",
  6291456: "fatal",
};

let _modulePromise: Promise<LoadedCompiler | null> | null = null;
let _loaded: LoadedCompiler | null = null;
let _down = false;
let _downReason: string | null = null;

/** kmc-ldml and developer-utils assume Node's `Buffer`; installed only when absent. */
async function ensureBufferGlobal(): Promise<void> {
  const g = globalThis as { Buffer?: unknown };
  if (g.Buffer !== undefined) return;
  const { Buffer } = await import("buffer");
  g.Buffer ??= Buffer;
}

async function loadLdml(): Promise<LoadedCompiler> {
  await ensureBufferGlobal();
  // Lazy too: the bundled import files ride with the compiler chunk, not the entry chunk.
  const { LDML_IMPORT_46: imports } = await import("./ldmlImportAssets.js");
  const ldml = (await import("@keymanapp/kmc-ldml")) as unknown as {
    LdmlKeyboardCompiler?: new () => LdmlCompilerLike;
    LdmlCompilerMessages?: Record<string, unknown>;
  };
  if (typeof ldml.LdmlKeyboardCompiler !== "function") {
    throw new CompilerLoadError("@keymanapp/kmc-ldml imported but LdmlKeyboardCompiler export missing");
  }
  const utils = (await import("@keymanapp/developer-utils")) as unknown as {
    CompilerError: { formatCode(code: number): string; severity(code: number): number };
    DeveloperUtilsMessages: Record<string, unknown>;
  };
  let codeNames: Map<number, string> | undefined;
  const nameOf = (code: number): string => {
    if (codeNames === undefined) {
      codeNames = new Map();
      for (const table of [ldml.LdmlCompilerMessages ?? {}, utils.DeveloperUtilsMessages]) {
        for (const [key, value] of Object.entries(table)) {
          if (typeof value === "number" && /^(FATAL|ERROR|WARN|HINT|INFO)_/.test(key)) codeNames.set(value, key);
        }
      }
    }
    return codeNames.get(code) ?? utils.CompilerError.formatCode(code);
  };
  const severityOf = (code: number): KeymanMessage["severity"] =>
    SEVERITY_NAMES[utils.CompilerError.severity(code)] ?? "error";
  return { Compiler: ldml.LdmlKeyboardCompiler, nameOf, severityOf, imports };
}

/** Begin loading kmc-ldml. Idempotent; sticky on failure. */
export async function initLdmlCompiler(): Promise<void> {
  if (_loaded !== null) return;
  if (_down) {
    throw new CompilerLoadError(`kmc-ldml load failed earlier: ${_downReason ?? "unknown"}`);
  }
  _modulePromise ??= loadLdml().catch((err: unknown) => {
    // Sticky, mirroring `initKmpCompiler`: a chunk-load failure must not retry-storm.
    _down = true;
    _downReason = err instanceof Error ? err.message : String(err);
    return null;
  });
  const result = await _modulePromise;
  if (result === null) throw new CompilerLoadError(`kmc-ldml load failed: ${_downReason ?? "unknown"}`);
  _loaded = result;
}

/** Joins like a POSIX path so `/ldml-imports/46/keys-Latn-implied.xml` resolves under the prefix. */
function joinPaths(base: string, name: string): string {
  if (/^([/\\]|[A-Za-z]:)/.test(name)) return name;
  return `${base.replace(/[/\\]+$/, "")}/${name}`;
}

/**
 * Compile an LDML keyboard document with the pinned kmc-ldml: init, load (which schema-checks),
 * validate. Message codes use the same names as the CI harness (`__testing__/keymanCompile.ts`).
 */
export async function compileLdmlInBrowser(xml: string): Promise<KeymanCompileResult> {
  await initLdmlCompiler();
  const { Compiler, nameOf, severityOf, imports } = _loaded as LoadedCompiler;
  const messages: KeymanMessage[] = [];
  const encoder = new TextEncoder();
  const encoded = encoder.encode(xml);

  const pathApi = {
    dirname: (n: string) => n.replace(/[/\\][^/\\]*$/, ""),
    extname: (n: string) => /\.[^./\\]*$/.exec(n)?.[0] ?? "",
    basename: (n: string, ext?: string) => {
      const b = n.replace(/^.*[/\\]/, "");
      return ext !== undefined && b.endsWith(ext) ? b.slice(0, -ext.length) : b;
    },
    join: (...parts: string[]) => parts.join("/"),
    normalize: (n: string) => n,
    isAbsolute: (n: string) => /^([/\\]|[A-Za-z]:)/.test(n),
    relative: (_from: string, to: string) => to,
    resolve: (...parts: string[]) => parts.join("/"),
  };

  const loadFile = (filename: string): Uint8Array | undefined => {
    if (filename === SOURCE_NAME) return encoded;
    const normalized = filename.replace(/\\/g, "/");
    const dir = `${IMPORTS_PREFIX}/46/`;
    if (normalized.startsWith(dir)) {
      const text = imports[normalized.slice(dir.length)];
      return text === undefined ? undefined : encoder.encode(text);
    }
    return undefined;
  };

  const callbacks = {
    loadFile,
    fileSize: (f: string) => loadFile(f)?.length,
    isDirectory: () => false,
    path: pathApi,
    fs: {
      existsSync: (f: string) => loadFile(f) !== undefined,
      readFileSync: (f: string) => loadFile(f),
      readdirSync: () => [],
      writeFileSync: () => undefined,
    },
    fsAsync: {},
    net: {},
    resolveFilename: joinPaths,
    reportMessage: (event: CompilerEvent) => {
      messages.push({ code: nameOf(event.code), severity: severityOf(event.code), text: event.message, line: event.line });
    },
    debug: () => undefined,
    fileURLToPath: (u: string | URL) => String(u),
  } as unknown as CompilerCallbacks;

  const compiler = new Compiler();
  const initOk = await compiler.init(callbacks, {
    readerOptions: { cldrImportsPath: IMPORTS_PREFIX, localImportsPaths: [] },
  } as never);
  if (!initOk) return { messages, ok: false };
  const source = compiler.load(SOURCE_NAME);
  if (source === null) return { messages, ok: false };
  const valid = await compiler.validate(source as never);
  return { messages, ok: valid };
}
