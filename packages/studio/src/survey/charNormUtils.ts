/**
 * Shared NFC-dedup utilities for Phase B character handling.
 * Pure functions — no React dependencies, no side effects.
 */

/**
 * NFC-normalize each element of `incoming`, append to `base` skipping
 * anything already present (first-appearance order preserved).
 *
 * Empty strings (after NFC normalization) are silently dropped.
 */
export function nfcDedup(base: string[], incoming: string[]): string[] {
  const seen = new Set<string>(base);
  const result = [...base];
  for (const raw of incoming) {
    const nfc = raw.normalize("NFC");
    if (nfc.length > 0 && !seen.has(nfc)) {
      seen.add(nfc);
      result.push(nfc);
    }
  }
  return result;
}
