// openRatchet — the Open-mode ratchet: what was already wrong, what is new,
// and whether the submit gate may let the author through (spec 111, US2).
//
// Pure: no store reads, no timers. A finding is keyed `${lintRuleId}:${file}`
// (FindingKey). The baseline is the set of keys failing when the keyboard was
// opened; a current failing key not in it is NEW. The gate blocks on a compile
// error, an unconfirmed red item, or a new failure with no review note, and
// never on a pre-existing failure.

import type { FindingKey, ReviewNote } from "@keyboard-studio/contracts";

import type { CriteriaResult, ResolvedRow } from "./criteriaTypes.ts";

/** The baseline taken when the keyboard was opened (the criteria slice). */
export interface OpenBaseline {
  /** ISO time. */
  takenAt: string;
  /** Keys failing at open (stored as an array so the draft stays plain JSON). */
  failing: readonly FindingKey[];
  /** Criteria that could not be checked at load; never classified "new" later. */
  unresolvable: readonly string[];
}

export type FindingClass = "pre-existing" | "new";

/** One failing finding of the current result, with its owning criterion. */
export interface FailingFinding {
  key: FindingKey;
  criterionId: string;
}

/**
 * 18.6 reports one finding per missing character, all in the same file, so a
 * bare `${code}:${file}` key would fold a newly added language's characters
 * into the key an earlier gap already failed under and they could never read
 * as new (FR-018a). The character joins the key for that rule only.
 */
function characterSuffix(code: string, message: string | undefined): string {
  if (code !== "KM_LINT_INVENTORY_UNCOVERED") return "";
  const hex = message?.match(/U\+([0-9A-Fa-f]{4,6})/)?.[1];
  return hex === undefined ? "" : `#U+${hex.toUpperCase()}`;
}

/** The key of one lint finding: rule id, file, and for 18.6 the character. */
export function findingKeyOf(
  code: string,
  file: string | undefined,
  message: string | undefined,
): FindingKey {
  return `${code}:${file ?? ""}${characterSuffix(code, message)}` as FindingKey;
}

/**
 * The keys one failing row stands for: one per lint finding (rule id plus the
 * file it names), or a single `${criterionId}:` key when the row carries no
 * lint finding (a compile or assembly verdict).
 */
export function findingKeysOf(row: ResolvedRow): FindingKey[] {
  const evidence = row.evidence();
  const ruleId = evidence.lintRuleId ?? row.criterion.id;
  const findings = evidence.findings ?? [];
  if (findings.length === 0) return [`${ruleId}:` as FindingKey];
  const keys = new Set<FindingKey>();
  for (const f of findings) {
    keys.add(findingKeyOf(f.code, f.location?.file, f.message));
  }
  return [...keys];
}

/** Every failing finding in a result (rows whose status is Not met). */
export function collectFailing(result: CriteriaResult): FailingFinding[] {
  const out: FailingFinding[] = [];
  for (const row of result.rows) {
    if (row.status !== "not-met") continue;
    for (const key of findingKeysOf(row)) {
      out.push({ key, criterionId: row.criterion.id });
    }
  }
  return out;
}

/** Take the baseline from a result judged over the just-opened keyboard. */
export function takeBaseline(result: CriteriaResult, takenAt: string): OpenBaseline {
  return {
    takenAt,
    failing: [...new Set(collectFailing(result).map((f) => f.key))],
    unresolvable: result.rows
      .filter((r) => r.status === "not-yet-checkable")
      .map((r) => r.criterion.id),
  };
}

/** Pre-existing when the key was failing at open; otherwise new. */
export function classifyKey(key: FindingKey, baseline: OpenBaseline): FindingClass {
  return baseline.failing.includes(key) ? "pre-existing" : "new";
}

/**
 * Classify one row. Null when the row is not failing. A row whose criterion
 * was unresolvable at load is never new.
 */
export function classifyRow(
  row: ResolvedRow,
  baseline: OpenBaseline,
): FindingClass | null {
  if (row.status !== "not-met") return null;
  if (baseline.unresolvable.includes(row.criterion.id)) return "pre-existing";
  return findingKeysOf(row).some((k) => classifyKey(k, baseline) === "new")
    ? "new"
    : "pre-existing";
}

/** The failing findings that are new relative to the baseline. */
export function newFailures(
  result: CriteriaResult,
  baseline: OpenBaseline,
): FailingFinding[] {
  return collectFailing(result).filter(
    (f) =>
      !baseline.unresolvable.includes(f.criterionId) &&
      classifyKey(f.key, baseline) === "new",
  );
}

/** Criterion ids whose red-band confirmation is still outstanding. */
export function unconfirmedRedItems(result: CriteriaResult): string[] {
  return result.rows
    .filter((r) => r.status === "needs-human" && r.controls === "confirm")
    .map((r) => r.criterion.id);
}

/** Notes whose key is still failing; a note for a fixed finding is dropped. */
export function pruneReviewNotes(
  notes: readonly ReviewNote[],
  failingKeys: ReadonlySet<FindingKey>,
): ReviewNote[] {
  return notes.filter((n) => failingKeys.has(n.key));
}

export type RatchetBlockReason =
  | "compile-error"
  | "unconfirmed-red"
  | "unjustified-new-failure";

export interface RatchetInput {
  compileError: boolean;
  /** Criterion ids with an outstanding red-band confirmation. */
  unconfirmedRed: readonly string[];
  /** New failing findings (pre-existing ones are never passed in). */
  newFailures: readonly FailingFinding[];
  notes: readonly ReviewNote[];
}

export interface RatchetGate {
  blocked: boolean;
  reasons: RatchetBlockReason[];
  /** New failures with no non-empty note. */
  unjustified: FailingFinding[];
}

/** The gate matrix. Pre-existing failures never reach here, so never block. */
export function evaluateRatchet(input: RatchetInput): RatchetGate {
  const justified = new Set(
    input.notes.filter((n) => n.text.trim() !== "").map((n) => n.key),
  );
  const unjustified = input.newFailures.filter((f) => !justified.has(f.key));
  const reasons: RatchetBlockReason[] = [];
  if (input.compileError) reasons.push("compile-error");
  if (input.unconfirmedRed.length > 0) reasons.push("unconfirmed-red");
  if (unjustified.length > 0) reasons.push("unjustified-new-failure");
  return { blocked: reasons.length > 0, reasons, unjustified };
}

/** Compose the gate straight from a result, the baseline and the notes. */
export function ratchetFor(
  result: CriteriaResult,
  baseline: OpenBaseline,
  notes: readonly ReviewNote[],
  compileError: boolean,
): RatchetGate {
  return evaluateRatchet({
    compileError,
    unconfirmedRed: unconfirmedRedItems(result),
    newFailures: newFailures(result, baseline),
    notes,
  });
}
