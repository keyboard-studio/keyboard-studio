/**
 * Combining-mark-repertoire classifier (spec 043 US2, T030) — character-content
 * archetype.
 *
 * The set of Unicode combining marks (\p{M}) the base can INPUT — derived from
 * the produced-character set. A `keyboard.*` facet (no session mirror): it
 * describes the base's raw capability, not a session-transformable posture
 * (FR-021, data-model).
 *
 * GUARD (km-domain review): the facet measures the inputtable
 * Unicode `\p{M}` combining-mark set, which is genuinely meaningful wherever a
 * script uses combining marks — alphabet accents, abjad vowel-pointing (Arabic
 * harakat, Hebrew niqqud, Syriac pointing), and abugida vowel signs/virama/tone
 * marks are ALL `\p{M}` and inputtable. It is genuinely `not-applicable` only for
 * SYLLABARY and LOGOGRAPHIC scripts, whose glyphs encode whole syllables/morphemes
 * with no combining-mark layer. So the guard excludes only those two families;
 * every other base reports its (possibly empty) `\p{M}` set — an empty set on an
 * alphabet/abjad/abugida is an honest "no combining marks inputtable", never a
 * forced not-applicable.
 *
 * (Earlier this guard excluded every non-alphabet family; that discarded the real
 * harakat/niqqud/matra signal for the large Arabic/Hebrew/Indic slice of the
 * corpus, contradicting the facet's own `\p{M}` contract — narrowed here.)
 *
 * The guard consumes the durable `keyboard.script-family` facet (FR-032) via
 * `deriveScriptFamily`. US2 shipped it with an inline alphabetic-script list; US3
 * (task T061) repointed it at the pinned `data/iso15924-script-family.json`.
 */

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { buildProducedSet } from "@keyboard-studio/contracts";

import { notApplicableMeasurement, undeterminedFallback } from "./measurement.js";
import { deriveScriptFamily } from "./script-family-classifier.js";
import { computeAnalyzedCoverage } from "./outcome.js";
import type { Categorization, FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

const COMBINING_MARK = /\p{M}/u;

/**
 * The script families for which a combining-mark repertoire does not apply: their
 * glyphs encode whole syllables/morphemes, with no combining-mark layer to
 * enumerate. Every other family (alphabet/abjad/abugida) reports its `\p{M}` set.
 */
const NOT_APPLICABLE_FAMILIES = new Set(["syllabary", "logographic"]);

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
 * syllabary/logographic scripts (the script-family guard), the sorted `\p{M}` set
 * for every other family (alphabet/abjad/abugida — possibly empty), and null only
 * when the dominant script family is undetermined (no concretely-scripted output /
 * unmapped script) so the caller falls through to the undetermined fallback.
 * Never throws.
 */
export function classifyCombiningMarkRepertoire(ir: KeyboardIR, def: FacetDefinition): Categorization | null {
  const family = deriveScriptFamily(ir, def);
  if (family === null) return null; // no determinable script family — fall through.

  if (NOT_APPLICABLE_FAMILIES.has(family)) {
    return notApplicableMeasurement(
      `script family ${family} composes whole syllables/morphemes; a combining-mark repertoire does not apply`,
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
        ? `${marks.length} inputtable combining mark(s) on a ${family} base`
        : `${family} base with no inputtable combining marks`,
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
