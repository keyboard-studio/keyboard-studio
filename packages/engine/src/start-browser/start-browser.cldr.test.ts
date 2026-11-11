// CLDR merge in the start browser (issue #2599, ruling §1/§2a):
// CLDR entries join listAll() after the corpus; the corpus wins on any id
// collision. No network — the corpus tree is a mock fetch.

import { describe, it, expect } from "vitest";
import { createStartBrowser } from "./start-browser.js";
import type { FetchFn } from "./github-api.js";

const TREE_URL =
  "https://api.github.com/repos/keyboard-studio/keyboards/git/trees/master?recursive=1";
const RAW_BASE =
  "https://raw.githubusercontent.com/keyboard-studio/keyboards/master";

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

const KPS_CLDR_DE_WINDOWS = `<?xml version="1.0" encoding="UTF-8"?>
<Package>
  <Info>
    <Name value="German (CLDR Windows)"/>
    <Version value="43.1"/>
  </Info>
  <Keyboards>
    <Keyboard>
      <Name>German (CLDR Windows)</Name>
      <ID>cldr_de</ID>
      <Version>43.1</Version>
      <Languages>
        <Language ID="de" Name="German"/>
      </Languages>
      <Targets>windows macosx linux web mobile tablet</Targets>
    </Keyboard>
  </Keyboards>
</Package>`;

function treeWith(extraKps: string[]): Record<string, unknown> {
  const tree: Array<Record<string, unknown>> = [
    {
      path: "release/b/basic_kbdus/source/basic_kbdus.kps",
      mode: "100644",
      type: "blob",
      sha: "k1",
      url: "",
    },
  ];
  for (const [i, path] of extraKps.entries()) {
    tree.push({ path, mode: "100644", type: "blob", sha: `kx${i}`, url: "" });
  }
  return { sha: "rootsha", url: "", truncated: false, tree };
}

function createMockFetch(extraKps: Record<string, string>): FetchFn {
  return async (url) => {
    const jsonOk = (body: unknown) => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => body,
      text: async () => JSON.stringify(body),
    });
    if (url === TREE_URL) {
      return jsonOk(treeWith(Object.keys(extraKps)));
    }
    if (url.startsWith(`${RAW_BASE}/`)) {
      const path = url.slice(RAW_BASE.length + 1);
      const bodies: Record<string, string> = {
        "release/b/basic_kbdus/source/basic_kbdus.kps": KPS_BASIC_KBDUS,
        ...extraKps,
      };
      const body = bodies[path];
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

describe("createStartBrowser — CLDR merge (#2599)", () => {
  it("listAll appends CLDR starts after the corpus entries", async () => {
    const service = createStartBrowser({ fetch: createMockFetch({}) });
    const keyboards = await service.listAll();
    const de = keyboards.find((k) => k.id === "cldr_de");
    expect(de).toBeDefined();
    expect(de?.origin).toBe("cldr");
    expect(de?.displayName).toBe("German (CLDR Windows)");
    expect(de?.cldr?.desktopFile).toBe("de-t-k0-windows.xml");
    expect(de?.cldr?.androidFile).toBe("de-t-k0-android.xml");
    expect(de?.targets).toContain("mobile");
    expect(de?.languages).toEqual(["de"]);
    expect(keyboards.map((k) => k.id)).toContain("basic_kbdus");
  });

  it("search and getById see CLDR entries", async () => {
    const service = createStartBrowser({ fetch: createMockFetch({}) });
    expect((await service.search("german")).map((k) => k.id)).toContain(
      "cldr_de",
    );
    expect((await service.getById("cldr_de"))?.origin).toBe("cldr");
  });

  it("a corpus keyboard with a cldr_* id wins over the CLDR entry", async () => {
    const service = createStartBrowser({
      fetch: createMockFetch({
        "release/c/cldr_de/source/cldr_de.kps":
          KPS_CLDR_DE_WINDOWS,
      }),
    });
    const keyboards = await service.listAll();
    const matches = keyboards.filter((k) => k.id === "cldr_de");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.origin).not.toBe("cldr");
    expect(matches[0]?.path).toBe("release/c/cldr_de");
  });
});
