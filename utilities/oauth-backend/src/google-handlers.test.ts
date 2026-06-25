/**
 * Unit tests for the Google OAuth handler logic in google-handlers.ts.
 *
 * All tests use an injected stub fetch function — no real network calls.
 */

import { describe, it, expect } from "vitest";
import {
  googleExchange,
  decodeIdTokenPayload,
  validateIdTokenClaims,
  type GoogleHandlerConfig,
} from "./google-handlers.js";
import type { OAuthFetchFn } from "./handlers.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GOOGLE_CLIENT_ID = "test-google-client-id";
const GOOGLE_CLIENT_SECRET = "test-google-client-secret-SHOULD-NEVER-LEAK";

function makeConfig(fetchFn: OAuthFetchFn): GoogleHandlerConfig {
  return {
    googleClientId: GOOGLE_CLIENT_ID,
    googleClientSecret: GOOGLE_CLIENT_SECRET,
    fetch: fetchFn,
  };
}

function stubFetch(response: object, ok = true, status = 200): OAuthFetchFn {
  return async (_url, _init) => ({
    ok,
    status,
    json: async () => response,
  });
}

/** Build a minimal valid id_token JWT with the given payload overrides. */
function buildIdToken(payloadOverrides: Record<string, unknown> = {}): string {
  const header = { alg: "RS256", typ: "JWT" };
  const payload: Record<string, unknown> = {
    sub: "12345678901234567890",
    email: "user@example.com",
    email_verified: true,
    name: "Test User",
    picture: "https://example.com/photo.jpg",
    iss: "https://accounts.google.com",
    aud: GOOGLE_CLIENT_ID,
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...payloadOverrides,
  };
  const encodeB64url = (obj: object) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

  return `${encodeB64url(header)}.${encodeB64url(payload)}.fakesignature`;
}

const VALID_EXCHANGE_BODY = {
  code: "google-auth-code-xyz",
  code_verifier: "pkce-verifier-abc",
  redirect_uri: "http://localhost:5173/callback",
};

// ---------------------------------------------------------------------------
// decodeIdTokenPayload() — pure helper
// ---------------------------------------------------------------------------

