// Tests for the serverless OAuth glue (runTokenHandler + envConfig).
//
// The token-exchange logic itself is tested in utilities/oauth-backend; here we
// only verify the HTTP glue: method guard, body validation, status mapping, and
// that the framework-agnostic core is wired in. A stub fetch is injected via
// the config override (same DI pattern as the utility's own handler tests) so
// no network and no real credentials are needed.

import { describe, it, expect, vi } from "vitest";
import {
  runTokenHandler,
  exchangeCore,
  ExchangeBodySchema,
  envConfig,
  clientAddress,
  type HandlerConfig,
  type TokenRateLimit,
} from "./_shared.js";
import {
  MemoryRateLimitStore,
  type RateLimitStore,
} from "../../utilities/oauth-backend/src/rate-limit.js";

function stubConfig(
  ghResponse: { ok: boolean; status: number; body: unknown },
): HandlerConfig {
  return {
    clientId: "test-client-id",
    clientSecret: "test-client-secret",
    fetch: async () => ({
      ok: ghResponse.ok,
      status: ghResponse.status,
      json: () => Promise.resolve(ghResponse.body),
    }),
  };
}

function stubConfigWithOAuth(
  ghResponse: { ok: boolean; status: number; body: unknown },
): HandlerConfig {
  return {
    clientId: "app-client-id",
    clientSecret: "app-client-secret",
    oauthClientId: "oauth-client-id",
    oauthClientSecret: "oauth-client-secret",
    fetch: async () => ({
      ok: ghResponse.ok,
      status: ghResponse.status,
      json: () => Promise.resolve(ghResponse.body),
    }),
  };
}

