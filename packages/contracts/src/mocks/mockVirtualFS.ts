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
    set(path: string, content: Uint8Array | string, isBinary = false): void {
      store.set(path, { path, content, isBinary });
    },
    delete(path: string): boolean {
      return store.delete(path);
    },
    list(prefix?: string): string[] {
      const keys = [...store.keys()];
      if (prefix === undefined) return keys;
      return keys.filter((k) => k.startsWith(prefix));
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
  { path: "LICENSE.md", content: "MIT License\n" },
  { path: "HISTORY.md", content: "## 1.0 (2026-06-02)\n* Initial release.\n" },
  { path: "README.md", content: "# My Keyboard\n" },
  { path: "welcome.htm", content: "<html><body>Welcome</body></html>\n" },
  { path: "help/my_keyboard.php", content: "<?php // help ?>\n" },
]);
