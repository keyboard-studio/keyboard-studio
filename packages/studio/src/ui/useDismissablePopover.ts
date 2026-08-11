// useDismissablePopover — shared dismissal behavior + panel shell style for
// the small popovers anchored below-right of a nav-bar trigger button
// (AccountControl's account menu / sign-in dialog, SurveyResetButton's
// confirm). Consolidates two dismissal mechanisms that had drifted apart — a
// backdrop-div click-catcher vs. a document pointerdown-outside listener —
// onto the pointerdown-outside idiom already used by SearchFiltersPopover
// and SelectMenu elsewhere in the studio (issue #1513).
//
// Escape-to-close and outside-pointerdown-to-close are unconditional. Moving
// focus into the panel on open and back to the trigger on close is opt-in via
// `panelRef`/`triggerRef` — a lightweight confirm/alert popover
// (SurveyResetButton) deliberately leaves focus where the author put it,
// while a true menu/dialog (AccountControl) needs the fuller dialog-focus
// behavior.

import { useEffect } from "react";
import type { CSSProperties, RefObject } from "react";
import { BG_CARD, BORDER } from "./theme.ts";

export interface UseDismissablePopoverOptions {
  /** Element wrapping BOTH the trigger and the panel — a pointerdown outside it closes. */
  containerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  /** Present together to opt into dialog/menu focus behavior: focus the panel's first focusable element on open, return focus to the trigger on close. */
  panelRef?: RefObject<HTMLElement | null>;
  triggerRef?: RefObject<HTMLElement | null>;
}

/** Escape and outside-pointerdown dismissal, shared by the studio's small anchored popovers. */
export function useDismissablePopover(
  open: boolean,
  { containerRef, onClose, panelRef, triggerRef }: UseDismissablePopoverOptions,
): void {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    function onPointerDown(e: PointerEvent): void {
      const container = containerRef.current;
      if (
        container !== null &&
        e.target instanceof Node &&
        !container.contains(e.target)
      ) {
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
    // Refs are stable identities and `onClose` is re-created every render in
    // both call sites (an inline closure, not a memoized callback) — matches
    // the pre-extraction effects this replaced, which also keyed on `open` alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (panelRef === undefined || triggerRef === undefined) return;
    if (open) {
      const firstFocusable = panelRef.current?.querySelector<HTMLElement>(
        "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
      );
      firstFocusable?.focus();
    } else {
      triggerRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

/**
 * Shared shell for a small popover anchored below-right of its trigger — the
 * position/border/shadow/z-index previously hand-copied between
 * AccountControl and SurveyResetButton. Callers layer their own
 * display/padding/gap on top, e.g. `{ ...POPOVER_PANEL_STYLE, padding: "8px 0" }`.
 */
export const POPOVER_PANEL_STYLE: CSSProperties = {
  position: "absolute",
  top: "calc(100% + 6px)",
  right: 0,
  zIndex: 200,
  background: BG_CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  boxShadow: "0 8px 24px color-mix(in srgb, var(--app-bg) 22%, transparent)",
};
