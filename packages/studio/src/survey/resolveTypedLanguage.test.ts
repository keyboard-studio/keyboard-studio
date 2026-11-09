import { describe, it, expect } from "vitest";
import { LanguageType, type ILanguage } from "@ethnolib/find-language";
import { languageResultsFor, resolveTypedLanguage } from "./resolveTypedLanguage.ts";
import type { ChooserLanguage } from "./languageChooser/dialectSearch.ts";

const row = (code: string, exonym: string, names: string[] = []): ILanguage => ({
  iso639_3_code: code,
  languageSubtag: code,
  exonym,
  regionNamesForDisplay: "",
  regionNamesForSearch: [],
  names,
  scripts: [],
  alternativeTags: [],
  isMacrolanguage: false,
  languageType: LanguageType.Living,
});

describe("resolveTypedLanguage over ILanguage", () => {
  it("resolves a unique primary-name match", () => {
    const hit = row("bfd", "Bafut");
    expect(resolveTypedLanguage("bafut", [hit, row("bfx", "Bafutish")])).toBe(hit);
  });

  it("is ambiguous (null) when several entries share the primary name", () => {
    expect(resolveTypedLanguage("Bafut", [row("a", "Bafut"), row("b", "Bafut")])).toBeNull();
  });

  it("falls back to a unique alias only when no primary name matches", () => {
    const ghotuo = row("aaa", "Ghotuo", ["Otuo"]);
    expect(resolveTypedLanguage("Otuo", [ghotuo, row("zzz", "Other")])).toBe(ghotuo);
    // A primary match wins over an alias on a different entry.
    const primary = row("ppp", "Otuo");
    expect(resolveTypedLanguage("Otuo", [ghotuo, primary])).toBe(primary);
  });

  it("an alias shared by two entries stays ambiguous", () => {
    expect(
      resolveTypedLanguage("Shared", [row("a", "Alpha", ["Shared"]), row("b", "Beta", ["Shared"])]),
    ).toBeNull();
  });

  it("resolves nothing for blank or unmatched text", () => {
    expect(resolveTypedLanguage("  ", [row("a", "A")])).toBeNull();
    expect(resolveTypedLanguage("zzz", [row("a", "A")])).toBeNull();
  });

  it("treats NFC and NFD spellings as the same name", () => {
    const hit = row("yo", "Yorùbá");
    expect(resolveTypedLanguage("Yorùbá".normalize("NFD"), [hit])).toBe(hit);
  });

  it("ignores the chooser's match markers in names", () => {
    const hit = row("ewo", "[Ewondo]");
    expect(resolveTypedLanguage("Ewondo", [hit])).toBe(hit);
  });
});

describe("languageResultsFor", () => {
  const seen: string[] = [];
  const modifier = (rs: ILanguage[], q: string): ChooserLanguage[] => {
    seen.push(q);
    return rs;
  };

  it("lists nothing for text under two characters and searches otherwise", () => {
    expect(languageResultsFor(" e ", modifier)).toEqual([]);
    expect(seen).toEqual([]);
    const rs = languageResultsFor("Ewondo", modifier);
    expect(rs.some((r) => r.languageSubtag === "ewo")).toBe(true);
    expect(seen).toEqual(["Ewondo"]);
  });
});
