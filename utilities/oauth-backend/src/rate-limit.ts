/**
 * Fixed-window rate limiting for the unauthenticated endpoints that make
 * outbound provider calls, framework- and infra-agnostic in the same way
 * `draft-store.ts` is: the interface lives here, the deployed Vercel functions
 * supply a Postgres-backed store, and tests plus the standalone Fastify server
 * use {@link MemoryRateLimitStore}.
 *
 * Why a store and not a counter: Vercel gives no reliable cross-invocation
 * memory, so an in-process counter is unenforceable — an attacker spread across
 * instances defeats it while it still costs code. Shared state is the only thing
 * that actually bounds abuse.
 *
 * Two properties are load-bearing and deliberate:
 *
 * - **The key holds no address.** {@link rateLimitKey} returns a one-way digest
 *   of the endpoint plus the client address, so nothing downstream — the table,
 *   a log line, an error body — ever carries a raw IP.
 * - **The limiter fails open.** When no store is configured, or when the store
 *   throws, {@link enforceRateLimit} allows the request and logs one `[WARN]`.
 *   A limiter that failed closed would turn a storage outage into a total
 *   sign-in outage. This is scoped to *limits*: identity verification still
 *   fails closed, which is the rule that protects authorization.
 */

import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Verdict + store contract
// ---------------------------------------------------------------------------

export type RateLimitVerdict =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export interface RateLimitStore {
  /**
   * Record one hit against `key` in the current `windowSeconds` window and
   * report whether the caller is still inside `limit`.
   *
   * Counting happens before the comparison, so the hit that crosses the limit is
   * itself refused. `retryAfterSeconds` is the whole seconds remaining until the
   * current window rolls over, never below 1 (a `Retry-After: 0` would invite an
   * immediate retry that is certain to be refused again).
   */
  hit(key: string, windowSeconds: number, limit: number): Promise<RateLimitVerdict>;
}

// ---------------------------------------------------------------------------
// Bucket key
// ---------------------------------------------------------------------------

/** Bucket for callers whose address the platform did not give us. */
const UNKNOWN_CLIENT = "unknown-client";

/**
 * Stable, non-reversible bucket key for one endpoint and one client address.
 *
 * SHA-256 over `endpoint` and the address, hex-truncated: stable across
 * invocations (so a fixed window accumulates), and one-way, so the stored key
 * cannot be turned back into an address. The endpoint discriminator keeps each
 * endpoint's budget separate — hammering the exchange must not consume some
 * other endpoint's allowance.
 *
 * A null/empty address collapses to a single shared bucket rather than being
 * waved through: address-less callers collectively get one budget, which is the
 * conservative reading, and it means a platform that stops populating the
 * forwarded-for header degrades into over-limiting rather than into no limit at
 * all.
 *
 * Note the digest is not a secret — the IPv4 space is small enough to
 * enumerate, so a key plus an offline sweep can recover the address it came
 * from. It is a storage- and log-hygiene measure (no address is ever *written*),
 * not a cryptographic guarantee against an attacker who already holds the table.
 */
export function rateLimitKey(endpoint: string, clientIp: string | null): string {
  const client = clientIp === null || clientIp.trim() === "" ? UNKNOWN_CLIENT : clientIp.trim();
  return createHash("sha256").update(`${endpoint}\n${client}`).digest("hex").slice(0, 32);
}

// ---------------------------------------------------------------------------
// Operational parameters — POST /oauth/exchange
//
// Tunable without a spec revision (spec 054 Assumptions). Sized so a real
// cohort behind one NAT — a workshop signing in together — never trips, while
// an abuser gets a bounded number of outbound token exchanges per minute
// instead of an unbounded one. The exchange runs once per sign-in, so a single
// author contributes one hit.
// ---------------------------------------------------------------------------

/** Window length for the `/oauth/exchange` limiter, in seconds. */
export const OAUTH_EXCHANGE_WINDOW_SECONDS = 60;

/** Maximum `/oauth/exchange` requests per window, per hashed client address. */
export const OAUTH_EXCHANGE_MAX_REQUESTS = 30;

/** Endpoint discriminator for the `/oauth/exchange` bucket. */
export const OAUTH_EXCHANGE_ENDPOINT = "oauth/exchange";

// ---------------------------------------------------------------------------
// Memory implementation
// ---------------------------------------------------------------------------

/**
 * In-memory fixed-window {@link RateLimitStore} for unit tests and the
 * standalone dev server. Per-process, so it is not enforceable across serverless
 * instances — never use it in production; that is what the Postgres store is
 * for.
 *
 * `now` is injectable so tests drive window rollover deterministically instead of
 * sleeping.
 */
export class MemoryRateLimitStore implements RateLimitStore {
  /** key -> { windowStart (epoch seconds, floored), hits } */
  private readonly buckets = new Map<string, { windowStart: number; hits: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  hit(key: string, windowSeconds: number, limit: number): Promise<RateLimitVerdict> {
    const nowSeconds = Math.floor(this.now() / 1000);
    const windowStart = Math.floor(nowSeconds / windowSeconds) * windowSeconds;

    const existing = this.buckets.get(key);
    // A bucket from an earlier window is replaced, not merged — that is what
    // makes the window fixed, and it keeps the map from growing per window.
    const bucket =
      existing !== undefined && existing.windowStart === windowStart
        ? existing
        : { windowStart, hits: 0 };
    bucket.hits += 1;
    this.buckets.set(key, bucket);

    if (bucket.hits > limit) {
      const remaining = windowStart + windowSeconds - nowSeconds;
      return Promise.resolve({ allowed: false, retryAfterSeconds: Math.max(1, remaining) });
    }
    return Promise.resolve({ allowed: true });
  }
}

// ---------------------------------------------------------------------------
// Fail-open wrapper — the one both deployments call
// ---------------------------------------------------------------------------

/**
 * Apply the limiter, failing open on every operational problem.
 *
 * Both HTTP edges call this rather than `store.hit` directly, so the fail-open
 * rule and its `[WARN]` line are written once and cannot drift between the
 * serverless and standalone deployments.
 *
 * - No store configured -> allowed, one `[WARN]`.
 * - Store throws -> allowed, one `[WARN]`. A storage outage must not become a
 *   sign-in outage.
 * - Otherwise the store's verdict, verbatim.
 */
export async function enforceRateLimit(
  store: RateLimitStore | null | undefined,
  key: string,
  windowSeconds: number,
  limit: number,
): Promise<RateLimitVerdict> {
  if (store === null || store === undefined) {
    console.warn(
      "[WARN] rate limiting is disabled: no rate-limit store is configured, so this endpoint is unmetered.",
    );
    return { allowed: true };
  }

  try {
    return await store.hit(key, windowSeconds, limit);
  } catch {
    console.warn(
      "[WARN] rate limiting is degraded: the rate-limit store failed, so this request was allowed unmetered.",
    );
    return { allowed: true };
  }
}