function postReq(body: unknown): Request {
  return new Request("https://app.example/oauth/exchange", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("runTokenHandler — HTTP glue", () => {
  it("rejects non-POST with 405", async () => {
    const req = new Request("https://app.example/oauth/exchange", { method: "GET" });
    const res = await runTokenHandler(req, ExchangeBodySchema, exchangeCore, stubConfig({ ok: true, status: 200, body: {} }));
    expect(res.status).toBe(405);
    expect(await res.json()).toEqual({ error: "method_not_allowed" });
  });

  it("returns 400 invalid_request on unparseable body", async () => {
    const req = postReq("{ not json");
    const res = await runTokenHandler(req, ExchangeBodySchema, exchangeCore, stubConfig({ ok: true, status: 200, body: {} }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_request" });
  });

  it("returns 400 invalid_request when the body fails the schema (missing code)", async () => {
    const res = await runTokenHandler(postReq({ nope: 1 }), ExchangeBodySchema, exchangeCore, stubConfig({ ok: true, status: 200, body: {} }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_request" });
  });

  it("returns 200 + token on a successful exchange", async () => {
    const config = stubConfig({
      ok: true,
      status: 200,
      body: { access_token: "gho_test", token_type: "bearer", scope: "public_repo" },
    });
    const res = await runTokenHandler(postReq({ code: "abc123", code_verifier: "verifier" }), ExchangeBodySchema, exchangeCore, config);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      access_token: "gho_test",
      token_type: "bearer",
      scope: "public_repo",
    });
  });

  it("maps a GitHub error to a safe 400 code (no raw GitHub message leaked)", async () => {
    const config = stubConfig({
      ok: true,
      status: 200,
      body: { error: "bad_verification_code", error_description: "leak me" },
    });
    const res = await runTokenHandler(postReq({ code: "stale", code_verifier: "verifier" }), ExchangeBodySchema, exchangeCore, config);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("bad_verification_code");
    expect(JSON.stringify(json)).not.toContain("leak me");
  });
});

describe("runTokenHandler — client discriminator", () => {
  it("routes to github_app pair when client field is absent", async () => {
    // The stub config carries both pairs; we verify the correct client_id
    // reaches the GitHub fetch by capturing it via a custom fetch stub.
    const captured: { body?: unknown } = {};
    const config: HandlerConfig = {
      clientId: "app-cid",
      clientSecret: "app-csecret",
      oauthClientId: "oauth-cid",
      oauthClientSecret: "oauth-csecret",
      fetch: async (_url, init) => {
        captured.body = JSON.parse(init?.body ?? "{}") as unknown;
        return { ok: true, status: 200, json: () => Promise.resolve({ access_token: "gho_app", token_type: "bearer", scope: "" }) };
      },
    };
    const res = await runTokenHandler(postReq({ code: "abc", code_verifier: "verifier" }), ExchangeBodySchema, exchangeCore, config);
    expect(res.status).toBe(200);
    expect((captured.body as Record<string, unknown>)["client_id"]).toBe("app-cid");
  });

  it("routes to oauth_app pair when client='oauth_app'", async () => {
    const captured: { body?: unknown } = {};
    const config: HandlerConfig = {
      clientId: "app-cid",
      clientSecret: "app-csecret",
      oauthClientId: "oauth-cid",
      oauthClientSecret: "oauth-csecret",
      fetch: async (_url, init) => {
        captured.body = JSON.parse(init?.body ?? "{}") as unknown;
        return { ok: true, status: 200, json: () => Promise.resolve({ access_token: "gho_oauth", token_type: "bearer", scope: "public_repo" }) };
      },
    };
    const res = await runTokenHandler(postReq({ code: "abc", code_verifier: "verifier", client: "oauth_app" }), ExchangeBodySchema, exchangeCore, config);
    expect(res.status).toBe(200);
    expect((captured.body as Record<string, unknown>)["client_id"]).toBe("oauth-cid");
  });

  it("returns 500 server_misconfigured when oauth_app requested but pair not configured", async () => {
    // stubConfigWithOAuth is used here — config has no OAuth pair
    const config = stubConfig({ ok: true, status: 200, body: { access_token: "gho_app", token_type: "bearer", scope: "" } });
    // config has no oauthClientId/oauthClientSecret
    const res = await runTokenHandler(postReq({ code: "abc", code_verifier: "verifier", client: "oauth_app" }), ExchangeBodySchema, exchangeCore, config);
    expect(res.status).toBe(500);
    expect((await res.json() as { error: string }).error).toBe("server_misconfigured");
  });

  it("returns 400 invalid_request when client has an unknown value", async () => {
    const config = stubConfigWithOAuth({ ok: true, status: 200, body: {} });
    const res = await runTokenHandler(postReq({ code: "abc", code_verifier: "verifier", client: "not_valid" }), ExchangeBodySchema, exchangeCore, config);
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe("invalid_request");
  });
});

describe("envConfig", () => {
  it("throws when GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET are unset", () => {
    const prevId = process.env["GITHUB_CLIENT_ID"];
    const prevSecret = process.env["GITHUB_CLIENT_SECRET"];
    delete process.env["GITHUB_CLIENT_ID"];
    delete process.env["GITHUB_CLIENT_SECRET"];
    try {
      expect(() => envConfig()).toThrow(/must be set/);
    } finally {
      if (prevId !== undefined) process.env["GITHUB_CLIENT_ID"] = prevId;
      if (prevSecret !== undefined) process.env["GITHUB_CLIENT_SECRET"] = prevSecret;
    }
  });

  it("returns config with injected fetch when env is set", () => {
    process.env["GITHUB_CLIENT_ID"] = "id";
    process.env["GITHUB_CLIENT_SECRET"] = "secret";
    const stub = async () => ({ ok: true, status: 200, json: () => Promise.resolve({}) });
    const cfg = envConfig(stub);
    expect(cfg.clientId).toBe("id");
    expect(cfg.clientSecret).toBe("secret");
    expect(cfg.fetch).toBe(stub);
  });

  it("includes oauthClientId/oauthClientSecret when OAuth pair env vars are set", () => {
    process.env["GITHUB_CLIENT_ID"] = "id";
    process.env["GITHUB_CLIENT_SECRET"] = "secret";
    process.env["GITHUB_OAUTH_CLIENT_ID"] = "oauth-id";
    process.env["GITHUB_OAUTH_CLIENT_SECRET"] = "oauth-secret";
    try {
      const stub = async () => ({ ok: true, status: 200, json: () => Promise.resolve({}) });
      const cfg = envConfig(stub);
      expect(cfg.oauthClientId).toBe("oauth-id");
      expect(cfg.oauthClientSecret).toBe("oauth-secret");
    } finally {
      delete process.env["GITHUB_OAUTH_CLIENT_ID"];
      delete process.env["GITHUB_OAUTH_CLIENT_SECRET"];
    }
  });

  it("omits oauthClientId/oauthClientSecret when OAuth pair env vars are absent", () => {
    process.env["GITHUB_CLIENT_ID"] = "id";
    process.env["GITHUB_CLIENT_SECRET"] = "secret";
    delete process.env["GITHUB_OAUTH_CLIENT_ID"];
    delete process.env["GITHUB_OAUTH_CLIENT_SECRET"];
    const stub = async () => ({ ok: true, status: 200, json: () => Promise.resolve({}) });
    const cfg = envConfig(stub);
    expect(cfg.oauthClientId).toBeUndefined();
    expect(cfg.oauthClientSecret).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Rate limiter (US4 / FR-010, FR-011)
//
// The limiter itself is unit-tested in utilities/oauth-backend
// (rate-limit.test.ts); what matters here is that the serverless glue refuses on
// the same terms as the standalone server — before the outbound call, with the
// code and header the contract pins.
// ---------------------------------------------------------------------------

describe("runTokenHandler — rate limiter", () => {
  /** Config that counts outbound calls, so "before the provider call" is checkable. */
  function countingConfig(): { config: HandlerConfig; calls: () => number } {
    let calls = 0;
    return {
      config: {
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
        fetch: async () => {
          calls += 1;
          return {
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({ access_token: "gho_x", token_type: "bearer", scope: "public_repo" }),
          };
        },
      },
      calls: () => calls,
    };
  }

  const limitOf = (store: RateLimitStore | null, limit: number): TokenRateLimit => ({
    store,
    endpoint: "oauth/exchange",
    windowSeconds: 60,
    limit,
  });

  const exchangeReq = () => postReq({ code: "gh-code", code_verifier: "verifier" });

  it("admits up to the limit, then returns 429 request_rate_limited with Retry-After", async () => {
    const { config } = countingConfig();
    const rl = limitOf(new MemoryRateLimitStore(() => 1_700_000_040_000), 2);

    for (let i = 0; i < 2; i++) {
      const ok = await runTokenHandler(exchangeReq(), ExchangeBodySchema, exchangeCore, config, rl);
      expect(ok.status, `request ${i + 1}`).toBe(200);
    }

    const refused = await runTokenHandler(exchangeReq(), ExchangeBodySchema, exchangeCore, config, rl);
    expect(refused.status).toBe(429);
    // Not `rate_limited`: that code means the upstream provider limited us.
    expect(await refused.json()).toEqual({ error: "request_rate_limited" });
    expect(refused.headers.get("Retry-After")).toBe("60");
  });

  it("refuses before the outbound provider call (FR-010)", async () => {
    const { config, calls } = countingConfig();
    const rl = limitOf(new MemoryRateLimitStore(() => 1_700_000_040_000), 1);

    await runTokenHandler(exchangeReq(), ExchangeBodySchema, exchangeCore, config, rl);
    expect(calls()).toBe(1);

    const refused = await runTokenHandler(exchangeReq(), ExchangeBodySchema, exchangeCore, config, rl);
    expect(refused.status).toBe(429);
    expect(calls()).toBe(1);
  });

  it("checks the method before the limiter, so non-POST spam cannot burn the budget", async () => {
    const { config } = countingConfig();
    const rl = limitOf(new MemoryRateLimitStore(() => 1_700_000_040_000), 1);

    for (let i = 0; i < 5; i++) {
      const res = await runTokenHandler(
        new Request("https://app.example/oauth/exchange", { method: "GET" }),
        ExchangeBodySchema,
        exchangeCore,
        config,
        rl,
      );
      expect(res.status).toBe(405);
    }

    // The budget is untouched, so a legitimate sign-in from the same address
    // still succeeds.
    const ok = await runTokenHandler(exchangeReq(), ExchangeBodySchema, exchangeCore, config, rl);
    expect(ok.status).toBe(200);
  });

  it("stays unmetered when no store is configured (fail open)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { config } = countingConfig();
    const rl = limitOf(null, 1);

    try {
      for (let i = 0; i < 4; i++) {
        const res = await runTokenHandler(exchangeReq(), ExchangeBodySchema, exchangeCore, config, rl);
        expect(res.status).toBe(200);
      }
      expect(String(warn.mock.calls[0]?.[0])).toContain("[WARN]");
    } finally {
      warn.mockRestore();
    }
  });

  it("is not applied at all when no rate limit is passed", async () => {
    const { config } = countingConfig();
    // Routes that pass nothing behave exactly as they did before the limiter
    // existed — /oauth/refresh and the Google exchange rely on this.
    for (let i = 0; i < 5; i++) {
      const res = await runTokenHandler(exchangeReq(), ExchangeBodySchema, exchangeCore, config);
      expect(res.status).toBe(200);
    }
  });
});

describe("clientAddress", () => {
  const reqWith = (headers: Record<string, string>) =>
    new Request("https://app.example/oauth/exchange", { method: "POST", headers });

  it("takes the left-most x-forwarded-for entry", () => {
    expect(clientAddress(reqWith({ "x-forwarded-for": "203.0.113.7, 70.41.3.18" }))).toBe(
      "203.0.113.7",
    );
  });

  it("falls back to x-real-ip", () => {
    expect(clientAddress(reqWith({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("returns null when the platform reports no address", () => {
    expect(clientAddress(reqWith({}))).toBeNull();
    expect(clientAddress(reqWith({ "x-forwarded-for": "  " }))).toBeNull();
  });
});
