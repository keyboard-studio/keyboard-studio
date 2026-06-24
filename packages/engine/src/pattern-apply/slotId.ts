/**
 * Parse a store-slot deletion id of the form "<storeNodeId>#<itemsIndex>".
 * itemsIndex is 0-based into IRStore.items. Returns null if the id is not a slot id.
 */

/** Regex that matches a slot id: "<storeNodeId>#<itemsIndex>". */
const SLOT_ID_RE = /^(.+)#(\d+)$/;

/**
 * Parse a store-slot deletion id of the form `"<storeNodeId>#<itemsIndex>"`.
 *
 * The storeNodeId capture is greedy — the last `#` in the string is the
 * separator, so a storeNodeId that itself contains `#` (e.g. `"store#dkt"`)
 * is handled correctly. The trailing `\d+$` anchor disambiguates.
 *
 * @param id  The raw slot id string.
 * @returns   `{ storeNodeId, itemsIndex }` when the id is well-formed,
 *            or `null` when it has no `#`, or when the part after the last
 *            `#` is not a non-negative integer.
 */
export function parseSlotId(id: string): { storeNodeId: string; itemsIndex: number } | null {
  const match = SLOT_ID_RE.exec(id);
  if (match === null || match[1] === undefined || match[2] === undefined) {
    return null;
  }
  return {
    storeNodeId: match[1],
    itemsIndex: parseInt(match[2], 10),
  };
}
