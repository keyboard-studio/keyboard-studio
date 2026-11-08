/**
 * Who is submitting a managed PR: a signed-in Google or GitHub user.
 *
 * POST /submit/managed-pr requires `Authorization: Bearer <credential>`:
 *
 *  - A Keyboard Studio session token (`kss1.<payload>.<sig>`), issued by the
 *    Google identity exchange when SESSION_SIGNING_KEY is set. Stateless:
 *    HMAC-SHA256 over the base64url payload, checked here with the same key.
 *    Google sign-in leaves the SPA no Google credential (the exchange returns
 *    claims only), so this token is the Google user's proof of sign-in.
 *  - Otherwise, a GitHub user token, checked against GET /user (the same
 *    check the drafts API makes).
 *
 * SECURITY CONTRACT (parity with handlers.ts):
 *  - Neither the signing key nor any presented credential is ever logged or
 *    echoed in a response.
 *  - Signature comparison is constant-time.
 *
 * Bundle safety: this module is reached from /api, so it must not import any
 * `@keyboard-studio/*` package as a value (see api/bundle-safety.test.ts).
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { OAuthFetchFn } from "./handlers.js";

const TOKEN_PREFIX = "kss1";
/** Long enough to cover an authoring session after signing in. */
export const SESSION_TOKEN_TTL_SECONDS = 12 * 60 * 60;

export interface SessionClaims {
  prov: "google";
  sub: string;
  email: string;
  name: string;
  /** Expiry, seconds since the epoch. */
  exp: number;
}

export type Submitter =
  | { provider: "google"; email: string; name: string }
  | { provider: "github"; login: string };

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function sign(payloadB64: string, key: string): Buffer {
  return createHmac("sha256", key).update(`${TOKEN_PREFIX}.${payloadB64}`).digest();
}

/** Issue a session token for a Google identity. `now` is milliseconds. */
export function signSessionToken(
  identity: { sub: string; email: string; name: string },
  key: string,
  now: number = Date.now(),
  ttlSeconds: number = SESSION_TOKEN_TTL_SECONDS,
): string {
  const claims: SessionClaims = {
    prov: "google",
    sub: identity.sub,
    email: identity.email,
    name: identity.name,
    exp: Math.floor(now / 1000) + ttlSeconds,
  };
  const payload = b64url(Buffer.from(JSON.stringify(claims), "utf8"));
  return `${TOKEN_PREFIX}.${payload}.${b64url(sign(payload, key))}`;
}

export function isSessionToken(token: string): boolean {
  return token.startsWith(`${TOKEN_PREFIX}.`);
}

/** Verify a session token; null when malformed, forged or expired. */
export function verifySessionToken(
  token: string,
  key: string,
  now: number = Date.now(),
): SessionClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) return null;
  const [, payload, sig] = parts as [string, string, string];
  const expected = sign(payload, key);
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const c = claims as Partial<SessionClaims>;
  if (
    c.prov !== "google" ||
    typeof c.sub !== "string" ||
    typeof c.email !== "string" ||
    typeof c.name !== "string" ||
    typeof c.exp !== "number"
  ) {
    return null;
  }
  if (c.exp * 1000 <= now) return null;
  return c as SessionClaims;
}

/**
 * Add a `sessionToken` to a Google identity response when signing is
 * configured. Without a key the response is unchanged and Google users
 * cannot submit (the managed-PR route answers 401) until the key is set.
 */
export function withSessionToken<T extends { sub: string; email: string; name: string }>(
  identity: T,
  key: string | null,
  now: number = Date.now(),
): T & { sessionToken?: string } {
  return key === null ? identity : { ...identity, sessionToken: signSessionToken(identity, key, now) };
}

/** The trimmed SESSION_SIGNING_KEY, or null when unset. */
export function sessionSigningKeyFromEnv(): string | null {
  const key = (process.env["SESSION_SIGNING_KEY"] ?? "").trim();
  return key === "" ? null : key;
}

export interface SubmitterAuthConfig {
  /** Null when SESSION_SIGNING_KEY is unset: session tokens are then refused. */
  sessionKey: string | null;
  fetch: OAuthFetchFn;
  now?: () => number;
}

/**
 * Resolve the submitter from an Authorization header value. Null means "not
 * signed in" and maps to 401 `sign_in_required`.
 */
export async function authenticateSubmitter(
  authorization: string | null | undefined,
  config: SubmitterAuthConfig,
): Promise<Submitter | null> {
  if (authorization === null || authorization === undefined) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
  if (match === null) return null;
  const token = match[1] as string;

  if (isSessionToken(token)) {
    if (config.sessionKey === null) return null;
    const claims = verifySessionToken(token, config.sessionKey, (config.now ?? Date.now)());
    return claims === null ? null : { provider: "google", email: claims.email, name: claims.name };
  }

  try {
    const res = await config.fetch("https://api.github.com/user", {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { login?: unknown };
    return typeof data.login === "string" && data.login !== ""
      ? { provider: "github", login: data.login }
      : null;
  } catch {
    return null;
  }
}

/** One provenance line naming how the submitter signed in. */
export function describeSubmitter(submitter: Submitter): string {
  return submitter.provider === "github"
    ? `> Signed in with GitHub as @${submitter.login}.`
    : `> Signed in with Google as ${submitter.email}.`;
}
