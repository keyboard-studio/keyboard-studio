// Gallery module: the keyboard's language list on Open (spec 111). Declared
// through the decision registry like every gallery, so the screen derives from
// it rather than from a hand-kept step list.

import type { GalleryModule } from "../../types.ts";
import {
  LanguageListRenderer,
  type LanguageListValue,
} from "../../languageList/LanguageListPanel.tsx";

export const definition = {
  id: "languageList",
  type: "notice" as const,
  prompt: "Which languages does this keyboard support?",
  audit_label: "Keyboard languages",
};

const languageList: GalleryModule<LanguageListValue> = {
  definition,
  provides: ["language-list"],
  screen: "open_languages",
  // Walks after the attribution trio, which is also what orders it after the track choice.
  screenRequires: ["copyright-holder"],
  inputs: [],
  writes: [],
  apply: () => ({}),
  renderer: LanguageListRenderer,
  fixtures: {
    valid: [{ value: undefined, note: "no edit recorded: the list seeded from the .kps stands" }],
    invalid: [],
  },
};

export default languageList;
