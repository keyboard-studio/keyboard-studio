// The zzq placeholder typing (spec 107 FR-016): where the product offers
// nothing for a character, the author types `zzq` followed by the lowercase
// hex of each code point, concatenated with no separator, on the indicator key
// `j`. The corpus tests reduce `zzq[0-9A-Fa-f]+` to `zzq` when comparing.

import type { ContextElement, KeyboardIR } from "@keyboard-studio/contracts";

export function placeholderFor(char: string): { sequence: string; indicator: "j" } {
  let hex = "";
  for (const ch of char) hex += (ch.codePointAt(0) as number).toString(16);
  return { sequence: `zzq${hex}`, indicator: "j" };
}

function typedText(context: readonly ContextElement[]): string {
  let text = "";
  for (const el of context) if (el.kind === "char") text += el.value;
  return text;
}

/**
 * True when some rule in the copied keyboard already types `sequence` (as a
 * run of literal context characters), so the placeholder would collide.
 */
export function placeholderClash(sequence: string, startIr: KeyboardIR): boolean {
  const needle = sequence.toLowerCase();
  for (const group of startIr.groups) {
    for (const rule of group.rules) {
      if (typedText(rule.context).toLowerCase().includes(needle)) return true;
    }
  }
  return false;
}
