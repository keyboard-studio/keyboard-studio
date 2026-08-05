// Tier-scope guardrail: the base catalogue is `release/` ONLY.
//
// WHY THIS IS A COMPLIANCE BOUNDARY, NOT A PREFERENCE
// ---------------------------------------------------
// Per keyman.com's repository policy, "keyboards in legacy can only be put in
// release if we get permission from the author to change to the MIT license."
// A keyboard offered as an authoring BASE is copied and redistributed under the
// derived keyboard's MIT LICENSE.md, so offering a `legacy/` keyboard as a base
// would relicense someone else's work without that permission.
//
// Evidence that legacy is genuinely unlicensed for this purpose: of 554 keyboard
// folders under `legacy/` in keymanapp/keyboards, only 9 carry a LICENSE.md at
// all. The remaining ~545 state no license terms.
//
// Today that boundary holds only because KPS_PATH_RE in base-browser.ts is
// anchored to `^release/`. That is scope, not an explicit check — nothing
// records WHY, so widening the crawler would silently remove the guard. This
// spec pins the behaviour and the reason together.
//
// `experimental/` is excluded by the same regex. That exclusion is a product
// decision (unproven keyboards, PUA permitted) rather than a licensing one, and
// is asserted here so a future change to either tier has to be deliberate.

import { describe, it, expect } from "vitest";
import { createBaseBrowser } from "./base-browser.js";
import type { FetchFn } from "./github-api.js";

const TREE_URL =
  "https://api.github.com/repos/keyboard-studio/keyboards/git/trees/master?recursive=1";
const RAW_BASE = "https://raw.githubusercontent.com/keyboard-studio/keyboards/master";

function kps(id: string, name: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Package>
  <Info>
    <Name value="${name}"/>
    <Version value="1.0"/>
  </Info>
  <Keyboards>
    <Keyboard>
      <Name>${name}</Name>
      <ID>${id}</ID>
      <Version>1.0</Version>
      <Languages>
        <Language ID="en-Latn" Name="English"/>
      </Languages>
      <Targets>windows macosx linux web</Targets>
    </Keyboard>
  </Keyboards>
</Package>`;
}

/** One .kps in each tier, all following the <group>/<id>/<id>.kps convention. */
const RELEASE_KPS = "release/b/basic_kbdus/basic_kbdus.kps";
// A crawled release keyboard that is NOT the always-injected offline fallback,
// so the positive assertion proves the crawl ran rather than the fallback firing.
const RELEASE_KPS_CRAWLED = "release/s/sil_euro_latin/sil_euro_latin.kps";
const LEGACY_KPS = "legacy/j/japanese/japanese.kps";
const EXPERIMENTAL_KPS = "experimental/f/foo_draft/foo_draft.kps";

// Every tier's .kps is SERVED successfully. This matters: if only the release
// bodies were mocked, legacy could be absent merely because its fetch 404'd. By
// serving all of them, absence can only be the path filter.
const KPS_BODIES: Record<string, string> = {
  [RELEASE_KPS]: kps("basic_kbdus", "US English (Basic)"),
  [RELEASE_KPS_CRAWLED]: kps("sil_euro_latin", "SIL Euro Latin"),
  [LEGACY_KPS]: kps("japanese", "Japanese (Legacy)"),
  [EXPERIMENTAL_KPS]: kps("foo_draft", "Foo Draft"),
};

function blob(path: string) {
  return { path, mode: "100644", type: "blob" as const, sha: "f".repeat(40), size: 512, url: "" };
}

const TREE = {
  sha: "abc1234567890abcdef1234567890abcdef12345",
  url: "",
  truncated: false,
  tree: [
    blob("README.md"),
    blob(RELEASE_KPS),
    blob("release/b/basic_kbdus/basic_kbdus.kmn"),
    blob(RELEASE_KPS_CRAWLED),
    blob("release/s/sil_euro_latin/sil_euro_latin.kmn"),
    blob(LEGACY_KPS),
    blob("legacy/j/japanese/japanese.kmn"),
    blob(EXPERIMENTAL_KPS),
    blob("experimental/f/foo_draft/foo_draft.kmn"),
  ],
};

function fixtureFetch(): FetchFn {
  return async (url) => {
    if (url === TREE_URL) {
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => TREE,
        text: async () => JSON.stringify(TREE),
      };
    }
    if (url.startsWith(RAW_BASE + "/")) {
      const path = url.slice(RAW_BASE.length + 1);
      const body = KPS_BODIES[path];
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

describe("base-browser tier scope — release/ only", () => {
  it("offers a crawled release/ keyboard (proves the crawl ran, not just the fallback)", async () => {
    const browser = createBaseBrowser({ fetch: fixtureFetch() });
    const list = await browser.listAll();
    // basic_kbdus is injected offline regardless, so assert on the OTHER one.
    expect(list.map((k) => k.id)).toContain("sil_euro_latin");
  });

  // The compliance assertion. ~545 of 554 legacy keyboards carry no LICENSE.md,
  // and relicensing them as MIT requires the original author's permission, so
  // they must never be offered as a copyable base.
  it("NEVER offers a legacy/ keyboard as a base, even when its .kps parses fine", async () => {
    const browser = createBaseBrowser({ fetch: fixtureFetch() });
    const list = await browser.listAll();

    expect(
      list.map((k) => k.id),
      "a legacy/ keyboard reached the base catalogue — copying it would relicense " +
        "the original author's work as MIT without their permission",
    ).not.toContain("japanese");
  });

  it("does not offer an experimental/ keyboard as a base", async () => {
    const browser = createBaseBrowser({ fetch: fixtureFetch() });
    const list = await browser.listAll();
    expect(list.map((k) => k.id)).not.toContain("foo_draft");
  });

  // BaseKeyboard.path is documented "Always under release/" (contracts/baseKeyboard.ts).
  // This makes that documented invariant executable.
  it("every catalogue entry resolves under release/", async () => {
    const browser = createBaseBrowser({ fetch: fixtureFetch() });
    const list = await browser.listAll();
    expect(list.length).toBeGreaterThan(0);
    for (const k of list) {
      expect(k.path.startsWith("release/"), `base "${k.id}" path: ${k.path}`).toBe(true);
    }
  });

  // search() is a second entry point into the catalogue; a filter applied only
  // in listAll() would leave this one open.
  it("search() cannot surface a legacy/ keyboard either", async () => {
    const browser = createBaseBrowser({ fetch: fixtureFetch() });
    const hits = await browser.search("japanese");
    expect(hits.map((k) => k.id)).not.toContain("japanese");
    for (const k of hits) {
      expect(k.path.startsWith("release/"), `search hit "${k.id}" path: ${k.path}`).toBe(true);
    }
  });
});
