// Tests for githubOAuth — PKCE generation, the token store, and scope helpers.
//
// Browser-only crypto (crypto.subtle / getRandomValues / randomUUID) comes from
// the Node global `crypto` (a default global on Node >= 20; polyfilled for older
// runtimes in src/test-setup.ts — jsdom does NOT provide it). sessionStorage is
// provided by the jsdom environment.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  beginAuthorize,
  computeS256Challenge,
  generatePkce,
  buildAuthorizeUrl,
  getStoredVerifier,
  getStoredState,
  getStoredFlow,
  setStoredToken,
  getStoredToken,
  clearStoredToken,
  hasRequiredScope,
  REQUIRED_SCOPE,
  type StoredGitHubToken,
} from "./githubOAuth.ts";

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// PKCE — S256 challenge for a known verifier (RFC 7636 §A test vector)
// ---------------------------------------------------------------------------

describe("computeS256Challenge", () => {
  it("matches the RFC 7636 canonical test vector", async () => {
    // RFC 7636 Appendix A:
    //   verifier  = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    //   challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = await computeS256Challenge(verifier);
    expect(challenge).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("produces a base64url challenge (no +, /, or = padding)", async () => {
    const challenge = await computeS256Challenge("some-verifier-value");
    expect(challenge).not.toMatch(/[+/=]/);
  });
});

describe("generatePkce", () => {
  it("verifier length is within the RFC 7636 43-128 range", async () => {
    const { verifier } = await generatePkce();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
  });

  it("verifier uses only the unreserved base64url alphabet", async () => {
    const { verifier } = await generatePkce();
    expect(verifier).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it("challenge equals the S256 of the generated verifier", async () => {
    const { verifier, challenge } = await generatePkce();
    expect(challenge).toBe(await computeS256Challenge(verifier));
  });
});

// ---------------------------------------------------------------------------
// buildAuthorizeUrl
// ---------------------------------------------------------------------------

describe("buildAuthorizeUrl", () => {
  it("omits the scope parameter entirely when no scope is given (identity / GitHub App flow)", () => {
    const url = buildAuthorizeUrl({
      clientId: "cid123",
      redirectUri: "https://app.example/oauth/callback",
      state: "state-abc",
      codeChallenge: "chal-xyz",
    });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      "https://github.com/login/oauth/authorize",
    );
    expect(parsed.searchParams.get("client_id")).toBe("cid123");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://app.example/oauth/callback",
    );
    // Identity flow: NO scope param at all — GitHub App sends no scope.
    expect(parsed.searchParams.has("scope")).toBe(false);
    expect(parsed.searchParams.get("state")).toBe("state-abc");
    expect(parsed.searchParams.get("code_challenge")).toBe("chal-xyz");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("includes the scope param when explicitly provided (submit / OAuth App flow)", () => {
    const url = buildAuthorizeUrl({
      clientId: "cid123",
      redirectUri: "https://app.example/oauth/callback",
      state: "state-abc",
      codeChallenge: "chal-xyz",
      scope: REQUIRED_SCOPE,
    });
    expect(new URL(url).searchParams.get("scope")).toBe(REQUIRED_SCOPE);
  });
});

// ---------------------------------------------------------------------------
// beginAuthorize — the security-critical wiring of generatePkce + randomUUID +
// setOAuthScratch + buildAuthorizeUrl. The sub-functions are covered above; this
// asserts the composition: scratch is persisted AND the same verifier/state are
// what the returned URL commits to.
// ---------------------------------------------------------------------------

describe("beginAuthorize", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws when the GitHub App client id is not configured (identity flow)", async () => {
    vi.stubEnv("VITE_GITHUB_CLIENT_ID", "");
    await expect(beginAuthorize("identity")).rejects.toThrow(/VITE_GITHUB_CLIENT_ID/);
  });

  it("throws when the OAuth App client id is not configured (submit flow)", async () => {
    vi.stubEnv("VITE_GITHUB_OAUTH_CLIENT_ID", "");
    await expect(beginAuthorize("submit")).rejects.toThrow(/VITE_GITHUB_OAUTH_CLIENT_ID/);
  });

  it("identity flow: uses the GitHub App client id and sends NO scope", async () => {
    vi.stubEnv("VITE_GITHUB_CLIENT_ID", "Iv23-github-app-client");
    vi.stubEnv("VITE_GITHUB_OAUTH_CLIENT_ID", "Ov23-oauth-app-client");

    const url = await beginAuthorize("identity");
    const parsed = new URL(url);

    expect(parsed.searchParams.get("client_id")).toBe("Iv23-github-app-client");
    // No scope param at all for the identity/GitHub App flow.
    expect(parsed.searchParams.has("scope")).toBe(false);
    // Flow is persisted in scratch.
    expect(getStoredFlow()).toBe("identity");
  });

  it("submit flow: uses the OAuth App client id and sends public_repo scope", async () => {
    vi.stubEnv("VITE_GITHUB_CLIENT_ID", "Iv23-github-app-client");
    vi.stubEnv("VITE_GITHUB_OAUTH_CLIENT_ID", "Ov23-oauth-app-client");

    const url = await beginAuthorize("submit");
    const parsed = new URL(url);

    expect(parsed.searchParams.get("client_id")).toBe("Ov23-oauth-app-client");
    expect(parsed.searchParams.get("scope")).toBe("public_repo");
    // Flow is persisted in scratch.
    expect(getStoredFlow()).toBe("submit");
  });

  it("persists the verifier+state and binds them into the authorize URL", async () => {
    vi.stubEnv("VITE_GITHUB_CLIENT_ID", "seeded-client-id");

    const url = await beginAuthorize("identity");

    // Scratch state is persisted for the post-redirect callback to validate.
    const verifier = getStoredVerifier();
    const state = getStoredState();
    expect(verifier).not.toBeNull();
    expect(state).not.toBeNull();

    const parsed = new URL(url);
    // The URL commits to the seeded client id and the persisted state...
    expect(parsed.searchParams.get("client_id")).toBe("seeded-client-id");
    expect(parsed.searchParams.get("state")).toBe(state);
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      `${window.location.origin}/oauth/callback`,
    );
    // ...and the challenge is the S256 of the verifier that was actually stored
    // (i.e. the verifier the token-exchange step will replay matches the URL).
    expect(parsed.searchParams.get("code_challenge")).toBe(
      await computeS256Challenge(verifier as string),
    );
  });

  it("defaults to the identity flow when no argument is given (sign-up never requests public_repo)", async () => {
    vi.stubEnv("VITE_GITHUB_CLIENT_ID", "seeded-client-id");
    const url = await beginAuthorize();
    expect(new URL(url).searchParams.has("scope")).toBe(false);
    expect(getStoredFlow()).toBe("identity");
  });

  it("uses a fresh state on each call (no state reuse across authorize attempts)", async () => {
    vi.stubEnv("VITE_GITHUB_CLIENT_ID", "seeded-client-id");

    const firstUrl = await beginAuthorize();
    const firstState = getStoredState();

    const secondUrl = await beginAuthorize();
    const secondState = getStoredState();

    expect(secondState).not.toBe(firstState);
    expect(new URL(secondUrl).searchParams.get("state")).not.toBe(
      new URL(firstUrl).searchParams.get("state"),
    );
  });
});

