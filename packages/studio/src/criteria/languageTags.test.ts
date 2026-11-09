// The /review language-tag rows: 10.3 Met/Not met, 12.1 Not met, and the
// positive facts behind 10.4/10.5/12.5/12.6's Not applicable — then the
// resolver taking them up in foreign mode only. The real langtags lookups
// (engine) pin the minimality cases to the vendored data.

import { describe, expect, it } from "vitest";

import { ALL_CRITERIA } from "@keyboard-studio/contracts";
import {
  getLanguageDefaults,
  langtagsScripts,
  macrolanguageMembers,
  resolveLangtag,
} from "@keyboard-studio/engine/langtags";
import { getLanguoid } from "@keyboard-studio/glottolog";

import { EMPTY_CRITERIA_RECORD } from "./criteriaTypes.ts";
import type { CriteriaInput } from "./criteriaTypes.ts";
import { ARTIFICIAL_LANGUAGE_FAMILY } from "./judgeForeign.ts";
import {
  ISO_639_3_REQUEST_POINTER,
  analyzeLanguageTags,
  isPrivateUseLanguage,
  languageTagContextLines,
  languageTagFacts,
  languageTagVerdicts,
  type ConlangLookup,
  type LangtagsTagLookup,
  type ScriptProfile,
} from "./languageTags.ts";
import { resolveCriteria } from "./resolveCriteria.ts";

const LANGTAGS: LangtagsTagLookup = {
  resolve: resolveLangtag,
  scripts: langtagsScripts,
  iso639_3: (lang) => getLanguageDefaults(lang)?.iso639_3,
  members: macrolanguageMembers,
};
// Glottolog lists individual languages only: macrolanguage codes are absent.
const MACRO_ISOS = new Set(["que", "swa", "ara"]);
const CONLANG: ConlangLookup = (iso) =>
  iso === "epo" ? "constructed" : iso === "zzz" || MACRO_ISOS.has(iso) ? null : "natural";
const profile = (dominant: string, evidenceSize = 40): ScriptProfile => ({
  distribution: { [dominant]: 1 },
  dominant,
  dominantShare: 1,
  evidenceSize,
});

const analyze = (tags: string[], p: ScriptProfile | undefined = profile("Latn")) =>
  analyzeLanguageTags(tags, LANGTAGS, CONLANG, p);

describe("10.3 minimal tags", () => {
  it("Not met names the shorter tag langtags reads the same", () => {
    const v = languageTagVerdicts(analyze(["fr-FR", "en-Latn-US", "fr-CA"]));
    expect(v.get("10.3-kps-tags-minimal")).toEqual({
      status: "not-met",
      lines: [
        "fr-FR is not minimal: langtags reads fr as the same tag (fr-Latn-FR).",
        "en-Latn-US is not minimal: langtags reads en as the same tag (en-Latn-US).",
      ],
    });
  });

  it("an extra-region tag keeps its region and drops the default script", () => {
    const a = analyze(["fr-Latn-BF"]);
    expect(a.tags[0]!.shorterEquivalents).toEqual(["fr-BF"]);
  });

  it("two equally short equivalents are both named", () => {
    const a = analyze(["pa-Arab-PK"], profile("Arab"));
    expect(a.tags[0]!.shorterEquivalents).toEqual(["pa-PK", "pa-Arab"]);
  });

  it("Met when every tag is known and none can drop a subtag", () => {
    const v = languageTagVerdicts(analyze(["fr", "fr-CA", "sr-Latn"]));
    expect(v.get("10.3-kps-tags-minimal")?.status).toBe("met");
    // pa-Arab is not langtags' canonical pa-PK, but has no unnecessary subtag.
    expect(
      languageTagVerdicts(analyze(["pa-Arab"], profile("Arab"))).get("10.3-kps-tags-minimal")
        ?.status,
    ).toBe("met");
  });

  it("an unknown tag leaves the row with the reviewer", () => {
    const a = analyze(["fr", "xyz-Abcd"]);
    expect(languageTagVerdicts(a).has("10.3-kps-tags-minimal")).toBe(false);
    expect(languageTagContextLines("10.3-kps-tags-minimal", a)).toEqual([
      "xyz-Abcd: not in langtags, so minimality cannot be checked.",
    ]);
  });
});

