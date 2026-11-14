// Spec 115 T023 (FR-034, SC-009): the language chooser's data (EthnoLib's own
// langtags snapshot) must agree with the studio's pinned langtags. Every code the
// chooser can emit has to resolve in the pinned data with the same default
// script; the known differences are listed, each with a reason, in
// ethnolibParity.fixture.json. An unlisted difference fails.
//
// Regenerate the fixture from a first run: UPDATE_PARITY_FIXTURES=1 (T029).

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LanguageSearcher, searchForLanguage, type ILanguage } from "@ethnolib/find-language";
import { loadLangtags } from "../../lib/langtagsDefaults.ts";
import { summaryFor } from "./chooserSearch.ts";

const FIXTURE_URL = join(dirname(fileURLToPath(import.meta.url)), "ethnolibParity.fixture.json");

interface Fixture {
  /** Codes EthnoLib lists that the pinned langtags does not know. */
  unresolved: Record<string, string>;
  /** Codes whose default script differs: `{ ethnolib, langtags, reason }`. */
  scriptDiffers: Record<string, { ethnolib: string; langtags: string | null; reason: string }>;
}

/**
 * EthnoLib exposes no list of its languages. Its search singleton holds them in
 * `languageData`; capture that instance on the first search, then restore the method.
 */
function ethnolibLanguages(): ILanguage[] {
  let captured: ILanguage[] | undefined;
  const proto = LanguageSearcher.prototype as unknown as {
    searchForLanguage: (this: { languageData: ILanguage[] }, q: string) => unknown;
  };
  const original = proto.searchForLanguage;
  proto.searchForLanguage = function (this: { languageData: ILanguage[] }, q: string) {
    captured = this.languageData;
    return original.call(this, q);
  };
  try {
    searchForLanguage("zz");
  } finally {
    proto.searchForLanguage = original;
  }
  if (captured === undefined) throw new Error("could not read EthnoLib's language list");
  return captured;
}

describe("EthnoLib data parity with the pinned langtags (FR-034, SC-009)", () => {
  it("every EthnoLib code resolves in pinned langtags with the same default script", async () => {
    const langtags = await loadLangtags();
    const languages = ethnolibLanguages();
    const unresolved: Fixture["unresolved"] = {};
    const scriptDiffers: Fixture["scriptDiffers"] = {};
    let resolved = 0;
    let scriptAgrees = 0;

    for (const l of languages) {
      const code = l.languageSubtag.toLowerCase();
      // The same mapping the chooser uses to seed the survey from a pick.
      const summary = summaryFor(l, langtags);
      const defaults = summary === null ? null : langtags.getLanguageDefaults(summary.code);
      if (defaults === null) {
        unresolved[code] = "";
        continue;
      }
      resolved++;
      const theirs = l.scripts[0]?.code;
      const ours = defaults.defaultScript;
      if (theirs === undefined || ours === undefined || theirs === ours) {
        scriptAgrees++;
        continue;
      }
      // EthnoLib lists every script of a language; the pinned default is "the same"
      // when it is among them. Only a script EthnoLib does not list is a difference.
      if (l.scripts.some((s) => s.code === ours)) {
        scriptAgrees++;
        continue;
      }
      scriptDiffers[code] = { ethnolib: theirs, langtags: ours, reason: "" };
    }

    const total = languages.length;
    console.log(
      `[SC-009] EthnoLib codes: ${total}; resolve in pinned langtags: ${resolved} (${((100 * resolved) / total).toFixed(2)}%); ` +
        `default script agrees: ${scriptAgrees} (${((100 * scriptAgrees) / total).toFixed(2)}%); ` +
        `unresolved: ${Object.keys(unresolved).length}; script differs: ${Object.keys(scriptDiffers).length}`,
    );

    if (process.env["UPDATE_PARITY_FIXTURES"] === "1") {
      const prior = JSON.parse(readFileSync(FIXTURE_URL, "utf8")) as Fixture;
      const fresh: Fixture = { unresolved: {}, scriptDiffers: {} };
      for (const code of Object.keys(unresolved).sort()) {
        fresh.unresolved[code] =
          prior.unresolved[code] ||
          "EthnoLib's langtags snapshot (2026-07-29) lists this language; the studio's pinned langtags (99b856b) does not. The identity step treats it as free text and seeds nothing.";
      }
      for (const code of Object.keys(scriptDiffers).sort()) {
        const d = scriptDiffers[code]!;
        fresh.scriptDiffers[code] = {
          ...d,
          reason:
            prior.scriptDiffers[code]?.reason ||
            "The two langtags snapshots name different default scripts. The studio seeds its own pinned default; the author confirms it at the script question.",
        };
      }
      writeFileSync(FIXTURE_URL, JSON.stringify(fresh, null, 2) + "\n");
      return;
    }

    const fixture = JSON.parse(readFileSync(FIXTURE_URL, "utf8")) as Fixture;
    const unlistedUnresolved = Object.keys(unresolved).filter((c) => !(c in fixture.unresolved));
    const unlistedScript = Object.keys(scriptDiffers).filter((c) => !(c in fixture.scriptDiffers));
    expect(unlistedUnresolved, "codes EthnoLib lists that pinned langtags lacks, not in the fixture").toEqual([]);
    expect(unlistedScript, "default-script differences not in the fixture").toEqual([]);
    // Every fixture entry still describes a real difference, and carries a reason.
    expect(Object.keys(fixture.unresolved).filter((c) => !(c in unresolved))).toEqual([]);
    expect(Object.keys(fixture.scriptDiffers).filter((c) => !(c in scriptDiffers))).toEqual([]);
    for (const reason of Object.values(fixture.unresolved)) expect(reason.length).toBeGreaterThan(10);
    for (const d of Object.values(fixture.scriptDiffers)) expect(d.reason.length).toBeGreaterThan(10);
  }, 120_000);
});