// ---------------------------------------------------------------------------
// Token store — sessionStorage round-trip, never reads localStorage
// ---------------------------------------------------------------------------

describe("token store", () => {
  const sample: StoredGitHubToken = {
    accessToken: "ghp_abc",
    tokenType: "bearer",
    scope: "public_repo",
    client: "github_app",
  };

  it("set / get round-trips via sessionStorage (with client field)", () => {
    expect(getStoredToken()).toBeNull();
    setStoredToken(sample);
    expect(getStoredToken()).toEqual(sample);
  });

  it("round-trips an oauth_app token with client field intact", () => {
    const oauthToken: StoredGitHubToken = {
      accessToken: "ghp_oauth",
      tokenType: "bearer",
      scope: "public_repo",
      client: "oauth_app",
    };
    setStoredToken(oauthToken);
    expect(getStoredToken()?.client).toBe("oauth_app");
  });

  it("defaults client to github_app when reading a token stored without the client field", () => {
    // Simulate a token persisted before the two-flow upgrade (no `client` field).
    const legacy = { accessToken: "ghp_legacy", tokenType: "bearer", scope: "" };
    sessionStorage.setItem("ks.github.token", JSON.stringify(legacy));
    expect(getStoredToken()?.client).toBe("github_app");
  });

  it("clear removes the stored token", () => {
    setStoredToken(sample);
    clearStoredToken();
    expect(getStoredToken()).toBeNull();
  });

  it("reads nothing from localStorage (tab-scoped only)", () => {
    // Seed localStorage with a token under the same logical key — getStoredToken
    // must NOT pick it up.
    localStorage.setItem("ks.github.token", JSON.stringify(sample));
    expect(getStoredToken()).toBeNull();
  });

  it("setStoredToken writes only to sessionStorage, not localStorage", () => {
    setStoredToken(sample);
    expect(sessionStorage.getItem("ks.github.token")).not.toBeNull();
    expect(localStorage.getItem("ks.github.token")).toBeNull();
  });

  it("returns null for an unparseable stored value", () => {
    sessionStorage.setItem("ks.github.token", "{not json");
    expect(getStoredToken()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// hasRequiredScope
// ---------------------------------------------------------------------------

describe("hasRequiredScope", () => {
  it("false for null", () => {
    expect(hasRequiredScope(null)).toBe(false);
  });
  it("false when ok but scope missing", () => {
    expect(
      hasRequiredScope({ ok: false, scopes: [], missingScopes: ["public_repo"] }),
    ).toBe(false);
  });
  it("true when ok with no missing scopes", () => {
    expect(
      hasRequiredScope({
        ok: true,
        login: "u",
        scopes: ["public_repo"],
        missingScopes: [],
      }),
    ).toBe(true);
  });
});
