/**
 * Directionality classifier (spec 043 US3, T049) — character-content archetype.
 *
 * The writing direction of the base's produced characters: {ltr, rtl, bidi-aware}
 * (FR-031). Derived from the scripts the produced-character set attests: an RTL
 * script (Arabic, Hebrew, Syriac, Thaana, N'Ko, …) → `rtl`; a mix of RTL and LTR
 * scripts → `bidi-aware`; otherwise `ltr`. A `keyboard.*` facet (no session
 * mirror).
 *
 * Neutral characters (Common/Inherited — digits, punctuation, combining marks)
 * carry no direction and are ignored, so a base that only produces neutrals with
 * no concrete script falls through to the undetermined fallback rather than
 * defaulting to `ltr`.
 */

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { buildProducedSet } from "@keyboard-studio/contracts";

import { scriptOf } from "./ucd/generated/scriptLookup.js";
import { undeterminedFallback } from "./measurement.js";
import { computeAnalyzedCoverage } from "./outcome.js";
import type { Categorization, FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

/** ISO-15924 codes for right-to-left scripts (the established RTL set). */
const RTL_SCRIPTS = new Set([
  "Arab", "Hebr", "Syrc", "Thaa", "Nkoo", "Samr", "Mand", "Mend", "Adlm",
  "Rohg", "Yezi", "Sogd", "Sogo", "Phnx", "Phli", "Phlp", "Prti", "Narb",
  "Sarb", "Armi", "Palm", "Hatr", "Elym", "Chrs", "Ougr", "Nbat",
  "Mani", "Lydi", "Hung",
]);
/** Neutral pseudo-scripts that carry no direction evidence. */
const NEUTRAL_SCRIPTS = new Set(["Zyyy", "Zinh", "Zzzz", "Zxxx"]);

/**
 * Content-derived directionality, or null when the produced set attests no
 * concrete script (only neutrals) so the caller falls through to the fallback.
 * Never throws.
 */
export function classifyDirectionality(ir: KeyboardIR, def: FacetDefinition): Categorization | null {
  void def;

  let hasRtl = false;
  let hasLtr = false;
  for (const ch of buildProducedSet(ir)) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    const script = scriptOf(cp);
    if (NEUTRAL_SCRIPTS.has(script)) continue;
    if (RTL_SCRIPTS.has(script)) hasRtl = true;
    else hasLtr = true;
  }

  if (!hasRtl && !hasLtr) return null; // no concrete script — fall through.

  const value = hasRtl && hasLtr ? "bidi-aware" : hasRtl ? "rtl" : "ltr";

  return {
    value,
    confidence: null,
    confidenceClass: "confident",
    provenanceTier: "content-derived",
    evidenceSize: 1,
    analyzedCoverage: computeAnalyzedCoverage(ir),
    analysisOutcome: ir.raw.length > 0 ? "partially" : "fully",
    consistency: 1,
    notes: value === "bidi-aware" ? "produces both RTL and LTR scripts" : `produces ${value === "rtl" ? "RTL" : "LTR"} script(s)`,
  };
}

/**
 * Fallback: the produced set attests no concrete script (empty/opaque-only /
 * neutral-only) or `parse()` threw. Directionality is a content-derived
 * measurement, so this is an honest `undetermined`.
 */
export function directionalityFallback(kb: ScannedKeyboard, def: FacetDefinition): Categorization {
  void kb;
  void def;
  return undeterminedFallback("no concretely-scripted output (empty/opaque-only or parse failure); directionality undetermined");
}
