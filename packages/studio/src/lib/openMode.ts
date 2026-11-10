import type { KeyboardIR } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";

/** True when the working copy was instantiated by opening an existing keyboard (Open mode). */
export function isOpenMode(mode: "new-from-base" | "adapt-existing" | null | undefined): boolean {
  return mode === "adapt-existing";
}

/**
 * Open mode with the keyboard's own package descriptor in the working copy.
 *
 * The Open behaviours that carry files unchanged (no documentation
 * regeneration, descriptor patched in place, "Updated" history entry) apply
 * when the descriptor came in with the keyboard. A keyboard that shipped no
 * `.kps`, or a draft restored from before Open carried it, keeps the earlier
 * Adapt behaviour until the descriptor is brought in (see the draft-restore
 * path in `persistWorkingCopy`).
 */
export function isOpenedWithDescriptor(
  mode: "new-from-base" | "adapt-existing" | null | undefined,
  vfs: { get(path: string): unknown } | null | undefined,
  keyboardId: string,
): boolean {
  return isOpenMode(mode) && vfs?.get(`source/${keyboardId}.kps`) !== undefined;
}

/**
 * The starting keyboard with its line spans re-read from the text as it stands.
 *
 * Earlier projection steps can add lines to the `.kmn` (the OSK stylesheet
 * store, step 0b), which shifts every span `startIr` recorded when it was
 * parsed. A splice that trusted those spans would cut the wrong lines. Nodes
 * keep their ids; only `sourceLine` moves. Groups and raw fragments match by
 * position, rules by position within their group, stores by name and
 * occurrence. A node with no counterpart loses its span, so the splice asks
 * for the author's agreement instead of guessing.
 */
export function withCurrentSpans(startIr: KeyboardIR, currentText: string, keyboardId: string): KeyboardIR {
  const fresh = parseKmn(currentText, keyboardId).ir;
  const setLine = (node: { sourceLine?: number }, line: number | undefined): void => {
    if (line === undefined) delete node.sourceLine;
    else node.sourceLine = line;
  };
  const storeKey = (name: string, seen: Map<string, number>): string => {
    const n = seen.get(name) ?? 0;
    seen.set(name, n + 1);
    return `${name}#${n}`;
  };
  const freshStores = new Map<string, number | undefined>();
  const freshSeen = new Map<string, number>();
  for (const s of fresh.stores) freshStores.set(storeKey(s.name, freshSeen), s.sourceLine);

  const ir = structuredClone(startIr);
  ir.groups.forEach((g, gi) => {
    const fg = fresh.groups[gi];
    setLine(g, fg?.sourceLine);
    // A different rule count means the text no longer lines up by position.
    const aligned = fg !== undefined && fg.rules.length === g.rules.length;
    g.rules.forEach((r, ri) => setLine(r, aligned ? fg.rules[ri]?.sourceLine : undefined));
  });
  const seen = new Map<string, number>();
  for (const s of ir.stores) {
    const key = storeKey(s.name, seen);
    setLine(s, freshStores.get(key));
  }
  const rawAligned = fresh.raw.length === ir.raw.length;
  ir.raw.forEach((f, i) => setLine(f, rawAligned ? fresh.raw[i]?.sourceLine : undefined));
  return ir;
}
