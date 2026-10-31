// Parity between an author run and a recorded UI walk (spec 107 US2,
// FR-020 to FR-023). Compares the author's DecisionSet with the record's,
// folded the way spec 106's replay folds it (recordToDecisionSet), per decision
// id and value; and the author's 053 agency with the record's, per decision.
//
// Run-specific values are normalised by named rule (research R8, FR-023);
// everything else, generated ids included, is compared exactly:
//   - timestamps: `recordedAt` is not part of a decision value; dropped.
//   - zzq: a `zzq<hex>` placeholder sequence is reduced to `zzq`, as the
//     decision-point fidelity test does (the harness typed a placeholder;
//     its hex is the character, already compared elsewhere in the value).
//   - carve-fingerprint: `suggestionFingerprint` is recomputed on both sides
//     with suggestionFingerprintOf over the characters it names, so an older
//     build's spelling of the same suggestion set compares equal.
//   - tester-typed: where the author run's own PolicyStep for a decision has
//     rule `placeholder` (the product proposed nothing and had no default), the
//     record's value is tester-typed text; it is compared on presence, not value.
//     Keyed off the PolicyStep rule, never off a decision id.

import type { DecisionRecord } from "@keyboard-studio/contracts";
import { effectiveEntries } from "@keyboard-studio/contracts";
import { suggestionFingerprintOf } from "../../survey/carve/carveValue.ts";
import { recordToDecisionSet } from "../recordToDecisionSet.ts";
import type { AuthorRun, ParityAllowEntry } from "./caseTypes.ts";

export interface ParityDiff {
  decisionId: string;
  author: unknown;
  recorded: unknown;
  /** The normalisation rules that applied before the values still differed. */
  normalisedBy?: string;
}

export interface ParityResult {
  diffs: ParityDiff[];
  unexplained: ParityDiff[];
  /** Allow-list entries for this case whose difference no longer occurs (FR-022). */
  stale: ParityAllowEntry[];
}

const ZZQ = /zzq[0-9A-Fa-f]+/g;

// Read locally rather than through carveValue's suggestedCharsOf: no
// production file calls that, so the inventory (FR-014) cannot list it.
function fingerprintChars(fingerprint: string): string[] {
  try {
    const parsed: unknown = JSON.parse(fingerprint);
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === "string") : [];
  } catch {
    return [];
  }
}

/** Apply the named rules; returns the value and which rules changed something. */
function normalise(value: unknown, applied: Set<string>): unknown {
  if (typeof value === "string") {
    const out = value.replace(ZZQ, "zzq");
    if (out !== value) applied.add("zzq");
    return out;
  }
  if (Array.isArray(value)) return value.map((v) => normalise(v, applied));
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "recordedAt") {
        applied.add("timestamps");
        continue;
      }
      if (k === "suggestionFingerprint" && typeof v === "string") {
        // The fingerprint is a JSON array of the suggested characters.
        const named = fingerprintChars(v);
        const again = named.length > 0 ? suggestionFingerprintOf(named) : v;
        if (again !== v) applied.add("carve-fingerprint");
        out[k] = again;
        continue;
      }
      out[k] = normalise(v, applied);
    }
    return out;
  }
  return value;
}

/** Key-order-independent deep equality for JSON-shaped values. */
function sameJson(a: unknown, b: unknown): boolean {
  const canon = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canon)
      : typeof v === "object" && v !== null
        ? Object.fromEntries(
            Object.entries(v as Record<string, unknown>)
              .filter(([, x]) => x !== undefined)
              .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
              .map(([k, x]) => [k, canon(x)]),
          )
        : v;
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}

/**
 * The decision ids whose value the author typed as a placeholder. A PolicyStep
 * names a decision id or, for a flow question, the question id; a question id is
 * resolved to the decisions it provides by folding the author's own record entry
 * for it through recordToDecisionSet (the fold the record side uses), so no
 * question or decision id is named here.
 */
