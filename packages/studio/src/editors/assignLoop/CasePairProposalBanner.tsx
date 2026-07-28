// CasePairProposalBanner — the ONE propose-then-confirm affordance every
// placement mechanism uses to offer an uppercase counterpart (FR-011).
//
// Lifted verbatim (markup, styling, and i18n ids) from the inline banner that
// shipped in MechanismGallery, so the physical-key interaction is byte-
// identical to what authors already know and its translations survive: an id
// is a permanent handle, and renaming one orphans every locale that has
// translated it. Only the PROMPT varies by mechanism, and it varies by
// selecting an additive id — the physical `.prompt` keeps its exact message.
//
// No third button and no "apply to all": each proposal is an independent
// per-placement confirm (spec Out of scope — bulk actions).
//
// @see specs/051-uppercase-counterpart-suggestion/contracts/case-pair-proposal.md

import { Trans, useLingui } from "@lingui/react/macro";
import { BORDER, TEXT_DIM, FONT } from "../../lib/galleryTheme.ts";
import type { CasePairProposal } from "./casePairCompanion.ts";

export interface CasePairProposalBannerProps {
  proposal: CasePairProposal;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function CasePairProposalBanner({
  proposal,
  onConfirm,
  onDismiss,
}: CasePairProposalBannerProps) {
  const { t } = useLingui();

  return (
    <div
      role="note"
      aria-label={t({
        id: "editor.assignLoop.companion.ariaLabel",
        message: "Case-pair companion proposal",
      })}
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
        {proposal.mechanism === "combo" ? (
          <Trans id="editor.assignLoop.companion.prompt.combo">
            {proposal.originalChar} has an uppercase form,{" "}
            {proposal.counterpart}. Add the uppercase combo for{" "}
            {proposal.counterpart} as well?
          </Trans>
        ) : proposal.mechanism === "touch" ? (
          <Trans id="editor.assignLoop.companion.prompt.touch">
            {proposal.originalChar} has an uppercase form,{" "}
            {proposal.counterpart}. Map {proposal.counterpart} to the shift
            layer as well?
          </Trans>
        ) : (
          <Trans id="editor.assignLoop.companion.prompt">
            {proposal.originalChar} has an uppercase form,{" "}
            {proposal.counterpart}. Map {proposal.counterpart} to the shift
            layer of the same key as well?
          </Trans>
        )}
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={onConfirm}
          aria-label={t({
            id: "editor.assignLoop.companion.confirmAriaLabel",
            message: `Map ${proposal.counterpart} to the shift layer of ${confirmTargetLabel(proposal)}`,
          })}
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
          <Trans id="editor.assignLoop.companion.confirmButton">Map it</Trans>
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t({
            id: "editor.assignLoop.companion.declineAriaLabel",
            message: `Do not map ${proposal.counterpart} to the shift layer`,
          })}
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
          <Trans id="editor.assignLoop.companion.declineButton">
            No thanks
          </Trans>
        </button>
      </div>
    </div>
  );
}

/**
 * What the confirm button's accessible name names as the pairing target. The
 * physical mechanism names its vkey — the exact string the shipping banner
 * used, so its existing tests and translations are unaffected. The other two
 * mechanisms name their own parallel slot.
 */
function confirmTargetLabel(proposal: CasePairProposal): string {
  switch (proposal.mechanism) {
    case "physical":
      return proposal.vkey;
    case "touch":
      return proposal.hostKey;
    case "combo":
      return proposal.combo.kind === "deadkey"
        ? proposal.combo.triggerKey
        : proposal.combo.indicator;
  }
}
