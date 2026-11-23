// openApply caps kind -- the answered caps-handling decision written into the
// opened keyboard's files when it is answered (spec 111 "live files", FR-041).
// Runs projection step 2.8 through the apply seam: the `&CasedKeys` store and the
// CAPS/NCAPS rules are spliced into the `.kmn`, and the touch layout gets its caps
// layer. When the splice cannot place them precisely nothing is written and the
// answer is `needs-consent` (FR-009), like every other `.kmn` change.

import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { getDecisionSnapshot } from "../../stores/decisionStore.ts";
import { deriveSurveyContext } from "../../decisions/identitySelectors.ts";
import { applyRemoveOrIr } from "./core.ts";
import type { OpenApplyOptions, OpenApplyResult, OpenChange } from "./types.ts";

/** The caps step reports a failure as this warning and leaves the file; here that is a failed apply. */
const CAPS_SKIPPED = /caps handling projection skipped/;

export function applyCaps(change: Extract<OpenChange, { kind: "caps" }>, opts: OpenApplyOptions): OpenApplyResult {
  if (useWorkingCopyStore.getState().startIr === null) return { status: "failed", reason: "No keyboard is open." };
  // `explicit-rules` keeps the copy's own rules: there is nothing to write.
  if (change.value.mode === "explicit-rules") return { status: "unchanged" };
  const bcp47 = deriveSurveyContext(getDecisionSnapshot()).bcp47_tag;
  return applyRemoveOrIr(
    change,
    opts,
    {
      capsHandling: change.value,
      runAs: "caps",
      failOnWarning: CAPS_SKIPPED,
      ...(bcp47 !== undefined && bcp47 !== "" ? { bcp47 } : {}),
    },
    "Apply caps handling",
    { kind: "files" },
    "caps",
  );
}
