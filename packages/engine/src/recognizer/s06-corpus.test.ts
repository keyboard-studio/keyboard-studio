/**
 * Corpus gate for the S-06 two-trigger chain lift (#2235,
 * queue-2235-ruling.md §6 admission bar), following the s02-corpus.test.ts
 * convention: runs over the sibling keymanapp/keyboards checkout when
 * present, skipped in CI.
 *
 * Asserts, over every keyboard in the checkout:
 *   - recognizePatterns completes without throwing
 *     (assertOwnershipConsistency green — the finder claims through
 *     pre-emption only, never a second stamp);
 *   - the finder claims ONLY the census admission list:
 *     sil_cameroon_azerty, exactly one Pattern, 5 sub-clusters, with the
 *     census member lines;
 *   - gate 2 (capability non-regression): no S-06-owned rule sits below
 *     its unowned shape verdict, and no non-S-06-owned rule moves
 *     removable -> not-removable between the without-S-06 and with-S-06
 *     pipelines.
 *
 * Full-corpus evidence (keyboards-full, 933 .kmn) is recorded in the PR:
 * the same three checks over all 933 files, admitted = sil_cameroon_azerty
 * only; controls armenian_mnemonic_r / russian_mnemonic_r (purity),
 * sil_euro_latin (T≠F), sil_pan_africa_mnemonic (0 edges) and
 * thamizha_bamini (non-claim, both reasons) all claim zero.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, emit } from "../codec/index.js";
import { recognizePatterns, DEFAULT_RULES } from "./index.js";
import { classifyRemovalCapabilities } from "./classifyRemovalCapabilities.js";
import { findS06Families } from "./s06-families.js";
import { s06Recognizer } from "./rules/s06-deadkey-chained-two-tier.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const RELEASE_ROOT = resolve(__dir, "../../../../../keyboards/release");
const available = existsSync(RELEASE_ROOT);

function listCorpusKmn(): { id: string; file: string }[] {
  if (!available) return [];
  const out: { id: string; file: string }[] = [];
  for (const shard of readdirSync(RELEASE_ROOT)) {
    const shardDir = join(RELEASE_ROOT, shard);
    if (!statSync(shardDir).isDirectory()) continue;
    for (const id of readdirSync(shardDir)) {
      const sourceDir = join(shardDir, id, "source");
      if (!existsSync(sourceDir)) continue;
      for (const f of readdirSync(sourceDir)) {
        if (f === `${id}.kmn`) out.push({ id: `${shard}/${id}`, file: join(sourceDir, f) });
      }
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

const corpus = listCorpusKmn();
const byId = new Map(corpus.map((c) => [c.id, c.file]));
const ADMITTED = "sil/sil_cameroon_azerty";
const WITHOUT_S06 = DEFAULT_RULES.filter(
  (r) => r.id !== "deadkey-chained-two-tier",
);

describe.skipIf(!available)("S-06 corpus gate (#2235)", () => {
  it(
    "pipeline never throws; finder claims exactly the admission list; capability diff clean",
    () => {
      const problems: string[] = [];
      for (const { id, file } of corpus) {
        const text = readFileSync(file, "utf-8");
        let out: ReturnType<typeof recognizePatterns>["ir"];
        try {
          out = recognizePatterns(parse(text, id).ir).ir;
        } catch (err) {
          problems.push(`${id}: recognizePatterns threw ${String(err)}`);
          continue;
        }
        const s06Patterns = out.recognizedPatterns.filter(
          (p) => p.strategyId === "S-06",
        );
        if (id === ADMITTED) {
          if (s06Patterns.length !== 1) {
            problems.push(`${id}: expected 1 S-06 pattern, got ${s06Patterns.length}`);
          }
        } else if (s06Patterns.length !== 0) {
          problems.push(`${id}: S-06 claim outside admission list (${s06Patterns.length})`);
        }

        // Gate 2a: S-06-owned rules never below their unowned verdict.
        const mapUnowned = classifyRemovalCapabilities(parse(text, id).ir);
        const mapWith = classifyRemovalCapabilities(out);
        for (const group of out.groups) {
          for (const rule of group.rules) {
            if (rule.ownedByPattern === undefined) continue;
            if (
              !s06Patterns.some((p) => p.id === rule.ownedByPattern)
            ) {
              continue;
            }
            const before = mapUnowned.get(rule.nodeId);
            const after = mapWith.get(rule.nodeId);
            if (
              before?.startsWith("removable:") &&
              after?.startsWith("not-removable:")
            ) {
              problems.push(`${id}: ${rule.nodeId} ${before} -> ${after}`);
            }
          }
        }

        // Gate 2b (isolation A/B, without-S-06 vs with-S-06 pipeline):
        // the ONLY sanctioned verdict change for a non-S-06-owned rule is
        // the loss of S-02 ownership inheritance for a rule whose S-02
        // family's fan-out was pre-empted by the chain (on cameroon: the
        // direct vkey triggers of the tier-2 deadkeys, e.g.
        // `+ [RALT K_7] > dk(0060)`). Such a rule must land EXACTLY on
        // its unowned shape verdict — the same treatment §4's table gives
        // the arming rules — and must have been S-02-owned in the
        // without-S-06 pipeline. Any other removable -> not-removable
        // move is a gate-2 regression.
        const withoutIr = recognizePatterns(parse(text, id).ir, WITHOUT_S06).ir;
        const mapWithout = classifyRemovalCapabilities(withoutIr);
        const s06OwnedIds = new Set(
          out.groups
            .flatMap((g) => g.rules)
            .filter((r) =>
              s06Patterns.some((p) => p.id === r.ownedByPattern),
            )
            .map((r) => r.nodeId),
        );
        const withoutOwner = new Map(
          withoutIr.groups.flatMap((g) =>
            g.rules.map((r) => [r.nodeId, r.ownedByPattern] as const),
          ),
        );
        const withoutPatterns = new Map(
          withoutIr.recognizedPatterns.map((p) => [p.id, p] as const),
        );
        for (const [nodeId, verdict] of mapWithout) {
          if (s06OwnedIds.has(nodeId)) continue;
          const after = mapWith.get(nodeId);
          if (
            verdict.startsWith("removable:") &&
            after?.startsWith("not-removable:")
          ) {
            const ownerId = withoutOwner.get(nodeId);
            const owner =
              ownerId !== undefined ? withoutPatterns.get(ownerId) : undefined;
            const landsOnUnowned = after === mapUnowned.get(nodeId);
            if (owner?.strategyId !== "S-02" || !landsOnUnowned) {
              problems.push(
                `${id}: isolation ${nodeId} ${verdict} -> ${after} (owner=${ownerId ?? "none"}, unowned=${mapUnowned.get(nodeId) ?? "none"})`,
              );
            }
          }
        }
      }
      expect(problems).toEqual([]);
    },
    300_000,
  );

  it.skipIf(!byId.has(ADMITTED))(
    "sil_cameroon_azerty: exactly the census members (5 sub-clusters)",
    () => {
      const text = readFileSync(byId.get(ADMITTED)!, "utf-8");
      const { ir } = parse(text, ADMITTED);
      const matches = s06Recognizer.match(structuredClone(ir));
      expect(matches).toHaveLength(1);
      expect(matches[0]!.patternId).toBe(
        "latin_deadkey_chained_two_tier#dk_0021",
      );
      expect(matches[0]!.slotValues["subClusterCount"]).toBe("5");
      expect(matches[0]!.slotValues["tier2AccentName"]).toBe(
        "dk_0060,dk_00B4,dk_005E,dk_007E,dk_00A8",
      );
      const lineOf = new Map(
        ir.groups.flatMap((g) =>
          g.rules.map((r) => [r.nodeId, r.sourceLine] as const),
        ),
      );
      const ownedLines = matches[0]!.ownedNodes
        .map((n) => lineOf.get(n.nodeId))
        .sort((a, b) => (a ?? 0) - (b ?? 0));
      expect(ownedLines).toEqual([
        264, 265, 366, 367, 368, 369, 370, 371, 372, 376, 384, 388, 392, 396,
        400,
      ]);
    },
  );

  it.skipIf(!byId.has(ADMITTED))(
    "deletion parity: nul-filling one tier-2 slot emits clean, re-parses clean, chain intact",
    () => {
      const text = readFileSync(byId.get(ADMITTED)!, "utf-8");
      const { ir } = parse(text, ADMITTED);
      recognizePatterns(ir);
      const map = classifyRemovalCapabilities(ir);
      const resRule = ir.groups
        .flatMap((g) => g.rules)
        .find(
          (r) =>
            r.context[0]?.kind === "deadkey" &&
            r.context[0].id === 0x60 &&
            r.output[0]?.kind === "index",
        );
      expect(resRule).toBeDefined();
      // The slot-fill verdict is what licenses this edit.
      expect(map.get(resRule!.nodeId)).toBe("removable:slot-fill");

      const outStore = ir.stores.find((s) => s.name === "dkt0060");
      expect(outStore).toBeDefined();
      // Slot 1 pairs base 'a' -> 'à' in dkf0060/dkt0060.
      expect(outStore!.items[1]).toEqual({ kind: "char", value: "à" });
      outStore!.items[1] = { kind: "nul" };

      const emitted = emit(ir);
      expect(emitted).toContain("nul");

      const reparsed = parse(emitted, ADMITTED).ir;
      const families = findS06Families(reparsed);
      expect(families).toHaveLength(1);
      expect(families[0]!.subClusters).toHaveLength(5);
    },
  );

  it("the corpus checkout was actually exercised", () => {
    expect(corpus.length).toBeGreaterThan(0);
    expect(basename(RELEASE_ROOT)).toBe("release");
  });
});
