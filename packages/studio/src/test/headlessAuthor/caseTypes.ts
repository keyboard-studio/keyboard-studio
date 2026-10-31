// Test-only types for the headless scripted author (spec 107, data-model.md).
// Nothing here enters @keyboard-studio/contracts; no Pattern field changes.

import type { DecisionRecord } from "@keyboard-studio/contracts";
import type { DecisionSet } from "../../decisions/decisionTypes.ts";
import type { OutputBundle } from "../../lib/buildOutputBundle.ts";
import type { GateId, GateResult } from "../consistencyGates.ts";

/** One row of `cases/harness-cases.json`, exactly as the harness writes it. */
export interface HarnessCaseRow {
  id: string;
  profile: number;
  lang: string;
  base: string;
  english: string;
  autonym: string;
  code: string;
  inputOrder: string;
  outputForm: string;
  backspace: string;
  backspaceOnDiagonal: boolean;
  sampleText: string;
  overwriteChar?: string;
  overwriteKey?: string;
  /** Not in the harness file; looked up from the corpus when absent. */
  group?: string;
  /** Not in the harness file; defaults to `copy`. */
  track?: "copy" | "adapt";
  /** Not in the harness file; taken from the identity step's prefill when absent. */
  script?: string;
}

/** A harness override: put `char` on `key` ("Assign to a key"). */
export interface Override {
  kind: "overwrite";
  char: string;
  key: string;
}

/** A case after loading: the harness row plus group, track and overrides resolved. */
export interface Case {
  id: string;
  base: string;
  group: string;
  track: "copy" | "adapt";
  english: string;
  autonym: string;
  code: string;
  script?: string;
  profile: number;
  lang: string;
  inputOrder: string;
  outputForm: string;
  backspace: string;
  backspaceOnDiagonal: boolean;
  sampleText: string;
  overrides: Override[];
}

export type Shape =
  | "simple"
  | "deadkey-heavy"
  | "touch-layout"
  | "any-index"
  | "readonly-group"
  | "opaque-group"
  | "mixed-case-group"
  | "non-latin"
  | "regression-guard";

/** One `prSet.json` entry: exactly one of `caseId` or `case`. */
export interface PrSetEntry {
  caseId?: string;
  case?: HarnessCaseRow;
  shape: Shape[];
  reason: string;
  /** The repaired defect (commit or PR) a `regression-guard` entry protects. */
  guards?: string;
}

export type PolicyRule = "override" | "top-suggestion" | "default" | "placeholder";

/** One applied decision. */
export interface PolicyStep {
  decisionId: string;
  rule: PolicyRule;
  value: unknown;
  /** The product function the value came from (absent for the placeholder). */
  proposalSource?: string;
}

export type SkipReason =
  | "missing"
  | "not-codec-clean"
  | "unsupported-script-stub"
  | "outside-slice"
  // Sweep tiers only: the keyboard has more rules than a walk can finish inside the case timeout.
  | "too-large";

export type FailureKind =
  | "proposal-threw"
  | "placeholder-clash"
  | "network-required"
  | "scaffold-failed"
  | "compile-failed"
  // The routing stayed on a step (the Phase F hard gate refusing to advance).
  | "step-blocked";

export interface RunFailure {
  step: string;
  decisionId?: string;
  kind: FailureKind;
  detail: string;
}

export type DisplacementAction = "confirm-move" | "keep-both" | "leave" | "demote-displaced";

export interface RunReport {
  steps: PolicyStep[];
  placeholders: { char: string; sequence: string; decisionId: string }[];
  displacements: { char: string; key: string; displaced: string; action: DisplacementAction }[];
  /** Steps the product auto-completed (nothing to ask). */
  skippedSteps: { step: string; reason: string }[];
  /** Gate failures spec 106's KNOWN_GAPS already owns. */
  knownGaps: { gate: GateId; owner: string }[];
  /** Playwright-only decisions this run does not cover (FR-042); ids from playwrightOnly.ts. */
  notCovered: string[];
  /** The store default used (FR-060); not in any decision value or the record. */
  fallbackPolicy: string;
  timingMs: { author: number; replay: number };
}

export interface AuthorRun {
  caseId: string;
  outcome: "completed" | "skipped" | "failed";
  skipReason?: SkipReason;
  failure?: RunFailure;
  record?: DecisionRecord;
  decisions?: DecisionSet;
  bundle?: OutputBundle;
  gates: GateResult[];
  report: RunReport;
}

/** A reviewed explanation of one parity difference. Records are never edited. */
export interface ParityAllowEntry {
  caseId: string;
  decisionId: string;
  reason: string;
  /** A commit, a PR, or `record-age:<build>`. */
  explainedBy: string;
}

export interface SweepSummary {
  tier: string;
  shard?: string;
  cases: { completed: number; skipped: number; failed: number };
  byGate: Partial<Record<GateId, string[]>>;
  byFirstFailingStep: Record<string, string[]>;
  skips: Partial<Record<SkipReason, string[]>>;
}
