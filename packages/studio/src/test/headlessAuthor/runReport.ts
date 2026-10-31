// Run report accumulation and console formatting (spec 107).
// Console lines are plain ASCII (Art. VIII); the serialised report is the
// AuthorRun minus its bundle, with a hash of the bundle's artifact bytes and
// keys sorted recursively so two reports diff cleanly.

import { createHash } from "node:crypto";
import type { AuthorRun, PolicyStep, RunReport, SkipReason, SweepSummary } from "./caseTypes.ts";
import { NOT_COVERED } from "./playwrightOnly.ts";

export interface RunReportAccumulator {
  report: RunReport;
  addStep(step: PolicyStep): void;
  addPlaceholder(p: RunReport["placeholders"][number]): void;
  addDisplacement(d: RunReport["displacements"][number]): void;
  addSkippedStep(s: RunReport["skippedSteps"][number]): void;
  addKnownGap(g: RunReport["knownGaps"][number]): void;
  setTiming(timing: RunReport["timingMs"]): void;
}

export function createRunReport(fallbackPolicy: string): RunReportAccumulator {
  const report: RunReport = {
    steps: [],
    placeholders: [],
    displacements: [],
    skippedSteps: [],
    knownGaps: [],
    notCovered: [...NOT_COVERED],
    fallbackPolicy,
    timingMs: { author: 0, replay: 0 },
  };
  return {
    report,
    addStep: (s) => void report.steps.push(s),
    addPlaceholder: (p) => void report.placeholders.push(p),
    addDisplacement: (d) => void report.displacements.push(d),
    addSkippedStep: (s) => void report.skippedSteps.push(s),
    addKnownGap: (g) => void report.knownGaps.push(g),
    setTiming: (t) => {
      report.timingMs = t;
    },
  };
}

export function formatCaseLine(run: AuthorRun): string {
  if (run.outcome === "skipped") return `[SKIP] ${run.caseId} ${run.skipReason ?? "unspecified"}`;
  if (run.outcome === "failed") {
    const f = run.failure;
    const failedGate = run.gates.find((g) => g.applicable && !g.pass);
    const gate = failedGate?.gate ?? f?.kind ?? "unknown";
    const where = f?.decisionId ?? f?.step ?? "unknown";
    return `[FAIL] ${run.caseId} ${gate} @ ${where}: ${f?.detail ?? "no detail"}`;
  }
  const applicable = run.gates.filter((g) => g.applicable);
  const passed = applicable.filter((g) => g.pass).length;
  return `[OK] ${run.caseId} gates=${passed}/${applicable.length} placeholders=${run.report.placeholders.length}`;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[k];
      if (v !== undefined) out[k] = sortKeys(v);
    }
    return out;
  }
  return value;
}

function hashArtifacts(run: AuthorRun): string | undefined {
  if (run.bundle === undefined) return undefined;
  const h = createHash("sha256");
  const { kmx, kvk, js } = run.bundle.artifacts;
  for (const bytes of [kmx, kvk, js]) {
    if (bytes !== undefined) h.update(bytes);
  }
  return h.digest("hex");
}

export function serializeRunReport(run: AuthorRun): string {
  const { bundle: _bundle, ...rest } = run;
  const body: Record<string, unknown> = { ...rest };
  const sha = hashArtifacts(run);
  if (sha !== undefined) body["bundleSha256"] = sha;
  return JSON.stringify(sortKeys(body), null, 2);
}

/** One swept case, normalised so the issue filer needs no knowledge of AuthorRun. */
export interface SweepEntry {
  caseId: string;
  base: string;
  profile: number;
  backspace: string;
  /**
   * `in-progress` is written before a case runs and replaced when it finishes; one left in a
   * report means the shard was killed on it, and the merge counts it as a `hung` failure.
   */
  status: "ok" | "failed" | "skipped" | "known-gap" | "in-progress";
  skipReason?: SkipReason;
  /** The failing gate id, or the failure kind when no gate ran. */
  gate?: string;
  /** The decision id or step of a walk failure; `output` for a gate failure after replay. */
  decisionPoint?: string;
  detail?: string;
  /** The owner of a KNOWN_GAPS-owned failure. */
  owner?: string;
  /** Serialised AuthorRun minus its bundle. */
  run?: unknown;
}

export function summarise(tier: string, shard: string, entries: readonly SweepEntry[]): SweepSummary {
  const summary: SweepSummary = {
    tier,
    shard,
    cases: { completed: 0, skipped: 0, failed: 0 },
    byGate: {},
    byFirstFailingStep: {},
    skips: {},
  };
  for (const e of entries) {
    if (e.status === "skipped") {
      summary.cases.skipped++;
      const reason = e.skipReason ?? "missing";
      (summary.skips[reason] ??= []).push(e.caseId);
    } else if (e.status === "failed" || e.status === "in-progress") {
      summary.cases.failed++;
      const gate = (e.gate ?? "unknown") as keyof SweepSummary["byGate"];
      (summary.byGate[gate] ??= []).push(e.caseId);
      (summary.byFirstFailingStep[e.decisionPoint ?? "unknown"] ??= []).push(e.caseId);
    } else {
      summary.cases.completed++;
    }
  }
  return summary;
}
