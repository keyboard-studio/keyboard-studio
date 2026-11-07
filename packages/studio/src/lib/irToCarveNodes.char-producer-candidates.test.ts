// charProducerCandidates is an index, never a filter: for every character a keyboard produces,
// charProducers with the index returns exactly what the full rule scan returns. Checked on real
// corpus keyboards that exercise store tables, deadkeys, Backspace repair rules and touch-only
// triggers; a keyboard missing from the sibling ../keyboards checkout is skipped.

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildProducedSet } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { charProducerCandidates, charProducers } from "./irToCarveNodes.ts";

// process.cwd() is packages/studio under vitest; see touchDiagnostics.corpus.test.ts for why
// import.meta.url cannot be used here.
const KEYBOARDS_ROOT = path.resolve(process.cwd(), "../../../keyboards");
const IDS = ["sil_euro_latin", "sil_cameroon_qwerty", "sil_ipa", "sil_greek_polytonic", "sil_eastern_congo"];

function kmnPath(id: string): string {
  return path.join(KEYBOARDS_ROOT, "release/sil", id, "source", `${id}.kmn`);
}

describe("charProducerCandidates", () => {
  for (const id of IDS) {
    it.skipIf(!fs.existsSync(kmnPath(id)))(`${id}: charProducers is unchanged by the index for every produced character`, () => {
      const { ir } = parseKmn(fs.readFileSync(kmnPath(id), "utf8"), id);
      const candidates = charProducerCandidates(ir);
      const chars = [...buildProducedSet(ir)];
      expect(chars.length).toBeGreaterThan(0);
      for (const ch of chars) {
        expect(charProducers(ir, ch, candidates), ch).toEqual(charProducers(ir, ch));
      }
    });
  }
});
