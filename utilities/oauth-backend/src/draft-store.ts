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
 * Multi-draft model ("My keyboards"): drafts are keyed by (userId, draftId).
 * An un-upgraded client that never sends a draftId lands in the
 * {@link DEFAULT_DRAFT_ID} slot, preserving the old single-draft behaviour.
 */

import type { DraftMeta } from "./draft-schemas.js";

/** A stored draft: the small metadata row plus the opaque payload. */
export interface StoredDraft {
  meta: DraftMeta;
  /** The full StudioDraft record, exactly as the SPA sent it. */
  draft: unknown;
}

export interface DraftStore {
  /** Fetch the metadata row for a user's draft, or null when none exists. Cheap (no payload). */
  getMeta(userId: number, draftId: string): Promise<DraftMeta | null>;
  /** Fetch the full stored draft for a user, or null when none exists. */
  getDraft(userId: number, draftId: string): Promise<StoredDraft | null>;
  /** Create or replace one of the user's drafts (metadata + payload). */
  putDraft(userId: number, login: string, meta: DraftMeta, draft: unknown): Promise<void>;
  /** Remove one of the user's drafts (payload + metadata). Idempotent. */
  deleteDraft(userId: number, draftId: string): Promise<void>;
  /** List metadata for every draft the user has. Empty array when none. */
  listMeta(userId: number): Promise<DraftMeta[]>;
}

/**
 * In-memory {@link DraftStore} for unit tests and local dev parity. Not durable
 * across process restarts — never use in production.
 */
export class MemoryDraftStore implements DraftStore {
  private readonly rows = new Map<number, Map<string, StoredDraft>>();

  getMeta(userId: number, draftId: string): Promise<DraftMeta | null> {
    return Promise.resolve(this.rows.get(userId)?.get(draftId)?.meta ?? null);
  }

  getDraft(userId: number, draftId: string): Promise<StoredDraft | null> {
    return Promise.resolve(this.rows.get(userId)?.get(draftId) ?? null);
  }

  putDraft(userId: number, _login: string, meta: DraftMeta, draft: unknown): Promise<void> {
    let userDrafts = this.rows.get(userId);
    if (userDrafts === undefined) {
      userDrafts = new Map<string, StoredDraft>();
      this.rows.set(userId, userDrafts);
    }
    userDrafts.set(meta.draftId, { meta, draft });
    return Promise.resolve();
  }

  deleteDraft(userId: number, draftId: string): Promise<void> {
    this.rows.get(userId)?.delete(draftId);
    return Promise.resolve();
  }

  listMeta(userId: number): Promise<DraftMeta[]> {
    const userDrafts = this.rows.get(userId);
    if (userDrafts === undefined) return Promise.resolve([]);
    return Promise.resolve(Array.from(userDrafts.values(), (row) => row.meta));
  }
}
