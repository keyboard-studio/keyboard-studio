// historyEntryState — the HISTORY proposal's state machine (spec 076 US5,
// FR-010..FR-012): build or re-derive the stored `HistoryEntryState` for the
// current version, and apply the author's confirm / edit / dismiss answer.
//
// Lives in lib/, NOT in the pf_history_entry question module: question
// modules are pure descriptors that the standalone content-i18n extractor
// loads outside the pnpm workspace, so they may import contracts and types
// only — never engine runtime code (buildHistoryProposal is engine).
// flowStepOptions.tsx's phaseFOptions calls these with live working-copy
// context and threads the result into `setHistoryEntryState`.

import type { HistoryEntryState, HistoryProposal, HistoryProposalStatus } from "@keyboard-studio/contracts";
import { buildHistoryProposal } from "@keyboard-studio/engine";
import type { HistoryProposalSeed } from "@keyboard-studio/engine";
import { parseEditedBullets, type HistoryEntryAction } from "../survey/questions/f/pf_history_entry.ts";

/**
 * Build or re-derive the stored `HistoryEntryState` for the current version.
 *
 * - `previous === null` (first render): a fresh `"proposed"` state from
 *   `seed`/`version`/`dateIso` — `dateIso` is stamped here, once (R12).
 * - `previous` already at `version`: returned unchanged.
 * - version changed (spec edge case): heading/version and the tool's drafted
 *   bullets are re-derived at the NEW version, while `proposal.dateIso`,
 *   `status`, and `editedBullets` are preserved — a confirmed or edited
 *   decision survives a version bump.
 */
export function deriveHistoryEntryState(params: {
  seed: HistoryProposalSeed;
  version: string;
  dateIso: string;
  previous: HistoryEntryState | null;
}): HistoryEntryState {
  const { seed, version, dateIso, previous } = params;

  if (previous === null) {
    const proposal = buildHistoryProposal(seed, version, dateIso);
    return { status: "proposed", proposal, editedBullets: null };
  }

  if (previous.proposal.version === version) return previous;

  const proposal: HistoryProposal = buildHistoryProposal(seed, version, previous.proposal.dateIso);
  return { status: previous.status, proposal, editedBullets: previous.editedBullets };
}

/**
 * Apply the author's `pf_history_entry` answer (+ the bullets textarea on the
 * "edit" branch) onto the current `HistoryEntryState`.
 *
 * - `"confirm"` -> `confirmed`, drafted bullets ship as-is.
 * - `"dismiss"` -> `dismissed`; the placeholder stays (FR-011).
 * - `"edit"` -> `edited` with the bullets parsed one per non-blank line; a
 *   blank textarea falls back to the proposal's own bullets rather than
 *   shipping an empty entry.
 */
export function applyHistoryEntryAction(
  action: HistoryEntryAction,
  editedBulletsText: string | undefined,
  current: HistoryEntryState,
): HistoryEntryState {
  const status: HistoryProposalStatus =
    action === "confirm" ? "confirmed" : action === "dismiss" ? "dismissed" : "edited";

  if (action !== "edit") {
    return { ...current, status, editedBullets: null };
  }

  const parsed = parseEditedBullets(editedBulletsText ?? "");
  return {
    ...current,
    status,
    editedBullets: parsed.length > 0 ? parsed : current.proposal.bullets,
  };
}
