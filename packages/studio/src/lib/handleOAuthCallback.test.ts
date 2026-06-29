// Tests for handleOAuthCallback — state validation + exchange flow.
//
// processOAuthCallback is the pure (no-redirect) core; we exercise its state
// validation, missing-code/verifier guards, and the happy path by mocking the
// token exchange via global fetch.
//
// processGoogleOAuthCallback mirrors the GitHub flow but uses the ks.google.*
// sessionStorage keys and POSTs to /oauth/google/exchange.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  processOAuthCallback,
  processGoogleOAuthCallback,
  redirectTargetForResult,
  type OAuthCallbackResult,
} from "./handleOAuthCallback.ts";
import { setOAuthScratch, getStoredToken } from "./githubOAuth.ts";
import type { AuthFlow } from "./githubOAuth.ts";
import {
  setGoogleOAuthScratch,
  getStoredGoogleIdentity,
} from "./googleOAuth.ts";

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("processOAuthCallback — state validation", () => {
  it("rejects when the returned state does not match the stored state", async () => {
    setOAuthScratch("verifier-1", "stored-state");
    const result = await processOAuthCallback("?code=abc&state=DIFFERENT");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("state-mismatch");
    // No token should be stored.
    expect(getStoredToken()).toBeNull();
  });

  it("rejects when no state was stored (nothing to validate against)", async () => {
    const result = await processOAuthCallback("?code=abc&state=anything");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("state-mismatch");
  });

  it("rejects when the code is missing", async () => {
    setOAuthScratch("verifier-1", "s");
    const result = await processOAuthCallback("?state=s");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("missing-code");
  });

  it("surfaces a GitHub error param (e.g. access_denied)", async () => {
    setOAuthScratch("v", "s");
    const result = await processOAuthCallback("?error=access_denied&state=s");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("exchange-failed");
    expect(result.ok === false && result.message).toBe("access_denied");
  });
});

