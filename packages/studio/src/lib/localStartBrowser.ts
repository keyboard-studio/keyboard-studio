// Dev-only StartBrowserService backed by the localKeyboards Vite plugin
// (see ../../vite-plugins/localKeyboards.ts). Hits /local-kbd-api/list
// to enumerate every keyboard in the sibling keymanapp/keyboards clone.

import type {
  StartBrowserService,
  StartKeyboard,
  KeymanPlatformTarget,
} from "@keyboard-studio/contracts";

const LIST_ENDPOINT = "/local-kbd-api/list";

let _cached: Promise<StartKeyboard[]> | null = null;

async function fetchCatalog(): Promise<StartKeyboard[]> {
  if (_cached !== null) return _cached;
  _cached = (async () => {
    try {
      const r = await fetch(LIST_ENDPOINT);
      if (!r.ok) {
        throw new Error(
          `${LIST_ENDPOINT} returned HTTP ${r.status} — is the local-keyboards Vite plugin loaded?`,
        );
      }
      const data = (await r.json()) as unknown;
      if (!Array.isArray(data)) {
        throw new Error(
          `${LIST_ENDPOINT} returned non-array payload: ${JSON.stringify(data).slice(0, 200)}`,
        );
      }
      return data as StartKeyboard[];
    } catch (err) {
      _cached = null; // allow retry on next call
      throw err;
    }
  })();
  return _cached;
}

export const localStartBrowser: StartBrowserService = {
  async listAll(): Promise<StartKeyboard[]> {
    return fetchCatalog();
  },
  async search(
    query: string,
    opts?: { script?: string; target?: KeymanPlatformTarget },
  ): Promise<StartKeyboard[]> {
    const all = await fetchCatalog();
    const q = query.toLowerCase();
    return all.filter((k) => {
      const matchesQuery =
        q === "" ||
        k.id.toLowerCase().includes(q) ||
        k.displayName.toLowerCase().includes(q);
      const matchesScript = opts?.script === undefined || k.script === opts.script;
      const matchesTarget =
        opts?.target === undefined || k.targets.includes(opts.target);
      return matchesQuery && matchesScript && matchesTarget;
    });
  },
  async getById(id: string): Promise<StartKeyboard | undefined> {
    const all = await fetchCatalog();
    return all.find((k) => k.id === id);
  },
};

/** [SCAFFOLD] Proxy base path that pairs with this dev backend; pass to
 *  fetchKeyboardSourceToVfs's `opts.proxyBase`. */
export const LOCAL_PROXY_BASE = "/local-kbd-proxy";