describe("decodeIdTokenPayload()", () => {
  it("returns parsed payload for a valid JWT", () => {
    const token = buildIdToken();
    const payload = decodeIdTokenPayload(token);
    expect(payload).not.toBeNull();
    expect(payload?.email).toBe("user@example.com");
    expect(payload?.sub).toBe("12345678901234567890");
  });

  it("returns null for a string with wrong number of segments", () => {
    expect(decodeIdTokenPayload("only.two")).toBeNull();
    expect(decodeIdTokenPayload("one")).toBeNull();
  });

  it("returns null for a segment that is not valid base64url JSON", () => {
    expect(decodeIdTokenPayload("header.!!!not_base64.sig")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validateIdTokenClaims() — pure helper
// ---------------------------------------------------------------------------

describe("validateIdTokenClaims()", () => {
  function makePayload(overrides: Record<string, unknown> = {}) {
    return {
      sub: "123",
      email: "user@example.com",
      email_verified: true,
      name: "Test User",
      picture: "https://example.com/photo.jpg",
      iss: "https://accounts.google.com",
      aud: GOOGLE_CLIENT_ID,
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...overrides,
    };
  }

  it("returns null (passes) for a valid payload", () => {
    expect(validateIdTokenClaims(makePayload(), GOOGLE_CLIENT_ID)).toBeNull();
  });

  it("also accepts iss=accounts.google.com (without https://)", () => {
    expect(
      validateIdTokenClaims(makePayload({ iss: "accounts.google.com" }), GOOGLE_CLIENT_ID)
    ).toBeNull();
  });

  it("returns invalid_id_token when aud does not match client id", () => {
    expect(
      validateIdTokenClaims(makePayload({ aud: "other-client-id" }), GOOGLE_CLIENT_ID)
    ).toBe("invalid_id_token");
  });

  it("returns invalid_id_token for wrong iss", () => {
    expect(
      validateIdTokenClaims(makePayload({ iss: "https://evil.example.com" }), GOOGLE_CLIENT_ID)
    ).toBe("invalid_id_token");
  });

  it("returns invalid_id_token when exp is in the past", () => {
    const expiredExp = Math.floor(Date.now() / 1000) - 10;
    expect(
      validateIdTokenClaims(makePayload({ exp: expiredExp }), GOOGLE_CLIENT_ID)
    ).toBe("invalid_id_token");
  });

  it("returns invalid_id_token when exp is missing", () => {
    expect(
      validateIdTokenClaims(makePayload({ exp: undefined }), GOOGLE_CLIENT_ID)
    ).toBe("invalid_id_token");
  });
});

// ---------------------------------------------------------------------------
// googleExchange()
// ---------------------------------------------------------------------------

describe("googleExchange()", () => {
  it("returns identity claims on success", async () => {
    const fetch = stubFetch({ id_token: buildIdToken() });

    const result = await googleExchange(VALID_EXCHANGE_BODY, makeConfig(fetch));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data.sub).toBe("12345678901234567890");
    expect(result.data.email).toBe("user@example.com");
    expect(result.data.email_verified).toBe(true);
    expect(result.data.name).toBe("Test User");
    expect(result.data.picture).toBe("https://example.com/photo.jpg");
  });

  it("sends request to Google token endpoint as application/x-www-form-urlencoded", async () => {
    const captured: { url?: string; body?: string; headers?: Record<string, string> } = {};
    const fetch: OAuthFetchFn = async (url, init) => {
      captured.url = url;
      captured.body = init?.body;
      captured.headers = init?.headers;
      return {
        ok: true,
        status: 200,
        json: async () => ({ id_token: buildIdToken() }),
      };
    };

    await googleExchange(VALID_EXCHANGE_BODY, makeConfig(fetch));

    expect(captured.url).toBe("https://oauth2.googleapis.com/token");
    expect(captured.headers?.["Content-Type"]).toBe("application/x-www-form-urlencoded");
    const params = new URLSearchParams(captured.body ?? "");
    expect(params.get("grant_type")).toBe("authorization_code");
    expect(params.get("code")).toBe("google-auth-code-xyz");
    expect(params.get("code_verifier")).toBe("pkce-verifier-abc");
    expect(params.get("redirect_uri")).toBe("http://localhost:5173/callback");
    expect(params.get("client_id")).toBe(GOOGLE_CLIENT_ID);
  });

  it("returns 400 invalid_grant when Google returns an error for a bad code", async () => {
    const fetch = stubFetch({ error: "invalid_grant" }, false, 400);

    const result = await googleExchange(VALID_EXCHANGE_BODY, makeConfig(fetch));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(400);
    expect(result.error).toBe("invalid_grant");
  });

  it("returns 400 google_error for unknown Google error strings", async () => {
    const fetch = stubFetch({ error: "some_unknown_google_error" }, false, 400);

    const result = await googleExchange(VALID_EXCHANGE_BODY, makeConfig(fetch));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toBe("google_error");
  });

  it("returns 502 when fetch throws a network error", async () => {
    const fetch: OAuthFetchFn = async () => {
      throw new Error("ECONNREFUSED");
    };

    const result = await googleExchange(VALID_EXCHANGE_BODY, makeConfig(fetch));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(502);
    expect(result.error).toBe("upstream_unavailable");
  });

  it("returns 502 upstream_error when Google responds non-ok with no error field", async () => {
    const fetch: OAuthFetchFn = async () => ({
      ok: false,
      status: 500,
      json: async () => ({ message: "internal server error" }),
    });

    const result = await googleExchange(VALID_EXCHANGE_BODY, makeConfig(fetch));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(502);
    expect(result.error).toBe("upstream_error");
  });

  it("returns 400 invalid_id_token when id_token has wrong aud", async () => {
    const badToken = buildIdToken({ aud: "wrong-client-id" });
    const fetch = stubFetch({ id_token: badToken });

    const result = await googleExchange(VALID_EXCHANGE_BODY, makeConfig(fetch));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(400);
    expect(result.error).toBe("invalid_id_token");
  });

  it("returns 400 invalid_id_token when id_token has wrong iss", async () => {
    const badToken = buildIdToken({ iss: "https://evil.example.com" });
    const fetch = stubFetch({ id_token: badToken });

    const result = await googleExchange(VALID_EXCHANGE_BODY, makeConfig(fetch));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(400);
    expect(result.error).toBe("invalid_id_token");
  });

  it("returns 400 invalid_id_token when id_token is expired", async () => {
    const expiredToken = buildIdToken({ exp: Math.floor(Date.now() / 1000) - 10 });
    const fetch = stubFetch({ id_token: expiredToken });

    const result = await googleExchange(VALID_EXCHANGE_BODY, makeConfig(fetch));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(400);
    expect(result.error).toBe("invalid_id_token");
  });

  it("returns 502 upstream_invalid_response when id_token is malformed", async () => {
    const fetch = stubFetch({ id_token: "not.a.valid.jwt.at.all.extra" });

    const result = await googleExchange(VALID_EXCHANGE_BODY, makeConfig(fetch));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(502);
    expect(result.error).toBe("upstream_invalid_response");
  });

  it("does NOT include GOOGLE_CLIENT_SECRET in the success response", async () => {
    const fetch = stubFetch({ id_token: buildIdToken() });

    const result = await googleExchange(VALID_EXCHANGE_BODY, makeConfig(fetch));

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(GOOGLE_CLIENT_SECRET);
  });

  it("does NOT include the authorization code in the response", async () => {
    const fetch = stubFetch({ id_token: buildIdToken() });

    const result = await googleExchange(
      { ...VALID_EXCHANGE_BODY, code: "SUPER_SECRET_GOOGLE_CODE_VALUE" },
      makeConfig(fetch)
    );

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("SUPER_SECRET_GOOGLE_CODE_VALUE");
  });

  it("does NOT include id_token or access_token in the success response", async () => {
    const idToken = buildIdToken();
    const fetch = stubFetch({ id_token: idToken, access_token: "ya29.google_access_token" });

    const result = await googleExchange(VALID_EXCHANGE_BODY, makeConfig(fetch));

    const serialized = JSON.stringify(result);
    // The raw id_token JWT should never appear in the response
    expect(serialized).not.toContain(idToken);
    // The access_token should never be forwarded
    expect(serialized).not.toContain("ya29.google_access_token");
  });
});
