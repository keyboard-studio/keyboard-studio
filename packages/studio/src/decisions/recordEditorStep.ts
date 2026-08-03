// recordEditorStep — aggregate one editor step into a single decision entry
// (specs/053-decision-audit FR-002).
//
// AGGREGATION IS THE REQUIREMENT, not a size optimisation. A carve that removes
// three hundred keys is one decision the author made ("remove what this
// orthography does not use"), not three hundred. Recording it per key would bury
// the actual decision in its own consequences, and the trail is read by a person.
//
// Which steps are editor actions, and which are not:
//
//   carve       -> gallery_edit     (keys removed from the desktop layout)
//   mechanisms  -> mechanism_edit   (mechanisms assigned to characters)
//   touch       -> touch_edit       (touch keys affected)
//
// `characters` is deliberately NOT here. What that step produces is a declared
// character inventory — an answer about the orthography — not an edit to the
// source, and its answers are already recorded individually by
// recordSurveyAnswers. Classing it as an editor action would report an alphabet
// as if it were a layout change.
//
// The counts are read at step completion and are CUMULATIVE for the step, which
// is exactly right given supersession: a return visit appends a superseding entry
// describing the step's new total, and the earlier entry survives as history. So
// the live entry always answers "what does this step amount to now?" and the
// chain answers "how did it get there?".
//
// ABSENCE, per specs/055-legible-decision-trail data-model.md §1's producer/
// consumer matrix: each editor stage measures only the dimensions it actually
// produces. A dimension a stage does not measure is left `undefined`, never
// coerced to `0` — a present `0` means "measured, and nothing changed" (FR-005).

import {
  EDITOR_ACTION_SAMPLE_LIMIT,
  type EditorActionSummary,
  type EditorActionType,
  type KeyboardIR,
  type MechanismAssignment,
} from "@keyboard-studio/contracts";
import { applyCarveMutate } from "../steps/editorMutate.ts";
import { occupiedHostKeys } from "../lib/occupiedHostKeys.ts";
import { extractMechanismHostKey } from "../lib/extractMechanismHostKey.ts";
import type { DecisionEntryInput } from "./decisionLogStore.ts";

/** Step ids that record an editor action, and the editor each one is. */
export const EDITOR_ACTION_STEPS: Readonly<Record<string, EditorActionType>> = {
  carve: "gallery_edit",
  mechanisms: "mechanism_edit",
  touch: "touch_edit",
};

/**
 * What an editor step did, before bounding.
 *
 * Raw counts plus the full affected set — `summarizeEditorActivity` applies the
 * sample bound, so the bound lives in one place instead of at each observation
 * site. Each count is `undefined` when this stage does not measure that
 * dimension (data-model.md §1) — every branch of `observeEditorStep` sets all
 * four explicitly, so a dimension is never silently omitted.
 */
export interface EditorStepObservation {
  actionType: EditorActionType;
  keysRemoved: number | undefined;
  keysAdded: number | undefined;
  mechanismsAssigned: number | undefined;
  touchKeysAffected: number | undefined;
  /** Every affected identifier. Bounded on the way into the summary. */
  affected: readonly string[];
}

/** Cumulative carve deletion counts, read from the working copy at completion. */
export interface DeletionCounts {
  nodes: number;
  items: number;
  touchKeys: number;
}

export interface RecordEditorStepDeps {
  append: (input: DecisionEntryInput) => string | null;
  /** Carve deletion sizes from the working-copy store (injected — see StudioShell). */
  getDeletionCounts: () => DeletionCounts;
  /** Identifiers of the carved-away nodes/items, for the bounded sample. */
  getDeletedIds: () => readonly string[];
  /**
   * The store's phase-C physical mechanism assignments — the single source of
   * truth `mechanismsAssigned` counts from (research D-04). Wired in
   * StudioShell to the existing `selectDesktopAssignments(phaseResults)`;
   * this module never re-derives that filter.
   */
  getMechanismAssignments: () => readonly MechanismAssignment[];
  /**
   * The base IR the working copy was instantiated from, or `null` when none is
   * instantiated yet. Together with the two carve-projection deps below, this
   * reconstructs the "before mechanisms ran" occupancy `keysAdded` is measured
   * against (research D-05) — never a snapshot taken at stage entry.
   */
  getBaseIr: () => KeyboardIR | null;
  /** Ids of the carved-away rule/store nodes, for the carve projection. */
  getDeletedNodeIds: () => ReadonlySet<string>;
  /** Ids of the carved-away store-slot items, for the carve projection. */
  getDeletedItemIds: () => ReadonlySet<string>;
}

/**
 * Apply the sample bound (contract §6) and state it when it bites.
 *
 * `sampleTruncated` is what keeps the bound from being silent: a summary showing
 * twelve of three hundred keys without saying so would read as a complete list.
 *
 * Each count is copied only when present (`exactOptionalPropertyTypes`-safe) —
 * an absent count in the observation must stay absent on the summary, never
 * become a stored `undefined` value or a coerced `0`.
 */
export function summarizeEditorActivity(
  observation: EditorStepObservation,
): EditorActionSummary {
  const { affected } = observation;
  return {
    ...(observation.keysRemoved !== undefined ? { keysRemoved: observation.keysRemoved } : {}),
    ...(observation.keysAdded !== undefined ? { keysAdded: observation.keysAdded } : {}),
    ...(observation.mechanismsAssigned !== undefined
      ? { mechanismsAssigned: observation.mechanismsAssigned }
      : {}),
    ...(observation.touchKeysAffected !== undefined
      ? { touchKeysAffected: observation.touchKeysAffected }
      : {}),
    sample: affected.slice(0, EDITOR_ACTION_SAMPLE_LIMIT),
    sampleTruncated: affected.length > EDITOR_ACTION_SAMPLE_LIMIT,
  };
}

