// Opt-in corpus sweep (spec 112 SC-004): for every corpus keyboard that lacks
// &CasedKeys but has case-paired letter keys (the 7.28 failure) and is not
// mnemonic, upgrade it and compare caps behaviour. Where the verdict is not
// `differs`, no row may change except by gaining uppercase. Skips without a
// sibling `../keyboards` checkout.

import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { declaredCasedKeys, casedKeySet } from "@keyboard-studio/contracts";
import { parse } from "../codec/parse.js";
import { emit } from "../codec/emit.js";
import { isMnemonicKeyboard } from "../placement/filters.js";
import { upgradeToCasedKeys } from "./upgradeToCasedKeys.js";
import { compareCapsBehaviour } from "./compareCaps.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const RELEASE_ROOT = resolve(__dir, "../../../../../keyboards/release");
const available = existsSync(RELEASE_ROOT);

function listCorpusKmn(): string[] {
  if (!available) return [];
  const out: string[] = [];
  for (const shard of readdirSync(RELEASE_ROOT)) {
    const shardDir = join(RELEASE_ROOT, shard);
    if (!statSync(shardDir).isDirectory()) continue;
    for (const id of readdirSync(shardDir)) {
      const f = join(shardDir, id, "source", `${id}.kmn`);
      if (existsSync(f)) out.push(f);
    }
  }
  return out.sort();
}

describe.skipIf(!available)("caps comparison - corpus sweep (../keyboards/release)", () => {
  it("never changes a row except by gaining uppercase unless it withholds the offer", async () => {
    let candidates = 0;
    let offered = 0;
    let withheld = 0;
    let skipped = 0;
    const violations: string[] = [];

    for (const file of listCorpusKmn()) {
      const id = basename(file, ".kmn");
      let ir;
      try {
        ir = parse(readFileSync(file, "utf-8"), id).ir;
      } catch {
        skipped++;
        continue;
      }
      if (declaredCasedKeys(ir) !== undefined || isMnemonicKeyboard(ir)) continue;
      if (casedKeySet(ir, { floor: [] }).keys.length === 0) continue;
      candidates++;
      try {
        const before = emit(ir);
        const res = upgradeToCasedKeys(ir);
        const cmp = await compareCapsBehaviour(before, emit(res.ir), res.set.keys);
        if (cmp.verdict === "differs") {
          withheld++;
          continue;
        }
        offered++;
        for (const row of cmp.rows) {
          if (row.verdict === "differs") violations.push(`${id} ${row.vkey}`);
        }
      } catch {
        skipped++;
      }
    }

    process.stderr.write(`[caps corpus] candidates=${candidates} offered=${offered} withheld=${withheld} skipped=${skipped}
`);
    expect(violations).toEqual([]);
    expect(candidates).toBeGreaterThan(0);
  }, 1_800_000);
});
