// RulesDecisionRenderer — the rule-set module's renderer (spec 090
// T034): the Rules step under the decision host. The step's builders
// write the working copy directly (their own commit path); on
// completion the derived rule-set value leaves through onChange.

import type { DecisionRendererProps } from "../../decisions/decisionTypes.ts";
import type { RuleSetValue } from "./ruleAdditions.ts";
import { currentRuleSetValue } from "./ruleSetValue.ts";
import RulesStep from "./RulesStep.tsx";

export function RulesDecisionRenderer({
  onChange,
}: DecisionRendererProps<RuleSetValue>) {
  return (
    <RulesStep
      onComplete={() => onChange(currentRuleSetValue())}
      onBack={() => {}}
    />
  );
}
