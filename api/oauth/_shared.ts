// Shared glue for the co-located OAuth serverless functions.
//
// These Vercel functions reuse the framework-agnostic token-exchange core from
// `utilities/oauth-backend/src` (the same logic the standalone Fastify service
// runs and unit-tests) rather than duplicating it — so the dev service and the
// deployed functions cannot diverge. Only the HTTP glue (method guard, JSON
// parse, status mapping) lives here.
//
// Web-standard Request/Response signature: works on the Vercel Node runtime
// with no @vercel/node type dependency.

import type { z } from "zod";
import {
  exchange as exchangeCore,
  refresh as refreshCore,
  type HandlerConfig,
  type HandlerResult,
  type OAuthFetchFn,
} from "../../utilities/oauth-backend/src/handlers.js";
import {
  ExchangeBodySchema,
  RefreshBodySchema,
} from "../../utilities/oauth-backend/src/schemas.js";
import {
  googleExchange as googleExchangeCore,
  type GoogleHandlerConfig,
  type GoogleHandlerResult,
} from "../../utilities/oauth-backend/src/google-handlers.js";
import { GoogleExchangeBodySchema } from "../../utilities/oauth-backend/src/google-schemas.js";
import {
  enforceRateLimit,
  rateLimitKey,
  type RateLimitStore,
} from "../../utilities/oauth-backend/src/rate-limit.js";

export { exchangeCore, refreshCore, ExchangeBodySchema, RefreshBodySchema };
export { googleExchangeCore, GoogleExchangeBodySchema };
export type { HandlerConfig, HandlerResult, GoogleHandlerConfig };

// Adapt the global Web fetch to the utility's minimal OAuthFetchFn contract.
const webFetch: OAuthFetchFn = async (url, init) => {
  const res = await fetch(url, {
    ...(init?.method !== undefined ? { method: init.method } : {}),
    ...(init?.headers !== undefined ? { headers: init.headers } : {}),
    ...(init?.body !== undefined ? { body: init.body } : {}),
  });
  return {
    ok: res.ok,
    status: res.status,
    json: () => res.json() as Promise<unknown>,
    // Surfaced so the token-provenance check in verify-github-user.ts has an
    // `X-OAuth-Client-ID` to read. Web `Headers.get` is case-insensitive and
    // returns null for an absent name, which is exactly the contract.
    headers: res.headers,
  };
};

/**
 * Build a HandlerConfig from environment. The client secrets live only here
 * (server-side) and never reach the SPA. Throws when the GitHub App pair
 * (`GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`) is unset so a misconfigured
 * deployment surfaces as a 500, not a silent bad exchange.
 *
 * The OAuth App pair (`GITHUB_OAUTH_CLIENT_ID`/`GITHUB_OAUTH_CLIENT_SECRET`)
 * is optional — absent means the `github_app` default flow still works but an
 * `oauth_app` exchange returns 500 `server_misconfigured` at request time.
 * A partial OAuth pair (one var set, one missing) is not warned on here —
 * unlike `server.ts:loadConfig`, serverless has no actionable startup-log
 * context — so the misconfiguration surfaces at REQUEST time as a 500
 * `server_misconfigured` via `resolveCredentials`; do not re-add a startup
 * warning that would fire on every cold start.
 */
export function envConfig(fetchFn: OAuthFetchFn = webFetch): HandlerConfig {
  const clientId = process.env["GITHUB_CLIENT_ID"];
  const clientSecret = process.env["GITHUB_CLIENT_SECRET"];
  if (
    clientId === undefined ||
    clientId === "" ||
    clientSecret === undefined ||
    clientSecret === ""
  ) {
    throw new Error("GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be set");
  }

  // OAuth App pair — optional; absent is not an error here.
  const oauthClientId = (process.env["GITHUB_OAUTH_CLIENT_ID"] ?? "").trim() || undefined;
  const oauthClientSecret = (process.env["GITHUB_OAUTH_CLIENT_SECRET"] ?? "").trim() || undefined;

  return {
    clientId,
    clientSecret,
    ...(oauthClientId !== undefined ? { oauthClientId } : {}),
    ...(oauthClientSecret !== undefined ? { oauthClientSecret } : {}),
    fetch: fetchFn,
  };
}

export function jsonResponse(
  status: number,
  body: unknown,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extraHeaders },
  });
}

/**
 * Client address as the platform reports it, or null when it does not.
 *
 * `x-forwarded-for` may be a comma-separated chain; the left-most entry is the
 * originating client. The value is only ever fed to {@link rateLimitKey}, which
 * hashes it — no caller should log or store what this returns.
 */
export function clientAddress(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded !== null && forwarded.trim() !== "") {
    return (forwarded.split(",")[0] ?? "").trim() || null;
  }
  const realIp = req.headers.get("x-real-ip");
  return realIp !== null && realIp.trim() !== "" ? realIp.trim() : null;
}

