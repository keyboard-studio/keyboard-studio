/**
 * Unit tests for GitHub identity verification (verify-github-user.ts).
 *
 * All tests use an injected stub fetch — no real network calls.
 */

import { describe, it, expect } from "vitest";
import { parseBearer, verifyGitHubUser } from "./verify-github-user.js";
import type { OAuthFetchFn } from "./handlers.js";

function stubFetch(response: unknown, ok = true, status = 200): OAuthFetchFn {
  return async () => ({ ok, status, json: async () => response });
}

describe("parseBearer()", () => {
  it("extracts a Bearer token", () => {
    expect(parseBearer("Bearer gho_abc123")).toBe("gho_abc123");
  });

  it("extracts a token-scheme token (GitHub convention) and is case-insensitive", () => {
    expect(parseBearer("token gho_x")).toBe("gho_x");
    expect(parseBearer("BEARER gho_y")).toBe("gho_y");
  });

  it("returns null for missing / malformed / empty headers", () => {
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer(undefined)).toBeNull();
    expect(parseBearer("")).toBeNull();
    expect(parseBearer("gho_no_scheme")).toBeNull();
    expect(parseBearer("Bearer   ")).toBeNull();
  });
});

describe("verifyGitHubUser()", () => {
  it("returns id + login on a successful /user response", async () => {
    const user = await verifyGitHubUser(
      "gho_abc",
      stubFetch({ id: 4144632, login: "octocat", name: "The Octocat" }),
    );
    expect(user).toEqual({ id: 4144632, login: "octocat" });
  });

  it("returns null for a null/empty token without calling fetch", async () => {
    let called = false;
    const spy: OAuthFetchFn = async () => {
      called = true;
      return { ok: true, status: 200, json: async () => ({ id: 1, login: "x" }) };
    };
    expect(await verifyGitHubUser(null, spy)).toBeNull();
    expect(await verifyGitHubUser("", spy)).toBeNull();
    expect(called).toBe(false);
  });

  it("returns null on a non-ok response (revoked/invalid token)", async () => {
    expect(await verifyGitHubUser("gho_bad", stubFetch({}, false, 401))).toBeNull();
  });

  it("returns null when the payload lacks a numeric id or string login", async () => {
    expect(await verifyGitHubUser("t", stubFetch({ login: "octocat" }))).toBeNull();
    expect(await verifyGitHubUser("t", stubFetch({ id: "not-a-number", login: "x" }))).toBeNull();
    expect(await verifyGitHubUser("t", stubFetch(null))).toBeNull();
  });

  it("returns null when fetch throws (network failure)", async () => {
    const throwing: OAuthFetchFn = async () => {
      throw new Error("network down");
    };
    expect(await verifyGitHubUser("t", throwing)).toBeNull();
  });

  it("sends a Bearer Authorization header and a User-Agent", async () => {
    let seen: Record<string, string> | undefined;
    const spy: OAuthFetchFn = async (_url, init) => {
      seen = init?.headers as Record<string, string>;
      return { ok: true, status: 200, json: async () => ({ id: 1, login: "x" }) };
    };
    await verifyGitHubUser("gho_tok", spy);
    expect(seen?.["Authorization"]).toBe("Bearer gho_tok");
    expect(seen?.["User-Agent"]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Token provenance — X-OAuth-Client-ID (FR-012, research D-3)
// ---------------------------------------------------------------------------

/** A valid `/user` response carrying (or omitting) the provenance header. */
function stubFetchWithClientId(clientId: string | null): OAuthFetchFn {
  return async () => ({
    ok: true,
    status: 200,
    headers: { get: (name: string) => (/^x-oauth-client-id$/i.test(name) ? clientId : null) },
    json: async () => ({ id: 7, login: "octocat" }),
  });
}

const APP_ID = "Iv23liTHISAPP";
const OAUTH_APP_ID = "Ov23liTHISAPP";
const BOTH_IDS = [APP_ID, OAUTH_APP_ID] as const;

describe("verifyGitHubUser() — token provenance", () => {
  it("refuses a token issued to a foreign client id", async () => {
    const user = await verifyGitHubUser("gho_foreign", stubFetchWithClientId("Iv23liSOMEONEELSE"), {
      allowedClientIds: BOTH_IDS,
    });
    expect(user).toBeNull();
  });

  it("accepts BOTH configured ids — the App pair and the classic OAuth App pair", async () => {
    // Accepting only GITHUB_CLIENT_ID would refuse Option A's public_repo
    // tokens on the draft endpoints (research D-3).
    for (const configured of BOTH_IDS) {
      const user = await verifyGitHubUser("gho_ok", stubFetchWithClientId(configured), {
        allowedClientIds: BOTH_IDS,
      });
      expect(user, `client id ${configured}`).toEqual({ id: 7, login: "octocat" });
    }
  });

  it("passes when the header is absent (fail-open, recorded deliberately)", async () => {
    const user = await verifyGitHubUser("gho_ok", stubFetchWithClientId(null), {
      allowedClientIds: BOTH_IDS,
    });
    expect(user).toEqual({ id: 7, login: "octocat" });
  });

  it("passes when the adapter surfaces no headers at all", async () => {
    // stubFetch() returns a bare { ok, status, json } — the pre-FR-012 shape.
    const user = await verifyGitHubUser("gho_ok", stubFetch({ id: 7, login: "octocat" }), {
      allowedClientIds: BOTH_IDS,
    });
    expect(user).toEqual({ id: 7, login: "octocat" });
  });

  it("disables the check for an empty or omitted allow-list", async () => {
    const foreign = stubFetchWithClientId("Iv23liSOMEONEELSE");
    expect(await verifyGitHubUser("t", foreign, { allowedClientIds: [] })).toEqual({
      id: 7,
      login: "octocat",
    });
    expect(await verifyGitHubUser("t", foreign, {})).toEqual({ id: 7, login: "octocat" });
    expect(await verifyGitHubUser("t", foreign)).toEqual({ id: 7, login: "octocat" });
  });

  it("looks the header up case-insensitively", async () => {
    // GitHub sends `X-OAuth-Client-ID`; a Web Headers object lowercases names.
    const lowercased: OAuthFetchFn = async () => ({
      ok: true,
      status: 200,
      headers: { get: (name: string) => (name.toLowerCase() === "x-oauth-client-id" ? APP_ID : null) },
      json: async () => ({ id: 7, login: "octocat" }),
    });
    expect(await verifyGitHubUser("t", lowercased, { allowedClientIds: BOTH_IDS })).toEqual({
      id: 7,
      login: "octocat",
    });
  });
});
