// useResizablePanes — drag-to-resize two-pane layout hook.
//
// Encapsulates the pointer-event drag logic shared by SurveyView and
// the two-pane screens: a container ref, left-pane percentage state, and the
// three pointer callbacks (down/move/up) plus cleanup.
//
// Drag physics:
// - 1:1 pointer tracking with pointer capture: the pane edge stays glued to
//   the pointer for the whole drag, even when the pointer outruns the handle
//   or leaves the window. Moves update continuously during the drag, never
//   only on release.
// - Grab-offset respect: the drag is delta-based from the grab point, so the
//   edge keeps the exact offset it had when grabbed instead of snapping the
//   handle center to the pointer.
// - Rubber-band resistance past the min/max bounds: dragging past a bound
//   stretches with progressive resistance rather than hitting a hard stop,
//   then settles back onto the bound on release with a critically damped
//   motion (no bounce, no overshoot).
//
// Usage:
//   const { containerRef, leftPct, onPointerDown } = useResizablePanes({ minPct, maxPct, initPct });
//
//   <div ref={containerRef} ...>
//     <section style={{ flexBasis: `calc(${leftPct}% - ${DIVIDER/2}px)` }}>...</section>
//     <ResizeHandle onPointerDown={onPointerDown} />
//     <section style={{ flexBasis: `calc(${100 - leftPct}% - ${DIVIDER/2}px)` }}>...</section>
//   </div>

import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";

export interface ResizablePanesOptions {
  /** Minimum left-pane width as a percentage of the container. */
  minPct: number;
  /** Maximum left-pane width as a percentage of the container. */
  maxPct: number;
  /** Initial left-pane width as a percentage. */
  initPct: number;
  /**
   * Called with each new percentage as the author drags (spec 057 FR-050).
   *
   * The hook keeps owning the drag; this is a notification, not a controlled
   * value, so a caller can persist the split into session view state without
   * the hook learning about that store. Purely presentational by contract —
   * FR-053 forbids a view-state write reaching a compile or a validator run,
   * and a callback the caller supplies is where that stays checkable.
   *
   * The notified value is always clamped to [minPct, maxPct], even while the
   * rubber band stretches the displayed split past a bound mid-drag.
   */
  onChange?: (pct: number) => void;
}

export interface ResizablePanesResult {
  /** Attach to the outermost flex container div. */
  containerRef: React.RefObject<HTMLDivElement>;
  /**
   * Current left-pane percentage. During a drag this may sit just outside
   * [minPct, maxPct] while the rubber band is stretched; it settles back
   * onto the bound on release.
   */
  leftPct: number;
  /** Pass as onPointerDown to the drag-handle div. */
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
}

// Resistance applied per unit of overshoot past a bound. Larger values make
// the band stiffer; 0.55 gives a long, soft stretch that still reads as
// bounded because the curve below asymptotes at one extra band-width.
const RUBBER_BAND_TENSION = 0.55;

// How long the release settle runs before landing exactly on the bound.
const SETTLE_DURATION_MS = 320;

/**
 * Rubber-band a raw drag target toward the bounds. Inside the bounds the
 * target passes through untouched; past a bound the overshoot shrinks
 * progressively:
 *
 *   resisted = (overshoot * dimension * 0.55) / (dimension + 0.55 * |overshoot|)
 *
 * The curve is monotonic with a horizontal asymptote, so the handle follows
 * the pointer with increasing resistance and can never be flung past the
 * container edge, however far the pointer travels.
 */
function rubberBand(
  rawPct: number,
  minPct: number,
  maxPct: number,
  dimensionPx: number,
): number {
  if (dimensionPx <= 0) return Math.min(maxPct, Math.max(minPct, rawPct));
  if (rawPct < minPct) {
    const overshootPx = ((minPct - rawPct) / 100) * dimensionPx;
    const resistedPx =
      (overshootPx * dimensionPx * RUBBER_BAND_TENSION) /
      (dimensionPx + RUBBER_BAND_TENSION * overshootPx);
    return minPct - (resistedPx / dimensionPx) * 100;
  }
  if (rawPct > maxPct) {
    const overshootPx = ((rawPct - maxPct) / 100) * dimensionPx;
    const resistedPx =
      (overshootPx * dimensionPx * RUBBER_BAND_TENSION) /
      (dimensionPx + RUBBER_BAND_TENSION * overshootPx);
    return maxPct + (resistedPx / dimensionPx) * 100;
  }
  return rawPct;
}

