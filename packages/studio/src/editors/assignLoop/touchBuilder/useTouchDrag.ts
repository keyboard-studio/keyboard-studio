// useTouchDrag — shared pointer-based drag for touch/pen (HTML5 DnD never
// fires on touch). Mouse keeps native HTML5 DnD; this hook ignores
// non-touch/pen pointers entirely.
//
// Behavior: a touch/pen pointer that moves beyond the slop becomes a drag
// immediately — no longpress. With `directional`, a horizontal-dominant move
// stands down so a scroll container keeps the gesture (the chip needs
// `touch-action: pan-x`; the browser aborts us via pointercancel).
// Otherwise any move beyond slop drags (chip needs `touch-action: none`).
//
// The caller renders the ghost from `ghost` and hit-tests in `onDragMove` /
// `onDrop`. A drag ends with pointerup, which a click follows —
// `consumeClick()` swallows that click so the drop doesn't also toggle.
import { useRef, useState } from "react";
import { touchGestureIntent } from "./placementOps.ts";

export interface TouchDragGhost<T> {
  readonly payload: T;
  readonly x: number;
  readonly y: number;
}

interface Gesture<T> {
  payload: T;
  pointerId: number;
  startX: number;
  startY: number;
  dragging: boolean;
}

export function useTouchDrag<T>(opts: {
  directional: boolean;
  onDragMove: (payload: T, x: number, y: number) => void;
  onDrop: (payload: T, x: number, y: number) => void;
  onDragEnd: () => void;
}): {
  bindSource: (payload: T) => {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
  };
  ghost: TouchDragGhost<T> | null;
  consumeClick: () => boolean;
} {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const gestureRef = useRef<Gesture<T> | null>(null);
  const [ghost, setGhost] = useState<TouchDragGhost<T> | null>(null);
  const suppressClickRef = useRef(false);

  const endGesture = (): void => {
    gestureRef.current = null;
    setGhost(null);
    optsRef.current.onDragEnd();
  };

  const bindSource = (payload: T) => ({
    onPointerDown: (e: React.PointerEvent): void => {
      if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
      if (gestureRef.current !== null) return; // one gesture at a time
      gestureRef.current = {
        payload,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        dragging: false,
      };
    },
    onPointerMove: (e: React.PointerEvent): void => {
      const g = gestureRef.current;
      if (g === null || e.pointerId !== g.pointerId) return;
      if (g.dragging) {
        setGhost({ payload: g.payload, x: e.clientX, y: e.clientY });
        optsRef.current.onDragMove(g.payload, e.clientX, e.clientY);
        return;
      }
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      const intent = optsRef.current.directional
        ? touchGestureIntent(dx, dy)
        : Math.hypot(dx, dy) < 10
          ? "undecided"
          : "drag";
      if (intent === "undecided") return;
      if (intent === "scroll") {
        gestureRef.current = null; // the scroll container keeps the gesture
        return;
      }
      g.dragging = true;
      try {
        navigator.vibrate?.(15);
      } catch {
        /* haptics unsupported — the ghost is feedback enough */
      }
      setGhost({ payload: g.payload, x: e.clientX, y: e.clientY });
      optsRef.current.onDragMove(g.payload, e.clientX, e.clientY);
    },
    onPointerUp: (e: React.PointerEvent): void => {
      const g = gestureRef.current;
      if (g === null || e.pointerId !== g.pointerId) return;
      if (g.dragging) {
        suppressClickRef.current = true;
        optsRef.current.onDrop(g.payload, e.clientX, e.clientY);
      }
      endGesture();
    },
    onPointerCancel: (e: React.PointerEvent): void => {
      if (gestureRef.current?.pointerId === e.pointerId) endGesture();
    },
  });

  const consumeClick = (): boolean => {
    const suppressed = suppressClickRef.current;
    suppressClickRef.current = false;
    return suppressed;
  };

  return { bindSource, ghost, consumeClick };
}
