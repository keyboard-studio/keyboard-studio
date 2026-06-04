// see spec.md section 4 / section 8 step 11 - compiler service (kmcmplib WASM)

import type { LintFinding } from "./lintFinding";

export interface CompileArtifact {
  /** e.g. "tyv.kmx", "tyv.kvk", "tyv.js". */
  filename: string;
  /**
   * URL the consumer can fetch / present for download.
   * - In browser contexts: a `blob:` URL produced by `URL.createObjectURL()`.
   * - In Node contexts (compiler service tests, CI, headless runs): a `file://`
   *   URI, a `data:` URI, or a relative path the caller can resolve.
   * The compiler-service implementation chooses the form per environment; the
   * field is opaque to consumers — they just pass it to the download / preview
   * site or pipe its bytes downstream.
   */
  url: string;
  sizeBytes: number;
}

/**
 * Diagnostic produced by the WASM compile pass. Narrowed to Layer A only —
 * the kmcmplib WASM oracle runs the 5 deep checks listed in spec §10
 * (CAPS/NCAPS consistency, unreachable rules, `platform()` parsing,
 * `context(N)` offset, named code constants). Layer B style findings come
 * from `ValidatorService.validate()`; Layer C hygiene findings come from
 * `LintEngineService.lint()` at phase-exit. They MUST NOT appear here.
 *
 * @see spec.md §10
 * @see #93 (this narrowing decision)
 */
export type CompilerDiagnostic = LintFinding & { layer: "A" };

/**
 * Result of one `kmcmplib` WASM compile pass.
 *
 * **`success` ↔ `artifacts` relationship (#94):**
 *   - `success: true` → `artifacts` always non-empty (`.kmx`, `.kvk`,
 *     and — when a touch layout exists — `.js`). May still contain
 *     `warning` / `hint` / `info` diagnostics.
 *   - `success: false` + `artifacts` non-empty → recoverable errors;
 *     kmcmplib stripped the offending rules and emitted partial artifacts.
 *     The live-preview pane MAY load them for best-effort rendering.
 *   - `success: false` + `artifacts` empty → parse-fatal (unterminated
 *     string, syntax error before group declaration, etc.). Nothing
 *     usable; the preview MUST hide.
 *
 * **`compileMs` semantics (#92):** wall-clock for THIS compile call,
 * including any first-call WASM-load overhead. Filter on `isWarmCompile`
 * before applying the 100-300 ms target from spec §4.
 *
 * @see spec.md §4 (compiler service)
 * @see spec.md §8 step 11
 */
export interface CompileResult {
  /** True when no `error`/`fatal` diagnostics were produced. See JSDoc. */
  success: boolean;
  /** Compiled artifacts. May be empty on parse-fatal compiles. */
  artifacts: CompileArtifact[];
  /** WASM-oracle Layer A diagnostics only. See {@link CompilerDiagnostic}. */
  diagnostics: CompilerDiagnostic[];
  /**
   * Wall-clock time for this compile call in ms. INCLUDES WASM-load cost
   * on the first call (typically 1000-3000 ms over network). Filter on
   * `isWarmCompile === true` before applying the 100-300 ms target from
   * spec §4 to telemetry / perf dashboards.
   */
  compileMs: number;
  /**
   * True when the WASM binary was already instantiated before this call
   * (so `compileMs` reflects just the per-keyboard compile cost). False
   * on the very first call after page load / service init.
   */
  isWarmCompile: boolean;
}

/**
 * Input shape for {@link makeCompileResult}. Mirrors {@link CompileResult}
 * exactly today (all fields required). The factory exists for symmetry with
 * {@link makePattern} / {@link makeBaseKeyboard} and as a forward-compatible
 * anchor when optional fields land.
 */
export type CompileResultInit = {
  success: boolean;
  artifacts: CompileArtifact[];
  diagnostics: CompilerDiagnostic[];
  compileMs: number;
  isWarmCompile: boolean;
};

/**
 * Construct a {@link CompileResult} from a {@link CompileResultInit}.
 *
 * @see spec.md §4 (compiler service)
 */
export function makeCompileResult(init: CompileResultInit): CompileResult {
  return {
    success: init.success,
    artifacts: init.artifacts,
    diagnostics: init.diagnostics,
    compileMs: init.compileMs,
    isWarmCompile: init.isWarmCompile,
  };
}
