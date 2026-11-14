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

/**
 * The live-files mode (spec 111 FR-041..FR-050, Constitution Article III): a
 * keyboard opened for update with its descriptor. Every applied change is
 * written into the files now and decisions are never replayed over them. The
 * one predicate for "do the live-files thing"; `isOpenMode` alone is for
 * surfaces that older descriptor-less Open drafts should still get.
 */
export function isLiveOpen(state: {
  instantiationMode: "new-from-base" | "adapt-existing" | null | undefined;
  startVfs: { get(path: string): unknown } | null | undefined;
  startKeyboard: { id: string } | null | undefined;
}): boolean {
  return isOpenedWithDescriptor(state.instantiationMode, state.startVfs, state.startKeyboard?.id ?? "");
}
