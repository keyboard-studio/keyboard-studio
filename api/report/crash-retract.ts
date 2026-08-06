// POST /api/report/crash-retract — withdraw a crash report filed moments ago
// (spec 060, FR-074 – FR-077). Reachable at /report/crash/retract via the
// vercel.json rewrite.
//
// Structurally identical to crash.ts: same credential, same 503/400/502/429
// vocabulary, same `configOverride` test seam. It is a separate route rather
// than a mode flag on the report body because it is a different operation on a
// different resource — it names an issue by number rather than describing a
// crash — and merging the two would produce one endpoint whose required fields
// depend on a flag.

import {
  getCrashReportInstallationToken,
  isCrashReportAppConfigured,
} from "../../utilities/oauth-backend/src/crash-report-installation-token.js";
import {
  retractCrashReport,
  type CrashReportPipelineConfig,
  type CrashReportFetchFn,
} from "../../utilities/oauth-backend/src/crash-report-pipeline.js";
import { CrashRetractBodySchema } from "../../utilities/oauth-backend/src/crash-report-schemas.js";
import { jsonResponse } from "../oauth/_shared.js";

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

/**
 * Run the retract handler: method guard → config → body validation → pipeline
 * → status mapping.
 */
export async function runCrashRetractHandler(
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
    return jsonResponse(503, { error: "reporting_not_configured" });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid_request" });
  }

  const parsed = CrashRetractBodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse(400, { error: "invalid_request" });
  }

  let result: Awaited<ReturnType<typeof retractCrashReport>>;
  try {
    result = await retractCrashReport(parsed.data, config);
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

export default {
  fetch(req: Request): Promise<Response> {
    return runCrashRetractHandler(req);
  },
};
