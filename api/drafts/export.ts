// /api/drafts/export — the DSAR self-service export (spec 097).
// Reachable at /drafts/export via the vercel.json rewrite (which must
// precede the /drafts rewrite).
//
//   GET /drafts/export → { exportedAt, identity: { githubUserId, login },
//                          drafts: [{ meta, draft }] }
//   offered as a download (keyboard-studio-export.json).
//
// Same auth as every drafts route: a server-verified GitHub identity in
// the Authorization header; the export is keyed to that identity only.
// Same fail-soft 503 when storage is not provisioned (envDraftConfig).

import { jsonResponse } from "../oauth/_shared.js";
import { exportDrafts } from "../../utilities/oauth-backend/src/draft-handlers.js";
import type { DraftHandlerConfig } from "../../utilities/oauth-backend/src/draft-handlers.js";
import { envDraftConfig } from "./index.js";

/**
 * Run the export handler. `configOverride` is the same test seam as
 * runDraftsHandler: `undefined` reads env, explicit `null` forces 503,
 * a config injects a stub store + verifier.
 */
export async function runExportHandler(
  req: Request,
  configOverride?: DraftHandlerConfig | null,
): Promise<Response> {
  const config: DraftHandlerConfig | null =
    configOverride === undefined ? envDraftConfig() : configOverride;
  if (config === null) return jsonResponse(503, { error: "draft_not_configured" });
  if (req.method !== "GET") {
    return jsonResponse(405, { error: "method_not_allowed" }, { Allow: "GET" });
  }

  try {
    const result = await exportDrafts(req.headers.get("authorization"), config);
    if (!result.ok) return jsonResponse(result.status, { error: result.error });
    return jsonResponse(200, result.data, {
      "Content-Disposition": 'attachment; filename="keyboard-studio-export.json"',
    });
  } catch {
    return jsonResponse(502, { error: "draft_unavailable" });
  }
}

export default {
  fetch(req: Request): Promise<Response> {
    return runExportHandler(req);
  },
};
