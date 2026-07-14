/**
 * Storage abstraction for server-side drafts.
 *
 * Keeps `draft-handlers` infra-agnostic (the same reason `handlers.ts` injects
 * fetch and `managed-pr` injects `getInstallationToken`): the deployed Vercel
 * functions supply a store backed by Vercel Blob (the payload) + Postgres (the
 * metadata row), while tests and the standalone dev server use
 * {@link MemoryDraftStore}. The standalone Fastify server therefore pulls in no
 * Vercel-specific dependencies.
 *
 * Single-draft model (v1): one draft per GitHub user, keyed by numeric user id.
 * A future multi-project "My keyboards" becomes an additional `draftId` on these
 * signatures without changing the handler contract.
 */

import type { DraftMeta } from "./draft-schemas.js";

/** A stored draft: the small metadata row plus the opaque payload. */
export interface StoredDraft {
  meta: DraftMeta;
  /** The full StudioDraft record, exactly as the SPA sent it. */
  draft: unknown;
}

export interface DraftStore {
  /** Fetch the metadata row for a user, or null when none exists. Cheap (no payload). */
  getMeta(userId: number): Promise<DraftMeta | null>;
  /** Fetch the full stored draft for a user, or null when none exists. */
  getDraft(userId: number): Promise<StoredDraft | null>;
  /** Create or replace the user's draft (metadata + payload). */
  putDraft(userId: number, login: string, meta: DraftMeta, draft: unknown): Promise<void>;
  /** Remove the user's draft (payload + metadata). Idempotent. */
  deleteDraft(userId: number): Promise<void>;
}

/**
 * In-memory {@link DraftStore} for unit tests and local dev parity. Not durable
 * across process restarts — never use in production.
 */
export class MemoryDraftStore implements DraftStore {
  private readonly rows = new Map<number, StoredDraft>();

  getMeta(userId: number): Promise<DraftMeta | null> {
    return Promise.resolve(this.rows.get(userId)?.meta ?? null);
  }

  getDraft(userId: number): Promise<StoredDraft | null> {
    return Promise.resolve(this.rows.get(userId) ?? null);
  }

  putDraft(userId: number, _login: string, meta: DraftMeta, draft: unknown): Promise<void> {
    this.rows.set(userId, { meta, draft });
    return Promise.resolve();
  }

  deleteDraft(userId: number): Promise<void> {
    this.rows.delete(userId);
    return Promise.resolve();
  }
}
