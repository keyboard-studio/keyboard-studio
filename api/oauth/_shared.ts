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

export { exchangeCore, refreshCore, ExchangeBodySchema, RefreshBodySchema };
export type { HandlerConfig, HandlerResult };

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
 * Run a POST JSON token endpoint: method guard → config → body validation →
 * core call → status mapping. `configOverride` lets tests inject a stub fetch
 * and credentials; production omits it and reads from env.
 */
export async function runTokenHandler<T>(
  req: Request,
  schema: z.ZodType<T>,
  core: (body: T, config: HandlerConfig) => Promise<HandlerResult>,
  configOverride?: HandlerConfig,
): Promise<Response> {
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" }, { Allow: "POST" });
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
