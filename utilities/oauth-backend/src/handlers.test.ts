/**
 * Unit tests for the OAuth handler logic in handlers.ts.
 *
 * All tests use an injected stub fetch function — no real network calls.
 */

import { describe, it, expect } from "vitest";
import { exchange, refresh, type HandlerConfig, type OAuthFetchFn } from "./handlers.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(fetchFn: OAuthFetchFn): HandlerConfig {
  return {
    clientId: "test-client-id",
    clientSecret: "test-client-secret-SHOULD-NEVER-LEAK",
    fetch: fetchFn,
  };
}

function makeConfigWithOAuth(fetchFn: OAuthFetchFn): HandlerConfig {
  return {
    clientId: "app-client-id",
    clientSecret: "app-client-secret-SHOULD-NEVER-LEAK",
    oauthClientId: "oauth-client-id",
    oauthClientSecret: "oauth-client-secret-SHOULD-NEVER-LEAK",
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

// ---------------------------------------------------------------------------
// exchange()
// ---------------------------------------------------------------------------

describe("exchange()", () => {
  it("returns access_token, token_type, scope on success", async () => {
    const fetch = stubFetch({
      access_token: "gho_abc123",
      token_type: "bearer",
      scope: "public_repo",
    });

    const result = await exchange({ code: "github-code-xyz" }, makeConfig(fetch));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data.access_token).toBe("gho_abc123");
    expect(result.data.token_type).toBe("bearer");
    expect(result.data.scope).toBe("public_repo");
  });

  it("passes code_verifier through to GitHub fetch", async () => {
    const captured: { body?: string } = {};
    const fetch: OAuthFetchFn = async (_url, init) => {
      captured.body = init?.body;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: "gho_abc123",
          token_type: "bearer",
          scope: "public_repo",
        }),
      };
    };

    await exchange(
      { code: "code-abc", code_verifier: "verifier-xyz" },
      makeConfig(fetch)
    );

    const parsed = JSON.parse(captured.body ?? "{}") as Record<string, unknown>;
    expect(parsed["code_verifier"]).toBe("verifier-xyz");
  });

  it("passes redirect_uri through to GitHub fetch", async () => {
    const captured: { body?: string } = {};
    const fetch: OAuthFetchFn = async (_url, init) => {
      captured.body = init?.body;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: "gho_xyz",
          token_type: "bearer",
          scope: "public_repo",
        }),
      };
    };

    await exchange(
      { code: "code-abc", redirect_uri: "http://localhost:5173/callback" },
      makeConfig(fetch)
    );

    const parsed = JSON.parse(captured.body ?? "{}") as Record<string, unknown>;
    expect(parsed["redirect_uri"]).toBe("http://localhost:5173/callback");
  });

  it("returns safe 400 on bad_verification_code GitHub error", async () => {
    const fetch = stubFetch({ error: "bad_verification_code" }, false, 200);

    const result = await exchange({ code: "expired-code" }, makeConfig(fetch));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(400);
    expect(result.error).toBe("bad_verification_code");
  });

  it("returns safe generic error for unknown GitHub errors", async () => {
    const fetch = stubFetch({ error: "some_unknown_error_from_github" }, false, 200);

    const result = await exchange({ code: "code" }, makeConfig(fetch));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toBe("github_error");
  });

  it("returns 502 when fetch throws a network error", async () => {
    const fetch: OAuthFetchFn = async () => {
      throw new Error("ECONNREFUSED");
    };

    const result = await exchange({ code: "code" }, makeConfig(fetch));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(502);
    expect(result.error).toBe("upstream_unavailable");
  });

  it("returns 502 upstream_error when GitHub responds non-ok with no error field", async () => {
    // GitHub 429 / 500 — HTTP error but no JSON error field
    const fetch: OAuthFetchFn = async () => ({
      ok: false,
      status: 429,
      json: async () => ({ message: "rate limited" }),
    });

    const result = await exchange({ code: "code" }, makeConfig(fetch));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(502);
    expect(result.error).toBe("upstream_error");
  });

  it("does NOT include client_secret in the success response", async () => {
    const fetch = stubFetch({
      access_token: "gho_abc123",
      token_type: "bearer",
      scope: "public_repo",
    });

    const result = await exchange({ code: "code" }, makeConfig(fetch));

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("test-client-secret-SHOULD-NEVER-LEAK");
  });

  it("does NOT forward refresh_token from exchange response (GitHub rarely issues one)", async () => {
    // Standard exchange — no refresh_token in GitHub's response
    const fetch = stubFetch({
      access_token: "gho_abc123",
      token_type: "bearer",
      scope: "public_repo",
    });

    const result = await exchange({ code: "code" }, makeConfig(fetch));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data.refresh_token).toBeUndefined();
  });

  it("does NOT include the authorization code in the response", async () => {
    const fetch = stubFetch({
      access_token: "gho_abc123",
      token_type: "bearer",
      scope: "public_repo",
    });

    const result = await exchange(
      { code: "SUPER_SECRET_CODE_VALUE" },
      makeConfig(fetch)
    );

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("SUPER_SECRET_CODE_VALUE");
  });
});

