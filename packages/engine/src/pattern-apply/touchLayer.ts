/**
 * touchLayer — the single "absent `layer` slot === `default`" rule shared by
 * both touch-assignment appliers (IR-based and raw-JSON) and the studio's
 * touch gallery. Also the single case->layer placement rule
 * ({@link touchLayerForChar}), consumed by the desktop-modification-replay
 * appliers (IR-based and raw-JSON) AND by the studio touch gallery, which
 * imports it from the package root rather than keeping its own copy.
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
 * @see ../../studio/src/editors/assignLoop/TouchGallery.tsx (imports
 *      `touchLayerForChar` from `@keyboard-studio/engine`)
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
 * The case->layer placement rule: a char whose BASE code point is an uppercase
 * letter (`\p{Lu}`) targets the {@link SHIFT_TOUCH_LAYER}; everything else
 * targets {@link DEFAULT_TOUCH_LAYER}.
 *
 * This is the ONLY definition of the rule. Studio's touch gallery used to keep
 * a hand-synced copy on the grounds that a `.tsx` could not import from here —
 * it can, and does (TouchGallery.tsx already imported `resolveTouchLayerId`
 * from the package root two functions away). Both prior fixes to this rule had
 * to be applied twice; re-export from `@keyboard-studio/engine` instead of
 * copying, so a third fix can't land on one copy only.
 *
 * The test is deliberately un-anchored (`^\p{Lu}`, no `$`): plenty of
 * orthographies stack diacritics that have NO precomposed Unicode code point
 * (e.g. capital eng U+014A + combining grave U+0300), so NFC-normalizing an
 * uppercase grapheme does not necessarily collapse it to one `\p{Lu}` code
 * point. Anchoring both ends would route every such char to the lowercase
 * "default" layer. Reading the base code point's case covers the precomposed
 * and the non-composable case alike.
 *
 * This reads the character's case; it does NOT change it. Callers still
 * NFC-normalize `char` first, same as every other placement/removal codepath,
 * so `text`/`id` agree downstream.
 */
export function touchLayerForChar(char: string): string {
  return /^\p{Lu}/u.test(char) ? SHIFT_TOUCH_LAYER : DEFAULT_TOUCH_LAYER;
}
