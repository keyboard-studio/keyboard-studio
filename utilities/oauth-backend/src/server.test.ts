/**
 * Integration tests for the Fastify server routes.
 *
 * Uses buildServer() with an injected stub fetch so no real network calls
 * are made. Tests exercise: body validation, CORS preflight, health, and
 * that secrets never appear in responses.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildServer } from "./server.js";
import type { OAuthFetchFn } from "./handlers.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALLOWED_ORIGIN = "http://localhost:5173";
const DISALLOWED_ORIGIN = "https://evil.example.com";

function stubFetch(response: object, ok = true): OAuthFetchFn {
  return async () => ({
    ok,
    status: ok ? 200 : 400,
    json: async () => response,
  });
}

const successFetch = stubFetch({
  access_token: "gho_test_token",
  token_type: "bearer",
  scope: "public_repo",
});

const errorFetch = stubFetch({ error: "bad_verification_code" }, false);

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Google identity helpers
// ---------------------------------------------------------------------------

const GOOGLE_CLIENT_ID = "ci-google-client-id";

/** Build a minimal valid id_token JWT for use in server-level tests. */
function buildGoogleIdToken(payloadOverrides: Record<string, unknown> = {}): string {
  const header = { alg: "RS256", typ: "JWT" };
  const payload: Record<string, unknown> = {
    sub: "google-sub-12345",
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
  return `${encodeB64url(header)}.${encodeB64url(payload)}.fakesig`;
}

const googleSuccessFetch = stubFetch({ id_token: buildGoogleIdToken() });

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

let app: Awaited<ReturnType<typeof buildServer>>;

beforeAll(async () => {
  app = await buildServer({
    clientId: "ci-client-id",
    clientSecret: "ci-client-secret-SHOULD-NEVER-APPEAR",
    googleOAuthEnabled: true,
    googleClientId: GOOGLE_CLIENT_ID,
    googleClientSecret: "ci-google-client-secret-SHOULD-NEVER-APPEAR",
    allowedOrigins: [ALLOWED_ORIGIN],
    fetchFn: successFetch,
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

// ---------------------------------------------------------------------------
// GET /oauth/health
// ---------------------------------------------------------------------------

describe("GET /oauth/health", () => {
  it("returns 200 { status: ok }", async () => {
    const res = await app.inject({ method: "GET", url: "/oauth/health" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ status: "ok" });
  });
});

// ---------------------------------------------------------------------------
// POST /oauth/exchange — body validation
// ---------------------------------------------------------------------------

describe("POST /oauth/exchange — body validation", () => {
  it("returns 400 when body is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/oauth/exchange",
      headers: { "content-type": "application/json" },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { error: string };
    expect(body.error).toBe("invalid_request");
  });

  it("returns 400 when code is empty string", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/oauth/exchange",
      payload: { code: "" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when redirect_uri is not a valid URL", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/oauth/exchange",
      payload: { code: "abc", redirect_uri: "not-a-url" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("400 details do NOT echo the submitted invalid value", async () => {
    const submittedBadUrl = "not-a-url-SUBMITTED_VALUE";
    const res = await app.inject({
      method: "POST",
      url: "/oauth/exchange",
      payload: { code: "abc", redirect_uri: submittedBadUrl },
    });
    expect(res.statusCode).toBe(400);
    // The response body must never contain the submitted value
    expect(res.body).not.toContain(submittedBadUrl);
    expect(res.body).not.toContain("not-a-url");
    // But it should contain a static description mentioning the field
    const body = JSON.parse(res.body) as { details?: string[] };
    expect(body.details).toBeDefined();
    expect(body.details![0]).toContain("redirect_uri");
  });

  it("returns 200 with access_token on valid exchange", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/oauth/exchange",
      payload: { code: "github-code-abc" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      access_token: string;
      token_type: string;
      scope: string;
    };
    expect(body.access_token).toBe("gho_test_token");
    expect(body.scope).toBe("public_repo");
  });
});

// ---------------------------------------------------------------------------
// POST /oauth/exchange — secret never leaks
// ---------------------------------------------------------------------------

describe("POST /oauth/exchange — secret leakage", () => {
  it("does not include client secret in success response body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/oauth/exchange",
      payload: { code: "some-code" },
    });
    expect(res.body).not.toContain("ci-client-secret-SHOULD-NEVER-APPEAR");
  });

  it("does not include client secret in error response body", async () => {
    // Build a separate server wired with the error fetch
    const errApp = await buildServer({
      clientId: "ci-client-id",
      clientSecret: "ci-client-secret-SHOULD-NEVER-APPEAR",
      googleOAuthEnabled: false,
      allowedOrigins: [ALLOWED_ORIGIN],
      fetchFn: errorFetch,
    });
    await errApp.ready();

    const res = await errApp.inject({
      method: "POST",
      url: "/oauth/exchange",
      payload: { code: "bad-code" },
    });
    expect(res.body).not.toContain("ci-client-secret-SHOULD-NEVER-APPEAR");
    expect(res.statusCode).toBe(400);

    await errApp.close();
  });
});

// ---------------------------------------------------------------------------
// POST /oauth/exchange — upstream 4xx/5xx with no error field → 502
// ---------------------------------------------------------------------------

describe("POST /oauth/exchange — upstream gateway errors", () => {
  it("returns 502 upstream_error when GitHub responds non-ok without error field", async () => {
    const rateLimitFetch: OAuthFetchFn = async () => ({
      ok: false,
      status: 429,
      json: async () => ({ message: "rate limited" }),
    });
    const gatewayApp = await buildServer({
      clientId: "ci-client-id",
      clientSecret: "ci-client-secret-SHOULD-NEVER-APPEAR",
      googleOAuthEnabled: false,
      allowedOrigins: [ALLOWED_ORIGIN],
      fetchFn: rateLimitFetch,
    });
    await gatewayApp.ready();

    const res = await gatewayApp.inject({
      method: "POST",
      url: "/oauth/exchange",
      payload: { code: "some-code" },
    });
    expect(res.statusCode).toBe(502);
    const body = JSON.parse(res.body) as { error: string };
    expect(body.error).toBe("upstream_error");

    await gatewayApp.close();
  });
});

// ---------------------------------------------------------------------------
// POST /oauth/refresh — body validation
// ---------------------------------------------------------------------------

describe("POST /oauth/refresh — body validation", () => {
  it("returns 400 when refresh_token is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/oauth/refresh",
      headers: { "content-type": "application/json" },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 200 with access_token on valid refresh", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/oauth/refresh",
      payload: { refresh_token: "ghr_some_refresh_token" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { access_token: string };
    expect(body.access_token).toBe("gho_test_token");
  });

  it("forwards a rotated refresh_token when GitHub returns one", async () => {
    const rotationFetch: OAuthFetchFn = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: "gho_new_access",
        token_type: "bearer",
        scope: "public_repo",
        refresh_token: "ghr_new_rotated",
      }),
    });
    const rotationApp = await buildServer({
      clientId: "ci-client-id",
      clientSecret: "ci-client-secret-SHOULD-NEVER-APPEAR",
      googleOAuthEnabled: false,
      allowedOrigins: [ALLOWED_ORIGIN],
      fetchFn: rotationFetch,
    });
    await rotationApp.ready();

    const res = await rotationApp.inject({
      method: "POST",
      url: "/oauth/refresh",
      payload: { refresh_token: "ghr_old_token" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { access_token: string; refresh_token?: string };
    expect(body.access_token).toBe("gho_new_access");
    expect(body.refresh_token).toBe("ghr_new_rotated");
    // Client secret must never appear
    expect(res.body).not.toContain("ci-client-secret-SHOULD-NEVER-APPEAR");

    await rotationApp.close();
  });
});

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

describe("CORS preflight", () => {
  it("allows preflight from an allowed origin", async () => {
    const res = await app.inject({
      method: "OPTIONS",
      url: "/oauth/exchange",
      headers: {
        Origin: ALLOWED_ORIGIN,
        "Access-Control-Request-Method": "POST",
      },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(ALLOWED_ORIGIN);
  });

  it("rejects preflight from a disallowed origin with non-500 and no ACAO header", async () => {
    const res = await app.inject({
      method: "OPTIONS",
      url: "/oauth/exchange",
      headers: {
        Origin: DISALLOWED_ORIGIN,
        "Access-Control-Request-Method": "POST",
      },
    });
    // Must NOT be a server error — cb(null, false) produces a clean rejection
    expect(res.statusCode).not.toBe(500);
    // Must NOT grant the disallowed origin or wildcard
    const acaoHeader = res.headers["access-control-allow-origin"] as string | undefined;
    expect(acaoHeader).not.toBe(DISALLOWED_ORIGIN);
    expect(acaoHeader).not.toBe("*");
  });
});

// ---------------------------------------------------------------------------
// POST /oauth/google/exchange — body validation
// ---------------------------------------------------------------------------

describe("POST /oauth/google/exchange — body validation", () => {
  let googleApp: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    googleApp = await buildServer({
      clientId: "ci-client-id",
      clientSecret: "ci-client-secret-SHOULD-NEVER-APPEAR",
      googleOAuthEnabled: true,
      googleClientId: GOOGLE_CLIENT_ID,
      googleClientSecret: "ci-google-client-secret-SHOULD-NEVER-APPEAR",
      allowedOrigins: [ALLOWED_ORIGIN],
      fetchFn: googleSuccessFetch,
    });
    await googleApp.ready();
  });

  afterAll(async () => {
    await googleApp.close();
  });

  it("returns 400 when body is missing all required fields", async () => {
    const res = await googleApp.inject({
      method: "POST",
      url: "/oauth/google/exchange",
      headers: { "content-type": "application/json" },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { error: string };
    expect(body.error).toBe("invalid_request");
  });

  it("returns 400 when code is empty string", async () => {
    const res = await googleApp.inject({
      method: "POST",
      url: "/oauth/google/exchange",
      payload: {
        code: "",
        code_verifier: "verifier",
        redirect_uri: "http://localhost:5173/callback",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when code_verifier is missing", async () => {
    const res = await googleApp.inject({
      method: "POST",
      url: "/oauth/google/exchange",
      payload: {
        code: "some-code",
        redirect_uri: "http://localhost:5173/callback",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when redirect_uri is not a valid URL", async () => {
    const res = await googleApp.inject({
      method: "POST",
      url: "/oauth/google/exchange",
      payload: {
        code: "some-code",
        code_verifier: "verifier",
        redirect_uri: "not-a-url",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 200 identity claims on valid exchange", async () => {
    const res = await googleApp.inject({
      method: "POST",
      url: "/oauth/google/exchange",
      payload: {
        code: "google-auth-code",
        code_verifier: "pkce-verifier",
        redirect_uri: "http://localhost:5173/callback",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      sub: string;
      email: string;
      email_verified: boolean;
      name: string;
      picture: string;
    };
    expect(body.sub).toBe("google-sub-12345");
    expect(body.email).toBe("user@example.com");
    expect(body.email_verified).toBe(true);
    expect(body.name).toBe("Test User");
    expect(typeof body.picture).toBe("string");
  });

  it("response does NOT contain access_token or id_token fields", async () => {
    const res = await googleApp.inject({
      method: "POST",
      url: "/oauth/google/exchange",
      payload: {
        code: "google-auth-code",
        code_verifier: "pkce-verifier",
        redirect_uri: "http://localhost:5173/callback",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as Record<string, unknown>;
    expect(body["access_token"]).toBeUndefined();
    expect(body["id_token"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// POST /oauth/google/exchange — secret never leaks
// ---------------------------------------------------------------------------

describe("POST /oauth/google/exchange — secret leakage", () => {
  it("does not include Google client secret in success response", async () => {
    const secretApp = await buildServer({
      clientId: "ci-client-id",
      clientSecret: "ci-client-secret",
      googleOAuthEnabled: true,
      googleClientId: GOOGLE_CLIENT_ID,
      googleClientSecret: "ci-google-secret-SHOULD-NEVER-APPEAR",
      allowedOrigins: [ALLOWED_ORIGIN],
      fetchFn: googleSuccessFetch,
    });
    await secretApp.ready();

    const res = await secretApp.inject({
      method: "POST",
      url: "/oauth/google/exchange",
      payload: {
        code: "some-code",
        code_verifier: "verifier",
        redirect_uri: "http://localhost:5173/callback",
      },
    });
    expect(res.body).not.toContain("ci-google-secret-SHOULD-NEVER-APPEAR");

    await secretApp.close();
  });

  it("does not include Google client secret in error response", async () => {
    const errFetch: OAuthFetchFn = async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: "invalid_grant" }),
    });
    const secretErrApp = await buildServer({
      clientId: "ci-client-id",
      clientSecret: "ci-client-secret",
      googleOAuthEnabled: true,
      googleClientId: GOOGLE_CLIENT_ID,
      googleClientSecret: "ci-google-secret-SHOULD-NEVER-APPEAR",
      allowedOrigins: [ALLOWED_ORIGIN],
      fetchFn: errFetch,
    });
    await secretErrApp.ready();

    const res = await secretErrApp.inject({
      method: "POST",
      url: "/oauth/google/exchange",
      payload: {
        code: "bad-code",
        code_verifier: "verifier",
        redirect_uri: "http://localhost:5173/callback",
      },
    });
    expect(res.body).not.toContain("ci-google-secret-SHOULD-NEVER-APPEAR");
    expect(res.statusCode).toBe(400);

    await secretErrApp.close();
  });
});

// ---------------------------------------------------------------------------
// POST /oauth/google/exchange — CORS parity
// ---------------------------------------------------------------------------

describe("POST /oauth/google/exchange — CORS parity", () => {
  let corsApp: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    corsApp = await buildServer({
      clientId: "ci-client-id",
      clientSecret: "ci-client-secret",
      googleOAuthEnabled: true,
      googleClientId: GOOGLE_CLIENT_ID,
      googleClientSecret: "ci-google-client-secret",
      allowedOrigins: [ALLOWED_ORIGIN],
      fetchFn: googleSuccessFetch,
    });
    await corsApp.ready();
  });

  afterAll(async () => {
    await corsApp.close();
  });

  it("allows preflight from an allowed origin", async () => {
    const res = await corsApp.inject({
      method: "OPTIONS",
      url: "/oauth/google/exchange",
      headers: {
        Origin: ALLOWED_ORIGIN,
        "Access-Control-Request-Method": "POST",
      },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(ALLOWED_ORIGIN);
  });

  it("rejects preflight from a disallowed origin with no ACAO header", async () => {
    const res = await corsApp.inject({
      method: "OPTIONS",
      url: "/oauth/google/exchange",
      headers: {
        Origin: DISALLOWED_ORIGIN,
        "Access-Control-Request-Method": "POST",
      },
    });
    expect(res.statusCode).not.toBe(500);
    const acaoHeader = res.headers["access-control-allow-origin"] as string | undefined;
    expect(acaoHeader).not.toBe(DISALLOWED_ORIGIN);
    expect(acaoHeader).not.toBe("*");
  });
});

// ---------------------------------------------------------------------------
// Google identity disabled — GitHub-only deployment
// ---------------------------------------------------------------------------

describe("Google identity disabled (GitHub-only deployment)", () => {
  let ghOnlyApp: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    // No Google credentials supplied — mirrors an existing GitHub-only operator
    // upgrading without configuring Google. The server must still build.
    ghOnlyApp = await buildServer({
      clientId: "ci-client-id",
      clientSecret: "ci-client-secret",
      googleOAuthEnabled: false,
      allowedOrigins: [ALLOWED_ORIGIN],
      fetchFn: successFetch,
    });
    await ghOnlyApp.ready();
  });

  afterAll(async () => {
    await ghOnlyApp.close();
  });

  it("does not register /oauth/google/exchange (returns 404)", async () => {
    const res = await ghOnlyApp.inject({
      method: "POST",
      url: "/oauth/google/exchange",
      payload: {
        code: "google-auth-code",
        code_verifier: "pkce-verifier",
        redirect_uri: "http://localhost:5173/callback",
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it("still serves the GitHub exchange route", async () => {
    const res = await ghOnlyApp.inject({
      method: "POST",
      url: "/oauth/exchange",
      payload: { code: "github-code-abc" },
    });
    expect(res.statusCode).toBe(200);
  });
});
