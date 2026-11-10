import { describe, it, expect } from "vitest";
import {
  authenticateSubmitter,
  signSessionToken,
  verifySessionToken,
  withSessionToken,
  SESSION_TOKEN_TTL_SECONDS,
} from "./submitter-auth.js";
import type { OAuthFetchFn } from "./handlers.js";

const KEY = "unit-test-key";
const ID = { sub: "123", email: "author@example.org", name: "Author" };
const NOW = 1_800_000_000_000;

const noFetch: OAuthFetchFn = () => Promise.reject(new Error("fetch must not be called"));

function githubUser(status: number, body: unknown): { fetch: OAuthFetchFn; urls: string[] } {
  const urls: string[] = [];
  return {
    urls,
    fetch: (url) => {
      urls.push(url);
      return Promise.resolve({ ok: status === 200, status, json: () => Promise.resolve(body) });
    },
  };
}

describe("session token", () => {
  it("round-trips the identity claims", () => {
    const claims = verifySessionToken(signSessionToken(ID, KEY, NOW), KEY, NOW);
    expect(claims).toMatchObject({ prov: "google", ...ID });
  });

  it("is refused after it expires", () => {
    const token = signSessionToken(ID, KEY, NOW);
    expect(verifySessionToken(token, KEY, NOW + SESSION_TOKEN_TTL_SECONDS * 1000 + 1)).toBeNull();
  });

  it("is refused under a different key", () => {
    expect(verifySessionToken(signSessionToken(ID, KEY, NOW), "other-key", NOW)).toBeNull();
  });

  it("is refused when the payload is altered", () => {
    const [prefix, , sig] = signSessionToken(ID, KEY, NOW).split(".");
    const forged = Buffer.from(JSON.stringify({ prov: "google", ...ID, email: "x@evil.test", exp: 9e9 })).toString("base64url");
    expect(verifySessionToken(`${prefix}.${forged}.${sig}`, KEY, NOW)).toBeNull();
  });

  it("withSessionToken adds a token only when a key is configured", () => {
    expect(withSessionToken(ID, null)).not.toHaveProperty("sessionToken");
    expect(withSessionToken(ID, KEY, NOW).sessionToken).toMatch(/^kss1\./);
  });
});

describe("authenticateSubmitter", () => {
  it("accepts a valid session token without calling GitHub", async () => {
    const token = signSessionToken(ID, KEY, NOW);
    const who = await authenticateSubmitter(`Bearer ${token}`, { sessionKey: KEY, fetch: noFetch, now: () => NOW });
    expect(who).toEqual({ provider: "google", email: ID.email, name: ID.name });
  });

  it("refuses a session token when no signing key is configured", async () => {
    const token = signSessionToken(ID, KEY, NOW);
    expect(await authenticateSubmitter(`Bearer ${token}`, { sessionKey: null, fetch: noFetch })).toBeNull();
  });

  it("accepts a GitHub token that resolves to a user", async () => {
    const gh = githubUser(200, { login: "octo" });
    const who = await authenticateSubmitter("Bearer gho_abc", { sessionKey: KEY, fetch: gh.fetch });
    expect(who).toEqual({ provider: "github", login: "octo" });
    expect(gh.urls).toEqual(["https://api.github.com/user"]);
  });

  it("refuses a GitHub token GitHub rejects", async () => {
    const gh = githubUser(401, {});
    expect(await authenticateSubmitter("Bearer gho_bad", { sessionKey: KEY, fetch: gh.fetch })).toBeNull();
  });

  it("refuses a missing or malformed header", async () => {
    expect(await authenticateSubmitter(null, { sessionKey: KEY, fetch: noFetch })).toBeNull();
    expect(await authenticateSubmitter("Basic abc", { sessionKey: KEY, fetch: noFetch })).toBeNull();
  });
});
