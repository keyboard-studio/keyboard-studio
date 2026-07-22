// Mental-model prefill (spec 046, FR-011): the recommended answer each
// mark-class's S2 confirmation starts from, derived from three signals —
//
//   1. productivity spread — how many different base letters the class's marks
//      actually attach to in the confirmed alphabet (widely attached suggests
//      the community treats the mark as a productive modifier);
//   2. the base keyboard's own mechanism — whether the keyboard this one
//      derives from already treats marks as a keystroke that combines with a
//      letter (deadkey or direct combining output) or ships whole precomposed
//      letters (a sibling detector to strategy-selector/import-mark-order.ts,
//      informed by the diacritic-mechanism facet's classification approach);
//   3. spare-key affordability — when the attested+plausible combinations
//      outnumber the physical key positions available for dedicated units,
//      own-letter is presented as UNAFFORDABLE with the reason stated.
//
// Thresholds ship as named constants, calibrated later (spec assumption).

import type { ConfirmedAlphabet, KeyboardIR } from "@keyboard-studio/contracts";
import type { MarkClass } from "./mark-classes.js";
import { attestedBasesOf } from "./mark-classes.js";
import type { AttachmentProposal } from "./attachment-proposals.js";

/** Attested-base spread at or above this suggests letter-plus-mark. */
export const PRODUCTIVITY_SPREAD_THRESHOLD = 3;

export type MentalModelAnswer = "own-letter" | "letter-plus-mark";

/** How the base keyboard produces marked letters, when detectable. */
export type BaseMarkMechanism = "combining-keystroke" | "precomposed";

export interface MentalModelPrefill {
  classId: string;
  recommended: MentalModelAnswer;
  /** The FR-011 signals that produced the recommendation (shown to the designer). */
  signals: {
    /** Widest attested base count among the class's marks. */
    productivitySpread: number;
    /** The base keyboard's own mechanism, when detectable. */
    baseMechanism: BaseMarkMechanism | null;
    /** False when dedicated units would not fit the spare keys. */
    ownLetterAffordable: boolean;
    /** Plain-language reason when own-letter is unaffordable. */
    unaffordableReason?: string;
  };
}

/**
 * Sibling detector to `detectMarkInputOrderFromImport`: does the base
 * keyboard emit combining marks as their own output (a keystroke that
 * combines — deadkey-resolved or direct), or only whole precomposed letters?
 * Returns null when the IR shows no mark-bearing output at all.
 */
export function detectBaseMarkMechanism(ir: KeyboardIR): BaseMarkMechanism | null {
  let sawPrecomposed = false;
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      for (const el of rule.output) {
        if (el.kind !== "char") continue;
        if (/^\p{M}$/u.test(el.value)) return "combining-keystroke";
        if (el.value.normalize("NFD").length > el.value.length) sawPrecomposed = true;
      }
    }
  }
  return sawPrecomposed ? "precomposed" : null;
}

/**
 * Compute the S2 prefill for every mark-class. `spareKeys` is the number of
 * physical key positions available for dedicated letter units (null =
 * unknown, affordability not assessed); `baseIr` is the keyboard this one
 * derives from (null on a from-scratch track).
 */
export function computeMentalModelPrefills(
  alphabet: ConfirmedAlphabet,
  classes: MarkClass[],
  proposals: AttachmentProposal[],
  opts: { baseIr?: KeyboardIR | null; spareKeys?: number | null } = {},
): MentalModelPrefill[] {
  const attested = attestedBasesOf(alphabet);
  const baseMechanism = opts.baseIr != null ? detectBaseMarkMechanism(opts.baseIr) : null;
  const proposalByMark = new Map(proposals.map((p) => [p.mark, p]));

  return classes.map((markClass) => {
    const spread = Math.max(
      0,
      ...markClass.marks.map((m) => (attested.get(m) ?? new Set()).size),
    );

    // Dedicated units this class would need under own-letter: every
    // attested-or-plausible pair of its marks.
    let unitCount = 0;
    for (const mark of markClass.marks) {
      const proposal = proposalByMark.get(mark);
      if (proposal === undefined) continue;
      unitCount += Object.values(proposal.states).filter((s) => s !== "blocked").length;
    }
    const spareKeys = opts.spareKeys ?? null;
    const ownLetterAffordable = spareKeys === null || unitCount <= spareKeys;

    let recommended: MentalModelAnswer;
    if (!ownLetterAffordable) {
      recommended = "letter-plus-mark";
    } else if (spread >= PRODUCTIVITY_SPREAD_THRESHOLD) {
      recommended = "letter-plus-mark";
    } else if (baseMechanism === "combining-keystroke") {
      recommended = "letter-plus-mark";
    } else {
      recommended = "own-letter";
    }

    return {
      classId: markClass.id,
      recommended,
      signals: {
        productivitySpread: spread,
        baseMechanism,
        ownLetterAffordable,
        ...(ownLetterAffordable
          ? {}
          : {
              unaffordableReason:
                `Giving each of these ${unitCount} accented letters its own key ` +
                `would need more keys than your keyboard has free (${spareKeys}).`,
            }),
      },
    };
  });
}
