// html — gallery decision module for `html` (HTML editor step).
//
// Recording is step-side: HtmlEditor records via onComplete on Continue
// (editor-step precedent). `apply` is a no-op — the HTML lands in
// the decision record for downstream serialization paths.

import type { GalleryModule } from "../../types.ts";

export type HtmlValue = {
  html?: string;
};

export const definition = {
  id: "html",
  type: "notice" as const,
  prompt: "What should the welcome page look like?",
  audit_label: "Welcome page (HTML)",
};

const html: GalleryModule<HtmlValue> = {
  definition,
  provides: ["html"],
  screen: "html",
  requires: ["help-docs"],
  inputs: [],
  writes: [],
  apply: () => ({}),
  renderer: () => null,
  fixtures: {
    valid: [{ value: undefined, note: "no decision recorded yet" }],
    invalid: [],
  },
};

export default html;