describe("processOAuthCallback — happy path", () => {
  function makeSuccessResponse() {
    return new Response(
      JSON.stringify({
        access_token: "ghp_token",
        token_type: "bearer",
        scope: "public_repo",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  it("exchanges the code and stores the token when state matches", async () => {
    setOAuthScratch("verifier-1", "state-ok");
    const fetchMock = vi.fn(async () => makeSuccessResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = await processOAuthCallback("?code=goodcode&state=state-ok");
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const stored = getStoredToken();
    expect(stored?.accessToken).toBe("ghp_token");
    expect(stored?.scope).toBe("public_repo");
  });

  it("identity flow: sends client:'github_app' in the POST body", async () => {
    setOAuthScratch("verifier-1", "state-ok", "identity" satisfies AuthFlow);
    const fetchMock = vi.fn(async () => makeSuccessResponse());
    vi.stubGlobal("fetch", fetchMock);

    await processOAuthCallback("?code=goodcode&state=state-ok");

    const [[, init]] = fetchMock.mock.calls as unknown as [[string, RequestInit]];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body["client"]).toBe("github_app");
    // stored token also carries the client field
    expect(getStoredToken()?.client).toBe("github_app");
  });

  it("submit flow: sends client:'oauth_app' in the POST body", async () => {
    setOAuthScratch("verifier-1", "state-ok", "submit" satisfies AuthFlow);
    const fetchMock = vi.fn(async () => makeSuccessResponse());
    vi.stubGlobal("fetch", fetchMock);

    await processOAuthCallback("?code=goodcode&state=state-ok");

    const [[, init]] = fetchMock.mock.calls as unknown as [[string, RequestInit]];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body["client"]).toBe("oauth_app");
    expect(getStoredToken()?.client).toBe("oauth_app");
  });

  it("no persisted flow defaults to identity (backward-compat): sends client:'github_app'", async () => {
    // setOAuthScratch with only 2 args — the default flow param ("identity") is
    // used, so the flow key IS written as "identity". processOAuthCallback reads
    // "identity" and selects client:"github_app" (backward-compat path).
    setOAuthScratch("verifier-1", "state-ok");
    const fetchMock = vi.fn(async () => makeSuccessResponse());
    vi.stubGlobal("fetch", fetchMock);

    await processOAuthCallback("?code=goodcode&state=state-ok");

    const [[, init]] = fetchMock.mock.calls as unknown as [[string, RequestInit]];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body["client"]).toBe("github_app");
  });

  it("returns exchange-failed when the backend responds non-2xx", async () => {
    setOAuthScratch("verifier-1", "state-ok");
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, status: 400, error: "bad_verification_code" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await processOAuthCallback("?code=badcode&state=state-ok");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("exchange-failed");
    expect(getStoredToken()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// processGoogleOAuthCallback
// ---------------------------------------------------------------------------

const GOOGLE_IDENTITY_KEY = "ks.google.identity";

describe("processGoogleOAuthCallback — state validation", () => {
  it("rejects when the returned state does not match the stored state", async () => {
    setGoogleOAuthScratch("gverifier-1", "gstate-stored");
    const result = await processGoogleOAuthCallback("?code=abc&state=DIFFERENT");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("state-mismatch");
    // No identity should be stored.
    expect(sessionStorage.getItem(GOOGLE_IDENTITY_KEY)).toBeNull();
  });

  it("rejects when no Google state was stored (nothing to validate against)", async () => {
    // sessionStorage is empty — no setGoogleOAuthScratch call.
    const result = await processGoogleOAuthCallback("?code=abc&state=anything");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("state-mismatch");
  });

  it("rejects when the state param itself is absent", async () => {
    setGoogleOAuthScratch("gverifier-1", "gstate-stored");
    // No state= param in the callback URL.
    const result = await processGoogleOAuthCallback("?code=abc");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("state-mismatch");
  });

  it("rejects when the code is missing", async () => {
    setGoogleOAuthScratch("gverifier-1", "gs");
    const result = await processGoogleOAuthCallback("?state=gs");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("missing-code");
  });

  it("surfaces a Google error param (e.g. access_denied)", async () => {
    setGoogleOAuthScratch("gv", "gs");
    const result = await processGoogleOAuthCallback("?error=access_denied&state=gs");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("exchange-failed");
    expect(result.ok === false && result.message).toBe("access_denied");
  });

  it("rejects when the code_verifier is missing (scratch was only partially set)", async () => {
    // Store only the state — not the verifier — to simulate a missing verifier.
    sessionStorage.setItem("ks.google.oauth.state", "gs-no-verifier");
    const result = await processGoogleOAuthCallback("?code=abc&state=gs-no-verifier");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("missing-verifier");
    expect(sessionStorage.getItem(GOOGLE_IDENTITY_KEY)).toBeNull();
  });
});

describe("processGoogleOAuthCallback — happy path", () => {
  it("exchanges the code and stores the identity when state matches", async () => {
    setGoogleOAuthScratch("gverifier-1", "gstate-ok");
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          sub: "1234567890",
          email: "user@example.com",
          email_verified: true,
          name: "Test User",
          picture: "https://example.com/photo.jpg",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await processGoogleOAuthCallback("?code=goodcode&state=gstate-ok");
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    // Identity should be stored in sessionStorage under the google key.
    const identity = getStoredGoogleIdentity();
    expect(identity?.sub).toBe("1234567890");
    expect(identity?.email).toBe("user@example.com");
    expect(identity?.emailVerified).toBe(true);
    expect(identity?.name).toBe("Test User");
    expect(identity?.picture).toBe("https://example.com/photo.jpg");
    // OAuth scratch should be cleared after a successful exchange.
    expect(sessionStorage.getItem("ks.google.oauth.verifier")).toBeNull();
    expect(sessionStorage.getItem("ks.google.oauth.state")).toBeNull();
  });

  it("returns exchange-failed when the backend responds non-2xx, no identity stored", async () => {
    setGoogleOAuthScratch("gverifier-1", "gstate-ok");
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: "invalid_grant" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await processGoogleOAuthCallback("?code=badcode&state=gstate-ok");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("exchange-failed");
    expect(sessionStorage.getItem(GOOGLE_IDENTITY_KEY)).toBeNull();
  });

  it("returns exchange-failed when the backend returns a JSON error body, no identity stored", async () => {
    setGoogleOAuthScratch("gverifier-1", "gstate-ok");
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: "token_exchange_error" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await processGoogleOAuthCallback("?code=badcode&state=gstate-ok");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("exchange-failed");
    expect(sessionStorage.getItem(GOOGLE_IDENTITY_KEY)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// redirectTargetForResult — the URL the boot screen redirects to post-exchange
// ---------------------------------------------------------------------------

describe("redirectTargetForResult", () => {
  const success: OAuthCallbackResult = { ok: true };
  const failure: OAuthCallbackResult = {
    ok: false,
    reason: "exchange-failed",
    message: "irrelevant",
  };

  it("redirects to the app root on success (no error param)", () => {
    expect(redirectTargetForResult("github", success)).toBe("/");
    expect(redirectTargetForResult("google", success)).toBe("/");
  });

  it("carries the safe reason enum in the GitHub error param on failure", () => {
    expect(redirectTargetForResult("github", failure)).toBe(
      "/?oauth_error=exchange-failed",
    );
  });

  it("carries the safe reason enum in the Google error param on failure", () => {
    expect(redirectTargetForResult("google", failure)).toBe(
      "/?google_oauth_error=exchange-failed",
    );
  });
});
