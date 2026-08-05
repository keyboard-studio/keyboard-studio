// counterfactualProjection — attribute a PRE-INSTANTIATION identity decision by
// projecting the working copy twice and diffing (spec 059 FR-009…FR-014).
//
// THE PROBLEM THIS SOLVES
//
// The boundary snapshotter (snapshotSource.ts) attributes a decision by comparing
// consecutive projections of the working copy. That works for every decision made
// AFTER instantiation, and it cannot work for the identity questions, which the
// author answers before a keyboard exists: at that point there is no projection to
// baseline against, so the first boundary that has one establishes the baseline and
// reports nothing.
//
// Moving the identity stage after base selection would fix the mechanism and break
// the product — the identity answers are what rank the base suggestions. So instead
// the effect is re-derived ON REQUEST, from the working copy as it now stands, by
// asking the counterfactual question directly: project once with the recorded
// answer, once with the alternative, and diff the two. What differs IS the effect.
//
// WHY THE PROJECTION AND NOT THE CODEC
//
// FR-010 requires both sides to come from the function that produces the shipped
// keyboard. `projectWorkingCopyForOutput` is that function — the zip path and the
// pull-request path both call it — and it now takes a pure `identityOverride` so
// the two calls differ in exactly one input. Emitting either side from the codec
// would be cheaper, synchronous, and wrong: it would diff a text nobody receives,
// which is how an audit comes to disagree with its artifact (SC-005).
//
// NOTHING IS STORED
//
// Both projections are discarded when the call returns. A stored counterfactual
// would be a second account of the artifact that could disagree with the boundary
// captures — and it is not a second working copy either: `projectWorkingCopyForOutput`
// clones the VFS, and the store is never written (Constitution Article III).

import type {
  DecisionEntry,
  DecisionFileChange,
  DecisionImpact,
  DecisionRecord,
} from "@keyboard-studio/contracts";
import { diffLines, diffMagnitude } from "@keyboard-studio/engine";
import type {
  ProjectForOutputOptions,
  ProjectWorkingCopyForOutputResult,
} from "../lib/serializeWorkingCopy.ts";
import { questionRegistry } from "../survey/questions/registry.ts";
import type { IdentityOverlayField } from "../survey/types.ts";
import { textBaseline, normalizeHistoryDateStamp } from "./projectedText.ts";

export interface CounterfactualDeps {
  /**
   * Project the current working copy for output. MUST be
   * `projectWorkingCopyForOutput` (or a test double standing in for it) — see the
   * module header on FR-010.
   */
  project: (opts?: ProjectForOutputOptions) => Promise<ProjectWorkingCopyForOutputResult | null>;
}

/**
 * The identity-overlay field an entry's question declares it reaches, or
 * `undefined` when it declares none.
 *
 * Read off `QuestionModule.outputs` — the declaration spec 059 added precisely so
 * that "this answer reaches an output artifact" is something code can ask instead
 * of something a maintainer knows (FR-016). A question declaring more than one
 * field is not something this feature produces; the first is taken, and the
 * FR-016 check validates every declaration against the writer's own table.
 */
export function outputFieldForEntry(entry: DecisionEntry): IdentityOverlayField | undefined {
  if (entry.payload.kind !== "survey-answer") return undefined;
  const mod = questionRegistry[entry.payload.questionId];
  const outputs = mod?.outputs;
  if (outputs === undefined || outputs.length === 0) return undefined;
  return outputs[0]?.field;
}

/**
 * The `entryId`s of the OTHER live decisions that feed the same overlay field in
 * the same step (FR-014, 055 FR-019).
 *
 * Three questions contribute to one composed BCP47 tag — `il_language_code`,
 * `il_language_region`, `il_target_script` — so a change to that tag belongs to all
 * three jointly, and none of them may claim it alone. Symmetric with the boundary
 * snapshotter's own `sharedWith`: computed from the entries recorded at the same
 * boundary, and never naming the entry itself.
 *
 * A superseded entry is excluded: the co-decisions of the answer that CURRENTLY
 * stands are the answers that currently stand. A revised language code shares its
 * change with the live script answer, not with the code it replaced.
 */
