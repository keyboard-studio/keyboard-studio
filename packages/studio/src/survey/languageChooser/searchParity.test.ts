// Spec 115 T023: measurements of the new search against today's.
//
//   SC-007 / FR-006  the top-result code for 200 seeded language-name samples vs
//                    today's `lookupByName`; known differences are listed, each
//                    with a reason, in searchParity.fixture.json.
//   SC-001           the share of Glottolog dialects whose parent language is in
//                    the top 5 when the dialect name is typed.
//   SC-002           229 of 229 langtags dialect tagsets are reachable by name.
//
// Regenerate the SC-007 fixture from a first run: UPDATE_PARITY_FIXTURES=1.
// SC-001 samples the dialect list (every STEP-th row, so the suite stays fast);
// SC001_FULL=1 runs all of it (about 45 minutes).

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { searchForLanguage, stripDemarcation } from "@ethnolib/find-language";
import { allDialectTagsets } from "@keyboard-studio/engine/langtags";
import { dialectRows } from "@keyboard-studio/glottolog/dialects";
import { loadLangtags } from "../../lib/langtagsDefaults.ts";
import { normalizeForCompare } from "../../lib/normalizeForCompare.ts";
import { languageResultsFor } from "../resolveTypedLanguage.ts";
import { MAX_CHOOSER_ROWS, loadChooserModifier, summaryFor, type ChooserModifier } from "./chooserSearch.ts";
import { MACROLANGUAGE_PARENT, fold } from "./dialectSearch.ts";

const FIXTURE_PATH = join(dirname(fileURLToPath(import.meta.url)), "searchParity.fixture.json");

interface ParityFixture {
  exceptions: Record<string, { old: string; new: string; reason: string }>;
}

