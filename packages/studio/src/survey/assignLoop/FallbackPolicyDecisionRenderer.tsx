// FallbackPolicyDecisionRenderer — gallery module renderer (unused on the manifest path; issue #2539).

import type { DecisionRendererProps } from "../../decisions/decisionTypes.ts";
import type { FallbackPolicy } from "@keyboard-studio/contracts";
import { FallbackPolicyStepBody } from "../../editors/fallback/FallbackPolicyStepBody.tsx";

export function FallbackPolicyDecisionRenderer(_props: DecisionRendererProps<FallbackPolicy>) {
  return <FallbackPolicyStepBody />;
}
