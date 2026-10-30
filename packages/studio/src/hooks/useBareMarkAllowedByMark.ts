/**
 * useBareMarkAllowedByMark — the touch editor's read of the per-mark
 * "start of line" box (#2374 Track B, ruling §3).
 *
 * SEAM WITH TRACK C: the box itself is owned by the survey layer. The
 * sentinel `ATTACHMENT_START_OF_LINE` is canonical in the engine worklist
 * (`packages/engine/src/marks/worklist.ts`, exported from
 * `@keyboard-studio/engine`; `survey/marks/marksViews.ts` re-exports it),
 * and Track C extended `reconciledAttachmentChecked` so every mark row
 * carries the column (default `false`, never case-expanded, never
 * proposed — the space column's posture). This hook is the ONE place the
 * touch editor reads that column: it reconciles the SAME saved answers
 * the marks step renders from (the spec 079 US3 parity rule — cf.
 * `useWorkToDo.ts`), then projects the column to `mark -> ticked`.
 *
 * Mapping (ruling §3, preserving the old guard semantics per mark):
 * ticked → the bare mark may appear at buffer start (old `"emit"`,
 * plain `U_`); unticked — INCLUDING marks with no survey row at all
 * (late-added marks, touch editor, marks step skipped) — → the mark is
 * blocked at buffer start (old `"swallow"`, guarded `T_`). There is no
 * third state: an absent map entry reads as unticked.
 *
 * Minting call sites take the resolved per-mark boolean (or this by-mark
 * map); nothing below this hook reaches into survey state itself, and no
 * second store is invented — the reconciled attachment checked-map is the
 * single source.
 */

import { useMemo } from "react";
import {
  ATTACHMENT_START_OF_LINE,
  buildAttestationFold,
  CASING_FACET_ID,
  getEffectiveFacet,
  groupMarkClasses,
  proposeAttachments,
} from "@keyboard-studio/engine";
import { reconciledAttachmentChecked } from "../survey/marks/marksViews.ts";
import { deriveSurveyContext } from "../decisions/identitySelectors.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { useSurveyAnswerStore } from "../stores/surveyAnswerStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";

/** Per mark, whether its "start of line" box is ticked. Absent mark → unticked. */
export type BareMarkAllowedByMark = Readonly<Record<string, boolean>>;

/**
 * The per-mark "start of line" box, live from the stores. Re-derives when
 * the alphabet, the casing facet, the survey locale, or the marks-step
 * answers change.
 */
export function useBareMarkAllowedByMark(): BareMarkAllowedByMark {
  const alphabet = useWorkingCopyStore((s) => s.session.alphabet);
  const startIr = useWorkingCopyStore((s) => s.startIr);
  const bcp47 = useDecisionStore((s) => deriveSurveyContext(s.decisions).bcp47_tag);
  const marksStepAnswers = useSurveyAnswerStore((s) => s.steps.marks);

  return useMemo<BareMarkAllowedByMark>(() => {
    if (alphabet === undefined || alphabet.marks.length === 0) return {};
    // Same proposal the marks step renders its attachment station from
    // (useWorkToDo.ts's spec 079 US3 parity block): the box column lives
    // on those rows, so this must be the same row set.
    const casingValue =
      startIr != null ? getEffectiveFacet(startIr, CASING_FACET_ID).value : undefined;
    const isCasedBase = casingValue === "cased" || casingValue === "mixed";
    const fold = buildAttestationFold(isCasedBase, bcp47);
    const classes = groupMarkClasses(alphabet, fold);
    const proposals = proposeAttachments(alphabet, classes, fold);
    const reconciled = reconciledAttachmentChecked(
      alphabet,
      proposals,
      marksStepAnswers?.answers ?? {},
    );
    const out: Record<string, boolean> = {};
    for (const [mark, row] of Object.entries(reconciled)) {
      out[mark] = row[ATTACHMENT_START_OF_LINE] === true;
    }
    return out;
  }, [alphabet, startIr, bcp47, marksStepAnswers]);
}
