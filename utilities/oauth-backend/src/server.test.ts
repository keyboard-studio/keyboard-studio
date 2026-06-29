/**
 * Integration tests for the Fastify server routes.
 *
 * Uses buildServer() with an injected stub fetch so no real network calls
 * are made. Tests exercise: body validation, CORS preflight, health, and
 * that secrets never appear in responses.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildServer } from "./server.js";
import type { GitHubPipelineFetchFn } from "./github-pipeline.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALLOWED_ORIGIN = "http://localhost:5173";
const DISALLOWED_ORIGIN = "https://evil.example.com";

function stubFetch(response: object, ok = true): GitHubPipelineFetchFn {
  return async () => ({
    ok,
    status: ok ? 200 : 400,
    statusText: ok ? "OK" : "Bad Request",
    headers: { get: () => null },
    json: async () => response,
    text: async () => JSON.stringify(response),
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
    // Build a separate server wired with the error fetch; errorFetch already
    // satisfies GitHubPipelineFetchFn via the updated stubFetch() helper.
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
    const rateLimitFetch: GitHubPipelineFetchFn = async () => ({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      headers: { get: () => null },
      json: async () => ({ message: "rate limited" }),
      text: async () => '{"message":"rate limited"}',
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
    const rotationFetch: GitHubPipelineFetchFn = async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => null },
      json: async () => ({
        access_token: "gho_new_access",
        token_type: "bearer",
        scope: "public_repo",
        refresh_token: "ghr_new_rotated",
      }),
      text: async () => "{}",
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
    const errFetch: GitHubPipelineFetchFn = async () => ({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      headers: { get: () => null },
      json: async () => ({ error: "invalid_grant" }),
      text: async () => '{"error":"invalid_grant"}',
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
// POST /submit/managed-pr — Option B org-mediated submission
// ---------------------------------------------------------------------------

const INSTALLATION_TOKEN = "ghs_INSTALLATION_TOKEN_SHOULD_NEVER_APPEAR";
const ORG_LOGIN = "keyboard-studio-bot";

/** Build a minimal pipeline-compatible ok response. */
function pipelineOk(body: object, status = 200): Awaited<ReturnType<GitHubPipelineFetchFn>> {
  return {
    ok: true,
    status,
    statusText: "OK",
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/** Multi-call fetch stub that walks the managed-PR pipeline happy path. */
const managedPipelineFetch: GitHubPipelineFetchFn = async (url, init) => {
  const method = init?.method ?? "GET";
  if (url.endsWith("/forks") && method === "POST") return pipelineOk({}, 202);
  if (url.includes("/git/ref/heads/master")) return pipelineOk({ object: { sha: "masterSha" } });
  if (url.includes("/git/commits/masterSha")) return pipelineOk({ tree: { sha: "treeSha" } });
  if (url.endsWith("/git/trees") && method === "POST") return pipelineOk({ sha: "newTree" });
  if (url.endsWith("/git/commits") && method === "POST")
    return pipelineOk({ sha: "abc1234000000000000000000000000000000000" });
  if (url.endsWith("/git/refs") && method === "POST") return pipelineOk({ ref: "ok" }, 201);
  if (url.endsWith("/pulls") && method === "POST")
    return pipelineOk({ html_url: "https://github.com/keymanapp/keyboards/pull/77" }, 201);
  return pipelineOk({ full_name: `${ORG_LOGIN}/keyboards` }); // fork-exists GET
};

function validManagedBody(overrides: Record<string, unknown> = {}) {
  return {
    attribution: { displayName: "Ada Lovelace", email: "ada@example.com" },
    keyboardId: "my_keyboard",
    prTitle: "[my_keyboard] Add it",
    prBody: "## Checklist\n- green",
    sourceFiles: [{ path: "release/m/my_keyboard/my_keyboard.kmn", content: "store(&VERSION) '14.0'" }],
    ...overrides,
  };
}

async function buildManagedServer(fetchFn: GitHubPipelineFetchFn = managedPipelineFetch) {
  const srv = await buildServer({
    clientId: "ci-client-id",
    clientSecret: "ci-client-secret",
    googleOAuthEnabled: false,
    getInstallationToken: () => Promise.resolve(INSTALLATION_TOKEN),
    orgLogin: ORG_LOGIN,
    allowedOrigins: [ALLOWED_ORIGIN],
    fetchFn,
  });
  await srv.ready();
  return srv;
}

describe("POST /submit/managed-pr — config gating", () => {
  it("returns 503 submission_not_configured when org credentials are absent", async () => {
    const unconfigured = await buildServer({
      clientId: "ci-client-id",
      clientSecret: "ci-client-secret",
      googleOAuthEnabled: false,
      allowedOrigins: [ALLOWED_ORIGIN],
      fetchFn: successFetch,
    });
    await unconfigured.ready();
    const res = await unconfigured.inject({
      method: "POST",
      url: "/submit/managed-pr",
      payload: validManagedBody(),
    });
    expect(res.statusCode).toBe(503);
    expect((JSON.parse(res.body) as { error: string }).error).toBe("submission_not_configured");
    await unconfigured.close();
  });
});

describe("POST /submit/managed-pr — body validation", () => {
  let mApp: Awaited<ReturnType<typeof buildServer>>;
  beforeAll(async () => {
    mApp = await buildManagedServer();
  });
  afterAll(async () => {
    await mApp.close();
  });

  it("returns 400 when attribution email is malformed", async () => {
    const res = await mApp.inject({
      method: "POST",
      url: "/submit/managed-pr",
      payload: validManagedBody({
        attribution: { displayName: "Ada", email: "not-an-email" },
      }),
    });
    expect(res.statusCode).toBe(400);
    expect((JSON.parse(res.body) as { error: string }).error).toBe("invalid_request");
  });

  it("returns 400 when sourceFiles exceeds the 50-file cap", async () => {
    const tooMany = Array.from({ length: 51 }, (_, i) => ({
      path: `release/m/my_keyboard/f${i}.txt`,
      content: "x",
    }));
    const res = await mApp.inject({
      method: "POST",
      url: "/submit/managed-pr",
      payload: validManagedBody({ sourceFiles: tooMany }),
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when a source file exceeds the 1 MiB content cap", async () => {
    const oversized = "a".repeat(1_048_577); // 1 MiB + 1 byte
    const res = await mApp.inject({
      method: "POST",
      url: "/submit/managed-pr",
      payload: validManagedBody({
        sourceFiles: [{ path: "release/m/my_keyboard/big.kmn", content: oversized }],
      }),
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when keyboardId violates the [a-z0-9_] pattern", async () => {
    const res = await mApp.inject({
      method: "POST",
      url: "/submit/managed-pr",
      payload: validManagedBody({ keyboardId: "My-Keyboard" }),
    });
    expect(res.statusCode).toBe(400);
  });

  it("400 details never echo the submitted value", async () => {
    const res = await mApp.inject({
      method: "POST",
      url: "/submit/managed-pr",
      payload: validManagedBody({
        attribution: { displayName: "Ada", email: "LEAKED_VALUE@@bad" },
      }),
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).not.toContain("LEAKED_VALUE");
  });

  it("returns 200 { prUrl, commitSha } on a valid submission", async () => {
    const res = await mApp.inject({
      method: "POST",
      url: "/submit/managed-pr",
      payload: validManagedBody(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { prUrl: string; commitSha: string };
    expect(body.prUrl).toBe("https://github.com/keymanapp/keyboards/pull/77");
    expect(body.commitSha).toBe("abc1234000000000000000000000000000000000");
  });
});

describe("POST /submit/managed-pr — installation token never leaks", () => {
  it("is absent from a success response body", async () => {
    const mApp = await buildManagedServer();
    const res = await mApp.inject({
      method: "POST",
      url: "/submit/managed-pr",
      payload: validManagedBody(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain(INSTALLATION_TOKEN);
    await mApp.close();
  });

  it("is absent from an error (502) response body", async () => {
    const failFetch: GitHubPipelineFetchFn = async () => ({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      headers: { get: () => null },
      json: async () => ({}),
      text: async () => "{}",
    });
    const mApp = await buildManagedServer(failFetch);
    const res = await mApp.inject({
      method: "POST",
      url: "/submit/managed-pr",
      payload: validManagedBody(),
    });
    expect(res.statusCode).toBe(502);
    expect(res.body).not.toContain(INSTALLATION_TOKEN);
    expect((JSON.parse(res.body) as { error: string }).error).toBe("submission_unavailable");
    await mApp.close();
  });

  it("sets Retry-After header and maps a 429 to rate_limited with retryAfterSeconds from header", async () => {
    const rateFetch: GitHubPipelineFetchFn = async (url, init) => {
      if (url.includes("/git/ref/heads/master")) {
        return {
          ok: false,
          status: 429,
          statusText: "Too Many Requests",
          headers: { get: (name: string) => (name.toLowerCase() === "retry-after" ? "120" : null) },
          json: async () => ({}),
          text: async () => "{}",
        };
      }
      return managedPipelineFetch(url, init);
    };
    const mApp = await buildManagedServer(rateFetch);
    const res = await mApp.inject({
      method: "POST",
      url: "/submit/managed-pr",
      payload: validManagedBody(),
    });
    expect(res.statusCode).toBe(429);
    expect(res.headers["retry-after"]).toBe("120");
    await mApp.close();
  });
});

describe("POST /submit/managed-pr — CORS", () => {
  let mApp: Awaited<ReturnType<typeof buildServer>>;
  beforeAll(async () => {
    mApp = await buildManagedServer();
  });
  afterAll(async () => {
    await mApp.close();
  });

  it("allows preflight from an allowed origin", async () => {
    const res = await mApp.inject({
      method: "OPTIONS",
      url: "/submit/managed-pr",
      headers: { Origin: ALLOWED_ORIGIN, "Access-Control-Request-Method": "POST" },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(ALLOWED_ORIGIN);
  });

  it("rejects preflight from a disallowed origin with no ACAO header", async () => {
    const res = await mApp.inject({
      method: "OPTIONS",
      url: "/submit/managed-pr",
      headers: { Origin: DISALLOWED_ORIGIN, "Access-Control-Request-Method": "POST" },
    });
    expect(res.statusCode).not.toBe(500);
    const acao = res.headers["access-control-allow-origin"] as string | undefined;
    expect(acao).not.toBe(DISALLOWED_ORIGIN);
    expect(acao).not.toBe("*");
  });
});

// ---------------------------------------------------------------------------
// POST /oauth/exchange — client discriminator (dual-credential routing)
// ---------------------------------------------------------------------------

describe("POST /oauth/exchange — client discriminator", () => {
  it("uses github_app pair (default) when client field is absent", async () => {
    const captured: { body?: string } = {};
    const captureFetch: GitHubPipelineFetchFn = async (_url, init) => {
      captured.body = init?.body;
      return {
        ok: true, status: 200, statusText: "OK",
        headers: { get: () => null },
        json: async () => ({ access_token: "gho_app", token_type: "bearer", scope: "" }),
        text: async () => "{}",
      };
    };
    const discriminatorApp = await buildServer({
      clientId: "app-cid",
      clientSecret: "app-csecret",
      oauthClientId: "oauth-cid",
      oauthClientSecret: "oauth-csecret",
      googleOAuthEnabled: false,
      allowedOrigins: [ALLOWED_ORIGIN],
      fetchFn: captureFetch,
    });
    await discriminatorApp.ready();

    const res = await discriminatorApp.inject({
      method: "POST", url: "/oauth/exchange",
      payload: { code: "some-code" },
    });
    expect(res.statusCode).toBe(200);
    const sentPayload = JSON.parse(captured.body ?? "{}") as Record<string, unknown>;
    expect(sentPayload["client_id"]).toBe("app-cid");
    await discriminatorApp.close();
  });

  it("uses oauth_app pair when client='oauth_app'", async () => {
    const captured: { body?: string } = {};
    const captureFetch: GitHubPipelineFetchFn = async (_url, init) => {
      captured.body = init?.body;
      return {
        ok: true, status: 200, statusText: "OK",
        headers: { get: () => null },
        json: async () => ({ access_token: "gho_oauth", token_type: "bearer", scope: "public_repo" }),
        text: async () => "{}",
      };
    };
    const discriminatorApp = await buildServer({
      clientId: "app-cid",
      clientSecret: "app-csecret",
      oauthClientId: "oauth-cid",
      oauthClientSecret: "oauth-csecret",
      googleOAuthEnabled: false,
      allowedOrigins: [ALLOWED_ORIGIN],
      fetchFn: captureFetch,
    });
    await discriminatorApp.ready();

    const res = await discriminatorApp.inject({
      method: "POST", url: "/oauth/exchange",
      payload: { code: "some-code", client: "oauth_app" },
    });
    expect(res.statusCode).toBe(200);
    const sentPayload = JSON.parse(captured.body ?? "{}") as Record<string, unknown>;
    expect(sentPayload["client_id"]).toBe("oauth-cid");
    await discriminatorApp.close();
  });

  it("returns 500 server_misconfigured when oauth_app requested but pair not configured", async () => {
    // Build server with NO oauthClientId/oauthClientSecret
    const noOAuthApp = await buildServer({
      clientId: "app-cid",
      clientSecret: "app-csecret",
      googleOAuthEnabled: false,
      allowedOrigins: [ALLOWED_ORIGIN],
      fetchFn: successFetch,
    });
    await noOAuthApp.ready();

    const res = await noOAuthApp.inject({
      method: "POST", url: "/oauth/exchange",
      payload: { code: "some-code", client: "oauth_app" },
    });
    expect(res.statusCode).toBe(500);
    expect((JSON.parse(res.body) as { error: string }).error).toBe("server_misconfigured");
    await noOAuthApp.close();
  });

  it("returns 400 invalid_request when client has an unknown value", async () => {
    const res = await app.inject({
      method: "POST", url: "/oauth/exchange",
      payload: { code: "some-code", client: "unknown_client" },
    });
    expect(res.statusCode).toBe(400);
    expect((JSON.parse(res.body) as { error: string }).error).toBe("invalid_request");
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
