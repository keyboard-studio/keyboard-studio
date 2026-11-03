// welcomeHtm — gallery decision module for `welcome-htm` (HTML editor step).
//
// The welcome.htm editor step (#2481) records the authored manual at completion;
// this module names the decision so spec 091's derivation includes the "html"
// screen after help.
//
// Boundary (FR-003): a gallery module is a pure descriptor — no store imports.

import type { GalleryModule } from "../../types.ts";
import { UnmigratedGalleryRenderer } from "./placeholderRenderer.tsx";

export const definition = {
  id: "welcomeHtm",
  type: "notice" as const,
  prompt: "What should the welcome page say?",
  audit_label: "Welcome page",
};

/** Markdown source for welcome.htm; empty keeps the scaffold default. */
export interface WelcomeHtmValue {
  html: string;
}

const welcomeHtm: GalleryModule<WelcomeHtmValue> = {
  definition,
  provides: ["welcome-htm"],
  screen: "html",
  requires: ["help-docs"],
  inputs: [],
  writes: [],
  apply: () => ({}),
  renderer: UnmigratedGalleryRenderer,
  fixtures: {
    valid: [{ value: undefined, note: "no decision recorded yet" }],
    invalid: [],
  },
};

export default welcomeHtm;
