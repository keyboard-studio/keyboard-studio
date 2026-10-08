// Generation-time budget for the context normalization step (spec 086, SC-005):
// the 95th percentile of `proposeNormalizationStep` over every corpus keyboard
// that parses must be under 5 s. Opt-in, not part of the default suite; CI runs
// it in a dedicated step of the `build` job (which has the pinned corpus) with
// KS_CORPUS_PERF=1. When opted in, a missing corpus fails rather than skips:
//
//   KS_CORPUS_PERF=1 pnpm --filter @keyboard-studio/engine exec vitest run normalization-step/generation-time.corpus

import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createVirtualFS, type KeyboardIR } from "@keyboard-studio/contracts";
import { parse } from "../../codec/parse.js";
import { stripDanglingAssetStores } from "../../compiler/stripDanglingAssetStores.js";
import { proposeNormalizationStep } from "./index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const RELEASE_ROOT = resolve(__dir, "../../../../../../keyboards/release");
const optedIn = process.env.KS_CORPUS_PERF === "1";
const enabled = optedIn && existsSync(RELEASE_ROOT);
/** The parsed-keyboard floor guards against a parse regression silently shrinking the sample. */
const MIN_PARSED_KEYBOARDS = 500;

/** Same header-store strip and line rebase as parity.corpus.test.ts. */
function parseRebased(raw: string, id: string): KeyboardIR {
  const stripped = stripDanglingAssetStores(raw, createVirtualFS([])).kmn;
  const kmn = stripped.replace(/^[ \t]*store\(&(?:LAYOUTFILE|VISUALKEYBOARD|BITMAP|KMW_HELPFILE|KMW_EMBEDJS)\).*$/gim, "c");
  const lines = (t: string): number => t.split(/\r?\n/).length;
  const offset = lines(raw) - lines(kmn);
  const ir = parse(kmn, id).ir;
  if (offset === 0) return ir;
  const shift = <T extends { sourceLine?: number }>(n: T): T =>
    n.sourceLine === undefined ? n : { ...n, sourceLine: n.sourceLine + offset };
  return {
    ...ir,
    stores: ir.stores.map(shift),
    comments: ir.comments.map(shift),
    raw: ir.raw.map(shift),
    groups: ir.groups.map((g) => ({ ...shift(g), rules: g.rules.map(shift) })),
  };
}

describe.skipIf(!optedIn)("normalization step generation time: corpus presence", () => {
  it("the sibling ../keyboards corpus exists when the perf gate is requested", () => {
    expect(existsSync(RELEASE_ROOT), `KS_CORPUS_PERF=1 but ${RELEASE_ROOT} is missing`).toBe(true);
  });
});

describe.skipIf(!enabled)("normalization step generation time (corpus, SC-005)", () => {
  it("p95 over every parseable corpus keyboard is under 5 s", async () => {
    const timings: { id: string; ms: number }[] = [];
    let parseFailures = 0;
    for (const shard of readdirSync(RELEASE_ROOT)) {
      for (const id of readdirSync(join(RELEASE_ROOT, shard))) {
        const p = join(RELEASE_ROOT, shard, id, "source", `${id}.kmn`);
        if (!existsSync(p)) continue;
        let ir: KeyboardIR;
        try {
          ir = parseRebased(readFileSync(p, "utf8"), id);
        } catch {
          parseFailures += 1;
          continue;
        }
        const t0 = performance.now();
        await proposeNormalizationStep(ir);
        timings.push({ id, ms: performance.now() - t0 });
      }
    }
    expect(
      timings.length,
      `only ${timings.length} keyboards parsed (${parseFailures} failed to parse); expected at least ${MIN_PARSED_KEYBOARDS}`,
    ).toBeGreaterThanOrEqual(MIN_PARSED_KEYBOARDS);
    const sorted = [...timings].sort((a, b) => a.ms - b.ms);
    const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]!.ms;
    const slowest = sorted.slice(-10).reverse().map((t) => `${t.id} ${Math.round(t.ms)}ms`);
    console.warn(`[WARN] ${timings.length} keyboards, p95 ${Math.round(p95)}ms; slowest ten: ${slowest.join(", ")}`);
    expect(p95).toBeLessThan(5000);
  }, 3_600_000);
});
