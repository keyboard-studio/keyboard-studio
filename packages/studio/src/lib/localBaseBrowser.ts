// BaseBrowserService implementation backed by the Vite local-keyboards
// dev plugin (see ../../vite-plugins/localKeyboards.ts). Hits
// /local-kbd-api/list to enumerate every keyboard in the sibling
// keymanapp/keyboards clone, parsed once per dev-server lifetime.
//
// Pair with `proxyBase: "/local-kbd-proxy"` on fetchKeyboardSourceToVfs
// to read source files directly from the same local clone — no GitHub
// roundtrip.
//
// The mock backend at @keyboard-studio/contracts/mocks#mockBaseBrowser
// remains for tests + air-gapped runs.

import type { BaseBrowserService, BaseKeyboard } from "@keyboard-studio/contracts";

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
  async search(query, opts) {
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
  async getById(id) {
    const all = await fetchCatalog();
    return all.find((k) => k.id === id);
  },
};

/** Proxy base path that pairs with this backend; pass to
 *  fetchKeyboardSourceToVfs's `opts.proxyBase`. */
export const LOCAL_PROXY_BASE = "/local-kbd-proxy";
