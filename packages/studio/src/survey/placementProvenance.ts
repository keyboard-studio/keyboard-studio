// placementProvenance — issue #331: the provenance a placement proposal
// shows alongside itself in the MechanismGallery suggestion row
// (the facet catalog's named consumer: lineage.placement-priors →
// "mechanism-gallery:suggestion-row", content/facets/lineage/
// placement-priors.yaml, whose provenanceLabel is "where existing
// keyboards place this character").
//
// Every proposal already CARRIES its provenance as stored metadata on
// the candidate (priorSource + priorCount, contracts PlacementCandidate
// — the #131/#133 fields). What was missing is the expression: the chip
// rendered the placement and an Accept button, and none of the evidence.
// This module decides WHAT provenance a candidate has to show; the
// gallery renders it (spec 085 FR-A2's pattern: provenance expressed ON
// the chip, attestation count included). Rendering — and only
// rendering — is all this adds: ranking, thresholds, and accept/deny
// behaviour are untouched, and a prior never overrides an author-made
// decision (the chip remains a proposal the author can deny, beside a
// manual path that never goes away).
//
// The three honest shapes:
//
//   - "corpus-community" — a corpus candidate AND the author told us
//     their community context (the pb_* placement-habit answers, via
//     communityContext.ts). The chip may use the issue's "communities
//     like yours chose…" framing, quantified by the attestation count.
//     The count is corpus-wide: the shipped placement-priors.json
//     carries no per-community subset (its per-entry bcp47Context ships
//     empty — 0 of 5072 entries), so the framing claims community
//     RELEVANCE (the author's stated context is what makes this corpus
//     evidence pertinent to them), never a filtered sub-count.
//   - "corpus" — a corpus candidate with no community context: the
//     plain corpus citation ("attested by N keyboards").
//   - "anchor" — a non-corpus candidate: the provenance IS its anchor
//     type (unicode-decomp / phonetic / confusable / manual), shown as
//     a label, per G1's "corpus citation or anchor type".
//
// A corpus candidate with priorCount 0 has no evidence to cite and
// yields null (no provenance line) rather than a hollow claim.

import type { PlacementCandidate, PriorSource } from "@keyboard-studio/contracts";
import type { CommunityContext } from "./communityContext.ts";

export type PlacementProvenance =
  | { kind: "corpus-community"; priorCount: number }
  | { kind: "corpus"; priorCount: number }
  | { kind: "anchor"; anchor: Exclude<PriorSource, "corpus"> };

/**
 * The provenance to express for one proposal, or null when the
 * candidate carries nothing citable.
 *
 * @param candidate  The proposal's top candidate (its stored metadata).
 * @param context    The author's community context, or null when the
 *                   placement-habit questions went unanswered.
 */
export function provenanceForCandidate(
  candidate: PlacementCandidate,
  context: CommunityContext | null,
): PlacementProvenance | null {
  if (candidate.priorSource === "corpus") {
    if (candidate.priorCount < 1) return null;
    return context !== null
      ? { kind: "corpus-community", priorCount: candidate.priorCount }
      : { kind: "corpus", priorCount: candidate.priorCount };
  }
  return { kind: "anchor", anchor: candidate.priorSource };
}
