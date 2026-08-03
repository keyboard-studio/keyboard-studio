/**
 * Unit tests for the fixed-window rate limiter.
 *
 * Three behaviours are load-bearing and each is pinned here so a refactor cannot
 * quietly change them:
 *
 * - the window rolls over and the budget resets (fixed window, not sliding);
 * - the hit that crosses the limit is itself refused, not the one after it;
 * - the limiter fails OPEN when unconfigured or broken, with one [WARN] and no
 *   emoji — a limiter that failed closed would turn a storage outage into a
 *   total sign-in outage (research D-5).
 *
 * The store takes an injectable clock, so rollover is driven deterministically
 * rather than by sleeping.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  MemoryRateLimitStore,
  enforceRateLimit,
  rateLimitKey,
  OAUTH_EXCHANGE_ENDPOINT,
  OAUTH_EXCHANGE_MAX_REQUESTS,
  OAUTH_EXCHANGE_WINDOW_SECONDS,
  type RateLimitStore,
} from "./rate-limit.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * A controllable clock in ms, started exactly on a `windowSeconds` boundary so
 * the Retry-After arithmetic is predictable — an arbitrary start lands
 * mid-window and every remaining-seconds assertion becomes a puzzle.
 */
function fakeClock(windowSeconds = 60, startMs = 1_700_000_000_000) {
  let now = Math.floor(startMs / 1000 / windowSeconds) * windowSeconds * 1000;
  return {
    now: () => now,
    advanceSeconds(seconds: number) {
      now += seconds * 1000;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// MemoryRateLimitStore — counting and the limit boundary
// ---------------------------------------------------------------------------

describe("MemoryRateLimitStore.hit", () => {
  it("allows exactly `limit` hits and refuses the one that crosses it", async () => {
    const store = new MemoryRateLimitStore(fakeClock().now);

    for (let i = 1; i <= 3; i++) {
      const verdict = await store.hit("k", 60, 3);
      expect(verdict.allowed, `hit ${i} of 3 should be allowed`).toBe(true);
    }

    const fourth = await store.hit("k", 60, 3);
    expect(fourth.allowed).toBe(false);
  });

  it("carries a Retry-After of the seconds left in the window, never below 1", async () => {
    const clock = fakeClock();
    const store = new MemoryRateLimitStore(clock.now);

    await store.hit("k", 60, 1);
    // 10s into the window: 50s remain.
    clock.advanceSeconds(10);
    const refused = await store.hit("k", 60, 1);
    expect(refused).toEqual({ allowed: false, retryAfterSeconds: 50 });

    // Last second of the window — the remainder floors to 1, never to 0, so a
    // client that honours Retry-After does not retry into a certain refusal.
    clock.advanceSeconds(49);
    const atEdge = await store.hit("k", 60, 1);
    expect(atEdge).toEqual({ allowed: false, retryAfterSeconds: 1 });
  });

  it("resets the budget when the window rolls over", async () => {
    const clock = fakeClock();
    const store = new MemoryRateLimitStore(clock.now);

    await store.hit("k", 60, 2);
    await store.hit("k", 60, 2);
    expect((await store.hit("k", 60, 2)).allowed).toBe(false);

    clock.advanceSeconds(60);
    expect((await store.hit("k", 60, 2)).allowed).toBe(true);
    expect((await store.hit("k", 60, 2)).allowed).toBe(true);
    expect((await store.hit("k", 60, 2)).allowed).toBe(false);
  });

  it("keeps separate budgets per key", async () => {
    const store = new MemoryRateLimitStore(fakeClock().now);

    expect((await store.hit("a", 60, 1)).allowed).toBe(true);
    expect((await store.hit("a", 60, 1)).allowed).toBe(false);
    // Exhausting one bucket must not spend another's allowance.
    expect((await store.hit("b", 60, 1)).allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// rateLimitKey — stable, non-reversible, endpoint-scoped
// ---------------------------------------------------------------------------

describe("rateLimitKey", () => {
  it("is stable for the same endpoint and address", () => {
    expect(rateLimitKey("oauth/exchange", "203.0.113.7")).toBe(
      rateLimitKey("oauth/exchange", "203.0.113.7"),
    );
  });

  it("never contains the raw address", () => {
    const ip = "203.0.113.7";
    const key = rateLimitKey("oauth/exchange", ip);
    expect(key).not.toContain(ip);
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });

  it("separates endpoints and addresses", () => {
    expect(rateLimitKey("oauth/exchange", "203.0.113.7")).not.toBe(
      rateLimitKey("oauth/refresh", "203.0.113.7"),
    );
    expect(rateLimitKey("oauth/exchange", "203.0.113.7")).not.toBe(
      rateLimitKey("oauth/exchange", "203.0.113.8"),
    );
  });

  it("collapses a missing or blank address into one shared bucket", () => {
    const fromNull = rateLimitKey("oauth/exchange", null);
    expect(rateLimitKey("oauth/exchange", "")).toBe(fromNull);
    expect(rateLimitKey("oauth/exchange", "   ")).toBe(fromNull);
    // Address-less callers share a budget rather than bypassing the limiter.
    expect(fromNull).not.toBe(rateLimitKey("oauth/exchange", "203.0.113.7"));
  });

  it("ignores surrounding whitespace on an address", () => {
    expect(rateLimitKey("oauth/exchange", " 203.0.113.7 ")).toBe(
      rateLimitKey("oauth/exchange", "203.0.113.7"),
    );
  });
});

// ---------------------------------------------------------------------------
// enforceRateLimit — the fail-open rule both edges share
// ---------------------------------------------------------------------------

describe("enforceRateLimit", () => {
  it("fails open with a single [WARN] when no store is configured", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const verdict = await enforceRateLimit(null, "k", 60, 1);

    expect(verdict).toEqual({ allowed: true });
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain("[WARN]");
    // Article VIII: no emoji in console output (they break Windows terminals).
    expect(message).toMatch(/^[\x20-\x7E]+$/);
  });

  it("fails open with a single [WARN] when the store throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const broken: RateLimitStore = {
      hit: () => Promise.reject(new Error("connection refused")),
    };

    const verdict = await enforceRateLimit(broken, "k", 60, 1);

    expect(verdict).toEqual({ allowed: true });
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain("[WARN]");
    expect(message).toMatch(/^[\x20-\x7E]+$/);
  });

  it("does not leak the store's failure into the log line", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const broken: RateLimitStore = {
      hit: () => Promise.reject(new Error("postgres://user:secret@db.internal:5432")),
    };

    await enforceRateLimit(broken, "k", 60, 1);

    expect(String(warn.mock.calls[0]?.[0])).not.toContain("secret");
  });

  it("passes a configured store's verdict through unchanged", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = new MemoryRateLimitStore(fakeClock().now);

    expect(await enforceRateLimit(store, "k", 60, 1)).toEqual({ allowed: true });
    expect(await enforceRateLimit(store, "k", 60, 1)).toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    });
    // A working limiter is silent — the [WARN] is reserved for degradation.
    expect(warn).not.toHaveBeenCalled();
  });

  it("never logs the bucket key, so no address-derived value reaches the log", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const key = rateLimitKey(OAUTH_EXCHANGE_ENDPOINT, "203.0.113.7");

    await enforceRateLimit(null, key, 60, 1);

    expect(String(warn.mock.calls[0]?.[0])).not.toContain(key);
  });
});

