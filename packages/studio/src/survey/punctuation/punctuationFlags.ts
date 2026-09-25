// punctuationFlags — flagged confirmed-inventory answer for the punctuation
// step (spec 079 US3 T079/T080), mirroring `survey/characterFlags.ts`'s split:
// one pure function `PunctuationStep.tsx` renders its own "needs
// reconfirming" cue from, and `hooks/useWorkToDo.ts` calls the SAME function
// for the journey-strip badge, so the two can never disagree.
//
// The punctuation step has exactly ONE saved answer — the confirmed
// inventory, `PUNCTUATION_INVENTORY_ANSWER_ID` — keyed by
// `steps/evidence.ts`'s `punctuationKey(resolvedTag, baseId)`. It is flagged
// when its recorded evidence key no longer matches the CURRENT evidence: a
// language or base change re-derives the proposal defaults (T044's
// `alreadyConfirmed` guard already does this), and the flag is what tells the
// author their earlier confirmation was made against different evidence.
// `complete()` always re-saves with the CURRENT key on every Done, which is
// what clears the flag — restoring the original evidence also clears it for
// free (FR-014), since the saved key then matches again.
//
// `evidenceKey: null` is never flagged: it means "confirmed before spec 079"
// (T044's own migration case), honoured as-is rather than treated as a
// mismatch.

import type { ReproposalReason, SavedAnswer } from "../../steps/answerTypes.ts";

/** Manifest step id — matches `steps/manifest.ts`'s "punctuation" entry. */
export const PUNCTUATION_STEP_ID = "punctuation";

/** The step's one saved answer id (its confirmed inventory). */
export const PUNCTUATION_INVENTORY_ANSWER_ID = "punctuation.inventory";

export interface FlaggedPunctuationAnswer {
  readonly answerId: string;
  readonly screenId: string;
  readonly reason: ReproposalReason;
}

/** The flagged (0 or 1 item) subset for the punctuation step's one answer. */
export function derivePunctuationFlags(
  saved: SavedAnswer | undefined,
  currentKey: string,
): FlaggedPunctuationAnswer[] {
  if (saved === undefined) return [];
  if (saved.evidenceKey === null || saved.evidenceKey === currentKey) return [];
  return [
    {
      answerId: PUNCTUATION_INVENTORY_ANSWER_ID,
      screenId: PUNCTUATION_STEP_ID,
      reason: {
        code: "evidence-added",
        subject: "your language or base keyboard",
        sourceStepId: PUNCTUATION_STEP_ID,
      },
    },
  ];
}
