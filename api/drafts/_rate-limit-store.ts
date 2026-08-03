// Postgres-backed RateLimitStore for the deployed serverless functions.
//
// Lives beside _store.ts and for the same reason: this is the only place the
// Vercel storage SDK is touched for rate limiting, so the shared core
// (utilities/oauth-backend/src/rate-limit.ts) stays infra-agnostic and the
// standalone Fastify server keeps using MemoryRateLimitStore with none of this.
//
// It is in api/drafts/ rather than api/oauth/ because the table it owns lives in
// the same Postgres database provisioned for drafts and is created by the same
// api/drafts/schema.sql. The consumer is api/oauth/exchange.ts.
//
// Why Postgres and not process memory: Vercel gives no reliable cross-invocation
// memory, so a per-instance counter is unenforceable — an attacker spread across
// instances defeats it. The counter has to be shared to bound anything.

import { sql } from "@vercel/postgres";
import type {
  RateLimitStore,
  RateLimitVerdict,
} from "../../utilities/oauth-backend/src/rate-limit.js";

export class VercelRateLimitStore implements RateLimitStore {
  async hit(key: string, windowSeconds: number, limit: number): Promise<RateLimitVerdict> {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const windowStart = Math.floor(nowSeconds / windowSeconds) * windowSeconds;

    // One statement: insert-or-increment and read back the post-increment count.
    // Doing it in a single round trip is what makes the counter correct under
    // concurrency — a read-then-write from two instances would lose increments
    // and let an attacker exceed the limit by racing.
    const { rows } = await sql`
      INSERT INTO rate_limit_hits (bucket_key, window_start, hits)
      VALUES (${key}, ${windowStart}, 1)
      ON CONFLICT (bucket_key, window_start) DO UPDATE
        SET hits = rate_limit_hits.hits + 1
      RETURNING hits
    `;

    const row = rows[0];
    // No row back means the upsert did not report a count. Treat as allowed
    // rather than inventing a refusal: enforceRateLimit's fail-open rule applies
    // to operational faults, and a limiter is not worth a sign-in outage.
    if (row === undefined) return { allowed: true };

    const hits = Number(row["hits"]);
    if (hits > limit) {
      const remaining = windowStart + windowSeconds - nowSeconds;
      return { allowed: false, retryAfterSeconds: Math.max(1, remaining) };
    }
    return { allowed: true };
  }
}