function testerTypedDecisions(run: AuthorRun): Set<string> {
  const out = new Set<string>();
  for (const step of run.report.steps) {
    if (step.rule !== "placeholder") continue;
    out.add(step.decisionId);
    const record = run.record;
    if (record === undefined) continue;
    for (const e of effectiveEntries(record.entries)) {
      if (e.payload.kind !== "survey-answer" || e.payload.questionId !== step.decisionId) continue;
      const one = { ...record, entries: [{ ...e, supersedes: null }] } as DecisionRecord;
      for (const id of Object.keys(recordToDecisionSet(one, "tolerance"))) out.add(id);
    }
  }
  return out;
}

/** A value is present when it is neither absent nor an empty string. */
function present(v: unknown): boolean {
  return v !== undefined && v !== null && v !== "";
}

export function compareParity(
  run: AuthorRun,
  record: DecisionRecord,
  allow: readonly ParityAllowEntry[],
): ParityResult {
  const recorded = recordToDecisionSet(record, "tolerance") as Record<string, { value: unknown } | undefined>;
  // The author's side is folded from its own record, the way the record side is:
  // a decision is recorded when its step completes, so a value a later step
  // keeps editing in the live store (the punctuation step seeds the shared
  // character-inventory draft after the characters step recorded it) is
  // compared as recorded, not as the store ends.
  const authored = (
    run.record !== undefined ? recordToDecisionSet(run.record, "tolerance") : (run.decisions ?? {})
  ) as Record<string, { value: unknown } | undefined>;
  // Only the decisions the record carries are compared: a record never holds
  // the decisions its build did not have (e.g. caps-handling before spec 106 US5).
  const diffs: ParityDiff[] = [];
  const testerTyped = testerTypedDecisions(run);
  for (const id of Object.keys(recorded).sort()) {
    const applied = new Set<string>();
    if (testerTyped.has(id)) {
      // Presence only: both sides must carry some value.
      if (!present(authored[id]?.value) || !present(recorded[id]?.value)) {
        diffs.push({
          decisionId: id,
          author: authored[id]?.value,
          recorded: recorded[id]?.value,
          normalisedBy: "tester-typed",
        });
      }
      continue;
    }
    const a = normalise(authored[id]?.value, applied);
    const r = normalise(recorded[id]?.value, applied);
    if (!sameJson(a, r)) {
      diffs.push({
        decisionId: id,
        author: authored[id]?.value,
        recorded: recorded[id]?.value,
        ...(applied.size > 0 ? { normalisedBy: [...applied].sort().join(",") } : {}),
      });
    }
  }
  const mine = allow.filter((e) => e.caseId === run.caseId);
  const explained = (d: ParityDiff): boolean => mine.some((e) => e.decisionId === d.decisionId);
  return {
    diffs,
    unexplained: diffs.filter((d) => !explained(d)),
    stale: mine.filter((e) => !diffs.some((d) => d.decisionId === e.decisionId)),
  };
}

export interface AgencyDiff {
  /** The decision id or, for a survey answer, the question id. */
  key: string;
  author: string | undefined;
  recorded: string | undefined;
}

/** The last effective agency per decision / question id. */
function agencies(record: DecisionRecord): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of effectiveEntries(record.entries)) {
    const p = e.payload;
    const key = p.kind === "decision" ? p.decisionId : p.kind === "survey-answer" ? p.questionId : undefined;
    if (key !== undefined) out.set(key, e.provenance.agency);
  }
  return out;
}

/**
 * The 053 agency the author recorded against the record's, for every key the
 * record carries (data-model.md provenance mapping). Values are compared by
 * compareParity; this is the provenance half (T044).
 */
export function compareAgency(run: AuthorRun, record: DecisionRecord): AgencyDiff[] {
  const mine = run.record === undefined ? new Map<string, string>() : agencies(run.record);
  const theirs = agencies(record);
  const out: AgencyDiff[] = [];
  for (const [key, agency] of [...theirs].sort(([x], [y]) => (x < y ? -1 : 1))) {
    if (mine.get(key) !== agency) out.push({ key, author: mine.get(key), recorded: agency });
  }
  return out;
}
