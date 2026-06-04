// see spec.md §4 — offline US-English fallback bundle (always present)

import {
  makeBaseKeyboard,
  type BaseKeyboard,
} from "@keyboard-studio/contracts";

/**
 * US-English offline fallback keyboard (spec §4).
 * Returned by {@link createBaseBrowser} whenever the GitHub API is
 * unavailable or rate-limited, and always included in the live list
 * regardless of API state.
 */
export const offlineKbdus: BaseKeyboard = makeBaseKeyboard({
  id: "basic_kbdus",
  path: "release/b/basic_kbdus",
  script: "Latn",
  targets: ["windows", "macosx", "linux", "web"],
  displayName: "US English (Basic)",
  version: "1.0",
  sourceUrl:
    "https://github.com/keymanapp/keyboards/tree/master/release/b/basic_kbdus",
});
