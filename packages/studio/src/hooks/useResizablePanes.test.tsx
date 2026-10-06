// useResizablePanes drag-physics tests: 1:1 pointer tracking with pointer
// capture, grab-offset respect, rubber-band resistance past the bounds, and a
// bounce-free critically damped settle back to the bound on release.

import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useResizablePanes } from "./useResizablePanes.ts";

// jsdom does not implement PointerEvent, so testing-library would fall back
// to a plain Event and silently drop clientX/pointerId. This minimal shim
// carries the drag-relevant init properties; each vitest file gets its own
// jsdom, so the shim stays local to this suite.
if (typeof window.PointerEvent === "undefined") {
  class TestPointerEvent extends Event {
    readonly clientX: number;
    readonly pointerId: number;
    constructor(type: string, init: { clientX?: number; pointerId?: number } & EventInit = {}) {
      super(type, init);
      this.clientX = init.clientX ?? 0;
      this.pointerId = init.pointerId ?? 0;
    }
  }
  window.PointerEvent = TestPointerEvent as unknown as typeof PointerEvent;
}

const CONTAINER_W = 1000;
const MIN_PCT = 20;
const MAX_PCT = 80;

function Harness({ onChange }: { onChange?: (pct: number) => void }) {
  const { containerRef, leftPct, onPointerDown } = useResizablePanes({
    minPct: MIN_PCT,
    maxPct: MAX_PCT,
    initPct: 50,
    ...(onChange === undefined ? {} : { onChange }),
  });
  return (
    <div ref={containerRef} data-testid="container">
      <div data-testid="handle" onPointerDown={onPointerDown} />
      <span data-testid="pct">{leftPct}</span>
    </div>
  );
}

function setup(onChange?: (pct: number) => void) {
  const onChangeSpy = vi.fn();
  render(<Harness onChange={onChange ?? onChangeSpy} />);
  const container = screen.getByTestId("container");
  container.getBoundingClientRect = () =>
    ({ width: CONTAINER_W }) as DOMRect;
  const handle = screen.getByTestId("handle");
  // jsdom does not implement pointer capture; stub it per element.
  handle.setPointerCapture = vi.fn();
  const pct = () => parseFloat(screen.getByTestId("pct").textContent ?? "NaN");
  // Wait for any in-flight bound settle to land exactly on the bound.
  const awaitSettled = async (bound: number) => {
    for (let i = 0; i < 100; i++) {
      if (pct() === bound) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`settle to ${bound} did not complete`);
  };
  return { container, handle, pct, onChangeSpy, awaitSettled };
}

afterEach(() => {
  cleanup();
});