export function useResizablePanes({
  minPct,
  maxPct,
  initPct,
  onChange,
}: ResizablePanesOptions): ResizablePanesResult {
  const [leftPct, setLeftPct] = useState(initPct);

  const dragRef = useRef<{ startX: number; startPct: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const settleRef = useRef<number | null>(null);

  // Mirror of the displayed split that pointer callbacks and the settle
  // animation can read without closing over stale render state.
  const pctRef = useRef(initPct);
  const setDisplayPct = useCallback((next: number) => {
    pctRef.current = next;
    setLeftPct(next);
  }, []);

  // Held in a ref so a caller may pass an inline lambda without restarting the
  // pointer-move subscription on every render.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const cancelSettle = useCallback(() => {
    if (settleRef.current !== null) {
      cancelAnimationFrame(settleRef.current);
      settleRef.current = null;
    }
  }, []);

  // Critically damped settle: an exponential approach that can never cross
  // the bound, snapped exactly onto it on the final frame. Fast at first,
  // gentle at the end, no bounce, no overshoot.
  const settleToBound = useCallback(
    (bound: number) => {
      cancelSettle();
      const from = pctRef.current;
      // Read the clock inside the tick rather than trusting the rAF
      // callback timestamp: some environments hand the callback a stamp
      // from a different clock than performance.now().
      const start = performance.now();
      const tick = () => {
        const t = Math.min(1, Math.max(0, (performance.now() - start) / SETTLE_DURATION_MS));
        if (t >= 1) {
          settleRef.current = null;
          setDisplayPct(bound);
          return;
        }
        // 1 - e^-4t covers ~98% of the distance by the end; the final frame
        // snaps the remainder so the value lands exactly on the bound.
        const eased = 1 - Math.exp(-4 * t);
        setDisplayPct(from + (bound - from) * eased);
        settleRef.current = requestAnimationFrame(tick);
      };
      settleRef.current = requestAnimationFrame(tick);
    },
    [cancelSettle, setDisplayPct],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (dragRef.current === null || containerRef.current === null) return;
      const containerW = containerRef.current.getBoundingClientRect().width;
      if (containerW === 0) return;
      // Delta from the grab point, not the absolute pointer position, so the
      // pane edge keeps its grab offset instead of snapping to the pointer.
      const deltaPct = ((e.clientX - dragRef.current.startX) / containerW) * 100;
      const raw = dragRef.current.startPct + deltaPct;
      setDisplayPct(rubberBand(raw, minPct, maxPct, containerW));
      onChangeRef.current?.(Math.min(maxPct, Math.max(minPct, raw)));
    },
    [minPct, maxPct, setDisplayPct],
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
    // A release inside the bounds needs no animation. A stretched rubber
    // band settles back onto the bound it was pulled past.
    const resting = pctRef.current;
    if (resting < minPct) settleToBound(minPct);
    else if (resting > maxPct) settleToBound(maxPct);
  }, [onPointerMove, minPct, maxPct, settleToBound]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      // A fresh grab interrupts any in-flight settle and continues from the
      // current visual position with the new grab offset.
      cancelSettle();
      // Pointer capture keeps the move/up stream flowing to the handle even
      // when the pointer outruns it or leaves the window, so the edge stays
      // glued to the pointer for the whole drag. Guarded for environments
      // without pointer capture; the document-level listeners still work.
      if (typeof e.currentTarget.setPointerCapture === "function") {
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      // Snapshot the displayed split as the drag origin; onPointerMove reads
      // it back from dragRef so it never closes over a stale value.
      dragRef.current = { startX: e.clientX, startPct: pctRef.current };
      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
    },
    [onPointerMove, onPointerUp, cancelSettle],
  );

  // Clean up listeners and any in-flight settle if the component unmounts mid-drag.
  useEffect(() => {
    return () => {
      cancelSettle();
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };
  }, [onPointerMove, onPointerUp, cancelSettle]);

  return { containerRef, leftPct, onPointerDown };
}
