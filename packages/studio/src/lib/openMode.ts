/** True when the working copy was instantiated by opening an existing keyboard (Open mode). */
export function isOpenMode(mode: "new-from-base" | "adapt-existing" | null | undefined): boolean {
  return mode === "adapt-existing";
}

/**
 * Open mode with the keyboard's own package descriptor in the working copy.
 *
 * The Open behaviours that carry files unchanged (no documentation
 * regeneration, descriptor patched in place, "Updated" history entry) apply
 * when the descriptor came in with the keyboard. A keyboard that shipped no
 * `.kps`, or a draft restored from before Open carried it, keeps the earlier
 * Adapt behaviour until the descriptor is brought in (see the draft-restore
 * path in `persistWorkingCopy`).
 */
export function isOpenedWithDescriptor(
  mode: "new-from-base" | "adapt-existing" | null | undefined,
  vfs: { get(path: string): unknown } | null | undefined,
  keyboardId: string,
): boolean {
  return isOpenMode(mode) && vfs?.get(`source/${keyboardId}.kps`) !== undefined;
}
