// Tests for the motion foundation (ui/motion.ts): spring preset physics,
// the dependency-free rAF driver, and the prefers-reduced-motion sensor.
//
// requestAnimationFrame is stubbed with a manual queue so frames advance
// deterministically — no real timers, no jsdom rAF behavior to depend on.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MOTION_SPRING_DEFAULT,
  MOTION_SPRING_MOMENTUM,
  createSpring,
  isSpringSettled,
  stepSpring,
  usePrefersReducedMotion,
  useSpring,
} from "./motion.ts";
import { act, renderHook } from "@testing-library/react";

let rafQueue: FrameRequestCallback[] = [];
let nextRafId = 0;
const rafIds = new Map<number, FrameRequestCallback>();

function runFrames(count: number): void {
  for (let i = 0; i < count; i += 1) {
    const callback = rafQueue.shift();
    if (callback === undefined) {
      break;
    }
    callback(performance.now());
  }
}

beforeEach(() => {
  rafQueue = [];
  nextRafId = 0;
  rafIds.clear();
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
  vi.unstubAllGlobals();
});

describe("spring presets", () => {
  it("default preset is critically damped (damping ratio 1.0)", () => {
    expect(MOTION_SPRING_DEFAULT.dampingRatio).toBeCloseTo(1.0, 10);
    expect(MOTION_SPRING_DEFAULT.damping).toBeCloseTo(
      2 * Math.sqrt(MOTION_SPRING_DEFAULT.stiffness),
      10,
    );
  });

  it("momentum preset is under-damped (damping ratio ~0.8)", () => {
    expect(MOTION_SPRING_MOMENTUM.dampingRatio).toBeCloseTo(0.8, 10);
    expect(MOTION_SPRING_MOMENTUM.damping).toBeCloseTo(
      2 * 0.8 * Math.sqrt(MOTION_SPRING_MOMENTUM.stiffness),
      10,
    );
  });
});

describe("stepSpring / isSpringSettled", () => {
  it("moves toward the target and reports settled when it arrives at rest", () => {
    let state = { x: 0, v: 0 };
    const target = 400;
    for (let i = 0; i < 600 && !isSpringSettled(state, target); i += 1) {
      state = stepSpring(state, target, MOTION_SPRING_DEFAULT, 1 / 60);
    }
    expect(isSpringSettled(state, target)).toBe(true);
    expect(state.x).toBeCloseTo(target, 0);
  });

  it("the default preset never overshoots, even with a fast velocity handoff", () => {
    // A flick-strength handoff straight into the default spring.
    let state = { x: 0, v: 1500 };
    const target = 400;
    let maxX = state.x;
    for (let i = 0; i < 600; i += 1) {
      state = stepSpring(state, target, MOTION_SPRING_DEFAULT, 1 / 60);
      maxX = Math.max(maxX, state.x);
    }
    expect(maxX).toBeLessThanOrEqual(target + 0.5);
  });

  it("the momentum preset overshoots slightly before settling", () => {
    let state = { x: 0, v: 0 };
    const target = 400;
    let maxX = 0;
    for (let i = 0; i < 600 && !isSpringSettled(state, target); i += 1) {
      state = stepSpring(state, target, MOTION_SPRING_MOMENTUM, 1 / 60);
      maxX = Math.max(maxX, state.x);
    }
    expect(maxX).toBeGreaterThan(target);
    expect(state.x).toBeCloseTo(target, 0);
  });
});

