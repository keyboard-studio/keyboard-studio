// historyProposal — builds the proposed first HISTORY.md entry from the
// recorded changes to the working copy (spec 079 FR-010, research R6).
//
// Pure: no VFS, no store reads, no Date usage — the caller injects `dateIso`
// (R12 determinism, matching `generateStubs(emitYear)` /
// `stageAdaptHistory(dateIso)`). The seeds are exactly what the decision
// record already captures (base identity, characters added, mechanisms
// chosen, keys removed) — no new journal.
//
// `renderHistoryMd` (packages/engine/src/shared/renderHistoryMd.ts) is the
// separate seam that turns a stored `HistoryProposal`/`HistoryEntryState`
// into the shipped HISTORY.md text for either authoring track; this module
// only builds the proposal the author is shown and may confirm or edit.

import type { HistoryProposal } from "@keyboard-studio/contracts";
import { DOTTED_CIRCLE } from "@keyboard-studio/contracts";
import { isCombiningMarkChar } from "../character-discovery/characterMap.js";
import { HISTORY_INITIAL_RELEASE_BULLET, adaptedFromBullet } from "../shared/renderHistoryMd.js";

/** Seeds sourced from the decision record (R6) — no new journal. */
export interface HistoryProposalSeed {
  /** Adaptation attribution; `null` on a net-new (Track 1) build. */
  base: { id: string; version: string } | null;
  charactersAdded: string[];
  /** Human-readable mechanism names, in application order. */
  mechanismsAssigned: string[];
  keysRemoved: number;
}

/** `## <version> (<dateIso>)` — the one heading shape both authoring tracks use. */
export function historyEntryHeading(version: string, dateIso: string): string {
  return `## ${version} (${dateIso})`;
}

// Inline lists (characters added, mechanisms assigned) are capped so a large
// character-discovery batch doesn't produce an unreadable one-line bullet.
const INLINE_LIST_CAP = 10;

/** Isolate a combining mark on a dotted-circle carrier for inline HISTORY text. */
function formatCharacterForHistory(ch: string): string {
  const first = [...ch][0] ?? "";
  if (isCombiningMarkChar(first)) return `${DOTTED_CIRCLE}${ch}`;
  return ch;
}

function formatList(items: readonly string[]): string {
  const formatted = items.map(formatCharacterForHistory);
  if (formatted.length <= INLINE_LIST_CAP) return formatted.join(", ");
  const shown = formatted.slice(0, INLINE_LIST_CAP);
  const remaining = formatted.length - INLINE_LIST_CAP;
  return `${shown.join(", ")}, and ${remaining} more`;
}

function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}

/**
 * The proposed first HISTORY entry (FR-010): the base it started from (when
 * any), characters added, mechanisms chosen, keys removed — in that bullet
 * order. Criterion 3.5 format (heading + bullet items) is satisfied by the
 * caller pairing this with `historyEntryHeading` (or `renderHistoryMd`, which
 * derives the same heading). An adaptation seed always yields the "Adapted
 * from" bullet (FR-012 / criterion 19.2); an otherwise-empty, non-adaptation
 * seed yields the single "Initial release." bullet, matching the Track 1
 * stub content it would otherwise replace.
 */
export function buildHistoryProposal(
  seed: HistoryProposalSeed,
  version: string,
  dateIso: string,
): HistoryProposal {
  const bullets: string[] = [];

  if (seed.base !== null) {
    bullets.push(adaptedFromBullet(seed.base.id, seed.base.version));
  }
  if (seed.charactersAdded.length > 0) {
    const n = seed.charactersAdded.length;
    bullets.push(
      `Added ${n} ${plural(n, "character", "characters")}: ${formatList(seed.charactersAdded)}.`,
    );
  }
  if (seed.mechanismsAssigned.length > 0) {
    bullets.push(`Assigned mechanisms: ${formatList(seed.mechanismsAssigned)}.`);
  }
  if (seed.keysRemoved > 0) {
    const n = seed.keysRemoved;
    bullets.push(`Removed ${n} ${plural(n, "key", "keys")}.`);
  }
  if (bullets.length === 0) {
    bullets.push(HISTORY_INITIAL_RELEASE_BULLET);
  }

  return { version, dateIso, bullets };
}
