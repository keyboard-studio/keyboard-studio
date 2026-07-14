// GET /api/drafts/content — the full opaque draft payload for Restore.
// Reachable at /drafts/content via the vercel.json rewrite.
//
// Split from /drafts (metadata) so the resume banner's frequent existence check
// stays a cheap Postgres read, and the heavier blob fetch happens only when the
// author actually chooses to restore. Same auth gate and fail-soft config path
// as /drafts (see index.ts).

import { jsonResponse } from "../oauth/_shared.js";
import { getDraftContent } from "../../utilities/oauth-backend/src/draft-handlers.js";
import { envDraftConfig } from "./index.js";
import type { DraftHandlerConfig } from "../../utilities/oauth-backend/src/draft-handlers.js";

export async function runDraftContentHandler(
  req: Request,
  configOverride?: DraftHandlerConfig | null,
): Promise<Response> {
  if (req.method !== "GET") {
    return jsonResponse(405, { error: "method_not_allowed" }, { Allow: "GET" });
  }

  const config: DraftHandlerConfig | null =
    configOverride === undefined ? envDraftConfig() : configOverride;
  if (config === null) return jsonResponse(503, { error: "draft_not_configured" });

  try {
    const r = await getDraftContent(req.headers.get("authorization"), config);
    return r.ok ? jsonResponse(r.status, r.data) : jsonResponse(r.status, { error: r.error });
  } catch {
    return jsonResponse(502, { error: "draft_unavailable" });
  }
}

export default {
  fetch(req: Request): Promise<Response> {
    return runDraftContentHandler(req);
  },
};
