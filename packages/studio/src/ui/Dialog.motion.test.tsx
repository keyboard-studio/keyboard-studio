// Dialog motion tests: spring enter/exit (symmetric, no overshoot),
// trigger anchoring via transform-origin, and the reduced-motion
// cross-fade fallback.
//
// requestAnimationFrame is stubbed with a manual queue so the spring
// flights advance deterministically — no real timers, no jsdom rAF
// behavior to depend on (the convention from ui/motion.test.ts).

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { useRef } from "react";
import { Dialog } from "./Dialog.tsx";

let rafQueue: FrameRequestCallback[] = [];

function runFrames(count: number): void {
  for (let i = 0; i < count; i += 1) {
    const callback = rafQueue.shift();
    if (callback === undefined) {
      break;
    }
    callback(performance.now());
  }
}

function domRect(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function stubReducedMotion(matches: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}

function opacityOf(testId: string): number {
  return parseFloat(screen.getByTestId(testId).style.opacity);
}

beforeEach(() => {
  rafQueue = [];
  let nextRafId = 0;
  const rafIds = new Map<number, FrameRequestCallback>();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    nextRafId += 1;
    rafIds.set(nextRafId, callback);
    rafQueue.push(callback);
    return nextRafId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    const callback = rafIds.get(id);
    rafIds.delete(id);
    if (callback !== undefined) {
      const index = rafQueue.indexOf(callback);
      if (index >= 0) {
        rafQueue.splice(index, 1);
      }
    }
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Dialog — spring enter", () => {
  it("enters on the motion spring: opacity and scale fly 0 to 1 with no overshoot", () => {
    render(
      <Dialog open onCancel={() => {}} label="D" testId="m-enter">
        <span>x</span>
      </Dialog>,
    );
    const dialog = screen.getByTestId("m-enter");
    expect(dialog.style.opacity).toBe("0");
    expect(dialog.style.transform).toContain("scale(0.94)");

    const flight: number[] = [];
    // One frame per act() so each read sees that frame's flushed style —
    // a single act() would batch all 300 updates and only show the end.
    for (let i = 0; i < 300; i += 1) {
      act(() => {
        const callback = rafQueue.shift();
        callback?.(performance.now());
      });
      const el = screen.queryByTestId("m-enter");
      if (el === null) break;
      flight.push(parseFloat(el.style.opacity));
    }

    expect(screen.getByTestId("m-enter").style.opacity).toBe("1");
    expect(screen.getByTestId("m-enter").style.transform).toContain(
      "scale(1)",
    );
    // Critically damped — the flight never passes the open rest value.
    for (const o of flight) {
      expect(o).toBeLessThanOrEqual(1 + 1e-9);
    }
    // The flight actually moved (not a snap): it passed through the middle.
    expect(flight.some((o) => o > 0.2 && o < 0.8)).toBe(true);
  });
});

describe("Dialog — spring exit", () => {
  it("stays mounted through the exit flight and unmounts on settle", () => {
    const { rerender } = render(
      <Dialog open onCancel={() => {}} label="D" testId="m-exit">
        <span>x</span>
      </Dialog>,
    );
    act(() => {
      runFrames(300);
    });
    expect(opacityOf("m-exit")).toBe(1);

    rerender(
      <Dialog open={false} onCancel={() => {}} label="D" testId="m-exit">
        <span>x</span>
      </Dialog>,
    );
    // Still mounted mid-flight, fading out — not popped instantly.
    expect(screen.queryByTestId("m-exit")).not.toBeNull();
    act(() => {
      runFrames(8);
    });
    const midExit = opacityOf("m-exit");
    expect(midExit).toBeGreaterThan(0);
    expect(midExit).toBeLessThan(1);

    act(() => {
      runFrames(300);
    });
    expect(screen.queryByTestId("m-exit")).toBeNull();
  });

  it("the exit mirrors the enter: symmetric flights on the same spring", () => {
    render(
      <Dialog open onCancel={() => {}} label="D" testId="m-sym-enter">
        <span>x</span>
      </Dialog>,
    );
    act(() => {
      runFrames(10);
    });
    const enterOpacity = opacityOf("m-sym-enter");
    cleanup();

    const { rerender } = render(
      <Dialog open onCancel={() => {}} label="D" testId="m-sym-exit">
        <span>x</span>
      </Dialog>,
    );
    act(() => {
      runFrames(300);
    });
    rerender(
      <Dialog open={false} onCancel={() => {}} label="D" testId="m-sym-exit">
        <span>x</span>
      </Dialog>,
    );
    act(() => {
      runFrames(10);
    });
    const exitOpacity = opacityOf("m-sym-exit");

    // Same critically damped spring from rest at symmetric ends:
    // the two flights sum to the full range at every frame.
    expect(enterOpacity + exitOpacity).toBeCloseTo(1, 5);
  });

  it("a re-open mid-exit is seamless: no jump, ends open", () => {
    const { rerender } = render(
      <Dialog open onCancel={() => {}} label="D" testId="m-interrupt">
        <span>x</span>
      </Dialog>,
    );
    act(() => {
      runFrames(300);
    });
    rerender(
      <Dialog open={false} onCancel={() => {}} label="D" testId="m-interrupt">
        <span>x</span>
      </Dialog>,
    );
    act(() => {
      runFrames(8);
    });
    const midExit = opacityOf("m-interrupt");
    expect(midExit).toBeLessThan(1);

    // Re-open mid-flight: the spring re-targets from its current
    // on-screen position — no jump back to 0 or 1.
    rerender(
      <Dialog open onCancel={() => {}} label="D" testId="m-interrupt">
        <span>x</span>
      </Dialog>,
    );
    expect(opacityOf("m-interrupt")).toBe(midExit);
    act(() => {
      runFrames(300);
    });
    expect(opacityOf("m-interrupt")).toBe(1);
    expect(screen.queryByTestId("m-interrupt")).not.toBeNull();
  });
});

describe("Dialog — trigger anchoring", () => {
  it("points transform-origin at the anchor rect center", () => {
    // Frame box 100,200 300x200 → center (250, 300).
    vi.spyOn(
      window.HTMLElement.prototype,
      "getBoundingClientRect",
    ).mockReturnValue(domRect(100, 200, 300, 200));
    // Anchor rect 10,10 40x40 → center (30, 30).
    render(
      <Dialog
        open
        onCancel={() => {}}
        label="D"
        testId="m-anchor-rect"
        anchor={new DOMRect(10, 10, 40, 40)}
      >
        <span>x</span>
      </Dialog>,
    );
    const origin = screen
      .getByTestId("m-anchor-rect")
      .style.transformOrigin.split(" ")
      .map((part) => parseFloat(part));
    // ox = 50 + ((30 - 250) / 300) * 100, oy = 50 + ((30 - 300) / 200) * 100
    expect(origin[0]).toBeCloseTo(-23.333, 1);
    expect(origin[1]).toBeCloseTo(-85, 4);
  });

  it("accepts the trigger as a ref", () => {
    // Button (the trigger) 0,0 40x40 → center (20, 20);
    // frame 100,200 300x200 → center (250, 300).
    vi.spyOn(
      window.HTMLElement.prototype,
      "getBoundingClientRect",
    ).mockImplementation(function (this: HTMLElement) {
      if (this instanceof HTMLButtonElement) return domRect(0, 0, 40, 40);
      return domRect(100, 200, 300, 200);
    });
    function Harness() {
      const triggerRef = useRef<HTMLButtonElement | null>(null);
      return (
        <>
          <button ref={triggerRef} type="button">
            trigger
          </button>
          <Dialog
            open
            onCancel={() => {}}
            label="D"
            testId="m-anchor-ref"
            anchor={triggerRef}
          >
            <span>x</span>
          </Dialog>
        </>
      );
    }
    render(<Harness />);
    const origin = screen
      .getByTestId("m-anchor-ref")
      .style.transformOrigin.split(" ")
      .map((part) => parseFloat(part));
    // ox = 50 + ((20 - 250) / 300) * 100, oy = 50 + ((20 - 300) / 200) * 100
    expect(origin[0]).toBeCloseTo(-26.667, 1);
    expect(origin[1]).toBeCloseTo(-90, 4);
  });

  it("falls back to a centered origin without an anchor", () => {
    render(
      <Dialog open onCancel={() => {}} label="D" testId="m-anchor-none">
        <span>x</span>
      </Dialog>,
    );
    expect(screen.getByTestId("m-anchor-none").style.transformOrigin).toBe(
      "50% 50%",
    );
  });
});

describe("Dialog — reduced motion", () => {
  it("cross-fades with no scale under prefers-reduced-motion", () => {
    stubReducedMotion(true);
    render(
      <Dialog open onCancel={() => {}} label="D" testId="m-reduced">
        <span>x</span>
      </Dialog>,
    );
    const dialog = screen.getByTestId("m-reduced");
    expect(dialog.style.opacity).toBe("1");
    expect(dialog.style.transition).toContain("opacity");
    expect(dialog.style.transition).toContain("120ms");
    expect(dialog.style.transform).not.toContain("scale");
    // No spring flight was queued for the enter.
    expect(rafQueue).toHaveLength(0);
  });

  it("unmounts after the short fade on close", () => {
    stubReducedMotion(true);
    vi.useFakeTimers();
    try {
      const { rerender } = render(
        <Dialog open onCancel={() => {}} label="D" testId="m-reduced-exit">
          <span>x</span>
        </Dialog>,
      );
      rerender(
        <Dialog
          open={false}
          onCancel={() => {}}
          label="D"
          testId="m-reduced-exit"
        >
          <span>x</span>
        </Dialog>,
      );
      expect(screen.getByTestId("m-reduced-exit").style.opacity).toBe("0");
      expect(screen.queryByTestId("m-reduced-exit")).not.toBeNull();
      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(screen.queryByTestId("m-reduced-exit")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
