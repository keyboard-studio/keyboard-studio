// descriptorOpenCommit -- writes the language list into an opened keyboard's
// `.kps` through the apply host (spec 111 FR-041/FR-042). Like
// `layoutOpenCommit.ts`, it is the caller-side half; the change itself is built
// in `openApply/descriptor.ts`.
//
// Outcomes:
//   "off-open"  not a keyboard open for update: the caller keeps its Copy
//               behaviour (identity patch + decision).
//   "written"   the file now holds the list (or already did): the caller records
//               the decision; identity follows the file.
//   "no-descriptor"  on Open but there is no readable `.kps` to write into. The host
//               never sees this one, so the caller says so itself.
//   "not-applied"    on Open, the apply failed, was declined or was busy: the host
//               already showed its notice.
// On either of the last two the caller writes neither decision nor identity.

import type { OpenKpsInfoPatch } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { isLiveOpen } from "./openMode.ts";
import { buildDescriptorChange } from "./openApply/descriptor.ts";
import type { OpenApplyResult, OpenChange } from "./openApply/types.ts";

export type DescriptorCommit = "off-open" | "written" | "no-descriptor" | "not-applied";

export async function commitDescriptorOnOpen(
  patch: OpenKpsInfoPatch,
  applyOnOpen: (change: OpenChange) => Promise<OpenApplyResult>,
): Promise<DescriptorCommit> {
  if (!isLiveOpen(useWorkingCopyStore.getState())) return "off-open";
  const change = buildDescriptorChange(patch);
  if (change === null) return "no-descriptor";
  const result = await applyOnOpen(change);
  return result.status === "applied" || result.status === "unchanged" ? "written" : "not-applied";
}
