// SiblingAccentProposalBanner — the longpress accelerator's one-click
// propose-then-confirm banner (spec v1.3.1 §3c: never a silent auto-insert).
//
// Modeled on CasePairProposalBanner.tsx (same visual shell: role="note",
// the shared green-accent card styling, an Accept/Decline pair) but a
// DISTINCT, independent proposal — this one is multi-character and
// both-case (the rest of a diacritic family, lowercase AND uppercase, in one
// Accept), where the case-pair companion is exactly one counterpart. Kept as
// its own state/banner rather than folded into `useCasePairCompanion` so
// neither proposal has to disambiguate a shared "one proposal at a time"
// slot (see TouchGallery's `handleUseSuggestion` — this banner is raised
// only from accepting a longpress SUGGESTION card, never from the manual
// chooser's Apply, which is `useCasePairCompanion`'s own trigger). The two
// CAN render simultaneously — distinct state slots, independent confirm/
// dismiss paths — and that is safe; they are not mutually exclusive.
//
// No third button and no partial-accept: one Accept places every sibling in
// the proposal; Decline discards all of them (spec Out of scope — bulk
// per-item selection).
//
// The shell (role="note", the green card, the Accept/Decline button pair) is
// the shared parts/ProposalBanner.tsx — lifted out because this banner and
// CasePairProposalBanner.tsx were byte-identical copies of it, differing
// only in message content and button labels/handlers.

import { Trans, useLingui } from "@lingui/react/macro";
import { ProposalBanner } from "./parts/ProposalBanner.tsx";
import type { SiblingAccentPlacement } from "./siblingAccents.ts";

export interface SiblingAccentProposal {
  /** The character whose longpress suggestion was just accepted — the
   *  proposal's own placement is NOT included in `placements` (the caller
   *  already placed it before raising this proposal). */
  acceptedChar: string;
  hostKey: string;
  placements: SiblingAccentPlacement[];
}

export interface SiblingAccentProposalBannerProps {
  proposal: SiblingAccentProposal;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function SiblingAccentProposalBanner({
  proposal,
  onConfirm,
  onDismiss,
}: SiblingAccentProposalBannerProps) {
  const { t } = useLingui();
  const lowerList = proposal.placements
    .filter((p) => p.layer === "default")
    .map((p) => p.char)
    .join(" ");
  const upperList = proposal.placements
    .filter((p) => p.layer === "shift")
    .map((p) => p.char)
    .join(" ");
  // Named local bound immediately before the <Trans> below — a bare member
  // expression inside a <Trans> macro collapses to a POSITIONAL {0}
  // placeholder rather than a named one (see this module's sibling
  // TouchGallery.tsx ~line 913-917 for the fr-catalog breakage this already
  // caused once). `lowerList`/`upperList` above are already local consts so
  // they extract named; `acceptedChar` needs the same treatment.
  const acceptedChar = proposal.acceptedChar;

  return (
    <ProposalBanner
      ariaLabel={t({
        id: "editor.assignLoop.touch.siblingAccents.ariaLabel",
        message: "Related accented letters suggestion",
      })}
      message={
        upperList.length > 0 ? (
          <Trans id="editor.assignLoop.touch.siblingAccents.prompt.withUpper">
            {acceptedChar} is part of a family of accented letters.
            Add {lowerList} to the same key, and {upperList} to its shift
            layer?
          </Trans>
        ) : (
          <Trans id="editor.assignLoop.touch.siblingAccents.prompt.lowerOnly">
            {acceptedChar} is part of a family of accented letters.
            Add {lowerList} to the same key?
          </Trans>
        )
      }
      confirmLabel={
        <Trans id="editor.assignLoop.touch.siblingAccents.confirmButton">
          Add them
        </Trans>
      }
      confirmAriaLabel={t({
        id: "editor.assignLoop.touch.siblingAccents.confirmAriaLabel",
        message: `Add the related accented letters to ${{ hostKey: proposal.hostKey }}`,
      })}
      onConfirm={onConfirm}
      declineLabel={
        <Trans id="editor.assignLoop.touch.siblingAccents.declineButton">
          No thanks
        </Trans>
      }
      declineAriaLabel={t({
        id: "editor.assignLoop.touch.siblingAccents.declineAriaLabel",
        message: "Do not add the related accented letters",
      })}
      onDismiss={onDismiss}
    />
  );
}
