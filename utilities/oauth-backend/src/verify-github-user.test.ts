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
