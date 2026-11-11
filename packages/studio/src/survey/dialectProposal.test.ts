// dialectProposal.test — spec 115 T045 (US2, Wave 1).
//
// proposeDialect(choice, searchMatch): the FR-008 preference order —
// registered variant, then the langtags tagset, then a subtag made from the
// name — plus the FR-011 made-from-name rule and the edit validation.

import { describe, expect, it, beforeAll } from "vitest";
import type { DialectTagset, SearchMatch } from "@keyboard-studio/contracts";
import { loadLangtags } from "../lib/langtagsDefaults.ts";
import {
  proposeDialect,
  validateDialectSubtag,
  type DialectEnvironment,
} from "./dialectProposal.ts";

beforeAll(async () => {
  await loadLangtags();
});

const gasconMatch: SearchMatch = {
  name: "Gascon",
  relation: "dialect",
  source: "glottolog",
  glottocode: "gasc1240",
  countries: ["ES", "FR"],
};

describe("proposeDialect — preference order (FR-008)", () => {
  it("prefers the registered variant for Gascon: oc-gascon", () => {
    const proposal = proposeDialect({ language: "oc", script: "Latn", region: "FR" }, gasconMatch);
    expect(proposal).toEqual({
      subtag: "gascon",
      source: "registered-variant",
      fullTag: "oc-gascon",
      glottocode: "gasc1240",
    });
  });

  it("prefers the langtags tagset for Rabinal: acr-x-rabinal", () => {
    const proposal = proposeDialect(
      { language: "acr", script: "Latn", region: "GT" },
      { name: "Rabinal", relation: "dialect", source: "langtags", dialectTag: "acr-x-rabinal" },
    );
    expect(proposal).toEqual({
      subtag: "x-rabinal",
      source: "langtags",
      fullTag: "acr-x-rabinal",
    });
  });

  it("a registered variant wins over the langtags tagset carrying the same tag: ca-valencia", () => {
    const proposal = proposeDialect(
      { language: "ca", script: "Latn", region: "ES" },
      { name: "Valencian", relation: "variety", source: "langtags", dialectTag: "ca-valencia" },
    );
    expect(proposal).toEqual({
      subtag: "valencia",
      source: "registered-variant",
      fullTag: "ca-valencia",
    });
  });

  it("a typed pending name proposes a private-use subtag, source typed", () => {
    const proposal = proposeDialect(
      { language: "ewo", script: "Latn", region: "CM" },
      { name: "Yabekolo", relation: "dialect", source: "typed" },
    );
    expect(proposal).toEqual({
      subtag: "x-yabekolo",
      source: "typed",
      fullTag: "ewo-x-yabekolo",
    });
  });

  it("a Glottolog dialect with neither variant nor tagset proposes from the name", () => {
    const proposal = proposeDialect(
      { language: "ewo", script: "Latn", region: "CM" },
      { name: "Yabekolo", relation: "dialect", source: "glottolog", glottocode: "yabe1234" },
    );
    expect(proposal?.subtag).toBe("x-yabekolo");
    expect(proposal?.source).toBe("from-name");
    expect(proposal?.fullTag).toBe("ewo-x-yabekolo");
    expect(proposal?.glottocode).toBe("yabe1234");
  });

  it("returns null with no search match", () => {
    expect(proposeDialect({ language: "ewo" }, null)).toBeNull();
    expect(proposeDialect({ language: "ewo" }, undefined)).toBeNull();
  });

  it("carries an IPA keyboard's fonipa variant ahead of the dialect", () => {
    const proposal = proposeDialect({ language: "oc", script: "fonipa" }, gasconMatch);
    expect(proposal?.subtag).toBe("gascon");
    expect(proposal?.fullTag).toBe("oc-fonipa-gascon");
  });
});

describe("proposeDialect — variant linked by folded description plus allowed prefix", () => {
  it("links Aranese to aranes for Occitan", () => {
    const proposal = proposeDialect(
      { language: "oc", script: "Latn", region: "FR" },
      { name: "Aranese", relation: "dialect", source: "glottolog" },
    );
    expect(proposal).toEqual({
      subtag: "aranes",
      source: "registered-variant",
      fullTag: "oc-aranes",
    });
  });

  it("folds accents when linking: Gascón links to gascon", () => {
    const proposal = proposeDialect(
      { language: "oc", script: "Latn", region: "FR" },
      { name: "Gascón", relation: "dialect", source: "glottolog", glottocode: "gasc1240" },
    );
    expect(proposal?.subtag).toBe("gascon");
    expect(proposal?.source).toBe("registered-variant");
  });

  it("links Sursilvan to sursilv for Romansh: the name is the description's first word", () => {
    const proposal = proposeDialect(
      { language: "rm", script: "Latn", region: "CH" },
      { name: "Sursilvan", relation: "dialect", source: "glottolog", glottocode: "surs1244" },
    );
    expect(proposal).toEqual({
      subtag: "sursilv",
      source: "registered-variant",
      fullTag: "rm-sursilv",
      glottocode: "surs1244",
    });
  });

  it("does not link a later word of a description: Romansh is not sursilv", () => {
    const proposal = proposeDialect(
      { language: "rm", script: "Latn", region: "CH" },
      { name: "Romansh", relation: "dialect", source: "glottolog" },
    );
    expect(proposal?.subtag).toBe("x-romansh");
    expect(proposal?.source).toBe("from-name");
  });

  it("does not link a variant whose prefixes forbid the language", () => {
    // gascon is registered for oc only; against Catalan it must not propose gascon.
    const proposal = proposeDialect(
      { language: "ca", script: "Latn", region: "ES" },
      { name: "Gascon", relation: "dialect", source: "glottolog", glottocode: "gasc1240" },
    );
    expect(proposal?.subtag).toBe("x-gascon");
    expect(proposal?.source).toBe("from-name");
  });
});

