// renderHistoryMd — turn a stored HISTORY proposal decision into the shipped
// HISTORY.md text for either authoring track (spec 076 FR-010–FR-012,
// research R6/R12).
//
// Pure: no VFS, no Date usage. A confirmed/edited entry's own
// `proposal.dateIso` — injected once, at proposal or confirmation time — wins
// over `opts.dateIso` so the heading date does not re-stamp across
// productions of an unchanged keyboard (R12 determinism); `opts.dateIso` is
// the fallback used only when there is no entry to read a date from.
//
// The dismissed/null stub shapes are reproduced here rather than imported,
// because neither existing producer is a projection-safe pure function:
// `generateStubs` (packages/engine/src/scaffolder/index.ts) mutates a VFS and
// derives its own date from a `Date`-like `emitYear`, and `stageAdaptHistory`
// (packages/engine/src/output/adapt-staging.ts) is VFS-mutating and
// output-only. Both must stay byte-identical to what this module renders —
// keep the three in sync if the ATX heading convention ever changes.
//
// `buildHistoryProposal` (../decision-audit/historyProposal.ts) is the
// separate seam that builds the proposal an author is shown; this module
// only renders a stored decision (or its absence) into file text.

import type { HistoryEntryState } from "@keyboard-studio/contracts";

/** Track 1's unedited-stub bullet — unchanged since the scaffolder's stub. */
export const HISTORY_INITIAL_RELEASE_BULLET = "Initial release.";

/** The "Adapted from" attribution bullet's exact text (criterion 19.2 / FR-012). */
export function adaptedFromBullet(id: string, version: string): string {
  return `Adapted from ${id} v${version} via keyboard-studio.`;
}

function heading(version: string, dateIso: string): string {
  return `## ${version} (${dateIso})`;
}

/** One entry's text: heading line, then one `* ` bullet line per bullet. */
function renderEntry(version: string, dateIso: string, bullets: readonly string[]): string {
  return `${heading(version, dateIso)}\n${bullets.map((b) => `* ${b}\n`).join("")}`;
}

/** Append `baseHistoryText` verbatim below `entryText`, separated by exactly one blank line (criterion 3.4). No-op when there is nothing to preserve. */
function withBaseText(entryText: string, baseHistoryText: string | null): string {
  if (baseHistoryText === null || baseHistoryText === "") return entryText;
  return `${entryText}\n${baseHistoryText}`;
}

export interface RenderHistoryMdOptions {
  /** Heading version; re-derived from here even when an entry is stored (spec edge case: version change). */
  version: string;
  /** Fallback heading date, used only when there is no entry to read `proposal.dateIso` from. */
  dateIso: string;
  /** Set when this production is a Track 2 adaptation; drives the injected attribution bullet. */
  adaptedFrom: { id: string; version: string } | null;
  /** The base's own HISTORY.md text (Track 2), preserved verbatim below the new entry. `null` when there is none. */
  baseHistoryText: string | null;
}

/**
 * The complete HISTORY.md text for either authoring track (the T044
 * projection seam).
 *
 * - `entry` is `null`, `"proposed"` (shown but not yet decided), or
 *   `"dismissed"`: the existing stub, unchanged — Track 1's bare
 *   "Initial release." entry, or Track 2's "Adapted from" entry (today's
 *   `stageAdaptHistory` shape) followed by the base text. Nothing the author
 *   has not confirmed or edited ships (FR-011).
 * - `entry` is `"confirmed"` or `"edited"`: the confirmed/edited bullets
 *   render at the top (edited bullets win over the original proposal
 *   bullets) under a heading using `opts.version` (re-derived on a version
 *   change) paired with the entry's own stored `proposal.dateIso` (R12); the
 *   "Adapted from" bullet is injected first whenever `opts.adaptedFrom` is
 *   set, unless the bullets already contain it verbatim (FR-012 / criterion
 *   19.2, no duplication); the base text is preserved verbatim below
 *   (criterion 3.4).
 */
export function renderHistoryMd(
  entry: HistoryEntryState | null,
  opts: RenderHistoryMdOptions,
): string {
  const { version, dateIso, adaptedFrom, baseHistoryText } = opts;
  const decided = entry !== null && (entry.status === "confirmed" || entry.status === "edited");

  if (!decided) {
    const bullets =
      adaptedFrom !== null
        ? [adaptedFromBullet(adaptedFrom.id, adaptedFrom.version)]
        : [HISTORY_INITIAL_RELEASE_BULLET];
    return withBaseText(renderEntry(version, dateIso, bullets), baseHistoryText);
  }

  const authoredBullets = entry.editedBullets ?? entry.proposal.bullets;
  const attribution = adaptedFrom !== null ? adaptedFromBullet(adaptedFrom.id, adaptedFrom.version) : null;
  const bullets =
    attribution !== null && !authoredBullets.includes(attribution)
      ? [attribution, ...authoredBullets]
      : authoredBullets;

  return withBaseText(renderEntry(version, entry.proposal.dateIso, bullets), baseHistoryText);
}
