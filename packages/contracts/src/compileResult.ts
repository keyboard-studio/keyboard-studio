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

export interface CompileResult {
  success: boolean;
  artifacts: CompileArtifact[];
  diagnostics: LintFinding[];
  /** Wall-clock warm-recompile time in ms. Target: 100-300 ms (spec section 4). */
  warmCompileMs: number;
}
