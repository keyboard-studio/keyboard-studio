// POST /api/submit/managed-pr — Option B org-mediated fork+PR (no user token).
// Reachable at /submit/managed-pr via the vercel.json rewrite.
//
// Body-size note: Vercel serverless functions cap request bodies at ~4.5 MB.
// ManagedPRBodySchema permits up to 50 files × 1 MiB = 50 MiB, so large
// multi-file submissions that succeed on the standalone Fastify server (which
// raises bodyLimit) may 413 on Vercel before this handler is invoked. Typical
// single-keyboard submissions are well under 4.5 MB and are unaffected.
//
// Web-standard `{ fetch }` default export — see the note in health.ts for why a
// bare `export default function (req, res)` would hang on Vercel's Node runtime.

import {
  getInstallationToken,
} from "../../utilities/oauth-backend/src/installation-token.js";
import {
  submitManagedPR,
  type ManagedPRPipelineConfig,
  type GitHubPipelineFetchFn,
} from "../../utilities/oauth-backend/src/github-pipeline.js";
import {
  ManagedPRBodySchema,
} from "../../utilities/oauth-backend/src/managed-pr-schemas.js";
import { jsonResponse } from "../oauth/_shared.js";

// ---------------------------------------------------------------------------
// Web-fetch adapter — the global Web `Response` already exposes `.ok`,
// `.status`, `.statusText`, `.headers.get`, `.json()`, and `.text()`, so the
// adapter is a minimal pass-through that satisfies GitHubPipelineFetchFn.
// ---------------------------------------------------------------------------

const webPipelineFetch: GitHubPipelineFetchFn = async (url, init) => {
  const res = await fetch(url, {
    method: init.method,
    headers: init.headers,
    ...(init.body !== undefined ? { body: init.body } : {}),
  });
  return {
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    headers: { get: (name: string) => res.headers.get(name) },
    json: () => res.json() as Promise<unknown>,
    text: () => res.text(),
  };
};

// ---------------------------------------------------------------------------
// Config builder — reads env vars; returns undefined when not fully configured.
// ---------------------------------------------------------------------------

/**
 * Build a ManagedPRPipelineConfig from environment. Returns `undefined` when
 * the GitHub App is not fully configured (any GITHUB_APP_* var absent/empty)
 * or GITHUB_ORG_LOGIN is unset — the caller maps that to 503.
 *
 * `fetchOverride` is accepted so tests can inject a stub without touching env.
 */
function envManagedPRConfig(
  fetchOverride?: GitHubPipelineFetchFn,
): ManagedPRPipelineConfig | undefined {
  const orgLogin = (process.env["GITHUB_ORG_LOGIN"] ?? "").trim();
  if (!orgLogin) return undefined;

  // Eagerly detect missing App vars — mirrors the `appConfigured` gate in server.ts
  // (~lines 305-308). When any of the three GITHUB_APP_* vars is absent/empty the
  // managed-PR route is not configured; return undefined so the handler's existing
  // `config === undefined → 503 submission_not_configured` path fires, matching the
  // standalone server's behaviour. The 502 catch below remains only for genuine
  // runtime mint/network failures when the vars ARE present.
  const appId = (process.env["GITHUB_APP_ID"] ?? "").trim();
  const appPrivateKey = (process.env["GITHUB_APP_PRIVATE_KEY"] ?? "").trim();
  const appInstallationId = (process.env["GITHUB_APP_INSTALLATION_ID"] ?? "").trim();
  if (!appId || !appPrivateKey || !appInstallationId) return undefined;

  const configuredFetch = fetchOverride ?? webPipelineFetch;

  return {
    getInstallationToken: async () => {
      const token = await getInstallationToken();
      if (token === undefined) {
        throw new Error("GitHub App installation token not configured");
      }
      return token;
    },
    orgLogin,
    fetch: configuredFetch,
  };
}

// ---------------------------------------------------------------------------
// Core handler — exported for testability (configOverride pattern from _shared.ts)
// ---------------------------------------------------------------------------

/**
 * Run the managed-PR handler: method guard → config → body validation →
 * submitManagedPR → status mapping.
 *
 * `configOverride` lets tests inject a stub minter + stub fetch so no real env
 * or network is needed — mirrors `runTokenHandler`'s configOverride seam.
 * Pass `null` explicitly to force the not-configured (503) branch in tests.
 */
export async function runManagedPRHandler(
  req: Request,
  configOverride?: ManagedPRPipelineConfig | null,
): Promise<Response> {
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" }, { Allow: "POST" });
  }

  // Resolve config precedence: an explicit override wins over env. `undefined`
  // means "no override — read env". An explicit `null` is the test seam for
  // "not configured": it maps to `undefined` so the 503 branch below fires.
  const config: ManagedPRPipelineConfig | undefined =
    configOverride === undefined
      ? envManagedPRConfig()
      : configOverride === null
        ? undefined
        : configOverride;

  if (config === undefined) {
    // Org bot identity not yet provisioned — fail soft, not 500.
    return jsonResponse(503, { error: "submission_not_configured" });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid_request" });
  }

  const parsed = ManagedPRBodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse(400, { error: "invalid_request" });
  }

  // submitManagedPR's token-minting step (getInstallationToken) runs outside
  // that function's internal try/catch, so a throw there propagates here.
  // Map it to 502 submission_unavailable — same as a network-level failure.
  let result: Awaited<ReturnType<typeof submitManagedPR>>;
  try {
    result = await submitManagedPR(parsed.data, config);
  } catch {
    return jsonResponse(502, { error: "submission_unavailable" });
  }
  if (!result.ok) {
    const extraHeaders: Record<string, string> = {};
    if (result.retryAfterSeconds !== undefined) {
      extraHeaders["Retry-After"] = String(result.retryAfterSeconds);
    }
    return jsonResponse(
      result.status,
      {
        error: result.error,
        ...(result.branchName !== undefined ? { branchName: result.branchName } : {}),
      },
      extraHeaders,
    );
  }
  return jsonResponse(200, result.data);
}

// ---------------------------------------------------------------------------
// Vercel Web-standard export
// ---------------------------------------------------------------------------

export default {
  fetch(req: Request): Promise<Response> {
    return runManagedPRHandler(req);
  },
};
