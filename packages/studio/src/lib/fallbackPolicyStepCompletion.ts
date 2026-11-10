// fallbackPolicyStepCompletion — records `fallback-policy` when the step completes (issue #2539).

import type { FallbackPolicy } from "@keyboard-studio/contracts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";

/** The Fallback step's Continue: record the current store policy as the gallery decision. */
export function completeFallbackPolicyStep(): void {
  const policy: FallbackPolicy = useWorkingCopyStore.getState().fallbackPolicy;
  useDecisionStore.getState().record({
    id: "fallback-policy",
    value: policy,
    provenance: "asked",
    step: "fallback_policy",
  });
}
