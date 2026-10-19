// DisplacementProposalBanner — propose-then-confirm demotion of a glyph
// displaced by a new assignment (#2300, gate G3).
//
// Modeled on CasePairProposalBanner.tsx: the shared parts/ProposalBanner
// shell (role="note", green card, confirm/decline pair), its own i18n ids,
// its own state slot (useDisplacementProposal) so it can co-render with
// the case-pair companion raised by the same Apply.
//
// WHO gets demoted is decided by orthography tier (Matthew's steer-2
// ruling: frequency data does not exist in the studio, so tier decides —
// a convenience character loses to core orthography):
//   - demote-incumbent — the banner proposes ONE demotion of the
//     displaced glyph: RAlt on the same key (rank 1), or a deadkey when
//     the RAlt slot is taken/unavailable (fallback). Confirm records it;
//     "Leave it" is the explicit third option — a recorded dismissal.
//   - demote-incoming — a convenience character took a core character's
//     key: the proposal INVERTS. Confirm moves the INCOMING character to
//     the demotion home and the core character keeps the key.
//   - both-core — both are core orthography: the banner states that
//     frequency data (which we don't have) would be needed to rank them,
//     the DEFAULT button keeps both as primary, and demoting the
//     displaced glyph is offered only as the explicit other choice,
//     never the default.
//
// The copy is honest about what "leave it" means in the first two
// shapes: the displaced glyph stays shadowed on that key (Keyman
// first-match-wins), so it will no longer be typeable from there.
//
// ICU note (same trap as the suggestion row): a displaced glyph may be an
// apostrophe, so glyphs travel inside interpolated VALUES, never in the
// message template.

import { Trans, useLingui } from "@lingui/react/macro";
import { keyLabelOrRaw } from "../../lib/keyLabel.ts";
import { KeyCap } from "../../ui/KeyCap.tsx";
import { ProposalBanner } from "./parts/ProposalBanner.tsx";
import type { DisplacementProposal } from "./useDisplacementProposal.ts";

