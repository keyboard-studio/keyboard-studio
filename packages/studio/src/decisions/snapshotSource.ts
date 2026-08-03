// snapshotSource — attribute a step's source change to the decision that caused
// it (specs/053-decision-audit FR-008/FR-009, SC-005; widened to every projected
// text file by specs/055-legible-decision-trail FR-016/FR-017/FR-018).
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
// WHY EVERY FILE, NOT ONE `.kmn`
//
// FR-016/FR-017 require a decision that only touched, say, the `.kps` to show
// its change — not "no isolable change" because the comparison only ever looked
// at the `.kmn`. The boundary baseline is therefore a `Map<path, text>` over
// EVERY entry the projection holds with `isBinary === false`, and the path set
// comes from enumerating `entries` at read time (never a maintained list, so a
// file the projection starts emitting tomorrow is covered with no code change
// here — FR-016). Binary entries are skipped: never diffed.
//
// This module holds NO projection logic of its own — the read is injected, and
// the injected implementation in StudioShell delegates to the output projection
// (`projectWorkingCopyForOutput`, the same function the zip and PR paths call —
// FR-018 holds by construction). What it owns is the boundary bookkeeping: the
// previous boundary's per-path text, and the net diff against it, file by file.
//
// TIMING. Capture happens on step-completion events, never on a timer, so the
// single 300 ms validation cycle (Constitution Article IV) gains nothing. The
// read is async because resolving assignment patterns is; the caller appends the
// entry synchronously and attaches the impact when it resolves.

import { diffLines, diffMagnitude } from "@keyboard-studio/engine";
import type { DecisionFileChange, DecisionImpact, VirtualFSEntry } from "@keyboard-studio/contracts";

/** The projected VFS's entries at a boundary — both text and binary. */
export interface ProjectedSource {
  entries: readonly VirtualFSEntry[];
}

export interface SourceSnapshotterDeps {
  /**
   * Read every entry the output projection currently holds, or `null` when
   * there is no working copy yet.
   *
   * MUST delegate to the shared projection — see the module header. An
   * implementation that emitted from the IR instead would satisfy the type and
   * violate SC-005.
   */
  readProjectedFiles: () => Promise<ProjectedSource | null>;
}

/**
 * Reduce a projection's entries to the `path -> text` baseline this module
 * diffs against: binary entries are skipped (never diffed), and a "text"
 * entry whose content is not actually a string (defensively — the contract
 * ties `isBinary` and content shape together, but this module does not trust
 * that at a distance) is skipped the same way.
 */
function textBaseline(entries: readonly VirtualFSEntry[]): Map<string, string> {
  const baseline = new Map<string, string>();
  for (const entry of entries) {
    if (entry.isBinary) continue;
    if (typeof entry.content !== "string") continue;
    baseline.set(entry.path, entry.content);
  }
  return baseline;
}

// ---------------------------------------------------------------------------
// Volatile-content normalization (FR-017a, research D-09)
// ---------------------------------------------------------------------------

/**
 * Hold `HISTORY.md`'s staged date stamp stable before diffing.
 *
 * `stageAdaptHistory` (packages/engine/src/output/adapt-staging.ts, invoked
 * from packages/studio/src/lib/serializeWorkingCopy.ts) prepends an ATX
 * heading of the exact shape `## <bumpedVersion> (<dateIso>)` to `HISTORY.md`
 * on every projection, stamping `new Date().toISOString().slice(0, 10)`.
 * Within one session that stamp is constant across boundaries and cancels
 * out — but a boundary pair straddling local midnight would otherwise show a
 * spurious one-line change attributed to whichever decision happened to be
 * recorded then. This neutralises only that date token: only in
 * `HISTORY.md`, and only inside the specific `## ... (YYYY-MM-DD)` heading
 * shape `stageAdaptHistory` produces. A genuine edit anywhere else in the
 * file — including a hand-edited line that isn't this heading shape — is
 * left untouched and still surfaces as a hunk.
 *
 * (The `.kps` `<Version>` bump needs no equivalent treatment: it is derived
 * deterministically from `baseIr.header.version`, not from wall-clock or
 * randomness, so it is already stable across projections within a session
 * and across a midnight boundary alike — research D-09.)
 *
 * Pure: returns a new string, never mutates `text`.
 */
function normalizeHistoryDateStamp(path: string, text: string): string {
  if (path !== "HISTORY.md") return text;
  return text.replace(
    /^(## .+ )\(\d{4}-\d{2}-\d{2}\)$/gm,
    "$1(0000-00-00)",
  );
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
  // The previous boundary's `path -> text` baseline, over every non-binary
  // entry the projection held at that boundary. `null` means "no baseline
  // yet", which is distinct from "the baseline is an empty map" (a projection
  // that genuinely produced zero text files — not expected in practice, but
  // not this module's invariant to assume away).
  let previous: Map<string, string> | null = null;

  return {
    captureAtBoundary: async () => {
      let projected: ProjectedSource | null;
      try {
        projected = await deps.readProjectedFiles();
      } catch {
        // A projection failure must never break a step transition. The step
        // completes, the decision is still recorded, and this entry simply has no
        // captured change — which the trail can express.
        return null;
      }
      if (projected === null) return null;

      const current = textBaseline(projected.entries);
      const baseline = previous;
      previous = current;
      if (baseline === null) return null; // First boundary — baseline only.

      // Enumerated from the union of both boundaries' own paths — never a
      // maintained list (FR-016) — so a file the projection stops or starts
      // emitting between boundaries is still compared, not silently skipped.
      const paths = new Set<string>([...baseline.keys(), ...current.keys()]);
      const files: DecisionFileChange[] = [];
      let addedTotal = 0;
      let removedTotal = 0;
      for (const path of paths) {
        const before = normalizeHistoryDateStamp(path, baseline.get(path) ?? "");
        const after = normalizeHistoryDateStamp(path, current.get(path) ?? "");
        const hunks = diffLines(before, after);
        if (hunks.length === 0) continue;
        const magnitude = diffMagnitude(hunks);
        files.push({ path, hunks, magnitude });
        addedTotal += magnitude.added;
        removedTotal += magnitude.removed;
      }

      // Zero changed files is `{ state: "none" }`, never an empty `"captured"`
      // (record-shape.contract.md §3 — `files` is non-empty by construction).
      if (files.length === 0) return { state: "none" };

      // `Set` iteration order followed insertion order from two maps built off
      // `VirtualFS.entries()`, whose own order is documented "unspecified" — so
      // sort by path here rather than let the rendered order depend on VFS
      // internals.
      files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

      return {
        state: "captured",
        files,
        magnitude: { added: addedTotal, removed: removedTotal },
      };
    },

    reset: () => {
      previous = null;
    },
  };
}
