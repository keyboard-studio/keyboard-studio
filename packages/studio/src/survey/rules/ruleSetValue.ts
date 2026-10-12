// currentRuleSetValue — the rule-set decision's value from the live
// working copy (spec 090 T034): the rules-step additions derived
// against the base IR, in the builder seam's own shape. Shared by
// RulesStep's completion recording and the module's decision
// renderer so the two surfaces never compute different values.

import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { deriveRuleAdditions, type RuleSetValue } from "./ruleAdditions.ts";

export function currentRuleSetValue(): RuleSetValue {
  const { ir, startIr } = useWorkingCopyStore.getState();
  if (ir === null || startIr === null) return { groups: [], stores: [] };
  return deriveRuleAdditions(ir, startIr);
}
