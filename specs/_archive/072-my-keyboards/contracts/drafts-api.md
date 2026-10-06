# Contract: `/drafts` API (as shipped)

**Retroactive note.** This is the live contract, verified against `utilities/oauth-backend/src/draft-handlers.ts` and `api/drafts/{index,content}.ts` on 2026-08-19. It matches [spec.md's API contract](spec.md#api-contract) section.

Base path: `/drafts` (Vercel rewrite in `vercel.json`).

| Method | Path | `draftId` | Behavior |
|---|---|---|---|
| `GET` | `/drafts` | absent | List op: `{ drafts: DraftMeta[] }` — every project's metadata for the caller, no payload. |
| `GET` | `/drafts?draftId=X` | present | Single project's metadata. |
| `GET` | `/drafts/content?draftId=X` | present or absent | Full opaque draft for one project. Absent → `DEFAULT_DRAFT_ID` ("default") slot. |
| `PUT` | `/drafts?draftId=X` | present or absent (draftId comes from the request body's `meta.draftId`) | Upsert one project's `{meta, draft}`. |
| `DELETE` | `/drafts?draftId=X` | present or absent | Remove one project. Absent → default slot. |

**Back-compat**: `DEFAULT_DRAFT_ID = "default"` — an omitted `draftId` resolves to this reserved sentinel, the value a pre-existing single-draft row is migrated to. An un-upgraded client continues to work unmodified against the upgraded backend.

**Status codes** (verified against `draft-handlers.ts` + the Vercel glue in `api/drafts/index.ts`):

- `503 draft_not_configured` — `envDraftConfig()` returns `null` (Postgres/Blob env absent). Thrown from the Vercel glue, not `draft-handlers.ts` itself.
- `401 unauthorized` — missing/invalid bearer token (`verifyUser` returns `null`). In `draft-handlers.ts`.
- `400 invalid_request` — malformed JSON or schema mismatch. In `draft-handlers.ts`.
- `413 draft_too_large` — `MAX_DRAFT_BYTES` exceeded, checked before `JSON.parse`. In `draft-handlers.ts`.
- `502 draft_unavailable` — storage errored at runtime. Thrown from the Vercel glue.
- The list op's success shape is `200 { drafts: DraftMeta[] }` (always an array, never `404`).

**Client transport** (`packages/studio/src/lib/serverDraftStore.ts`): `saveServerDraft`, `saveServerDraftBeacon`, `loadServerDraftMeta`, `listServerDrafts`, `loadServerDraftContent`, `clearServerDraft` — each `draftId`-scoped except `listServerDrafts` (no `draftId` param, returns all).

## Non-goals unchanged from spec

No pagination; `content.ts`'s GET has no list mode (content is always single-draft, by design — every "list" use only needs metadata, never the full opaque payload).
