// CasePairProposalBanner — the ONE propose-then-confirm affordance every
// placement mechanism uses to offer an uppercase counterpart (FR-011).
//
// Lifted verbatim (markup, styling, and i18n ids) from the inline banner that
// shipped in MechanismGallery, so the physical-key interaction is byte-
// identical to what authors already know and its translations survive: an id
// is a permanent handle, and renaming one orphans every locale that has
// translated it. What varies by mechanism varies by selecting an ADDITIVE id —
// the physical/combo messages keep their exact text.
//
// The touch mechanism names its target layer in all three of its strings
// (prompt, confirm, decline) because its case-pair layer is not always the
// shift layer: the layer is the edited layer's combo plus SHIFT, so an author
// editing the RAlt layer is being offered `rightalt-shift`. The other two
// mechanisms pair onto the shift plane by construction and keep saying so.
//
// No third button and no "apply to all": each proposal is an independent
// per-placement confirm (spec Out of scope — bulk actions).
//
// The shell (role="note", the green card, the Accept/Decline button pair) is
// the shared parts/ProposalBanner.tsx — lifted out because this banner and
// SiblingAccentProposalBanner.tsx were byte-identical copies of it, differing
// only in message content and button labels/handlers. Markup, styling, and
// every i18n id below are unchanged by that extraction.
//
// @see specs/051-uppercase-counterpart-suggestion/contracts/case-pair-proposal.md

import { Trans, useLingui } from "@lingui/react/macro";
import { canonicalizeCombo } from "@keyboard-studio/engine";
import { formatModifierCombo } from "../../lib/modifierTokenLabel.ts";
import { ProposalBanner } from "./parts/ProposalBanner.tsx";
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
    <ProposalBanner
      ariaLabel={t({
        id: "editor.assignLoop.companion.ariaLabel",
        message: "Case-pair companion proposal",
      })}
      message={
        proposal.mechanism === "combo" ? (
          <Trans id="editor.assignLoop.companion.prompt.combo">
            {proposal.originalChar} has an uppercase form,{" "}
            {proposal.counterpart}. Add the uppercase combo for{" "}
            {proposal.counterpart} as well?
          </Trans>
        ) : proposal.mechanism === "touch" ? (
          <Trans id="editor.assignLoop.companion.prompt.touch">
            {proposal.originalChar} has an uppercase form,{" "}
            {proposal.counterpart}. Map {proposal.counterpart} to the{" "}
            {proposal.targetLayerLabel} layer as well?
          </Trans>
        ) : proposal.mechanism === "ralt-layer" ? (
          <Trans id="editor.assignLoop.companion.prompt.raltLayer">
            {proposal.originalChar} has an uppercase form,{" "}
            {proposal.counterpart}. Map {proposal.counterpart} to the{" "}
            {raltLayerModifierLabel(proposal)} layer of {proposal.vkey}?
          </Trans>
        ) : (
          <Trans id="editor.assignLoop.companion.prompt">
            {proposal.originalChar} has an uppercase form,{" "}
            {proposal.counterpart}. Map {proposal.counterpart} to the shift
            layer of the same key as well?
          </Trans>
        )
      }
      confirmLabel={
        <Trans id="editor.assignLoop.companion.confirmButton">Map it</Trans>
      }
      confirmAriaLabel={
        // Touch gets its OWN id rather than a widened shared one. The shared
        // message is still exactly right for the physical and combo paths
        // (their parallel slot IS the shift plane), and a new id orphans no
        // translation, where editing the shared message would restate it for
        // two mechanisms that didn't change.
        proposal.mechanism === "touch"
          ? t({
              id: "editor.assignLoop.companion.confirmAriaLabel.touch",
              message: `Map ${proposal.counterpart} to the ${proposal.targetLayerLabel} layer of ${proposal.hostKey}`,
            })
          : t({
              id: "editor.assignLoop.companion.confirmAriaLabel",
              message: `Map ${proposal.counterpart} to the shift layer of ${confirmTargetLabel(proposal)}`,
            })
      }
      onConfirm={onConfirm}
      declineLabel={
        <Trans id="editor.assignLoop.companion.declineButton">
          No thanks
        </Trans>
      }
      declineAriaLabel={
        proposal.mechanism === "touch"
          ? t({
              id: "editor.assignLoop.companion.declineAriaLabel.touch",
              message: `Do not map ${proposal.counterpart} to the ${proposal.targetLayerLabel} layer`,
            })
          : t({
              id: "editor.assignLoop.companion.declineAriaLabel",
              message: `Do not map ${proposal.counterpart} to the shift layer`,
            })
      }
      onDismiss={onDismiss}
    />
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
    case "ralt-layer":
      return proposal.vkey;
  }
}

/**
 * "Shift+RAlt"-style label for the ralt-layer proposal's target layer —
 * `baseModifiers` (the lowercase placement's own modifiers) with `SHIFT`
 * added, canonicalized to the SAME order the confirm handler's
 * `comboToKeySpec`/`canonicalizeCombo` call emits (`[SHIFT RALT vkey]`), so
 * the banner text never disagrees with what gets written. Falls back to a
 * naive "+"-join on the (structurally unreachable) mutually-exclusive-combo
 * throw — display-only, so it must never crash the banner.
 */
function raltLayerModifierLabel(
  proposal: Extract<CasePairProposal, { mechanism: "ralt-layer" }>,
): string {
  const tokens = [...proposal.baseModifiers, "SHIFT" as const];
  try {
    return formatModifierCombo(canonicalizeCombo(tokens));
  } catch {
    return formatModifierCombo(tokens);
  }
}
