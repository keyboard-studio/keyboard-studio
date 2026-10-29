// recordToDecisionSet — turn a decision record (the `.studio/decision-record.json`
// a walk zip ships) into the DecisionSet the working-copy replay folds, cut at a
// named decision point (spec 106 US1, FR-001).
//
// Each point is an EXPLICIT allow-list of decision ids plus sub-field masks.
// `decisionOrderFor` is deliberately not used: in registry order carve comes
// before assignments, `caps-handling` can sort before marks, and `tolerance` is
// not a decision id at all -- it is `marks-treatment.value.contextTolerance`.

import { effectiveEntries } from "@keyboard-studio/contracts";
import type { DecisionRecord } from "@keyboard-studio/contracts";
import { parseDecisionRecord } from "@keyboard-studio/engine";
import { questionRegistry } from "../survey/questions/registry.ts";
import type { Decision, DecisionId, DecisionSet } from "../decisions/decisionTypes.ts";
import { DECISION_POINTS, type DecisionPoint } from "./decisionPointBases.ts";

/** Identity, inventory and layout: everything before the marks series completes. */
const MARKS_IDS: readonly string[] = [
  "language-name",
  "language-region",
  "language-autonym",
  "language-code",
  "target-script",
  "author-name",
  "author-email",
  "copyright-holder",
  "authoring-track",
  "project-display-name",
  "project-keyboard-id",
  "windows-layout",
  "base-keyboard",
  "character-inventory",
  "punctuation-inventory",
  "retained-convenience-chars",
  "marks-treatment",
];

/** Ids each point adds on top of the previous one. */
const ADDED_AT: Record<DecisionPoint, readonly string[]> = {
  marks: MARKS_IDS,
  carve: ["carved-layout"],
  assignments: ["deadkeys-defined", "rule-set", "physical-layout"],
  // Absent from records that predate the caps-handling decision; the harness
  // seeds the module default in that case.
  caps: ["caps-handling"],
  tolerance: [],
};

function allowedAt(point: DecisionPoint): ReadonlySet<string> {
  const upTo = DECISION_POINTS.indexOf(point);
  return new Set(DECISION_POINTS.slice(0, upTo + 1).flatMap((p) => ADDED_AT[p]));
}

function asDecision(id: string, value: unknown): Decision<unknown> {
  // Everything a recorded author or tool settled is replayed whole: "asked"
  // records are never recomputed by the rebuild's recalculation pass.
  return { id: id as DecisionId, value, provenance: "asked" };
}

/**
 * The marks-treatment value with the tolerance sub-field masked. The decision
 * point `tolerance` is the only one that carries it.
 */
function withToleranceMask(value: unknown, keepTolerance: boolean): unknown {
  if (keepTolerance || typeof value !== "object" || value === null) return value;
  return { ...(value as Record<string, unknown>), contextTolerance: null };
}

export function recordToDecisionSet(
  record: DecisionRecord | string,
  upTo: DecisionPoint,
): DecisionSet {
  const parsed = typeof record === "string" ? parseDecisionRecord(record).record : record;
  const allowed = allowedAt(upTo);
  const keepTolerance = upTo === "tolerance";
  const out: Partial<Record<DecisionId, Decision<unknown>>> = {};

  // Last effective entry wins, in record order.
  for (const entry of effectiveEntries(parsed.entries)) {
    const p = entry.payload;
    if (p.kind === "decision") {
      if (!allowed.has(p.decisionId)) continue;
      const value = p.decisionId === "marks-treatment"
        ? withToleranceMask(p.value, keepTolerance)
        : p.value;
      out[p.decisionId as DecisionId] = asDecision(p.decisionId, value);
    } else if (p.kind === "survey-answer") {
      // A survey answer reaches the decision set through the registry module
      // that owns the question and `provides` the decision. Answers with no
      // such module (the marks series' own sub-answers, invisibles, phase B
      // bookkeeping) are carried by their composite decision entry instead.
      const mod = questionRegistry[p.questionId];
      for (const id of mod?.provides ?? []) {
        if (allowed.has(id)) out[id] = asDecision(id, p.value);
      }
    }
  }
  return out;
}
