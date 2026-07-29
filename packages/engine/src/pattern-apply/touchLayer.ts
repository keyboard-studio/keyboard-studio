/**
 * touchLayer — the single "absent `layer` slot === `default`" rule shared by
 * both touch-assignment appliers (IR-based and raw-JSON) and the studio's
 * touch gallery.
 *
 * That invariant used to be encoded three times (applyTouchAssignments.ts,
 * applyTouchAssignmentsToRawJson.ts, TouchGallery.tsx's `normalizeTouchSlots`)
 * — this module is the one place it is stated, so the four call sites can
 * never independently drift on what "no `layer` slot" means.
 *
 * @see applyTouchAssignments.ts
 * @see applyTouchAssignmentsToRawJson.ts
 * @see ../../studio/src/editors/assignLoop/TouchGallery.tsx (`normalizeTouchSlots`)
 * @see ../../studio/src/editors/assignLoop/TouchGallery.tsx (`touchMechanismLabel`)
 */

/** The layer a touch mechanism targets when it does not name one. An ABSENT
 *  `layer` slot value means `"default"`, so every assignment written before
 *  that slot existed behaves byte-identically. */
export const DEFAULT_TOUCH_LAYER = "default";

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