/** mulberry32: a small seeded PRNG so the 200 samples are the same on every run. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let modifier: ChooserModifier;
let langtags: Awaited<ReturnType<typeof loadLangtags>>;

beforeAll(async () => {
  langtags = await loadLangtags();
  modifier = await loadChooserModifier({ glottolog: true });
  searchForLanguage("ab"); // build EthnoLib's indexes once
}, 60_000);

describe("SC-007 / FR-006: top result for language names vs today's lookupByName", () => {
  it("agrees for 200 seeded samples, except the listed differences", () => {
    const rng = seeded(115);
    const pool = langtags.listLanguages().filter((l) => l.englishName.trim().length >= 3);
    const picked = new Set<number>();
    while (picked.size < 200) picked.add(Math.floor(rng() * pool.length));
    const names = [...picked].sort((a, b) => a - b).map((i) => pool[i]!.englishName);

    const differences: ParityFixture["exceptions"] = {};
    let agree = 0;
    for (const name of names) {
      const oldTop = langtags.lookupByName(name)[0]?.code ?? "";
      const top = languageResultsFor(name, modifier)[0];
      const newTop = top === undefined ? "" : (summaryFor(top, langtags)?.code ?? top.languageSubtag);
      if (oldTop === newTop) {
        agree++;
        continue;
      }
      const sameName = top !== undefined && normalizeForCompare(stripDemarcation(top.exonym) ?? "") === normalizeForCompare(name);
      // The words of a langtags name that EthnoLib files under a different one: do they find the old top result?
      const byWords = name
        .split(/[\s,]+/)
        .filter((w) => w.length >= 4)
        .some((w) => languageResultsFor(w, modifier).slice(0, MAX_CHOOSER_ROWS).some((r) => (summaryFor(r, langtags)?.code ?? r.languageSubtag) === oldTop));
      differences[name] = {
        old: oldTop,
        new: newTop,
        reason: sameName
          ? "Several languages share this name; both rank at the top and the two searches break the tie differently. The chooser lists them all and the author picks."
          : newTop === ""
            ? byWords
              ? "langtags files this language under an inverted or qualified name; EthnoLib lists it under a different name, so searching the whole phrase finds nothing. The words of the name find it."
              : "langtags files this language under an inverted or qualified name that EthnoLib does not carry; neither the phrase nor its words reach it in the first 50 rows."
            : "The new search ranks a language whose name or alternate name matches the typed name more closely above today's top result.",
      };
    }
    console.log(
      `[SC-007] top-result code agrees with lookupByName for ${agree}/${names.length} seeded names (${((100 * agree) / names.length).toFixed(1)}%); ` +
        `differences: ${Object.keys(differences).length}`,
    );

    if (process.env["UPDATE_PARITY_FIXTURES"] === "1") {
      const prior = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as ParityFixture;
      const fresh: ParityFixture = { exceptions: {} };
      for (const k of Object.keys(differences).sort()) {
        fresh.exceptions[k] = { ...differences[k]!, reason: prior.exceptions[k]?.reason || differences[k]!.reason };
      }
      writeFileSync(FIXTURE_PATH, JSON.stringify(fresh, null, 2) + "\n");
      return;
    }
    const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as ParityFixture;
    expect(Object.keys(differences).filter((k) => !(k in fixture.exceptions)), "unlisted differences").toEqual([]);
    for (const [k, e] of Object.entries(fixture.exceptions)) {
      expect(differences[k], `fixture entry "${k}" no longer differs`).toBeDefined();
      expect(e.reason.length).toBeGreaterThan(10);
    }
  }, 600_000);
});

describe("SC-001: a Glottolog dialect name finds its parent language in the top 5", () => {
  it("at least 95% of sampled dialects", () => {
    const rows = dialectRows.filter((r) => r.kind === "dialect" && r.parentIso !== undefined);
    const step = process.env["SC001_FULL"] === "1" ? 1 : 40;
    const sample = rows.filter((_, i) => i % step === 0);
    let hit = 0;
    const misses: string[] = [];
    for (const r of sample) {
      const parent = r.parentIso!;
      const wanted = new Set([parent, MACROLANGUAGE_PARENT[parent] ?? parent]);
      const top5 = languageResultsFor(r.name, modifier).slice(0, 5);
      if (top5.some((l) => wanted.has(l.languageSubtag) || wanted.has(l.iso639_3_code))) hit++;
      else misses.push(`${r.name}->${parent}`);
    }
    const pct = (100 * hit) / sample.length;
    console.log(
      `[SC-001] parent in top 5: ${hit}/${sample.length} sampled dialects of ${rows.length} (${pct.toFixed(2)}%; ` +
        `${step === 1 ? "full run" : `every ${step}th row`}); first misses: ${misses.slice(0, 8).join(", ")}`,
    );
    expect(pct).toBeGreaterThanOrEqual(95);
  }, 1_800_000);
});

describe("SC-002: every langtags dialect tagset is reachable by one of its names", () => {
  /** The most specific name of a tagset: the longest of its names that carries the dialect's own word. */
  function queryFor(t: (typeof allDialectTagsets)[number]): string {
    const words = t.dialectSubtag.replace(/^x-/, "").replace(/-/g, " ");
    const folded = fold(words);
    const named = t.names.filter((n) => folded.length >= 3 && fold(n).includes(folded));
    if (named.length > 0) return named.reduce((a, b) => (b.length > a.length ? b : a));
    // A dialect word too generic to search alone ("Central") is searched with the language's name.
    const title = words.replace(/(^|\s)(\p{L})/gu, (_m, sp: string, c: string) => sp + c.toUpperCase());
    return `${t.names[0] ?? ""} ${title}`.trim();
  }

  it("229 of 229", () => {
    expect(allDialectTagsets.length).toBe(229);
    let reached = 0;
    let exact = 0;
    const missed: string[] = [];
    const notProposed: string[] = [];
    for (const t of allDialectTagsets) {
      // The chooser lists at most MAX_CHOOSER_ROWS rows.
      const rs = languageResultsFor(queryFor(t), modifier).slice(0, MAX_CHOOSER_ROWS);
      if (rs.some((l) => l.languageSubtag === t.language || l.iso639_3_code === t.language)) reached++;
      else missed.push(`${t.tag} (${queryFor(t)})`);
      if (rs.some((l) => l.match?.dialectTag === t.tag)) exact++;
      else notProposed.push(t.tag);
    }
    console.log(
      `[SC-002] langtags dialect tagsets reachable: ${reached}/${allDialectTagsets.length}; ` +
        `picking proposes exactly that tagset: ${exact}/${allDialectTagsets.length}; ` +
        `missed: ${missed.slice(0, 8).join(", ")}; not proposed: ${notProposed.slice(0, 8).join(", ")}`,
    );
    expect(missed).toEqual([]);
    expect(notProposed).toEqual([]);
  }, 600_000);
});
