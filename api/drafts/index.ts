// /api/drafts — server-side draft persistence for signed-in users.
// Reachable at /drafts via the vercel.json rewrite.
//
//   GET    /drafts   → metadata for the resume banner ({ meta } | { meta: null })
//   PUT    /drafts   → upsert the caller's draft ({ meta, draft } → { savedAt })
//   DELETE /drafts   → clear the caller's draft
//
// Every method is gated on a server-verified GitHub identity presented in the
// Authorization header (Bearer <token>) — see draft-handlers.ts. This is the
// project's first stateful endpoint; when Postgres/Blob env is absent it fails
// soft with 503 `draft_not_configured` (mirrors managed-pr's not-configured
// path) so a GitHub-only deployment is unaffected.
//
// Body-size note: the same ~4.5 MB Vercel body cap as managed-pr applies; a
// draft above MAX_DRAFT_BYTES is rejected 413 `draft_too_large` by putDraft.
//
// Web-standard `{ fetch }` default export — see managed-pr.ts / health.ts for
// why a bare (req, res) handler would hang on Vercel's Node runtime.

import { jsonResponse } from "../oauth/_shared.js";
import {
  buildDraftConfig,
  deleteDraft,
  getDraftMeta,
  putDraft,
  type DraftHandlerConfig,
  type DraftResult,
} from "../../utilities/oauth-backend/src/draft-handlers.js";
import type { OAuthFetchFn } from "../../utilities/oauth-backend/src/handlers.js";
import { VercelDraftStore } from "./_store.js";

// Adapt the global Web fetch to the utility's minimal OAuthFetchFn contract
// (used only for the GitHub /user identity check). Mirrors _shared.ts.
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
 * Build the draft config from env, or null when storage is not provisioned
 * (Postgres URL + Blob token both required). Null maps to 503, matching the
 * fail-soft shape of the managed-PR route when its org bot is unset.
 */
export function envDraftConfig(): DraftHandlerConfig | null {
  const hasDb =
    (process.env["POSTGRES_URL"] ?? "").trim() !== "" ||
    (process.env["DATABASE_URL"] ?? "").trim() !== "";
  const hasBlob = (process.env["BLOB_READ_WRITE_TOKEN"] ?? "").trim() !== "";
  if (!hasDb || !hasBlob) return null;
  return buildDraftConfig(new VercelDraftStore(), webFetch);
}

/** Map a DraftResult to an HTTP Response. */
function mapResult<T>(r: DraftResult<T>): Response {
  return r.ok ? jsonResponse(r.status, r.data) : jsonResponse(r.status, { error: r.error });
}

/**
 * Run the /drafts handler. `configOverride` is the test seam (as in
 * runManagedPRHandler): `undefined` reads env, explicit `null` forces the 503
 * not-configured branch, a config object injects a stub store + verifier.
 */
export async function runDraftsHandler(
  req: Request,
  configOverride?: DraftHandlerConfig | null,
): Promise<Response> {
  const config: DraftHandlerConfig | null =
    configOverride === undefined ? envDraftConfig() : configOverride;
  if (config === null) return jsonResponse(503, { error: "draft_not_configured" });

  const auth = req.headers.get("authorization");

  try {
    switch (req.method) {
      case "GET":
        return mapResult(await getDraftMeta(auth, config));
      case "PUT":
        return mapResult(await putDraft(auth, await req.text(), config));
      case "DELETE":
        return mapResult(await deleteDraft(auth, config));
      default:
        return jsonResponse(
          405,
          { error: "method_not_allowed" },
          { Allow: "GET, PUT, DELETE" },
        );
    }
  } catch {
    // Storage (Postgres/Blob) unreachable or errored — fail with 502, never
    // leak the underlying error. Authoring keeps working from localStorage.
    return jsonResponse(502, { error: "draft_unavailable" });
  }
}

export default {
  fetch(req: Request): Promise<Response> {
    return runDraftsHandler(req);
  },
};
