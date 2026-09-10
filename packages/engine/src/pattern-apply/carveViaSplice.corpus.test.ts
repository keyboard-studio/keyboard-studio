// Corpus sweep for carveViaSplice — the text-splice carve projection (refs #391).
//
// The unit tests in carveViaSplice.test.ts prove the splice on hand-written
// fixtures. This file is the reproducible form of the "splice succeeds on
// every real keyboard" claim: for every `.kmn` under the sibling
// keymanapp/keyboards checkout (`../keyboards/release`), it parses the file,
// picks one representative single-node deletion of each kind the carve UI can
// produce, and asserts that:
//
//   1. carveViaSplice returns `ok: true` — every deleted node's span resolves
//      against the real text (no fallback to filter+emit needed), and
//   2. the spliced text re-parses to an IR that is structurally equal to what
//      carveFilterIr (the legacy filter+emit path's IR) produces for the same
//      deletion — i.e. the two carve paths agree on WHAT was deleted, not just
//      that something was.
//
// When `../keyboards` is absent (CI), every test is skipped — the same
// convention as codec/roundtrip.test.ts. Run it locally with:
//
//   pnpm --filter @keyboard-studio/engine exec vitest run carveViaSplice.corpus
//
// Deletion kinds sampled per keyboard (each only when the keyboard has one):
//   - the first typed rule of the entry group
//   - the first user (non-system) store — system stores (&NAME etc.) are
//     header fields, which the carve UI never offers for deletion
//   - the first RawKmnFragment
//   - the first non-entry group (the entry group is guarded by applyCarveToVfs
//     and never reaches the splice)

import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { parse } from "../codec/parse.js";
import { normaliseForComparison } from "../codec/normalise-ir.js";
import { carveFilterIr } from "./carveFilterIr.js";
import { carveViaSplice } from "./carveViaSplice.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const RELEASE_ROOT = resolve(__dir, "../../../../../keyboards/release");
const available = existsSync(RELEASE_ROOT);

/** Every `release/<shard>/<id>/source/*.kmn` under the corpus checkout. */
function listCorpusKmn(): string[] {
  if (!available) return [];
  const out: string[] = [];
  for (const shard of readdirSync(RELEASE_ROOT)) {
    const shardDir = join(RELEASE_ROOT, shard);
    if (!statSync(shardDir).isDirectory()) continue;
    for (const id of readdirSync(shardDir)) {
      const sourceDir = join(shardDir, id, "source");
      if (!existsSync(sourceDir)) continue;
      for (const f of readdirSync(sourceDir)) {
        if (f.endsWith(".kmn")) out.push(join(sourceDir, f));
      }
    }
  }
  return out.sort();
}

interface SampledDeletion {
  kind: "rule" | "store" | "raw fragment" | "group";
  nodeId: string;
}

/** One representative whole-node deletion per kind, when the keyboard has one. */
function sampleDeletions(ir: KeyboardIR): SampledDeletion[] {
  const out: SampledDeletion[] = [];
  const entry = ir.groups.find((g) => !g.readonly);
  const firstRule = entry?.rules[0];
  if (firstRule !== undefined) out.push({ kind: "rule", nodeId: firstRule.nodeId });
  const userStore = ir.stores.find((s) => !s.isSystem);
  if (userStore !== undefined) out.push({ kind: "store", nodeId: userStore.nodeId });
  const fragment = ir.raw[0];
  if (fragment !== undefined) out.push({ kind: "raw fragment", nodeId: fragment.nodeId });
  const otherGroup = ir.groups.find((g) => g !== entry);
  if (otherGroup !== undefined) out.push({ kind: "group", nodeId: otherGroup.nodeId });
  return out;
}

const corpus = listCorpusKmn();

describe.skipIf(!available)("carveViaSplice — corpus sweep (../keyboards/release)", () => {
  it("found the corpus", () => {
    expect(corpus.length).toBeGreaterThan(0);
  });

  it.each(corpus.map((p) => [basename(p), p] as const))(
    "%s: every sampled deletion splices ok and agrees with carveFilterIr",
    (_name, kmnPath) => {
      const text = readFileSync(kmnPath, "utf-8");
      const keyboardId = basename(kmnPath, ".kmn");
      const { ir } = parse(text, keyboardId);

      for (const deletion of sampleDeletions(ir)) {
        const deleted = new Set([deletion.nodeId]);
        const result = carveViaSplice(text, ir, deleted);
        expect(result.ok, `${deletion.kind} ${deletion.nodeId}: ${result.ok ? "" : result.reason}`).toBe(true);
        if (!result.ok) continue;

        const reparsed = parse(result.text, keyboardId).ir;
        const filtered = carveFilterIr(ir, deleted);
        expect(
          normaliseForComparison(reparsed),
          `${deletion.kind} ${deletion.nodeId}: spliced text re-parses differently from carveFilterIr`,
        ).toEqual(normaliseForComparison(filtered));
      }
    },
    // The largest corpus keyboards (multi-thousand-rule Vietnamese/Hakka
    // sources) need well over vitest's 5 s default for four parse passes.
    60_000,
  );
});