/** An assignment-bearing step payload, as far as this module needs to read it. */
interface AssignmentBearingResult {
  assignments?: ReadonlyArray<{ target?: string; scope?: string }>;
}

function assignmentTargets(result: unknown): string[] {
  const assignments = (result as AssignmentBearingResult | null)?.assignments;
  if (!Array.isArray(assignments)) return [];
  return assignments
    .map((a) => a?.target)
    .filter((t): t is string => typeof t === "string" && t !== "");
}

/**
 * Newly-occupied host keys the mechanisms stage produced (research D-05,
 * FR-003): a key that carried no character before the stage and carries one
 * after. `before` is reconstructed from the carve projection rather than
 * snapshotted at stage entry — carve is the only stage between instantiation
 * and mechanisms, and the store holds all three inputs at completion time.
 * `after` is `before` unioned with the host key of each phase-C assignment's
 * mechanisms, read directly via `extractMechanismHostKey` — never by re-running
 * `occupiedHostKeys` on a hypothetical post-mechanisms IR (that function only
 * recognizes mechanisms reconstructable from IR rule shape; a real
 * `MechanismRef` is available here and must be used instead).
 *
 * Returns `undefined` when there is no instantiated working copy to measure
 * against — this stays a genuine absence, not a fabricated `0`.
 */
function countNewlyOccupiedKeys(
  assignments: readonly MechanismAssignment[],
  deps: Pick<RecordEditorStepDeps, "getBaseIr" | "getDeletedNodeIds" | "getDeletedItemIds">,
): number | undefined {
  const baseIr = deps.getBaseIr();
  if (baseIr === null) return undefined;

  const before = occupiedHostKeys(
    applyCarveMutate(baseIr, deps.getDeletedNodeIds(), deps.getDeletedItemIds()),
  );
  const after = new Set(before);
  for (const assignment of assignments) {
    for (const mechanism of assignment.mechanisms) {
      const hostKeyResult = extractMechanismHostKey(mechanism);
      if (hostKeyResult !== undefined && hostKeyResult.hostKey.length > 0) {
        after.add(hostKeyResult.hostKey);
      }
    }
  }

  let added = 0;
  for (const key of after) {
    if (!before.has(key)) added += 1;
  }
  return added;
}

/**
 * Classify a completed step as editor activity, or `null` when it is not one.
 *
 * Returning `null` (rather than a zero-count observation) is what keeps the trail
 * from filling with "this step changed nothing" rows for every question step the
 * author walks through.
 */
export function observeEditorStep(
  stepId: string,
  result: unknown,
  deps: Pick<
    RecordEditorStepDeps,
    | "getDeletionCounts"
    | "getDeletedIds"
    | "getMechanismAssignments"
    | "getBaseIr"
    | "getDeletedNodeIds"
    | "getDeletedItemIds"
  >,
): EditorStepObservation | null {
  const actionType = EDITOR_ACTION_STEPS[stepId];
  if (actionType === undefined) return null;

  switch (actionType) {
    case "gallery_edit": {
      const counts = deps.getDeletionCounts();
      return {
        actionType,
        // Nodes and items are both "a key's worth of the layout removed" from
        // the author's point of view (a rule node, or an individual glyph inside
        // one), so they are one number in the summary rather than two the reader
        // has to add up.
        keysRemoved: counts.nodes + counts.items,
        // Carve only removes; it does not measure keys added or mechanisms
        // assigned, so both stay absent (data-model.md §1) rather than a
        // fabricated 0.
        keysAdded: undefined,
        mechanismsAssigned: undefined,
        touchKeysAffected: counts.touchKeys,
        affected: deps.getDeletedIds(),
      };
    }
    case "mechanism_edit": {
      const assignments = deps.getMechanismAssignments();
      return {
        actionType,
        // Mechanisms are assigned to keys that already exist; this stage does
        // not remove or touch the touch layout, so both stay absent.
        keysRemoved: undefined,
        keysAdded: countNewlyOccupiedKeys(assignments, deps),
        // One assignment is one mechanism assigned, matching the store state
        // the rest of the studio reads (research D-04) — never a count
        // derived from the step result, which the adapter never populates.
        mechanismsAssigned: assignments.length,
        touchKeysAffected: undefined,
        // A keyboard-default assignment's target is "" (applies to the whole
        // inventory); it is a real assignment for the count above but not a
        // meaningful sample identifier.
        affected: assignments.map((a) => a.target).filter((t) => t !== ""),
      };
    }
    case "touch_edit": {
      const targets = assignmentTargets(result);
      return {
        actionType,
        keysRemoved: undefined,
        keysAdded: undefined,
        mechanismsAssigned: undefined,
        touchKeysAffected: targets.length,
        affected: targets,
      };
    }
    default: {
      const _exhaustive: never = actionType;
      return _exhaustive;
    }
  }
}

/**
 * Record one editor step, if the step is one.
 *
 * @returns the new `entryId`, or `null` when the step is not an editor step or
 *   when re-entering it changed nothing (the log's identical-revisit no-op).
 */
export function recordEditorStep(
  stepId: string,
  result: unknown,
  deps: RecordEditorStepDeps,
): string | null {
  const observation = observeEditorStep(stepId, result, deps);
  if (observation === null) return null;
  return deps.append({
    stepId,
    payload: {
      kind: "editor-action",
      actionType: observation.actionType,
      summary: summarizeEditorActivity(observation),
    },
    // An editor action is by definition the author's own doing — there is no
    // proposal to have accepted, so agency is not derived here.
    provenance: { agency: "hand-set" },
  });
}
