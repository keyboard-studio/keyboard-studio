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
  useRef,
  type FormEvent,
  type ReactNode,
} from "react";
import { BG_CARD, BORDER, FONT, TEXT_DIM } from "./theme.ts";
import { useModalFocus } from "../hooks/useModalFocus.ts";

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
  /**
   * Full-viewport variant for narrow-viewport modals (mobile adaptation
   * Phase 4 — the sequence builder). The frame fills the
   * viewport instead of centering; desktop callers leave this off and see
   * byte-identical frames.
   */
  readonly fullscreen?: boolean;
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
  fullscreen = false,
}: DialogProps) {
  const dialogRef = useRef<HTMLFormElement | HTMLDivElement | null>(null);
  // Focus trap, Escape, focus-on-open — the shared modal accessibility shape
  // (hooks/useModalFocus.ts), also used by PreviewSheet.
  const handleKeyDownTrap = useModalFocus({
    open,
    containerRef: dialogRef,
    onEscape: onCancel,
    moveFocusOnOpen: initialFocus !== "none",
  });

  if (!open) return null;

  const frameStyle = fullscreen
    ? ({
        position: "fixed",
        inset: 0,
        zIndex: zIndex + 1,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 16,
        // The opt-in close button occupies the frame's top-right corner; give
        // content room so the first row never slides underneath it.
        paddingTop: showCloseButton ? 48 : 16,
        width: "100vw",
        // dvh so a phone's collapsing browser chrome doesn't strand content
        // below the fold.
        height: "100dvh",
        overflowY: "auto",
        background: BG_CARD,
        border: "none",
        borderRadius: 0,
        fontFamily: FONT,
        boxSizing: "border-box",
      } as const)
    : ({
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
      } as const);

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
