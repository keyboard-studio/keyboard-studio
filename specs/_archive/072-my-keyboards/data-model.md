# Phase 1 Data Model: My Keyboards — per-user multi-project draft + submission list

**Retroactive note.** These are the as-shipped shapes, verified against the live tree 2026-08-19. They match [spec.md's Data model](spec.md#data-model) section field-for-field except where noted.

## Client: `ProjectIndexEntry` (`packages/studio/src/lib/draftTypes.ts`)

```ts
interface ProjectIndexEntry {
  projectKey: string;
  savedAt: number;
  activeStepId: ActiveStepId;
  label: string | null;
  langTag: string | null;
  status: "draft" | "submitted";
  prUrl: string | null;
}
```

Matches the spec exactly. Stored at `ks.draftIndex.v1` (`DRAFT_INDEX_KEY` in `draftPersistence.ts`), upserted by `saveDraft`, removed from by `clearDraft`, backfilled for pre-index records by `reconcileProjectIndex()`.

## Client: `DurableDraft` (`packages/studio/src/lib/draftTypes.ts`)

Per-project full record at `ks.draft.<projectKey>.v1` (`DRAFT_KEY_PREFIX = "ks.draft."`, `DRAFT_VERSION = 1`): `version, savedAt, projectKey, displayName, languageTag, workingCopy, traversal, phaseBDraft?, decisionRecord?`. Shape unchanged by this feature, as the spec states.

`ks.draft.active` (`ACTIVE_PROJECT_KEY`) — `string | null`, unchanged.

`PENDING_PROJECT_KEY = "__pending__"` — present, exported for interface parity; `saveDraft`'s VR-2 guard means it is reachable only via the F6 pre-instantiation-progress relaxation, matching the spec's "Not applicable post-port" note.

## Server: `DraftMetaSchema` (`utilities/oauth-backend/src/draft-schemas.ts`)

```ts
export const DraftMetaSchema = z.object({
  draftId: z.string().min(1).max(80).default(DEFAULT_DRAFT_ID),   // DEFAULT_DRAFT_ID = "default"
  savedAt: z.number().int().nonnegative(),
  activeStepId: z.string().min(1).max(64),
  label: z.string().max(200).nullable(),
  keyboardId: z.string().max(80).nullable(),
  schemaVersion: z.number().int().nonnegative(),
  status: z.enum(["draft", "submitted"]).default("draft"),
  prUrl: z.string().url().nullable().default(null),
});
```

Matches the spec's proposed shape; `prUrl` is additionally validated as a URL (`z.string().url()`), one small strengthening the spec's sketch (`z.string().max(500)`) did not specify but does not conflict with.

`GetDraftListResponseSchema` — `{ drafts: DraftMeta[] }` — present, backing the list endpoint.

## Server: `DraftStore` (`utilities/oauth-backend/src/draft-store.ts`)

```ts
export interface DraftStore {
  listMeta(userId: number): Promise<DraftMeta[]>;
  getMeta(userId: number, draftId: string): Promise<DraftMeta | null>;
  getDraft(userId: number, draftId: string): Promise<StoredDraft | null>;
  putDraft(userId: number, login: string, meta: DraftMeta, draft: unknown): Promise<void>;  // draftId comes from meta.draftId
  deleteDraft(userId: number, draftId: string): Promise<void>;
}
```

One shape note vs. the spec's sketch: `putDraft`'s `draftId` is carried on `meta.draftId` rather than as a separate positional parameter — a minor signature difference from the spec's proposed `putDraft(userId, login, draftId, meta, draft)`, functionally equivalent (the id is present exactly once, just addressed through the metadata object). `MemoryDraftStore` is `Map<number, Map<string, StoredDraft>>` as specified.

## Server: `schema.sql` (`api/drafts/schema.sql`)

```sql
CREATE TABLE IF NOT EXISTS drafts (
  github_user_id  BIGINT       NOT NULL,
  draft_id        TEXT         NOT NULL DEFAULT 'default',
  github_login    TEXT         NOT NULL,
  keyboard_id     TEXT,
  active_step_id  TEXT         NOT NULL,
  label           TEXT,
  schema_version  INTEGER      NOT NULL,
  status          TEXT         NOT NULL DEFAULT 'draft',
  pr_url          TEXT,
  blob_pathname   TEXT         NOT NULL,
  saved_at        BIGINT       NOT NULL,
  size_bytes      INTEGER      NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (github_user_id, draft_id)
);
```

Plus an idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` / `DROP CONSTRAINT drafts_pkey` / `ADD PRIMARY KEY (github_user_id, draft_id)` migration block for a pre-existing single-key deployment. Matches the spec's proposed migration; the shipped version is written defensively (safe to re-run) beyond what the spec's own "illustrative" DDL sketch specified.

`VercelDraftStore.blobPathname(userId, draftId)` → `` `drafts/${userId}/${draftId}.json` `` — matches spec. SQL upsert: `ON CONFLICT (github_user_id, draft_id) DO UPDATE` — matches spec.

## Client transport: `serverDraftStore.ts` (`packages/studio/src/lib/serverDraftStore.ts`)

All `draftId`-scoped as the spec proposes: `saveServerDraft(token, meta, draft, draftId)`, `saveServerDraftBeacon(...)`, `loadServerDraftMeta(token, draftId)`, `listServerDrafts(token)` (new, matches spec), `loadServerDraftContent(token, draftId)`, `clearServerDraft(token, draftId)`. `ServerDraftMeta` carries `draftId?`, `status?`, `prUrl?` as the spec's three new fields.

## No entities diverge from the spec's proposed shapes in a way that would require a schema change to this plan — this section exists to pin the verified, as-shipped shapes for future reference, not to propose new ones.
