// see spec.md section 4 / section 8 step 11 - compiler service (kmcmplib WASM)

import type { LintFinding } from "./lintFinding";

export interface CompileArtifact {
  /** e.g. "tyv.kmx", "tyv.kvk", "tyv.js". */
  filename: string;
  blobUrl: string;
  sizeBytes: number;
}

export interface CompileResult {
  success: boolean;
  artifacts: CompileArtifact[];
  diagnostics: LintFinding[];
  /** Wall-clock warm-recompile time in ms. Target: 100-300 ms (spec section 4). */
  warmCompileMs: number;
}
