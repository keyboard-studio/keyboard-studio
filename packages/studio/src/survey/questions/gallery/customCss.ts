// customCss — gallery decision module for `custom-css` (CSS editor step).
//
// The CSS editor step (#2477) records optional embed CSS at completion; this
// module names the decision the screen settles so spec 091's derivation includes
// the "css" screen between touch and help.
//
// Boundary (FR-003): a gallery module is a pure descriptor — no store
// imports; the value arrives via DecisionRendererProps and changes leave
// via onChange, recorded and applied by the gallery host.

import type { GalleryModule } from "../../types.ts";
import { UnmigratedGalleryRenderer } from "./placeholderRenderer.tsx";

export const definition = {
  id: "customCss",
  type: "notice" as const,
  prompt: "Should the keyboard include custom CSS?",
  audit_label: "Custom CSS",
};

/** Optional embed CSS text; empty means no .css file is written. */
export interface CustomCssValue {
  css: string;
}

const customCss: GalleryModule<CustomCssValue> = {
  definition,
  provides: ["custom-css"],
  screen: "css",
  requires: ["touch-layout"],
  inputs: [],
  writes: [],
  apply: () => ({}),
  renderer: UnmigratedGalleryRenderer,
  fixtures: {
    valid: [{ value: undefined, note: "no decision recorded yet" }],
    invalid: [],
  },
};

export default customCss;
