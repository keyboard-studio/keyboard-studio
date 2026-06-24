// fetchKeyboardSourceToVfs — regression tests for the loader.
//
// Coverage:
//   1. Required KMW_EMBEDJS sibling, happy path: VFS contains source/<id>_js.txt
//      with the right content; fetch URL uses the proxyBase correctly.
//   2. Required KMW_EMBEDJS sibling missing (404): throws, error names storeName
//      + filename + URL + keyboard id.
//   3. Optional sibling missing (BITMAP / KMW_HELPFILE): does NOT throw; records
//      a warning. Locks the required-vs-optional classification so a future
//      reclassification is a conscious test change.
//
// No network traffic — all fetches use the injected mockFetch.

import { describe, it, expect } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { fetchKeyboardSourceToVfs } from "./fetchKeyboardSourceToVfs.js";
import type { FetchFn } from "./fetchKeyboardSourceToVfs.js";
import type { BaseKeyboard } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Minimal BaseKeyboard for sil_euro_latin. */
const euroLatinKb: BaseKeyboard = {
  id: "sil_euro_latin",
  path: "release/sil/sil_euro_latin",
  script: "Latn",
  targets: ["windows"],
  displayName: "EuroLatin",
  version: "1.0",
};

/** .kmn with a KMW_EMBEDJS store declared in the header. */
const kmnWithEmbedJs = `c EuroLatin header
store(&KMW_EMBEDJS) 'sil_euro_latin_js.txt'
begin Unicode > use(main)
group(main) using keys
`;

/** .kmn with BITMAP (optional) and KMW_HELPFILE (optional) in the header. */
const kmnWithOptionalSiblings = `c Optional siblings
store(&BITMAP) 'sil_euro_latin.ico'
store(&KMW_HELPFILE) 'help.htm'
begin Unicode > use(main)
group(main) using keys
`;

/** .kmn with no sibling stores. */
const kmnMinimal = `c Minimal keyboard
begin Unicode > use(main)
group(main) using keys
`;

const PROXY = "https://raw-proxy.example";

/** Build a proxyBase URL prefix for the keyboard's source dir. */
function sourceUrl(kb: BaseKeyboard, file: string): string {
  return `${PROXY}/${kb.path}/source/${file}`;
}

/**
 * Build a mock FetchFn from a URL→response map.
 * Returns 404 for any URL not in the map.
 * Records every URL fetched into the `calls` array for inspection.
 */
function makeMockFetch(
  responses: Record<string, { ok: boolean; status: number; body: string | Uint8Array }>,
): { fetchImpl: FetchFn; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl: FetchFn = async (url: string) => {
    calls.push(url);
    const entry = responses[url];
    if (entry === undefined || !entry.ok) {
      const status = entry?.status ?? 404;
      return {
        ok: false,
        status,
        text: () => Promise.resolve(""),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      };
    }
    const body = entry.body;
    const bodyStr = typeof body === "string" ? body : new TextDecoder().decode(body);
    const bodyBytes: ArrayBuffer =
      typeof body === "string"
        ? new TextEncoder().encode(body).buffer
        : body.buffer;
    return {
      ok: true,
      status: 200,
      text: () => Promise.resolve(bodyStr),
      arrayBuffer: () => Promise.resolve(bodyBytes),
    };
  };
  return { fetchImpl, calls };
}

// ---------------------------------------------------------------------------
// Test 1: required KMW_EMBEDJS sibling — happy path
// ---------------------------------------------------------------------------

