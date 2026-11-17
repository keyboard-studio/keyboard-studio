// iconOpenCommit -- the icon step on a keyboard opened for update (spec 111
// FR-041, FR-045; #2927). The caller-side half: the change is built in
// `openApply/icon.ts` and applied through the apply host (`useApplyOnOpen`),
// which owns the busy guard and the failure notices. Nothing is held in
// `iconIcoBase64`. Copy never comes through here.
//
// Outcomes:
//   "off-open"   not a keyboard open for update: the caller keeps its Copy
//                behaviour (store field + decision).
//   "written"    the files now hold the icon (or already did): the caller
//                records the decision and completes the step.
//   "no-icon"    on Open but there is no edited icon to write, or the bytes
//                cannot be decoded. The host never sees this one, so the
//                caller says so itself.
//   "not-applied"  on Open, the apply failed, was declined or was busy: the
//                host already showed its notice.
// On either of the last two the caller completes nothing and stays on the step.

import type { IconValue } from "../survey/questions/gallery/icon.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { isLiveOpen } from "./openMode.ts";
import { buildIconChange } from "./openApply/icon.ts";
import type { OpenApplyResult, OpenChange } from "./openApply/types.ts";

export type IconCommit = "off-open" | "written" | "no-icon" | "not-applied";

/** Apply the icon step's edited icon to the opened keyboard's files. */
export async function commitIconOnOpen(
  value: IconValue,
  applyOnOpen: (change: OpenChange) => Promise<OpenApplyResult>,
): Promise<IconCommit> {
  if (!isLiveOpen(useWorkingCopyStore.getState())) return "off-open";
  const built = buildIconChange(value.iconIcoBase64);
  if (built === null) return "no-icon";
  const result = await applyOnOpen(built.change);
  return result.status === "applied" || result.status === "unchanged" ? "written" : "not-applied";
}
