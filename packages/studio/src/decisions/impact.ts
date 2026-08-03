// impact — resolve what a single decision did to the source, ON REQUEST
// (specs/053-decision-audit FR-008/FR-010/FR-011).
//
// FR-010 is a structural requirement, not a performance target: nothing here runs
// until an author expands one entry. `DecisionTrailView` mounts having computed no
// impact at all, which is what makes SC-007's "no perceptible delay" true by
// construction rather than by being fast.
//
// Two sources, in order:
//
//   1. A STORED capture. Editor steps have one already (research D-04, captured
//      at the boundary from the output projection), so it is returned verbatim.
//      Verbatim matters: re-deriving it could produce a different answer than the
//      one taken at the time, which is exactly the audit-versus-artifact
//      disagreement SC-005 forbids.
//
//   2. A COUNTERFACTUAL, for a survey answer with no stored capture: re-run the
//      question module's pure `mutate(value, ctx)` against the pre-decision IR and
//      diff the two emitted texts. The mutate seam is the declared write path, so
//      re-running it is "the same process" in FR-009's sense.
//
// AND A LIMITATION STATED OUT LOUD
//
// `flags/mutateFlag.ts` documents the mutate seam as OFF by default and roughly
// half-complete. So in a shipped build, path 2 mostly does not fire and those
// entries report `"no-rederivable-write-path"` instead. That is the honest answer
// — the studio genuinely cannot isolate the change — and it is why FR-011 exists
// at all. What it must never do is render an empty diff as though the decision had
// done nothing (research D-05); `"none"` and `"unavailable"` are different states
// and the trail says different things about them.

import type { DecisionEntry, DecisionImpact, KeyboardIR } from "@keyboard-studio/contracts";
import { diffLines, diffMagnitude, emitKmn } from "@keyboard-studio/engine";
import { isMutateSeamEnabled } from "../flags/mutateFlag.ts";
import { questionRegistry } from "../survey/questions/registry.ts";
import { applyMutatePatch } from "../steps/mutateApply.ts";
import { manifest } from "../steps/manifest.ts";

export interface ResolveImpactDeps {
  /**
   * The working IR to re-derive a counterfactual against, or `null` when there is
   * no working copy.
   */
  getWorkingIR: () => KeyboardIR | null;
  /** Whether the desktop layout lock has already passed. */
  isDesktopLocked: () => boolean;
  /** Whether a touch layout has been built (the touch lock's observable). */
  isTouchLocked: () => boolean;
}

/**
 * The lock declared on the step an entry belongs to, or `undefined`.
 *
 * Read off the manifest rather than a new flag: `Step.lock` is where the flow
 * already declares its two irreversible points, so the audit's notion of
 * "irreversible" is the same one the survey enforces (research D-11).
 */
function lockOfStep(stepId: string): "physical" | "touch" | undefined {
  return manifest.find((s) => s.id === stepId)?.lock;
}

/**
 * Whether this entry sits behind a lock gate that has already closed.
 *
 * A decision made before a passed lock cannot have its effect isolated by
 * re-deriving it: the lock is the point after which the layout is no longer
 * re-derivable from the answers alone.
 */
function isBehindPassedLock(entry: DecisionEntry, deps: ResolveImpactDeps): boolean {
  const lock = lockOfStep(entry.stepId);
  if (lock === "physical") return deps.isDesktopLocked();
  if (lock === "touch") return deps.isTouchLocked();
  return false;
}

/**
 * Derive one entry's counterfactual by re-running its question module's `mutate`.
 *
 * Returns `null` when it cannot be derived, leaving the caller to report the
 * reason — this function never invents an impact.
 */
function deriveCounterfactual(
  entry: DecisionEntry,
  value: string | string[] | undefined,
  deps: ResolveImpactDeps,
): DecisionImpact | null {
  if (!isMutateSeamEnabled()) return null;
  if (entry.payload.kind !== "survey-answer") return null;

  const mod = questionRegistry[entry.payload.questionId];
  if (mod?.mutate === undefined) return null;
  const writes = mod.writes ?? [];
  if (writes.length === 0) return null;

  const base = deps.getWorkingIR();
  if (base === null) return null;

  try {
    const patch = mod.mutate(value, { ir: base, writes });
    const next = applyMutatePatch(base, patch, writes);
    // Emit BOTH sides through the codec so the comparison is like-for-like. The
    // absolute text is not what is shown — the difference is — so emitting the
    // pre-decision IR here rather than reusing the shipped text is correct: both
    // sides pass through the same emitter and only the patch differs.
    const before = emitKmn(base);
    const after = emitKmn(next);
    const hunks = diffLines(before, after);
    if (hunks.length === 0) return { state: "none" };
    const magnitude = diffMagnitude(hunks);
    return {
      state: "captured",
      // The counterfactual is IR-level, so it names the IR's own `.kmn` rather
      // than claiming a VFS path it did not read. One file today
      // (specs/055-legible-decision-trail T027 widens this to the whole
      // projected VFS); `magnitude` is the aggregate over `files`, currently
      // identical to the single file's own magnitude.
      files: [{ path: `source/${base.header.keyboardId}.kmn`, hunks, magnitude }],
      magnitude,
    };
  } catch {
    // A rejected patch (out-of-`writes` containment) or a throwing `mutate` is a
    // failure to derive, not an impact of `none`.
    return null;
  }
}

/**
 * Resolve the impact of ONE entry, on request.
 *
 * Never computes anything for any other entry — FR-027's "no speculative
 * computation" is a property of this signature: there is no batch form.
 *
 * @param requestedValue the value to re-derive against. Defaults to the entry's
 *   own recorded value (the "what did this do?" question); pass a different one
 *   for FR-026's "what would this other answer have done?".
 */
export function resolveImpact(
  entry: DecisionEntry,
  deps: ResolveImpactDeps,
  requestedValue?: string | string[] | undefined,
): DecisionImpact | null {
  // A shed entry: `impact` is null, and the caller renders the shed notice. Not
  // re-derived, because what was captured is gone and re-deriving could disagree
  // with it.
  if (entry.impact === null) return null;

  // Stored capture wins (path 1 above).
  if (entry.impact !== undefined && requestedValue === undefined) return entry.impact;

  const value =
    requestedValue !== undefined
      ? requestedValue
      : entry.payload.kind === "survey-answer"
        ? // `boolean` answers have no `mutate` counterpart in the seam's
          // string|string[] value space; they resolve to unavailable below rather
          // than being coerced into a value the module never expects.
          (typeof entry.payload.value === "boolean" ? undefined : entry.payload.value)
        : undefined;

  const derived = deriveCounterfactual(entry, value, deps);
  if (derived !== null) return derived;

  // Nothing derivable — say which of the two reasons applies. Lock is checked
  // second on purpose: when both are true, "the seam cannot re-derive this" is the
  // more actionable statement, but a passed lock is the more fundamental one, so
  // it takes precedence in the message.
  return isBehindPassedLock(entry, deps)
    ? { state: "unavailable", reason: "lock-gate-dependency" }
    : { state: "unavailable", reason: "no-rederivable-write-path" };
}
