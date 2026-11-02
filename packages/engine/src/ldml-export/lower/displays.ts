// `<displays>` entries (mapping rows 4.8, 5.10; tasks T074, T073).
//
// A display is keyed by key id, so one id can carry only one label: the first label offered for an
// id wins (callers offer in a fixed order). A display never equals its key's output, a label that is
// a bare nonspacing mark gets U+25CC in front of it (TR35), and a gap key is never referenced.

import type { LDMLKeyboard } from "@keymanapp/developer-utils";
import { compareCodePoints } from "./keyIds.js";

const DOTTED_CIRCLE = "\u25CC";

/** The text to display for a label, or null when no display is needed or possible. */
export function displayText(label: string, output: string): string | null {
  let text = label.normalize("NFC");
  if (text === "" || /[\u0000-\u001F\u007F]/.test(text)) return null;
  if (/^\p{Mn}+$/u.test(text)) text = DOTTED_CIRCLE + text;
  return text === output.normalize("NFC") ? null : text;
}

export class DisplaySet {
  private readonly byKey = new Map<string, string>();

  /** Offer a label for a key id whose typed text is `output`; returns true when it was kept. */
  add(keyId: string, label: string, output: string): boolean {
    if (this.byKey.has(keyId)) return false;
    const text = displayText(label, output);
    if (text === null) return false;
    this.byKey.set(keyId, text);
    return true;
  }

  has(keyId: string): boolean {
    return this.byKey.has(keyId);
  }

  /** In key id order, or undefined when there are none. */
  toDisplays(): LDMLKeyboard.LKDisplays | undefined {
    if (this.byKey.size === 0) return undefined;
    const display = [...this.byKey]
      .sort(([a], [b]) => compareCodePoints(a, b))
      .map(([keyId, text]) => ({ keyId, display: text }));
    return { display } as LDMLKeyboard.LKDisplays;
  }
}
