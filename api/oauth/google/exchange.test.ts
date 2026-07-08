// Tests for the serverless Google identity-exchange glue (runGoogleHandler +
// googleEnvConfig).
//
// The exchange/decode/claim-validation logic itself is tested in
// utilities/oauth-backend (google-handlers.test.ts); here we only verify the
// HTTP glue: method guard, the 503 not-configured gate, body validation, status
// mapping, and that no Google token leaks into the response. A stub fetch is
// injected via the config override (same DI pattern as _shared.test.ts) so no
// network and no real credentials are needed.

import { describe, it, expect } from "vitest";
import {
  runGoogleHandler,
  googleEnvConfig,
  type GoogleHandlerConfig,
} from "../_shared.js";

/** Build a structurally valid (unsigned) Google id_token for the given claims. */
function makeIdToken(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "none", typ: "JWT" })}.${b64(payload)}.sig`;
}

const CLIENT_ID = "test-google-client-id.apps.googleusercontent.com";

/** A default valid id_token payload keyed to CLIENT_ID, expiring in 1 h. */
function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    aud: CLIENT_ID,
    iss: "https://accounts.google.com",
    exp: Math.floor(Date.now() / 1000) + 3600,
    sub: "1234567890",
    email: "author@example.org",
    email_verified: true,
    name: "Test Author",
    picture: "https://lh3.googleusercontent.com/a/pic",
    ...overrides,
  };
}

function stubConfig(googleResponse: {
  ok: boolean;
  status: number;
  body: unknown;
}): GoogleHandlerConfig {
  return {
    googleClientId: CLIENT_ID,
    googleClientSecret: "test-google-client-secret",
    fetch: async () => ({
      ok: googleResponse.ok,
      status: googleResponse.status,
      json: () => Promise.resolve(googleResponse.body),
    }),
  };
}

function postReq(body: unknown): Request {
  return new Request("https://app.example/oauth/google/exchange", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const VALID_BODY = {
  code: "auth-code-123",
  code_verifier: "pkce-verifier-xyz",
  redirect_uri: "https://app.example/oauth/google/callback",
};

describe("runGoogleHandler — HTTP glue", () => {
  it("rejects non-POST with 405", async () => {
    const req = new Request("https://app.example/oauth/google/exchange", {
      method: "GET",
    });
    const res = await runGoogleHandler(req, stubConfig({ ok: true, status: 200, body: {} }));
    expect(res.status).toBe(405);
    expect(await res.json()).toEqual({ error: "method_not_allowed" });
  });

  it("returns 503 google_oauth_not_configured when Google creds are absent", async () => {
    const prevId = process.env["GOOGLE_CLIENT_ID"];
    const prevSecret = process.env["GOOGLE_CLIENT_SECRET"];
    delete process.env["GOOGLE_CLIENT_ID"];
    delete process.env["GOOGLE_CLIENT_SECRET"];
    try {
      // No configOverride → falls back to googleEnvConfig() → null → 503.
      const res = await runGoogleHandler(postReq(VALID_BODY));
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: "google_oauth_not_configured" });
    } finally {
      if (prevId !== undefined) process.env["GOOGLE_CLIENT_ID"] = prevId;
      if (prevSecret !== undefined) process.env["GOOGLE_CLIENT_SECRET"] = prevSecret;
    }
  });

  it("returns 400 invalid_request on unparseable body", async () => {
    const res = await runGoogleHandler(postReq("{ not json"), stubConfig({ ok: true, status: 200, body: {} }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_request" });
  });

  it("returns 400 invalid_request when the body fails the schema (missing code_verifier)", async () => {
    const res = await runGoogleHandler(
      postReq({ code: "abc", redirect_uri: "https://app.example/oauth/google/callback" }),
      stubConfig({ ok: true, status: 200, body: {} }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_request" });
  });

  it("returns 400 invalid_request when redirect_uri is not a URL", async () => {
    const res = await runGoogleHandler(
      postReq({ ...VALID_BODY, redirect_uri: "not-a-url" }),
      stubConfig({ ok: true, status: 200, body: {} }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_request" });
  });

  it("returns 200 + identity claims on a successful exchange (no token leaked)", async () => {
    const config = stubConfig({
      ok: true,
      status: 200,
      body: {
        id_token: makeIdToken(validPayload()),
        access_token: "ya29.SECRET-google-access-token",
        token_type: "Bearer",
      },
    });
    const res = await runGoogleHandler(postReq(VALID_BODY), config);
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toEqual({
      sub: "1234567890",
      email: "author@example.org",
      email_verified: true,
      name: "Test Author",
      picture: "https://lh3.googleusercontent.com/a/pic",
    });
    // Neither the id_token nor the access_token may appear anywhere in the response.
    const serialized = JSON.stringify(json);
    expect(serialized).not.toContain("ya29.SECRET");
    expect(serialized).not.toContain("id_token");
  });

  it("maps a Google error body to a safe 400 code (no raw description leaked)", async () => {
    const config = stubConfig({
      ok: true,
      status: 200,
      body: { error: "invalid_grant", error_description: "leak me" },
    });
    const res = await runGoogleHandler(postReq(VALID_BODY), config);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("invalid_grant");
    expect(JSON.stringify(json)).not.toContain("leak me");
  });

  it("rejects an id_token minted for a different client (aud mismatch) with 400", async () => {
    const config = stubConfig({
      ok: true,
      status: 200,
      body: { id_token: makeIdToken(validPayload({ aud: "some-other-client" })) },
    });
    const res = await runGoogleHandler(postReq(VALID_BODY), config);
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe("invalid_id_token");
  });
});

describe("googleEnvConfig", () => {
  it("returns null when GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are unset", () => {
    const prevId = process.env["GOOGLE_CLIENT_ID"];
    const prevSecret = process.env["GOOGLE_CLIENT_SECRET"];
    delete process.env["GOOGLE_CLIENT_ID"];
    delete process.env["GOOGLE_CLIENT_SECRET"];
    try {
      expect(googleEnvConfig()).toBeNull();
    } finally {
      if (prevId !== undefined) process.env["GOOGLE_CLIENT_ID"] = prevId;
      if (prevSecret !== undefined) process.env["GOOGLE_CLIENT_SECRET"] = prevSecret;
    }
  });

  it("returns config with injected fetch when both creds are set", () => {
    const prevId = process.env["GOOGLE_CLIENT_ID"];
    const prevSecret = process.env["GOOGLE_CLIENT_SECRET"];
    process.env["GOOGLE_CLIENT_ID"] = "gid";
    process.env["GOOGLE_CLIENT_SECRET"] = "gsecret";
    try {
      const stub = async () => ({ ok: true, status: 200, json: () => Promise.resolve({}) });
      const cfg = googleEnvConfig(stub);
      expect(cfg).not.toBeNull();
      expect(cfg?.googleClientId).toBe("gid");
      expect(cfg?.googleClientSecret).toBe("gsecret");
      expect(cfg?.fetch).toBe(stub);
    } finally {
      if (prevId !== undefined) process.env["GOOGLE_CLIENT_ID"] = prevId;
      else delete process.env["GOOGLE_CLIENT_ID"];
      if (prevSecret !== undefined) process.env["GOOGLE_CLIENT_SECRET"] = prevSecret;
      else delete process.env["GOOGLE_CLIENT_SECRET"];
    }
  });

  it("returns null when only one of the two creds is set", () => {
    const prevId = process.env["GOOGLE_CLIENT_ID"];
    const prevSecret = process.env["GOOGLE_CLIENT_SECRET"];
    process.env["GOOGLE_CLIENT_ID"] = "gid";
    delete process.env["GOOGLE_CLIENT_SECRET"];
    try {
      expect(googleEnvConfig()).toBeNull();
    } finally {
      if (prevId !== undefined) process.env["GOOGLE_CLIENT_ID"] = prevId;
      else delete process.env["GOOGLE_CLIENT_ID"];
      if (prevSecret !== undefined) process.env["GOOGLE_CLIENT_SECRET"] = prevSecret;
    }
  });
});
