// fallbackPolicy — gallery decision module for `fallback-policy` (spec 076, issue #2539).
//
// The value is the keyboard-wide FallbackPolicy in the working-copy store.
// Recording is step-side: FallbackPolicyAdapter calls completeFallbackPolicyStep on
// Continue (editor-step precedent). `apply` is a no-op — the store already holds the choice.

import type { FallbackPolicy } from "@keyboard-studio/contracts";
import type { GalleryModule } from "../../types.ts";
import { FallbackPolicyDecisionRenderer } from "../../assignLoop/FallbackPolicyDecisionRenderer.tsx";

export type { FallbackPolicy as FallbackPolicyValue } from "@keyboard-studio/contracts";

export const definition = {
  id: "fallbackPolicy",
  type: "notice" as const,
  prompt:
    "For keys your copied keyboard does not define: allow the typist's computer layout to type there, or block those keys?",
  audit_label: "Fallback policy for undefined keys",
};

const fallbackPolicy: GalleryModule<FallbackPolicy> = {
  definition,
  provides: ["fallback-policy"],
  screen: "fallback_policy",
  requires: ["physical-layout"],
  inputs: [],
  writes: [],
  apply: () => ({}),
  renderer: FallbackPolicyDecisionRenderer,
  fixtures: {
    valid: [{ value: "swallow" as const, note: "default store value" }],
    invalid: [],
  },
};

export default fallbackPolicy;
