/**
 * Tests for the opt-in live exemplar refresh (#1367).
 *
 * All network access is a mock fetch injected at the loader seam — the same
 * seam the loader tests use. The pinned side runs against the REAL committed
 * index (ewo has both CLDR and SLDR sides; ebk is SLDR-only), so the
 * override's interaction with precedence and SLDR retention is exercised
 * against actual data, not a restated fixture.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { refreshExemplars } from "./exemplarRefresh.js";
import { loadExemplarSource, sourceExemplars, sourceExemplarsBoth } from "./exemplarSource.js";
import { clearExemplarOverrides } from "./exemplarIndex.js";
import { neededCharsForLanguage } from "./suggestMissing.js";

function jsonResponse(payload: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
    arrayBuffer: async () => new ArrayBuffer(0),
    headers: new Headers(),
    redirected: false,
    statusText: ok ? "OK" : "Not Found",
    type: "basic",
    url: "",
    clone: function () {
      return this as unknown as Response;
    },
    body: null,
  } as unknown as Response;
}

const TAGS_NEWER = [{ name: "49.0.0-ALPHA2" }, { name: "48.2.1" }, { name: "48.2.0" }, { name: "46.1.0" }];
const TAGS_CURRENT = [{ name: "48.2.0" }, { name: "46.1.0" }];

function charactersPayload(locale: string, main: string, auxiliary?: string): unknown {
  return {
    main: {
      [locale]: {
        characters: {
          exemplarCharacters: main,
          ...(auxiliary !== undefined ? { auxiliary } : {}),
        },
      },
    },
  };
}

/** A fetch that serves the tag list and one locale's characters at 48.2.1; 404 elsewhere. */
function makeFetch(tags: unknown, chars: Map<string, unknown>): typeof fetch {
  return vi.fn(async (input: unknown) => {
    const url = String(input);
    if (url.includes("api.github.com")) return jsonResponse(tags);
    for (const [locale, payload] of chars) {
      if (url.includes(`/48.2.1/`) && url.includes(`/${locale}/characters.json`)) {
        return jsonResponse(payload);
      }
    }
    return jsonResponse({}, false, 404);
  }) as unknown as typeof fetch;
}

beforeAll(async () => {
  await loadExemplarSource();
});

afterEach(() => {
  clearExemplarOverrides();
});

describe("refreshExemplars", () => {
  it("installs newer data inside the single path, stamped live with its release", async () => {
    const fetchImpl = makeFetch(
      TAGS_NEWER,
      new Map([["ewo", charactersPayload("ewo", "[a b c q]", "[z]")]]),
    );
    const result = await refreshExemplars("ewo", fetchImpl);
    expect(result.kind).toBe("updated");
    if (result.kind !== "updated") return;
    expect(result.version).toBe("48.2.1");
    expect(result.inventory.live).toBe(true);
    expect(result.inventory.release).toBe("48.2.1");
    expect(result.inventory.source).toBe("cldr");
    expect(result.inventory.characters.map((c) => c.char)).toContain("q");

    // FR-015: the same refreshed inventory is what every consumer of the
    // single path now resolves — not a side channel for one surface.
    const viaPath = sourceExemplars("ewo");
    expect(viaPath?.live).toBe(true);
    expect(viaPath?.release).toBe("48.2.1");
    // suggestMissing's needed-chars consumer reads the same path: the
    // refreshed-only character "q" is now a needed char for ewo.
    const needed = await neededCharsForLanguage({ bcp47: "ewo" });
    expect(needed?.has("q")).toBe(true);
  });

  it("retains the pinned SLDR side under a refreshed CLDR side (union still works)", async () => {
    const fetchImpl = makeFetch(
      TAGS_NEWER,
      new Map([["ewo", charactersPayload("ewo", "[a b c]")]]),
    );
    const result = await refreshExemplars("ewo", fetchImpl);
    expect(result.kind).toBe("updated");
    const both = sourceExemplarsBoth("ewo");
    expect(both?.cldr?.live).toBe(true);
    expect(both?.sldr).not.toBeNull();
    expect(both?.sldr?.live).toBeUndefined();
  });

  it("reports already-current and fetches no locale data when the newest stable is the pin", async () => {
    const fetchImpl = makeFetch(TAGS_CURRENT, new Map());
    const result = await refreshExemplars("ewo", fetchImpl);
    expect(result).toEqual({ kind: "already-current", version: "48.2.0" });
    const urls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) =>
      String(c[0]),
    );
    expect(urls.some((u: string) => u.includes("characters.json"))).toBe(false);
    expect(sourceExemplars("ewo")?.live).toBeUndefined();
  });

  it("never resolves a pre-release tag as the refresh target", async () => {
    const fetchImpl = makeFetch(
      [{ name: "49.0.0-ALPHA2" }, { name: "48.2.0" }],
      new Map(),
    );
    const result = await refreshExemplars("ewo", fetchImpl);
    expect(result.kind).toBe("already-current");
  });

  it("reports not-covered when the newer release lacks the language, pinned data intact", async () => {
    const fetchImpl = makeFetch(TAGS_NEWER, new Map());
    const result = await refreshExemplars("ewo", fetchImpl);
    expect(result).toEqual({ kind: "not-covered", version: "48.2.1" });
    const inv = sourceExemplars("ewo");
    expect(inv?.live).toBeUndefined();
    expect(inv?.release).toBe("48.2.0");
  });

  it("never displaces an SLDR-only language: not-covered leaves SLDR sourcing untouched", async () => {
    const fetchImpl = makeFetch(TAGS_NEWER, new Map());
    const result = await refreshExemplars("ebk", fetchImpl);
    expect(result.kind).toBe("not-covered");
    const inv = sourceExemplars("ebk");
    expect(inv?.source).toBe("sldr");
    expect(inv?.live).toBeUndefined();
  });

  it("reports network-error when the version check itself cannot run", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const result = await refreshExemplars("ewo", fetchImpl);
    expect(result).toEqual({ kind: "network-error" });
  });

  it("reports network-error (not not-covered) when a locale fetch throws", async () => {
    const fetchImpl = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("api.github.com")) return jsonResponse(TAGS_NEWER);
      throw new Error("connection reset");
    }) as unknown as typeof fetch;
    const result = await refreshExemplars("ewo", fetchImpl);
    expect(result).toEqual({ kind: "network-error" });
  });

  it("reports unreadable when the payload has no exemplarCharacters", async () => {
    const fetchImpl = makeFetch(
      TAGS_NEWER,
      new Map([["ewo", { main: { ewo: { characters: {} } } }]]),
    );
    const result = await refreshExemplars("ewo", fetchImpl);
    expect(result).toEqual({ kind: "unreadable", version: "48.2.1" });
    expect(sourceExemplars("ewo")?.live).toBeUndefined();
  });

  it("reports unreadable when a set uses syntax the canonical parser rejects", async () => {
    const fetchImpl = makeFetch(
      TAGS_NEWER,
      new Map([["ewo", charactersPayload("ewo", "[a & b]")]]),
    );
    const result = await refreshExemplars("ewo", fetchImpl);
    expect(result).toEqual({ kind: "unreadable", version: "48.2.1" });
    expect(sourceExemplars("ewo")?.live).toBeUndefined();
  });

  it("stamps pinned inventories with the pinned release (not live)", () => {
    const inv = sourceExemplars("ewo");
    expect(inv?.release).toBe("48.2.0");
    expect(inv?.live).toBeUndefined();
    const sldr = sourceExemplars("ebk");
    expect(sldr?.release).toBeUndefined();
  });
});
