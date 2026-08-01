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

import {
  EDITOR_ACTION_SAMPLE_LIMIT,
  type EditorActionSummary,
  type EditorActionType,
} from "@keyboard-studio/contracts";
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
 * site.
 */
export interface EditorStepObservation {
  actionType: EditorActionType;
  keysRemoved: number;
  keysAdded: number;
  mechanismsAssigned: number;
  touchKeysAffected: number;
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
}

/**
 * Apply the sample bound (contract §6) and state it when it bites.
 *
 * `sampleTruncated` is what keeps the bound from being silent: a summary showing
 * twelve of three hundred keys without saying so would read as a complete list.
 */
export function summarizeEditorActivity(
  observation: EditorStepObservation,
): EditorActionSummary {
  const { affected } = observation;
  return {
    keysRemoved: observation.keysRemoved,
    keysAdded: observation.keysAdded,
    mechanismsAssigned: observation.mechanismsAssigned,
    touchKeysAffected: observation.touchKeysAffected,
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
 * Classify a completed step as editor activity, or `null` when it is not one.
 *
 * Returning `null` (rather than a zero-count observation) is what keeps the trail
 * from filling with "this step changed nothing" rows for every question step the
 * author walks through.
 */
export function observeEditorStep(
  stepId: string,
  result: unknown,
  deps: Pick<RecordEditorStepDeps, "getDeletionCounts" | "getDeletedIds">,
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
        keysAdded: 0,
        mechanismsAssigned: 0,
        touchKeysAffected: counts.touchKeys,
        affected: deps.getDeletedIds(),
      };
    }
    case "mechanism_edit": {
      const targets = assignmentTargets(result);
      return {
        actionType,
        keysRemoved: 0,
        // A mechanism edit assigns mechanisms to keys that already exist; it
        // adds none, so this must stay 0 (unlike mechanismsAssigned below) or
        // the headline reads "N added, N mechanisms assigned" for a step that
        // added no keys.
        keysAdded: 0,
        mechanismsAssigned: targets.length,
        touchKeysAffected: 0,
        affected: targets,
      };
    }
    case "touch_edit": {
      const targets = assignmentTargets(result);
      return {
        actionType,
        keysRemoved: 0,
        keysAdded: 0,
        mechanismsAssigned: 0,
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
