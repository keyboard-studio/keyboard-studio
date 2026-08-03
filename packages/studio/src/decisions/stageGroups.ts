// stageGroups — group a decision record's entries by the stage (manifest step)
// they were made in, for the staged-narrative presentation
// (specs/055-legible-decision-trail FR-022 through FR-026; research D-02).
//
// Pure derivation over an EXISTING record. Not persisted, not a second record
// (spec Key Entities, "Stage group"): every render recomputes this from the
// record and the flow's own manifest ordering, so there is nothing here that
// can drift from either.
//
// D-02 is the rule this module exists to get right: an editor step's counts
// are CUMULATIVE per step by design (a revisit appends a superseding entry
// carrying the step's new TOTAL, per recordEditorStep.ts's header). Summing a
// stage's entries would therefore double-count every revisit — a carve of 40
// keys revisited to 172 must roll up as 172, not 212. `rollUp` is read from
// the latest EFFECTIVE (non-superseded) entry only, matching the same
// effective-entry filtering `prSummary.ts` already applies (SC-007: the two
// surfaces must agree). Superseded entries are never summed, but they are
// never dropped from `entries` either (FR-026) — the group still shows them
// as history, `rollUp` just does not read them.

import type {
  DecisionEntry,
  EditorActionSummary,
  EditorActionType,
} from "@keyboard-studio/contracts";
import { manifest } from "../steps/manifest.ts";
import type { HeadlineDimension, HeadlineDimensionKind } from "./headline.ts";

/**
 * A stage's one-line net effect (FR-023), as a structured code — never
 * English prose. The component maps each variant to catalog text, the same
 * split `headline.ts` uses for entry-level headlines.
 */
export type StageRollUp =
  // FR-025: this stage was never entered / nothing was recorded for it. Kept
  // distinct from `editor-no-change` below, which means the stage WAS entered
  // and measured, and every dimension came back zero — "untouched" and
  // "touched but made no change" are different findings and must not collapse
  // into one rendering.
  | { kind: "not-recorded" }
  // At least one measured dimension is non-zero, in the same fixed dimension
  // order `headline.ts` uses (FR-011, SC-004).
  | { kind: "editor-summary"; actionType: EditorActionType; dimensions: readonly HeadlineDimension[] }
  // Every dimension this stage measures was present and zero.
  | { kind: "editor-no-change"; actionType: EditorActionType }
  // At least one dimension this stage would report was never measured
  // (FR-005a) — reported in words as "not measured", never coerced to zero.
  | { kind: "editor-unmeasured"; actionType: EditorActionType }
  // FR-030/FR-031: what the working copy inherited at instantiation.
  // `startingKeyCount` absent means unmeasured, same absence convention as the
  // editor counts (FR-005) — never `?? 0`.
  | { kind: "base-contribution"; startingKeyCount: number | undefined }
  // A stage whose effective entries are survey answers: the count of those
  // answers (D-02 — "for survey decisions, a count of the effective answers").
  | { kind: "survey-summary"; answerCount: number };

/** A stage, its decisions in walked order, and its one-line net effect. */
export interface StageGroup {
  /** The manifest step id this stage belongs to, or an unknown id (FR-024). */
  stepId: string;
  /** Every entry recorded under this stage, in record order — INCLUDING superseded history (FR-026). */
  entries: readonly DecisionEntry[];
  /** The stage's net effect, read from its effective entries only (D-02). */
  rollUp: StageRollUp;
}

const DIMENSION_ORDER: readonly HeadlineDimensionKind[] = [
  "keysRemoved",
  "keysAdded",
  "mechanismsAssigned",
  "touchKeysAffected",
];

/** The latest effective editor-action entry's fields, or `undefined` if none. */
function latestEditorAction(
  effective: readonly DecisionEntry[],
): { actionType: EditorActionType; summary: EditorActionSummary } | undefined {
  for (let i = effective.length - 1; i >= 0; i--) {
    const payload = effective[i]!.payload;
    if (payload.kind === "editor-action") {
      return { actionType: payload.actionType, summary: payload.summary };
    }
  }
  return undefined;
}

/** The first effective base-contribution entry's starting count, or `undefined` if none. */
function firstBaseContribution(
  effective: readonly DecisionEntry[],
): { startingKeyCount: number | undefined } | undefined {
  for (const entry of effective) {
    const payload = entry.payload;
    if (payload.kind === "base-contribution") return { startingKeyCount: payload.startingKeyCount };
  }
  return undefined;
}

