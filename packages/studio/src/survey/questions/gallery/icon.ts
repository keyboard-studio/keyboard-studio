// icon — gallery decision module for `icon` (icon editor step).
//
// Recording is step-side: IconEditor records via onComplete on Continue
// (editor-step precedent). `apply` is a no-op — and deliberately so: the
// icon is a FILE, not an IR value, and `WorkingCopyPatch` has no `files`
// channel, so no module apply could write it. The bytes travel two other
// ways (#2927), both outside `apply`:
//   - Copy: IconEditor holds the base64 `.ico` in the working-copy store
//     (`setIconIco`); the projection's step 4c writes it into the working
//     copy, so the preview and the download carry the edited icon.
//   - Open: IconEditor writes it to its file through the apply seam
//     (`lib/iconOpenCommit`, a `files` change with an undo record) when
//     applied — the docs/stylesheet commit-helper precedent, not `apply`.
//
// `iconPngDataUrl` is a 48px preview only; nothing is ever written from it.

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
