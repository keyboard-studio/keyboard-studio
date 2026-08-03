// POST /api/oauth/exchange — exchange a GitHub authorization code for a token.
// Reachable at /oauth/exchange via the vercel.json rewrite (same origin as the
// SPA, so VITE_OAUTH_BACKEND_URL stays empty).
//
// This is the one unauthenticated endpoint that makes an outbound provider call,
// so it is rate-limited per hashed client address, enforced before that call
// (FR-010). The limiter is a Postgres counter because Vercel gives no reliable
// cross-invocation memory — a per-instance count is unenforceable.
import { VercelRateLimitStore } from "../drafts/_rate-limit-store.js";
import {
  OAUTH_EXCHANGE_ENDPOINT,
  OAUTH_EXCHANGE_MAX_REQUESTS,
  OAUTH_EXCHANGE_WINDOW_SECONDS,
} from "../../utilities/oauth-backend/src/rate-limit.js";
import {
  runTokenHandler,
  exchangeCore,
  ExchangeBodySchema,
  type TokenRateLimit,
} from "./_shared.js";

/**
 * The limiter's storage, or null when Postgres is not provisioned.
 *
 * Null makes the endpoint unmetered with one `[WARN]` rather than closed: a
 * storage outage must not become a total sign-in outage. Fail-open is scoped to
 * limits — identity verification still fails closed, which is the rule that
 * protects authorization (research D-5).
 */
export function envRateLimit(): TokenRateLimit {
  const hasDb =
    (process.env["POSTGRES_URL"] ?? "").trim() !== "" ||
    (process.env["DATABASE_URL"] ?? "").trim() !== "";
  return {
    store: hasDb ? new VercelRateLimitStore() : null,
    endpoint: OAUTH_EXCHANGE_ENDPOINT,
    windowSeconds: OAUTH_EXCHANGE_WINDOW_SECONDS,
    limit: OAUTH_EXCHANGE_MAX_REQUESTS,
  };
}

// Web-standard `{ fetch }` default export — see the note in health.ts for why a
// bare `export default function (req, res)` would hang on Vercel's Node runtime.
export default {
  fetch(req: Request): Promise<Response> {
    return runTokenHandler(req, ExchangeBodySchema, exchangeCore, undefined, envRateLimit());
  },
};
