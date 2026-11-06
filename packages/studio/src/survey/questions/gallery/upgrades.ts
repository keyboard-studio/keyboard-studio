// Gallery module: the Open walk's Upgrades page (spec 111 FR-034). Shown only
// when the baseline recorded a failing upgrade criterion (open-issues,
// registry.ts declared gate). Each upgrade is applied or skipped on the page;
// the decision it settles is that the author went through it.

import type { GalleryModule } from "../../types.ts";
import { UnmigratedGalleryRenderer } from "./placeholderRenderer.tsx";

export const definition = {
  id: "upgrades",
  type: "notice" as const,
  prompt: "Which upgrades should be applied to this keyboard?",
  audit_label: "Upgrades",
};

const upgrades: GalleryModule<boolean> = {
  definition,
  provides: ["upgrades-review"],
  screen: "open_upgrades",
  requires: [],
  // Walks after the Missing letters page, which itself walks after the language list.
  screenRequires: ["missing-letters-review"],
  inputs: [],
  writes: [],
  apply: () => ({}),
  // The page itself is rendered by survey/openWalk/UpgradesHost.tsx; importing it
  // here would close an import cycle through this registry.
  renderer: UnmigratedGalleryRenderer,
  fixtures: {
    valid: [{ value: undefined, note: "no review recorded yet" }],
    invalid: [],
  },
};

export default upgrades;
