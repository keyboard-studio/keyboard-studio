/**
 * Per-IP + global sliding-window rate limiter for the anonymous managed-PR
 * route (security audit run-1:
 * managed-pr:anonymous-unbounded-installation-token-mint).
 *
 * Each valid anonymous submission mints a GitHub App installation token and
 * performs ~7 API calls plus a persistent branch + draft PR, so an
 * unthrottled route lets one caller burn the org installation's shared API
 * budget and pile up branches. Vercel serverless functions share no memory,
 * so the window state lives in Postgres (the same Vercel Postgres / Neon the
 * drafts store uses). Raw IPs are never stored — only their SHA-256 hash.
 *
 * Failure mode is fail-open: if the DB is unreachable or unconfigured, the
 * check passes and the request proceeds. Blocking legitimate submissions on
 * throttle-infrastructure absence would be worse than the pre-existing
 * unthrottled state. The recommended front-line control is a Vercel Firewall
 * per-IP rule in front of /submit/managed-pr; this module is the
 * application-level backstop that also covers the standalone server.
 *
 * Table setup (idempotent, apply once per environment):
 *   psql "$POSTGRES_URL" -f api/submit/schema.sql
 */

import { sql } from "@vercel/postgres";
import { createHash } from "node:crypto";

// One-hour sliding window. A legitimate author submits a handful of times
// while iterating; 20/hour/IP and 200/hour globally leave ample headroom
// while bounding the API-budget burn and branch pile-up from one caller.
const WINDOW_SECONDS = 3600;
const PER_IP_LIMIT = 20;
const GLOBAL_LIMIT = 200;

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds?: number;
}

/** SHA-256 of the caller IP with a domain separator; raw IPs are never stored. */
export function hashIp(ip: string): string {
  return createHash("sha256").update(`managed-pr|${ip}`).digest("hex");
}

/**
 * Record one submission attempt and decide whether it may proceed.
 * Fail-open: any DB error (or missing table) resolves to allowed.
 */
export async function checkManagedPRRateLimit(
  ip: string | null,
): Promise<RateLimitDecision> {
  if (ip === null || ip === "") return { allowed: true };
  const ipHash = hashIp(ip);
  try {
    await sql`DELETE FROM managed_pr_rate_limit WHERE created_at < now() - (${WINDOW_SECONDS} * interval '1 second')`;
    const perIp =
      await sql`SELECT count(*)::int AS n FROM managed_pr_rate_limit WHERE ip_hash = ${ipHash}`;
    const total =
      await sql`SELECT count(*)::int AS n FROM managed_pr_rate_limit`;
    const perIpCount = (perIp.rows[0] as { n: number }).n;
    const totalCount = (total.rows[0] as { n: number }).n;
    if (perIpCount >= PER_IP_LIMIT || totalCount >= GLOBAL_LIMIT) {
      return { allowed: false, retryAfterSeconds: WINDOW_SECONDS };
    }
    await sql`INSERT INTO managed_pr_rate_limit (ip_hash) VALUES (${ipHash})`;
    return { allowed: true };
  } catch {
    // Fail open (see module docstring): never block submissions on
    // throttle-infrastructure absence.
    return { allowed: true };
  }
}

/** Extract the caller IP behind Vercel's proxy; null when unavailable. */
export function vercelClientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff !== null) {
    const first = xff.split(",")[0]?.trim();
    if (first !== undefined && first !== "") return first;
  }
  const realIp = req.headers.get("x-real-ip")?.trim();
  return realIp === undefined || realIp === "" ? null : realIp;
}
