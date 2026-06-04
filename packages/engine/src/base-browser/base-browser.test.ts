import { describe, it, expect } from "vitest";
import { createBaseBrowser } from "./base-browser.js";
import type { FetchFn } from "./github-api.js";
import treeFixture from "./__fixtures__/tree-response.json";

// ---------------------------------------------------------------------------
// Fixture KPS XML strings — mirror the tree fixture keyboard IDs/paths
// ---------------------------------------------------------------------------

const KPS_BASIC_KBDUS = `<?xml version="1.0" encoding="UTF-8"?>
<Package>
  <Info>
    <Name value="US English (Basic)"/>
    <Version value="1.0"/>
  </Info>
  <Keyboards>
    <Keyboard>
      <Name>US English (Basic)</Name>
      <ID>basic_kbdus</ID>
      <Version>1.0</Version>
      <Languages>
        <Language ID="en-Latn" Name="English"/>
      </Languages>
      <Targets>windows macosx linux web</Targets>
    </Keyboard>
  </Keyboards>
</Package>`;

const KPS_SIL_EURO_LATIN = `<?xml version="1.0" encoding="UTF-8"?>
<Package>
  <Info>
    <Name value="SIL Euro Latin"/>
    <Version value="1.1"/>
  </Info>
  <Keyboards>
    <Keyboard>
      <Name>SIL Euro Latin</Name>
      <ID>sil_euro_latin</ID>
      <Version>1.1</Version>
      <Languages>
        <Language ID="en-Latn-001" Name="English (World)"/>
        <Language ID="fr-Latn-FR" Name="French (France)"/>
      </Languages>
      <Targets>windows macosx linux web</Targets>
    </Keyboard>
  </Keyboards>
</Package>`;

const KPS_SIL_DEVANAGARI = `<?xml version="1.0" encoding="UTF-8"?>
<Package>
  <Info>
    <Name value="SIL Devanagari Phonetic"/>
    <Version value="2.0"/>
  </Info>
  <Keyboards>
    <Keyboard>
      <Name>SIL Devanagari Phonetic</Name>
      <ID>sil_devanagari_phonetic</ID>
      <Version>2.0</Version>
      <Languages>
        <Language ID="hi-Deva" Name="Hindi"/>
        <Language ID="ne-Deva" Name="Nepali"/>
      </Languages>
      <Targets>windows macosx linux web mobile tablet</Targets>
    </Keyboard>
  </Keyboards>
</Package>`;

// ---------------------------------------------------------------------------
// Mock fetch factory
// ---------------------------------------------------------------------------

const TREE_URL =
  "https://api.github.com/repos/keymanapp/keyboards/git/trees/master?recursive=1";
const RAW_BASE =
  "https://raw.githubusercontent.com/keymanapp/keyboards/master";

const KPS_RESPONSES: Record<string, string> = {
  "release/b/basic_kbdus/basic_kbdus.kps": KPS_BASIC_KBDUS,
  "release/s/sil_euro_latin/sil_euro_latin.kps": KPS_SIL_EURO_LATIN,
  "release/s/sil_devanagari_phonetic/sil_devanagari_phonetic.kps":
    KPS_SIL_DEVANAGARI,
};

