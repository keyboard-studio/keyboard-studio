// Structural equality for decision values, shared by the adapt diff and the
// corpus miner.

/**
 * Structural equality for decision values (km/decisions-spike fix 4):
 * primitives via Object.is, arrays element-wise, plain objects by key.
 * Reference equality would mark every array/object answer "changed".
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord);
  const bKeys = Object.keys(bRecord);
  return (
    aKeys.length === bKeys.length &&
    aKeys.every(
      (k) =>
        Object.prototype.hasOwnProperty.call(bRecord, k) &&
        deepEqual(aRecord[k], bRecord[k]),
    )
  );
}
