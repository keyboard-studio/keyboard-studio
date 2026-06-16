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

let app: Awaited<ReturnType<typeof buildServer>>;

beforeAll(async () => {
  app = await buildServer({
    clientId: "ci-client-id",
    clientSecret: "ci-client-secret-SHOULD-NEVER-APPEAR",
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
