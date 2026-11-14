// Spec 115 T069: the languages with no ISO 639-3 code are searchable (FR-043) and
// each ends in a well-formed tag and a proposed script (SC-011).

import { beforeAll, describe, expect, it } from "vitest";
import { searchForLanguage } from "@ethnolib/find-language";
import { parseBcp47 } from "@keyboard-studio/contracts";
import { dialectRows } from "@keyboard-studio/glottolog/dialects";
import { loadLangtags } from "../../lib/langtagsDefaults.ts";
import { languageResultsFor } from "../resolveTypedLanguage.ts";
import { loadChooserModifier, type ChooserModifier } from "./chooserSearch.ts";
import { fold, type ChooserLanguage } from "./dialectSearch.ts";
import { plainText } from "./LanguageCard.tsx";
import { proposeScriptForUncoded, proposeUncodedTag } from "./uncodedLanguage.ts";

let modifier: ChooserModifier;

beforeAll(async () => {
  searchForLanguage("ab");
  await loadLangtags();
  modifier = await loadChooserModifier({ glottolog: true });
}, 120_000);

describe("uncoded languages in the search", () => {
  it("a row is its own result: no code, with Glottolog's code and countries", () => {
    const mansim = dialectRows.find((r) => r.kind === "uncoded-language" && r.name === "Mansim");
    expect(mansim).toBeDefined();
    const hit = languageResultsFor("Mansim", modifier).find((r) => r.uncoded?.glottocode === mansim!.glottocode);
    expect(hit).toBeDefined();
    expect(hit?.languageSubtag).toBe("");
    expect(hit?.uncoded?.countries).toEqual(mansim!.countries);
  });

  it("a no-code name that collides with a coded language ranks below it but is still listed", async () => {
    // Names Glottolog gives a language with no code that langtags also gives a coded one.
    const mod = await loadLangtags();
    const coded = new Set(mod.listLanguages().map((l) => fold(l.englishName)));
    const collisions = dialectRows.filter((r) => r.kind === "uncoded-language" && r.countries.length > 0 && coded.has(fold(r.name)));
    expect(collisions.length).toBeGreaterThan(0);
    // EthnoLib does not list every langtags name (sign languages, for one): check the
    // collisions it does list as a coded language.
    let checked = 0;
    for (const r of collisions.slice(0, 25)) {
      const results: ChooserLanguage[] = languageResultsFor(r.name, modifier);
      const codedAt = results.findIndex((x) => x.uncoded === undefined && fold(plainText(x.exonym)) === fold(r.name));
      if (codedAt < 0) continue;
      const uncodedAt = results.findIndex((x) => x.uncoded?.glottocode === r.glottocode);
      expect(uncodedAt, r.name).toBeGreaterThan(codedAt);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("SC-011: all no-code languages with countries are listed by name, and each ends in a tag and a script", () => {
    const rows = dialectRows.filter((r) => r.kind === "uncoded-language" && r.countries.length > 0);
    expect(rows.length).toBe(752);
    const missing: string[] = [];
    for (const r of rows) {
      const hit = languageResultsFor(r.name, modifier).find((x) => x.uncoded?.glottocode === r.glottocode);
      if (hit === undefined) {
        missing.push(`${r.name} (${r.glottocode})`);
        continue;
      }
      const info = hit.uncoded!;
      const tag = proposeUncodedTag({ languageName: info.name, countries: info.countries });
      expect(parseBcp47(tag).ok, tag).toBe(true);
      const script = proposeScriptForUncoded({ glottocode: info.glottocode, countries: info.countries });
      expect(script.script).toMatch(/^[A-Z][a-z]{3}$/);
      expect(["relatives", "country", "fallback"]).toContain(script.source);
    }
    expect(missing).toEqual([]);
  }, 900_000);
});
