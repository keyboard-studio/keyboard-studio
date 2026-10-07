// ruleSet — gallery decision module for `rule-set` (spec 090).
//
// The value is the rule builder's serializable result (data-model.md
// RuleSetValue): the rules-step additions in the builder seam's own
// shape (survey/rules/ruleAdditions.ts — marked IRRules/IRStores plus
// the working order per group). The module's apply splices the
// additions into the context IR through that seam, skipping any the
// recorded carve decision removed. Recording is step-side: RulesStep
// records the derived value on completion (it is its own adapter —
// the step the manifest hosts directly).
//
// No extract: the additions are a working-vs-base diff of author
// session work; a base keyboard's own rules are not builder results,
// so there is nothing to probe.
//
// Boundary (FR-003): a gallery module is a pure descriptor — no store
// imports; the value arrives via DecisionRendererProps and changes leave
// via onChange, recorded and applied by the gallery host.

import { irPath } from "@keyboard-studio/contracts";
import type { GalleryModule } from "../../types.ts";
import {
  hasRuleAdditions,
  spliceRuleAdditions,
  type RuleSetValue,
} from "../../rules/ruleAdditions.ts";
import { RulesDecisionRenderer } from "../../rules/RulesDecisionRenderer.tsx";

export const definition = {
  id: "ruleSet",
  type: "notice" as const,
  prompt: "Which rules transform your characters?",
  audit_label: "Rule set",
};

// The value type is declared with the builder seam in
// survey/rules/ruleAdditions.ts (the D-090-8 pattern) and re-exported
// here for module consumers.
export type { RuleSetValue };

const ruleSet: GalleryModule<RuleSetValue> = {
  definition,
  provides: ["rule-set"],
  screen: "rules",
  requires: ["deadkeys-defined", "windows-layout"],
  inputs: [],
  writes: [irPath("groups"), irPath("stores")],
  apply: (value, ctx) => {
    // Pass-2 composition (089 semantics, relayed 2026-10-07): when a
    // completion records deadkeys-defined or windows-layout, this
    // apply also runs — with value undefined — and must compose from
    // ctx.decisions: the recorded rule-set value, if one exists, is
    // the effective value.
    const effective =
      value ??
      (ctx.decisions["rule-set"]?.value as RuleSetValue | undefined);
    if (effective === undefined || ctx.ir === null || !hasRuleAdditions(effective)) return {};
    value = effective;
    // Additions the carve decision removed must not be resurrected
    // (the projection splice's own rule) — the deletion set is the
    // recorded carve removals' node/item ids.
    const carve = ctx.decisions["carved-layout"]?.value as
      | { removals?: readonly { id: string }[] }
      | undefined;
    const deletedRuleIds = new Set((carve?.removals ?? []).map((r) => r.id));
    const spliced = spliceRuleAdditions(ctx.ir, value, deletedRuleIds);
    if (spliced === ctx.ir) return {};
    return { ir: { groups: spliced.groups, stores: spliced.stores } };
  },
  renderer: RulesDecisionRenderer,
  fixtures: {
    valid: [{ value: undefined, note: "no decision recorded yet" }],
    invalid: [],
  },
};

export default ruleSet;
