/**
 * touch-mechanism-shared — predicates shared by the IR and raw-JSON touch
 * appliers so their deduplication logic cannot drift.
 *
 * @see applyTouchAssignments.ts       — IR-based applier (Case A)
 * @see applyTouchAssignmentsToRawJson.ts — raw-JSON applier (Case B)
 * @see applyDesktopModifications.ts       — IR-based desktop-modification replay
 * @see applyDesktopModificationsToRawJson.ts — raw-JSON desktop-modification replay
 */

import { charToUnicodeKeyId, unicodeKeyIdToChar } from "../shared/touch-ids.js";

/**
 * Return `true` when an existing sub-key (sk[] or multitap[] entry) already
 * represents `char` — either by its displayed text/output value OR by a
 * `U_<HEX>` id that maps to the same code point.
 *
 * Real shipped layouts sometimes carry id-only entries (e.g. `{ id: "U_00E2" }`
 * with no `text` or `output`); the text/output-only test misses those, causing
 * a duplicate to be appended on the next apply.  This predicate covers both.
 *
 * @param existing  An sk[] or multitap[] element from a parsed touch layout.
 * @param char      The character being applied (e.g. "â").
 */
export function isTouchSubKeyDuplicate(
  existing: { text?: string; output?: string; id?: string },
  char: string,
): boolean {
  return (
    (existing.text ?? existing.output) === char ||
    existing.id === charToUnicodeKeyId(char)
  );
}

/**
 * Build the canonical (NFC) removal-membership set from a Phase D carve
 * `removals` list, shared by both `applyDesktopModifications` variants so
 * neither builds its own normalization pass (spec 035 contracts/seed-derivation.md
 * clause 2 — "matching is canonical").
 */
export function buildRemovalSet(removals: readonly string[]): Set<string> {
  return new Set(removals.map((c) => c.normalize("NFC")));
}

/**
 * Return `true` when a key/sub-key candidate — via its `text`, `output`, or a
 * `U_<HEX>`-decoded `id` — produces a character in `removalSet`.
 *
 * Matching is canonical: every candidate string is NFC-normalized before
 * comparison against `removalSet` (which is itself NFC — see
 * {@link buildRemovalSet}), so an NFD-stored occurrence of a carved char
 * (base + combining mark) is still matched even though `removalSet` entries
 * are precomposed (spec 035 contracts/seed-derivation.md clause 2).
 *
 * @param candidate   A TouchKeyIR (or raw-JSON key/sub-key) shape.
 * @param removalSet  NFC-normalized removal set from {@link buildRemovalSet}.
 */
export function keyMatchesRemovalSet(
  candidate: { text?: string; output?: string; id?: string },
  removalSet: ReadonlySet<string>,
): boolean {
  if (candidate.text !== undefined && removalSet.has(candidate.text.normalize("NFC"))) {
    return true;
  }
  if (candidate.output !== undefined && removalSet.has(candidate.output.normalize("NFC"))) {
    return true;
  }
  const decoded = candidate.id !== undefined ? unicodeKeyIdToChar(candidate.id) : undefined;
  return decoded !== undefined && removalSet.has(decoded.normalize("NFC"));
}