describe("createSpring", () => {
  it("settles to the target from an offset and stops the loop", () => {
    const spring = createSpring({ initial: 0 });
    expect(spring.running).toBe(false);
    spring.retarget(400);
    expect(spring.running).toBe(true);
    runFrames(300);
    expect(spring.position).toBe(400);
    expect(spring.running).toBe(false);
    expect(rafQueue).toHaveLength(0);
    spring.dispose();
  });

  it("carries initial velocity through a re-target with no position jump", () => {
    const positions: number[] = [];
    const spring = createSpring({
      initial: 0,
      onUpdate: (x) => positions.push(x),
    });
    spring.retarget(400);
    runFrames(12);
    const midFlight = spring.position;
    expect(midFlight).toBeGreaterThan(0);
    expect(midFlight).toBeLessThan(400);

    // Gesture release: hand the live velocity into the reversed spring.
    spring.retarget(0, -600);
    // No jump at the handoff — the very next reported position continues
    // from the current on-screen value, moving in the handed-off direction.
    expect(spring.position).toBe(midFlight);
    runFrames(1);
    expect(spring.position).toBeLessThan(midFlight);

    runFrames(300);
    expect(spring.position).toBe(0);
    expect(spring.running).toBe(false);
    spring.dispose();
  });

  it("a re-target without a velocity keeps flying from the current velocity", () => {
    const spring = createSpring({ initial: 0 });
    spring.retarget(400);
    runFrames(12);
    const midFlight = spring.position;
    spring.retarget(400); // same target, mid-flight: no restart, no jump
    expect(spring.position).toBe(midFlight);
    expect(spring.running).toBe(true);
    runFrames(300);
    expect(spring.position).toBe(400);
    spring.dispose();
  });

  it("snapTo places the spring instantly and fires onUpdate", () => {
    const seen: number[] = [];
    const spring = createSpring({ onUpdate: (x) => seen.push(x) });
    spring.snapTo(250);
    expect(spring.position).toBe(250);
    expect(spring.target).toBe(250);
    expect(spring.running).toBe(false);
    expect(seen).toEqual([250]);
    spring.dispose();
  });

  it("cancel stops the loop at the current position", () => {
    const spring = createSpring({ initial: 0 });
    spring.retarget(400);
    runFrames(12);
    const atCancel = spring.position;
    spring.cancel();
    expect(spring.running).toBe(false);
    runFrames(60);
    expect(spring.position).toBe(atCancel);
    spring.dispose();
  });

  it("fires onSettle with the target once settled", () => {
    const settled: number[] = [];
    const spring = createSpring({ onSettle: (t) => settled.push(t) });
    spring.retarget(200);
    runFrames(300);
    expect(settled).toEqual([200]);
    spring.dispose();
  });
});

describe("useSpring", () => {
  it("starts at the initial value and animates to the target", () => {
    const { result } = renderHook(() => useSpring(0));
    expect(result.current.value).toBe(0);
    act(() => {
      result.current.setTarget(100);
    });
    act(() => {
      runFrames(300);
    });
    expect(result.current.value).toBe(100);
  });

  it("is interruptible: a second setTarget keeps the current value", () => {
    const { result } = renderHook(() => useSpring(0));
    act(() => {
      result.current.setTarget(400);
    });
    act(() => {
      runFrames(12);
    });
    const midFlight = result.current.value;
    expect(midFlight).toBeGreaterThan(0);
    act(() => {
      result.current.setTarget(0, -600);
    });
    // No jump: the value is continuous across the re-target.
    expect(result.current.value).toBe(midFlight);
    act(() => {
      runFrames(300);
    });
    expect(result.current.value).toBe(0);
  });
});

describe("usePrefersReducedMotion", () => {
  it("returns false when matchMedia is unavailable (jsdom default)", () => {
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });

  it("reads the media query and follows its change events", () => {
    const listeners = new Map<string, (event: { matches: boolean }) => void>();
    let matches = true;
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        get matches() {
          return matches;
        },
        addEventListener: (
          type: string,
          listener: (event: { matches: boolean }) => void,
        ) => {
          listeners.set(type, listener);
        },
        removeEventListener: (type: string) => {
          listeners.delete(type);
        },
      })),
    );
    const { result, unmount } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
    act(() => {
      matches = false;
      listeners.get("change")?.({ matches: false });
    });
    expect(result.current).toBe(false);
    unmount();
    expect(listeners.has("change")).toBe(false);
  });
});
