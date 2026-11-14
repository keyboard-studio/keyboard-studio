// Spec 115 T065: dialects and places typed in the language field (FR-039 to FR-042).

import { describe, it, expect } from "vitest";
import { getAllRegions, LanguageType, type ILanguage } from "@ethnolib/find-language";
import type { SearchMatch } from "@keyboard-studio/contracts";
import { fold } from "./dialectSearch.ts";
import { findCountry, rankPlacesFor, readTypedText, type DialectOf } from "./readTypedText.ts";

function lang(exonym: string, iso: string, names: string[] = []): ILanguage {
  return {
    exonym,
    iso639_3_code: iso,
    languageSubtag: iso,
    regionNamesForDisplay: "",
    regionNamesForSearch: [],
    names,
    scripts: [],
    alternativeTags: [],
    isMacrolanguage: false,
    languageType: LanguageType.Living,
  };
}

const OCCITAN = lang("Occitan", "oc", ["Occitan (post 1500)"]);
const ACHI = lang("Achi", "acr");
const BAFUT = lang("Bafut", "bfd");
const EWONDO = lang("Ewondo", "ewo");
const FRENCH = lang("French", "fr");
const LANGS = [OCCITAN, ACHI, BAFUT, EWONDO, FRENCH];

const m = (name: string, extra: Partial<SearchMatch> = {}): SearchMatch => ({ name, relation: "dialect", source: "glottolog", ...extra });
const DIALECTS: Record<string, DialectOf[]> = {
  oc: [{ name: "Gascon", match: m("Gascon", { relation: "variety", source: "iana", dialectTag: "oc-gascon" }) }],
  acr: [{ name: "Achi - Rabinal", match: m("Achi - Rabinal", { source: "langtags", dialectTag: "acr-x-rabinal" }) }],
  bfd: [{ name: "Royal Bafut", match: m("Royal Bafut", { glottocode: "roya1234" }) }],
  ewo: [
    { name: "Yabekolo", match: m("Yabekolo", { glottocode: "yabe1234" }) },
    { name: "Mvog-Niengue", match: m("Mvog-Niengue", { glottocode: "mvog1234" }) },
  ],
  fr: [],
};

const regions = getAllRegions();
const close = (part: string): ILanguage[] => LANGS.filter((l) => fold(l.exonym) === fold(part) || l.names.some((n) => fold(n) === fold(part)));
const read = (text: string) =>
  readTypedText(text, close, (iso) => DIALECTS[iso] ?? [], (p) => findCountry(p, regions));

describe("readTypedText (the SC-010 set)", () => {
  it.each([
    ["Gascon Occitan", "oc", "oc-gascon"],
    ["Occitan - Gascon", "oc", "oc-gascon"],
    ["Rabinal Achi", "acr", "acr-x-rabinal"],
    ["Achi Rabinal", "acr", "acr-x-rabinal"],
  ])("%s reads as the language with its dialect", (text, iso, tag) => {
    const [first] = read(text);
    expect(first?.language.iso639_3_code).toBe(iso);
    expect(first?.dialect?.dialectTag).toBe(tag);
  });

  it.each(["Bafut Royal", "Royal Bafut"])("%s reads as Bafut plus Royal Bafut", (text) => {
    const [first] = read(text);
    expect(first?.language.iso639_3_code).toBe("bfd");
    expect(first?.dialect?.glottocode).toBe("roya1234");
  });

  it("Ewondo (Yabekolo) reads as Ewondo plus Yabekolo", () => {
    const [first] = read("Ewondo (Yabekolo)");
    expect(first?.language.iso639_3_code).toBe("ewo");
    expect(first?.dialect?.glottocode).toBe("yabe1234");
  });

  it("French Switzerland reads as French plus region CH", () => {
    const [first] = read("French Switzerland");
    expect(first?.language.iso639_3_code).toBe("fr");
    expect(first?.region).toEqual({ code: "CH", name: "Switzerland" });
  });

  it("French CH reads the country code", () => {
    expect(read("French CH")[0]?.region?.code).toBe("CH");
  });

  it("Swiss French and Ewondo Mvog-Ada are unresolved: no dialect or region is guessed", () => {
    const swiss = read("Swiss French")[0];
    expect(swiss?.language.iso639_3_code).toBe("fr");
    expect(swiss?.unresolved).toBe("Swiss");
    expect(swiss?.dialect).toBeUndefined();
    expect(swiss?.region).toBeUndefined();
    const mvog = read("Ewondo Mvog-Ada")[0];
    expect(mvog?.language.iso639_3_code).toBe("ewo");
    expect(mvog?.unresolved).toBe("Mvog-Ada");
    expect(mvog?.dialect).toBeUndefined();
    expect(mvog?.region).toBeUndefined();
  });
});

describe("readTypedText rules", () => {
  it("fewer than 2 words gives no reading", () => {
    expect(read("Occitan")).toEqual([]);
    expect(read("")).toEqual([]);
  });

  it("a longer language part wins", () => {
    // "Occitan post 1500" and "Occitan": the 3-word alias would be the language part.
    const readings = readTypedText("Occitan post 1500 Gascon", (p) => (fold(p) === "occitan post 1500" ? [OCCITAN] : fold(p) === "occitan" ? [OCCITAN] : []), (iso) => DIALECTS[iso] ?? [], () => undefined);
    expect(readings[0]?.languagePart).toBe("Occitan post 1500");
  });

  it("removes duplicate readings", () => {
    const twice = readTypedText("Gascon Occitan", () => [OCCITAN, OCCITAN], (iso) => DIALECTS[iso] ?? [], () => undefined);
    expect(twice.filter((r) => r.dialect?.dialectTag === "oc-gascon")).toHaveLength(1);
  });

  it("no typed word is dropped without appearing in a label", () => {
    for (const text of ["Gascon Occitan", "Rabinal Achi", "Bafut Royal", "Ewondo (Yabekolo)", "French Switzerland", "Swiss French", "Ewondo Mvog-Ada"]) {
      const [first] = read(text);
      const label = fold(first!.label);
      for (const word of text.split(/[\s,()]+/).filter((w) => w !== "")) {
        expect(label, `${text}: ${word}`).toContain(fold(word));
      }
    }
  });
});

describe("rankPlacesFor", () => {
  it.each([
    ["Swiss", ["Switzerland"]],
    ["Cameroonian", ["Cameroon", "Cambodia"]],
    ["Moroccan", ["Morocco"]],
    ["Brazilian", ["Brazil"]],
    ["Mexican", ["Mexico"]],
    ["Belgian", ["Belgium", "Belarus", "Belize"]],
    ["Canadian", ["Canada"]],
    ["Mvog", []],
  ])("%s", (word, first) => {
    const ranked = rankPlacesFor(word, regions).map((r) => r.name);
    expect(ranked.slice(0, first.length)).toEqual(first);
    if (first.length === 0) expect(ranked).toEqual([]);
  });

  it("Ivorian ranks Cote d'Ivoire first", () => {
    expect(fold(rankPlacesFor("Ivorian", regions)[0]?.name ?? "")).toContain("ivoire");
  });
});