describe("proposeDialect — made-from-name rule (FR-011)", () => {
  it("folds accents, drops spaces and punctuation, truncates to 8", () => {
    const proposal = proposeDialect(
      { language: "ewo", script: "Latn" },
      { name: "Languedocien", relation: "dialect", source: "typed" },
    );
    expect(proposal?.subtag).toBe("x-languedo");
    const accented = proposeDialect(
      { language: "ewo", script: "Latn" },
      { name: "Mvog-Ada", relation: "dialect", source: "typed" },
    );
    expect(accented?.subtag).toBe("x-mvogada");
  });

  it("uses x-dialect when nothing ASCII is left of the name", () => {
    const proposal = proposeDialect(
      { language: "ewo", script: "Latn" },
      { name: "---", relation: "dialect", source: "typed" },
    );
    expect(proposal?.subtag).toBe("x-dialect");
  });

  it("adds a disambiguating digit on collision with another dialect's subtag", () => {
    const stubTagsets: readonly DialectTagset[] = [
      {
        tag: "xx-x-abcdefgh",
        full: "xx-Latn-YY-x-abcdefgh",
        language: "xx",
        dialectSubtag: "x-abcdefgh",
        names: ["Some Other Dialect"],
        localNames: [],
        variants: [],
        windows: "xx-Latn-x-abcdefgh",
      },
    ];
    const stubEnv: DialectEnvironment = {
      variantEntry: () => undefined,
      variantsFor: () => [],
      variantAllowed: () => false,
      dialectTagsetsFor: (language) => (language === "xx" ? stubTagsets : []),
      minimalTag: (choice) =>
        [choice.language, ...(choice.variants ?? []), ...(choice.privateUse?.length ? ["x", ...choice.privateUse] : [])].join("-"),
    };
    const proposal = proposeDialect(
      { language: "xx" },
      { name: "Abcdefgh!", relation: "dialect", source: "typed" },
      stubEnv,
    );
    expect(proposal?.subtag).toBe("x-abcdefg2");
    expect(proposal?.source).toBe("typed");
  });
});

describe("validateDialectSubtag — an ill-formed edit is blocked with the parser's reason", () => {
  it("accepts a registered variant and a private-use subtag", () => {
    expect(validateDialectSubtag("gascon")).toEqual({ ok: true });
    expect(validateDialectSubtag("x-rabinal")).toEqual({ ok: true });
  });

  it("blocks a subtag with a space, naming the parser's reason", () => {
    const result = validateDialectSubtag("gas con");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad-subtag");
  });

  it("blocks a variant that is too short to be a variant", () => {
    // gheg (4 letters) cannot be a variant subtag — the US4 sq-AL-gheg case.
    const result = validateDialectSubtag("gheg");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad-subtag");
  });

  it("blocks an empty private-use tail", () => {
    const result = validateDialectSubtag("x-");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad-private-use");
  });

  it("blocks a private-use part longer than 8 characters", () => {
    const result = validateDialectSubtag("x-abcdefghij");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad-private-use");
  });
});

describe("proposeDialect — the uncoded-dialect match carries its proposed tag", () => {
  it("Olmos keeps both codes: the tag from the match, the dialect glottocode alongside", () => {
    const proposal = proposeDialect(
      { language: "qaa", script: "Latn", region: "PE" },
      {
        name: "Olmos",
        relation: "dialect",
        source: "typed",
        dialectTag: "qaa-PE-x-sechuran-olmos",
        glottocode: "olmo1234",
      },
    );
    expect(proposal?.subtag).toBe("x-sechuran-olmos");
    expect(proposal?.source).toBe("typed");
    expect(proposal?.glottocode).toBe("olmo1234");
    // No langtags row for qaa: the script is explicit in the composed tag.
    expect(proposal?.fullTag).toBe("qaa-Latn-PE-x-sechuran-olmos");
  });
});
