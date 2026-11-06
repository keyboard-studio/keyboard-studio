// DisplacementModal — the displacement (demotion) prompt as a blocking
// modal (#2525).
//
// #2300 raised the proposal as a non-modal banner AFTER the apply: the
// author could scroll past it and never decide, silently losing the
// displaced glyph. The modal replaces the banner in the gallery (the
// banner component stays for its isolated rendering test): the author
// must choose before doing anything else — Move it / Leave it (the two
// displacementActions, exactly as the banner offered them) — or Cancel,
// which undoes the placement entirely (the assignment is removed, the
// companion raised for it is cleared, and NO dismissal is recorded, so a
// later re-apply proposes afresh).
//
// The frame is the shared ui/Dialog primitive (APG modal dialog:
// focus moves in on open, Tab cycles inside, Escape cancels —
// docs/accessibility.md rule 4); the message and the two action buttons
// are the DisplacementProposalBanner itself, so the copy and i18n ids are
// shared, not duplicated. The only new strings are the Cancel button and
// its one-line note.

import { useLingui } from "@lingui/react/macro";
import { Dialog } from "../../ui/Dialog.tsx";
import { BORDER, FONT, TEXT_DIM } from "../../lib/galleryTheme.ts";
import { DisplacementProposalBanner } from "./DisplacementProposalBanner.tsx";
import type { DisplacementProposal } from "./useDisplacementProposal.ts";

export interface DisplacementModalProps {
  proposal: DisplacementProposal;
  onConfirm: () => void;
  onDismiss: () => void;
  /** Undo the placement that raised the proposal; records nothing. */
  onCancel: () => void;
}

export function DisplacementModal({
  proposal,
  onConfirm,
  onDismiss,
  onCancel,
}: DisplacementModalProps) {
  const { t } = useLingui();
  return (
    <Dialog
      open
      onCancel={onCancel}
      label={t({
        id: "editor.assignLoop.displacement.ariaLabel",
        message: "Displaced character proposal",
      })}
      testId="displacement-modal"
    >
      <DisplacementProposalBanner
        proposal={proposal}
        onConfirm={onConfirm}
        onDismiss={onDismiss}
      />
      <p style={{ margin: 0, fontSize: 12, color: TEXT_DIM, fontFamily: FONT }}>
        {t({
          id: "editor.assignLoop.displacement.cancelNote",
          message: "Cancel undoes this placement — nothing is recorded.",
        })}
      </p>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onCancel}
          aria-label={t({
            id: "editor.assignLoop.displacement.cancelAriaLabel",
            message: "Cancel — undo this placement",
          })}
          style={{
            padding: "8px 16px",
            fontSize: 13,
            color: TEXT_DIM,
            background: "transparent",
            border: `1px solid ${BORDER}`,
            borderRadius: 8,
            cursor: "pointer",
            fontFamily: FONT,
          }}
        >
          {t({
            id: "editor.assignLoop.displacement.cancelButton",
            message: "Cancel",
          })}
        </button>
      </div>
    </Dialog>
  );
}
