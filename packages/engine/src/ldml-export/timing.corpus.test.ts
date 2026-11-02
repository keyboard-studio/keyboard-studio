// H10 (SC-007): the median of 5 `buildLdmlExport` runs on the largest corpus keyboard of at most
// 2 000 rules is under 2 seconds. The median `classifyForLdml` time is logged, not asserted.
//
// A missing corpus is a failed precondition, never a skip.
import { describe, expect, it } from "vitest";
import { CORPUS, loadCorpusKeyboard } from "./__testing__/corpus.js";
import { corpusAvailable, corpusExportInput, KEYBOARDS_ROOT } from "./__testing__/corpusExport.js";
import { classifyForLdml } from "./classify/classify.js";
import { buildLdmlExport } from "./package.js";
import { resolveLdmlProfile } from "./profiles/resolve.js";
import type { LdmlExportInput } from "./types.js";

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] as number;
const ruleCount = (i: LdmlExportInput): number => i.ir.groups.reduce((n, g) => n + g.rules.length, 0);

describe("LDML export timing (SC-007)", () => {
  it("the sibling ../keyboards corpus is present", () => {
    expect(corpusAvailable, `${KEYBOARDS_ROOT}/release is missing: H10 proves nothing without it`).toBe(true);
  });

  it("the median build of the largest corpus keyboard of at most 2000 rules is under 2 s", async () => {
    let best: { id: string; input: LdmlExportInput; rules: number } | null = null;
    for (const entry of CORPUS) {
      const kb = loadCorpusKeyboard(entry.id);
      if (kb?.kmn === undefined) continue;
      const built = corpusExportInput(kb, "46");
      if (built === null) continue;
      const rules = ruleCount(built.input);
      if (rules <= 2000 && (best === null || rules > best.rules)) best = { id: entry.id, input: built.input, rules };
    }
    expect(best, "no corpus keyboard with a KMN source").not.toBeNull();
    const { id, input, rules } = best!;

    const builds: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      const r = await buildLdmlExport(input);
      builds.push(performance.now() - t0);
      expect(r.ok).toBe(true);
    }
    const profile = resolveLdmlProfile("46");
    const classifies: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      classifyForLdml(input, profile);
      classifies.push(performance.now() - t0);
    }
    console.info(`[INFO] ${id} (${rules} rules): build median ${median(builds).toFixed(0)} ms, classify median ${median(classifies).toFixed(0)} ms`);
    expect(median(builds)).toBeLessThan(2000);
  }, 120_000);
});
