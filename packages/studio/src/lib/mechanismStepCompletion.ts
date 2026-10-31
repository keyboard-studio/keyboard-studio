// mechanismStepCompletion -- what the deadkeys, rules and mechanisms steps do
// when the author finishes them: record the step's own decision (the
// editor-step precedent: the step records its own decision, spec 090), and for
// mechanisms fire the completion effects.
//
// Lifted out of DeadkeyAdapter, RulesStep and AddPhysicalAdapter so a headless
// caller completes each step through the same code the Continue / Done button
// runs. The components call these; they hold no second copy.

import type { DeadkeysDefinedValue } from "./deadkeyOps.ts";
import { applyPhysicalCompletionEffects } from "./assignLoopCompletion.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { currentPhysicalLayoutValue } from "../survey/assignLoop/physicalLayoutValue.ts";
import { currentRuleSetValue } from "../survey/rules/ruleSetValue.ts";

function currentDeadkeyValue(): DeadkeysDefinedValue {
  return { ops: [...useWorkingCopyStore.getState().deadkeyOverlay.ops] };
}

/** The Deadkeys step's Continue: record `deadkeys-defined` (the working copy's deadkey op log). */
export function completeDeadkeysStep(): void {
  useDecisionStore.getState().record({
    id: "deadkeys-defined",
    value: currentDeadkeyValue(),
    provenance: "asked",
  });
}

/** The Rules step's Continue: record `rule-set` (the derived builder result). */
export function completeRulesStep(): void {
  useDecisionStore.getState().record({
    id: "rule-set",
    value: currentRuleSetValue(),
    provenance: "asked",
  });
}

/**
 * The Mechanisms step's Done: record `physical-layout` (the current assignment
 * list as one value), then fire the completion effects (lock the desktop
 * layout, re-propagate touch).
 */
export function completePhysicalLayoutStep(): void {
  useDecisionStore.getState().record({
    id: "physical-layout",
    value: currentPhysicalLayoutValue(),
    provenance: "asked",
  });
  applyPhysicalCompletionEffects();
}
