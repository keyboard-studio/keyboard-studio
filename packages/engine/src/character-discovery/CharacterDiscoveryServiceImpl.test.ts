import { describe, it, expect } from "vitest";
import {
  createCharacterDiscoveryService,
  buildLinguistPrompt,
  parseLinguistJson,
  cldrCrossCheck,
} from "./CharacterDiscoveryServiceImpl.js";
import type { BaseKeyboard, InventoryFlag } from "@keyboard-studio/contracts";

const noopCompleter = async () => { throw new Error("not called"); };

// A null loader is safe here — harvestFromText never calls the CLDR loader
const nullLoader = async (_locale: string): Promise<string | null> => null;
const service = createCharacterDiscoveryService(nullLoader, noopCompleter);

// Happy-path loader: returns French exemplars for "fr", null for everything else
const frLoader = async (locale: string): Promise<string | null> =>
  locale === "fr" ? "[a b é ñ]" : null;
const frService = createCharacterDiscoveryService(frLoader, noopCompleter);
const nullService = createCharacterDiscoveryService(nullLoader, noopCompleter);

// Minimal BaseKeyboard fixture (harvestFromText uses only the ASCII proxy, not
// any field from base, so the exact values here do not matter)
const baseKb: BaseKeyboard = {
  id: "basic_kbdus",
  path: "release/b/basic_kbdus",
  script: "Latn",
  targets: ["windows"],
  displayName: "US English",
  version: "1.0",
};