/**
 * Rate-limit configuration for a token endpoint. Optional throughout: a route
 * that passes none is not limited, exactly as before this existed.
 */
export interface TokenRateLimit {
  /** Omit or pass null to leave the endpoint unmetered (logs one `[WARN]`). */
  store: RateLimitStore | null;
  /** Endpoint discriminator — keeps each endpoint's budget separate. */
  endpoint: string;
  windowSeconds: number;
  limit: number;
}

/**
 * Run a POST JSON token endpoint: method guard → **rate limit** → config → body
 * validation → core call → status mapping. `configOverride` lets tests inject a
 * stub fetch and credentials; production omits it and reads from env.
 *
 * The limiter sits directly after the method guard, which puts it ahead of
 * everything that could reach the provider (FR-010: the limit is enforced before
 * the outbound call). It is behind the method guard rather than in front of it so
 * a client spraying non-POST requests cannot burn the budget that legitimate
 * sign-ins from the same address need.
 */
export async function runTokenHandler<T>(
  req: Request,
  schema: z.ZodType<T>,
  core: (body: T, config: HandlerConfig) => Promise<HandlerResult>,
  configOverride?: HandlerConfig,
  rateLimit?: TokenRateLimit,
): Promise<Response> {
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" }, { Allow: "POST" });
  }

  if (rateLimit !== undefined) {
    const verdict = await enforceRateLimit(
      rateLimit.store,
      rateLimitKey(rateLimit.endpoint, clientAddress(req)),
      rateLimit.windowSeconds,
      rateLimit.limit,
    );
    if (!verdict.allowed) {
      // `request_rate_limited`, not `rate_limited` — the latter already means
      // "the upstream provider limited us" on the managed-PR path, and FR-011
      // requires the two to stay distinguishable.
      return jsonResponse(
        429,
        { error: "request_rate_limited" },
        { "Retry-After": String(verdict.retryAfterSeconds) },
      );
    }
  }

  let config: HandlerConfig;
  try {
    config = configOverride ?? envConfig();
  } catch {
    return jsonResponse(500, { error: "server_misconfigured" });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid_request" });
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse(400, { error: "invalid_request" });
  }

  const result = await core(parsed.data, config);
  return result.ok
    ? jsonResponse(200, result.data)
    : jsonResponse(result.status, { error: result.error });
}

/**
 * Build a GoogleHandlerConfig from environment, or return null when Google
 * identity is not configured.
 *
 * Google identity is OPT-IN: a GitHub-only deployment leaves
 * `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` unset and never needs them. Unlike
 * the GitHub pair (which throws so a misconfigured deployment 500s), absent
 * Google creds are not an error — {@link runGoogleHandler} maps a null config
 * to a 503 `google_oauth_not_configured`, matching the "fail soft, not 500"
 * shape of the managed-PR route when its org bot is unprovisioned.
 *
 * The standalone Fastify server (`server.ts`) gates the route on a separate
 * `GOOGLE_OAUTH_ENABLED` flag at startup; serverless has no registration step,
 * so the presence of both creds IS the gate. Do not couple this to
 * `GOOGLE_OAUTH_ENABLED` — that would let creds be set yet the endpoint stay
 * dark because a second flag was forgotten.
 */
export function googleEnvConfig(fetchFn: OAuthFetchFn = webFetch): GoogleHandlerConfig | null {
  const googleClientId = (process.env["GOOGLE_CLIENT_ID"] ?? "").trim();
  const googleClientSecret = (process.env["GOOGLE_CLIENT_SECRET"] ?? "").trim();
  if (googleClientId === "" || googleClientSecret === "") {
    return null;
  }
  return { googleClientId, googleClientSecret, fetch: fetchFn };
}

/**
 * Run the Google identity-exchange endpoint: method guard → config →
 * body validation → core call → status mapping. Mirrors {@link runTokenHandler}
 * but for the identity-only Google flow, whose config type and success shape
 * (identity claims, not a token) differ from the GitHub token handlers.
 *
 * `configOverride` lets tests inject a stub fetch + creds; production omits it
 * and reads from env via {@link googleEnvConfig}. A null config (creds absent)
 * yields 503 `google_oauth_not_configured`.
 */
export async function runGoogleHandler(
  req: Request,
  configOverride?: GoogleHandlerConfig,
): Promise<Response> {
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" }, { Allow: "POST" });
  }

  const config = configOverride ?? googleEnvConfig();
  if (config === null) {
    return jsonResponse(503, { error: "google_oauth_not_configured" });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid_request" });
  }

  const parsed = GoogleExchangeBodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse(400, { error: "invalid_request" });
  }

  const result: GoogleHandlerResult = await googleExchangeCore(parsed.data, config);
  return result.ok
    ? jsonResponse(200, result.data)
    : jsonResponse(result.status, { error: result.error });
}
