// see spec.md §5a line 323 (decision D9) — original .kmn preserved as sidecar
// when source is not the US-English fallback.
// see spec.md §12 lines 1126-1128 — sidecar included in zip, excluded from PR commit.

import type { VirtualFS } from "@keyboard-studio/contracts";

export const SIDECAR_SUFFIX = ".kmn.imported";

/** Suffix for the SHA-256 companion file written alongside the sidecar at import time. */
export const SIDECAR_HASH_SUFFIX = ".kmn.imported.sha256";

/**
 * Archive-root prefix marking studio metadata: zip-included, PR-excluded.
 *
 * The zip's root already IS the keyboard's directory content, so there is no
 * existing "beside, not inside" position in the archive. This prefix is that
 * position: everything under it is the studio talking to the author, never part
 * of the keyboard being submitted. Directory-scoped rather than suffix-scoped
 * so a second studio artifact needs no second predicate.
 *
 * @see specs/053-decision-audit/contracts/decision-record.contract.md §3
 * @see specs/053-decision-audit/research.md D-07
 */
export const STUDIO_METADATA_PREFIX = ".studio/" as const;

/**
 * Path discriminator for sidecar files.
 *
 * Sidecars travel in the VFS for zip and local working-tree presence.
 * publishPR filters them out via isSourceFile() using this predicate,
 * keeping them out of the keyboard-studio/keyboards PR commit tree.
 *
 * Three matches, all with the same lifecycle:
 *   - `.kmn.imported` — the original imported source (decision D9).
 *   - `.kmn.imported.sha256` — its hash companion, pinned at import time by
 *     importKeyboard for I5 verification.
 *   - anything under {@link STUDIO_METADATA_PREFIX} — studio metadata such as
 *     the packaged decision record (specs/053-decision-audit FR-019).
 *
 * The prefix test is ADDED, not substituted: the two suffix matches above are
 * unchanged, so extending the predicate cannot alter what an import sidecar
 * does.
 */
export function isSidecarPath(path: string): boolean {
  return (
    path.endsWith(SIDECAR_SUFFIX) ||
    path.endsWith(SIDECAR_HASH_SUFFIX) ||
    path.startsWith(STUDIO_METADATA_PREFIX)
  );
}

/**
 * Store the original imported .kmn text alongside the emitted .kmn for
 * reviewer diff.
 *
 * Decision D9 (spec §14): the IR is canonical; the original .kmn is preserved
 * as a sidecar so reviewers can diff the source against the re-emitted output.
 *
 * Uses the same source/<id>.kmn path layout the scaffolder targets, with the
 * .imported suffix appended as the discriminator (VirtualFSEntry has no
 * metadata field, so the suffix is the only available signal).
 *
 * Idempotent — calling twice with the same arguments produces the same VFS
 * state (set() overwrites an existing entry at the same path).
 */
export function addSidecar(
  vfs: VirtualFS,
  originalKmn: string,
  keyboardId: string,
): VirtualFS {
  const path = `source/${keyboardId}${SIDECAR_SUFFIX}`;
  vfs.set(path, originalKmn, false);
  return vfs;
}
