/**
 * Combining-mark-repertoire classifier (spec 043 US2, T030) — character-content
 * archetype.
 *
 * The set of Unicode combining marks (\p{M}) the base can INPUT — derived from
 * the produced-character set. A `keyboard.*` facet (no session mirror): it
 * describes the base's raw capability, not a session-transformable posture
 * (FR-021, data-model).
 *
 * GUARD (research Decision 7): combining marks are the alphabetic-script
 * mechanism for stacking diacritics. On an abugida/abjad/syllabary/logographic
 * script, "the set of inputtable combining marks" is not the right question — a
 * Devanagari base's matras are not free-standing combining diacritics in the same
 * sense — so the facet records `not-applicable` there (never a forced empty set),
 * exactly as `normalization-posture` guards on script family.
 *
 * The guard consumes the durable `keyboard.script-family` facet (FR-032) via
 * `deriveScriptFamily`: applicable iff the family is `alphabet`, else
 * `not-applicable`. US2 shipped this guard with an inline alphabetic-script list;
 * US3 (task T061) repointed it here so the ISO-15924 → family taxonomy lives in
 * one pinned table (`data/iso15924-script-family.json`).
 */

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { buildProducedSet } from "@keyboard-studio/contracts";

import { notApplicableMeasurement, undeterminedFallback } from "./measurement.js";
import { deriveScriptFamily } from "./script-family-classifier.js";
import { computeAnalyzedCoverage } from "./outcome.js";
import type { Categorization, FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

const COMBINING_MARK = /\p{M}/u;

/** The sorted set of Unicode combining marks in the base's produced set. */
function combiningMarksOf(ir: KeyboardIR): string[] {
  const marks = new Set<string>();
  for (const ch of buildProducedSet(ir)) {
    if (COMBINING_MARK.test(ch)) marks.add(ch);
  }
  return [...marks].sort();
}

/**
 * Content-derived combining-mark repertoire. Returns `not-applicable` for
 * non-alphabetic scripts (the script-family guard), the sorted mark set for
 * alphabetic ones, and null only when the dominant script family is undetermined
 * (no concretely-scripted output / unmapped script) so the caller falls through
 * to the undetermined fallback. Never throws.
 */
export function classifyCombiningMarkRepertoire(ir: KeyboardIR, def: FacetDefinition): Categorization | null {
  const family = deriveScriptFamily(ir, def);
  if (family === null) return null; // no determinable script family — fall through.

  if (family !== "alphabet") {
    return notApplicableMeasurement(
      `script family ${family} is not an alphabet; a free-standing combining-mark repertoire does not apply`,
    );
  }

  const marks = combiningMarksOf(ir);
  return {
    value: marks,
    confidence: null,
    confidenceClass: "confident",
    provenanceTier: "content-derived",
    evidenceSize: marks.length,
    analyzedCoverage: computeAnalyzedCoverage(ir),
    analysisOutcome: ir.raw.length > 0 ? "partially" : "fully",
    consistency: 1,
    notes:
      marks.length > 0
        ? `${marks.length} inputtable combining mark(s) on an alphabetic base`
        : "alphabetic base with no inputtable combining marks",
  };
}

/**
 * Fallback: no concretely-scripted output (empty/opaque-only) or `parse()` threw.
 * The repertoire is a purely content-derived measurement — no declared-metadata
 * source names combining marks — so this is an honest `undetermined`.
 */
export function combiningMarkRepertoireFallback(kb: ScannedKeyboard, def: FacetDefinition): Categorization {
  void kb;
  void def;
  return undeterminedFallback("no concretely-scripted output (empty/opaque-only or parse failure); combining-mark repertoire undetermined");
}
