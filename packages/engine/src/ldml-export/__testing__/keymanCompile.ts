// Test-only harnesses H1/H2: compiles an LDML keyboard document with the pinned kmc-ldml
// using in-memory callbacks. Never import this from product code.
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { CompilerError, DeveloperUtilsMessages } from "@keymanapp/developer-utils";
import type { CompilerCallbacks, CompilerEvent } from "@keymanapp/developer-utils";
import { LdmlCompilerMessages, LdmlKeyboardCompiler } from "@keymanapp/kmc-ldml";

export type { KeymanMessage } from "../compile/loadLdmlCompiler.js";
import type { KeymanMessage } from "../compile/loadLdmlCompiler.js";

export interface KeymanCompileResult {
  messages: KeymanMessage[];
  /** False when init, load or validate (or run, when `build`) failed. */
  ok: boolean;
  kmx?: Uint8Array | undefined;
  kvk?: Uint8Array | undefined;
}

const SOURCE_NAME = "keyboard.xml";

/** Directory holding `46/keys-*.xml` and `46/scanCodes-implied.xml`, found via the package. */
function cldrImportsDir(): string {
  const entry = createRequire(import.meta.url).resolve("@keymanapp/developer-utils");
  return join(dirname(entry), "types", "import");
}

const SEVERITY_NAMES: Record<number, KeymanMessage["severity"]> = {
  0: "debug",
  1048576: "verbose",
  2097152: "info",
  3145728: "hint",
  4194304: "warn",
  5242880: "error",
  6291456: "fatal",
};

let codeNames: Map<number, string> | undefined;

function nameOf(code: number): string {
  if (codeNames === undefined) {
    codeNames = new Map();
    for (const table of [LdmlCompilerMessages, DeveloperUtilsMessages] as unknown as Record<
      string,
      unknown
    >[]) {
      for (const [key, value] of Object.entries(table)) {
        if (typeof value === "number" && /^(FATAL|ERROR|WARN|HINT|INFO)_/.test(key)) {
          codeNames.set(value, key);
        }
      }
    }
  }
  return codeNames.get(code) ?? CompilerError.formatCode(code);
}

function toMessage(e: CompilerEvent): KeymanMessage {
  return {
    code: nameOf(e.code),
    severity: SEVERITY_NAMES[CompilerError.severity(e.code)] ?? "error",
    text: e.message,
    line: e.line,
  };
}

/** Joins like a POSIX path so `46/keys-Latn-implied.xml` resolves under the imports dir. */
function joinPaths(base: string, name: string): string {
  if (/^([/\\]|[A-Za-z]:)/.test(name)) return name;
  return `${base.replace(/[/\\]+$/, "")}/${name}`;
}

export async function keymanCompile(
  xml: string,
  options: { build?: boolean } = {},
): Promise<KeymanCompileResult> {
  const messages: KeymanMessage[] = [];
  const importsDir = cldrImportsDir().replace(/\\/g, "/");
  const encoded = new TextEncoder().encode(xml);

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
    if (normalized.startsWith(`${importsDir}/`) && existsSync(normalized)) {
      return new Uint8Array(readFileSync(normalized));
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
      messages.push(toMessage(event));
    },
    debug: () => undefined,
    fileURLToPath: (u: string | URL) => String(u),
  } as unknown as CompilerCallbacks;

  const compiler = new LdmlKeyboardCompiler();
  const initOk = await compiler.init(callbacks, {
    readerOptions: { cldrImportsPath: importsDir, localImportsPaths: [] },
  } as never);
  if (!initOk) return { messages, ok: false };

  const source = compiler.load(SOURCE_NAME);
  if (source === null) return { messages, ok: false };
  const valid = await compiler.validate(source);
  if (!valid || !options.build) return { messages, ok: valid };

  const result = await compiler.run(SOURCE_NAME);
  if (result === null || result === undefined) return { messages, ok: false };
  return {
    messages,
    ok: true,
    kmx: result.artifacts.kmx?.data,
    kvk: result.artifacts.kvk?.data,
  };
}

/** Names of the messages at error severity or worse, sorted and de-duplicated (H1). */
export function errorCodes(messages: readonly KeymanMessage[]): string[] {
  return [...new Set(messages.filter((m) => m.severity === "error" || m.severity === "fatal").map((m) => m.code))].sort();
}
