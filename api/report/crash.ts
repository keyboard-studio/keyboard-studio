// POST /api/report/crash — file a studio crash as an issue in
// keyboard-studio/crash-reports. Reachable at /report/crash via the vercel.json
// rewrite (spec 060, FR-083).
//
// Structurally mirrors api/submit/managed-pr.ts: Web-standard `{ fetch }`
// default export (see the note in health.ts for why a bare
// `export default function (req, res)` would hang on Vercel's Node runtime),
// an env-reading config builder that returns `undefined` when the App is not
// provisioned, and a `configOverride` seam so handler tests need no env and no
// network.
//
// CREDENTIAL: the crash-reporting App's installation token, minted by
// crash-report-installation-token.ts. Never a user OAuth token, and never the
// managed-PR App's token (FR-085).

import {
  getCrashReportInstallationToken,
  isCrashReportAppConfigured,
} from "../../utilities/oauth-backend/src/crash-report-installation-token.js";
import {
  submitCrashReport,
  type CrashReportPipelineConfig,
  type CrashReportFetchFn,
} from "../../utilities/oauth-backend/src/crash-report-pipeline.js";
import { CrashReportBodySchema } from "../../utilities/oauth-backend/src/crash-report-schemas.js";
import { jsonResponse } from "../oauth/_shared.js";

// ---------------------------------------------------------------------------
// Web-fetch adapter — the global Web `Response` already exposes `.ok`,
// `.status`, `.statusText`, `.headers.get`, `.json()`, and `.text()`, so this
// is a minimal pass-through satisfying CrashReportFetchFn.
// ---------------------------------------------------------------------------

const webCrashFetch: CrashReportFetchFn = async (url, init) => {
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

/**
 * Build a CrashReportPipelineConfig from environment. Returns `undefined` when
 * any `CRASH_REPORT_APP_*` var is absent or empty — the caller maps that to
 * 503 `reporting_not_configured`.
 *
 * Detecting the missing vars here rather than letting the mint fail keeps the
 * two states distinguishable: "not provisioned yet" is a 503 an operator can
 * act on, while "provisioned but the mint failed" is a 502 that must not say
 * which credential is at fault (FR-088).
 */
function envCrashReportConfig(): CrashReportPipelineConfig | undefined {
  if (!isCrashReportAppConfigured()) return undefined;

  return {
    getInstallationToken: async () => {
      const token = await getCrashReportInstallationToken();
      if (token === undefined) {
        throw new Error("crash-report installation token not configured");
      }
      return token;
    },
    fetch: webCrashFetch,
  };
}

// ---------------------------------------------------------------------------
// Core handler — exported for testability (configOverride pattern)
// ---------------------------------------------------------------------------

/**
 * Run the crash-report handler: method guard → config → body validation →
 * pipeline → status mapping.
 *
 * `configOverride` lets tests inject a stub minter + stub fetch so no real env,
 * credential, App, or repository has to exist. Pass `null` explicitly to force
 * the not-configured (503) branch.
 */
export async function runCrashReportHandler(
  req: Request,
  configOverride?: CrashReportPipelineConfig | null,
): Promise<Response> {
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" }, { Allow: "POST" });
  }

  const config: CrashReportPipelineConfig | undefined =
    configOverride === undefined
      ? envCrashReportConfig()
      : configOverride === null
        ? undefined
        : configOverride;

  if (config === undefined) {
    // The crash App is not provisioned. Unsetting one env var is also the
    // documented instant kill-switch for this route (runbook).
    return jsonResponse(503, { error: "reporting_not_configured" });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid_request" });
  }

  const parsed = CrashReportBodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse(400, { error: "invalid_request" });
  }

  // The token mint runs inside submitCrashReport but OUTSIDE its own
  // try/catch, so a mint failure propagates here — mapped to 502, same as a
  // network failure, never revealing which credential failed.
  let result: Awaited<ReturnType<typeof submitCrashReport>>;
  try {
    result = await submitCrashReport(parsed.data, config);
  } catch {
    return jsonResponse(502, { error: "submission_unavailable" });
  }

  if (!result.ok) {
    const extraHeaders: Record<string, string> = {};
    if (result.retryAfterSeconds !== undefined) {
      extraHeaders["Retry-After"] = String(result.retryAfterSeconds);
    }
    return jsonResponse(result.status, { error: result.error }, extraHeaders);
  }
  return jsonResponse(200, result.data);
}

// ---------------------------------------------------------------------------
// Vercel Web-standard export
// ---------------------------------------------------------------------------

export default {
  fetch(req: Request): Promise<Response> {
    return runCrashReportHandler(req);
  },
};
