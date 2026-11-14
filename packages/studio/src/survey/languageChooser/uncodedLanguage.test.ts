// Spec 115 T069: tags and scripts for languages with no ISO 639-3 code (FR-044, FR-046).

import { beforeAll, describe, expect, it } from "vitest";
import { parseBcp47 } from "@keyboard-studio/contracts";
import { dialectRows } from "@keyboard-studio/glottolog/dialects";
import { relatedLanguages } from "@keyboard-studio/glottolog";
import { loadLangtags } from "../../lib/langtagsDefaults.ts";
import { proposeScriptForUncoded, proposeUncodedTag, type ScriptEnvironment } from "./uncodedLanguage.ts";

beforeAll(async () => {
  await loadLangtags();
});

describe("proposeUncodedTag (the contract's table)", () => {
  it("Mansim, one country: region before -x-", () => {
    expect(proposeUncodedTag({ languageName: "Mansim", countries: ["ID"] })).toBe("qaa-ID-x-mansim");
  });

  it("Olmos, a dialect of Sechuran: a second private-use subtag", () => {
    expect(proposeUncodedTag({ languageName: "Sechuran", dialectName: "Olmos", countries: ["PE"] })).toBe("qaa-PE-x-sechuran-olmos");
  });

  it("Mansoanka, two countries: no region unless chosen", () => {
    expect(proposeUncodedTag({ languageName: "Mansoanka", countries: ["GM", "GW"] })).toBe("qaa-x-mansoank");
    expect(proposeUncodedTag({ languageName: "Mansoanka", countries: ["GM", "GW"], chosenRegion: "GM" })).toBe("qaa-GM-x-mansoank");
  });

  it("no country at all: no region", () => {
    expect(proposeUncodedTag({ languageName: "Mansim", countries: [] })).toBe("qaa-x-mansim");
  });

  it("a name with no ASCII letters still gives a usable subtag", () => {
    const tag = proposeUncodedTag({ languageName: "ꯃꯅꯤ", countries: ["IN"] });
    expect(parseBcp47(tag).ok).toBe(true);
  });

  it("every proposal for every Glottolog row with no code is well-formed", () => {
    const rows = dialectRows.filter((r) => r.kind !== "dialect");
    expect(rows.length).toBe(759 + 314);
    for (const r of rows) {
      const tag =
        r.kind === "uncoded-dialect"
          ? proposeUncodedTag({ languageName: r.parentName ?? r.name, dialectName: r.name, countries: r.countries })
          : proposeUncodedTag({ languageName: r.name, countries: r.countries });
      const parsed = parseBcp47(tag);
      expect(parsed.ok, tag).toBe(true);
      if (parsed.ok) {
        expect(parsed.parts.language).toBe("qaa");
        for (const sub of parsed.parts.privateUse) expect(sub.length).toBeLessThanOrEqual(8);
      }
    }
  });
});

describe("proposeScriptForUncoded", () => {
  const env = (over: Partial<ScriptEnvironment>): ScriptEnvironment => ({
    relativeTiers: () => [],
    defaultScript: () => undefined,
    scriptsInCountry: () => [],
    ...over,
  });

  it("takes the most common script of the closest tier that has one", () => {
    const e = env({
      relativeTiers: () => [["aaa", "bbb", "ccc"], ["ddd"]],
      defaultScript: (iso) => ({ aaa: "Arab", bbb: "Arab", ccc: "Latn", ddd: "Cyrl" })[iso],
    });
    expect(proposeScriptForUncoded({ glottocode: "x1", countries: ["ID"] }, e)).toEqual({ script: "Arab", source: "relatives", basis: ["aaa", "bbb"] });
  });

  it("skips a closest tier none of whose relatives has a script", () => {
    const e = env({ relativeTiers: () => [["aaa"], ["bbb"]], defaultScript: (iso) => (iso === "bbb" ? "Thai" : undefined) });
    expect(proposeScriptForUncoded({ glottocode: "x1", countries: [] }, e)).toMatchObject({ script: "Thai", source: "relatives" });
  });

  it("falls back to the country when there are no relatives", () => {
    const e = env({ scriptsInCountry: () => ["Latn", "Arab", "Arab"] });
    expect(proposeScriptForUncoded({ glottocode: "x1", countries: ["PK"] }, e)).toEqual({ script: "Arab", source: "country", basis: ["PK"] });
  });

  it("falls back to Latin, never blank", () => {
    expect(proposeScriptForUncoded({ countries: [] }, env({}))).toEqual({ script: "Latn", source: "fallback", basis: [] });
  });

  it("an Unclassifiable language goes to the country rule (real data)", () => {
    const row = dialectRows.find(
      (r) => r.kind === "uncoded-language" && r.countries.length > 0 && relatedLanguages(r.glottocode).length === 0,
    );
    expect(row).toBeDefined();
    const p = proposeScriptForUncoded({ glottocode: row!.glottocode, countries: row!.countries });
    expect(p.source).not.toBe("relatives");
    expect(p.script).toMatch(/^[A-Z][a-z]{3}$/);
  });

  it("a language with coded relatives takes their script (real data)", () => {
    const row = dialectRows.find((r) => r.kind === "uncoded-language" && relatedLanguages(r.glottocode).some((x) => x.languoid.iso639p3 !== undefined));
    expect(row).toBeDefined();
    const p = proposeScriptForUncoded({ glottocode: row!.glottocode, countries: row!.countries });
    expect(p.script).toMatch(/^[A-Z][a-z]{3}$/);
  });
});