export function coDecisionEntryIds(
  entry: DecisionEntry,
  record: DecisionRecord,
  field: IdentityOverlayField,
): string[] {
  const liveByQuestion = new Map<string, string>();
  for (const candidate of record.entries) {
    if (candidate.payload.kind !== "survey-answer") continue;
    if (candidate.stepId !== entry.stepId) continue;
    if (outputFieldForEntry(candidate) !== field) continue;
    // Last write for a given question wins — the live answer, matching the
    // supersede semantics the trail already renders (053 FR-015).
    liveByQuestion.set(candidate.payload.questionId, candidate.entryId);
  }
  return [...liveByQuestion.values()].filter((id) => id !== entry.entryId);
}

/**
 * Diff two projections of the current working copy that differ in exactly one
 * identity overlay field.
 *
 * Returns `null` when there is no working copy to project — the CALLER reports the
 * reason, because "no working copy yet" and "changed nothing" are different
 * statements and this function is not the place that words them (FR-012).
 *
 * @param field the overlay field to vary
 * @param recordedValue the value the author actually chose (blank/absent is a real
 *   answer: an optional identity question left empty)
 * @param alternativeValue what to compare against — `undefined` asks "what if this
 *   had been left blank?", which is the default counterfactual for an identity
 *   answer that has no other obvious alternative
 * @param sharedWith co-decision `entryId`s, from {@link coDecisionEntryIds}
 */
export async function resolveIdentityCounterfactual(
  field: IdentityOverlayField,
  recordedValue: string | undefined,
  alternativeValue: string | undefined,
  deps: CounterfactualDeps,
  sharedWith: readonly string[] = [],
): Promise<DecisionImpact | null> {
  // Varying a field to its own value would compare the artifact with itself and
  // report `"none"` — technically true and useless. Saying so up front keeps the
  // two projections from being spent on a question with a known answer.
  if (recordedValue === alternativeValue) return { state: "none" };

  const [alternative, recorded] = await Promise.all([
    deps.project({ identityOverride: { [field]: alternativeValue } }),
    deps.project({ identityOverride: { [field]: recordedValue } }),
  ]);
  if (alternative === null || recorded === null) return null;

  // Both sides through the SAME reduction — binaries skipped, volatile content
  // normalized (FR-013). Applying it to one side only is how a date stamp becomes
  // an identity decision's attributed change.
  const before = textBaseline(alternative.vfs.entries());
  const after = textBaseline(recorded.vfs.entries());

  // The union of both sides' own paths, never a maintained list, so a file the
  // projection starts emitting tomorrow is compared with no edit here (055 FR-016).
  const paths = new Set<string>([...before.keys(), ...after.keys()]);
  const files: DecisionFileChange[] = [];
  let addedTotal = 0;
  let removedTotal = 0;
  for (const path of paths) {
    const beforeText = normalizeHistoryDateStamp(path, before.get(path) ?? "");
    const afterText = normalizeHistoryDateStamp(path, after.get(path) ?? "");
    const hunks = diffLines(beforeText, afterText);
    if (hunks.length === 0) continue;
    const magnitude = diffMagnitude(hunks);
    files.push({ path, hunks, magnitude });
    addedTotal += magnitude.added;
    removedTotal += magnitude.removed;
  }

  // Zero changed files is `{ state: "none" }`, never an empty `"captured"`
  // (055 record-shape contract §3). This is the real case the spec's Edge Cases
  // name: an author whose language matches the base's genuinely changed nothing
  // about the declared language, and the trail says that in words rather than
  // rendering a blank diff as though something had failed.
  if (files.length === 0) return { state: "none" };

  // `Set` iteration followed insertion order from two maps built off
  // `VirtualFS.entries()`, whose order is documented "unspecified" — so sort here
  // rather than let the rendered order depend on VFS internals.
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  return {
    state: "captured",
    files,
    magnitude: { added: addedTotal, removed: removedTotal },
    ...(sharedWith.length > 0 ? { sharedWith: [...sharedWith] } : {}),
  };
}
