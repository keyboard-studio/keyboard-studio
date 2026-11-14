// Spec 115 T068: the SC-010 query set over the real search (EthnoLib, the dialect
// modifier and the readings): the first result is the right language with the
// right dialect or region, or, for the unresolved queries, the right language with
// the remainder chooser's first place as expected. The set lives in
// typedDialect.fixture.json, where authors' reported misses are added.

import { beforeAll, describe, expect, it } from "vitest";
import { getAllRegions, searchForLanguage } from "@ethnolib/find-language";
import { loadLangtags } from "../../lib/langtagsDefaults.ts";
import { chooserModifier, loadChooserModifier, readingsFor, type ChooserModifier } from "./chooserSearch.ts";
import { rankPlacesFor } from "./readTypedText.ts";
import fixture from "./typedDialect.fixture.json" with { type: "json" };

type Mod = Awaited<ReturnType<typeof loadLangtags>>;
let modifier: ChooserModifier;
let mod: Mod;

beforeAll(async () => {
  searchForLanguage("ab");
  mod = await loadLangtags();
  modifier = await loadChooserModifier({ glottolog: true });
  // The Glottolog rows are now loaded: rebuild the modifier over them.
  modifier = chooserModifier(mod);
}, 120_000);

describe("SC-010: resolved readings", () => {
  it.each(fixture.resolved)("$query", (row) => {
    const [first] = readingsFor(row.query, modifier, mod);
    expect(first, `no reading for ${row.query}`).toBeDefined();
    expect(first!.language.languageSubtag).toBe(row.language);
    expect(first!.unresolved).toBeUndefined();
    if ("dialectName" in row) expect(first!.dialect?.name).toBe(row.dialectName);
    if ("dialectTag" in row) expect(first!.dialect?.dialectTag).toBe(row.dialectTag);
    if ("region" in row) expect(first!.region?.code).toBe(row.region);
  });
});

describe("SC-010: unresolved readings go to the remainder chooser", () => {
  it.each(fixture.unresolved)("$query", (row) => {
    const [first] = readingsFor(row.query, modifier, mod);
    expect(first, `no reading for ${row.query}`).toBeDefined();
    expect(first!.language.languageSubtag).toBe(row.language);
    expect(first!.unresolved).toBe(row.remainder);
    expect(first!.dialect).toBeUndefined();
    expect(first!.region).toBeUndefined();
    const places = rankPlacesFor(row.remainder, getAllRegions());
    expect(places[0]?.name ?? null).toBe(row.firstPlace);
  });
});
