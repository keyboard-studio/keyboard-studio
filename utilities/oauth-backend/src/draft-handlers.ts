/**
 * Core logic for the server-side draft-persistence endpoints, framework- and
 * infra-agnostic. The Vercel functions (api/drafts/*) and the standalone Fastify
 * server share this so they cannot diverge; only the HTTP glue and the concrete
 * {@link DraftStore} differ between them.
 *
 * Every operation is gated on a server-verified GitHub identity: the caller
 * passes the raw `Authorization` header, we parse the bearer token and verify it
 * via the injected {@link DraftHandlerConfig.verifyUser}. A missing/invalid token
 * yields 401 — the backend never trusts a client-supplied user id.
 */

import {
  DEFAULT_DRAFT_ID,
  MAX_DRAFT_BYTES,
  MAX_DRAFTS_PER_USER,
  MAX_TOTAL_DRAFT_BYTES,
  PutDraftBodySchema,
  type DraftMeta,
  type GetDraftContentResponse,
  type GetDraftListResponse,
  type GetDraftMetaResponse,
  type PutDraftResponse,
} from "./draft-schemas.js";
import { measureDraftBytes, type DraftStore } from "./draft-store.js";
import type { OAuthFetchFn } from "./handlers.js";
import { parseBearer, verifyGitHubUser, type GitHubUser } from "./verify-github-user.js";

// ---------------------------------------------------------------------------
// Result type — mirrors handlers.ts's discriminated HandlerResult shape.
// ---------------------------------------------------------------------------

export type DraftResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string };

export interface DraftHandlerConfig {
  store: DraftStore;
  /**
   * Verify a bearer token → identity, or null when invalid. Injected so tests
   * stub it and the Vercel/Fastify layers share one implementation. Defaults are
   * not applied here — {@link buildDraftConfig} wires the real verifier.
   */
  verifyUser: (token: string | null) => Promise<GitHubUser | null>;
}

/**
 * Client ids this deployment issues tokens under, read from env.
 *
 * **Both** pairs are included deliberately: `GITHUB_CLIENT_ID` is the GitHub App
 * user-to-server credential behind sign-in, and `GITHUB_OAUTH_CLIENT_ID` is the
 * classic OAuth App behind the Option A `public_repo` flow. Returning only the
 * first would refuse Option A tokens on the draft endpoints.
 *
 * Read here rather than threaded through both edges so the provenance check is
 * on by default in every deployment — the env read follows the precedent in
 * `installation-token.ts`. An empty result disables the check, which is the
 * correct behaviour for a deployment that has configured neither id.
 */
function allowedClientIdsFromEnv(): readonly string[] {
  return [process.env["GITHUB_CLIENT_ID"], process.env["GITHUB_OAUTH_CLIENT_ID"]]
    .map((v) => (v ?? "").trim())
    .filter((v) => v !== "");
}

/**
 * Build a {@link DraftHandlerConfig} from a concrete store and a GitHub fetch.
 * The real verifier calls GitHub's `/user`; tests can bypass by constructing the
 * config literal directly with a stub `verifyUser`.
 *
 * The verifier is given the configured client ids so a token issued to some
 * other application is refused even when it is otherwise valid.
 */
export function buildDraftConfig(store: DraftStore, fetchFn: OAuthFetchFn): DraftHandlerConfig {
  const allowedClientIds = allowedClientIdsFromEnv();
  return {
    store,
    verifyUser: (token) => verifyGitHubUser(token, fetchFn, { allowedClientIds }),
  };
}

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function authenticate(
  authHeader: string | null | undefined,
  config: DraftHandlerConfig,
): Promise<GitHubUser | null> {
  return config.verifyUser(parseBearer(authHeader));
}

// ---------------------------------------------------------------------------
// GET /drafts — metadata only
// ---------------------------------------------------------------------------

export async function getDraftMeta(
  authHeader: string | null | undefined,
  config: DraftHandlerConfig,
  draftId: string = DEFAULT_DRAFT_ID,
): Promise<DraftResult<GetDraftMetaResponse>> {
  const user = await authenticate(authHeader, config);
  if (user === null) return { ok: false, status: 401, error: "unauthorized" };

  const meta = await config.store.getMeta(user.id, draftId);
  return { ok: true, status: 200, data: { meta } };
}

// ---------------------------------------------------------------------------
// GET /drafts — list every draft's metadata ("My keyboards")
// ---------------------------------------------------------------------------

