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
  MAX_DRAFT_BYTES,
  PutDraftBodySchema,
  type DraftMeta,
  type GetDraftContentResponse,
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

// ---------------------------------------------------------------------------
// GET /drafts — metadata only
// ---------------------------------------------------------------------------

export async function getDraftMeta(
  authHeader: string | null | undefined,
  config: DraftHandlerConfig,
): Promise<DraftResult<GetDraftMetaResponse>> {
  const user = await authenticate(authHeader, config);
  if (user === null) return { ok: false, status: 401, error: "unauthorized" };

  const meta = await config.store.getMeta(user.id);
  return { ok: true, status: 200, data: { meta } };
}

// ---------------------------------------------------------------------------
// GET /drafts/content — full opaque draft
// ---------------------------------------------------------------------------

export async function getDraftContent(
  authHeader: string | null | undefined,
  config: DraftHandlerConfig,
): Promise<DraftResult<GetDraftContentResponse>> {
  const user = await authenticate(authHeader, config);
  if (user === null) return { ok: false, status: 401, error: "unauthorized" };

  const stored = await config.store.getDraft(user.id);
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
): Promise<DraftResult<{ ok: true }>> {
  const user = await authenticate(authHeader, config);
  if (user === null) return { ok: false, status: 401, error: "unauthorized" };

  await config.store.deleteDraft(user.id);
  return { ok: true, status: 200, data: { ok: true } };
}
