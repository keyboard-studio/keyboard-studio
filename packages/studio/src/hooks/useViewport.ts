// useViewport — the studio's single viewport sensor.
//
// Every narrow-viewport branch in the studio reads through this hook (or its
// `useIsNarrow` / `useIsCoarsePointer` conveniences), never a hand-rolled
// `matchMedia` / `resize` listener at a call site. One vocabulary
// (`ui/breakpoints.ts`), one subscription shape, one fallback path.
//
// Two input dimensions, kept separate on purpose:
//   - geometry (width/height/orientation) drives LAYOUT branches —
//     stacking, sheets, chrome choice;
//   - `isCoarsePointer` drives TOUCH-SIZING branches — 44px targets,
//     tap affordances.
// A landscape phone (844×390) is NOT narrow but IS coarse: layout follows
// the width, touch sizing follows the pointer. Conflating the two is the
// classic responsive bug this hook exists to prevent.
//
// Fallback: jsdom and very old browsers have no `matchMedia`. The hook then
// derives everything from `window.innerWidth` / `innerHeight` (still live via
// the resize listener) and reports `isCoarsePointer: false`. Tests that need
// a coarse pointer stub `matchMedia` themselves.
import { useEffect, useState } from "react";
import { BREAKPOINTS } from "../ui/breakpoints.ts";

export type ViewportOrientation = "portrait" | "landscape";

export interface ViewportState {
  readonly width: number;
  readonly height: number;
  readonly orientation: ViewportOrientation;
  /** `width <= BREAKPOINTS.mobileMax` — stacked layouts, thumb-zone nav. */
  readonly isNarrow: boolean;
  /** `width <= BREAKPOINTS.tabletMax` — two-pane collapses needing more room. */
  readonly isTabletOrNarrow: boolean;
  /** `(pointer: coarse)` — touch sizing, independent of layout. */
  readonly isCoarsePointer: boolean;
}

function readViewport(): ViewportState {
  const width = typeof window === "undefined" ? 1280 : window.innerWidth;
  const height = typeof window === "undefined" ? 800 : window.innerHeight;
  const coarseQuery =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(pointer: coarse)")
      : null;
  return {
    width,
    height,
    orientation: width <= height ? "portrait" : "landscape",
    isNarrow: width <= BREAKPOINTS.mobileMax,
    isTabletOrNarrow: width <= BREAKPOINTS.tabletMax,
    isCoarsePointer: coarseQuery?.matches ?? false,
  };
}

export function useViewport(): ViewportState {
  const [state, setState] = useState<ViewportState>(readViewport);

  useEffect(() => {
    const onChange = () => setState(readViewport());
    window.addEventListener("resize", onChange);
    window.addEventListener("orientationchange", onChange);
    const coarseQuery =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(pointer: coarse)")
        : null;
    coarseQuery?.addEventListener("change", onChange);
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("orientationchange", onChange);
      coarseQuery?.removeEventListener("change", onChange);
    };
  }, []);

  return state;
}

/**
 * Layout branch helper: true when the viewport is at or below `breakpoint`
 * (default `BREAKPOINTS.mobileMax`). For touch SIZING, use
 * `useIsCoarsePointer()` instead — a landscape phone is wide but coarse.
 */
export function useIsNarrow(
  breakpoint: number = BREAKPOINTS.mobileMax,
): boolean {
  return useViewport().width <= breakpoint;
}

/** Touch-sizing branch helper: true under `(pointer: coarse)`. */
export function useIsCoarsePointer(): boolean {
  return useViewport().isCoarsePointer;
}
