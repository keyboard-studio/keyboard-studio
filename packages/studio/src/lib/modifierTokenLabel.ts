// Shared modifier-token display vocabulary — was byte-identically hand-copied
// as `MODIFIER_TOKEN_LABELS` in MechanismGallery.tsx (methodLabel's S-08
// covered-chip badge) and `TOUCH_LAYER_TOKEN_LABELS` in TouchGallery.tsx
// (touchLayerComboLabel, the touch layer picker's option labels). Both are
// keyed on the engine-exported `ModifierToken` union, so hand-copied maps
// would silently desync if that type ever grows a token; consolidated here so
// there is exactly one table to update.
//
// Pure chrome — not i18n-wrapped (these are technical vocabulary strings, same
// as the rest of each gallery's non-translated chrome around them).

import type { ModifierToken } from "@keyboard-studio/engine";

/** Display label per `ModifierToken`. */
export const MODIFIER_TOKEN_LABELS: Record<string, string> = {
  SHIFT: "Shift",
  CTRL: "Ctrl",
  RCTRL: "RCtrl",
  LCTRL: "LCtrl",
  ALT: "Alt",
  RALT: "RAlt",
  LALT: "LAlt",
  CAPS: "Caps",
  NCAPS: "NCaps",
};

/**
 * Human-friendly "+"-joined label for a list of modifier tokens, e.g.
 * "Shift+RAlt". Falls back to the raw token string for any token not present
 * in {@link MODIFIER_TOKEN_LABELS} (defensive — every `ModifierToken` is
 * covered today).
 *
 * The empty-combo / "Base" case is NOT handled here — that fallback differs
 * per caller (only TouchGallery's touch layer picker needs a synthetic base
 * option; MechanismGallery's S-08 badge uses a different "Layer" fallback
 * label) and stays local to each caller.
 */
export function formatModifierCombo(tokens: readonly ModifierToken[]): string {
  return tokens.map((tok) => MODIFIER_TOKEN_LABELS[tok] ?? tok).join("+");
}
