// Zoom — scales the rendered chip glyphs (and the chip cells around them) so
// characters are easier to distinguish/read. Threaded into charChip/chipGlyph/
// chipGlyphMissingBox/chipCodepoint via their `scale` parameter (surveyStyles.ts)
// rather than a CSS `transform: scale()` on the grid container, which would
// break the flex-wrap grid's reflow/overflow/scroll behavior. Synchronous UI
// state — no debounce timer (D3 scope guard: the studio's one 300ms cycle
// belongs to the validator/WASM oracle, not a viewing preference like this).

export const ZOOM_MIN = 0.75;
export const ZOOM_MAX = 2.5;
// Exported (alongside ZOOM_MIN/ZOOM_MAX/zoomPercent below) so tests derive
// expected boundary percentages/iteration counts from these constants rather
// than hardcoding them — see CharacterMapPane.test.tsx's zoom-control block.
export const ZOOM_STEP = 0.25;
export const ZOOM_DEFAULT = 1;

/** Clamp a zoom factor into [ZOOM_MIN, ZOOM_MAX] — guards both +/- steps. */
export function clampZoom(value: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
}

/** Round-trip-safe percent label for a zoom factor (1 -> 100, 1.25 -> 125). */
export function zoomPercent(zoom: number): number {
  return Math.round(zoom * 100);
}
