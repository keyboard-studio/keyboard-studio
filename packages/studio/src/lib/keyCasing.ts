// Zero-dependency leaf for the physical-key keycap convention's single-letter
// lowercase rule. A bare single-letter key label ("A", "Q", …) is the key's
// UNSHIFTED glyph, not the shifted/produced CHARACTER, so it reads lowercase
// ("a", "q") — any casing implied by a modifier is carried by the modifier
// word in the surrounding chord text ("Shift + a"), never by casing the key
// letter itself. Digit/symbol/named-key labels ("5", "[", "Backspace") are
// never single ASCII letters, so they pass through unchanged.
//
// This is the ONE definition of that rule. It lives in its own import-free
// module so both users can share it without a cycle: `lib/keyLabel.ts`'s
// `physicalKeyLabel` imports `vkeyLabel` FROM `irToCarveNodes.ts`, and
// `irToCarveNodes.ts`'s `desktopVkeyLabel` needs the same rule — importing
// `keyLabel.ts` back from `irToCarveNodes.ts` would be circular, so the rule
// itself sits below both.

export function lowerBareLetter(label: string): string {
  return label.length === 1 && /[A-Z]/.test(label) ? label.toLowerCase() : label;
}
