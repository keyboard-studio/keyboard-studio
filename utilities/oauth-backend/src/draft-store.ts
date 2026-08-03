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

/**
 * Aggregate draft usage for one verified user — the read model the quota checks
 * against. Not a stored entity: both implementations derive it from what they
 * already persist (a `count(*)`/`SUM(size_bytes)` over the metadata table, or a
 * walk of the in-memory map).
 */
export interface DraftUsage {
  /** How many drafts this user currently has stored. */
  draftCount: number;
  /** Sum of every stored draft's serialized payload size, in bytes. */
  totalBytes: number;
}

/**
 * Serialized size of one draft payload, measured the one way every implementor
 * must measure it so the aggregate and the per-draft figure are commensurable:
 * UTF-8 bytes of `JSON.stringify(draft)`. `VercelDraftStore.putDraft` records
 * exactly this into `size_bytes`.
 */
export function measureDraftBytes(draft: unknown): number {
  return new TextEncoder().encode(JSON.stringify(draft)).length;
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
  /**
   * Aggregate usage for the quota. Adding this member is a deliberate
   * compile-time break: the two implementors ({@link MemoryDraftStore} and
   * `VercelDraftStore`) must both satisfy it or the build fails, so no
   * deployment silently runs unmetered.
   */
  getUsage(userId: number): Promise<DraftUsage>;
  /**
   * Stored size of one of the user's drafts, or `null` when it does not exist.
   *
   * Separate from {@link getUsage} because the quota subtracts the row being
   * replaced before comparing: `totalBytes - existingBytes + newBytes`. That
   * subtraction is what makes FR-009 fall out with no special case — a user at
   * quota can always re-save in-progress work — and it needs the *per-draft*
   * figure, which a per-user aggregate cannot supply.
   *
   * `null` rather than `0` for an absent draft, so the same call also answers
   * insert-vs-update for the count check without a second round trip. Absent and
   * empty stay distinct on purpose: no size is not a size of zero, and a store
   * that recorded `size_bytes = 0` for a real row would otherwise have its
   * owner's re-save counted as an insert and refused at the count limit.
   */
  getDraftBytes(userId: number, draftId: string): Promise<number | null>;
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

  getUsage(userId: number): Promise<DraftUsage> {
    const userDrafts = this.rows.get(userId);
    if (userDrafts === undefined) return Promise.resolve({ draftCount: 0, totalBytes: 0 });
    let totalBytes = 0;
    for (const row of userDrafts.values()) totalBytes += measureDraftBytes(row.draft);
    return Promise.resolve({ draftCount: userDrafts.size, totalBytes });
  }

  getDraftBytes(userId: number, draftId: string): Promise<number | null> {
    const row = this.rows.get(userId)?.get(draftId);
    return Promise.resolve(row === undefined ? null : measureDraftBytes(row.draft));
  }
}
