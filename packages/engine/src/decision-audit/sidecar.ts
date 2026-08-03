// sidecar — the packaged decision record (specs/053-decision-audit FR-019,
// FR-020, FR-021).
//
// The record ships in the downloaded zip and never in the pull-request commit.
// That split is not enforced here: it is a consequence of the path. Anything
// under STUDIO_METADATA_PREFIX is matched by isSidecarPath in ../output/sidecar.ts,
// which isSourceFile already consults when building the commit tree, so the
// exclusion holds for this file and for any studio artifact added later without
// a second predicate to keep in sync.
//
// FR-020 asks for the record "beside, not inside, the keyboard's directory".
// The zip's root already IS the keyboard's directory content (`source/<id>.kmn`,
// `<id>.kps`), so there is no existing beside-position in the archive; this
// realizes the requirement as a clearly-named studio-metadata prefix at the root
// rather than as positional nesting. Making the separation positional — nesting
// the keyboard under `<id>/` — is the structural alternative, and it is a
// Keyman-team-facing call rather than an engine one.
//
// @see specs/053-decision-audit/contracts/decision-record.contract.md §2, §3, §4
// @see specs/053-decision-audit/research.md D-07

import type { DecisionRecord, VirtualFS } from "@keyboard-studio/contracts";
import { STUDIO_METADATA_PREFIX } from "../output/sidecar.js";
import { serializeDecisionRecord } from "./record.js";

export { STUDIO_METADATA_PREFIX };

/** VFS path of the packaged record (contract §2). */
export const DECISION_RECORD_VFS_PATH = `${STUDIO_METADATA_PREFIX}decision-record.json` as const;

/**
 * Write the record into the projected VFS at {@link DECISION_RECORD_VFS_PATH}.
 *
 * Serialized through {@link serializeDecisionRecord}, so the packaged bytes are
 * the same stable, byte-identical-for-equal-input form the save-budget shed pass
 * measures — the file a reviewer downloads and the record the studio persisted
 * cannot be different renderings of the same data.
 *
 * The JSON is the surface syntax of the completed-instance schema (contract §4):
 * a survey-answer entry's `questionId` / `answerType` / `value` are
 * field-compatible with the `answers` array in the flow README, with two
 * documented departures — no `flow_id` (a per-keyboard record spans the whole
 * manifest spine, not one flow template) and additive `editor-action` entries.
 *
 * Idempotent — `set()` overwrites at the same path, so calling twice with the
 * same record leaves one entry with the same content. Mutates and returns the
 * VFS in place, matching `addSidecar`.
 */
export function addDecisionRecordSidecar(vfs: VirtualFS, record: DecisionRecord): VirtualFS {
  vfs.set(DECISION_RECORD_VFS_PATH, serializeDecisionRecord(record), false);
  return vfs;
}
