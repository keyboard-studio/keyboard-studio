// Tests for the serverless OAuth glue (runTokenHandler + envConfig).
//
// The token-exchange logic itself is tested in utilities/oauth-backend; here we
// only verify the HTTP glue: method guard, body validation, status mapping, and
// that the framework-agnostic core is wired in. A stub fetch is injected via
// the config override (same DI pattern as the utility's own handler tests) so
// no network and no real credentials are needed.

import { describe, it, expect } from "vitest";
import {
  runTokenHandler,
  exchangeCore,
  ExchangeBodySchema,
  envConfig,
  type HandlerConfig,
} from "./_shared.js";

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
    const res = await runTokenHandler(postReq({ code: "abc123" }), ExchangeBodySchema, exchangeCore, config);
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
    const res = await runTokenHandler(postReq({ code: "stale" }), ExchangeBodySchema, exchangeCore, config);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("bad_verification_code");
    expect(JSON.stringify(json)).not.toContain("leak me");
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
});
