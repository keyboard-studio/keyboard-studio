import { describe, it, expect, vi } from "vitest";
import {
  parseUnicodeSet,
  loadExemplars,
  scriptBlockChars,
  createFetchCldrLoader,
} from "./cldr.js";

describe("parseUnicodeSet", () => {
  it("parses basic chars", () => {
    const r = parseUnicodeSet("[a b c]");
    expect(r.used.has("a")).toBe(true);
    expect(r.used.has("b")).toBe(true);
    expect(r.used.has("c")).toBe(true);
    expect(r.digraphs).toEqual([]);
  });

  it("expands a-z range", () => {
    const r = parseUnicodeSet("[a-z]");
    expect(r.used.size).toBe(26);
    expect(r.used.has("a")).toBe(true);
    expect(r.used.has("z")).toBe(true);
    expect(r.used.has("m")).toBe(true);
  });

  it("parses multi-char digraph {sh}", () => {
    const r = parseUnicodeSet("[a {sh} b]");
    expect(r.digraphs).toContain("sh");
    expect(r.used.has("s")).toBe(true);
    expect(r.used.has("h")).toBe(true);
  });

  it("handles escaped \\[", () => {
    const r = parseUnicodeSet("[a \\[ b]");
    expect(r.used.has("[")).toBe(true);
    expect(r.used.has("a")).toBe(true);
  });

  it("does not throw on trailing backslash", () => {
    const r = parseUnicodeSet("[a\\");
    expect(r.used.has("a")).toBe(true);
    // trailing backslash consumed by the escape handler — no throw, no garbage
  });

  it("handles combining sequence as individual codepoints", () => {
    // e + combining acute (U+0301) listed as two separate chars
    const r = parseUnicodeSet("[e ́]");
    expect(r.used.has("e")).toBe(true);
    expect(r.used.has("́")).toBe(true);
  });

  it("returns empty sets for empty bracket string []", () => {
    const r = parseUnicodeSet("[]");
    expect(r.used.size).toBe(0);
    expect(r.digraphs).toEqual([]);
    expect(r.specials).toEqual([]);
  });

  it("identifies non-ASCII letters as specials", () => {
    const r = parseUnicodeSet("[a é ñ]");
    expect(r.specials).toContain("é");
    expect(r.specials).toContain("ñ");
    expect(r.specials).not.toContain("a");
  });
});

describe("loadExemplars", () => {
  it("returns null when loader returns null", async () => {
    const nullLoader = async (_locale: string) => null;
    const result = await loadExemplars("fr", nullLoader);
    expect(result).toBeNull();
  });

  it("returns correct specials for a known exemplar string", async () => {
    const loader = async (_locale: string) => "[a b c é ñ]";
    const result = await loadExemplars("fr", loader);
    expect(result).not.toBeNull();
    expect(result!.specials).toContain("é");
    expect(result!.specials).toContain("ñ");
    expect(result!.raw).toBe("[a b c é ñ]");
  });

  it("adds uppercase variant of single-codepoint specials", async () => {
    const loader = async (_locale: string) => "[a é ñ]";
    const result = await loadExemplars("fr", loader);
    expect(result).not.toBeNull();
    // É is the uppercase of é (single codepoint)
    expect(result!.specials).toContain("É");
    expect(result!.specials).toContain("Ñ");
  });

  it("does not add uppercase when it is multi-codepoint", async () => {
    // U+0149 (ŉ) uppercases to two codepoints (ʼN) in some locales — we use a
    // simpler proxy: a char whose .toUpperCase() length > 1
    // ß uppercases to SS (two chars) in default locale
    const loader = async (_locale: string) => "[ß]"; // ß
    const result = await loadExemplars("de", loader);
    expect(result).not.toBeNull();
    // SS must NOT be in specials (it's a 2-char sequence)
    expect(result!.specials).not.toContain("SS");
  });
});

describe("scriptBlockChars", () => {
  it("returns array including é and ñ for Latn", () => {
    const chars = scriptBlockChars("Latn");
    expect(chars).toContain("é"); // U+00E9 in Latin-1 Supplement
    expect(chars).toContain("ñ"); // U+00F1 in Latin-1 Supplement
  });

  it("includes basic ASCII letters for Latn", () => {
    const chars = scriptBlockChars("Latn");
    expect(chars).toContain("a");
    expect(chars).toContain("Z");
  });

  it("returns non-empty array for Deva, Arab, Cyrl", () => {
    expect(scriptBlockChars("Deva").length).toBeGreaterThan(0);
    expect(scriptBlockChars("Arab").length).toBeGreaterThan(0);
    expect(scriptBlockChars("Cyrl").length).toBeGreaterThan(0);
  });

  it("returns [] for unknown script", () => {
    expect(scriptBlockChars("Zzzz")).toEqual([]);
    expect(scriptBlockChars("")).toEqual([]);
  });
});

describe("createFetchCldrLoader", () => {
  function makeJsonResponse(payload: unknown): Response {
    return {
      ok: true,
      status: 200,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
      arrayBuffer: async () => new ArrayBuffer(0),
      headers: new Headers(),
      redirected: false,
      statusText: "OK",
      type: "basic",
      url: "",
      clone: function () { return this as unknown as Response; },
      body: null,
    } as unknown as Response;
  }

  function make404Response(): Response {
    return {
      ok: false,
      status: 404,
      json: async () => { throw new Error("not found"); },
      text: async () => "not found",
      arrayBuffer: async () => new ArrayBuffer(0),
      headers: new Headers(),
      redirected: false,
      statusText: "Not Found",
      type: "basic",
      url: "",
      clone: function () { return this as unknown as Response; },
      body: null,
    } as unknown as Response;
  }

  it("returns correct exemplar string from characters.json payload", async () => {
    const payload = {
      main: {
        fr: {
          characters: {
            exemplarCharacters: "[a b c é ñ]",
          },
        },
      },
    };
    const mockFetch = vi.fn().mockResolvedValue(makeJsonResponse(payload));
    const loader = createFetchCldrLoader(mockFetch);
    const result = await loader("fr");
    expect(result).toBe("[a b c é ñ]");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/unicode-org/cldr-json/46.1.0/cldr-json/cldr-misc-full/main/fr/characters.json",
    );
  });

  it("returns null on 404", async () => {
    const mockFetch = vi.fn().mockResolvedValue(make404Response());
    const loader = createFetchCldrLoader(mockFetch);
    const result = await loader("xx");
    expect(result).toBeNull();
  });

  it("returns null on network error", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("network failure"));
    const loader = createFetchCldrLoader(mockFetch);
    const result = await loader("fr");
    expect(result).toBeNull();
  });

  it("returns null when exemplarCharacters is missing from payload", async () => {
    const payload = {
      main: {
        fr: {
          characters: {},
        },
      },
    };
    const mockFetch = vi.fn().mockResolvedValue(makeJsonResponse(payload));
    const loader = createFetchCldrLoader(mockFetch);
    const result = await loader("fr");
    expect(result).toBeNull();
  });
});
