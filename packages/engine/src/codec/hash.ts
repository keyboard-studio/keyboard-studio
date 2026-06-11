/**
 * SHA-256 helper using the Web Crypto API (available in browsers and Node.js ≥ 15).
 *
 * Pure function — no I/O side effects.
 */

/**
 * Compute the SHA-256 digest of `text` (UTF-8 encoded) and return it as a
 * lower-case hex string.
 *
 * Uses `globalThis.crypto.subtle` so it works in both browser and Node.js
 * environments without any additional dependencies.
 */
export async function computeSha256Hex(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text);
  const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
