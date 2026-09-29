// Dialog — the studio's shared modal primitive (mobile adaptation, Phase 0).
//
// Consolidates the identical centered-modal shell previously hand-copied
// between the key-grid dialogs (FamilyApplyDialog, RenameDialog,
// RemoveKeyDialog): backdrop, centering, focus trap, Escape handling,
// focus-on-open. The `min(…px, 92vw)` clamps on both min- and max-width are
// new hardening: the old shells used bare pixel widths, so a dialog could
// overflow viewports narrower than its min-width. Both clamps use the same
// 92vw bound, so min-width can never defeat max-width on a phone.
//
// What this primitive owns: the frame. What it does NOT own: the dialog's
// content, its open/close state machine, or its per-open state resets —
// those stay with the caller, exactly as before.
//
// Desktop-invariance: the migrated dialogs render byte-identical frames
// (same z-indexes, padding, gap, tokens). The 44px close button is OPT-IN
// (`showCloseButton`) — the migrated dialogs keep their Cancel buttons and
// gain no new chrome. AccountControl's sign-in panel is deliberately NOT
// migrated: it is an anchored popover, not a centered modal — a different
// pattern, and centering it would change desktop behavior.
//
// Accessibility: ARIA APG modal dialog pattern (docs/accessibility.md) —
// focus moves into the dialog on open, Tab cycles inside, Escape cancels.
// The caller owns the invoker and restores focus to it (the key-grid
// dialogs' existing convention).
import {
  useEffect,
  useRef,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { BG_CARD, BORDER, FONT, TEXT_DIM } from "./theme.ts";
import { FOCUSABLE_SELECTOR } from "../lib/focusableSelector.ts";

export interface DialogProps {
  /** Nothing renders while `false`. */
  readonly open: boolean;
  /** Escape, the close button, or the backdrop. Does not itself move focus back — the caller owns the invoker. */
  readonly onCancel: () => void;
  /** Accessible name for the dialog (callers pass an already-localized string). */
  readonly label: string;
  /** Dialog content. */
  readonly children: ReactNode;
  /** Rendered as `data-testid` on the dialog element. */
  readonly testId?: string;
  /** Minimum width in px. Default 320. */
  readonly minWidth?: number;
  /** Maximum width in px, clamped to 92vw so the dialog fits a phone. Default 520. */
  readonly maxWidth?: number;
  /** When provided, renders a `<form>` (submit-on-Enter) instead of a `<div>`. */
  readonly onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  /**
   * Opt-in 44px close (×) button, top-right. The migrated key-grid dialogs
   * leave this off — their Cancel buttons are the dismiss control and an
   * added × would change desktop chrome. New mobile surfaces (sheets)
   * turn it on.
   */
  readonly showCloseButton?: boolean;
  /** Already-localized accessible label for the close button. Required when `showCloseButton` is true. */
  readonly closeLabel?: string;
  /** Which element takes focus on open. Default `"first"` (first focusable). */
  readonly initialFocus?: "first" | "none";
  /** Backdrop z-index; the dialog sits one above. Default 299 (the key-grid dialogs' value). */
  readonly zIndex?: number;
}

const BACKDROP_BG = "color-mix(in srgb, var(--sil-black) 50%, transparent)";
const DIALOG_SHADOW =
  "0 8px 24px color-mix(in srgb, var(--sil-black) 50%, transparent)";

export function Dialog({
  open,
  onCancel,
  label,
  children,
  testId,
  minWidth = 320,
  maxWidth = 520,
  onSubmit,
  showCloseButton = false,
  closeLabel,
  initialFocus = "first",
  zIndex = 299,
}: DialogProps) {
  const dialogRef = useRef<HTMLFormElement | HTMLDivElement | null>(null);

  // Focus into the dialog on open — the APG dialog pattern's "opening a
  // dialog moves focus into it" (docs/accessibility.md rule 4). The dialog
  // mounts fresh on every open (early `return null` below), so this effect
  // runs exactly once per open.
  useEffect(() => {
    if (!open || initialFocus === "none") return;
    const el = dialogRef.current;
    if (el === null) return;
    el.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per mount, which is once per open.
  }, [open]);

  // Escape closes from anywhere in the dialog (APG dialog pattern).
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  function handleKeyDownTrap(
    e: ReactKeyboardEvent<HTMLFormElement | HTMLDivElement>,
  ): void {
    if (e.key !== "Tab" || dialogRef.current === null) return;
    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
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

  const frameStyle = {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    zIndex: zIndex + 1,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: 16,
    // The opt-in close button occupies the frame's top-right corner; give
    // content room so the first row never slides underneath it.
    paddingTop: showCloseButton ? 48 : 16,
    // Both bounds clamp to 92vw: on a phone narrower than `minWidth` px the
    // CSS min-width would otherwise win over max-width and overflow.
    minWidth: `min(${minWidth}px, 92vw)`,
    maxWidth: `min(${maxWidth}px, 92vw)`,
    maxHeight: "80vh",
    overflowY: "auto",
    background: BG_CARD,
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    fontFamily: FONT,
    boxShadow: DIALOG_SHADOW,
  } as const;

  const closeButton = showCloseButton ? (
    <button
      type="button"
      aria-label={closeLabel ?? "Close"}
      onClick={onCancel}
      style={{
        position: "absolute",
        top: 2,
        right: 2,
        width: "var(--app-touch-target)",
        height: "var(--app-touch-target)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        border: "none",
        borderRadius: 8,
        color: TEXT_DIM,
        fontSize: 22,
        cursor: "pointer",
      }}
    >
      ×
    </button>
  ) : null;

  // The APG modal DIALOG pattern (https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
  // requires the container itself to trap Tab focus via onKeyDown; jsx-a11y's
  // interactive-role allowlist does not include "dialog" (it is a window/structure
  // role, not a widget role), so the rule fires regardless of the explicit role —
  // the same carve-out the key-grid dialogs already document.
  const frame =
    onSubmit !== undefined ? (
      // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- see above
      <form
        ref={dialogRef as React.Ref<HTMLFormElement>}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-testid={testId}
        onSubmit={onSubmit}
        onKeyDown={handleKeyDownTrap}
        style={frameStyle}
      >
        {closeButton}
        {children}
      </form>
    ) : (
      // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- see above
      <div
        ref={dialogRef as React.Ref<HTMLDivElement>}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-testid={testId}
        onKeyDown={handleKeyDownTrap}
        style={frameStyle}
      >
        {closeButton}
        {children}
      </div>
    );

  return (
    <>
      {/* Fixed transparent backdrop — click outside to cancel. */}
      <div
        style={{ position: "fixed", inset: 0, background: BACKDROP_BG, zIndex }}
        onClick={onCancel}
        aria-hidden="true"
      />
      {frame}
    </>
  );
}
