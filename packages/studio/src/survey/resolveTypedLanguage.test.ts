import { describe, it, expect } from "vitest";
import type { LanguageSummary } from "@keyboard-studio/contracts";
import { languageResultsFor, resolveTypedLanguage } from "./resolveTypedLanguage.ts";

const row = (code: string, englishName: string): LanguageSummary => ({ code, englishName }) as LanguageSummary;

describe("resolveTypedLanguage", () => {
  const none = (): undefined => undefined;

  it("resolves a unique primary English-name match", () => {
    const hit = row("bfd", "Bafut");
    expect(resolveTypedLanguage("bafut", [hit, row("bfx", "Bafutish")], none)).toBe(hit);
  });

  it("is ambiguous (null) when several entries share the primary name", () => {
    expect(resolveTypedLanguage("Bafut", [row("a", "Bafut"), row("b", "Bafut")], none)).toBeNull();
  });

  it("falls back to a unique alias only when no primary name matches", () => {
    const ghotuo = row("aaa", "Ghotuo");
    const alt = (code: string): string[] | undefined => (code === "aaa" ? ["Otuo"] : undefined);
    expect(resolveTypedLanguage("Otuo", [ghotuo, row("zzz", "Other")], alt)).toBe(ghotuo);
    // A primary match wins over an alias on a different entry.
    const primary = row("ppp", "Otuo");
    expect(resolveTypedLanguage("Otuo", [ghotuo, primary], alt)).toBe(primary);
  });

  it("resolves nothing for blank or unmatched text", () => {
    expect(resolveTypedLanguage("  ", [row("a", "A")], none)).toBeNull();
    expect(resolveTypedLanguage("zzz", [row("a", "A")], none)).toBeNull();
  });

  it("treats NFC and NFD spellings as the same name", () => {
    const hit = row("yo", "Yorùbá");
    expect(resolveTypedLanguage("Yorùbá".normalize("NFD"), [hit], none)).toBe(hit);
  });
});

describe("languageResultsFor", () => {
  const mod = { lookupByName: (t: string): string[] => [`name:${t}`], listLanguages: (): string[] => ["all"] };

  it("looks up non-blank text and lists everything for blank text", () => {
    expect(languageResultsFor(mod, "baf")).toEqual(["name:baf"]);
    expect(languageResultsFor(mod, "  ")).toEqual(["all"]);
  });
});
