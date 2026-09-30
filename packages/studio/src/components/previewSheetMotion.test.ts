// Unit tests for the PreviewSheet gesture physics (components/
// previewSheetMotion.ts): the release decision and the rubber-band curve.
// Pure functions of numbers — no DOM, no timers.

import { describe, expect, it } from "vitest";
import {
  DRAG_DISMISS_PX,
  FLICK_DISMISS_PX_S,
  decideDismissOnRelease,
  rubberband,
} from "./previewSheetMotion.ts";

describe("decideDismissOnRelease", () => {
  it("a flick toward the dismiss edge dismisses even under the distance rule", () => {
    expect(
      decideDismissOnRelease({ offset: 10, velocity: FLICK_DISMISS_PX_S + 1 }),
    ).toBe("dismiss");
  });

  it("a flick away from the dismiss edge snaps back even past the distance rule", () => {
    expect(
      decideDismissOnRelease({
        offset: DRAG_DISMISS_PX + 50,
        velocity: -(FLICK_DISMISS_PX_S + 1),
      }),
    ).toBe("snap-back");
  });

  it("a slow drag past the distance threshold dismisses (distance fallback)", () => {
    expect(
      decideDismissOnRelease({
        offset: DRAG_DISMISS_PX + 1,
        velocity: 100,
      }),
    ).toBe("dismiss");
  });

  it("a slow short drag snaps back (distance fallback)", () => {
    expect(
      decideDismissOnRelease({ offset: DRAG_DISMISS_PX - 1, velocity: 100 }),
    ).toBe("snap-back");
  });

  it("zero velocity and zero offset snaps back", () => {
    expect(decideDismissOnRelease({ offset: 0, velocity: 0 })).toBe("snap-back");
  });

  it("exactly at the thresholds falls through to the distance rule", () => {
    // velocity == flick threshold is not a flick; offset == distance
    // threshold is not past it.
    expect(
      decideDismissOnRelease({
        offset: DRAG_DISMISS_PX,
        velocity: FLICK_DISMISS_PX_S,
      }),
    ).toBe("snap-back");
    expect(
      decideDismissOnRelease({
        offset: DRAG_DISMISS_PX,
        velocity: -FLICK_DISMISS_PX_S,
      }),
    ).toBe("snap-back");
  });

  it("honours caller-supplied thresholds", () => {
    expect(
      decideDismissOnRelease({
        offset: 10,
        velocity: 400,
        flickPxPerSec: 300,
      }),
    ).toBe("dismiss");
    expect(
      decideDismissOnRelease({ offset: 40, velocity: 0, distancePx: 50 }),
    ).toBe("snap-back");
  });
});

describe("rubberband", () => {
  it("passes through zero and preserves sign", () => {
    expect(rubberband(0)).toBe(0);
    expect(rubberband(-100)).toBeLessThan(0);
  });

  it("resists progressively: the output grows slower than the input", () => {
    const small = Math.abs(rubberband(-50));
    const large = Math.abs(rubberband(-500));
    expect(small).toBeLessThan(50);
    expect(large).toBeLessThan(500);
    // Doubling the pull less than doubles the travel.
    expect(Math.abs(rubberband(-200)) / small).toBeLessThan(4);
  });

  it("matches the prototype curve at -100px", () => {
    // (-100 * 260 * 0.55) / (260 + 0.55 * 100) = -14300 / 315
    expect(rubberband(-100)).toBeCloseTo(-45.397, 2);
  });

  it("asymptotes to the dimension, never running away", () => {
    expect(rubberband(-1e7)).toBeCloseTo(-260, 0);
    expect(rubberband(-1e7)).toBeGreaterThan(-260);
  });
});
