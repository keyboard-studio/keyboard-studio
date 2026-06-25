/**
 * Zod request/response schemas for the Google OAuth identity-exchange endpoint.
 *
 * Google is identity-only — no Google API access is needed after exchange.
 * The id_token payload carries the identity claims; the access_token is
 * never forwarded to the SPA.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// POST /oauth/google/exchange
// ---------------------------------------------------------------------------

export const GoogleExchangeBodySchema = z.object({
  /** The one-time authorization code from Google's redirect. */
  code: z.string().min(1),
  /** PKCE code verifier (S256 flow). Required for PKCE exchanges. */
  code_verifier: z.string().min(1),
  /** Redirect URI used in the original authorization request. */
  redirect_uri: z.string().url(),
});

export type GoogleExchangeBody = z.infer<typeof GoogleExchangeBodySchema>;

// ---------------------------------------------------------------------------
// 200 identity response returned to the SPA
// ---------------------------------------------------------------------------

/**
 * The identity claims returned to the SPA on a successful Google exchange.
 *
 * These are decoded from the id_token Google returns. Neither the id_token
 * nor the access_token is ever forwarded to the SPA.
 */
export interface GoogleIdentity {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  picture: string;
}

// ---------------------------------------------------------------------------
// Internal: shape of the Google token endpoint response
// ---------------------------------------------------------------------------

export interface GoogleTokenResponseShape {
  id_token?: string;
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

// ---------------------------------------------------------------------------
// Internal: decoded id_token payload claims we care about
// ---------------------------------------------------------------------------

export interface GoogleIdTokenPayload {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  iss?: string;
  aud?: string;
  exp?: number;
}
