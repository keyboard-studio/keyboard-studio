/** True when the working copy was instantiated by opening an existing keyboard (Open mode). */
export function isOpenMode(mode: "new-from-base" | "adapt-existing" | null | undefined): boolean {
  return mode === "adapt-existing";
}
