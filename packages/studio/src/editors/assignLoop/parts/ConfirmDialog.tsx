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
}

export function ConfirmDialog({
  open,
  title,
  body,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Dismiss route (Escape / backdrop / secondary button). Single-button dialogs
  // that omit onSecondary dismiss via the primary action instead.
  const dismiss = onSecondary ?? onPrimary;

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

  return (
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
              onClick={dismiss}
              style={{
                font: '600 13px var(--app-font)',
                cursor: 'pointer',
                color: 'var(--app-text-muted)',
                background: 'transparent',
                border: '1px solid var(--app-border-strong)',
                borderRadius: 8,
                padding: '9px 16px',
                whiteSpace: 'nowrap',
              }}
            >
              {secondaryLabel}
            </button>
          )}
          {/* Primary (accent / filled) — "Yes, remove everywhere" */}
          <button
            autoFocus
            onClick={onPrimary}
            style={{
              font: '600 13px var(--app-font)',
              cursor: 'pointer',
              color: '#fff',
              background: 'var(--app-accent)',
              border: 'none',
              borderRadius: 8,
              padding: '9px 18px',
              whiteSpace: 'nowrap',
            }}
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
