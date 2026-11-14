// Spec 115 T021: the dialect searcher and the merge rule of dialectResultModifier
// (contracts/dialect-search-and-question.md § merge rule).

import { describe, expect, it, vi } from "vitest";
import {
  LanguageType,
  searchForLanguage,
  stripDemarcation,
  type ILanguage,
} from "@ethnolib/find-language";
import { allDialectTagsets } from "@keyboard-studio/engine/langtags";
import { dialectRows } from "@keyboard-studio/glottolog/dialects";
import { defaultParentFor, dialectResultModifier, makeDialectSearcher, type ChooserLanguage } from "./dialectSearch.ts";

const searcher = makeDialectSearcher(dialectRows, allDialectTagsets);
const modify = dialectResultModifier(searcher, defaultParentFor);

/** Chooser results for a query as today's EthnoLib search returns them, then merged. */
function merged(q: string): ChooserLanguage[] {
  return modify(searchForLanguage(q), q);
}
const codes = (rs: readonly ILanguage[]): string[] => rs.map((r) => r.languageSubtag);

const lang = (code: string, exonym: string, over: Partial<ILanguage> = {}): ILanguage => ({
  iso639_3_code: code,
  languageSubtag: code,
  exonym,
  regionNamesForDisplay: "",
  regionNamesForSearch: [],
  names: [],
  scripts: [],
  alternativeTags: [],
  isMacrolanguage: false,
  languageType: LanguageType.Living,
  ...over,
});

describe("dialect names find their parent, with a match", () => {
  it("Gascon -> Occitan once, with the Glottolog match", () => {
    const rs = merged("Gascon");
    expect(rs.filter((r) => r.languageSubtag === "oc")).toHaveLength(1);
    const oc = rs.find((r) => r.languageSubtag === "oc");
    expect(oc?.match).toMatchObject({ relation: "dialect", source: "glottolog", glottocode: "gasc1240" });
    expect(oc?.match?.countries).toEqual(["ES", "FR"]);
    expect(codes(rs).indexOf("oc")).toBeLessThan(3);
  });

  it("Aranese -> Occitan once, with the Aranese match (not Baish Aranes)", () => {
    // The Glottolog row "Aranese" is also an alternate name of Occitan, so the
    // old own-name guard dropped its match and the next hit (Baish Aranes) won
    // the row instead. The first hit wins now.
    const rs = merged("Aranese");
    expect(rs.filter((r) => r.languageSubtag === "oc")).toHaveLength(1);
    const oc = rs.find((r) => r.languageSubtag === "oc");
    expect(oc?.match).toMatchObject({ relation: "dialect", source: "glottolog", glottocode: "aran1260" });
    expect(codes(rs).indexOf("oc")).toBeLessThan(3);
  });

  it("a query naming the language leaves its row plain; dialects are separate rows", () => {
    // "French" used to hijack the fr row with "American Koine French" as its
    // match, so plain French was unpickable from its own name. Same for
    // English, German, Spanish and Occitan.
    const rs = merged("French");
    expect(rs[0]?.languageSubtag).toBe("fr");
    expect(rs[0]?.match).toBeUndefined();
    const frRows = rs.filter((r) => r.languageSubtag === "fr");
    expect(frRows.length).toBeGreaterThan(1);
    expect(frRows.some((r) => r.match?.name === "American Koine French")).toBe(true);
  });

  it("Sursilvan -> Romansh", () => {
    const rs = merged("Sursilvan");
    expect(rs[0]?.languageSubtag).toBe("rm");
    expect(rs[0]?.match?.relation).toBe("dialect");
  });

  it("langtags dialect name (C2): Rabinal -> Achi with the acr-x-rabinal tagset", () => {
    const rs = merged("Rabinal");
    expect(rs[0]?.languageSubtag).toBe("acr");
    expect(rs[0]?.match).toMatchObject({ relation: "dialect", source: "langtags", dialectTag: "acr-x-rabinal" });
  });

  it("langtags variant name (C2): Valencian -> Catalan with the ca-valencia tagset", () => {
    const rs = merged("Valencian");
    const ca = rs.find((r) => r.languageSubtag === "ca");
    expect(ca?.match).toMatchObject({ relation: "variety", dialectTag: "ca-valencia" });
    expect(codes(rs).indexOf("ca")).toBeLessThan(2);
  });

  it("a generic dialect word is found with the language's name, and the plain language name carries no match", () => {
    // pac-x-diacado: the dialect word alone is not what the language is called.
    expect(merged("Pacoh")[0]?.match).toBeUndefined();
    const rs = merged("Pacoh Diacado");
    expect(rs.some((r) => r.languageSubtag === "pac" && r.match?.dialectTag === "pac-x-diacado")).toBe(true);
  });

  it("tagsets of one language that carry the same name are each their own result (SC-002)", () => {
    const rs = merged("Uripiv-Wala-Rano-Atchin");
    const tags = rs.filter((r) => r.languageSubtag === "upv").map((r) => r.match?.dialectTag);
    expect(tags).toEqual(expect.arrayContaining(["upv-x-atchin", "upv-x-wala"]));
  });

  it("accents (FR-005): Gascón finds Occitan through the dialect searcher", () => {
    const rs = merged("Gascón");
    expect(rs.some((r) => r.languageSubtag === "oc" && r.match?.glottocode === "gasc1240")).toBe(true);
  });
});

