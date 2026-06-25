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
  it("includes the PKCE + flow params with S256 method and public_repo scope", () => {
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
    expect(parsed.searchParams.get("scope")).toBe(REQUIRED_SCOPE);
    expect(parsed.searchParams.get("state")).toBe("state-abc");
    expect(parsed.searchParams.get("code_challenge")).toBe("chal-xyz");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
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

  it("throws when the client id is not configured", async () => {
    vi.stubEnv("VITE_GITHUB_CLIENT_ID", "");
    await expect(beginAuthorize()).rejects.toThrow(/not configured/i);
  });

  it("persists the verifier+state and binds them into the authorize URL", async () => {
    vi.stubEnv("VITE_GITHUB_CLIENT_ID", "seeded-client-id");

    const url = await beginAuthorize();

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
  };

  it("set / get round-trips via sessionStorage", () => {
    expect(getStoredToken()).toBeNull();
    setStoredToken(sample);
    expect(getStoredToken()).toEqual(sample);
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
