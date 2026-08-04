// projectedText — reduce a projection's entries to the `path -> text` baseline the
// decision trail diffs, and hold volatile content stable across the comparison.
//
// Extracted from `snapshotSource.ts` (spec 057 T022, research D-10). FR-013 applies
// to BOTH sides of a comparison, and there are now two comparers: the boundary
// snapshotter (which diffs consecutive projections of the same working copy) and
// the counterfactual (which diffs two projections that differ in one identity
// field). A second copy of the exclusion rule is how one of them goes stale and
// starts attributing a date stamp to a decision.
//
// So this module is the ONE home for two rules:
//   1. what counts as diffable text at all (binaries are never diffed), and
//   2. which content changes on every projection independently of any decision.

import type { VirtualFSEntry } from "@keyboard-studio/contracts";

/**
 * Reduce a projection's entries to the `path -> text` baseline the trail diffs:
 * binary entries are skipped (never diffed), and a "text" entry whose content is
 * not actually a string (defensively — the contract ties `isBinary` and content
 * shape together, but this module does not trust that at a distance) is skipped
 * the same way.
 */
export function textBaseline(entries: readonly VirtualFSEntry[]): Map<string, string> {
  const baseline = new Map<string, string>();
  for (const entry of entries) {
    if (entry.isBinary) continue;
    if (typeof entry.content !== "string") continue;
    baseline.set(entry.path, entry.content);
  }
  return baseline;
}

/**
 * Hold `HISTORY.md`'s staged date stamp stable before diffing.
 *
 * `stageAdaptHistory` (packages/engine/src/output/adapt-staging.ts, invoked from
 * packages/studio/src/lib/serializeWorkingCopy.ts) prepends an ATX heading of the
 * exact shape `## <bumpedVersion> (<dateIso>)` to `HISTORY.md` on every
 * projection, stamping `new Date().toISOString().slice(0, 10)`.
 *
 * For the BOUNDARY comparison that stamp is constant across boundaries within one
 * session and cancels out — but a boundary pair straddling local midnight would
 * otherwise show a spurious one-line change attributed to whichever decision
 * happened to be recorded then.
 *
 * For the COUNTERFACTUAL comparison (spec 057) both projections are taken moments
 * apart, so the stamp cancels in the overwhelming majority of cases — but "almost
 * always cancels" is not a property worth relying on when the whole point of the
 * comparison is to name exactly one changed file. Normalizing both sides makes it
 * cancel by construction (FR-013).
 *
 * This neutralises only that date token: only in `HISTORY.md`, and only inside the
 * specific `## ... (YYYY-MM-DD)` heading shape `stageAdaptHistory` produces. A
 * genuine edit anywhere else in the file — including a hand-edited line that isn't
 * this heading shape — is left untouched and still surfaces as a hunk.
 *
 * (The `.kps` `<Version>` bump needs no equivalent treatment: it is derived
 * deterministically from `baseIr.header.version`, not from wall-clock or
 * randomness, so it is already stable across projections within a session and
 * across a midnight boundary alike — 055 research D-09. The same holds for the
 * package descriptor's identity fields, which are a pure function of the identity
 * overlay: that is exactly why varying one of them isolates a change.)
 *
 * Pure: returns a new string, never mutates `text`.
 */
export function normalizeHistoryDateStamp(path: string, text: string): string {
  if (path !== "HISTORY.md") return text;
  return text.replace(/^(## .+ )\(\d{4}-\d{2}-\d{2}\)$/gm, "$1(0000-00-00)");
}
