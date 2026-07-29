// ProposalBanner — the shared shell for every propose-then-confirm banner in
// the assignLoop galleries (spec v1.3.1 §3c: never a silent auto-insert).
//
// Extracted from CasePairProposalBanner.tsx and SiblingAccentProposalBanner.tsx,
// which were byte-identical copies of this markup/styling (role="note", the
// green #0d2218/#238636 card, an Accept/Decline button pair) differing only
// in the message content and the two buttons' labels/aria-labels/handlers.
// Purely presentational — callers own their own proposal shape, message
// composition (including any <Trans> macros — a message is a ReactNode, not
// a template string, so callers keep full control of their own i18n ids),
// and confirm/dismiss logic.
//
// No third button and no partial-accept baked in here — that stays a
// per-caller decision (both current callers are "one Accept for everything,
// Decline discards all" today, but this shell does not assume it).

import type { ReactNode } from "react";
import { BORDER, TEXT_DIM, FONT } from "../../../lib/galleryTheme.ts";

export interface ProposalBannerProps {
  /** Accessible name for the outer `role="note"` region. */
  ariaLabel: string;
  /** The prompt itself — typically one or more `<Trans>` elements composed
   *  by the caller so its own i18n ids stay in the caller's file. */
  message: ReactNode;
  /** Visible label for the accept/confirm button. */
  confirmLabel: ReactNode;
  /** Accessible name for the accept/confirm button. */
  confirmAriaLabel: string;
  onConfirm: () => void;
  /** Visible label for the decline/dismiss button. */
  declineLabel: ReactNode;
  /** Accessible name for the decline/dismiss button. */
  declineAriaLabel: string;
  onDismiss: () => void;
}

export function ProposalBanner({
  ariaLabel,
  message,
  confirmLabel,
  confirmAriaLabel,
  onConfirm,
  declineLabel,
  declineAriaLabel,
  onDismiss,
}: ProposalBannerProps) {
  return (
    <div
      role="note"
      aria-label={ariaLabel}
      style={{
        background: "#0d2218",
        border: "1px solid #238636",
        borderRadius: 8,
        padding: "10px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 12,
          color: "#56d364",
          fontFamily: FONT,
        }}
      >
        {message}
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={onConfirm}
          aria-label={confirmAriaLabel}
          style={{
            padding: "5px 14px",
            background: "#238636",
            border: "none",
            borderRadius: 5,
            color: "#e6edf3",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: FONT,
          }}
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={declineAriaLabel}
          style={{
            padding: "5px 14px",
            background: "transparent",
            border: `1px solid ${BORDER}`,
            borderRadius: 5,
            color: TEXT_DIM,
            fontSize: 12,
            cursor: "pointer",
            fontFamily: FONT,
          }}
        >
          {declineLabel}
        </button>
      </div>
    </div>
  );
}
