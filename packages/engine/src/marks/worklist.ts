// Placement-worklist builder (spec 046, FR-020): series answers → the typed
// classification the mechanism gallery consumes. Every relevant unit lands in
// EXACTLY one group (SC-007):
//
//   - ownLetterUnits — every plain base letter, plus (for own-letter classes)
//     each reachable base+mark combination as a whole composed unit;
//   - markUnits — each mark of a letter-plus-mark class, with its confirmed
//     attach-before/attach-after behavior;
//   - blockedCombinations — every mark × base left unchecked at the attachment
//     station (must never be reachable by ordinary typing, FR-021).

import type {
  ConfirmedAlphabet,
  PlacementWorklist,
} from "@keyboard-studio/contracts";
import type { MarkClass } from "./mark-classes.js";
import type { MentalModelAnswer } from "./mental-model-prefill.js";

export interface WorklistInputs {
  alphabet: ConfirmedAlphabet;
  classes: MarkClass[];
  /** Per mark, per base: checked = reachable (attested or plausible-accepted). */
  attachments: Record<string, Record<string, boolean>>;
  /** Per class id: the confirmed mental model. Absent class defaults to own-letter. */
  mentalModel: Record<string, MentalModelAnswer>;
  /** Per-mark overrides split out of their class's answer (edge case: mixed). */
  markOverrides?: Record<string, MentalModelAnswer>;
  /** The confirmed input order for productive mark keys (FR-012). */
  inputOrder: "prefix" | "postfix";
}

/**
 * Assemble the gallery handoff. Deterministic and total: every base and every
 * mark of the confirmed alphabet is accounted for exactly once across the
 * classification (asserted by `verifyWorklistCoverage` below).
 */
export function buildPlacementWorklist(inputs: WorklistInputs): PlacementWorklist {
  const { alphabet, classes, attachments, mentalModel, markOverrides, inputOrder } = inputs;

  const answerFor = (mark: string): MentalModelAnswer => {
    const override = markOverrides?.[mark];
    if (override !== undefined) return override;
    const markClass = classes.find((c) => c.marks.includes(mark));
    const answer = markClass !== undefined ? mentalModel[markClass.id] : undefined;
    return answer ?? "own-letter";
  };

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
    const answer = answerFor(mark);

    if (answer === "letter-plus-mark") {
      markUnits.push({ mark, inputOrder });
    } else {
      // Own-letter: each reachable combination is a whole unit needing a key.
      for (const base of alphabet.bases) {
        if (row[base] === true) pushUnit(base + mark);
      }
    }

    // Unchecked base × mark pairs are blocked regardless of the mental model.
    for (const base of alphabet.bases) {
      if (row[base] !== true) blockedCombinations.push({ base, mark });
    }
  }

  return { ownLetterUnits, markUnits, blockedCombinations };
}

/**
 * SC-007 invariant: every base and every mark of the confirmed alphabet is
 * accounted for exactly once — bases as own-letter units, marks either as a
 * productive mark unit or through their class's own-letter units/blocks.
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
    const viaOwnLetter =
      worklist.ownLetterUnits.some((u) => u.normalize("NFD").includes(mark)) ||
      worklist.blockedCombinations.some((b) => b.mark === mark);
    if (!asUnit && !viaOwnLetter) {
      problems.push(`mark "${mark}" unclassified (neither a mark unit nor an own-letter/blocked pair)`);
    }
    if (asUnit && worklist.ownLetterUnits.some((u) => u.normalize("NFD").includes(mark) && [...u].length > 1)) {
      problems.push(`mark "${mark}" classified twice (mark unit AND own-letter unit)`);
    }
  }
  return problems;
}
