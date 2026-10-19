/**
 * Report assembly tests — clustering, honest summary counts, Markdown.
 */

import { describe, expect, it } from "vitest";

import { ImportStatus } from "@keyboard-studio/contracts";
import type { StrategyDivergence } from "@keyboard-studio/contracts";
import { buildReport, clusterDivergences, renderMarkdown } from "./report.js";
import type { EvaluationOutcome } from "./evaluate.js";

function divergence(
  keyboardId: string,
  treePrimary: StrategyDivergence["treePrimary"],
  rule: StrategyDivergence["triggeredRule"],
  recognizedPrimary: StrategyDivergence["recognizedPrimary"],
): StrategyDivergence {
  return {
    keyboardId,
    sourcePath: `release/x/${keyboardId}/source/${keyboardId}.kmn`,
    importStatus: ImportStatus.Clean,
    axes: {
      scale: "medium",
      scriptClass: "alphabetic",
      phoneticIntuition: "strong",
      diacriticBehavior: "multi-family",
      multiMode: "single",
      constraintEnforcement: "none",
      spareKeyAvailability: "many",
    },
    axisFills: [],
    treePrimary,
    treeSecondaries: [],
    triggeredRule: rule,
    recognizedPrimary,
    recognizedTally: { [recognizedPrimary]: 4 },
    recognizedRatio: 0.5,
  };
}

describe("clusterDivergences", () => {
  it("groups by (treePrimary, rule, recognizedPrimary) and sorts largest first", () => {
    const clusters = clusterDivergences([
      divergence("kb_b", "S-05", 5, "S-02"),
      divergence("kb_a", "S-05", 5, "S-02"),
      divergence("kb_c", "S-03", 12, "S-02"),
    ]);
    expect(clusters).toHaveLength(2);
    expect(clusters[0]).toMatchObject({ count: 2, treePrimary: "S-05", recognizedPrimary: "S-02" });
    expect(clusters[0]!.keyboardIds).toEqual(["kb_a", "kb_b"]);
    expect(clusters[1]).toMatchObject({ count: 1, treePrimary: "S-03" });
  });

  it("separates clusters that differ only by firing rule", () => {
    const clusters = clusterDivergences([
      divergence("kb_a", "S-05", 5, "S-02"),
      divergence("kb_b", "S-05", 6, "S-02"),
    ]);
    expect(clusters).toHaveLength(2);
  });
});

describe("buildReport + renderMarkdown", () => {
  it("denominates every outcome kind in the summary", () => {
    const outcomes: EvaluationOutcome[] = [
      { kind: "parse-failure", keyboardId: "bad", sourcePath: "x", errors: ["boom"] },
      { kind: "unevaluable", keyboardId: "plain", sourcePath: "x", reason: "none lifted" },
      {
        kind: "divergence",
        keyboardId: "kb_a",
        sourcePath: "x",
        divergence: divergence("kb_a", "S-05", 5, "S-02"),
        summary: {
          keyboardId: "kb_a",
          importStatus: ImportStatus.Clean,
          treePrimary: "S-05",
          triggeredRule: 5,
          recognizedPrimary: "S-02",
          recognizedRatio: 0.5,
          addedChars: 42,
          dominantScript: "Latn",
        },
      },
    ];
    const report = buildReport({
      corpusRoot: "/corpus",
      corpusScope: "release/**",
      generatedAt: "2026-10-18T00:00:00.000Z",
      durationMs: 12,
      discovered: 3,
      outcomes,
    });
    expect(report.summary).toEqual({
      discovered: 3,
      parseFailures: 1,
      evaluated: 1,
      agreements: 0,
      divergences: 1,
      unevaluable: 1,
    });
    const md = renderMarkdown(report);
    expect(md).toContain("Divergence clusters");
    expect(md).toContain("kb_a");
    expect(md).toContain("plain");
    expect(md).toContain("bad");
  });
});
