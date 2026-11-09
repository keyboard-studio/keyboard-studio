// icon — gallery decision module for `icon` (icon editor step).
//
// Recording is step-side: IconEditor records via onComplete on Continue
// (editor-step precedent). `apply` is a no-op — the icon data lands in
// the decision record for downstream serialization paths.

import type { GalleryModule } from "../../types.ts";

export type IconValue = {
  iconIcoBase64?: string;
  iconPngDataUrl?: string;
};

export const definition = {
  id: "icon",
  type: "notice" as const,
  prompt: "What should the keyboard icon look like?",
  audit_label: "Keyboard icon",
};

const icon: GalleryModule<IconValue> = {
  definition,
  provides: ["icon"],
  screen: "icon",
  requires: ["welcome-htm"],
  inputs: [],
  writes: [],
  apply: () => ({}),
  renderer: () => null,
  fixtures: {
    valid: [{ value: undefined, note: "no decision recorded yet" }],
    invalid: [],
  },
};

export default icon;
