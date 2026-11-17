// openCapsCommit -- on a keyboard opened for update, an answered caps-handling
// decision is written into the files when it is answered (spec 111 FR-041), through
// the apply seam's `caps` kind: one undo record, nothing held to replay at output.
// The gallery host's `recordDecision` dep (lib/galleryHostDeps) calls it when the
// `caps-handling` decision is recorded (its `apply` returns no patch, so the patch
// sink never sees it). A change that needs the author's agreement (FR-009) or fails is handed
// to `OpenApplyHost` exactly as the other sinks hand one over; if it is then
// declined the decision goes back to what it was, so the record matches the files.

import { devLog } from "@keyboard-studio/contracts/dev-log";
import { getDecisionSnapshot } from "../stores/decisionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import type { PatchOrigin } from "../survey/types.ts";
import { captureDecisionRollback } from "./decisionJournal.ts";
import { isLiveOpen } from "./openMode.ts";
import { applyThroughOpenSeam, handOverToOpenApplyHost } from "./openApplyNotifier.ts";
import { capsHandlingFromDecisions } from "./capsHandlingFromDecisions.ts";
import type { OpenApplyResult, OpenChange } from "./openApply/types.ts";

export const CAPS_DECISION_ID = "caps-handling";

/** The caps change for the decision as it stands now; only an answered value counts on Open. */
function buildCapsChange(): OpenChange | null {
  if (!isLiveOpen(useWorkingCopyStore.getState())) return null;
  const value = capsHandlingFromDecisions(getDecisionSnapshot(), { askedOnly: true });
  return value === undefined ? null : { kind: "caps", value };
}

/**
 * Write the answered caps decision into the files. Undefined when there is nothing
 * to write (a seeded default or an extracted value is a record, not a change the
 * author made; a caseless alphabet is not asked).
 */
export function commitCapsOnOpen(origin: PatchOrigin | undefined): OpenApplyResult | undefined {
  const change = buildCapsChange();
  if (change === null) return undefined;
  const result = applyThroughOpenSeam(change);
  if (result.status === "applied" || result.status === "unchanged") return result;
  const rollback = captureDecisionRollback(origin?.decisionIds ?? [CAPS_DECISION_ID]) ?? (() => {});
  const onNotApplied = (): void => {
    rollback();
    origin?.onNotApplied?.();
  };
  const handed = handOverToOpenApplyHost({
    build: buildCapsChange,
    onNotApplied,
    ...(origin?.onApplied !== undefined ? { onApplied: origin.onApplied } : {}),
  });
  if (!handed) {
    devLog.warn(
      "[open-apply] the caps handling was not written to the files: " +
        (result.status === "failed" ? result.reason : "it needs the author's agreement"),
    );
    onNotApplied();
  }
  return result;
}