function createFixtureFetch(): FetchFn {
  return async (url) => {
    if (url === TREE_URL) {
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => treeFixture,
        text: async () => JSON.stringify(treeFixture),
      };
    }
    if (url.startsWith(RAW_BASE + "/")) {
      const path = url.slice(RAW_BASE.length + 1);
      const body = KPS_RESPONSES[path];
      if (body !== undefined) {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({}),
          text: async () => body,
        };
      }
    }
    return {
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: async () => ({}),
      text: async () => "",
    };
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createBaseBrowser", () => {
  it("listAll returns keyboards from API, sorted by id ascending", async () => {
    const service = createBaseBrowser({ fetch: createFixtureFetch() });
    const keyboards = await service.listAll();

    const ids = keyboards.map((k) => k.id);
    expect(ids).toContain("basic_kbdus");
    expect(ids).toContain("sil_euro_latin");
    expect(ids).toContain("sil_devanagari_phonetic");

    const sorted = [...ids].sort((a, b) => a.localeCompare(b));
    expect(ids).toEqual(sorted);
  });

  it("listAll parses metadata correctly from .kps files", async () => {
    const service = createBaseBrowser({ fetch: createFixtureFetch() });
    const keyboards = await service.listAll();

    const kbdus = keyboards.find((k) => k.id === "basic_kbdus");
    expect(kbdus?.displayName).toBe("US English (Basic)");
    expect(kbdus?.version).toBe("1.0");
    expect(kbdus?.script).toBe("Latn");
    expect(kbdus?.targets).toContain("windows");
    expect(kbdus?.targets).toContain("web");

    const deva = keyboards.find((k) => k.id === "sil_devanagari_phonetic");
    expect(deva?.script).toBe("Deva");
    expect(deva?.targets).toContain("mobile");
    expect(deva?.targets).toContain("tablet");
    expect(deva?.version).toBe("2.0");
  });

  it("listAll sets correct path and sourceUrl from tree paths", async () => {
    const service = createBaseBrowser({ fetch: createFixtureFetch() });
    const keyboards = await service.listAll();

    const kb = keyboards.find((k) => k.id === "sil_euro_latin");
    expect(kb?.path).toBe("release/s/sil_euro_latin");
    expect(kb?.sourceUrl).toBe(
      "https://github.com/keymanapp/keyboards/tree/master/release/s/sil_euro_latin"
    );
  });

  it("listAll always includes offline fallback even when already in API results", async () => {
    const service = createBaseBrowser({ fetch: createFixtureFetch() });
    const keyboards = await service.listAll();

    const matches = keyboards.filter((k) => k.id === "basic_kbdus");
    expect(matches).toHaveLength(1);
  });

  it("listAll falls back to offline bundle when API call throws", async () => {
    const errorFetch: FetchFn = async () => {
      throw new Error("Network unavailable");
    };
    const service = createBaseBrowser({ fetch: errorFetch });
    const keyboards = await service.listAll();

    expect(keyboards).toHaveLength(1);
    expect(keyboards[0]!.id).toBe("basic_kbdus");
  });

  it("listAll falls back to offline bundle on non-200 API response", async () => {
    const rateLimitFetch: FetchFn = async () => ({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      json: async () => ({}),
      text: async () => "",
    });
    const service = createBaseBrowser({ fetch: rateLimitFetch });
    const keyboards = await service.listAll();

    expect(keyboards).toHaveLength(1);
    expect(keyboards[0]!.id).toBe("basic_kbdus");
  });

  it("listAll returns cached result on second call (no additional fetch calls)", async () => {
    let callCount = 0;
    const fixtureBase = createFixtureFetch();
    const countingFetch: FetchFn = async (url, init) => {
      callCount++;
      return fixtureBase(url, init);
    };

    const service = createBaseBrowser({ fetch: countingFetch });
    await service.listAll();
    const afterFirst = callCount;

    await service.listAll();
    expect(callCount).toBe(afterFirst);
  });

  it("getById returns the matching keyboard with correct metadata", async () => {
    const service = createBaseBrowser({ fetch: createFixtureFetch() });

    const kb = await service.getById("sil_euro_latin");
    expect(kb).toBeDefined();
    expect(kb?.displayName).toBe("SIL Euro Latin");
    expect(kb?.version).toBe("1.1");
    expect(kb?.script).toBe("Latn");
    expect(kb?.path).toBe("release/s/sil_euro_latin");
  });

  it("getById returns undefined for an unknown id", async () => {
    const service = createBaseBrowser({ fetch: createFixtureFetch() });

    const kb = await service.getById("nonexistent_keyboard_xyz");
    expect(kb).toBeUndefined();
  });

  it("search returns all keyboards for empty query", async () => {
    const service = createBaseBrowser({ fetch: createFixtureFetch() });

    const all = await service.listAll();
    const searchAll = await service.search("");
    expect(searchAll).toHaveLength(all.length);
  });

  it("search filters by id substring case-insensitively", async () => {
    const service = createBaseBrowser({ fetch: createFixtureFetch() });

    const results = await service.search("DEVANAGARI");
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe("sil_devanagari_phonetic");
  });

  it("search filters by displayName substring", async () => {
    const service = createBaseBrowser({ fetch: createFixtureFetch() });

    const results = await service.search("Euro Latin");
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe("sil_euro_latin");
  });

  it("search returns empty array when no match", async () => {
    const service = createBaseBrowser({ fetch: createFixtureFetch() });

    const results = await service.search("xxxxxxnotfound");
    expect(results).toHaveLength(0);
  });

  it("search filters by script", async () => {
    const service = createBaseBrowser({ fetch: createFixtureFetch() });

    const devaResults = await service.search("", { script: "Deva" });
    expect(devaResults.length).toBeGreaterThanOrEqual(1);
    for (const kb of devaResults) {
      expect(kb.script).toBe("Deva");
    }

    const latinResults = await service.search("", { script: "Latn" });
    for (const kb of latinResults) {
      expect(kb.script).toBe("Latn");
    }
  });

  it("search filters by target platform", async () => {
    const service = createBaseBrowser({ fetch: createFixtureFetch() });

    const mobileResults = await service.search("", { target: "mobile" });
    expect(mobileResults.length).toBeGreaterThanOrEqual(1);
    for (const kb of mobileResults) {
      expect(kb.targets).toContain("mobile");
    }
  });

  it("search returns results sorted by id", async () => {
    const service = createBaseBrowser({ fetch: createFixtureFetch() });

    const results = await service.search("sil");
    const ids = results.map((k) => k.id);
    const sorted = [...ids].sort((a, b) => a.localeCompare(b));
    expect(ids).toEqual(sorted);
  });

  it("passes Authorization header when token is configured", async () => {
    const capturedHeaders: Array<Record<string, string>> = [];
    const fixtureBase = createFixtureFetch();
    const captureFetch: FetchFn = async (url, init) => {
      if (init?.headers) capturedHeaders.push(init.headers);
      return fixtureBase(url, init);
    };

    const service = createBaseBrowser({
      fetch: captureFetch,
      token: "ghp_test_token_abc",
    });
    await service.listAll();

    const treeHeaders = capturedHeaders[0];
    expect(treeHeaders?.["Authorization"]).toBe("Bearer ghp_test_token_abc");
  });

  it("does not include Authorization header when no token provided", async () => {
    const capturedHeaders: Array<Record<string, string>> = [];
    const fixtureBase = createFixtureFetch();
    const captureFetch: FetchFn = async (url, init) => {
      if (init?.headers) capturedHeaders.push(init.headers);
      return fixtureBase(url, init);
    };

    const service = createBaseBrowser({ fetch: captureFetch });
    await service.listAll();

    const treeHeaders = capturedHeaders[0];
    expect(treeHeaders?.["Authorization"]).toBeUndefined();
  });
});