describe("fetchKeyboardSourceToVfs — required KMW_EMBEDJS sibling (happy path)", () => {
  it("writes sibling to VFS at source/<file> with correct content", async () => {
    const jsContent = "// KMW embed JS for sil_euro_latin\n";
    const { fetchImpl, calls } = makeMockFetch({
      // .kmn (text, required)
      [sourceUrl(euroLatinKb, "sil_euro_latin.kmn")]: {
        ok: true,
        status: 200,
        body: kmnWithEmbedJs,
      },
      // KMW_EMBEDJS sibling (text, .txt extension)
      [sourceUrl(euroLatinKb, "sil_euro_latin_js.txt")]: {
        ok: true,
        status: 200,
        body: jsContent,
      },
      // .kps (optional — 404 so no font work)
      [sourceUrl(euroLatinKb, "sil_euro_latin.kps")]: { ok: false, status: 404, body: "" },
      // .kpj (optional — 404)
      [`${PROXY}/${euroLatinKb.path}/sil_euro_latin.kpj`]: { ok: false, status: 404, body: "" },
    });

    const vfs = createVirtualFS();
    const result = await fetchKeyboardSourceToVfs(euroLatinKb, vfs, {
      proxyBase: PROXY,
      fetchImpl,
    });

    // VFS must have the sibling at source/sil_euro_latin_js.txt.
    const entry = vfs.get("source/sil_euro_latin_js.txt");
    expect(entry).toBeDefined();
    expect(entry!.content).toBe(jsContent);

    // filesLoaded must mention the sibling path.
    expect(result.filesLoaded).toContain("source/sil_euro_latin_js.txt");

    // The URL used to fetch the sibling must be the correctly-constructed
    // proxyBase/.../source/<file> form (not a default /kbd-proxy/ URL).
    const siblingUrl = sourceUrl(euroLatinKb, "sil_euro_latin_js.txt");
    expect(calls).toContain(siblingUrl);

    // No warnings about KMW_EMBEDJS (it was found).
    const embedJsWarn = result.warnings.find((w) => w.includes("KMW_EMBEDJS"));
    expect(embedJsWarn).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Test 2: required KMW_EMBEDJS sibling — 404 (required missing → throw)
// ---------------------------------------------------------------------------

describe("fetchKeyboardSourceToVfs — required KMW_EMBEDJS sibling missing", () => {
  it("throws with storeName, filename, URL, and keyboard id in the error message", async () => {
    const { fetchImpl } = makeMockFetch({
      [sourceUrl(euroLatinKb, "sil_euro_latin.kmn")]: {
        ok: true,
        status: 200,
        body: kmnWithEmbedJs,
      },
      // KMW_EMBEDJS sibling returns 404.
      [sourceUrl(euroLatinKb, "sil_euro_latin_js.txt")]: { ok: false, status: 404, body: "" },
      [sourceUrl(euroLatinKb, "sil_euro_latin.kps")]: { ok: false, status: 404, body: "" },
      [`${PROXY}/${euroLatinKb.path}/sil_euro_latin.kpj`]: { ok: false, status: 404, body: "" },
    });

    const vfs = createVirtualFS();
    // Single invocation: capture the rejection, then assert every field the
    // error must name. Resolving instead of rejecting fails the test with a
    // clear message.
    const error = await fetchKeyboardSourceToVfs(euroLatinKb, vfs, {
      proxyBase: PROXY,
      fetchImpl,
    }).then(
      () => {
        throw new Error(
          "expected fetchKeyboardSourceToVfs to reject for a missing required sibling, but it resolved",
        );
      },
      (e: unknown) => e as Error,
    );

    const thrownMessage = error.message;
    // The error must name: storeName, filename, URL, and keyboard id.
    expect(thrownMessage).toContain("KMW_EMBEDJS");
    expect(thrownMessage).toContain("sil_euro_latin_js.txt");
    expect(thrownMessage).toContain(sourceUrl(euroLatinKb, "sil_euro_latin_js.txt"));
    // AC#3: keyboard id must appear in the error.
    expect(thrownMessage).toContain("sil_euro_latin");
  });
});

// ---------------------------------------------------------------------------
// Test 3: optional siblings missing — no throw, warns instead
// Locks: BITMAP and KMW_HELPFILE are optional (required=false in parseKmnHeaderStores).
// A future reclassification to required would turn this test red (intentional).
// ---------------------------------------------------------------------------

describe("fetchKeyboardSourceToVfs — optional siblings missing (BITMAP / KMW_HELPFILE)", () => {
  it("does NOT throw and records warnings for each missing optional sibling", async () => {
    const { fetchImpl } = makeMockFetch({
      [sourceUrl(euroLatinKb, "sil_euro_latin.kmn")]: {
        ok: true,
        status: 200,
        body: kmnWithOptionalSiblings,
      },
      // BITMAP → 404
      [sourceUrl(euroLatinKb, "sil_euro_latin.ico")]: { ok: false, status: 404, body: "" },
      // KMW_HELPFILE → 404
      [sourceUrl(euroLatinKb, "help.htm")]: { ok: false, status: 404, body: "" },
      [sourceUrl(euroLatinKb, "sil_euro_latin.kps")]: { ok: false, status: 404, body: "" },
      [`${PROXY}/${euroLatinKb.path}/sil_euro_latin.kpj`]: { ok: false, status: 404, body: "" },
    });

    const vfs = createVirtualFS();
    // Must resolve (not throw) even though both optional siblings are missing.
    const result = await fetchKeyboardSourceToVfs(euroLatinKb, vfs, {
      proxyBase: PROXY,
      fetchImpl,
    });

    // At least one warning mentions BITMAP.
    const bitmapWarn = result.warnings.find((w) => w.includes("BITMAP"));
    expect(bitmapWarn).toBeDefined();

    // At least one warning mentions KMW_HELPFILE.
    const helpWarn = result.warnings.find((w) => w.includes("KMW_HELPFILE"));
    expect(helpWarn).toBeDefined();

    // The VFS must NOT contain these files (they were absent — not silently empty).
    expect(vfs.get("source/sil_euro_latin.ico")).toBeUndefined();
    expect(vfs.get("source/help.htm")).toBeUndefined();
  });

  it("BITMAP required=false is locked (regression guard for classification drift)", async () => {
    // This test exists purely to make a future reclassification of BITMAP to
    // required a deliberate, test-breaking change. It mirrors the happy-path
    // test above but explicitly asserts the no-throw outcome for BITMAP.
    const { fetchImpl } = makeMockFetch({
      [sourceUrl(euroLatinKb, "sil_euro_latin.kmn")]: {
        ok: true,
        status: 200,
        body: `c kb\nstore(&BITMAP) 'sil_euro_latin.ico'\nbegin Unicode > use(main)\ngroup(main) using keys\n`,
      },
      [sourceUrl(euroLatinKb, "sil_euro_latin.ico")]: { ok: false, status: 404, body: "" },
      [sourceUrl(euroLatinKb, "sil_euro_latin.kps")]: { ok: false, status: 404, body: "" },
      [`${PROXY}/${euroLatinKb.path}/sil_euro_latin.kpj`]: { ok: false, status: 404, body: "" },
    });

    const vfs = createVirtualFS();
    await expect(
      fetchKeyboardSourceToVfs(euroLatinKb, vfs, { proxyBase: PROXY, fetchImpl }),
    ).resolves.not.toThrow();
  });

  it("KMW_HELPFILE required=false is locked (regression guard for classification drift)", async () => {
    const { fetchImpl } = makeMockFetch({
      [sourceUrl(euroLatinKb, "sil_euro_latin.kmn")]: {
        ok: true,
        status: 200,
        body: `c kb\nstore(&KMW_HELPFILE) 'help.htm'\nbegin Unicode > use(main)\ngroup(main) using keys\n`,
      },
      [sourceUrl(euroLatinKb, "help.htm")]: { ok: false, status: 404, body: "" },
      [sourceUrl(euroLatinKb, "sil_euro_latin.kps")]: { ok: false, status: 404, body: "" },
      [`${PROXY}/${euroLatinKb.path}/sil_euro_latin.kpj`]: { ok: false, status: 404, body: "" },
    });

    const vfs = createVirtualFS();
    await expect(
      fetchKeyboardSourceToVfs(euroLatinKb, vfs, { proxyBase: PROXY, fetchImpl }),
    ).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Test 4: proxyBase is used in the .kmn fetch URL (regression guard: dropping
// the proxyBase option falls back to the default /kbd-proxy prefix, which must
// turn this test red).
// ---------------------------------------------------------------------------

describe("fetchKeyboardSourceToVfs — proxyBase pass-through", () => {
  it("uses the supplied proxyBase for the .kmn fetch, not the default /kbd-proxy", async () => {
    const CUSTOM_PROXY = "https://custom.proxy.example";
    const customSourceUrl = (file: string) =>
      `${CUSTOM_PROXY}/${euroLatinKb.path}/source/${file}`;

    const { fetchImpl, calls } = makeMockFetch({
      [customSourceUrl("sil_euro_latin.kmn")]: {
        ok: true,
        status: 200,
        body: kmnMinimal,
      },
      [customSourceUrl("sil_euro_latin.kps")]: { ok: false, status: 404, body: "" },
      [`${CUSTOM_PROXY}/${euroLatinKb.path}/sil_euro_latin.kpj`]: {
        ok: false,
        status: 404,
        body: "",
      },
    });

    const vfs = createVirtualFS();
    await fetchKeyboardSourceToVfs(euroLatinKb, vfs, {
      proxyBase: CUSTOM_PROXY,
      fetchImpl,
    });

    // All fetch calls must start with the custom proxy.
    expect(calls.length).toBeGreaterThan(0);
    for (const url of calls) {
      expect(url).toMatch(new RegExp(`^${CUSTOM_PROXY}/`));
    }

    // The .kmn itself must have been fetched from the correct URL.
    expect(calls).toContain(customSourceUrl("sil_euro_latin.kmn"));
  });
});