describe("useResizablePanes drag physics", () => {
  it("captures the pointer on grab and tracks 1:1 on every move", () => {
    const { handle, pct } = setup();
    fireEvent.pointerDown(handle, { clientX: 500, pointerId: 7 });
    expect(handle.setPointerCapture).toHaveBeenCalledWith(7);

    // Continuous updates during the drag, not only on release.
    fireEvent.pointerMove(document, { clientX: 550 });
    expect(pct()).toBeCloseTo(55, 5);
    fireEvent.pointerMove(document, { clientX: 600 });
    expect(pct()).toBeCloseTo(60, 5);
    fireEvent.pointerMove(document, { clientX: 575 });
    expect(pct()).toBeCloseTo(57.5, 5);

    fireEvent.pointerUp(document);
    expect(pct()).toBeCloseTo(57.5, 5);
  });

  it("respects the grab offset instead of snapping the edge to the pointer", () => {
    const { handle, pct } = setup();
    // Edge starts at 500px (50% of 1000px); grab 20px to its right.
    fireEvent.pointerDown(handle, { clientX: 520, pointerId: 3 });
    // Pointer moves +100px; the edge must move +100px (to 600px = 60%),
    // keeping the 20px offset. A snap-to-pointer implementation would
    // report 62%.
    fireEvent.pointerMove(document, { clientX: 620 });
    expect(pct()).toBeCloseTo(60, 5);
    fireEvent.pointerUp(document);
  });

  it("rubber-bands past the min bound with progressive resistance", async () => {
    const { handle, pct, onChangeSpy, awaitSettled } = setup();
    fireEvent.pointerDown(handle, { clientX: 500, pointerId: 1 });
    // Raw target would be 10%; overshoot is 10 points = 100px.
    // resisted = (100 * 1000 * 0.55) / (1000 + 0.55 * 100) ~= 52.13px
    // so the display settles around 20 - 5.21 = 14.79%.
    fireEvent.pointerMove(document, { clientX: 100 });
    const displayed = pct();
    expect(displayed).toBeGreaterThan(10);
    expect(displayed).toBeLessThan(MIN_PCT);
    expect(displayed).toBeCloseTo(14.79, 1);
    const firstPush = MIN_PCT - displayed;

    // Deeper overshoot meets stronger resistance: doubling the overshoot must
    // move the handle by less than double (the marginal push shrinks).
    fireEvent.pointerMove(document, { clientX: 0 });
    const doubledPush = MIN_PCT - pct();
    expect(doubledPush).toBeGreaterThan(firstPush);
    expect(doubledPush).toBeLessThan(firstPush * 2);

    // The persisted notification stays clamped to the bound.
    expect(onChangeSpy).toHaveBeenLastCalledWith(MIN_PCT);
    fireEvent.pointerUp(document);
    await awaitSettled(MIN_PCT);
  });

  it("rubber-bands past the max bound with progressive resistance", async () => {
    const { handle, pct, awaitSettled } = setup();
    fireEvent.pointerDown(handle, { clientX: 500, pointerId: 1 });
    // Raw target would be 110%; overshoot is 30 points = 300px.
    // resisted = (300 * 1000 * 0.55) / (1000 + 0.55 * 300) ~= 141.51px
    fireEvent.pointerMove(document, { clientX: 1100 });
    const displayed = pct();
    expect(displayed).toBeGreaterThan(MAX_PCT);
    expect(displayed).toBeLessThan(110);
    expect(displayed).toBeCloseTo(94.15, 1);
    fireEvent.pointerUp(document);
    await awaitSettled(MAX_PCT);
  });

  it("settles back to the bound on release with no bounce past it", async () => {
    const { handle, pct } = setup();
    fireEvent.pointerDown(handle, { clientX: 500, pointerId: 1 });
    fireEvent.pointerMove(document, { clientX: 100 });
    expect(pct()).toBeLessThan(MIN_PCT);
    fireEvent.pointerUp(document);

    // Sample the settle: it must approach the bound monotonically from the
    // rubber-banded side and land exactly on it — never dipping back down
    // and never crossing past the bound (no bounce/overshoot).
    const samples: number[] = [];
    for (let i = 0; i < 20; i++) {
      await new Promise((resolve) => setTimeout(resolve, 40));
      samples.push(pct());
    }
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1] - 0.05);
    }
    for (const sample of samples) {
      expect(sample).toBeLessThanOrEqual(MIN_PCT + 0.02);
    }
    expect(samples[samples.length - 1]).toBe(MIN_PCT);
  });

  it("a within-bounds release needs no settle animation", async () => {
    const { handle, pct, onChangeSpy } = setup();
    fireEvent.pointerDown(handle, { clientX: 500, pointerId: 1 });
    fireEvent.pointerMove(document, { clientX: 600 });
    fireEvent.pointerUp(document);
    const callsBefore = onChangeSpy.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(pct()).toBeCloseTo(60, 5);
    expect(onChangeSpy.mock.calls.length).toBe(callsBefore);
  });

  it("a new drag cancels an in-flight settle and takes over from the visual position", async () => {
    const { handle, pct } = setup();
    fireEvent.pointerDown(handle, { clientX: 500, pointerId: 1 });
    fireEvent.pointerMove(document, { clientX: 100 });
    const overshootPos = pct();
    expect(overshootPos).toBeLessThan(MIN_PCT);
    fireEvent.pointerUp(document);

    // Re-grab mid-settle: the edge must continue from the current visual
    // position with the new grab offset, not jump to the bound.
    await new Promise((resolve) => setTimeout(resolve, 60));
    const midSettle = pct();
    expect(midSettle).toBeLessThan(MIN_PCT);
    fireEvent.pointerDown(handle, { clientX: 300, pointerId: 2 });
    // Grab offset = 300 - midSettle% * 10px; moving +50px must move the edge +50px.
    fireEvent.pointerMove(document, { clientX: 350 });
    const resumed = pct();
    expect(resumed).toBeCloseTo(midSettle + 5, 1);
    fireEvent.pointerUp(document);
    // Back within bounds, so release needs no settle: the value holds steady.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(pct()).toBeCloseTo(resumed, 5);
  });
});
