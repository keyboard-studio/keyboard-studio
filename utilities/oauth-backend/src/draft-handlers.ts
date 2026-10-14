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
  DraftIdSchema,
  MAX_DRAFT_BYTES,
  PutDraftBodySchema,
  type DeleteAllDraftsResponse,
  type DraftMeta,
  type ExportDraftsResponse,
  type GetDraftContentResponse,
  type GetDraftListResponse,
  type GetDraftMetaResponse,
  type PutDraftResponse,
} from "./draft-schemas.js";
import type { DraftStore } from "./draft-store.js";
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
 * Build a {@link DraftHandlerConfig} from a concrete store and a GitHub fetch.
 * The real verifier calls GitHub's `/user`; tests can bypass by constructing the
 * config literal directly with a stub `verifyUser`.
 */
export function buildDraftConfig(store: DraftStore, fetchFn: OAuthFetchFn): DraftHandlerConfig {
  return {
    store,
    verifyUser: (token) => verifyGitHubUser(token, fetchFn),
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

/**
 * Query-string draftIds bypass PutDraftBodySchema, so the read/delete paths
 * apply the same allowlist before the id reaches a store pathname.
 */
function isValidDraftId(draftId: string): boolean {
  return DraftIdSchema.safeParse(draftId).success;
}

const INVALID_DRAFT_ID = { ok: false, status: 400, error: "invalid_request" } as const;

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
  if (!isValidDraftId(draftId)) return INVALID_DRAFT_ID;

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
  if (!isValidDraftId(draftId)) return INVALID_DRAFT_ID;

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
  if (!isValidDraftId(draftId)) return INVALID_DRAFT_ID;

  await config.store.deleteDraft(user.id, draftId);
  return { ok: true, status: 200, data: { ok: true } };
}

// ---------------------------------------------------------------------------
// GET /drafts/export — DSAR self-service export (spec 097)
// ---------------------------------------------------------------------------

/**
 * Everything the server holds for the caller: their identity key and
 * every draft (payload + metadata). Authenticated exactly like every
 * other draft operation — the export is keyed to the verified identity,
 * never to a client-supplied id.
 */
export async function exportDrafts(
  authHeader: string | null | undefined,
  config: DraftHandlerConfig,
): Promise<DraftResult<ExportDraftsResponse>> {
  const user = await authenticate(authHeader, config);
  if (user === null) return { ok: false, status: 401, error: "unauthorized" };

  const stored = await config.store.getAllDrafts(user.id);
  return {
    ok: true,
    status: 200,
    data: {
      exportedAt: new Date().toISOString(),
      identity: { githubUserId: user.id, login: user.login },
      drafts: stored.map((row) => ({ meta: row.meta, draft: row.draft })),
    },
  };
}

// ---------------------------------------------------------------------------
// DELETE /drafts?all=true — self-service erasure (spec 098)
// ---------------------------------------------------------------------------

/**
 * Delete every draft the caller has — payloads and metadata together,
 * no soft delete. Returns the count actually removed.
 */
export async function deleteAllDrafts(
  authHeader: string | null | undefined,
  config: DraftHandlerConfig,
): Promise<DraftResult<DeleteAllDraftsResponse>> {
  const user = await authenticate(authHeader, config);
  if (user === null) return { ok: false, status: 401, error: "unauthorized" };

  const deleted = await config.store.deleteAllDrafts(user.id);
  return { ok: true, status: 200, data: { deleted } };
}

// ---------------------------------------------------------------------------
// Owner purge — erasure by verified identity (spec 098, FR-002)
// ---------------------------------------------------------------------------

/**
 * The completion record an owner purge emits for the request register:
 * the minimum that proves the act (identity key, count, time, outcome)
 * and never a copy of the data removed.
 */
export interface PurgeCompletionRecord {
  githubUserId: number;
  deleted: number;
  purgedAt: string;
  outcome: "purged";
}

/**
 * Purge every draft held for `userId`, for erasure requests that arrive
 * through any channel (spec 098). Identity verification happens in the
 * procedure (account control, spec 097) before this is invoked — this
 * function is the execution step, callable only from operator tooling,
 * never from an HTTP route.
 */
export async function purgeUserDrafts(
  userId: number,
  config: DraftHandlerConfig,
): Promise<PurgeCompletionRecord> {
  const deleted = await config.store.deleteAllDrafts(userId);
  return {
    githubUserId: userId,
    deleted,
    purgedAt: new Date().toISOString(),
    outcome: "purged",
  };
}