export interface DisplacementProposalBannerProps {
  proposal: DisplacementProposal;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function DisplacementProposalBanner({
  proposal,
  onConfirm,
  onDismiss,
}: DisplacementProposalBannerProps) {
  const { t } = useLingui();
  const keyName = keyLabelOrRaw(proposal.vkey);
  const displacedChar = proposal.displacedChar;
  const incomingChar = proposal.incomingChar;
  const isRalt = proposal.demotionMethod === "ralt";

  if (proposal.direction === "both-core") {
    return (
      <ProposalBanner
        ariaLabel={t({
          id: "editor.assignLoop.displacement.ariaLabel",
          message: "Displaced character proposal",
        })}
        message={
          <Trans id="editor.assignLoop.displacement.prompt.bothCore">
            {incomingChar} and {displacedChar} are both part of your
            alphabet, and both were headed for the{" "}
            <KeyCap>{keyName}</KeyCap> key. Which one is typed more often
            would decide which keeps the key — and the studio has no
            frequency data, so neither is demoted. Keep both as primary
            characters and find {incomingChar} a different key, or demote{" "}
            {displacedChar} yourself.
          </Trans>
        }
        confirmLabel={
          <Trans id="editor.assignLoop.displacement.confirmButton.bothCore">
            Keep both
          </Trans>
        }
        confirmAriaLabel={t({
          id: "editor.assignLoop.displacement.confirmAriaLabel.bothCore",
          message: `Keep both ${incomingChar} and ${displacedChar} as primary characters`,
        })}
        onConfirm={onConfirm}
        declineLabel={
          <Trans id="editor.assignLoop.displacement.declineButton.bothCore">
            Demote {displacedChar}
          </Trans>
        }
        declineAriaLabel={t({
          id: "editor.assignLoop.displacement.declineAriaLabel.bothCore",
          message: `Demote ${displacedChar} from the ${keyName} key`,
        })}
        onDismiss={onDismiss}
      />
    );
  }

  if (proposal.direction === "demote-incoming") {
    return (
      <ProposalBanner
        ariaLabel={t({
          id: "editor.assignLoop.displacement.ariaLabel",
          message: "Displaced character proposal",
        })}
        message={
          isRalt ? (
            <Trans id="editor.assignLoop.displacement.prompt.incomingRalt">
              {incomingChar} is a convenience character, and{" "}
              {displacedChar} is part of your alphabet. Move{" "}
              {incomingChar} to AltGr + <KeyCap>{keyName}</KeyCap> instead,
              so {displacedChar} keeps the <KeyCap>{keyName}</KeyCap> key?
              Leave it and {incomingChar} stays on that key.
            </Trans>
          ) : (
            <Trans id="editor.assignLoop.displacement.prompt.incomingDeadkey">
              {incomingChar} is a convenience character, and{" "}
              {displacedChar} is part of your alphabet. Move{" "}
              {incomingChar} behind a deadkey instead, so {displacedChar}{" "}
              keeps the <KeyCap>{keyName}</KeyCap> key? Leave it and{" "}
              {incomingChar} stays on that key.
            </Trans>
          )
        }
        confirmLabel={
          <Trans id="editor.assignLoop.displacement.confirmButton">
            Move it
          </Trans>
        }
        confirmAriaLabel={
          isRalt
            ? t({
                id: "editor.assignLoop.displacement.confirmAriaLabel.incomingRalt",
                message: `Move ${incomingChar} to AltGr + the ${keyName} key so ${displacedChar} keeps the key`,
              })
            : t({
                id: "editor.assignLoop.displacement.confirmAriaLabel.incomingDeadkey",
                message: `Move ${incomingChar} behind a deadkey so ${displacedChar} keeps the key`,
              })
        }
        onConfirm={onConfirm}
        declineLabel={
          <Trans id="editor.assignLoop.displacement.declineButton">
            Leave it
          </Trans>
        }
        declineAriaLabel={t({
          id: "editor.assignLoop.displacement.declineAriaLabel",
          message: `Leave ${displacedChar} without a new key — it will no longer be typeable from the ${keyName} key`,
        })}
        onDismiss={onDismiss}
      />
    );
  }

  return (
    <ProposalBanner
      ariaLabel={t({
        id: "editor.assignLoop.displacement.ariaLabel",
        message: "Displaced character proposal",
      })}
      message={
        isRalt ? (
          <Trans id="editor.assignLoop.displacement.prompt.ralt">
            {incomingChar} took the <KeyCap>{keyName}</KeyCap> key from{" "}
            {displacedChar}. Move {displacedChar} to AltGr +{" "}
            <KeyCap>{keyName}</KeyCap> so you can still type it? Leave it
            and {displacedChar} will no longer be typeable from that key.
          </Trans>
        ) : (
          <Trans id="editor.assignLoop.displacement.prompt.deadkey">
            {incomingChar} took the <KeyCap>{keyName}</KeyCap> key from{" "}
            {displacedChar}, and its AltGr spot is taken. Move{" "}
            {displacedChar} behind a deadkey so you can still type it?
            Leave it and {displacedChar} will no longer be typeable from
            that key.
          </Trans>
        )
      }
      confirmLabel={
        <Trans id="editor.assignLoop.displacement.confirmButton">
          Move it
        </Trans>
      }
      confirmAriaLabel={
        isRalt
          ? t({
              id: "editor.assignLoop.displacement.confirmAriaLabel.ralt",
              message: `Move ${displacedChar} to AltGr + the ${keyName} key`,
            })
          : t({
              id: "editor.assignLoop.displacement.confirmAriaLabel.deadkey",
              message: `Move ${displacedChar} behind a deadkey`,
            })
      }
      onConfirm={onConfirm}
      declineLabel={
        <Trans id="editor.assignLoop.displacement.declineButton">
          Leave it
        </Trans>
      }
      declineAriaLabel={t({
        id: "editor.assignLoop.displacement.declineAriaLabel",
        message: `Leave ${displacedChar} without a new key — it will no longer be typeable from the ${keyName} key`,
      })}
      onDismiss={onDismiss}
    />
  );
}
