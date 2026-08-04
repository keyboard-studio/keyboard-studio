// useResizablePanes — drag-to-resize two-pane layout hook.
//
// Encapsulates the pointer-event drag logic shared by SurveyView and
// the two-pane screens: a container ref, left-pane percentage state, and the
// three pointer callbacks (down/move/up) plus cleanup.
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
   */
  onChange?: (pct: number) => void;
}

export interface ResizablePanesResult {
  /** Attach to the outermost flex container div. */
  containerRef: React.RefObject<HTMLDivElement>;
  /** Current left-pane percentage (0–100). */
  leftPct: number;
  /** Pass as onPointerDown to the drag-handle div. */
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
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

  // Held in a ref so a caller may pass an inline lambda without restarting the
  // pointer-move subscription on every render.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (dragRef.current === null || containerRef.current === null) return;
      const containerW = containerRef.current.getBoundingClientRect().width;
      if (containerW === 0) return;
      const deltaPct = ((e.clientX - dragRef.current.startX) / containerW) * 100;
      const next = Math.min(maxPct, Math.max(minPct, dragRef.current.startPct + deltaPct));
      setLeftPct(next);
      onChangeRef.current?.(next);
    },
    [minPct, maxPct],
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
  }, [onPointerMove]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      // Snapshot the current leftPct as the drag origin; onPointerMove reads it
      // back from dragRef so it never closes over a stale value.
      dragRef.current = { startX: e.clientX, startPct: leftPct };
      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
    },
    [leftPct, onPointerMove, onPointerUp],
  );

  // Clean up listeners if the component unmounts mid-drag.
  useEffect(() => {
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };
  }, [onPointerMove, onPointerUp]);

  return { containerRef, leftPct, onPointerDown };
}
