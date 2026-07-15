/**
 * Zod request/response schemas for the server-side draft-persistence endpoints.
 *
 * Signed-in authors mirror their in-progress keyboard (the same StudioDraft the
 * SPA already writes to localStorage) to the server so it survives a cleared
 * browser, a new tab, or a different device. Guests are unaffected — the client
 * only calls these endpoints when a verified GitHub identity is present.
 *
 * The draft *payload* itself is treated opaquely here: the SPA owns its shape
 * (survey snapshot + working-copy snapshot, base64-encoded VFS and all) and this
 * backend never introspects it — it stores the blob and the small metadata row
 * the resume banner needs. So `draft` is `z.unknown()`, size-bounded rather than
 * shape-validated. See {@link MAX_DRAFT_BYTES}.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Size ceiling
// ---------------------------------------------------------------------------

/**
 * Hard ceiling on the serialized draft payload (bytes). Vercel serverless
 * functions cap request bodies at ~4.5 MB; we reject a hair below that so an
 * oversized draft fails as a clean 413 `draft_too_large` from the handler with
 * an actionable code, not an opaque platform-level truncation. A typical
 * single-keyboard snapshot is tens-to-low-hundreds of KB, so this only trips on
 * a pathological base + undo stack. The client applies the same guard before
 * uploading and simply keeps the local draft when it trips.
 */
export const MAX_DRAFT_BYTES = 4 * 1024 * 1024;

/**
 * The slot a draft occupies when a user has no draftId of their own (an
 * un-upgraded client, or the first draft before "My keyboards" existed). Every
 * pre-multi-draft record lives here, so the single-draft client keeps working
 * against the same slot after this change ships.
 */
export const DEFAULT_DRAFT_ID = "default";

// ---------------------------------------------------------------------------
// Draft metadata — the small denormalized row the resume banner reads without
// fetching the full blob. The SPA derives these fields and sends them on save.
// ---------------------------------------------------------------------------

export const DraftMetaSchema = z.object({
  /** Epoch ms when the client captured the draft (Date.now() on the SPA). */
  savedAt: z.number().int().nonnegative(),
  /** Survey step the draft was left on (e.g. "carve"). Bounded, not enumerated. */
  activeStepId: z.string().min(1).max(64),
  /** Best-effort human label for the in-progress keyboard, or null. */
  label: z.string().max(200).nullable(),
  /** Keyboard id when known, for display / future multi-project keys, or null. */
  keyboardId: z.string().max(80).nullable(),
  /** Client draft schema version (StudioDraft.version), so a stale shape is detectable. */
  schemaVersion: z.number().int().nonnegative(),
  /**
   * The client's per-project key ("My keyboards" multi-draft). Optional so an
   * un-upgraded single-draft client (which never sends this field) still
   * validates — it lands in the {@link DEFAULT_DRAFT_ID} slot.
   */
  draftId: z.string().min(1).max(80).default(DEFAULT_DRAFT_ID),
  /** Draft lifecycle; defaults to "draft" for clients that predate submission tracking. */
  status: z.enum(["draft", "submitted"]).default("draft"),
  /** URL of the PR opened from this draft, once submitted, or null. */
  prUrl: z.string().url().nullable().default(null),
});

export type DraftMeta = z.infer<typeof DraftMetaSchema>;

// ---------------------------------------------------------------------------
// PUT /drafts — request body
// ---------------------------------------------------------------------------

export const PutDraftBodySchema = z.object({
  meta: DraftMetaSchema,
  /**
   * The full StudioDraft record, opaque to the backend. Stored verbatim in the
   * blob and returned as-is by GET /drafts/content. Size is enforced separately
   * against {@link MAX_DRAFT_BYTES} (zod cannot measure serialized bytes here).
   */
  draft: z.unknown(),
});

export type PutDraftBody = z.infer<typeof PutDraftBodySchema>;

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

/** GET /drafts — metadata only (drives the resume banner). `null` when none. */
export const GetDraftMetaResponseSchema = z.object({
  meta: DraftMetaSchema.nullable(),
});
export type GetDraftMetaResponse = z.infer<typeof GetDraftMetaResponseSchema>;

/** GET /drafts/content — the full opaque draft, or `null` when none. */
export const GetDraftContentResponseSchema = z.object({
  draft: z.unknown().nullable(),
  meta: DraftMetaSchema.nullable(),
});
export type GetDraftContentResponse = z.infer<typeof GetDraftContentResponseSchema>;

/** PUT /drafts — 200 acknowledgement. */
export const PutDraftResponseSchema = z.object({
  savedAt: z.number().int().nonnegative(),
});
export type PutDraftResponse = z.infer<typeof PutDraftResponseSchema>;

/** GET /drafts (list) — every draft's metadata, for the "My keyboards" list. */
export const GetDraftListResponseSchema = z.object({
  drafts: z.array(DraftMetaSchema),
});
export type GetDraftListResponse = z.infer<typeof GetDraftListResponseSchema>;
