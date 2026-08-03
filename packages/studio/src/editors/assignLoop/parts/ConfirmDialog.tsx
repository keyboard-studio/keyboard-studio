// ConfirmDialog — a modal dialog for actions that need an explicit user choice.
//
// Uses the native <dialog> element for:
//   - Built-in focus trap while open
//   - Native Escape-key close
//   - Backdrop click to cancel
//   - No external dependency
//
// Accessibility:
//   - role="alertdialog" so screen readers announce the dialog immediately
//   - aria-labelledby / aria-describedby wired to title / body
//   - Primary button is the first focusable element so Enter confirms quickly
//   - Escape and backdrop-click route to onClose (cancel)

import { useEffect, useId, useRef } from 'react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** The dialog body — may include a list of affected locations. */
  body: React.ReactNode;
  /** Label for the prominent "yes" action. */
  primaryLabel: string;
  /** Label for the muted "cancel / just here" action. Omit for a single-button (info) dialog. */
  secondaryLabel?: string;
  onPrimary: () => void;
  /** Clicking the secondary button, Escape, or the backdrop. Falls back to onPrimary when omitted. */
  onSecondary?: () => void;
  /**
   * Which action Escape / backdrop-click routes to, independent of the
   * secondary button's own click handler. Defaults to `"secondary"` —
   * preserves every existing call site's behavior (dismiss = onSecondary ??
   * onPrimary). Set to `"primary"` for dialogs where the secondary button is
   * a "proceed anyway" / defer action rather than a cancel — e.g. the
   * gallery leave-warnings, where "Come back later" (secondary) advances the
   * phase and Escape must NOT silently do the same thing. Conventional
   * modal semantics: Escape/backdrop = cancel/stay, never an implicit confirm.
   */
  dismissAction?: "primary" | "secondary";
}

export function ConfirmDialog({
  open,
  title,
  body,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
  dismissAction = "secondary",
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Explicit secondary-button click — ALWAYS onSecondary (falling back to
  // onPrimary only for single-button info dialogs that omit onSecondary
  // entirely). This is unaffected by dismissAction: a caller who deliberately
  // clicks "Come back later" gets exactly that action.
  const explicitSecondaryClick = onSecondary ?? onPrimary;
  // Escape / backdrop dismiss route — independent of the button above.
  // Defaults to "secondary" (dismiss = onSecondary ?? onPrimary), preserving
  // every existing call site's behavior. dismissAction="primary" routes
  // Escape/backdrop to onPrimary instead — for dialogs (the gallery leave-
  // warnings) where the secondary button is a "proceed anyway" / defer
  // action, not a cancel; conventional modal semantics keep Escape/backdrop
  // as cancel/stay, never an implicit confirm.
  const dismiss = dismissAction === "primary" ? onPrimary : explicitSecondaryClick;

  // Open / close the native <dialog> in sync with the `open` prop.
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  // Handle the native "cancel" event fired on Escape.
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const onCancel = (e: Event) => {
      e.preventDefault(); // prevent native close — we manage it via state
      dismiss();
    };
    el.addEventListener('cancel', onCancel);
    return () => el.removeEventListener('cancel', onCancel);
  }, [dismiss]);

  // Backdrop click = cancel (clicks on the <dialog> element itself, outside the inner panel).
  function handleDialogClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) {
      dismiss();
    }
  }

  const baseId = useId();
  const titleId = `${baseId}-title`;
  const bodyId = `${baseId}-body`;

  const btnBase: React.CSSProperties = {
    font: '600 13px var(--app-font)', cursor: 'pointer',
    border: 'none', borderRadius: 8, padding: '9px 16px', whiteSpace: 'nowrap',
  };

  return (
    /* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions --
       backdrop click-to-dismiss is a redundant pointer affordance on a native
       <dialog> opened with showModal(); keyboard users already dismiss via the
       native Escape route (the 'cancel' listener above). No keyboard capability
       is missing, so no key handler belongs here. */
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      role="alertdialog"
      onClick={handleDialogClick}
      style={{
        border: 'none',
        borderRadius: 14,
        padding: 0,
        maxWidth: 480,
        width: 'calc(100vw - 40px)',
        background: 'var(--app-surface)',
        color: 'var(--app-text)',
        boxShadow: '0 8px 40px rgba(0,0,0,.35)',
        // Override default UA backdrop with a semi-transparent one
      }}
    >
      <style>{`
        dialog::backdrop {
          background: rgba(0,0,0,.45);
        }
      `}</style>
      <div style={{ padding: '24px 26px 20px' }}>
        <h2
          id={titleId}
          style={{ margin: '0 0 12px', font: "600 17px/1.25 var(--app-font)", color: 'var(--app-text)' }}
        >
          {title}
        </h2>
        <div
          id={bodyId}
          style={{ fontSize: 13.5, color: 'var(--app-text-muted)', lineHeight: 1.65 }}
        >
          {body}
        </div>
        <div
          style={{
            marginTop: 20,
            display: 'flex',
            gap: 10,
            justifyContent: 'flex-end',
            flexWrap: 'wrap',
          }}
        >
          {/* Secondary (muted) — "Cancel" / "Just here". Omitted for info dialogs. */}
          {secondaryLabel !== undefined && (
            <button
              onClick={explicitSecondaryClick}
              style={{
                ...btnBase,
                color: 'var(--app-text-muted)',
                background: 'transparent',
                border: '1px solid var(--app-border-strong)',
              }}
            >
              {secondaryLabel}
            </button>
          )}
          {/* Primary (accent / filled) — "Yes, remove everywhere" */}
          <button
            // Not page-load autofocus: this mounts when the modal opens,
            // implementing the APG dialog pattern's required initial focus
            // placement inside the dialog (docs/accessibility.md house rule 4).
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            onClick={onPrimary}
            style={{
              ...btnBase,
              color: '#fff',
              background: 'var(--app-accent)',
              padding: '9px 18px',
            }}
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
