// see spec.md §5a line 323 (decision D9) — original .kmn preserved as sidecar
// when source is not the US-English fallback.
// see spec.md §12 lines 1126-1128 — sidecar included in zip, excluded from PR commit.

import type { VirtualFS } from "@keyboard-studio/contracts";

export const SIDECAR_SUFFIX = ".kmn.imported";

/** Suffix for the SHA-256 companion file written alongside the sidecar at import time. */
export const SIDECAR_HASH_SUFFIX = ".kmn.imported.sha256";

/**
 * Path discriminator for sidecar files.
 *
 * Sidecars travel in the VFS for zip and local working-tree presence.
 * publishPR filters them out via isSourceFile() using this predicate,
 * keeping them out of the keymanapp/keyboards PR commit tree.
 *
 * Also matches the `.kmn.imported.sha256` companion (written at import time
 * by importKeyboard to pin the hash of the original source for I5 verification).
 * The hash file has the same lifecycle as the sidecar: zip-included,
 * PR-excluded.
 */
export function isSidecarPath(path: string): boolean {
  return path.endsWith(SIDECAR_SUFFIX) || path.endsWith(SIDECAR_HASH_SUFFIX);
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
