// deadkeyTriggerOptions — the corpus-common deadkey trigger suggestions.
//
// The four keys below are suggestions, not a restriction: both the S-02
// assign-flow card and the spec-083 define flow offer them first (§3c —
// propose, don't blank) and let the author pick any key. They live here
// (rather than inside MechanismGallery) so the define flow and the card
// suggest the same keys without importing the whole gallery.

/** The four corpus-common trigger keys, suggested first. */
export const DEADKEY_OPTIONS = [
  { value: "K_COLON", label: "K_COLON (semicolon ;)" },
  { value: "K_LBRKT", label: "K_LBRKT (left bracket [)" },
  { value: "K_RBRKT", label: "K_RBRKT (right bracket ])" },
  { value: "K_BKQUOTE", label: "K_BKQUOTE (backtick `)" },
] as const;

/**
 * Maps each DEADKEY_OPTIONS key value to the unshifted character it
 * produces (US QWERTY) — the proposed double-tap accent character for a
 * deadkey on that trigger.
 */
export const TRIGGER_KEY_CHARS: Record<string, string> = {
  K_LBRKT: "[",
  K_RBRKT: "]",
  K_BKQUOTE: "`",
  K_COLON: ";",
};
