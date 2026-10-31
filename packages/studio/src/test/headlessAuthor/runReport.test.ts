import { describe, expect, it } from "vitest";
import type { AuthorRun } from "./caseTypes.ts";
import { createRunReport, formatCaseLine, serializeRunReport, summarise, type SweepEntry } from "./runReport.ts";

const gate = (g: "G1" | "G2", applicable: boolean, pass: boolean) => ({ gate: g, applicable, pass, detail: [] });

describe("runReport", () => {
  it("accumulates entries", () => {
    const acc = createRunReport("store-default");
    acc.addStep({ decisionId: "d", rule: "default", value: 1 });
    acc.addPlaceholder({ char: "x", sequence: "zzq78", decisionId: "d" });
    acc.setTiming({ author: 1, replay: 2 });
    expect(acc.report.steps).toHaveLength(1);
    expect(acc.report.placeholders).toHaveLength(1);
    expect(acc.report.fallbackPolicy).toBe("store-default");
    expect(acc.report.timingMs).toEqual({ author: 1, replay: 2 });
  });

  it("formats ASCII console lines", () => {
    const report = createRunReport("p").report;
    const ok: AuthorRun = {
      caseId: "c1",
      outcome: "completed",
      gates: [gate("G1", true, true), gate("G2", false, true)],
      report,
    };
    expect(formatCaseLine(ok)).toBe("[OK] c1 gates=1/1 placeholders=0");
    const fail: AuthorRun = {
      caseId: "c2",
      outcome: "failed",
      failure: { step: "s", decisionId: "assignments", kind: "compile-failed", detail: "boom" },
      gates: [gate("G1", true, false)],
      report,
    };
    expect(formatCaseLine(fail)).toBe("[FAIL] c2 G1 @ assignments: boom");
    expect(formatCaseLine({ caseId: "c3", outcome: "skipped", skipReason: "missing", gates: [], report })).toBe(
      "[SKIP] c3 missing",
    );
    for (const line of [formatCaseLine(ok), formatCaseLine(fail)]) expect(line).toMatch(/^[\x20-\x7e]+$/);
  });

  it("serialises with sorted keys and a bundle hash instead of the bundle", () => {
    const run = {
      caseId: "c",
      outcome: "completed",
      gates: [],
      report: createRunReport("p").report,
      bundle: { artifacts: { kmx: new Uint8Array([1, 2, 3]) } },
    } as unknown as AuthorRun;
    const text = serializeRunReport(run);
    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(parsed["bundle"]).toBeUndefined();
    expect(parsed["bundleSha256"]).toMatch(/^[0-9a-f]{64}$/);
    const keys = Object.keys(parsed);
    expect(keys).toEqual([...keys].sort());
    expect(serializeRunReport(run)).toBe(text);
  });
});

describe("summarise", () => {
  const head = { base: "b", profile: 1, backspace: "whole" };
  it("groups skipped cases by reason, too-large included, and counts them as skipped", () => {
    const entries: SweepEntry[] = [
      { ...head, caseId: "a", status: "ok" },
      { ...head, caseId: "b", status: "skipped", skipReason: "too-large" },
      { ...head, caseId: "c", status: "skipped", skipReason: "too-large" },
      { ...head, caseId: "d", status: "skipped", skipReason: "outside-slice" },
      { ...head, caseId: "e", status: "failed", gate: "G1", decisionPoint: "assignments" },
    ];
    const s = summarise("latin", "1/1", entries);
    expect(s.cases).toEqual({ completed: 1, skipped: 3, failed: 1 });
    expect(s.skips).toEqual({ "too-large": ["b", "c"], "outside-slice": ["d"] });
    expect(s.byGate).toEqual({ G1: ["e"] });
  });

  it("formats a too-large skip as an ASCII console line", () => {
    const report = createRunReport("p").report;
    expect(formatCaseLine({ caseId: "k", outcome: "skipped", skipReason: "too-large", gates: [], report })).toBe(
      "[SKIP] k too-large",
    );
  });
});
