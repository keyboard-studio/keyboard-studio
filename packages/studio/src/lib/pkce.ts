// pkce — shared PKCE helpers used by both GitHub and Google OAuth flows.
//
// Previously these lived inside githubOAuth.ts. Extracted here so googleOAuth.ts
// can reuse them without duplication. githubOAuth.ts re-exports from here for
// backwards compat.
//
// Browser-only: uses crypto.subtle / crypto.getRandomValues.

// ---------------------------------------------------------------------------
// base64url helpers
// ---------------------------------------------------------------------------

/** Encode raw bytes as a base64url string (no padding) — RFC 7636 §A. */
function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ---------------------------------------------------------------------------
// PKCE
// ---------------------------------------------------------------------------

/** A PKCE pair: the secret verifier and its derived S256 challenge. */
export interface PkcePair {
  /** code_verifier — 43-128 char base64url string (RFC 7636 §4.1). */
  verifier: string;
  /** code_challenge = base64url(SHA-256(verifier)) (RFC 7636 §4.2). */
  challenge: string;
}

/**
 * Compute the S256 code_challenge for a given verifier.
 *
 * challenge = base64url( SHA-256( ASCII(verifier) ) )
 *
 * Exposed separately from {@link generatePkce} so tests can assert the
 * challenge for a known verifier (RFC 7636 has a canonical test vector).
 */
export async function computeS256Challenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * Generate a fresh PKCE pair.
 *
 * The verifier is 32 random bytes base64url-encoded → 43 chars, comfortably
 * inside the RFC 7636 43-128 range and entirely [A-Za-z0-9-_].
 */
export async function generatePkce(): Promise<PkcePair> {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const verifier = base64UrlEncode(randomBytes);
  const challenge = await computeS256Challenge(verifier);
  return { verifier, challenge };
}
