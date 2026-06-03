// Acquisition seam for the kmcmplib WASM oracle.
//
// Option-A primary path (default factory): load the WASM artifact bundled
// inside `@keymanapp/kmc-kmn` from npm. Option-B escape hatch: a consumer
// passes their own loader to validateWithOracle() — they receive the same
// WasmOracleHandle interface and never see the raw kmcmplib ABI.
//
// The factory below is a stub: it throws OracleLoadError with reason
// "wasm-fetch-failed" until the kmc-kmn integration lands in a follow-up
// issue. Until then, validateWithOracle() reliably degrades to TS-only
// findings and attaches one KM_WARN_ORACLE_UNAVAILABLE supplementary
// finding per call.
//
// See spec.md §10 + the Issue #16 design (cycles 1-5).

import type { GroupName } from "./types.js";
import { OracleLoadError } from "./OracleLoadError.js";

/**
 * Minimal structured diagnostic returned by the WASM compiler. The oracle
 * translates each one into a LintFinding via codeMap.ts.
 */
export interface RawWasmFinding {
  /**
   * kmcmplib code symbol as a string (e.g. "ERROR_InvalidIf"). Numeric
   * codes from `KmnCompilerMessages` should be resolved to their symbolic
   * name on the WASM side before being returned.
   */
  kmcmpCode: string;
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

/**
 * Async factory. Production builds load kmcmplib here.
 *
 * Currently a stub — throws OracleLoadError with reason "wasm-fetch-failed".
 * validateWithOracle() catches that at lazy init and degrades gracefully.
 *
 * @throws OracleLoadError on fetch failure, instantiation failure, or ABI
 *   mismatch. Always thrown via the typed class so callers can branch on
 *   `.reason`.
 */
export async function loadWasmOracle(_options?: {
  wasmUrl?: string;
}): Promise<WasmOracleHandle> {
  throw new OracleLoadError(
    "kmcmplib WASM oracle is not yet wired. Returning TS-only findings.",
    "wasm-fetch-failed"
  );
}
