// openInventory: adding characters to an opened keyboard's character inventory
// (spec 111 Open walk, Letters step). The inventory is the session's confirmed
// inventory, the same list the Mechanisms and Touch galleries walk to place
// characters, exactly as on Copy. Adding here places nothing: the galleries later
// in the walk are where a new character gets its keys.

import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";

/** The distinct, NFC-normalized characters of `text` (code points, whitespace dropped). */
export function charactersOf(text: string): string[] {
  const out: string[] = [];
  for (const ch of [...text.normalize("NFC")]) {
    if (ch.trim() === "" || out.includes(ch)) continue;
    out.push(ch);
  }
  return out;
}

/** `current` with `added` appended, skipping any already present. Pure. */
export function withCharacters(current: readonly string[], added: readonly string[]): string[] {
  const have = new Set(current.map((c) => c.normalize("NFC")));
  const next = [...current];
  for (const ch of added) {
    const nfc = ch.normalize("NFC");
    if (have.has(nfc)) continue;
    have.add(nfc);
    next.push(nfc);
  }
  return next;
}

/** Add characters to the working copy's confirmed inventory. Returns true when something was added. */
export function addToInventory(chars: readonly string[]): boolean {
  const current = useWorkingCopyStore.getState().session.confirmedInventory ?? [];
  const next = withCharacters(current, chars);
  if (next.length === current.length) return false;
  useWorkingCopyStore.getState().recordPhase({ phase: "B", answers: [], confirmedInventory: next });
  return true;
}
