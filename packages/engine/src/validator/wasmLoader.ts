// Acquisition seam for the kmcmplib WASM oracle.
//
// Option-A primary path (default factory): reuse the kmc-kmn KmnCompiler
// constructor exposed by the compiler service (packages/engine/src/compiler).
// kmc-kmn caches the underlying WASM Module at module scope, so the
// compiler and the oracle share a single instantiation. Option-B escape
// hatch: a consumer passes their own loader to validateWithOracle() — they
// receive the same WasmOracleHandle interface and never see the raw
// kmcmplib ABI.
//
// On any failure during init/run, lintWasmGroups returns whatever
// diagnostics were collected before the failure (often empty). The
// validator oracle layer (oracle.ts) treats a thrown OracleLoadError as a
// permanent degrade-to-TS-only signal; mid-call run failures simply
// surface fewer findings without bringing the oracle down.
//
// See spec.md §10 + the Issue #16 design (cycles 1-5) + Issue #17 tail
// (shared WASM instance).

import type { GroupName } from "./types.js";
import { OracleLoadError } from "./OracleLoadError.js";
import { getKmnCompilerCtor, type KmnCompilerLike } from "../compiler/index.js";
import { pathUtils } from "../compiler/pathUtils.js";
import { loadKmcMessageTables, type KmcMessageTables } from "../compiler/kmcMessages.js";
import { CompilerLoadError, type LintSeverity } from "@keyboard-studio/contracts";

/**
 * Minimal structured diagnostic returned by the WASM compiler. The oracle
 * translates each one into a LintFinding via codeMap.ts.
 */
export interface RawWasmFinding {
  /**
   * kmcmplib code symbol as a string (e.g. "ERROR_InvalidIf"). kmc-kmn
   * reports numeric codes; the production handle resolves them to their
   * symbolic name via kmc-kmn's own message tables. A code no table defines
   * stays in its decimal string form.
   */
  kmcmpCode: string;
  /**
   * Severity decoded from the numeric code's severity bits, when the handle
   * had one. Used for codes with no symbolic name (whose severity would
   * otherwise be unknowable from `kmcmpCode`).
   */
  severity?: LintSeverity;
  /** 1-based source line. */
  line: number;
  /** 1-based column when available. */
  column?: number;
  /** Message text from kmcmplib (already substituted). */
  text: string;
}

/**
 * Seam interface that the oracle depends on. Production implementations
 * wrap a real kmcmplib WASM module; tests inject a mock that implements
 * the same surface.
 */
export interface WasmOracleHandle {
  /**
   * Run kmcmplib against `source` and return raw diagnostics for the
   * requested groups. Implementations may run a full compile internally
   * and filter; callers translate via codeMap.ts.
   */
  lintWasmGroups(
    source: string,
    groups: readonly GroupName[]
  ): Promise<RawWasmFinding[]>;

  /** Release WASM memory / worker. Idempotent. */
  dispose(): void;
}

const ORACLE_SOURCE_FILE = "__oracle_source__.kmn";
const ORACLE_OUTPUT_FILE = "__oracle_out__.kmx";

class KmnCompilerOracleHandle implements WasmOracleHandle {
  constructor(
    private readonly Ctor: new () => KmnCompilerLike,
    private readonly tables: KmcMessageTables,
  ) {}

  async lintWasmGroups(
    source: string,
    _groups: readonly GroupName[]
  ): Promise<RawWasmFinding[]> {
    const findings: RawWasmFinding[] = [];
    const sourceBytes = new TextEncoder().encode(source);
    const tables = this.tables;

    const callbacks = {
      reportMessage(message: Record<string, unknown>): void {
        const text =
          (typeof message.message === "string" && message.message) ||
          (typeof message.text === "string" && message.text) ||
          (typeof message.description === "string" && message.description) ||
          "";
        // kmc-kmn sends the NUMERIC code (severity | namespace | base);
        // codeMap.ts keys on upstream's symbolic names.
        const numeric =
          typeof message.code === "number" && Number.isInteger(message.code)
            ? message.code
            : undefined;
        const codeSym =
          (numeric !== undefined ? tables.name(numeric) : undefined) ??
          String(message.code ?? message.errorCode ?? "UNKNOWN");
        // kmc-kmn's CompilerEvent names the field `line`; `lineNumber` is the
        // raw kmcmplib callback's name, which kmc-kmn renames before
        // reporting (same mapping as compiler/index.ts).
        const lineRaw = message.line ?? message.lineNumber;
        const line = typeof lineRaw === "number" ? lineRaw : 0;
        findings.push({
          kmcmpCode: codeSym,
          ...(numeric !== undefined ? { severity: tables.severity(numeric) } : {}),
          line,
          column: 0,
          text,
        });
      },
      loadFile(filename: string): Uint8Array | null {
        const basename = filename.split(/[\\/]/).pop() ?? filename;
        if (basename === ORACLE_SOURCE_FILE) return sourceBytes;
        return null;
      },
      resolveFilename(baseFilename: string, filename: string): string {
        if (/^[/\\]/.test(filename) || /[/\\]/.test(filename)) return filename;
        const base = pathUtils.dirname(baseFilename ?? "");
        return base === "" ? filename : `${base}/${filename}`;
      },
      fs: {
        existsSync(filename: string): boolean {
          const basename = filename.split(/[\\/]/).pop() ?? filename;
          return basename === ORACLE_SOURCE_FILE;
        },
        writeFileSync(_filename: string, _data: Uint8Array): void {
          /* artifacts unused — oracle only consumes reportMessage */
        },
      },
      path: pathUtils,
    };

    const compiler = new this.Ctor();
    const ok = await compiler.init(callbacks, {});
    if (!ok) return findings;
    try {
      await compiler.run(ORACLE_SOURCE_FILE, ORACLE_OUTPUT_FILE);
    } catch {
      // Mid-run failures still surface whatever diagnostics arrived via
      // reportMessage before the throw.
    }
    return findings;
  }

  dispose(): void {
    // No per-instance state to release; the kmc-kmn module-scope cache
    // outlives any single handle.
  }
}

/**
 * Async factory. Returns a WasmOracleHandle backed by the kmc-kmn
 * KmnCompiler constructor (shared with the compiler service).
 *
 * @throws OracleLoadError when kmc-kmn cannot be loaded. The validator
 *   oracle catches this at lazy init and degrades to TS-only findings.
 */
export async function loadWasmOracle(_options?: {
  wasmUrl?: string;
}): Promise<WasmOracleHandle> {
  let Ctor: new () => KmnCompilerLike;
  let tables: KmcMessageTables;
  try {
    Ctor = await getKmnCompilerCtor();
    tables = await loadKmcMessageTables();
  } catch (err) {
    if (err instanceof CompilerLoadError) {
      throw new OracleLoadError(
        `kmcmplib WASM unavailable: ${err.message}`,
        "wasm-load-failed",
        { cause: err }
      );
    }
    throw err;
  }
  return new KmnCompilerOracleHandle(Ctor, tables);
}
