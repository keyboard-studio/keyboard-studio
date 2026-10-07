// recordGalleryDecisions — record one decision-log entry per settled
// gallery decision at a step's completion (spec 090 US5, FR-008/SC-003,
// research R6, ruling D-090-48).
//
// WHY THIS EXISTS: the log's other recorders are driven by a step result's
// `answers` (recordSurveyAnswers) or by editor activity (recordEditorStep).
// A gallery step's result carries neither for its decision — the decision
// was recorded into the decision store while the author worked the step
// (gallery host / step adapters) — which is exactly why `layout`, `rules`,
// `touch_seed_source`, `deadkeys`, and usually `punctuation` and
// `convenience` left no log entry at all (HANDOFF G7). Recording therefore
// moves from answer-driven to DECISION-driven for the steps that settle
// gallery decisions: at completion, each settled decision of the step (its
// `settles` list, resolved by the caller against the live decision set)
// appends exactly one entry of the contracts `decision` payload kind.
//
// EXACTLY-ONE is the log's own doing, not a check here: the entry's slot is
// keyed by decision id (decisionLogStore.slotKeyOf), so re-completing a
// step with an unchanged value is the identical-revisit no-op, and a
// changed value supersedes the live entry — one live entry per decision
// across all steps, which is SC-003's statement.
//
// The payload carries the decision VALUE (as JSON) and a bounded SUMMARY
// composed here, by the recording host: the trail renders the summary
// verbatim, so no rendering surface needs per-module knowledge of what a
// value means (D-090-48). The summary names the decision by its module's
// audit label and digests the value's shape generically — a scalar reads
// as itself, a collection as its item count.

import {
  DECISION_SUMMARY_LIMIT,
  type DecisionProvenance as LogProvenance,
  type DecisionProposalSource,
  type JsonValue,
} from "@keyboard-studio/contracts";
import { galleryModuleFor } from "../survey/questions/registry.ts";
import type { DecisionEntryInput } from "./decisionLogStore.ts";
import type { Decision, DecisionId } from "./decisionTypes.ts";

export interface RecordGalleryDecisionsDeps {
  /** The log's append (returns `null` on an identical revisit). */
  append: (input: DecisionEntryInput) => string | null;
  /** The completing step's settled gallery decisions, in `settles` order. */
  decisions: readonly Decision[];
}

const PROPOSAL_SOURCES: ReadonlySet<string> = new Set([
  "langtags",
  "cldr",
  "corpus",
  "axis-fill",
  "base",
  "identity",
  "region",
  "derived-from-axis",
  "analysis",
] satisfies DecisionProposalSource[]);

/**
 * Map a decision record's provenance (the 087/088 vocabulary) onto the
 * log's agency/source axes (the spec-053 vocabulary), mirroring
 * `deriveAnswerProvenance`'s readings where the two overlap:
 *
 * - `asked` — the author's own value ⇒ `hand-set`;
 * - `extracted` — read off the base keyboard ⇒ `base-derived` from `base`
 *   (the record's `source` names the base KEYBOARD, an identifier, so the
 *   log's source names the axis value `base`, never the raw id);
 * - `default` — a tool proposal the author kept ⇒ `tool-proposed`, with
 *   the proposal's source label when it is one the log's union names;
 * - `derived` — computed by the tool from other decisions ⇒
 *   `tool-proposed`, sourceless (no single proposal stands behind it).
 */
export function logProvenanceFor(record: Decision): LogProvenance {
  switch (record.provenance) {
    case "asked":
      return { agency: "hand-set" };
    case "extracted":
      return { agency: "base-derived", source: "base" };
    case "derived":
      return { agency: "tool-proposed" };
    case "default": {
      const source = record.source;
      return source !== undefined && PROPOSAL_SOURCES.has(source)
        ? { agency: "tool-proposed", source: source as DecisionProposalSource }
        : { agency: "tool-proposed" };
    }
  }
}

/**
 * The decision's value as JSON, or `undefined` when it has none / is not
 * JSON-shaped. Decision values are JSON by construction (the decision
 * store's snapshot persists them), so the round-trip is a normalization —
 * it drops `undefined` fields the way the draft snapshot does, keeping the
 * recorded value byte-comparable with a post-restore re-record — not a
 * conversion. A value that cannot round-trip (a cycle, a BigInt) is not
 * settled in any form the record can hold and is skipped rather than
 * allowed to break the step transition this recorder runs inside.
 */
function toJsonValue(value: unknown): JsonValue | undefined {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value)) as JsonValue;
  } catch {
    return undefined;
  }
}

function itemCount(n: number): string {
  return n === 1 ? "1 item" : `${n} items`;
}

/**
 * A generic, bounded digest of a decision value's shape — see the module
 * header. `undefined` means "nothing truthful to add to the label": the
 * label alone is the summary (a settled windows-layout pick says what it
 * is by being recorded under its name; the value itself rides in the
 * payload for anyone who expands the entry).
 */
function valueDigest(value: JsonValue): string | undefined {
  if (typeof value === "string") return value === "" ? undefined : value;
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.length === 0 ? "none" : itemCount(value.length);
  if (value === null) return undefined;
  const arrayFields = Object.values(value).filter(Array.isArray);
  if (arrayFields.length > 0) {
    const total = arrayFields.reduce((sum, field) => sum + field.length, 0);
    return total === 0 ? "none" : itemCount(total);
  }
  return undefined;
}

/**
 * Compose the payload summary for one gallery decision: the module's audit
 * label, plus the value digest when there is one, truncated to
 * {@link DECISION_SUMMARY_LIMIT} — the same literal the record schema
 * enforces, so a host-composed summary can never fail its own boundary.
 */
export function summarizeGalleryDecision(decisionId: DecisionId, value: JsonValue): string {
  const label = galleryModuleFor(decisionId)?.definition.audit_label ?? decisionId;
  const digest = valueDigest(value);
  const summary = digest !== undefined ? `${label}: ${digest}` : label;
  return summary.length > DECISION_SUMMARY_LIMIT
    ? `${summary.slice(0, DECISION_SUMMARY_LIMIT - 1)}…`
    : summary;
}

/**
 * Record every settled gallery decision of a completed step.
 *
 * @returns the `entryId` of each decision that produced a new entry, in
 *   `settles` order. Identical revisits contribute nothing, so the result
 *   can be shorter than `deps.decisions` — callers use it to build the
 *   boundary's co-decision set for impact attribution.
 */
export function recordGalleryDecisions(
  stepId: string,
  deps: RecordGalleryDecisionsDeps,
): string[] {
  const recorded: string[] = [];
  for (const decision of deps.decisions) {
    const value = toJsonValue(decision.value);
    if (value === undefined) continue;
    const entryId = deps.append({
      stepId,
      payload: {
        kind: "decision",
        decisionId: decision.id,
        value,
        summary: summarizeGalleryDecision(decision.id, value),
      },
      provenance: logProvenanceFor(decision),
    });
    if (entryId !== null) recorded.push(entryId);
  }
  return recorded;
}
