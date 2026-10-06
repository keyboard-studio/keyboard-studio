// reproposalNotice — the FR-016 notice's pure text-composition half (spec
// 079 T064, journey-strip-contract.md §9).
//
// Split out of `components/StepHost.tsx` (which owns WHEN to raise the
// notice — the before/after `selectWorkToDo()` diff, a render-cycle concern)
// so the actual WORDING is a plain, store-free function: testable without
// mounting a step, and built from the SAME `stageLabel` map the journey strip
// itself uses (`decisions/progressDots.ts`), so the notice can never name a
// step differently than its own mark does.
//
// `affectedStepNames` never surfaces a raw step id (FR-016's "names the
// affected steps/screens by catalog label", journey-strip-contract.md §9) —
// `stageLabel`'s own fallback (the raw id, for an unmapped step) is the only
// way an id could leak here, and no manifest step is unmapped today.

import type { I18n } from "@lingui/core";
import type { WorkItem } from "../steps/workToDo.ts";
import { stageLabel } from "./progressDots.ts";
import { formatClauseList } from "./stageText.ts";

/**
 * The part of a `diffWorkToDo()` delta the FR-016 notice may speak about:
 * work in steps the author had already reached when they pressed Next
 * (`visited` is snapshotted at the click, before the advance adds the next
 * step). FR-016 is about *later answers that already exist* being
 * re-proposed; a step the author has not reached yet has nothing to
 * reconfirm — e.g. the physical mechanism gallery's unassigned characters on
 * first arrival are its own opening state, already shown as its red marks.
 */
export function noticeableWorkItems(delta: readonly WorkItem[], visited: readonly string[]): WorkItem[] {
  return delta.filter((item) => visited.includes(item.stepId));
}

/**
 * The catalog-labelled, locale-joined list of steps a `selectWorkToDo()`
 * delta touches, in first-appearance order, de-duplicated. Never a raw step
 * id — every name comes from `stageLabel`.
 */
export function affectedStepNames(delta: readonly WorkItem[], i18n?: I18n): string {
  const stepIds = [...new Set(delta.map((item) => item.stepId))];
  const stepNames = stepIds.map((id) => stageLabel(id, i18n));
  return formatClauseList(stepNames, i18n);
}
