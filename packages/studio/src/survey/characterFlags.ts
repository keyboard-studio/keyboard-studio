// characterFlags — flagged carried-over characters-step additions (spec 079
// US3 T059/T080), mirroring `survey/marks/marksViews.ts`'s split: one pure
// function `CharactersStep.tsx` (via `PhaseB.tsx`'s build-list screen) uses
// for its own "needs reconfirming" cue, and `hooks/useWorkToDo.ts` calls the
// SAME function for the journey-strip badge, so the two can never disagree.
//
// The ONLY flaggable characters-step answer today is a carried-over author
// addition that survived a script change but landed outside the new target
// script (`steps/CharactersStep.tsx`'s `confirmPrefill`, R-07 steps 6-7).
// Every other characters-step interaction — build-list picks, the manual
// sub-flow's own per-question answers (owned by SurveyRunner) — has no
// per-answer evidence key of its own: a script change resets the whole draft
// rather than reconciling individual picks, so there is nothing else to
// classify here. `reconcile` is not reused directly because there is no
// separate "proposal" value to fall back on for an addition — the value IS
// the saved grapheme, always — so this module compares keys itself.

import type { ReproposalReason, SavedAnswer } from "../steps/answerTypes.ts";

/** Manifest step id — matches `steps/manifest.ts`'s "characters" entry. */
export const CHARACTERS_STEP_ID = "characters";

/** Prefix for a carried-over addition's answer id: `characters.addition.<grapheme>`. */
export const ADDITION_ANSWER_PREFIX = "characters.addition.";

/** The screen a flagged addition is surfaced on and resolved from. */
export const CHARACTERS_BUILD_LIST_SCREEN_ID = "build-list";

export interface FlaggedCharacterAnswer {
  readonly answerId: string;
  readonly screenId: string;
  readonly reason: ReproposalReason;
}

/**
 * The flagged subset of a characters step's saved answers: a
 * `characters.addition.<grapheme>` answer whose recorded evidence key no
 * longer matches `currentKey` (the current `steps/evidence.ts` `alphabetKey`).
 * Re-stamping the answer with `currentKey` (T080's build-list Done handler)
 * is what clears the flag — restoring the OLD evidence also clears it for
 * free (FR-014), since the saved key then matches again.
 */
export function deriveCharacterFlags(
  savedAnswers: Readonly<Record<string, SavedAnswer>>,
  currentKey: string,
): FlaggedCharacterAnswer[] {
  const out: FlaggedCharacterAnswer[] = [];
  for (const [answerId, saved] of Object.entries(savedAnswers)) {
    if (!answerId.startsWith(ADDITION_ANSWER_PREFIX)) continue;
    if (saved.evidenceKey === currentKey) continue;
    const grapheme = answerId.slice(ADDITION_ANSWER_PREFIX.length);
    out.push({
      answerId,
      screenId: CHARACTERS_BUILD_LIST_SCREEN_ID,
      reason: {
        code: "outside-script",
        subject: grapheme,
        sourceStepId: "characters",
      },
    });
  }
  return out;
}
