// welcomeHtm — gallery decision module for `welcome-htm` (Documentation step).
//
// The Documentation editor step (specs/html-editor) records the authored
// documentation at completion; this module names the decision so spec 091's
// derivation includes the "html" screen after help.
//
// Recording is step-side (lib/htmlStepCompletion.ts, the completeOskStep
// precedent): HtmlEditor writes the authored text to the working-copy
// store directly and Continue records the `welcome-htm` decision.
// `apply` stays a no-op — WorkingCopyPatch has no authored-docs channel,
// so a module apply cannot store these fields; `writes` stays empty for
// the same reason (it names IR paths, and the doc members are VFS files,
// not IR locations).
//
// Boundary (FR-003): a gallery module is a pure descriptor — no store imports.

import type { GalleryModule } from "../../types.ts";
import type { WelcomeHtmValue } from "../../assignLoop/welcomeHtmValue.ts";
import { WelcomeHtmDecisionRenderer } from "../../assignLoop/WelcomeHtmDecisionRenderer.tsx";

export type { WelcomeHtmValue } from "../../assignLoop/welcomeHtmValue.ts";

export const definition = {
  id: "welcomeHtm",
  type: "notice" as const,
  prompt: "What should the documentation say?",
  audit_label: "Documentation",
};

const welcomeHtm: GalleryModule<WelcomeHtmValue> = {
  definition,
  provides: ["welcome-htm"],
  screen: "html",
  requires: ["help-docs"],
  inputs: [],
  writes: [],
  apply: () => ({}),
  renderer: WelcomeHtmDecisionRenderer,
  fixtures: {
    valid: [{ value: undefined, note: "no decision recorded yet" }],
    invalid: [],
  },
};

export default welcomeHtm;
