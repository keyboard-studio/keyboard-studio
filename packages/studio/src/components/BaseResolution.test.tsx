// Focused integration test for BaseResolution: given bases with languages and
// a target bcp47, a language-matching base ranks first with the language-match
// reason. Uses the mockBaseBrowser fixture which now carries languages.

import { describe, it, expect } from "vitest";
import { suggestBases } from "../lib/suggestBase";
import type { BaseKeyboard } from "@keyboard-studio/contracts";
import { sampleBaseKeyboards } from "@keyboard-studio/contracts/fixtures";

// ---------------------------------------------------------------------------
// White-box: test suggestBases() with bases that carry .languages, which is
// what BaseResolution builds its languagesById map from.
// ---------------------------------------------------------------------------

describe("BaseResolution — language-match integration via suggestBases", () => {
  it("a base with .languages matching the target language ranks as language-match", () => {
    // Simulate BaseResolution building languagesById from base.languages:
    const languagesById = Object.fromEntries(
      sampleBaseKeyboards.map((b) => [b.id, b.languages ?? []] as const),
    );

    // ha-Latn target: sil_euro_latin lists "ha" in its languages
    const suggestions = suggestBases(
      sampleBaseKeyboards,
      { script: "Latn", bcp47: "ha-Latn" },
      { languagesById },
    );

    const first = suggestions[0];
    expect(first).toBeDefined();
    expect(first!.base.id).toBe("sil_euro_latin");
    expect(first!.reason).toBe("language-match");
  });

  it("hi-Deva target: sil_devanagari_phonetic ranks as language-match", () => {
    const languagesById = Object.fromEntries(
      sampleBaseKeyboards.map((b) => [b.id, b.languages ?? []] as const),
    );

    const suggestions = suggestBases(
      sampleBaseKeyboards,
      { script: "Deva", bcp47: "hi-Deva" },
      { languagesById },
    );

    const first = suggestions[0];
    expect(first).toBeDefined();
    expect(first!.base.id).toBe("sil_devanagari_phonetic");
    expect(first!.reason).toBe("language-match");
  });

  it("en target: basic_kbdus ranks as language-match (not just fallback)", () => {
    const languagesById = Object.fromEntries(
      sampleBaseKeyboards.map((b) => [b.id, b.languages ?? []] as const),
    );

    const suggestions = suggestBases(
      sampleBaseKeyboards,
      { script: "Latn", bcp47: "en-Latn" },
      { languagesById },
    );

    const enMatch = suggestions.find((s) => s.base.id === "basic_kbdus");
    expect(enMatch).toBeDefined();
    expect(enMatch!.reason).toBe("language-match");
  });

  it("unknown language code degrades to script-match, not language-match", () => {
    const languagesById = Object.fromEntries(
      sampleBaseKeyboards.map((b) => [b.id, b.languages ?? []] as const),
    );

    // "xx" is not in any fixture's languages — should not produce language-match
    const suggestions = suggestBases(
      sampleBaseKeyboards,
      { script: "Latn", bcp47: "xx-Latn" },
      { languagesById },
    );

    const languageMatches = suggestions.filter(
      (s) => s.reason === "language-match",
    );
    expect(languageMatches).toHaveLength(0);
  });

  it("missing bcp47 on target degrades to script-match (no language-match)", () => {
    const languagesById = Object.fromEntries(
      sampleBaseKeyboards.map((b) => [b.id, b.languages ?? []] as const),
    );

    const suggestions = suggestBases(
      sampleBaseKeyboards,
      { script: "Latn" }, // no bcp47
      { languagesById },
    );

    const languageMatches = suggestions.filter(
      (s) => s.reason === "language-match",
    );
    expect(languageMatches).toHaveLength(0);
    // script-match entries exist for Latin bases
    const scriptMatches = suggestions.filter(
      (s) => s.reason === "script-match",
    );
    expect(scriptMatches.length).toBeGreaterThan(0);
  });

  it("bases without .languages fall back to script-match", () => {
    const bare: BaseKeyboard = {
      id: "bare_latin",
      path: "release/x/bare_latin",
      script: "Latn",
      targets: ["windows"],
      displayName: "Bare Latin",
      version: "1.0",
      // no languages field
    };
    const languagesById = Object.fromEntries(
      [bare].map((b) => [b.id, b.languages ?? []] as const),
    );

    const suggestions = suggestBases(
      [bare],
      { script: "Latn", bcp47: "fr-Latn" },
      { languagesById },
    );

    // bare_latin has no languages → not a language-match; basic_kbdus absent
    // so no fallback either → only script-match
    expect(suggestions[0]?.reason).toBe("script-match");
  });
});