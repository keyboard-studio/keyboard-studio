// Zoom control state/handler — refs to the zoom −/+ buttons themselves are
// used ONLY so handleZoom can shift focus to the OTHER (still-enabled) button
// when a click lands exactly on a clamp bound and disables the button that
// was just clicked. Without this, a disabled button drops focus to <body> in
// most browsers, which is bad for keyboard/screen-reader users repeatedly
// zooming to an edge.

import { useRef, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { ZOOM_DEFAULT, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, clampZoom, zoomPercent } from "./zoomControl.ts";

export interface UseZoomControlResult {
  zoom: number;
  zoomOutButtonRef: React.RefObject<HTMLButtonElement>;
  zoomInButtonRef: React.RefObject<HTMLButtonElement>;
  handleZoom: (direction: 1 | -1) => void;
}

/**
 * Zoom factor for the chip grid (glyph size, box fallback, and codepoint
 * label all scale proportionally — see the surveyStyles.ts `scale` params).
 * Deliberately LEFT UNRESET across language/base changes (unlike `query`/
 * `hiddenGroups`) — it's a viewing preference, not language-specific data, so
 * switching languages shouldn't discard it.
 */
export function useZoomControl(announce: (message: string) => void): UseZoomControlResult {
  const { t } = useLingui();
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);
  const zoomOutButtonRef = useRef<HTMLButtonElement>(null);
  const zoomInButtonRef = useRef<HTMLButtonElement>(null);

  // Zoom the chip grid in/out one step, clamped to [ZOOM_MIN, ZOOM_MAX], and
  // announce the new level via the shared aria-live region (same pattern as
  // handleToggleBlocksOnly/handleToggleGroupHidden — never a second live
  // region). Computed directly from the current `zoom` (rather than the
  // `setZoom(prev => ...)` updater form) so the just-clicked-a-bound check
  // below can run synchronously in the same handler, right after `setZoom` —
  // the button that was clicked is disabled at the clamp (see the render
  // below), so this handler only ever fires here from an enabled button, and
  // React doesn't batch multiple clicks into one handler call.
  //
  // Clamp-boundary focus fix: when `next` lands exactly on ZOOM_MIN or
  // ZOOM_MAX, the button just clicked is about to become `disabled` on the
  // next render. A focused button that becomes disabled drops focus to
  // <body> in most browsers — bad for keyboard/screen-reader users who keep
  // pressing toward an edge. Shift focus to the OTHER zoom button (the one
  // that stays enabled) right here, before that re-render lands.
  function handleZoom(direction: 1 | -1): void {
    const next = clampZoom(zoom + direction * ZOOM_STEP);
    if (next === zoom) return;
    setZoom(next);
    announce(
      t({
        id: "survey.characterMapPane.zoom.announceZoom",
        message: `Zoom ${{ percent: zoomPercent(next) }}%`,
      }),
    );
    if (next === ZOOM_MIN) {
      zoomInButtonRef.current?.focus();
    } else if (next === ZOOM_MAX) {
      zoomOutButtonRef.current?.focus();
    }
  }

  return { zoom, zoomOutButtonRef, zoomInButtonRef, handleZoom };
}
