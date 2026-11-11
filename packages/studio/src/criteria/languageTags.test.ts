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
  minimalTagOf,
  resolveLangtag,
  variantAllowed,
  variantEntry,
} from "@keyboard-studio/engine/langtags";
import { getLanguoid } from "@keyboard-studio/glottolog";

import { EMPTY_CRITERIA_RECORD } from "./criteriaTypes.ts";
import type { CriteriaAssemblyVerdict, CriteriaInput } from "./criteriaTypes.ts";
import { ARTIFICIAL_LANGUAGE_FAMILY } from "./judgeForeign.ts";
import {
  ISO_639_3_REQUEST_POINTER,
  analyzeLanguageTags,
  isPrivateUseLanguage,
  languageTagContextLines,
  languageTagFacts,
  languageTagFindings,
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
  minimalTagOf,
  variantAllowed,
  variantEntry,
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
    const v = languageTagVerdicts(analyze(["fr-Latn-BF"]));
    expect(v.get("10.3-kps-tags-minimal")).toEqual({
      status: "not-met",
      lines: ["fr-Latn-BF is not minimal: langtags reads fr-BF as the same tag (fr-Latn-BF)."],
    });
  });

  it("one minimal form is named, not every equally short equivalent", () => {
    // pa-Arab-PK has two equally short equivalents under the old
    // drop-a-subtag rule (pa-PK, pa-Arab); minimalTagOf names pa-PK.
    const v = languageTagVerdicts(analyze(["pa-Arab-PK"], profile("Arab")));
    expect(v.get("10.3-kps-tags-minimal")).toEqual({
      status: "not-met",
      lines: ["pa-Arab-PK is not minimal: langtags reads pa-PK as the same tag (pa-Arab-PK)."],
    });
  });

  it("a duplicate minimal form is Not met on the duplicate's line", () => {
    const v = languageTagVerdicts(analyze(["fr-FR", "fr"]));
    expect(v.get("10.3-kps-tags-minimal")).toEqual({
      status: "not-met",
      lines: [
        "fr-FR is not minimal: langtags reads fr as the same tag (fr-Latn-FR).",
        "fr has the same minimal form (fr) as fr-FR.",
      ],
    });
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

describe("languageTagFindings (FR-019 to FR-022)", () => {
  it("an ill-formed tag is an error, and nothing else is checked for it", () => {
    expect(languageTagFindings(["sq-AL-gheg"], LANGTAGS)).toEqual([
      {
        tag: "sq-AL-gheg",
        kind: "error",
        message: "sq-AL-gheg is not a well-formed BCP 47 tag.",
      },
    ]);
    // A 4-letter alpha subtag can never be a variant: the error is
    // grammatical, not a registry miss. A duplicated variant fails the
    // same way, and draws no warning on top of the error.
    expect(languageTagFindings(["fr-1694acad-1694acad"], LANGTAGS)).toEqual([
      {
        tag: "fr-1694acad-1694acad",
        kind: "error",
        message: "fr-1694acad-1694acad is not a well-formed BCP 47 tag.",
      },
    ]);
  });

  it("a non-minimal tag is a hint naming its minimal form (FR-020)", () => {
    expect(languageTagFindings(["sr-Latn-RS"], LANGTAGS)).toEqual([
      {
        tag: "sr-Latn-RS",
        kind: "hint",
        message: "sr-Latn-RS is not minimal: use sr-Latn.",
        replacement: "sr-Latn",
      },
    ]);
    expect(languageTagFindings(["fr-FR", "en-Latn-US", "fr-Latn-BF"], LANGTAGS)).toEqual([
      {
        tag: "fr-FR",
        kind: "hint",
        message: "fr-FR is not minimal: use fr.",
        replacement: "fr",
      },
      {
        tag: "en-Latn-US",
        kind: "hint",
        message: "en-Latn-US is not minimal: use en.",
        replacement: "en",
      },
      {
        tag: "fr-Latn-BF",
        kind: "hint",
        message: "fr-Latn-BF is not minimal: use fr-BF.",
        replacement: "fr-BF",
      },
    ]);
    // One minimal form only: pa-Arab-PK has two equally short equivalents
    // under the old drop-a-subtag rule, but minimalTagOf names pa-PK.
    expect(languageTagFindings(["pa-Arab-PK"], LANGTAGS)).toEqual([
      {
        tag: "pa-Arab-PK",
        kind: "hint",
        message: "pa-Arab-PK is not minimal: use pa-PK.",
        replacement: "pa-PK",
      },
    ]);
    // Case alone is non-minimal: tags are emitted in conventional case (FR-016).
    expect(languageTagFindings(["FR"], LANGTAGS)).toEqual([
      {
        tag: "FR",
        kind: "hint",
        message: "FR is not minimal: use fr.",
        replacement: "fr",
      },
    ]);
  });

  it("a minimal tag passes: dialects, private use and bare languages", () => {
    expect(
      languageTagFindings(
        ["oc-gascon", "oc-aranes", "acr-x-rabinal", "ewo-x-yabekolo", "fr", "en", "qaa-Latn-PE-x-sechuran-olmos"],
        LANGTAGS,
      ),
    ).toEqual([]);
  });

  it("a registered variant its prefixes do not allow is a warning (FR-021)", () => {
    expect(languageTagFindings(["ca-gascon"], LANGTAGS)).toEqual([
      {
        tag: "ca-gascon",
        kind: "warning",
        message: "ca-gascon: the registered variant gascon is allowed after oc, not after ca.",
      },
    ]);
    // abl1943 needs pt-BR: the bare pt tag does not allow it.
    expect(languageTagFindings(["pt-abl1943"], LANGTAGS)).toEqual([
      {
        tag: "pt-abl1943",
        kind: "warning",
        message: "pt-abl1943: the registered variant abl1943 is allowed after pt-BR, not after pt.",
      },
    ]);
    // Allowed variants pass, including a prefix that needs an earlier variant.
    expect(
      languageTagFindings(["oc-gascon", "fr-1694acad", "sl-rozaj-biske-1994"], LANGTAGS),
    ).toEqual([]);
  });

  it("an unregistered variant shape is well-formed and draws no finding", () => {
    // gasco is 5 letters, so grammatically a variant, but the registry has
    // no such variant: FR-021 covers registered variants only, and kmc's
    // Intl.Locale accepts it too, so parity holds by saying nothing.
    expect(languageTagFindings(["en-gasco"], LANGTAGS)).toEqual([]);
  });

  it("two tags with the same minimal form are a duplicate hint (FR-022)", () => {
    expect(languageTagFindings(["fr-FR", "fr"], LANGTAGS)).toEqual([
      {
        tag: "fr-FR",
        kind: "hint",
        message: "fr-FR is not minimal: use fr.",
        replacement: "fr",
      },
      {
        tag: "fr",
        kind: "hint",
        message: "fr has the same minimal form (fr) as fr-FR.",
        duplicateOf: "fr-FR",
      },
    ]);
    // The duplicate attaches to the later tag, whatever the order.
    expect(languageTagFindings(["fr", "fr-FR"], LANGTAGS)).toEqual([
      {
        tag: "fr-FR",
        kind: "hint",
        message: "fr-FR is not minimal: use fr.",
        replacement: "fr",
      },
      {
        tag: "fr-FR",
        kind: "hint",
        message: "fr-FR has the same minimal form (fr) as fr.",
        duplicateOf: "fr",
      },
    ]);
  });
});

describe("12.8 / 12.9 verdicts (FR-019, FR-021)", () => {
  it("12.8 Not met names the ill-formed tag; Met lists the tags", () => {
    const bad = languageTagVerdicts(analyze(["sq-AL-gheg", "fr"]));
    expect(bad.get("12.8-bcp47-tag-well-formed")).toEqual({
      status: "not-met",
      lines: ["sq-AL-gheg is not a well-formed BCP 47 tag."],
    });
    // An ill-formed tag cannot be judged for minimality: 10.3 stays with
    // the reviewer, and 12.8 is the row that speaks.
    expect(bad.has("10.3-kps-tags-minimal")).toBe(false);
    expect(languageTagVerdicts(analyze(["oc-gascon"])).get("12.8-bcp47-tag-well-formed")).toEqual({
      status: "met",
      lines: ["All 1 .kps language tag(s) are well-formed BCP 47 tags:", "oc-gascon"],
    });
    expect(
      languageTagContextLines("12.8-bcp47-tag-well-formed", analyze(["sq-AL-gheg", "fr"])),
    ).toEqual(["sq-AL-gheg is not a well-formed BCP 47 tag.", "fr: well-formed."]);
  });

  it("12.9 Not met names the disallowed variant; Met lists the variant tags", () => {
    expect(languageTagVerdicts(analyze(["ca-gascon"])).get("12.9-bcp47-variant-prefix")).toEqual({
      status: "not-met",
      lines: ["ca-gascon: the registered variant gascon is allowed after oc, not after ca."],
    });
    expect(languageTagVerdicts(analyze(["oc-gascon"])).get("12.9-bcp47-variant-prefix")).toEqual({
      status: "met",
      lines: [
        "Every registered variant in the .kps language tags is used with a language its registry prefixes allow:",
        "oc-gascon",
      ],
    });
    expect(languageTagVerdicts(analyze(["fr"])).get("12.9-bcp47-variant-prefix")).toEqual({
      status: "met",
      lines: ["No .kps language tag carries a registered variant."],
    });
    expect(
      languageTagContextLines("12.9-bcp47-variant-prefix", analyze(["ca-gascon", "oc-gascon", "fr"])),
    ).toEqual([
      "ca-gascon: the registered variant gascon is allowed after oc, not after ca.",
      "oc-gascon: its registered variants are allowed here.",
      "fr: no registered variant.",
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
    // 10.3 is now judged by minimalTagOf, which never renames a language:
    // ajp-Arab is already minimal, so the row is Met and the fold shows in
    // the Met line's full form instead of a Not-met line.
    expect(languageTagVerdicts(a).get("10.3-kps-tags-minimal")).toEqual({
      status: "met",
      lines: [
        "No script or region subtag in the 1 .kps language tag(s) can be dropped without changing what langtags reads the tag as:",
        "ajp-Arab (apc-Arab-JO)",
      ],
    });
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
  const input = (
    mode: CriteriaInput["mode"],
    reviewerVerdicts: Map<string, CriteriaAssemblyVerdict> = verdicts,
  ): CriteriaInput => ({
    criteria: ALL_CRITERIA,
    mode,
    lintFindings: [],
    record: EMPTY_CRITERIA_RECORD,
    facts: { fontBundled: true, deprecated: true, partnerPackage: true },
    reviewerVerdicts,
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

  it("12.8/12.9: the verdicts decide in foreign mode too", () => {
    const v2 = languageTagVerdicts(analyze(["sq-AL-gheg", "ca-gascon"]));
    const row = (mode: CriteriaInput["mode"], id: string) =>
      resolveCriteria(input(mode, v2)).rows.find((r) => r.criterion.id === id)!;
    expect(row("foreign", "12.8-bcp47-tag-well-formed").status).toBe("not-met");
    expect(row("foreign", "12.9-bcp47-variant-prefix").status).toBe("not-met");
    expect(row("authored", "12.8-bcp47-tag-well-formed").status).toBe("needs-author");
    expect(row("authored", "12.9-bcp47-variant-prefix").status).toBe("needs-author");
  });
});
