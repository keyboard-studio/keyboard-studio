// snapshotSource — attribute a step's source change to the decision that caused
// it (specs/053-decision-audit FR-008/FR-009, SC-005).
//
// WHY THE TEXT COMES FROM WHERE IT DOES
//
// FR-009 requires the attributed change to derive from the same process that
// produces the shipped keyboard, and SC-005 requires the audit and the artifact
// never to disagree. There is exactly one process that qualifies:
// `projectWorkingCopyVfs`, which `projectWorkingCopyForOutput` (zip + pull
// request) and `useWorkingCopyTransform` (live OSK preview) both delegate to. So
// the boundary text is READ FROM THAT PROJECTION and nowhere else.
//
// In particular it is NOT emitted from the working IR with the codec emitter.
// That would be cheaper and synchronous, and it would be wrong: projection also
// applies the touch layout, carve keycaps, assignments, and the identity overlay,
// so a codec emit is not the text that ships. Diffing a text nobody receives is
// how an audit comes to disagree with its artifact (research D-04).
//
// This module holds NO projection logic of its own — the read is injected, and
// the injected implementation in StudioShell delegates to the output projection.
// What it owns is the boundary bookkeeping: the previous boundary's text, and the
// net diff against it.
//
// TIMING. Capture happens on step-completion events, never on a timer, so the
// single 300 ms validation cycle (Constitution Article IV) gains nothing. The
// read is async because resolving assignment patterns is; the caller appends the
// entry synchronously and attaches the impact when it resolves.

import { diffLines, diffMagnitude } from "@keyboard-studio/engine";
import type { DecisionImpact } from "@keyboard-studio/contracts";

/** The projected `.kmn` at a boundary: the path it ships at, and its text. */
export interface ProjectedSource {
  path: string;
  text: string;
}

export interface SourceSnapshotterDeps {
  /**
   * Read the `.kmn` the output projection currently produces, or `null` when
   * there is no working copy yet.
   *
   * MUST delegate to the shared projection — see the module header. An
   * implementation that emitted from the IR instead would satisfy the type and
   * violate SC-005.
   */
  readProjectedKmn: () => Promise<ProjectedSource | null>;
}

export interface SourceSnapshotter {
  /**
   * Capture the net source change since the previous boundary and advance the
   * baseline.
   *
   * Returns `null` when there is nothing to attribute — no working copy yet, or
   * this is the first boundary, which establishes the baseline rather than
   * describing a change. `null` is not "no change": a decision that genuinely
   * changed nothing returns `{ state: "none" }`, and the trail says so in words
   * instead of rendering an empty diff (FR-011).
   */
  captureAtBoundary: () => Promise<DecisionImpact | null>;
  /** Drop the baseline (start-over, or a fresh instantiation). */
  reset: () => void;
}

export function createSourceSnapshotter(deps: SourceSnapshotterDeps): SourceSnapshotter {
  // The previous boundary's projected text. `null` means "no baseline yet", which
  // is distinct from "the baseline is the empty string".
  let previous: ProjectedSource | null = null;

  return {
    captureAtBoundary: async () => {
      let current: ProjectedSource | null;
      try {
        current = await deps.readProjectedKmn();
      } catch {
        // A projection failure must never break a step transition. The step
        // completes, the decision is still recorded, and this entry simply has no
        // captured change — which the trail can express.
        return null;
      }
      if (current === null) return null;

      const baseline = previous;
      previous = current;
      if (baseline === null) return null; // First boundary — baseline only.

      const hunks = diffLines(baseline.text, current.text);
      if (hunks.length === 0) return { state: "none" };
      const magnitude = diffMagnitude(hunks);
      // One file today (specs/055-legible-decision-trail T027 widens this to
      // the whole projected VFS); `magnitude` is the aggregate over `files`,
      // currently identical to the single file's own magnitude.
      return {
        state: "captured",
        files: [{ path: current.path, hunks, magnitude }],
        magnitude,
      };
    },

    reset: () => {
      previous = null;
    },
  };
}
