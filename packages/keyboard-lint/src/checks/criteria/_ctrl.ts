// Shared definitions for the Ctrl checks (7.29 raw Ctrl, 7.30 sided Ctrl advisory).

/** Alt-family modifiers: a Ctrl rule that also has one of these is AltGr, not raw Ctrl. */
export const ALT_MODIFIERS: ReadonlySet<string> = new Set(["ALT", "LALT", "RALT"]);

/** True when the keyboard is a basic_* (Windows reference) keyboard, whose Ctrl content is frozen. */
export function isBasicKeyboard(keyboardId: string): boolean {
  return keyboardId.toLowerCase().startsWith("basic_");
}
