// normalizationStepReproposal — a starting-point change supersedes a
// retained normalization-step acceptance (spec 086 step, spec 093 T017).
//
// The accepted step is fingerprint-scoped: the decision in the
// marks-treatment value names the digest of the OLD base's fixable rules
// (for a step, `normalization-step|<cache key of the old base's source>`),
// and the overlay it built replays the OLD base's generated group. Neither
// can carry to a new base — the apply hook would only ever call it stale.
// Under the T017 ruling the decision must therefore be RE-PROPOSED, never
// silently dropped and never silently carried: this transform supersedes
// the acceptance inside the retained marks-treatment value (the record
// itself — answers, completion, the rest of the value — stands whole, and
// the decision log keeps the prior record as history). With no standing
// acceptance, the context-tolerance analysis re-derives a step from the
// NEW base on the next compile and the Marks station presents it as a
// fresh offer the author must confirm again; nothing here applies a step.
//
// Scope: only an acceptance that names the normalization-step site. A
// decline, a 062 per-rule acceptance, and a missing decision are all left
// exactly as they stand (their own staleness handling is untouched), as is
// every other record in the set. Pure: no stores, no I/O.

import { NORMALIZATION_STEP_SITE_ID } from "@keyboard-studio/engine";

import type { MarksTreatmentValue } from "../survey/marks/marksValue.ts";
import type { DecisionSet } from "./decisionTypes.ts";

/**
 * Supersede a retained normalization-step acceptance in `decisions`, in
 * place of the recalculation's output set. Returns the input set
 * unchanged (same reference) when there is nothing to supersede.
 */
export function supersedeNormalizationStepAcceptance(decisions: DecisionSet): {
  decisions: DecisionSet;
  superseded: boolean;
} {
  const record = decisions["marks-treatment"];
  if (record === undefined) return { decisions, superseded: false };
  const value = record.value as MarksTreatmentValue | undefined;
  const tolerance = value?.contextTolerance ?? null;
  if (value === undefined || tolerance === null) return { decisions, superseded: false };
  if (!tolerance.acceptedSiteIds.includes(NORMALIZATION_STEP_SITE_ID)) {
    return { decisions, superseded: false };
  }
  const next = { ...record, value: { ...value, contextTolerance: null } };
  return { decisions: { ...decisions, "marks-treatment": next }, superseded: true };
}
