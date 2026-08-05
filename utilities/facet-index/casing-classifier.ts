/**
 * Casing classifier (spec 041 US1, T010) — script-identity driven.
 *
 * Value ∈ {cased, caseless, mixed}, derived from the keyboard's script identity
 * (the `script` facet / langtags family, reused via `deriveScriptContext`), not
 * from rule structure. This is the GATE input for `caps-handling`: a caseless
 * keyboard's caps-handling facet is not-applicable (FR-013).
 */

import type { KeyboardIR } from "@keyboard-studio/contracts";

import { deriveScriptContext, undeterminedFallback } from "./measurement.js";
import { computeAnalyzedCoverage } from "./outcome.js";
import { buildProducedSet } from "@keyboard-studio/contracts";
import type { Categorization, FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

/**
 * Content-derived casing, or `null` when the keyboard produces no characters at
 * all (empty/opaque-only) — the caller falls through to `casingFallback`.
 */
export function classifyCasing(ir: KeyboardIR, def: FacetDefinition): Categorization | null {
  // No produced characters ⇒ no script identity to read ⇒ fall through.
  let hasOutput = false;
  for (const _ of buildProducedSet(ir)) {
    void _;
    hasOutput = true;
    break;
  }
  if (!hasOutput) return null;

  const ctx = deriveScriptContext(ir, def);
  return {
    value: ctx.casing,
    confidence: null,
    confidenceClass: "confident",
    provenanceTier: "content-derived",
    evidenceSize: 1, // one keyboard-level script identity
    analyzedCoverage: computeAnalyzedCoverage(ir),
    analysisOutcome: ir.raw.length > 0 ? "partially" : "fully",
    consistency: 1, // a single keyboard-level determination
    notes: `script family ${ctx.scriptFamily ?? "undetermined"}`,
  };
}

export function casingFallback(kb: ScannedKeyboard, def: FacetDefinition): Categorization {
  void kb;
  void def;
  return undeterminedFallback("no produced characters; script casing undetermined");
}
