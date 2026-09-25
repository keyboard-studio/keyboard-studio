/**
 * Shared "composed unit -> one-mark-shorter predecessor" pairing — the core
 * of the stepwise backspace-unwrap idiom. Extracted from `mark-guards.ts`'s
 * `buildUnwrap()` (spec 071) after `context-variants.ts`'s `addBackspaceUnwrap`
 * (spec 062 US4) reimplemented the identical NFD-slice/NFC-recompose logic a
 * second time (km-lead review cycle, spec 062) — a third independent copy
 * was one too many. See specs/062-canonical-context-tolerance/research.md's
 * amended "reuse `nfcPostureOfInventory`" decision for why THAT function
 * still isn't the shared home: it needs a `ConfirmedAlphabet` neither caller
 * has, only a bare `KeyboardIR`'s attested composed units.
 *
 * Pure; no I/O, no `.kmn` text.
 */

/** A composed unit and the one-mark-shorter predecessor peeling its last mark gives. */
export interface OneMarkShorterPair {
  /** The composed unit itself (a single codepoint, e.g. "ê̩"). */
  unit: string;
  /** `unit`'s canonical decomposition, as individual codepoints. */
  nfd: string[];
  /** `nfd` with its canonically-last element dropped, recomposed to NFC. */
  to: string;
}

/**
 * Compute `unit`'s one-mark-shorter predecessor: drop the canonically-LAST
 * element of its NFD decomposition (Unicode's canonical ordering, sorted by
 * combining class — not necessarily the most-recently-typed mark; see
 * `context-variants.ts`'s `addBackspaceUnwrap` doc, "KNOWN LIMITATION 2",
 * for why that can diverge from typing order), then recompose to NFC.
 * Returns `undefined` when `unit` is not a single codepoint, or has no
 * canonical decomposition into 2+ parts — nothing to peel.
 */
export function oneMarkShorterPair(unit: string): OneMarkShorterPair | undefined {
  if ([...unit].length !== 1) return undefined;
  const nfd = [...unit.normalize("NFD")];
  if (nfd.length < 2) return undefined;
  const to = nfd.slice(0, -1).join("").normalize("NFC");
  if ([...to].length !== 1) return undefined;
  return { unit, nfd, to };
}

/**
 * A plain-language note when `pair`'s composed unit stacks exactly two marks
 * from different canonical combining classes — the "two-class stack" case
 * (spec 078, research D9) where `oneMarkShorterPair`'s canonically-last-
 * element peel does not necessarily match the most-recently-typed mark (see
 * `context-variants.ts`'s `addBackspaceUnwrap` doc, "KNOWN LIMITATION 2":
 * Vietnamese circumflex+tone, e.g. "ệ", is the textbook case). `undefined`
 * for a single-mark unit, a two-mark unit whose marks share one class (order
 * is then typing-order-preserving — no ambiguity to disclose), or a 3+-mark
 * unit (not attempted here).
 *
 * Detected without a hardcoded combining-class table: Unicode's canonical
 * ordering is a stable sort by combining class, so re-normalizing the two
 * marks in the OPPOSITE order reproduces the exact same (original) sequence
 * only when the two belong to DIFFERENT classes — same-class marks keep
 * whatever relative order they are handed, so the swapped order survives
 * normalization unchanged (and therefore differs from the original).
 */
export function markOrderNoteFor(pair: OneMarkShorterPair): string | undefined {
  const marks = pair.nfd.slice(1);
  if (marks.length !== 2) return undefined;
  const [m1, m2] = marks as [string, string];
  if (m1 === m2) return undefined;
  const base = pair.nfd[0]!;
  const original = pair.nfd.join("");
  const reversed = (base + m2 + m1).normalize("NFD");
  if (reversed !== original) return undefined;
  return (
    `"${pair.unit}" stacks two marks whose order does not depend on which one was typed first; ` +
    "backspace here always removes them in the same fixed order, which may not match typing order."
  );
}