describe("CharacterDiscoveryServiceImpl.pickerCandidates", () => {
  const unknownBase: BaseKeyboard = {
    id: "unknown_kb",
    path: "release/u/unknown_kb",
    script: "Zzzz",
    targets: ["windows"],
    displayName: "Unknown Script",
    version: "1.0",
  };

  it("bcp47 provided + CLDR returns exemplars → non-ASCII chars present, method=picker, no count", async () => {
    const result = await frService.pickerCandidates(baseKb, "fr");
    // é (U+00E9) and ñ (U+00F1) should appear
    const chars = result.map((r) => r.char);
    expect(chars).toContain("é");
    expect(chars).toContain("ñ");
    for (const item of result) {
      expect(item.method).toBe("picker");
      expect("count" in item).toBe(false);
    }
  });

  it("bcp47 provided but CLDR loader returns null → falls back to script block; non-empty for Latn", async () => {
    const result = await nullService.pickerCandidates(baseKb, "fr");
    expect(result.length).toBeGreaterThan(0);
    for (const item of result) {
      expect(item.method).toBe("picker");
    }
  });

  it("bcp47 absent → uses script block chars; non-empty for Latn", async () => {
    const result = await nullService.pickerCandidates(baseKb);
    expect(result.length).toBeGreaterThan(0);
    for (const item of result) {
      expect(item.method).toBe("picker");
    }
  });

  it("ASCII chars have inBaseOutput: true; non-ASCII chars have inBaseOutput: false", async () => {
    const result = await frService.pickerCandidates(baseKb, "fr");
    for (const item of result) {
      const cp = item.char.codePointAt(0) ?? 0;
      if (cp <= 0x7e) {
        expect(item.inBaseOutput).toBe(true);
      } else {
        expect(item.inBaseOutput).toBe(false);
      }
    }
  });

  it("result is sorted ascending by codepoint", async () => {
    const result = await nullService.pickerCandidates(baseKb);
    for (let i = 1; i < result.length; i++) {
      const prev = result[i - 1]!.char.codePointAt(0) ?? 0;
      const curr = result[i]!.char.codePointAt(0) ?? 0;
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });

  it("unknown script + null CLDR loader → returns []", async () => {
    const result = await nullService.pickerCandidates(unknownBase);
    expect(result).toEqual([]);
  });

  it("bcp47 provided but CLDR null + unknown script → returns []", async () => {
    const result = await nullService.pickerCandidates(unknownBase, "zzzz");
    expect(result).toEqual([]);
  });
});

describe("CharacterDiscoveryServiceImpl.harvestFromText", () => {
  it("returns [] for empty string", async () => {
    const result = await service.harvestFromText("", baseKb);
    expect(result).toEqual([]);
  });

  it("returns [] for whitespace-only string", async () => {
    const result = await service.harvestFromText("   \t\n", baseKb);
    expect(result).toEqual([]);
  });

  it("single char returns one entry with count 1", async () => {
    const result = await service.harvestFromText("a", baseKb);
    expect(result).toHaveLength(1);
    expect(result[0]?.char).toBe("a");
    expect(result[0]?.count).toBe(1);
  });

  it("frequency sorting: aab → a(2) then b(1)", async () => {
    const result = await service.harvestFromText("aab", baseKb);
    expect(result).toHaveLength(2);
    expect(result[0]?.char).toBe("a");
    expect(result[0]?.count).toBe(2);
    expect(result[1]?.char).toBe("b");
    expect(result[1]?.count).toBe(1);
  });

  it("tie broken by ascending codepoint", async () => {
    const result = await service.harvestFromText("ba", baseKb);
    expect(result).toHaveLength(2);
    expect(result[0]?.char).toBe("a");
    expect(result[1]?.char).toBe("b");
  });

  it("combining sequence 'é' (e + U+0301) is ONE entry", async () => {
    // é is e followed by combining acute accent — one grapheme cluster
    const combining = "é";
    const result = await service.harvestFromText(combining, baseKb);
    expect(result).toHaveLength(1);
    expect(result[0]?.char).toBe(combining);
  });

  it("ASCII chars have inBaseOutput: true", async () => {
    const result = await service.harvestFromText("abc", baseKb);
    for (const item of result) {
      expect(item.inBaseOutput).toBe(true);
    }
  });

  it("non-ASCII char é (precomposed U+00E9) has inBaseOutput: false", async () => {
    const result = await service.harvestFromText("é", baseKb);
    expect(result).toHaveLength(1);
    expect(result[0]?.inBaseOutput).toBe(false);
  });

  it("method is 'text-sample' on every entry", async () => {
    const result = await service.harvestFromText("hello", baseKb);
    for (const item of result) {
      expect(item.method).toBe("text-sample");
    }
  });

  it("count is always present (never undefined) on text-sample results", async () => {
    const result = await service.harvestFromText("hello world", baseKb);
    for (const item of result) {
      expect(item.count).toBeDefined();
      expect(typeof item.count).toBe("number");
    }
  });
});

const MINIMAL_VALID_JSON = JSON.stringify({
  language: "fr",
  script: "Latin",
  alphabet_core: {
    lowercase: ["a", "b", "c"],
    uppercase: ["A", "B", "C"],
  },
  mandatory_diacritics_and_ligatures: ["é"],
  language_specific_punctuation: ["«", "»"],
  numerals: ["0", "1"],
});

describe("synthesizeInventory helpers + integration", () => {
  it("buildLinguistPrompt inserts languageName and bcp47, removes placeholders", () => {
    const result = buildLinguistPrompt("French", "fr");
    expect(result).toContain("French");
    expect(result).toContain("fr");
    expect(result).not.toContain("{{languageName}}");
    expect(result).not.toContain("{{bcp47}}");
  });

  it("parseLinguistJson happy path — required fields present, optional absent", () => {
    const inv = parseLinguistJson(MINIMAL_VALID_JSON);
    expect(inv.language).toBe("fr");
    expect(inv.script).toBe("Latin");
    expect(inv.alphabetCore.lowercase).toEqual(["a", "b", "c"]);
    expect(inv.alphabetCore.uppercase).toEqual(["A", "B", "C"]);
    expect(inv.mandatoryDiacriticsAndLigatures).toEqual(["é"]);
    expect(inv.languageSpecificPunctuation).toEqual(["«", "»"]);
    expect(inv.numerals).toEqual(["0", "1"]);
    expect("alphabetAuxiliary" in inv).toBe(false);
    expect("digraphsAsPhonemeUnits" in inv).toBe(false);
    expect("flags" in inv).toBe(false);
  });

  it("parseLinguistJson NFC — decomposed á normalizes to precomposed á", () => {
    // 'a' + combining acute accent (U+0301) → 'á' (U+00E1)
    const decomposed = "á";
    const json = JSON.stringify({
      language: "es",
      script: "Latin",
      alphabet_core: {
        lowercase: [decomposed],
        uppercase: ["A"],
      },
      mandatory_diacritics_and_ligatures: [],
      language_specific_punctuation: [],
      numerals: [],
    });
    const inv = parseLinguistJson(json);
    expect(inv.alphabetCore.lowercase[0]).toBe("á");
    // Stored value must be the precomposed form (NFC) and a single code unit
    expect(inv.alphabetCore.lowercase[0]).toHaveLength(1);
  });

  it("parseLinguistJson direction_control_chars — U+200F stored as notation string (not raw char)", () => {
    const json = JSON.stringify({
      language: "ar",
      script: "Arabic",
      alphabet_core: {
        lowercase: [],
        uppercase: [],
      },
      mandatory_diacritics_and_ligatures: [],
      language_specific_punctuation: [],
      numerals: [],
      direction_control_chars: ["U+200F"],
    });
    const inv = parseLinguistJson(json);
    expect(inv.directionControlChars).toBeDefined();
    expect(inv.directionControlChars![0]).toBe("U+200F");
  });

  it("parseLinguistJson direction_control_chars — lowercase u+xxxx notation normalised to uppercase U+XXXX", () => {
    const json = JSON.stringify({
      language: "ar",
      script: "Arabic",
      alphabet_core: { lowercase: [], uppercase: [] },
      mandatory_diacritics_and_ligatures: [],
      language_specific_punctuation: [],
      numerals: [],
      direction_control_chars: ["u+200f"],
    });
    const inv = parseLinguistJson(json);
    expect(inv.directionControlChars).toBeDefined();
    expect(inv.directionControlChars![0]).toBe("U+200F");
  });

  it("parseLinguistJson direction_control_chars — literal raw RLM char converted to U+200F notation", () => {
    const json = JSON.stringify({
      language: "ar",
      script: "Arabic",
      alphabet_core: { lowercase: [], uppercase: [] },
      mandatory_diacritics_and_ligatures: [],
      language_specific_punctuation: [],
      numerals: [],
      direction_control_chars: ["‏"],
    });
    const inv = parseLinguistJson(json);
    expect(inv.directionControlChars).toBeDefined();
    expect(inv.directionControlChars![0]).toBe("U+200F");
  });

  it("parseLinguistJson direction_control_chars — literal plain letter 'a' is dropped (not stored as notation)", () => {
    const json = JSON.stringify({
      language: "en",
      script: "Latin",
      alphabet_core: { lowercase: [], uppercase: [] },
      mandatory_diacritics_and_ligatures: [],
      language_specific_punctuation: [],
      numerals: [],
      direction_control_chars: ["a"],
    });
    const inv = parseLinguistJson(json);
    // "a" is outside bidi-control ranges — should be dropped entirely
    expect(inv.directionControlChars).toBeUndefined();
  });

  it("parseLinguistJson direction_control_chars — literal space ' ' is dropped (not stored as notation)", () => {
    const json = JSON.stringify({
      language: "en",
      script: "Latin",
      alphabet_core: { lowercase: [], uppercase: [] },
      mandatory_diacritics_and_ligatures: [],
      language_specific_punctuation: [],
      numerals: [],
      direction_control_chars: [" "],
    });
    const inv = parseLinguistJson(json);
    // space (U+0020) is outside bidi-control ranges — should be dropped
    expect(inv.directionControlChars).toBeUndefined();
  });

  it("parseLinguistJson direction_control_chars — U+1D173 notation (5-digit hex) preserved exactly, no truncation", () => {
    const json = JSON.stringify({
      language: "test",
      script: "Latin",
      alphabet_core: { lowercase: [], uppercase: [] },
      mandatory_diacritics_and_ligatures: [],
      language_specific_punctuation: [],
      numerals: [],
      direction_control_chars: ["U+1D173"],
    });
    const inv = parseLinguistJson(json);
    // Explicit U+ notation is permissive — supplementary plane preserved
    expect(inv.directionControlChars).toBeDefined();
    expect(inv.directionControlChars![0]).toBe("U+1D173");
  });

  it("parseLinguistJson direction_control_chars — literal supplementary-plane char outside bidi ranges is dropped", () => {
    // U+1D173 (MUSICAL SYMBOL BEGIN BEAM) as a literal character — outside bidi ranges
    const literalSupplementary = String.fromCodePoint(0x1d173);
    const json = JSON.stringify({
      language: "test",
      script: "Latin",
      alphabet_core: { lowercase: [], uppercase: [] },
      mandatory_diacritics_and_ligatures: [],
      language_specific_punctuation: [],
      numerals: [],
      direction_control_chars: [literalSupplementary],
    });
    const inv = parseLinguistJson(json);
    // Literal char not in bidi ranges → dropped
    expect(inv.directionControlChars).toBeUndefined();
  });

  it("parseLinguistJson throws on invalid JSON", () => {
    expect(() => parseLinguistJson("not json at all")).toThrow(
      "linguist: invalid JSON response"
    );
  });

  it("parseLinguistJson throws when alphabet_core is missing", () => {
    const json = JSON.stringify({
      language: "fr",
      script: "Latin",
      mandatory_diacritics_and_ligatures: [],
      language_specific_punctuation: [],
      numerals: [],
    });
    expect(() => parseLinguistJson(json)).toThrow(
      "linguist: missing required field: alphabet_core"
    );
  });

  it("parseLinguistJson silently drops non-string entries in alphabet_core arrays", () => {
    const json = JSON.stringify({
      language: "fr",
      script: "Latin",
      alphabet_core: { lowercase: [1, "b", null], uppercase: ["A"] },
      mandatory_diacritics_and_ligatures: [],
      language_specific_punctuation: [],
      numerals: [],
    });
    const inv = parseLinguistJson(json);
    expect(inv.alphabetCore.lowercase).toEqual(["b"]);
  });

  it("parseLinguistJson silently drops alphabet_auxiliary when lowercase is not an array", () => {
    const json = JSON.stringify({
      language: "fr",
      script: "Latin",
      alphabet_core: { lowercase: ["a"], uppercase: ["A"] },
      alphabet_auxiliary: { lowercase: "abc", uppercase: ["X"] },
      mandatory_diacritics_and_ligatures: [],
      language_specific_punctuation: [],
      numerals: [],
    });
    const inv = parseLinguistJson(json);
    expect(inv.alphabetAuxiliary).toBeUndefined();
  });

  it("cldrCrossCheck — é in core, ü extra → ü not-attested; ñ cldr-omitted", async () => {
    const mockFrLoader = async (locale: string): Promise<string | null> =>
      locale === "fr" ? "[a b é ñ]" : null;

    const inv = parseLinguistJson(
      JSON.stringify({
        language: "fr",
        script: "Latin",
        alphabet_core: {
          lowercase: ["é", "ü"],
          uppercase: [],
        },
        mandatory_diacritics_and_ligatures: [],
        language_specific_punctuation: [],
        numerals: [],
      })
    );

    const result = await cldrCrossCheck(inv, "fr", mockFrLoader);
    expect(result.flags).toBeDefined();
    const flags = result.flags!;

    const notAttested = flags.find((f) => f.char === "ü");
    expect(notAttested?.issue).toBe("not-attested");

    const cldrOmitted = flags.find((f) => f.char === "ñ");
    expect(cldrOmitted?.issue).toBe("cldr-omitted");
  });

  it("cldrCrossCheck — null loader returns inventory unchanged, no flags added", async () => {
    const inv = parseLinguistJson(MINIMAL_VALID_JSON);
    const result = await cldrCrossCheck(inv, "fr", nullLoader);
    expect(result).toBe(inv);
    expect("flags" in result).toBe(false);
  });

  it("cldrCrossCheck — char in independentVowels attested by CLDR is NOT flagged cldr-omitted", async () => {
    // Devanagari LETTER A (U+0905) is in independentVowels only (not alphabetCore).
    // CLDR attests it. It must not appear as cldr-omitted.
    const hiLoader = async (locale: string): Promise<string | null> =>
      locale === "hi" ? "[अ आ इ ई]" : null;

    const inv = parseLinguistJson(
      JSON.stringify({
        language: "hi",
        script: "Devanagari",
        alphabet_core: { lowercase: ["क", "ख"], uppercase: [] },
        mandatory_diacritics_and_ligatures: [],
        language_specific_punctuation: [],
        numerals: [],
        independent_vowels: ["अ", "आ", "इ", "ई"],
      })
    );

    const result = await cldrCrossCheck(inv, "hi", hiLoader);
    const flags = result.flags ?? [];
    const cldrOmittedChars = flags
      .filter((f: InventoryFlag) => f.issue === "cldr-omitted")
      .map((f: InventoryFlag) => f.char);
    // None of the independentVowels that CLDR attests should be flagged cldr-omitted
    expect(cldrOmittedChars).not.toContain("अ");
    expect(cldrOmittedChars).not.toContain("आ");
    expect(cldrOmittedChars).not.toContain("इ");
    expect(cldrOmittedChars).not.toContain("ई");
  });

  it("cldrCrossCheck ASCII exclusion — ASCII letters in CLDR exemplars do NOT produce cldr-omitted flags", async () => {
    // Inventory has only non-ASCII core chars. CLDR returns a mix of ASCII and
    // non-ASCII. The > 0x7F gate must suppress cldr-omitted for ASCII letters.
    const mixedLoader = async (locale: string): Promise<string | null> =>
      locale === "fr" ? "[a b é]" : null;

    const inv = parseLinguistJson(
      JSON.stringify({
        language: "fr",
        script: "Latin",
        alphabet_core: { lowercase: ["é"], uppercase: [] },
        mandatory_diacritics_and_ligatures: [],
        language_specific_punctuation: [],
        numerals: [],
      })
    );

    const result = await cldrCrossCheck(inv, "fr", mixedLoader);
    const flags = result.flags ?? [];
    const cldrOmittedChars = flags
      .filter((f: InventoryFlag) => f.issue === "cldr-omitted")
      .map((f: InventoryFlag) => f.char);
    // ASCII letters 'a' and 'b' must NOT appear as cldr-omitted
    expect(cldrOmittedChars).not.toContain("a");
    expect(cldrOmittedChars).not.toContain("b");
  });

  it("parseLinguistJson syllabic_final_markers — literal non-ASCII char (no U+ prefix) stored as NFC character", () => {
    // U+1039 MYANMAR SIGN ASAT — a real syllabic final marker supplied as
    // a literal character in the LLM response (parseUPlusHexOrNFC fallback path).
    const literalChar = "္"; // U+1039
    const json = JSON.stringify({
      language: "my",
      script: "Myanmar",
      alphabet_core: { lowercase: [], uppercase: [] },
      mandatory_diacritics_and_ligatures: [],
      language_specific_punctuation: [],
      numerals: [],
      syllabic_final_markers: [literalChar],
    });
    const inv = parseLinguistJson(json);
    expect(inv.syllabicFinalMarkers).toBeDefined();
    expect(inv.syllabicFinalMarkers![0]).toBe(literalChar.normalize("NFC"));
  });

  it("synthesizeInventory end-to-end — mock completer + null loader → correct inventory", async () => {
    const mockCompleter = async (_prompt: string): Promise<string> =>
      MINIMAL_VALID_JSON;

    const svc = createCharacterDiscoveryService(nullLoader, mockCompleter);
    const inv = await svc.synthesizeInventory("French", "fr");

    expect(inv.language).toBe("fr");
    expect(inv.script).toBe("Latin");
    expect(inv.alphabetCore.lowercase).toEqual(["a", "b", "c"]);
    expect(inv.alphabetCore.uppercase).toEqual(["A", "B", "C"]);
    expect(inv.mandatoryDiacriticsAndLigatures).toEqual(["é"]);
    expect("flags" in inv).toBe(false);
  });

  it("buildLinguistPrompt with orthographyUrl — URL appears in the prompt", () => {
    const url = "https://example.org/bm-orthography";
    const result = buildLinguistPrompt("Bambara", "bm", url);
    expect(result).toContain(url);
    expect(result).toContain("Grounding source:");
    expect(result).toContain("primary source");
  });

  it("buildLinguistPrompt without orthographyUrl — no URL placeholder remains", () => {
    const result = buildLinguistPrompt("French", "fr");
    expect(result).not.toContain("orthographyUrl");
    expect(result).not.toContain("Grounding source:");
    expect(result).not.toContain("{{");
  });

  it("synthesizeInventory end-to-end with orthographyUrl — completer receives prompt containing the URL", async () => {
    const url = "https://example.org/tyv-orthography";
    let capturedPrompt = "";
    const capturingCompleter = async (prompt: string): Promise<string> => {
      capturedPrompt = prompt;
      return MINIMAL_VALID_JSON;
    };

    const svc = createCharacterDiscoveryService(nullLoader, capturingCompleter);
    await svc.synthesizeInventory("Tuvan", "tyv", url);

    expect(capturedPrompt).toContain(url);
    expect(capturedPrompt).toContain("Grounding source:");
  });

  // P1-A: omitting all three formerly-required list fields parses as empty arrays
  it("parseLinguistJson — missing mandatory_diacritics_and_ligatures / language_specific_punctuation / numerals yields empty arrays", () => {
    const json = JSON.stringify({
      language: "fr",
      script: "Latin",
      alphabet_core: {
        lowercase: ["a"],
        uppercase: ["A"],
      },
      // all three optional-now fields are absent
    });
    const inv = parseLinguistJson(json);
    expect(inv.mandatoryDiacriticsAndLigatures).toEqual([]);
    expect(inv.languageSpecificPunctuation).toEqual([]);
    expect(inv.numerals).toEqual([]);
  });

  // P1-B: malformed orthographyUrl throws a descriptive domain error
  it("buildLinguistPrompt — malformed orthographyUrl throws linguist: domain error", () => {
    expect(() => buildLinguistPrompt("French", "fr", "not a url")).toThrow(
      /linguist: invalid orthographyUrl "not a url"/
    );
  });

  // P2-B: cldrCrossCheck preserves pre-existing flags while appending new ones
  it("cldrCrossCheck — pre-existing flags are preserved and new flags are appended", async () => {
    const preExistingFlag = { char: "ø", issue: "not-attested" as const };
    const mockLoader = async (locale: string): Promise<string | null> =>
      locale === "fr" ? "[a b é ñ]" : null;

    const baseInv = parseLinguistJson(
      JSON.stringify({
        language: "fr",
        script: "Latin",
        alphabet_core: {
          lowercase: ["é"],
          uppercase: [],
        },
        mandatory_diacritics_and_ligatures: [],
        language_specific_punctuation: [],
        numerals: [],
      })
    );

    // Attach a pre-existing flag manually via spread (makeLinguistInventory accepts flags)
    const { makeLinguistInventory } = await import("@keyboard-studio/contracts");
    const invWithFlag = makeLinguistInventory({ ...baseInv, flags: [preExistingFlag] });

    const result = await cldrCrossCheck(invWithFlag, "fr", mockLoader);
    expect(result.flags).toBeDefined();
    // Pre-existing flag must still be present
    expect(result.flags!.some((f) => f.char === "ø" && f.issue === "not-attested")).toBe(true);
    // New cldr-omitted flag for "ñ" (in CLDR but not in agent letters) must be appended
    expect(result.flags!.some((f) => f.char === "ñ" && f.issue === "cldr-omitted")).toBe(true);
  });

  // P2-E: synthesizeInventory end-to-end with a non-null CLDR loader
  it("synthesizeInventory end-to-end — non-null CLDR loader exercises completer→parse→cross-check and yields cldr-omitted flag", async () => {
    // Loader returns "ñ" as a CLDR letter; LLM response only includes "é" in its core
    const mockLoader = async (locale: string): Promise<string | null> =>
      locale === "fr" ? "[a b é ñ]" : null;

    const mockCompleter = async (_prompt: string): Promise<string> =>
      JSON.stringify({
        language: "fr",
        script: "Latin",
        alphabet_core: {
          lowercase: ["é"],
          uppercase: [],
        },
        mandatory_diacritics_and_ligatures: [],
        language_specific_punctuation: [],
        numerals: [],
      });

    const svc = createCharacterDiscoveryService(mockLoader, mockCompleter);
    const inv = await svc.synthesizeInventory("French", "fr");

    // cross-check must have run: ñ is in CLDR but not in agent letters → cldr-omitted
    expect(inv.flags).toBeDefined();
    const cldrOmitted = inv.flags!.find((f) => f.char === "ñ");
    expect(cldrOmitted?.issue).toBe("cldr-omitted");
  });
});
