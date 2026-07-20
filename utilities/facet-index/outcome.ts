/**
 * Analysis-outcome + coverage mapping (spec 036 T016; FR-010). Reused by every
 * classifier so "how much of the keyboard did the analysis actually see" is
 * computed one way, not forked per facet.
 */

import type { ImportStatus } from "@keyboard-studio/contracts";
import { ImportStatus as IS } from "@keyboard-studio/contracts";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import type { AnalysisOutcome } from "./types.js";

/**
 * Map the codec's `ImportStatus` to this facet index's `AnalysisOutcome`
 * (research D5): Clean -> fully, CleanWithOpaque -> partially, ParseFailure ->
 * fallback-only. `RoundTripDivergence` is not reachable through this tool (it
 * only calls `parse()`, never the WASM round-trip oracle) but the enum has
 * four members, so it is mapped defensively to `partially` (an IR did exist
 * and was analyzed; the divergence is a Layer A' compile-fidelity concern,
 * not a coverage one) rather than left unhandled.
 */
export function mapImportStatus(status: ImportStatus): AnalysisOutcome {
  switch (status) {
    case IS.Clean:
      return "fully";
    case IS.CleanWithOpaque:
      return "partially";
    case IS.ParseFailure:
      return "fallback-only";
    case IS.RoundTripDivergence:
      return "partially";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/**
 * Fraction of the IR's rule/store nodes that are concretely analyzable
 * (`1 - opaque share`), clamped to [0,1]. "Nodes" = stores + rules (across all
 * groups) + raw (opaque) fragments — the same population `ir.raw` is drawn
 * from. An IR with no nodes at all (empty keyboard) counts as fully covered
 * (vacuously — there is nothing opaque to have missed).
 */
export function computeAnalyzedCoverage(ir: KeyboardIR): number {
  const ruleCount = ir.groups.reduce((sum, g) => sum + g.rules.length, 0);
  const totalNodes = ir.stores.length + ruleCount + ir.raw.length;
  if (totalNodes === 0) return 1;
  const opaqueShare = ir.raw.length / totalNodes;
  return Math.min(1, Math.max(0, 1 - opaqueShare));
}
