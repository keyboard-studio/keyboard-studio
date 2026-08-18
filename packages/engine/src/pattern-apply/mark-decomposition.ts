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
