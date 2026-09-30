// previewSheetMotion — the pure physics of the PreviewSheet gesture layer.
//
// The component owns the DOM and the spring driver; this module owns the
// decisions, which are pure functions of numbers so they stay unit-testable
// without a browser: the release decision (velocity + distance → dismiss or
// snap back) and the rubber-band curve for dragging past the open position.

/**
 * Slow-drag fallback: past this many px toward the dismiss edge, a slow
 * release dismisses; under it, the sheet snaps back.
 */
export const DRAG_DISMISS_PX = 96;

/**
 * A release faster than this toward the dismiss edge counts as a flick and
 * dismisses at any distance. Tuned against the playable motion prototype.
 */
export const FLICK_DISMISS_PX_S = 500;

export interface DismissDecisionInput {
  /** Offset at release in px, measured toward the dismiss edge (0 = fully open). */
  readonly offset: number;
  /** Release velocity in px/s, signed: positive = toward the dismiss edge. */
  readonly velocity: number;
  /** Slow-drag distance threshold; defaults to DRAG_DISMISS_PX. */
  readonly distancePx?: number;
  /** Flick speed threshold; defaults to FLICK_DISMISS_PX_S. */
  readonly flickPxPerSec?: number;
}

export type DismissDecision = "dismiss" | "snap-back";

/**
 * Decide the sheet's fate on pointer release. Velocity decides first: a
 * flick toward the dismiss edge dismisses even under the distance rule,
 * and a flick away from it snaps back even past the distance rule. Slow
 * gestures fall back to the distance rule.
 */
export function decideDismissOnRelease(
  input: DismissDecisionInput,
): DismissDecision {
  const distancePx = input.distancePx ?? DRAG_DISMISS_PX;
  const flickPxPerSec = input.flickPxPerSec ?? FLICK_DISMISS_PX_S;
  if (input.velocity > flickPxPerSec) return "dismiss";
  if (input.velocity < -flickPxPerSec) return "snap-back";
  return input.offset > distancePx ? "dismiss" : "snap-back";
}

/**
 * Progressive resistance for dragging past the open position: the sheet
 * follows the pointer less and less the further it is pulled, instead of
 * stopping dead. `overshoot` is the signed distance past open (negative
 * toward the non-dismiss side); `dimension` scales the curve to the
 * gesture, tuned against the playable prototype.
 */
export function rubberband(
  overshoot: number,
  dimension = 260,
  constant = 0.55,
): number {
  return (
    (overshoot * dimension * constant) /
    (dimension + constant * Math.abs(overshoot))
  );
}
