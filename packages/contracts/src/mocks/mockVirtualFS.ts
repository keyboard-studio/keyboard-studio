// see spec.md section 11 — VirtualFS in-memory helper for mock services

import type { VirtualFS, VirtualFSEntry } from "../virtualFS";

/**
 * Construct a minimal in-memory VirtualFS populated with the given entries.
 * Used internally by mock services that need to return a VirtualFS value.
 */
export function makeMockVirtualFS(
  entries: Array<{ path: string; content: string }>
): VirtualFS {
  const store = new Map<string, VirtualFSEntry>();
  for (const e of entries) {
    store.set(e.path, { path: e.path, content: e.content, isBinary: false });
  }

  return {
    get(path: string): VirtualFSEntry | undefined {
      return store.get(path);
    },
    set(
      path: string,
      content: Uint8Array | string,
      isBinary = false
    ): VirtualFSEntry | undefined {
      const prev = store.get(path);
      store.set(path, { path, content, isBinary });
      return prev;
    },
    delete(path: string): boolean {
      return store.delete(path);
    },
    list(prefix?: string): string[] {
      const keys = [...store.keys()];
      if (prefix === undefined) return keys;
      return keys.filter((k) => k.startsWith(prefix));
    },
    entries(prefix?: string): VirtualFSEntry[] {
      const all = [...store.values()];
      if (prefix === undefined) return all;
      return all.filter((e) => e.path.startsWith(prefix));
    },
  };
}

/** A pre-built scaffolded VirtualFS fixture for "my_keyboard". */
export const scaffoldedFS: VirtualFS = makeMockVirtualFS([
  { path: "source/my_keyboard.kmn", content: "c My Keyboard\n&name='My Keyboard'\n" },
  { path: "source/my_keyboard.kps", content: "<Package/>\n" },
  { path: "source/my_keyboard.kvks", content: "<KeyboardVisualKeyboard/>\n" },
  {
    path: "source/my_keyboard.keyman-touch-layout",
    content: '{"phone":{"layer":[]}}\n',
  },
  // criteria SS1 (spec §12 line 843): exact "Copyright © <year> <holder>" syntax required.
  { path: "LICENSE.md", content: "Copyright © 2026 Test Contributor\n\nMIT License\n" },
  { path: "HISTORY.md", content: "## 1.0 (2026-06-02)\n* Initial release.\n" },
  { path: "README.md", content: "# My Keyboard\n" },
  { path: "welcome.htm", content: "<html><body>Welcome</body></html>\n" },
  { path: "help/my_keyboard.php", content: "<?php // help ?>\n" },
]);