export async function listDrafts(
  authHeader: string | null | undefined,
  config: DraftHandlerConfig,
): Promise<DraftResult<GetDraftListResponse>> {
  const user = await authenticate(authHeader, config);
  if (user === null) return { ok: false, status: 401, error: "unauthorized" };

  const drafts = await config.store.listMeta(user.id);
  return { ok: true, status: 200, data: { drafts } };
}

// ---------------------------------------------------------------------------
// GET /drafts/content — full opaque draft
// ---------------------------------------------------------------------------

export async function getDraftContent(
  authHeader: string | null | undefined,
  config: DraftHandlerConfig,
  draftId: string = DEFAULT_DRAFT_ID,
): Promise<DraftResult<GetDraftContentResponse>> {
  const user = await authenticate(authHeader, config);
  if (user === null) return { ok: false, status: 401, error: "unauthorized" };

  const stored = await config.store.getDraft(user.id, draftId);
  if (stored === null) return { ok: true, status: 200, data: { draft: null, meta: null } };
  return { ok: true, status: 200, data: { draft: stored.draft, meta: stored.meta } };
}

// ---------------------------------------------------------------------------
// PUT /drafts — upsert
// ---------------------------------------------------------------------------

/**
 * Save (create/replace) the caller's draft. `rawBody` is the undecoded request
 * text so we can measure serialized size against {@link MAX_DRAFT_BYTES} before
 * trusting it — a `draft_too_large` here is a clean 413 rather than a platform
 * body-limit rejection. Returns the stored `savedAt`.
 *
 * Two ceilings apply, and they mean different things: `draft_too_large` (413) is
 * *this* draft exceeding the per-draft limit, `draft_quota_exceeded` (409) is the
 * caller's *aggregate* over quota. The per-draft check runs first because it
 * needs no storage round-trip.
 */
export async function putDraft(
  authHeader: string | null | undefined,
  rawBody: string,
  config: DraftHandlerConfig,
): Promise<DraftResult<PutDraftResponse>> {
  const user = await authenticate(authHeader, config);
  if (user === null) return { ok: false, status: 401, error: "unauthorized" };

  if (new TextEncoder().encode(rawBody).length > MAX_DRAFT_BYTES) {
    return { ok: false, status: 413, error: "draft_too_large" };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(rawBody);
  } catch {
    return { ok: false, status: 400, error: "invalid_request" };
  }

  const parsed = PutDraftBodySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, status: 400, error: "invalid_request" };

  const meta: DraftMeta = parsed.data.meta;

  // Quota (FR-008), evaluated against what storage would hold *after* this
  // write. Both figures subtract the row being replaced, so an update is
  // measured as a delta rather than as an addition:
  //
  //   prospectiveBytes = totalBytes - existingBytes + newBytes
  //   prospectiveCount = draftCount + (this write is an insert ? 1 : 0)
  //
  // FR-009 falls out of that subtraction with no special case — re-saving an
  // existing draft at the same or a smaller size can never push the total up, so
  // a user sitting at quota can always keep working on what they already have.
  // A refusal happens before `store.putDraft`, so existing drafts are untouched.
  const newBytes = measureDraftBytes(parsed.data.draft);
  const [usage, existing] = await Promise.all([
    config.store.getUsage(user.id),
    config.store.getDraftBytes(user.id, meta.draftId),
  ]);
  const prospectiveBytes = usage.totalBytes - (existing ?? 0) + newBytes;
  const prospectiveCount = usage.draftCount + (existing === null ? 1 : 0);
  if (prospectiveBytes > MAX_TOTAL_DRAFT_BYTES || prospectiveCount > MAX_DRAFTS_PER_USER) {
    return { ok: false, status: 409, error: "draft_quota_exceeded" };
  }

  await config.store.putDraft(user.id, user.login, meta, parsed.data.draft);
  return { ok: true, status: 200, data: { savedAt: meta.savedAt } };
}

// ---------------------------------------------------------------------------
// DELETE /drafts
// ---------------------------------------------------------------------------

export async function deleteDraft(
  authHeader: string | null | undefined,
  config: DraftHandlerConfig,
  draftId: string = DEFAULT_DRAFT_ID,
): Promise<DraftResult<{ ok: true }>> {
  const user = await authenticate(authHeader, config);
  if (user === null) return { ok: false, status: 401, error: "unauthorized" };

  await config.store.deleteDraft(user.id, draftId);
  return { ok: true, status: 200, data: { ok: true } };
}