// ---------------------------------------------------------------------------
// exchange() — client discriminator / dual-credential routing
// ---------------------------------------------------------------------------

describe("exchange() — client discriminator", () => {
  it("uses github_app pair when client field is absent (default)", async () => {
    const captured: { body?: string } = {};
    const fetch: OAuthFetchFn = async (_url, init) => {
      captured.body = init?.body;
      return { ok: true, status: 200, json: async () => ({ access_token: "gho_app", token_type: "bearer", scope: "" }) };
    };

    await exchange({ code: "code-abc" }, makeConfigWithOAuth(fetch));

    const parsed = JSON.parse(captured.body ?? "{}") as Record<string, unknown>;
    expect(parsed["client_id"]).toBe("app-client-id");
    expect(parsed["client_secret"]).toBe("app-client-secret-SHOULD-NEVER-LEAK");
  });

  it("uses github_app pair when client is explicitly 'github_app'", async () => {
    const captured: { body?: string } = {};
    const fetch: OAuthFetchFn = async (_url, init) => {
      captured.body = init?.body;
      return { ok: true, status: 200, json: async () => ({ access_token: "gho_app", token_type: "bearer", scope: "" }) };
    };

    await exchange({ code: "code-abc", client: "github_app" }, makeConfigWithOAuth(fetch));

    const parsed = JSON.parse(captured.body ?? "{}") as Record<string, unknown>;
    expect(parsed["client_id"]).toBe("app-client-id");
    expect(parsed["client_secret"]).toBe("app-client-secret-SHOULD-NEVER-LEAK");
  });

  it("uses oauth_app pair when client is 'oauth_app'", async () => {
    const captured: { body?: string } = {};
    const fetch: OAuthFetchFn = async (_url, init) => {
      captured.body = init?.body;
      return { ok: true, status: 200, json: async () => ({ access_token: "gho_oauth", token_type: "bearer", scope: "public_repo" }) };
    };

    await exchange({ code: "code-abc", client: "oauth_app" }, makeConfigWithOAuth(fetch));

    const parsed = JSON.parse(captured.body ?? "{}") as Record<string, unknown>;
    expect(parsed["client_id"]).toBe("oauth-client-id");
    expect(parsed["client_secret"]).toBe("oauth-client-secret-SHOULD-NEVER-LEAK");
  });

  it("oauth_app pair secret never appears in the success response", async () => {
    const fetch = stubFetch({ access_token: "gho_oauth", token_type: "bearer", scope: "public_repo" });

    const result = await exchange({ code: "code", client: "oauth_app" }, makeConfigWithOAuth(fetch));

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("oauth-client-secret-SHOULD-NEVER-LEAK");
  });

  it("returns 500 server_misconfigured when oauth_app requested but pair not configured", async () => {
    // Config has no oauthClientId/oauthClientSecret
    const fetch = stubFetch({ access_token: "gho_app", token_type: "bearer", scope: "" });

    const result = await exchange({ code: "code", client: "oauth_app" }, makeConfig(fetch));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(500);
    expect(result.error).toBe("server_misconfigured");
  });

  it("github_app default flow still works when oauth pair is absent", async () => {
    const fetch = stubFetch({ access_token: "gho_app", token_type: "bearer", scope: "" });

    // makeConfig has no oauthClientId/oauthClientSecret — github_app must still succeed
    const result = await exchange({ code: "code" }, makeConfig(fetch));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data.access_token).toBe("gho_app");
  });
});

// ---------------------------------------------------------------------------
// refresh()
// ---------------------------------------------------------------------------

