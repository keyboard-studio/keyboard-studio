// Motion foundation — spring presets, a dependency-free rAF spring helper,
// and the prefers-reduced-motion sensor.
//
// Physics vocabulary (mirrors the playable prototype the team tuned against):
//   - the default UI spring is critically damped (damping ratio 1.0), so it
//     never overshoots or bounces, with a ~0.3s response;
//   - the momentum variant (damping ratio ~0.8) carries a slight bounce and
//     is ONLY for gesture-with-momentum interactions like flicks — never for
//     ordinary UI motion.
//
// Springs are interruptible by construction: re-targeting keeps the CURRENT
// on-screen position, and a gesture release hands its live velocity straight
// into the spring — no brick wall, no jump.

import { useEffect, useRef, useState } from "react";

/** Spring physics preset: stiffness in 1/s^2, damping in 1/s. */
export interface SpringPreset {
  readonly stiffness: number;
  readonly damping: number;
  readonly dampingRatio: number;
}

function makePreset(stiffness: number, dampingRatio: number): SpringPreset {
  return {
    stiffness,
    damping: 2 * dampingRatio * Math.sqrt(stiffness),
    dampingRatio,
  };
}

/**
 * Default UI spring: critically damped (damping ratio 1.0, no overshoot),
 * ~0.3s response. This is the preset for all ordinary UI motion.
 */
export const MOTION_SPRING_DEFAULT: SpringPreset = makePreset(210, 1.0);

/**
 * Momentum variant: damping ratio ~0.8, a slight bounce as the spring
 * settles. Reserved for gesture-with-momentum interactions (flicks) where
 * the release velocity needs somewhere to go — never for ordinary UI motion.
 */
export const MOTION_SPRING_MOMENTUM: SpringPreset = makePreset(210, 0.8);

/** Mutable spring state: position x and velocity v (both in px and px/s). */
export interface SpringState {
  x: number;
  v: number;
}

const SETTLE_X_EPSILON = 0.5;
const SETTLE_V_EPSILON = 5;

/**
 * One semi-implicit Euler integration step of the spring toward `target`.
 * Pure — no DOM, no rAF — so the physics is unit-testable in isolation and
 * the rAF loop below is just a driver.
 */
export function stepSpring(
  state: SpringState,
  target: number,
  preset: SpringPreset,
  dt: number,
): SpringState {
  const accel =
    -preset.stiffness * (state.x - target) - preset.damping * state.v;
  const v = state.v + accel * dt;
  return { x: state.x + v * dt, v };
}

/** True when the spring is close enough to `target`, at rest enough, to snap. */
export function isSpringSettled(state: SpringState, target: number): boolean {
  return (
    Math.abs(state.x - target) < SETTLE_X_EPSILON &&
    Math.abs(state.v) < SETTLE_V_EPSILON
  );
}

export interface SpringOptions {
  preset?: SpringPreset;
  /** Starting position; the spring is at rest here until the first retarget. */
  initial?: number;
  onUpdate?: (x: number) => void;
  onSettle?: (target: number) => void;
  /** Safety cap on frames per flight; the spring snaps to target past it. */
  maxFrames?: number;
}

export interface Spring {
  /**
   * Move the target. The spring keeps its CURRENT position and velocity — a
   * mid-flight re-target (or a drag grab) is seamless. Pass the release
   * velocity as `initialVelocity` for a gesture handoff with no brick wall.
   */
  retarget(target: number, initialVelocity?: number): void;
  /** Place the spring instantly at `position` (e.g. entering from off-screen). */
  snapTo(position: number, velocity?: number): void;
  /** Stop the loop, keeping the current position. */
  cancel(): void;
  /** Stop the loop and release the frame callback. */
  dispose(): void;
  readonly position: number;
  readonly target: number;
  readonly running: boolean;
}

const FRAME_DT = 1 / 60;

/**
 * Dependency-free spring driver: a rAF loop integrating `stepSpring` until
 * `isSpringSettled`. No npm packages, no framework coupling — the only
 * browser surface is requestAnimationFrame.
 */
export function createSpring(options: SpringOptions = {}): Spring {
  const {
    preset = MOTION_SPRING_DEFAULT,
    initial = 0,
    onUpdate,
    onSettle,
    maxFrames = 240,
  } = options;

  let x = initial;
  let velocity = 0;
  let target = initial;
  let rafId = 0;
  let frames = 0;
  let running = false;

  function stop(): void {
    if (rafId !== 0) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    running = false;
  }

  function step(): void {
    rafId = 0;
    const next = stepSpring({ x, v: velocity }, target, preset, FRAME_DT);
    x = next.x;
    velocity = next.v;
    frames += 1;
    onUpdate?.(x);
    if (isSpringSettled({ x, v: velocity }, target) || frames >= maxFrames) {
      x = target;
      velocity = 0;
      stop();
      onUpdate?.(x);
      onSettle?.(target);
      return;
    }
    rafId = requestAnimationFrame(step);
  }

  function kick(): void {
    if (rafId === 0) {
      frames = 0;
      running = true;
      rafId = requestAnimationFrame(step);
    }
  }

  return {
    get position(): number {
      return x;
    },
    get target(): number {
      return target;
    },
    get running(): boolean {
      return running;
    },
    retarget(nextTarget: number, initialVelocity?: number): void {
      target = nextTarget;
      // Velocity handoff: the spring keeps flying from its CURRENT position.
      // A gesture release passes its live velocity here — no brick wall.
      if (initialVelocity !== undefined) {
        velocity = initialVelocity;
      }
      kick();
    },
    snapTo(position: number, nextVelocity: number = 0): void {
      stop();
      x = position;
      velocity = nextVelocity;
      target = position;
      onUpdate?.(x);
    },
    cancel(): void {
      stop();
    },
    dispose(): void {
      stop();
    },
  };
}

export interface UseSpringResult {
  /** Current spring value — re-renders the component each frame while running. */
  readonly value: number;
  /**
   * Animate toward `target`, interruptibly: keeps the current on-screen
   * value, and optionally carries a gesture release velocity.
   */
  setTarget(target: number, initialVelocity?: number): void;
  /** Jump to `position` with no animation. */
  snapTo(position: number): void;
}

/**
 * React binding for `createSpring`. The preset is fixed at mount — swapping
 * presets mid-flight would change the physics under a running animation, so
 * components that need both presets mount one spring per preset.
 */
export function useSpring(
  initialValue: number,
  preset: SpringPreset = MOTION_SPRING_DEFAULT,
): UseSpringResult {
  const [value, setValue] = useState(initialValue);
  const springRef = useRef<Spring | null>(null);
  if (springRef.current === null) {
    springRef.current = createSpring({
      preset,
      initial: initialValue,
      onUpdate: (next) => setValue(next),
    });
  }
  const spring = springRef.current;

  useEffect(() => {
    return () => {
      spring.dispose();
    };
  }, [spring]);

  return {
    value,
    setTarget: (target: number, initialVelocity?: number) => {
      spring.retarget(target, initialVelocity);
    },
    snapTo: (position: number) => {
      spring.snapTo(position);
    },
  };
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function readPrefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * True when the user asked for reduced motion. Components branch on this to
 * replace springs with a short cross-fade (see the `--app-motion-*` tokens).
 * Falls back to false where matchMedia is unavailable.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(readPrefersReducedMotion);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    const onChange = (event: MediaQueryListEvent): void => {
      setReduced(event.matches);
    };
    query.addEventListener("change", onChange);
    return () => {
      query.removeEventListener("change", onChange);
    };
  }, []);

  return reduced;
}
