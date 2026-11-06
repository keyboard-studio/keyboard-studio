// Gallery module: the Open walk's Missing letters page (spec 111 FR-033). The
// screen is shown only when the baseline recorded the problem (open-issues,
// registry.ts declared gate); the decision it settles is just that the author
// went through it.

import type { GalleryModule } from "../../types.ts";
import { UnmigratedGalleryRenderer } from "./placeholderRenderer.tsx";

export const definition = {
  id: "missingLetters",
  type: "notice" as const,
  prompt: "Which letters can this keyboard not type yet?",
  audit_label: "Missing letters",
};

const missingLetters: GalleryModule<boolean> = {
  definition,
  provides: ["missing-letters-review"],
  screen: "open_missing_letters",
  requires: [],
  // Walks after the language list: removing a language there changes what is missing.
  screenRequires: ["language-list"],
  inputs: [],
  writes: [],
  apply: () => ({}),
  // The page itself is rendered by survey/openWalk/MissingLettersHost.tsx; importing it
  // here would close an import cycle through this registry.
  renderer: UnmigratedGalleryRenderer,
  fixtures: {
    valid: [{ value: undefined, note: "no review recorded yet" }],
    invalid: [],
  },
};

export default missingLetters;