describe("refresh()", () => {
  it("returns access_token on successful refresh", async () => {
    const fetch = stubFetch({
      access_token: "gho_refreshed_token",
      token_type: "bearer",
      scope: "public_repo",
    });

    const result = await refresh(
      { refresh_token: "ghr_refresh_token" },
      makeConfig(fetch)
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data.access_token).toBe("gho_refreshed_token");
  });

  it("sends grant_type=refresh_token to GitHub", async () => {
    const captured: { body?: string } = {};
    const fetch: OAuthFetchFn = async (_url, init) => {
      captured.body = init?.body;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: "gho_r",
          token_type: "bearer",
          scope: "public_repo",
        }),
      };
    };

    await refresh({ refresh_token: "ghr_rt" }, makeConfig(fetch));

    const parsed = JSON.parse(captured.body ?? "{}") as Record<string, unknown>;
    expect(parsed["grant_type"]).toBe("refresh_token");
    expect(parsed["refresh_token"]).toBe("ghr_rt");
  });

  it("returns safe 400 when GitHub returns an error", async () => {
    const fetch = stubFetch({ error: "unsupported_grant_type" });

    const result = await refresh({ refresh_token: "old-token" }, makeConfig(fetch));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(400);
    expect(result.error).toBe("unsupported_grant_type");
  });

  it("forwards a rotated refresh_token when GitHub returns one", async () => {
    const fetch = stubFetch({
      access_token: "gho_new_token",
      token_type: "bearer",
      scope: "public_repo",
      refresh_token: "ghr_new_refresh_token",
    });

    const result = await refresh(
      { refresh_token: "ghr_old_refresh_token" },
      makeConfig(fetch)
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data.refresh_token).toBe("ghr_new_refresh_token");
  });

  it("returns 502 upstream_error when GitHub responds non-ok with no error field", async () => {
    const fetch: OAuthFetchFn = async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    const result = await refresh({ refresh_token: "ghr_rt" }, makeConfig(fetch));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(502);
    expect(result.error).toBe("upstream_error");
  });

  it("does NOT include client_secret in the refresh response", async () => {
    const fetch = stubFetch({
      access_token: "gho_refreshed",
      token_type: "bearer",
      scope: "public_repo",
    });

    const result = await refresh(
      { refresh_token: "ghr_rt" },
      makeConfig(fetch)
    );

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("test-client-secret-SHOULD-NEVER-LEAK");
  });
});

// ---------------------------------------------------------------------------
// refresh() — client discriminator / dual-credential routing
// ---------------------------------------------------------------------------

describe("refresh() — client discriminator", () => {
  it("uses github_app pair when client field is absent (default)", async () => {
    const captured: { body?: string } = {};
    const fetch: OAuthFetchFn = async (_url, init) => {
      captured.body = init?.body;
      return { ok: true, status: 200, json: async () => ({ access_token: "gho_r", token_type: "bearer", scope: "" }) };
    };

    await refresh({ refresh_token: "ghr_rt" }, makeConfigWithOAuth(fetch));

    const parsed = JSON.parse(captured.body ?? "{}") as Record<string, unknown>;
    expect(parsed["client_id"]).toBe("app-client-id");
    expect(parsed["client_secret"]).toBe("app-client-secret-SHOULD-NEVER-LEAK");
  });

  it("uses oauth_app pair when client is 'oauth_app'", async () => {
    const captured: { body?: string } = {};
    const fetch: OAuthFetchFn = async (_url, init) => {
      captured.body = init?.body;
      return { ok: true, status: 200, json: async () => ({ access_token: "gho_r", token_type: "bearer", scope: "" }) };
    };

    await refresh({ refresh_token: "ghr_rt", client: "oauth_app" }, makeConfigWithOAuth(fetch));

    const parsed = JSON.parse(captured.body ?? "{}") as Record<string, unknown>;
    expect(parsed["client_id"]).toBe("oauth-client-id");
    expect(parsed["client_secret"]).toBe("oauth-client-secret-SHOULD-NEVER-LEAK");
  });

  it("returns 500 server_misconfigured when oauth_app requested but pair not configured", async () => {
    const fetch = stubFetch({ access_token: "gho_r", token_type: "bearer", scope: "" });

    const result = await refresh({ refresh_token: "ghr_rt", client: "oauth_app" }, makeConfig(fetch));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(500);
    expect(result.error).toBe("server_misconfigured");
  });
});
