// ProposalCard — the shared green "note" card shell used by every
// propose-then-confirm banner AND the sibling-accent bulk summary box in the
// assignLoop galleries. Purely presentational: it owns the role="note"
// container, the shared green-chip token styling (GREEN_CHIP_BG/BORDER/TEXT
// — see RemovableChipRow.tsx), and the message paragraph. Callers supply the
// message and their own action(s) as `children` — a two-button
// confirm/decline pair (ProposalBanner) or a single "Remove all" button (the
// bulk box) — so the shell never assumes a button model.

import type { ReactNode } from "react";
import { FONT } from "../../../lib/galleryTheme.ts";
import { GREEN_CHIP_BG, GREEN_CHIP_BORDER, GREEN_CHIP_TEXT } from "./RemovableChipRow.tsx";

export interface ProposalCardProps {
  /** Accessible name for the outer `role="note"` region. */
  ariaLabel: string;
  /** The prompt/summary — typically one or more `<Trans>` elements composed
   *  by the caller so its own i18n ids stay in the caller's file. */
  message: ReactNode;
  /** The action control(s) — e.g. a confirm/decline pair or a single button. */
  children: ReactNode;
}

export function ProposalCard({ ariaLabel, message, children }: ProposalCardProps) {
  return (
    <div
      role="note"
      aria-label={ariaLabel}
      style={{
        background: GREEN_CHIP_BG,
        border: `1px solid ${GREEN_CHIP_BORDER}`,
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
          color: GREEN_CHIP_TEXT,
          fontFamily: FONT,
        }}
      >
        {message}
      </p>
      {children}
    </div>
  );
}
