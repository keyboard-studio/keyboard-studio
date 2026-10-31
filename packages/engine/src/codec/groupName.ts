/**
 * Keyman group names are case-insensitive: kmcmplib rejects `group(main)`
 * after `group(Main)` as a duplicate definition, and `use(main)` resolves to
 * `group(Main)`. Compare group names with this, never with `===`.
 */
export function sameGroupName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
