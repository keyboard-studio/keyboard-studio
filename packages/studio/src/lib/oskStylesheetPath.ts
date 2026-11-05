// Which keyboard stylesheets the OSK frame (and the CSS step) treat as the keyboard's own.

/**
 * Whether a keyboard stylesheet belongs in the OSK frame. A package's
 * `welcome/` and `help/` folders carry the documentation pages' own CSS
 * (commonly `kb.css`, with bare `body` / `table` rules) — injected into the
 * frame it restyles the preview's scaffold, e.g. padding the keyboard in
 * from the edges. Keyman never applies those sheets to the keyboard.
 */
export function isOskStylesheetPath(path: string): boolean {
  return !/(^|[\\/])source[\\/](welcome|help)[\\/]/i.test(path);
}