// ---------------------------------------------------------------------------
// Operational parameters
// ---------------------------------------------------------------------------

describe("exchange limiter parameters", () => {
  it("bound the endpoint without throttling a realistic sign-in cohort", () => {
    expect(OAUTH_EXCHANGE_WINDOW_SECONDS).toBeGreaterThan(0);
    // A single author's sign-in is one hit, so the budget must comfortably
    // exceed a cohort behind one NAT while still being finite.
    expect(OAUTH_EXCHANGE_MAX_REQUESTS).toBeGreaterThanOrEqual(10);
    expect(Number.isFinite(OAUTH_EXCHANGE_MAX_REQUESTS)).toBe(true);
  });

  it("exhausts the exchange budget at exactly its configured limit", async () => {
    const store = new MemoryRateLimitStore(fakeClock().now);
    const key = rateLimitKey(OAUTH_EXCHANGE_ENDPOINT, "203.0.113.7");

    for (let i = 0; i < OAUTH_EXCHANGE_MAX_REQUESTS; i++) {
      const verdict = await enforceRateLimit(
        store,
        key,
        OAUTH_EXCHANGE_WINDOW_SECONDS,
        OAUTH_EXCHANGE_MAX_REQUESTS,
      );
      expect(verdict.allowed).toBe(true);
    }

    const refused = await enforceRateLimit(
      store,
      key,
      OAUTH_EXCHANGE_WINDOW_SECONDS,
      OAUTH_EXCHANGE_MAX_REQUESTS,
    );
    expect(refused.allowed).toBe(false);
  });
});
