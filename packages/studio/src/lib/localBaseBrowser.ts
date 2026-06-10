// Dev-only BaseBrowserService backed by the localKeyboards Vite plugin
// (see ../../vite-plugins/localKeyboards.ts). Hits /local-kbd-api/list
// to enumerate every keyboard in the sibling keymanapp/keyboards clone.

import type {
  BaseBrowserService,
  BaseKeyboard,
  KeymanPlatformTarget,
} from "@keyboard-studio/contracts";

const LIST_ENDPOINT = "/local-kbd-api/list";

let _cached: Promise<BaseKeyboard[]> | null = null;

async function fetchCatalog(): Promise<BaseKeyboard[]> {
  if (_cached !== null) return _cached;
  _cached = (async () => {
    const r = await fetch(LIST_ENDPOINT);
    if (!r.ok) {
      _cached = null; // allow retry on next call
      throw new Error(
        `${LIST_ENDPOINT} returned HTTP ${r.status} — is the local-keyboards Vite plugin loaded?`,
      );
    }
    const data = (await r.json()) as unknown;
    if (!Array.isArray(data)) {
      _cached = null;
      throw new Error(
        `${LIST_ENDPOINT} returned non-array payload: ${JSON.stringify(data).slice(0, 200)}`,
      );
    }
    return data as BaseKeyboard[];
  })();
  return _cached;
}

export const localBaseBrowser: BaseBrowserService = {
  async listAll(): Promise<BaseKeyboard[]> {
    return fetchCatalog();
  },
  async search(
    query: string,
    opts?: { script?: string; target?: KeymanPlatformTarget },
  ): Promise<BaseKeyboard[]> {
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
  async getById(id: string): Promise<BaseKeyboard | undefined> {
    const all = await fetchCatalog();
    return all.find((k) => k.id === id);
  },
};

/** [SCAFFOLD] Proxy base path that pairs with this dev backend; pass to
 *  fetchKeyboardSourceToVfs's `opts.proxyBase`. */
export const LOCAL_PROXY_BASE = "/local-kbd-proxy";