describe("10.4 / 10.5 facts", () => {
  it("all tags in langtags -> 10.4's fact; an unknown one withholds it", () => {
    expect(languageTagFacts(analyze(["fr-BF", "en"])).kpsTagsAllInLangtags).toBe(true);
    expect(languageTagFacts(analyze(["fr", "ha-Zzzz"])).kpsTagsAllInLangtags).toBeUndefined();
  });

  it("a private-use language code (qaa to qtz) is flagged, never an unremarkable tag (FR-032)", () => {
    const a = analyze(["qaa-ID-x-mansim"]);
    expect(a.tags[0]!.privateUseLanguage).toBe(true);
    expect(languageTagFacts(a).kpsTagsAllInLangtags).toBeUndefined();
    const lines = languageTagContextLines("10.4-kps-unusual-tag-flagged", a);
    expect(lines[0]).toMatch(/^qaa-ID-x-mansim: a private-use language code \(qaa to qtz\)/);
    expect(lines[0]).toContain(ISO_639_3_REQUEST_POINTER);
    // Every code in the range, and only those.
    for (const lang of ["qaa", "qkx", "qtz"]) expect(isPrivateUseLanguage(lang)).toBe(true);
    for (const lang of ["qu", "qua", "quz", "fr"]) expect(isPrivateUseLanguage(lang)).toBe(false);
    // A real tag next to it does not hide it, and a keyboard with only real tags is unaffected.
    expect(languageTagFacts(analyze(["fr", "qaa-x-foo"])).kpsTagsAllInLangtags).toBeUndefined();
    expect(languageTagFacts(analyze(["fr", "en"])).kpsTagsAllInLangtags).toBe(true);
  });

  it("shows the Glottolog code of a language with no ISO code beside the 10.4 flag (FR-045)", () => {
    const a = analyzeLanguageTags(["qaa-ID-x-mansim"], LANGTAGS, CONLANG, undefined, "mans1260");
    expect(languageTagContextLines("10.4-kps-unusual-tag-flagged", a)).toContain("Glottolog code of the language: mans1260.");
    expect(languageTagContextLines("10.4-kps-unusual-tag-flagged", analyze(["qaa-x-foo"])).join(" ")).not.toContain("Glottolog code");
  });

  it("10.5's fact needs every language natural in Glottolog", () => {
    expect(languageTagFacts(analyze(["fr", "ha"])).kpsTagsNoConstructed).toBe(true);
    const eo = analyze(["fr", "eo"]);
    expect(languageTagFacts(eo).kpsTagsNoConstructed).toBeUndefined();
    expect(languageTagContextLines("10.5-kps-conlang-flagged", eo)).toContain(
      "eo: a constructed language (Glottolog: Artificial Language).",
    );
    // Not in Glottolog: no fact either.
    expect(languageTagFacts(analyze(["zzz"])).kpsTagsNoConstructed).toBeUndefined();
  });

  it("a macrolanguage Glottolog lacks is read from its members", () => {
    const a = analyze(["qu-BO", "sw"]);
    expect(languageTagFacts(a).kpsTagsNoConstructed).toBe(true);
    expect(a.tags[0]!.macrolanguageMembers).toBeGreaterThan(1);
    expect(languageTagContextLines("10.5-kps-conlang-flagged", a)[0]).toMatch(
      /^qu-BO: a macrolanguage; Glottolog classifies all \d+ of its member languages as natural\.$/,
    );
  });

  it("context lists the tags needing the reviewer first, then summarises the rest", () => {
    const tags = ["fr", "de", "it", "es", "pt", "nl", "sv", "eo"];
    const lines = languageTagContextLines("10.5-kps-conlang-flagged", analyze(tags));
    expect(lines[0]).toBe("eo: a constructed language (Glottolog: Artificial Language).");
    expect(lines).toHaveLength(7);
    expect(lines[6]).toBe("...and 2 more tags natural languages (Glottolog).");
  });

  it("the pinned Artificial Language glottocode is what the constant names", () => {
    expect(getLanguoid(ARTIFICIAL_LANGUAGE_FAMILY)?.name).toBe("Artificial Language");
  });
});

