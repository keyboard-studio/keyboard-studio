// oskLayout — gallery decision module for `osk-layout` (OSK editor step).
//
// Recording is step-side: OskEditorAdapter records via completeOskStep on
// Continue (editor-step precedent). `apply` is a no-op — the kvks lands in
// the decision record for downstream serialization paths.

import type { GalleryModule } from "../../types.ts";
import type { OskLayoutValue } from "../../assignLoop/oskLayoutValue.ts";
import { OskLayoutDecisionRenderer } from "../../assignLoop/OskLayoutDecisionRenderer.tsx";

export type { OskLayoutValue } from "../../assignLoop/oskLayoutValue.ts";

export const definition = {
  id: "oskLayout",
  type: "notice" as const,
  prompt: "How should the on-screen keyboard look?",
  audit_label: "On-screen keyboard",
};

const oskLayout: GalleryModule<OskLayoutValue> = {
  definition,
  provides: ["osk-layout"],
  screen: "osk",
  requires: ["physical-layout", "fallback-policy"],
  inputs: [],
  writes: [],
  apply: () => ({}),
  renderer: OskLayoutDecisionRenderer,
  fixtures: {
    valid: [{ value: undefined, note: "no decision recorded yet" }],
    invalid: [],
  },
};

export default oskLayout;