/**
 * Read a stage's net effect off an editor entry's counts (D-02): only the
 * dimensions that are present AND non-zero are mentioned, matching FR-011's
 * zero-suppression. `undefined` and `0` are checked explicitly and separately
 * throughout — `undefined > 0` is `false` in JS and would silently treat
 * "not measured" the same as "measured zero", which FR-005a forbids.
 */
function editorRollUp(actionType: EditorActionType, summary: EditorActionSummary): StageRollUp {
  const counts: Record<HeadlineDimensionKind, number | undefined> = {
    keysRemoved: summary.keysRemoved,
    keysAdded: summary.keysAdded,
    mechanismsAssigned: summary.mechanismsAssigned,
    touchKeysAffected: summary.touchKeysAffected,
  };

  const dimensions: HeadlineDimension[] = [];
  for (const kind of DIMENSION_ORDER) {
    const count = counts[kind];
    if (count !== undefined && count > 0) dimensions.push({ kind, count });
  }
  if (dimensions.length > 0) return { kind: "editor-summary", actionType, dimensions };

  const allMeasured = DIMENSION_ORDER.every((kind) => counts[kind] !== undefined);
  return allMeasured
    ? { kind: "editor-no-change", actionType }
    : { kind: "editor-unmeasured", actionType };
}

/** A stage's net effect from its EFFECTIVE (non-superseded) entries only (D-02). */
function computeRollUp(
  entries: readonly DecisionEntry[],
  supersededIds: ReadonlySet<string>,
): StageRollUp {
  if (entries.length === 0) return { kind: "not-recorded" };

  const effective = entries.filter((e) => !supersededIds.has(e.entryId));
  // A chain's tip is never superseded, so this is defensive rather than a
  // reachable case for a well-formed record — but it must still read as
  // "nothing recorded" rather than fabricate a change from history alone.
  if (effective.length === 0) return { kind: "not-recorded" };

  const editorAction = latestEditorAction(effective);
  if (editorAction !== undefined) return editorRollUp(editorAction.actionType, editorAction.summary);

  const base = firstBaseContribution(effective);
  if (base !== undefined) return { kind: "base-contribution", startingKeyCount: base.startingKeyCount };

  return { kind: "survey-summary", answerCount: effective.length };
}

/**
 * Group a record's entries by stage, ordered by the stage's position in the
 * flow manifest (FR-022) — the order the author actually walked, not
 * insertion order and not alphabetical.
 *
 * One group per manifest step, always — including a step for which nothing
 * was recorded (`rollUp: { kind: "not-recorded" }`), so the renderer can
 * choose to omit it or show it as untouched (spec Edge Cases) without having
 * to re-derive "was this step ever reached" from the record itself.
 *
 * Any `stepId` absent from the manifest — {@link PRE_IDENTITY_STEP_ID}, or a
 * step id a later build removed — is NEVER dropped (FR-024): its group is
 * placed first, ahead of every manifest stage, under what the renderer treats
 * as a generic heading. Multiple such stepIds are ordered by their first
 * appearance in the record, the only stable order available for ids the
 * manifest does not place.
 */
export function buildStageGroups(
  record: { readonly entries: readonly DecisionEntry[] },
): readonly StageGroup[] {
  const supersededIds = new Set<string>();
  for (const entry of record.entries) {
    if (entry.supersedes !== null) supersededIds.add(entry.supersedes);
  }

  const entriesByStep = new Map<string, DecisionEntry[]>();
  const firstSeenOrder: string[] = [];
  for (const entry of record.entries) {
    let bucket = entriesByStep.get(entry.stepId);
    if (bucket === undefined) {
      bucket = [];
      entriesByStep.set(entry.stepId, bucket);
      firstSeenOrder.push(entry.stepId);
    }
    bucket.push(entry);
  }

  const manifestStepIds = manifest.map((step) => step.id);
  const manifestStepIdSet = new Set(manifestStepIds);

  // Unknown-to-the-manifest stepIds (PRE_IDENTITY_STEP_ID included, since it
  // is a placeholder value the manifest never contains — see the module this
  // constant is re-exported alongside in the contract) sorted first, in
  // first-appearance order.
  const unknownStepIds = firstSeenOrder.filter((id) => !manifestStepIdSet.has(id));

  const orderedStepIds = [...unknownStepIds, ...manifestStepIds];

  return orderedStepIds.map((stepId) => {
    const entries = entriesByStep.get(stepId) ?? [];
    return { stepId, entries, rollUp: computeRollUp(entries, supersededIds) };
  });
}