describe("12.1 / 12.5 script", () => {
  it("12.1 Not met when output is confidently in a script the tag does not mean", () => {
    const v = languageTagVerdicts(analyze(["ha"], profile("Arab")));
    expect(v.get("12.1-bcp47-tag-correct")).toEqual({
      status: "not-met",
      lines: [
        "The keyboard's output is 100% Arab (40 characters).",
        "ha means Latn script to langtags (ha-Latn-NG), which the output does not use; a script subtag may be missing.",
      ],
    });
  });

  it("12.1 never Met: agreement leaves the row with the reviewer", () => {
    const a = analyze(["ha-Arab"], profile("Arab"));
    expect(languageTagVerdicts(a).has("12.1-bcp47-tag-correct")).toBe(false);
    expect(languageTagContextLines("12.1-bcp47-tag-correct", a)).toContain(
      "ha-Arab: Arab script, 100% of the output.",
    );
  });

  it("too little or mixed output is not judged", () => {
    expect(
      languageTagVerdicts(analyze(["ha"], profile("Arab", 3))).has("12.1-bcp47-tag-correct"),
    ).toBe(false);
    const mixed: ScriptProfile = {
      distribution: { Arab: 0.6, Latn: 0.4 },
      dominant: "Arab",
      dominantShare: 0.6,
      evidenceSize: 40,
    };
    const a = analyze(["ha"], mixed);
    expect(languageTagVerdicts(a).has("12.1-bcp47-tag-correct")).toBe(false);
    expect(languageTagFacts(a).outputScriptRecordedByLangtags).toBeUndefined();
  });

  it("a tag script naming several Unicode scripts counts them all", () => {
    const a = analyze(["ja"], {
      distribution: { Hani: 0.5, Hira: 0.5 },
      dominant: "Hani",
      dominantShare: 0.5,
      evidenceSize: 40,
    });
    expect(languageTagContextLines("12.1-bcp47-tag-correct", a)).toContain(
      "ja: Jpan script, 100% of the output.",
    );
  });

  it("a deprecated code reads its scripts from the language langtags folds it into", () => {
    // ajp is listed under apc-JO.
    const a = analyze(["ajp-Arab"], profile("Arab"));
    expect(a.tags[0]!.recordedScripts).toContain("Arab");
    expect(languageTagFacts(a).outputScriptRecordedByLangtags).toBe(true);
    expect(languageTagVerdicts(a).get("10.3-kps-tags-minimal")?.lines).toEqual([
      "ajp-Arab is not minimal: langtags reads ajp as the same tag (apc-Arab-JO). langtags folds ajp into apc.",
    ]);
  });

  it("12.5's fact when langtags records the output script for every language", () => {
    expect(
      languageTagFacts(analyze(["ha"], profile("Arab"))).outputScriptRecordedByLangtags,
    ).toBe(true);
    const a = analyze(["fr"], profile("Thai"));
    expect(languageTagFacts(a).outputScriptRecordedByLangtags).toBeUndefined();
    expect(
      languageTagContextLines("12.5-script-mismatch-flagged", a).some((l) =>
        l.startsWith("fr: langtags records") && l.endsWith("not the output's Thai."),
      ),
    ).toBe(true);
  });
});

describe("the resolver takes reviewer verdicts in foreign mode only", () => {
  const verdicts = languageTagVerdicts(analyze(["fr-FR"]));
  const input = (mode: CriteriaInput["mode"]): CriteriaInput => ({
    criteria: ALL_CRITERIA,
    mode,
    lintFindings: [],
    record: EMPTY_CRITERIA_RECORD,
    facts: { fontBundled: true, deprecated: true, partnerPackage: true },
    reviewerVerdicts: verdicts,
  });
  const row103 = (mode: CriteriaInput["mode"]) =>
    resolveCriteria(input(mode)).rows.find((r) => r.criterion.id === "10.3-kps-tags-minimal")!;

  it("foreign: the verdict decides, with its lines as evidence", () => {
    const row = row103("foreign");
    expect(row.status).toBe("not-met");
    expect(row.controls).toBeNull();
    expect(row.evidence()).toEqual({
      kind: "reviewer-verdict",
      lines: ["fr-FR is not minimal: langtags reads fr as the same tag (fr-Latn-FR)."],
    });
  });

  it("authored: the author's attestation decides, not the verdict", () => {
    expect(row103("authored").status).toBe("needs-author");
  });
});
