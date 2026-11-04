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
// @see specs/074-uppercase-counterpart-suggestion/contracts/case-pair-proposal.md

import { Trans, useLingui } from "@lingui/react/macro";
import { msg } from "@lingui/core/macro";
import type { I18n, MessageDescriptor } from "@lingui/core";
import { canonicalizeCombo } from "@keyboard-studio/engine";
import { formatModifierCombo } from "../../lib/modifierTokenLabel.ts";
import { keyLabelOrRaw } from "../../lib/keyLabel.ts";
import { KeyCap } from "../../ui/KeyCap.tsx";
import { ProposalBanner } from "./parts/ProposalBanner.tsx";
import type { CasePairProposal } from "./casePairCompanion.ts";

/**
 * Keycap-convention display label for a proposal's physical key (vkey or
 * touch host key) — lowercase unshifted glyph, boxed by the caller as a
 * `<KeyCap>` where the surface is JSX, or embedded plain in an aria-label.
 * A proposal's `vkey`/`baseKey` is always a real key here (never an
 * already-resolved glyph), so the shared `keyLabelOrRaw` applies directly
 * with no `K_`-prefix guard. See lib/keyLabel.ts for the convention this
 * disambiguates (a bare uppercase "Q" reads as the capital character, not
 * the physical q key).
 */
const keyNameFor = keyLabelOrRaw;

export interface CasePairProposalBannerProps {
  proposal: CasePairProposal;
  onConfirm: () => void;
  onDismiss: () => void;
  /**
   * Spec 112: the companion was recorded with the placement (the key is a
   * cased key). The banner stays up, saying so, with Keep / Undo in place of
   * Map it / No thanks, so the choice is still visible and reversible.
   */
  accepted?: boolean;
}

export function CasePairProposalBanner({
  proposal,
  onConfirm,
  onDismiss,
  accepted = false,
}: CasePairProposalBannerProps) {
  const { t, i18n } = useLingui();

  if (accepted) {
    return (
      <ProposalBanner
        // Polite live region: the companion was added as a side effect of Apply.
        role="status"
        ariaLabel={t({
          id: "editor.assignLoop.companion.accepted.ariaLabel",
          message: "Case-pair companion added",
        })}
        message={
          <Trans id="editor.assignLoop.companion.accepted.prompt">
            {proposal.originalChar} has an uppercase form, {proposal.counterpart}. It was added
            to the same key as well, because Caps Lock covers this key.
          </Trans>
        }
        confirmLabel={<Trans id="editor.assignLoop.companion.accepted.keepButton">Keep it</Trans>}
        confirmAriaLabel={t({
          id: "editor.assignLoop.companion.accepted.keepAriaLabel",
          message: `Keep ${proposal.counterpart} on the same key`,
        })}
        onConfirm={onConfirm}
        declineLabel={<Trans id="editor.assignLoop.companion.accepted.undoButton">Undo</Trans>}
        declineAriaLabel={t({
          id: "editor.assignLoop.companion.accepted.undoAriaLabel",
          message: `Remove ${proposal.counterpart} from the same key`,
        })}
        onDismiss={onDismiss}
      />
    );
  }

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
            {raltLayerModifierLabel(proposal)} layer of the{" "}
            <KeyCap>{keyNameFor(proposal.vkey)}</KeyCap> key?
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
        // Touch and ralt-layer each get their OWN id rather than a widened
        // shared one. The shared message is still exactly right for the
        // physical and combo paths (their parallel slot IS the shift plane),
        // and a new id orphans no translation, where editing the shared
        // message would restate it for two mechanisms that didn't change.
        // Human-readable, never the raw K_*/T_* key id — same keycap-naming
        // convention as the prompt text above (lowercase key name, "the …
        // key" phrasing).
        proposal.mechanism === "touch"
          ? t({
              id: "editor.assignLoop.companion.confirmAriaLabel.touch",
              message: `Map ${proposal.counterpart} to the ${proposal.targetLayerLabel} layer of the ${keyNameFor(proposal.baseKey)} key`,
            })
          : proposal.mechanism === "ralt-layer"
            ? t({
                id: "editor.assignLoop.companion.confirmAriaLabel.raltLayer",
                message: `Map ${proposal.counterpart} to the ${raltLayerModifierLabel(proposal)} layer of the ${keyNameFor(proposal.vkey)} key`,
              })
            : t({
                id: "editor.assignLoop.companion.confirmAriaLabel",
                message: `Map ${proposal.counterpart} to the shift layer of ${confirmTargetLabel(i18n, proposal)}`,
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
          : proposal.mechanism === "ralt-layer"
            ? t({
                id: "editor.assignLoop.companion.declineAriaLabel.raltLayer",
                message: `Do not map ${proposal.counterpart} to the ${raltLayerModifierLabel(proposal)} layer`,
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
 * What the confirm button's accessible name names as the pairing target,
 * under the same keycap convention as everywhere else (lowercase glyph,
 * "the … key" phrasing). The physical, touch, and ralt-layer mechanisms name
 * their physical key directly through `keyNameFor`; the combo mechanism names
 * its own parallel slot — the dead-key trigger key or the sequence indicator
 * key. The dead-key trigger is a `K_` vkey, so it routes through `keyNameFor`
 * to avoid leaking a raw `K_QUOTE` into the accessible name; the sequence
 * indicator is already a resolved display glyph (its case is meaningful and
 * must survive), so it passes through untouched — hence the `K_`-prefix
 * guard, since `keyNameFor`/`vkeyLabel` upper-normalizes its input.
 *
 * Descriptors are module-level msg() calls (not t() calls inside the helper)
 * so `lingui extract` picks them up — the extractor cannot follow the `t`
 * binding into a helper that receives it as a parameter.
 */
const CONFIRM_TARGET_MSGS = {
  physical: msg({ id: "assignLoop.casePair.confirmTarget.physical", message: "the {keyName} key" }),
  touch: msg({ id: "assignLoop.casePair.confirmTarget.touch", message: "the {keyName} key" }),
  combo: msg({ id: "assignLoop.casePair.confirmTarget.combo", message: "the {keyName} key" }),
  raltLayer: msg({ id: "assignLoop.casePair.confirmTarget.raltLayer", message: "the {keyName} key" }),
} as const;

/** Resolve a module-level msg() descriptor with values (the macro `t` can't take values). */
function tr(i18n: I18n, descriptor: MessageDescriptor, values?: Record<string, unknown>): string {
  return i18n._(descriptor.id, values);
}

function confirmTargetLabel(i18n: I18n, proposal: CasePairProposal): string {
  switch (proposal.mechanism) {
    case "physical":
      return tr(i18n, CONFIRM_TARGET_MSGS.physical, { keyName: keyNameFor(proposal.vkey) });
    case "touch":
      return tr(i18n, CONFIRM_TARGET_MSGS.touch, { keyName: keyNameFor(proposal.baseKey) });
    case "combo": {
      const comboKey =
        proposal.combo.kind === "deadkey"
          ? proposal.combo.triggerKey
          : proposal.combo.indicator;
      const named = comboKey.startsWith("K_") ? keyNameFor(comboKey) : comboKey;
      return tr(i18n, CONFIRM_TARGET_MSGS.combo, { keyName: named });
    }
    case "ralt-layer":
      return tr(i18n, CONFIRM_TARGET_MSGS.raltLayer, { keyName: keyNameFor(proposal.vkey) });
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
