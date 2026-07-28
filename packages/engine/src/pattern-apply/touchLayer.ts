/**
 * touchLayer — the single "absent `layer` slot === `default`" rule shared by
 * both touch-assignment appliers (IR-based and raw-JSON) and the studio's
 * touch gallery. Also the single case->layer placement rule
 * ({@link touchLayerForChar}), shared by the desktop-modification-replay
 * appliers (IR-based and raw-JSON) so they cannot independently drift from
 * the studio touch gallery's own copy of the rule.
 *
 * That invariant used to be encoded three times (applyTouchAssignments.ts,
 * applyTouchAssignmentsToRawJson.ts, TouchGallery.tsx's `normalizeTouchSlots`)
 * — this module is the one place it is stated, so the four call sites can
 * never independently drift on what "no `layer` slot" means.
 *
 * @see applyTouchAssignments.ts
 * @see applyTouchAssignmentsToRawJson.ts
 * @see applyDesktopModifications.ts
 * @see applyDesktopModificationsToRawJson.ts
 * @see ../../studio/src/editors/assignLoop/TouchGallery.tsx (`normalizeTouchSlots`)
 * @see ../../studio/src/editors/assignLoop/TouchGallery.tsx (`touchMechanismLabel`)
 * @see ../../studio/src/editors/assignLoop/TouchGallery.tsx (`touchLayerForChar`)
 */

/** The layer a touch mechanism targets when it does not name one. An ABSENT
 *  `layer` slot value means `"default"`, so every assignment written before
 *  that slot existed behaves byte-identically. */
export const DEFAULT_TOUCH_LAYER = "default";

/** The layer an uppercase-letter placement targets — see {@link touchLayerForChar}. */
export const SHIFT_TOUCH_LAYER = "shift";

/**
 * Resolve the target touch layer id from a mechanism ref's `slotValues`,
 * falling back to {@link DEFAULT_TOUCH_LAYER} when the `layer` slot is
 * absent (or `slotValues` itself is absent).
 */
export function resolveTouchLayerId(
  slotValues: Record<string, string> | undefined,
): string {
  return slotValues?.["layer"] ?? DEFAULT_TOUCH_LAYER;
}

/**
 * The case->layer placement rule: an uppercase-letter char (`\p{Lu}`) targets
 * the {@link SHIFT_TOUCH_LAYER}; everything else targets
 * {@link DEFAULT_TOUCH_LAYER}. Mirrors studio's `touchLayerForChar` in
 * TouchGallery.tsx exactly — that copy can't import from here (it lives in a
 * `.tsx`), so this is the definition engine code owns and studio's stays in
 * sync with by inspection.
 *
 * This reads the character's case; it does NOT change it. Callers should
 * NFC-normalize `char` first, same as every other placement/removal
 * codepath — an un-normalized combining-mark sequence is not a single
 * `\p{Lu}` code point even when its precomposed form is uppercase.
 */
export function touchLayerForChar(char: string): string {
  return /^\p{Lu}$/u.test(char) ? SHIFT_TOUCH_LAYER : DEFAULT_TOUCH_LAYER;
}
