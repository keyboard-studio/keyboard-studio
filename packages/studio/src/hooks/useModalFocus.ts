// useModalFocus — the shared accessibility shape for modal surfaces
// (mobile adaptation, Phase 4): the APG modal dialog behavior — focus moves
// into the surface on open, Tab cycles inside it, Escape dismisses.
// Shared by `ui/Dialog` (centered modal) and `components/PreviewSheet`
// (bottom sheet / side dock), which previously hand-copied the same three
// pieces (focus-on-open effect, Escape effect, Tab-trap handler).
//
// What the hook does NOT own: the surface's open state, its backdrop, or
// focus restoration to the invoker — those stay with the caller.

import {
  useEffect,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";
import { FOCUSABLE_SELECTOR } from "../lib/focusableSelector.ts";

export interface UseModalFocusOptions {
  /** Nothing is wired while `false`. */
  readonly open: boolean;
  /** The modal container — the Tab trap is scoped to its focusable descendants. */
  readonly containerRef: RefObject<HTMLElement | null>;
  /** Escape dismissal. The caller owns open state and restores focus to the invoker. */
  readonly onEscape: () => void;
  /**
   * When `false`, opening does not move focus (Dialog's `initialFocus="none"`).
   * Default `true`.
   */
  readonly moveFocusOnOpen?: boolean;
  /**
   * Element to prefer on open; defaults to the container's first focusable
   * descendant (PreviewSheet prefers its always-present close button).
   */
  readonly preferredFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * Wire the modal accessibility shape. Returns the container's `onKeyDown`
 * Tab-trap handler. All effects are no-ops while `!open`; callers keep
 * their early `if (!open) return null` below the hook call.
 */
export function useModalFocus({
  open,
  containerRef,
  onEscape,
  moveFocusOnOpen = true,
  preferredFocusRef,
}: UseModalFocusOptions): (e: ReactKeyboardEvent<HTMLElement>) => void {
  // Focus into the surface on open — the APG dialog pattern's "opening a
  // dialog moves focus into it" (docs/accessibility.md rule 4). The surface
  // mounts fresh on every open (early `return null` below the call site),
  // so this runs exactly once per open.
  useEffect(() => {
    if (!open || !moveFocusOnOpen) return;
    (
      preferredFocusRef?.current ??
      containerRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
      null
    )?.focus();
    // Runs once per mount, which is once per open (refs are stable and
    // moveFocusOnOpen is static per mount).
  }, [open, moveFocusOnOpen, containerRef, preferredFocusRef]);

  // Escape dismisses from anywhere in the surface (APG dialog pattern).
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onEscape]);

  function onKeyDown(e: ReactKeyboardEvent<HTMLElement>): void {
    if (e.key !== "Tab" || containerRef.current === null) return;
    const focusable = Array.from(
      containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    );
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return onKeyDown;
}
