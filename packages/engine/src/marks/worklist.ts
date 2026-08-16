// Placement-worklist builder (spec 071 FR-020, amended by spec 052): series
// answers → the typed classification the mechanism gallery consumes.
//
// Every relevant unit lands in AT LEAST one group, with nothing unclassified
// (spec 052 SC-009, amending spec 071's SC-007 "exactly once"). Uniqueness was
// never what downstream placement needed; totality is. Dual reachability — a
// mark with its own key whose composed characters ALSO sit on dedicated keys —
// is an intended outcome of spec 052 FR-003/FR-006, so the old "classified
// twice" problem is deleted rather than suppressed.
//
//   - ownLetterUnits — every plain base letter, plus each reachable base+mark
//     combination of a `composed` mark, plus every PROMOTED composed character
//     regardless of its mark's treatment (spec 052 FR-002/FR-005);
//   - markUnits — each mark resolving to `own-key`, carrying the keyboard's
//     confirmed input order;
//   - blockedCombinations — every mark × base left unchecked at the attachment
//     station (must never be reachable by ordinary typing, FR-021).
//
// The field name `ownLetterUnits` is now a misnomen — it holds keyed units, not
// "own letters" — and is left alone deliberately: renaming it would touch the
// reducer, carve's needed-set derivation, and the mechanism gallery for no
// behavioural gain, and the worklist shape's stability is an explicit spec
// assumption (drafts load unmigrated, spec 052 FR-021/SC-010).

import type {
  ConfirmedAlphabet,
  PlacementWorklist,
} from "@keyboard-studio/contracts";
import type { MarkClass } from "./mark-classes.js";
import { treatmentFor, type MarkTreatmentAnswer } from "./treatment.js";
import type { MarkTreatmentPrefill } from "./treatment-prefill.js";

export interface WorklistInputs {
  alphabet: ConfirmedAlphabet;
  classes: MarkClass[];
  /** Per mark, per base: checked = reachable (attested or plausible-accepted). */
  attachments: Record<string, Record<string, boolean>>;
  /**
   * The recorded S2 answer (spec 052) — REPLACES `mentalModel` + `markOverrides`
   * + `inputOrder`, which could not express treatment and promotion at once.
   */
  treatment: MarkTreatmentAnswer;
  /** The class prefills the answer falls back to (FR-009: no unanswered state). */
  prefills: MarkTreatmentPrefill[];
}

/**
 * Assemble the gallery handoff. Deterministic and total: every base and every
 * mark of the confirmed alphabet is accounted for by at least one unit
 * (asserted by `verifyWorklistCoverage` below).
 */
export function buildPlacementWorklist(inputs: WorklistInputs): PlacementWorklist {
  const { alphabet, classes, attachments, treatment, prefills } = inputs;

  const ownLetterUnits: string[] = [];
  const seenUnits = new Set<string>();
  const pushUnit = (unit: string): void => {
    const nfc = unit.normalize("NFC");
    if (!seenUnits.has(nfc)) {
      seenUnits.add(nfc);
      ownLetterUnits.push(nfc);
    }
  };

  // Every plain base letter needs a key placement.
  for (const base of alphabet.bases) pushUnit(base);

  const markUnits: PlacementWorklist["markUnits"] = [];
  const blockedCombinations: PlacementWorklist["blockedCombinations"] = [];

  for (const mark of alphabet.marks) {
    const row = attachments[mark] ?? {};
    const resolved = treatmentFor(mark, treatment, classes, prefills);

    if (resolved === "own-key") {
      markUnits.push({ mark, inputOrder: treatment.inputOrder });
    } else {
      // Composed: each reachable combination is a whole unit needing a key.
      for (const base of alphabet.bases) {
        if (row[base] === true) pushUnit(base + mark);
      }
    }

    // Unchecked base × mark pairs are blocked regardless of the treatment.
    for (const base of alphabet.bases) {
      if (row[base] !== true) blockedCombinations.push({ base, mark });
    }
  }

  // Promoted composed characters earn dedicated keys REGARDLESS of their mark's
  // treatment (spec 052 FR-002/FR-003) — this is the line that makes the
  // Cameroonian tone case expressible. NFC dedup means a pair that is both
  // composed-produced and promoted yields exactly one entry.
  for (const promoted of treatment.promoted) pushUnit(promoted);

  return { ownLetterUnits, markUnits, blockedCombinations };
}

/**
 * The SC-009 coverage invariant (amending spec 071 SC-007): every base and every
 * mark of the confirmed alphabet is accounted for by AT LEAST ONE placement
 * unit, with nothing unclassified — bases as keyed units, marks either as a
 * productive mark unit or through their composed units / blocked pairs.
 *
 * There is deliberately no uniqueness check: a mark that is both a mark unit and
 * present inside a keyed unit is the intended dual-reachability outcome of spec
 * 052 FR-006, not a problem to report.
 *
 * Returns human-readable problems; empty = holds.
 */
export function verifyWorklistCoverage(
  alphabet: ConfirmedAlphabet,
  worklist: PlacementWorklist,
): string[] {
  const problems: string[] = [];
  const units = new Set(worklist.ownLetterUnits);
  for (const base of alphabet.bases) {
    if (!units.has(base.normalize("NFC"))) {
      problems.push(`base "${base}" missing from ownLetterUnits`);
    }
  }
  const markUnitSet = new Set(worklist.markUnits.map((m) => m.mark));
  for (const mark of alphabet.marks) {
    const asUnit = markUnitSet.has(mark);
    const viaComposed =
      worklist.ownLetterUnits.some((u) => u.normalize("NFD").includes(mark)) ||
      worklist.blockedCombinations.some((b) => b.mark === mark);
    if (!asUnit && !viaComposed) {
      problems.push(`mark "${mark}" unclassified (neither a mark unit nor a composed/blocked pair)`);
    }
  }
  return problems;
}
