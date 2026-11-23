// kvksOpenCommit -- the on-screen keyboard editor's writes on a keyboard opened
// for update (spec 111 FR-041, FR-045). Built in `openApply/kvks.ts`, applied
// through the apply host (`useApplyOnOpen`), which owns the busy guard, the
// consent question and the failure notices. Copy never comes through here.

import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { isLiveOpen } from "./openMode.ts";
import type { OpenApplyResult, OpenChange } from "./openApply/types.ts";

export { OSK_EDIT_LABEL, buildOskCodeChange, buildOskVisualChange } from "./openApply/kvks.ts";

export type KvksCommit =
  /** Not a keyboard open for update: the caller keeps its Copy behaviour. */
  | "off-open"
  /** The file now holds the text. */
  | "written"
  /** The file already held it. */
  | "unchanged"
  /** Failed, declined or busy: the host showed its notice; the file is unchanged. */
  | "not-applied";

export async function commitKvksOnOpen(
  build: () => OpenChange,
  applyOnOpen: (change: OpenChange) => Promise<OpenApplyResult>,
): Promise<{ outcome: KvksCommit; result?: OpenApplyResult }> {
  if (!isLiveOpen(useWorkingCopyStore.getState())) return { outcome: "off-open" };
  const result = await applyOnOpen(build());
  if (result.status === "applied") return { outcome: "written", result };
  if (result.status === "unchanged") return { outcome: "unchanged", result };
  return { outcome: "not-applied", result };
}
