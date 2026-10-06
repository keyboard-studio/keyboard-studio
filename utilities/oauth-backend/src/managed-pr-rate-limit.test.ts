// Unit tests for the managed-PR rate limiter (security audit run-1:
// managed-pr:anonymous-unbounded-installation-token-mint).
//
// The Postgres-backed window itself is not exercised here (no DB in unit
// tests); these pin the pure helpers and the fail-open contract.

import { describe, it, expect } from "vitest";
import {
  checkManagedPRRateLimit,
  hashIp,
  vercelClientIp,
} from "./managed-pr-rate-limit.js";

describe("hashIp", () => {
  it("is deterministic", () => {
    expect(hashIp("1.2.3.4")).toBe(hashIp("1.2.3.4"));
  });

  it("differs per IP and never embeds the raw IP", () => {
    const h = hashIp("1.2.3.4");
    expect(h).not.toBe(hashIp("5.6.7.8"));
    expect(h).not.toContain("1.2.3.4");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("vercelClientIp", () => {
  const req = (headers: Record<string, string>) =>
    new Request("https://app.example/submit/managed-pr", { headers });

  it("takes the first x-forwarded-for entry", () => {
    expect(
      vercelClientIp(req({ "x-forwarded-for": "9.9.9.9, 10.0.0.1, 10.0.0.2" })),
    ).toBe("9.9.9.9");
  });

  it("falls back to x-real-ip", () => {
    expect(vercelClientIp(req({ "x-real-ip": "8.8.8.8" }))).toBe("8.8.8.8");
  });

  it("returns null when no IP headers are present", () => {
    expect(vercelClientIp(req({}))).toBeNull();
  });
});

describe("checkManagedPRRateLimit", () => {
  it("allows when no IP is known", async () => {
    expect(await checkManagedPRRateLimit(null)).toEqual({ allowed: true });
  });

  it("fails open when the DB is unavailable (no POSTGRES_URL in tests)", async () => {
    // The throttle must never block legitimate submissions on
    // infrastructure absence — the pre-existing state is unthrottled.
    expect(await checkManagedPRRateLimit("1.2.3.4")).toEqual({ allowed: true });
  });
});
