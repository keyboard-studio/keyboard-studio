/**
 * touch-mechanism-shared — predicates shared by the IR and raw-JSON touch
 * appliers so their deduplication logic cannot drift.
 *
 * @see applyTouchAssignments.ts       — IR-based applier (Case A)
 * @see applyTouchAssignmentsToRawJson.ts — raw-JSON applier (Case B)
 */

import { charToUnicodeKeyId } from "../codec/touch-ids.js";

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
