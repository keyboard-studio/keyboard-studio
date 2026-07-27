import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, it, expect, vi } from "vitest";
import {
  parseUnicodeSet,
  loadExemplars,
  loadExemplarsFromFull,
  scriptBlockChars,
  createFetchCldrLoader,
  createFetchCldrFullLoader,
  exemplarLocaleCandidates,
  UnsupportedUnicodeSetError,
} from "./cldr.js";

/** Resolves cldr-misc-full relative to this package, not to vitest's cwd. */
const cldrRequire = createRequire(import.meta.url);

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

// ---------------------------------------------------------------------------
// Spec 044 · research R0 — tier-key defect
//
// Asserted against the REAL pinned cldr-misc-full payload rather than a
// hand-written mock: a mock would just re-state whichever key shape the
// implementation happens to read, which is exactly the mistake that let
// "exemplarCharacters-type-auxiliary" survive. cldr-misc-full is a build-time
// devDependency of this package (the same data codegen-exemplars bakes).
// ---------------------------------------------------------------------------

describe("CLDR tier keys (research R0)", () => {
  function realCldrCharacters(locale: string): Record<string, unknown> {
    const payloadPath = cldrRequire.resolve(`cldr-misc-full/main/${locale}/characters.json`);
    const json = JSON.parse(readFileSync(payloadPath, "utf8")) as {
      main: Record<string, { characters: Record<string, unknown> }>;
    };
    return (json.main[locale] as { characters: Record<string, unknown> }).characters;
  }

  function loaderFor(locale: string) {
    const payload = { main: { [locale]: { characters: realCldrCharacters(locale) } } };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    } as unknown as Response);
    return createFetchCldrFullLoader(mockFetch);
  }

  it.each(["fr", "ewo"])(
    "%s yields non-empty auxiliary, punctuation and numbers tiers",
    async (locale) => {
      const pair = await loaderFor(locale)(locale);
      expect(pair).not.toBeNull();
      expect(pair!.main.length).toBeGreaterThan(0);
      expect(pair!.auxiliary).not.toBeNull();
      expect(parseUnicodeSet(pair!.auxiliary as string).used.size).toBeGreaterThan(0);
      expect(pair!.punctuation).not.toBeNull();
      expect(parseUnicodeSet(pair!.punctuation as string).used.size).toBeGreaterThan(0);
      expect(pair!.numbers).not.toBeNull();
      expect(parseUnicodeSet(pair!.numbers as string).used.size).toBeGreaterThan(0);
    },
  );

  it("ewo auxiliary is exactly CLDR's [c j q x]", async () => {
    const pair = await loaderFor("ewo")("ewo");
    const aux = parseUnicodeSet(pair!.auxiliary as string);
    expect([...aux.used].sort()).toEqual(["c", "j", "q", "x"]);
  });

  it("reaches all four tiers through loadExemplarsFromFull", async () => {
    const result = await loadExemplarsFromFull("ewo", loaderFor("ewo"));
    expect(result).not.toBeNull();
    expect(result!.auxiliary.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Spec 044 · research R9 — parser defects
// ---------------------------------------------------------------------------

describe("parseUnicodeSet escapes (research R9)", () => {
  it("decodes \\uXXXX instead of emitting u, 2, 0, C", () => {
    const r = parseUnicodeSet("[a \\u200C b]");
    expect(r.used.has("a")).toBe(true);
    expect(r.used.has("b")).toBe(true);
    expect(r.used.has("‌")).toBe(true);
    for (const stray of ["u", "2", "0", "C"]) {
      expect(r.used.has(stray)).toBe(false);
    }
    expect(r.used.size).toBe(3);
  });

  it("decodes \\u200D (ZWJ) the same way", () => {
    const r = parseUnicodeSet("[\\u200D]");
    expect([...r.used]).toEqual(["‍"]);
  });

  it("combines a surrogate pair written as two \\uXXXX escapes", () => {
    // U+1E9E LATIN CAPITAL LETTER SHARP S as a UTF-16 surrogate pair is not
    // applicable (BMP), so use U+10480 OSMANYA LETTER ALEF (D801 DC80).
    const r = parseUnicodeSet("[\\uD801\\uDC80]");
    expect([...r.used]).toEqual(["\u{10480}"]);
  });

  it("decodes \\x{...}", () => {
    const r = parseUnicodeSet("[\\x{1E9E}]");
    expect([...r.used]).toEqual(["ẞ"]);
  });

  it("decodes \\\\ to a literal backslash", () => {
    const r = parseUnicodeSet("[a \\\\ b]");
    expect(r.used.has("\\")).toBe(true);
    expect(r.used.size).toBe(3);
  });

  it("throws on set difference rather than emitting brackets and the whole range", () => {
    expect(() => parseUnicodeSet("[[a-z]-[aeiou]]")).toThrow(UnsupportedUnicodeSetError);
  });

  it("throws on set intersection", () => {
    expect(() => parseUnicodeSet("[[a-z]&[a-f]]")).toThrow(UnsupportedUnicodeSetError);
  });

  it("throws on set complement", () => {
    expect(() => parseUnicodeSet("[^a-z]")).toThrow(UnsupportedUnicodeSetError);
  });

  it("still parses an escaped-bracket punctuation set unchanged", () => {
    const r = parseUnicodeSet("[! , \\- . \\: \\[ \\]]");
    expect([...r.used].sort()).toEqual(["!", ",", "-", ".", ":", "[", "]"]);
  });

  it("treats a spaced hyphen as a literal, not a range operator", () => {
    const r = parseUnicodeSet("[a - z]");
    expect([...r.used].sort()).toEqual(["-", "a", "z"]);
  });

  it("expands a range whose endpoints are escapes", () => {
    const r = parseUnicodeSet("[\\u0041-\\u0043]");
    expect([...r.used].sort()).toEqual(["A", "B", "C"]);
  });
});

// ---------------------------------------------------------------------------
// Spec 044 · FR-009 — everything the parser emits is NFC
// ---------------------------------------------------------------------------

/** Every character (and digraph) a parse yields must equal its own NFC form. */
function expectAllNfc(set: ReturnType<typeof parseUnicodeSet>): void {
  for (const ch of set.used) expect(ch).toBe(ch.normalize("NFC"));
  for (const d of set.digraphs) expect(d).toBe(d.normalize("NFC"));
}

describe("parseUnicodeSet NFC normalization (FR-009)", () => {
  it("composes an NFD sequence written as base + combining mark", () => {
    // "e" U+0065 followed by U+0301 COMBINING ACUTE, written as one cluster.
    const r = parseUnicodeSet("[{é}]");
    expect(r.digraphs).toEqual(["é"]);
    expectAllNfc(r);
  });

  it("holds across every tier of a real CLDR locale", () => {
    const payloadPath = cldrRequire.resolve("cldr-misc-full/main/vi/characters.json");
    const json = JSON.parse(readFileSync(payloadPath, "utf8")) as {
      main: Record<string, { characters: Record<string, unknown> }>;
    };
    const characters = (json.main["vi"] as { characters: Record<string, unknown> }).characters;
    for (const key of ["exemplarCharacters", "auxiliary", "punctuation", "numbers"]) {
      const raw = characters[key];
      if (typeof raw !== "string") continue;
      expectAllNfc(parseUnicodeSet(raw));
    }
  });
});

// ---------------------------------------------------------------------------
// Spec 044 · research R10 — the shared locale candidate ladder
// ---------------------------------------------------------------------------

describe("exemplarLocaleCandidates (research R10)", () => {
  it("falls back from ewo-Latn to ewo", () => {
    expect(exemplarLocaleCandidates("ewo-Latn")).toEqual(["ewo-Latn", "ewo"]);
  });

  it("keeps sr-Latn as the first candidate", () => {
    expect(exemplarLocaleCandidates("sr-Latn")[0]).toBe("sr-Latn");
  });

  it("normalizes subtag casing and underscores", () => {
    expect(exemplarLocaleCandidates("pt_br")).toEqual(["pt-BR", "pt"]);
    expect(exemplarLocaleCandidates("EWO-latn")).toEqual(["ewo-Latn", "ewo"]);
  });

  it("ladders script and region independently", () => {
    expect(exemplarLocaleCandidates("ha-Latn-NG")).toEqual([
      "ha-Latn-NG",
      "ha-Latn",
      "ha-NG",
      "ha",
    ]);
  });

  it("returns a single candidate for a bare language tag", () => {
    expect(exemplarLocaleCandidates("fr")).toEqual(["fr"]);
  });

  it("returns [] for an empty tag", () => {
    expect(exemplarLocaleCandidates("")).toEqual([]);
  });

  it("resolves ewo-Latn through the fetch loader by trying ewo second", async () => {
    const mockFetch = vi.fn(async (url: string) => {
      if (url.includes("/ewo-Latn/")) {
        return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ main: { ewo: { characters: { exemplarCharacters: "[a b]" } } } }),
      } as unknown as Response;
    });
    const loader = createFetchCldrFullLoader(mockFetch as unknown as typeof fetch);
    const pair = await loader("ewo-Latn");
    expect(pair).not.toBeNull();
    expect(pair!.main).toBe("[a b]");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
