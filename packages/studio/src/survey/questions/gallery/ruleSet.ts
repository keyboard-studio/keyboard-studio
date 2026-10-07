// ruleSet — gallery decision module for `rule-set` (spec 090).
//
// Stub landed with T008 so the FR-002 coverage test pins this decision's
// provider from the start; the real renderer/apply fill in with T034 (US3).
// The value is the rule builder's serializable result; T034 pins the
// shape from the builder's own types (survey/rules/).
// Boundary (FR-003): a gallery module is a pure descriptor — no store
// imports; the value arrives via DecisionRendererProps and changes leave
// via onChange, recorded and applied by the gallery host.

import type { GalleryModule } from "../../types.ts";
import { UnmigratedGalleryRenderer } from "./placeholderRenderer.tsx";

export const definition = {
  id: "ruleSet",
  type: "notice" as const,
  prompt: "Which rules transform your characters?",
  audit_label: "Rule set",
};

/**
 * The rule-set decision value (data-model.md): the rule builder's
 * serializable result — the rules the author built, in builder order.
 * Payload shape is pinned by T034 from the builder types.
 */
export interface RuleSetValue {
  rules: readonly unknown[];
}

const ruleSet: GalleryModule<RuleSetValue> = {
  definition,
  provides: ["rule-set"],
  screen: "rules",
  requires: ["deadkeys-defined", "windows-layout"],
  inputs: [],
  // decisionIRPaths maps this decision to [] today; a story that gives the
  // module real IR writes updates decisionIRPaths in the same change
  // (decisionIRConsistency.test.ts pins the two together).
  writes: [],
  apply: () => ({}),
  renderer: UnmigratedGalleryRenderer,
  fixtures: {
    valid: [{ value: undefined, note: "no decision recorded yet" }],
    invalid: [],
  },
};

export default ruleSet;