describe("merge rule (C1)", () => {
  it("places a close dialect hit before every fuzzy chooser result (Rabinal has 5 fuzzy rows)", () => {
    const raw = searchForLanguage("Rabinal");
    expect(raw.length).toBeGreaterThanOrEqual(6);
    const out = modify(raw, "Rabinal");
    expect(out[0]?.languageSubtag).toBe("acr");
    // Every chooser row that does not carry the name comes after Achi.
    expect(out.filter((r) => r.languageSubtag === "acr")).toHaveLength(1);
  });

  it("a language with its own ISO code ranks above a dialect of the same name (Gheg -> aln, FR-003)", () => {
    expect(merged("Gheg")[0]?.languageSubtag).toBe("aln");
    // The query names the language, so its row stands plain; the dialects are
    // separate rows behind it.
    expect(merged("Gheg")[0]?.match).toBeUndefined();
    expect(merged("Gheg").filter((r) => r.languageSubtag === "aln").length).toBeGreaterThan(1);
  });

  it("does not duplicate a parent that is already listed; its row gains the match", () => {
    const occitan = lang("oc", "Occitan", { iso639_3_code: "oci", names: ["Provençal"] });
    const out = dialectResultModifier(searcher, () => undefined)([occitan], "Gascon");
    expect(out.filter((r) => r.languageSubtag === "oc")).toHaveLength(1);
    expect(out.find((r) => r.languageSubtag === "oc")?.match?.glottocode).toBe("gasc1240");
  });

  it("a fuzzy row that a close dialect name points at moves into the close group", () => {
    const filler = lang("zzq", "Unrelated Tongue");
    const occitan = lang("oc", "Zxcvb Occitan", { iso639_3_code: "oci" });
    const out = dialectResultModifier(searcher, () => undefined)([filler, occitan], "Gascon");
    expect(codes(out)[0]).toBe("oc");
  });

  it("does not mutate the rows it is given", () => {
    const occitan = lang("oc", "Occitan", { iso639_3_code: "oci" });
    dialectResultModifier(searcher, () => undefined)([occitan], "Gascon");
    expect(occitan.match).toBeUndefined();
  });

  it("maps macrolanguage parents (cmn -> zh, arb -> ar) before asking for the parent", () => {
    const rows = [
      { kind: "dialect", name: "Testish", folded: "testish", glottocode: "test1234", parentIso: "cmn", countries: ["CN"] },
      { kind: "dialect", name: "Arabish", folded: "arabish", glottocode: "arab1234", parentIso: "arb", countries: ["SA"] },
    ] as const;
    const parentFor = vi.fn((iso: string) => lang(iso, iso));
    const m = dialectResultModifier(makeDialectSearcher(rows, []), parentFor);
    expect(m([], "Testish")[0]?.languageSubtag).toBe("zh");
    expect(m([], "Arabish")[0]?.languageSubtag).toBe("ar");
    expect(parentFor.mock.calls.map((c) => c[0])).toEqual(["zh", "ar"]);
  });

  it("the real parentFor resolves the Chinese macrolanguage card as zh", () => {
    expect(defaultParentFor("cmn")?.languageSubtag).toBe("zh");
    expect(defaultParentFor("arb")?.languageSubtag).toBe("ar");
  });

  it("an unresolvable parent becomes a fallback row (the ISO code, as the name)", () => {
    const rows = [
      { kind: "dialect", name: "Nowhereish", folded: "nowhereish", glottocode: "nowh1234", parentIso: "qqq", countries: [] },
    ] as const;
    const out = dialectResultModifier(makeDialectSearcher(rows, []), () => undefined)([], "Nowhereish");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ languageSubtag: "qqq", iso639_3_code: "qqq", exonym: "qqq" });
    expect(out[0]?.match?.glottocode).toBe("nowh1234");
  });

  it("multi-parent (U2): a prefix matching dialects of two parents lists both, each with countries (FR-004)", () => {
    const rows = [
      { kind: "dialect", name: "Foobarish", folded: "foobarish", glottocode: "foob1234", parentIso: "aaa", countries: ["CM"] },
      { kind: "dialect", name: "Foobar Nord", folded: "foobar nord", glottocode: "foob1235", parentIso: "bbb", countries: ["NG"] },
    ] as const;
    const out = dialectResultModifier(
      makeDialectSearcher(rows, []),
      (iso) => lang(iso, `Lang ${iso}`),
    )([], "Foobar");
    expect(codes(out).sort()).toEqual(["aaa", "bbb"]);
    expect(out.find((r) => r.languageSubtag === "aaa")?.match?.countries).toEqual(["CM"]);
    expect(out.find((r) => r.languageSubtag === "bbb")?.match?.countries).toEqual(["NG"]);
  });

  it("leaves a query shorter than two characters alone", () => {
    expect(dialectResultModifier(searcher, () => undefined)([], "G")).toEqual([]);
  });

  it("a short query with listed rows returns them instead of hanging (walk 6c)", () => {
    // EthnoLib's match-marker loops forever on an empty needle, and the
    // chooser clears the search string while results are still listed
    // (dialect fallback, clearing the field). Before the guard this hung
    // the page and crashed it with RangeError: Invalid array length.
    const occitan = lang("oc", "Occitan");
    const empty = modify([occitan], "");
    expect(empty).toHaveLength(1);
    expect(empty[0]?.languageSubtag).toBe("oc");
    expect(modify([occitan], "o")).toHaveLength(1);
  });

  it("keeps the chooser's match markers on rows it passes through", () => {
    const out = merged("Bafut");
    const first = out[0];
    expect(stripDemarcation(first?.exonym)).toBe("Bafut");
  });
});
