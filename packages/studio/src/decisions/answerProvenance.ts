// answerProvenance — the spec-088 D-05 mapping from a saved answer's
// proposal to the decision record's provenance vocabulary.
//
// Shared by the two writers that turn saved answers into decision records:
// the live completion writer (`recordAnswersAsDecisions`, steps/reducer.ts)
// and the v1→v2 draft migration (lib/draftPersistence.ts). The comparison
// itself is the one `recordSurveyAnswers.deriveAnswerProvenance` already
// trusts for the spec-053 log (proposal match + source "base" ⇒ extracted;
// match otherwise ⇒ default; differ/absent ⇒ asked) — this module maps that
// comparison onto the 087 `DecisionProvenance` vocabulary and computes the
// record's `offered` / `source` fields. It does not import the contracts
// provenance type; the two vocabularies stay separate (research §1).

import { deepEqual } from "./deepEqual.ts";
import type { DecisionProvenance } from "./decisionTypes.ts";

/** The proposal half of a `SavedAnswer` (steps/answerTypes.ts), structurally. */
export interface AnswerProposalLike {
  value: unknown;
  source?: string;
}

export interface AnswerProvenanceResult {
  provenance: DecisionProvenance;
  /** Set only when a proposal existed and the completed value differs from it. */
  offered?: unknown;
  /** Origin name, when one can be named (see below). */
  source?: string;
}

/**
 * Map one completed answer to its decision-record provenance.
 *
 * - No proposal, or the value differs from the proposal → `"asked"`; a
 *   differing proposal's value is kept as `offered` (FR-001).
 * - Value equals a proposal whose source is `"base"` → `"extracted"`. The
 *   record's `source` names the starting-point keyboard when the caller can
 *   supply it (`baseSourceName`); the proposal's own source label is the
 *   generic `"base"`, not a keyboard id, so it is never copied into `source`.
 * - Value equals any other proposal → `"default"`, with `source` carrying
 *   the proposal's source label (e.g. `"langtags"`) when it has one.
 */
export function answerProvenance(
  value: unknown,
  proposal: AnswerProposalLike | undefined,
  baseSourceName?: string,
): AnswerProvenanceResult {
  if (proposal === undefined) return { provenance: "asked" };
  if (!deepEqual(value, proposal.value)) {
    return { provenance: "asked", offered: proposal.value };
  }
  if (proposal.source === "base") {
    return baseSourceName !== undefined
      ? { provenance: "extracted", source: baseSourceName }
      : { provenance: "extracted" };
  }
  return proposal.source !== undefined
    ? { provenance: "default", source: proposal.source }
    : { provenance: "default" };
}
