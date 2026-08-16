# Feature Specification: My Keyboards — per-user multi-project draft + submission list

**Feature Branch**: `km/my-keyboards`

**Created**: 2026-07-15

**Status**: Draft

**Input**: A per-user list of the keyboards an author has worked on — in-progress drafts and submitted keyboards — surfaced on the profile page. Replaces the disabled "My keyboards" placeholder in [packages/studio/src/components/ProfileScreen.tsx](../../packages/studio/src/components/ProfileScreen.tsx).

**Governing docs**: [spec.md](../../spec.md) §8 (working-copy spine v1.3.0 — extracted to [specs/008-data-flow/spec.md](../008-data-flow/spec.md): two authoring tracks, single persistent working copy per session), §12 (Output artifacts — VirtualFS / working-copy invariants: authoring never writes to host disk, the working copy is serialized only at output), §13 (Team boundaries — engine owns output paths and service interfaces; content is unaffected by this feature). This spec builds directly on the server-draft-persistence work already merged to `dev` — see the module docstrings in [utilities/oauth-backend/src/draft-store.ts](../../utilities/oauth-backend/src/draft-store.ts), [draft-schemas.ts](../../utilities/oauth-backend/src/draft-schemas.ts), and [api/drafts/schema.sql](../../api/drafts/schema.sql), each of which already documents "a future multi-project 'My keyboards'" as the anticipated next step. It does not re-litigate that prior design; it extends it.

---

## Summary

Today the studio persists **one** in-progress keyboard per author: one localStorage key on the client, one row per GitHub user id on the server. This feature generalizes both layers to a **per-project** model — a stable key derived from the keyboard's own id — so an author can have several drafts in flight, resume any one of them by name, and see their already-submitted keyboards (PR link included) alongside the drafts. The result is surfaced as a real list on the profile page, replacing the disabled placeholder.

## Motivation

An author who starts a second keyboard today silently loses the first draft — both client-side (spec 034's VR-5 single-project policy *deletes* the previously-active project's draft the moment a working copy is instantiated under a different key) and server-side (one row keyed by `github_user_id`). There is no way to see, resume, or even discover that a prior draft existed once a new one has been started. Once an author submits a keyboard, all record of it disappears from the studio entirely — the PR lives only on GitHub, with no link back from the tool that produced it. "My keyboards" closes both gaps: multiple concurrent drafts, and a durable, in-studio record of what's been submitted.

## Current state (ground truth)

> **Port note (read this first).** This spec was originally written against the `dev` branch, whose client draft engine was `draftAutosave.ts` writing a single `ks.studio.draft` key. **That is not what shipped.** The feature was ported onto `main`'s existing draft engine ([draftPersistence.ts](../../packages/studio/src/lib/draftPersistence.ts)), which had *already* moved to per-project keys in spec 034. The sections below have been rewritten to describe `main`'s scheme — the keys, module names, and migration story here are the ones in the code. Where this spec previously described `ks.studio.*` keys or a `draftAutosave.ts` module, that was the pre-port design; it is superseded, not merely renamed.

The design below is additive to what already exists on `main`; implementers should read these before writing code, not rely on this section as a substitute:

- **Client drafts are per-project already, but only one may exist at a time.** [packages/studio/src/lib/draftPersistence.ts](../../packages/studio/src/lib/draftPersistence.ts) writes a `DurableDraft` (defined in [draftTypes.ts](../../packages/studio/src/lib/draftTypes.ts)) to a namespaced, versioned key per project — `ks.draft.<projectKey>.v1` — plus a `ks.draft.active` pointer naming which project the current session belongs to. So the *key scheme* needs no migration. What enforces single-slot behavior is a **policy**, not the keys: spec 034's VR-5 (`replaceActiveDraftIfDifferentProject`, called from `StudioShell`'s `onInstantiate`) clears the previously-active project's draft whenever a working copy is instantiated under a different key. Lifting that policy is this feature's real client-side work — see [Superseded: spec 034 VR-5](#superseded-spec-034-vr-5). `startCloudSync()` mirrors the active project's draft to the server on a coarse debounce.
- **Server drafts are single-row-per-user.** [utilities/oauth-backend/src/draft-store.ts](../../utilities/oauth-backend/src/draft-store.ts) (`DraftStore` / `MemoryDraftStore`) and [draft-handlers.ts](../../utilities/oauth-backend/src/draft-handlers.ts) key everything on the numeric GitHub user id. `DraftMeta` ([draft-schemas.ts](../../utilities/oauth-backend/src/draft-schemas.ts)) already carries a `keyboardId` field, but it is reserved and always `null` today. The Vercel glue — [api/drafts/index.ts](../../api/drafts/index.ts) (GET/PUT/DELETE dispatched on `req.method`), [api/drafts/content.ts](../../api/drafts/content.ts), [api/drafts/_store.ts](../../api/drafts/_store.ts) (Postgres metadata row + Blob payload) — all assume one row per user.
- **[api/drafts/schema.sql](../../api/drafts/schema.sql) already documents the intended migration**: primary key moves from `github_user_id` alone to `(github_user_id, draft_id)`, with a new `draft_id` column — annotated "no other column changes" at the time it was written. This spec adds two more columns (`status`, `pr_url`) beyond what that comment anticipated; see [Server data model](#server-data-model).
- **The profile page has a disabled placeholder.** [ProfileScreen.tsx](../../packages/studio/src/components/ProfileScreen.tsx) (~lines 300–309) renders a disabled "My keyboards" button with a "Coming soon" caption. Routing is hash-based via `navigateTo` / `RouteId` in [packages/studio/src/lib/navigate.ts](../../packages/studio/src/lib/navigate.ts); `navigateTo` takes no parameters beyond the route id, and a `"profile"` route already exists.
- **Submission persists nothing.** [api/submit/managed-pr.ts](../../api/submit/managed-pr.ts) returns `{prUrl, commitSha}` on success; the client (`ManagedPRSubmitPanel.tsx`) currently calls `clearDraft()` on success, deleting the local draft outright. There is no server-side record of a submission today.

## Out-of-repo prerequisite

Env-gated storage (`POSTGRES_URL` / `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`) is a **deploy-time** concern only. [api/drafts/index.ts](../../api/drafts/index.ts)'s `envDraftConfig()` already returns `null` (mapped to `503 draft_not_configured`) when either is absent, and `MemoryDraftStore` already exists precisely so tests and the standalone Fastify dev server never need the real Vercel env. This feature must remain fully buildable and testable (`pnpm typecheck`, `pnpm --filter @keyboard-studio/oauth-backend test`, `pnpm --filter @keyboard-studio/studio test`) without either variable set.

---

## User Scenarios & Testing

### User Story 1 — Author sees all their keyboards on one screen (Priority: P1)

A signed-in author who has started two keyboards and submitted a third opens their profile and clicks "My keyboards". They see three cards: two marked "Draft" with a last-edited time, one marked "Submitted" with a link to its PR.

**Why this priority**: This is the feature's entire value proposition — visibility. Without it, nothing else in this spec matters.

**Independent Test**: Seed a signed-in test identity with two `MemoryDraftStore` rows (`status: "draft"`) and one (`status: "submitted"`, non-null `prUrl`) under distinct `draftId`s; load the profile screen; assert three cards render with the correct badges.

**Acceptance Scenarios**:

1. **Given** an author with N drafts and M submitted keyboards, **When** they open "My keyboards", **Then** N+M cards render, each labeled Draft or Submitted.
2. **Given** an author with zero recorded keyboards, **When** they open "My keyboards", **Then** an empty state renders (not a blank screen or a spinner that never resolves).
3. **Given** the server draft store is unreachable (502) or unconfigured (503), **When** the author opens "My keyboards", **Then** an error state renders that does not crash the profile screen.

---

### User Story 2 — Resume a specific in-progress project (Priority: P1)

An author with two drafts in flight clicks Resume on the second card. The studio navigates into the survey with that project's working copy and survey state restored — not whichever draft happened to be most recently edited.

**Why this priority**: Multiple concurrent drafts are pointless if only the most-recent one is resumable; this is the other half of the MVP alongside Story 1.

**Independent Test**: With two distinct per-project drafts registered client-side, click Resume on the non-active one; assert the working-copy store and survey-session store hydrate from that project's record, not the other one.

**Acceptance Scenarios**:

1. **Given** two drafts A and B, **When** the author clicks Resume on B, **Then** the survey resumes on B's `activeStepId` with B's working copy applied, and A is untouched in storage.
2. **Given** a draft whose working-copy snapshot fails to apply (corrupt), **When** Resume is clicked, **Then** the failure is surfaced (mirroring `applyDraft()`'s existing false-on-partial-failure contract) rather than silently landing on an empty survey.

---

### User Story 3 — Pre-index drafts are adopted without loss (Priority: P1)

An author who has been using the studio before this feature ships has one or more drafts sitting under `main`'s existing `ks.draft.<projectKey>.v1` keys, saved before `ks.draftIndex.v1` existed. After the client upgrade, they open "My keyboards" and see those drafts listed — adopted into the index, not stranded because the index happened to arrive later than the records.

**Why this priority**: Without this, shipping the feature hides every in-progress keyboard authors already have. This is a correctness gate on the release, not an enhancement.

> **Restated post-port.** The pre-port version of this story described migrating a single legacy `ks.studio.draft` key into the per-project scheme. On `main` there is no such key and no key-scheme change to migrate (see the Port note under [Current state](#current-state-ground-truth)) — the records are *already* at `ks.draft.<projectKey>.v1`. The real gap is narrower and one level up: `main` has written those records since spec 034 but never wrote an index, and `listDrafts()` reads only the index, so a pre-index draft is on disk yet invisible in the UI. That, not a key migration, is what this story now covers.

**Independent Test**: In a jsdom environment, save a draft through the real `saveDraft` path, then delete `ks.draftIndex.v1` (reproducing a record written before the index existed); call `listDrafts()`; assert the draft is listed. See the `US3/SC-003` block in [draftPersistence.test.ts](../../packages/studio/src/lib/draftPersistence.test.ts).

**Acceptance Scenarios**:

1. **Given** a valid `ks.draft.<projectKey>.v1` record with no matching index row, **When** the author opens "My keyboards", **Then** the record is adopted into the index (`status: "draft"`, `prUrl: null` — a pre-index record carries no submission state) and appears in the list.
2. **Given** reconciliation has already run, **When** it runs again, **Then** it adopts nothing and creates no duplicate row (idempotent).
3. **Given** a record that cannot be adopted — version mismatch (VR-1), malformed (VR-3), or never really instantiated (VR-2) — **When** reconciliation runs, **Then** the record is **skipped and left in place**, never deleted: enumeration is not the place to destroy data, and a version-mismatched record remains `loadDraft`'s to discard when the author actually opens it.
4. **Given** an already-indexed project whose row is `status: "submitted"`, **When** reconciliation runs, **Then** the row is untouched (not reverted to `"draft"`).

**Not applicable post-port**: the pre-port scenario "a legacy draft with no working copy yet is adopted under a synthetic `__pending__` key" is unreachable on `main`'s engine — `saveDraft`'s VR-2 guard refuses to persist before instantiation, so no such record exists to adopt. `PENDING_PROJECT_KEY` remains exported for interface parity only (see its docstring).

---

### User Story 4 — Author checks a submitted keyboard's PR (Priority: P2)

An author who submitted a keyboard last week wants to check its review status. They open "My keyboards", find the card marked Submitted, and click "View PR" to open it on GitHub.

**Why this priority**: Closes the loop the current flow leaves open (submission today produces no lasting record in the studio at all).

**Independent Test**: Seed a `status: "submitted"` record with a `prUrl`; assert the card renders a working link to that URL and no Resume affordance.

**Acceptance Scenarios**:

1. **Given** a submitted project, **When** its card renders, **Then** it shows "View PR" linking to the stored `prUrl`, and does not offer Resume.
2. **Given** a project transitions from draft to submitted mid-session (the author submits while "My keyboards" is open in another tab), **Then** a subsequent list refresh reflects the new status — no requirement for live cross-tab push.

---

### User Story 5 — Author deletes an abandoned draft (Priority: P2)

An author abandons an early experiment and wants it off their list. They click Delete on its card, confirm, and it disappears from both the client index and the server.

**Why this priority**: A list that only grows is a list authors stop trusting. Deletion (already implemented server-side as `deleteDraft`) just needs a `draftId`-scoped UI entry point.

**Independent Test**: Seed two drafts; delete one via the card action; assert the client index drops it and the corresponding server-side `MemoryDraftStore` entry (keyed by `(userId, draftId)`) is gone.

**Acceptance Scenarios**:

1. **Given** a draft card, **When** Delete is confirmed, **Then** the entry is removed from the client project index, its per-project localStorage record is cleared, and `DELETE /drafts` is called with that `draftId`.
2. **Given** a submitted card, **When** Delete is confirmed, **Then** the same removal applies — deleting a "My keyboards" entry never touches the already-merged/open PR on GitHub, it only removes the studio's record of it.

### Edge Cases

- **Two tabs editing the same project.** Last-write-wins, same as today's single-draft semantics — this feature does not add conflict detection or merge (see [Out of scope](#out-of-scope--non-goals)).
- **`identity.keyboardId` changes mid-session (Track 1 rename).** The `projectKey` was fixed at first save; a later id rename does not retroactively re-key the project (re-keying an in-flight draft is out of scope — see Non-goals). The display label still updates because it is derived fresh from `deriveLabel()` on each save.
- **`draftId` omitted by a stale client build.** Server treats it as the reserved default-slot id (back-compat — see [API contract](#api-contract)); an old client behaves exactly as it does today, single-slot.
- **Oversized project count.** No pagination in v1 (see Non-goals) — acceptable because a single author's in-flight-plus-submitted count is expected to be small (low tens at most).

---

## Data model

### Client data model

**`projectKey`** — the stable per-project identifier, derived the same way client-side and used as the server's `draftId`:

```text
projectKey = workingCopy.identity?.keyboardId ?? workingCopy.baseKeyboard?.id ?? null
```

`identity.keyboardId` (Track 1, author-chosen, validated by `validateKeyboardId` per [spec.md §10 Layer A check #1](../../spec.md) — see [packages/engine/src/scaffolder/index.ts](../../packages/engine/src/scaffolder/index.ts)) wins when set, since it is what the output layer renames the VFS to; `baseKeyboard.id` (the base's own stable id, [packages/contracts/src/baseKeyboard.ts](../../packages/contracts/src/baseKeyboard.ts)) is the Track 2 / pre-rename fallback. When neither exists yet (survey-only progress, no working copy instantiated — see [persistWorkingCopy.ts](../../packages/studio/src/lib/persistWorkingCopy.ts)'s `instantiationMode === null` guard), there is no project key: at most one such pre-instantiation draft can exist at a time (the survey has not branched into a project yet), so it is kept under a single reserved slot, `projectKey = "__pending__"`, promoted to a real key the moment a working copy is instantiated and the draft is next saved.

**Storage keys.** Only the index key is new; the other two already exist on `main` (spec 034) and are unchanged by this feature. All three live in [draftPersistence.ts](../../packages/studio/src/lib/draftPersistence.ts).

| Key | New? | Shape | Purpose |
|---|---|---|---|
| `ks.draftIndex.v1` | **new** | `ProjectIndexEntry[]` | Lightweight list for "My keyboards" — no working-copy payload. Upserted by `saveDraft`, removed from by `clearDraft`, and backfilled for pre-index records by `reconcileProjectIndex`. |
| `ks.draft.<projectKey>.v1` | existing | `DurableDraft` ([draftTypes.ts](../../packages/studio/src/lib/draftTypes.ts)) | The full per-project draft record, one per project. Shape unchanged by this feature. |
| `ks.draft.active` | existing | `string \| null` | Which `projectKey` the current survey session belongs to. Set on instantiate, on Resume, and read on `StudioShell` mount to decide which per-project record to load. |

```ts
interface ProjectIndexEntry {
  projectKey: string;
  savedAt: number;
  activeStepId: ActiveStepId;  // from stores/surveySessionStore.ts
  label: string | null;        // same deriveLabel() logic as DraftMeta
  langTag: string | null;      // identity.bcp47 ?? baseKeyboard's language tag, for the card badge
  status: "draft" | "submitted";
  prUrl: string | null;        // set only when status === "submitted"
}
```

`ProjectIndexEntry` is the client mirror of the server's `DraftMeta` (see below) plus `projectKey` and `langTag` — the two are kept structurally close on purpose so `saveProjectDraft()` can build one from the other with a single mapping function, not two divergent shapes.

Autosave (`startDraftAutosave` / `startCloudSync` in [draftAutosave.ts](../../packages/studio/src/lib/draftAutosave.ts)) is retargeted to: capture the draft as today, resolve its `projectKey`, write `ks.studio.project.<projectKey>`, and upsert the matching row in `ks.studio.projects.index`. The debounce constants (1 s local, 20 s cloud) and the "no meaningful progress → no write" guard (`hasMeaningfulProgress`) are unchanged.

### Server data model

`DraftMeta` ([draft-schemas.ts](../../utilities/oauth-backend/src/draft-schemas.ts)) gains three fields:

```ts
export const DraftMetaSchema = z.object({
  draftId: z.string().min(1).max(255),          // NEW — the projectKey; part of the composite key
  savedAt: z.number().int().nonnegative(),
  activeStepId: z.string().min(1).max(64),
  label: z.string().max(200).nullable(),
  keyboardId: z.string().max(80).nullable(),    // unchanged — display-only; usually equals draftId, not guaranteed
  schemaVersion: z.number().int().nonnegative(),
  status: z.enum(["draft", "submitted"]).default("draft"),  // NEW
  prUrl: z.string().max(500).nullable().default(null),      // NEW — set only when status === "submitted"
});
```

`draftId` and `keyboardId` are kept as **distinct** fields even though they will hold the same value for every project created under this feature: `draftId` is the required routing/keying dimension (must always be present, drives the composite primary key), `keyboardId` remains the optional display/reserved field it already was. Collapsing them into one field would couple the storage key to a field whose nullability contract predates this feature.

**`DraftStore`** ([draft-store.ts](../../utilities/oauth-backend/src/draft-store.ts)) gains a `draftId` parameter on every method:

```ts
export interface DraftStore {
  listMeta(userId: number): Promise<DraftMeta[]>;                              // NEW
  getMeta(userId: number, draftId: string): Promise<DraftMeta | null>;
  getDraft(userId: number, draftId: string): Promise<StoredDraft | null>;
  putDraft(userId: number, login: string, draftId: string, meta: DraftMeta, draft: unknown): Promise<void>;
  deleteDraft(userId: number, draftId: string): Promise<void>;
}
```

`MemoryDraftStore` becomes `Map<number, Map<string, StoredDraft>>` (was `Map<number, StoredDraft>`) — a mechanical change with no behavioral surprise, and no dependency on Postgres/Blob, so it remains the vitest + standalone-Fastify-dev-server backing store.

**`schema.sql`** ([api/drafts/schema.sql](../../api/drafts/schema.sql)) migration, extending what the file's own comment already anticipated:

```sql
-- Existing deployments: add the new columns, backfill draft_id to the
-- reserved default-slot id for pre-existing single-draft rows, then widen
-- the primary key. Illustrative — exact DDL is an implementation task.
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS draft_id  TEXT NOT NULL DEFAULT 'default';
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS status     TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS pr_url     TEXT;
ALTER TABLE drafts DROP CONSTRAINT drafts_pkey;
ALTER TABLE drafts ADD PRIMARY KEY (github_user_id, draft_id);
```

For a fresh (not-yet-deployed) environment, `CREATE TABLE IF NOT EXISTS` simply declares the composite key and all columns from the start; the `ALTER TABLE` block above only matters for an environment where the single-row table already exists. Both paths are deploy-time (`psql "$POSTGRES_URL" -f api/drafts/schema.sql"`), never a build or test dependency.

`VercelDraftStore` ([api/drafts/_store.ts](../../api/drafts/_store.ts)) changes `blobPathname` from `drafts/${userId}.json` to `drafts/${userId}/${draftId}.json`, and its `ON CONFLICT (github_user_id)` upsert becomes `ON CONFLICT (github_user_id, draft_id)`. `listMeta` is a single `SELECT ... WHERE github_user_id = $1` with no blob reads (mirrors the existing metadata/payload split that already keeps the resume-banner check cheap).

---

## API contract

Base path unchanged: `/drafts` (Vercel rewrite in `vercel.json`), handlers in [draft-handlers.ts](../../utilities/oauth-backend/src/draft-handlers.ts), Vercel glue in [api/drafts/index.ts](../../api/drafts/index.ts) / [content.ts](../../api/drafts/content.ts).

| Method | Path | `draftId` | Behavior |
|---|---|---|---|
| `GET` | `/drafts` | absent | **NEW.** List op: returns `{ drafts: DraftMeta[] }` — every project's metadata for the caller, no payload. |
| `GET` | `/drafts?draftId=X` | present | Single project's metadata (today's `GET /drafts` behavior, now scoped). |
| `GET` | `/drafts/content?draftId=X` | present or absent | Full opaque draft for one project (Restore / Resume). Absent → default slot. |
| `PUT` | `/drafts?draftId=X` | present or absent | Upsert one project's `{meta, draft}`. Absent → default slot. |
| `DELETE` | `/drafts?draftId=X` | present or absent | Remove one project. Absent → default slot. |

**Back-compat rule**: a request that omits `draftId` is treated as `draftId = "default"` — the reserved sentinel a pre-existing single-draft row is migrated to (see schema migration above). An un-upgraded client (still calling the pre-feature contract) therefore continues to work unmodified against the upgraded backend, always reading/writing the same default-slot row it always did. This is the same fail-soft posture the rest of `/drafts` already uses (503/401 preserved verbatim below).

**Status codes** (all preserved from the existing contract, `getDraftMeta` / `getDraftContent` / `putDraft` / `deleteDraft` gain a `draftId: string` parameter but their auth/error shape is unchanged):

- `503 draft_not_configured` — Postgres/Blob env absent (`envDraftConfig()` returns `null`). Deploy-time gate, not exercised by `pnpm test`.
- `401 unauthorized` — missing/invalid bearer token (`verifyUser` returns `null`). Unchanged.
- `400 invalid_request` — malformed JSON or schema mismatch (now also covers a `draftId` query value failing the `z.string().min(1).max(255)` bound, or one containing characters `validateKeyboardId` already rejects — spaces, parens, brackets, commas — since `draftId` is expected to be a `keyboardId`-shaped value in the common case).
- `413 draft_too_large` — unchanged, `MAX_DRAFT_BYTES` per project (not aggregated across a user's projects).
- `502 draft_unavailable` — storage errored at runtime. Unchanged.
- The **list** op (`GET /drafts` with no `draftId`) is the one new success shape: `200 { drafts: DraftMeta[] }`, always an array (possibly empty), never `404`.

The client transport ([serverDraftStore.ts](../../packages/studio/src/lib/serverDraftStore.ts)) gains `listServerDrafts(token)` alongside the existing `saveServerDraft` / `loadServerDraftMeta` / `loadServerDraftContent` / `clearServerDraft`, each of the latter four gaining a `draftId` argument threaded through to the query string.

---

## Superseded: spec 034 VR-5

Spec 034's **VR-5** ("single-project replace-or-warn") required that instantiating a working copy under a different `projectKey` than the active one *replace* the prior project's draft — a clean delete, never a silent merge. It was the right answer to the question it faced: one draft slot, two projects, so a project switch could not be distinguished from abandonment.

**This feature removes the premise, so VR-5 is retired rather than relaxed.** Once several drafts co-exist by design, deleting the project being switched away from is exactly the data loss [SC-001](#success-criteria) forbids: the author starts keyboard B and finds keyboard A gone from "My keyboards." There is no remaining sense in which navigating to a new base implies discarding the old project.

Concretely:

- `replaceActiveDraftIfDifferentProject()` is **deleted** from [draftPersistence.ts](../../packages/studio/src/lib/draftPersistence.ts), along with its call site in `StudioShell`'s `onInstantiate`. It is not kept as an uncalled export — a live function whose whole contract is "destroy the other project's draft" is a hazard for the next caller who reaches for it by name.
- Deleting a draft is now always an explicit author action, served by `discardActiveDraft()` on the start-over paths ([WelcomeScreen](../../packages/studio/src/components/WelcomeScreen.tsx)'s "start over" and `StudioShell`'s own reset) and by the per-card delete in "My keyboards".
- Spec 034's VR-5 tests are replaced by an `SC-001` block in [draftPersistence.test.ts](../../packages/studio/src/lib/draftPersistence.test.ts) asserting the inverse guarantee — two drafts survive a project switch, and only `discardActiveDraft` removes one — so the old behavior cannot silently return.

Spec 034's data-model.md and contracts/persistence.md keep their VR-5 text as the historical record of the single-project MVP; this section is the amendment that supersedes it. The VR-1..VR-4 validation rules are untouched.

---

## Migration

### Client

There is **no key-scheme migration** — `main` already stores drafts at `ks.draft.<projectKey>.v1` (see the Port note under [Current state](#current-state-ground-truth)). What is needed instead is **index reconciliation**, because the records predate the index.

`reconcileProjectIndex()` in [draftPersistence.ts](../../packages/studio/src/lib/draftPersistence.ts) is called from `listDrafts()` — the read path — rather than from a `StudioShell` mount hook, so a pre-index draft is listed on the author's very first visit to "My keyboards" regardless of boot ordering. It:

1. Snapshots the localStorage key list (before touching the index, since adopting a row writes `ks.draftIndex.v1` and can reorder keys mid-enumeration).
2. Selects keys matching `ks.draft.<projectKey>.v1`. The `.v1` suffix requirement excludes `ks.draft.active`; the index key itself has a different prefix (`ks.draftI`, not `ks.draft.`).
3. Skips any projectKey already present in the index — so an existing row, including a `"submitted"` one, is never rewritten.
4. For the remainder, parses the record and adopts it via the same `buildIndexEntry` the normal save path uses. Records failing VR-1 (version), VR-3 (malformed), or VR-2 (not instantiated) are skipped and **left in place** — never deleted.
5. Returns the number of rows adopted (0 in the steady state, which is what makes calling it from `listDrafts` cheap: only records *missing* a row are ever parsed).

Idempotent by construction: after the first pass every record has a row, so subsequent passes adopt nothing.

### Server

Schema migration (above) is a one-time deploy-time DDL run, not a runtime code path — no handler-level "migrate on first request" logic. `MemoryDraftStore`'s in-test/dev-server equivalent needs no migration since it starts empty every process.

No server-side row adoption is attempted either. The first time a signed-in author's upgraded client pushes, `PUT /drafts?draftId=X` against a table that still holds the pre-migration `default`-keyed row simply creates a new, distinct row; the legacy row is not auto-renamed to the newly-derived `draftId` and stays reachable at the `default` slot only via the back-compat path (an old client, or an explicit `draftId=default` call). This is acceptable: the client-side reconciliation above is what an upgraded client actually needs, and the server's `default` row is naturally superseded on the next real save.

---

## Submission recording

On a successful `POST /submit/managed-pr` ([managed-pr.ts](../../api/submit/managed-pr.ts), returning `{prUrl, commitSha}`), the client no longer calls `clearDraft()` (today's [ManagedPRSubmitPanel.tsx](../../packages/studio/src/components/ManagedPRSubmitPanel.tsx) behavior, which deletes the record outright). Instead it:

1. Resolves the current session's `projectKey`.
2. Updates the local `ProjectIndexEntry` in place: `status: "submitted"`, `prUrl: result.prUrl`.
3. Issues `PUT /drafts?draftId=<projectKey>` with `meta.status = "submitted"`, `meta.prUrl = result.prUrl`, and the existing draft payload unchanged — a status transition, not a deletion, so the project keeps its full working-copy record and can still be inspected (though not re-entered as an editable draft — see Non-goals).
4. Clears `ks.studio.activeProject` (the survey session that just submitted is over), but does **not** remove `ks.studio.project.<projectKey>` or its index entry.

A submitted project's card offers "View PR" (opens `prUrl`) and "Delete" (removes the studio-side record only, per User Story 5) — never "Resume".

---

## UI

Replaces the disabled placeholder in [ProfileScreen.tsx](../../packages/studio/src/components/ProfileScreen.tsx) (~lines 300–309) with a live list, following the existing card/badge visual language already established by [ResumeDraftBanner.tsx](../../packages/studio/src/components/ResumeDraftBanner.tsx) (same style tokens: `BG_CARD`, `BORDER`, `TEXT_MAIN`, `TEXT_DIM`, `BLUE_ACTION`, `FONT` from `survey/surveyStyles.ts`, and the same `relativeTime()` helper — extracted to a shared location rather than duplicated a third time).

- **Card fields**: display name (`label`), language tag (`langTag`), last-edited relative time (`savedAt`), a Draft/Submitted badge.
- **Card actions**: Draft → Resume, Delete. Submitted → View PR (external link to `prUrl`), Delete.
- **Loading state**: shown while the list fetch (`GET /drafts`, merged with the local index for guests / offline) is in flight.
- **Empty state**: "You haven't started a keyboard yet" (or equivalent), no cards.
- **Error state**: shown on `502`/`503`/network failure; does not block navigating back to the studio.
- **Resume**: sets `ks.studio.activeProject = projectKey`, then `navigateTo("survey")` ([navigate.ts](../../packages/studio/src/lib/navigate.ts) — `navigateTo` takes no parameters beyond the route id, so the target project is threaded through the existing active-project pointer, read on the next `StudioShell` mount, the same pattern `loadDraftMeta()` / `defaultLandingRoute()` already use to decide the landing route today).
- **Guests** (no GitHub token): the list is client-only (the local project index); no server call is attempted, matching the existing guest posture of `startCloudSync`/`serverDraftStore.ts` (every server call already requires a bearer token and fails soft otherwise).

---

## Success criteria

- **SC-001**: An author can have two or more drafts simultaneously without either overwriting the other, client-side and server-side.
- **SC-002**: Resuming project B when project A is also in progress restores exactly B's working copy and survey state; A's stored record is byte-for-byte unchanged.
- **SC-003**: Every pre-existing `ks.draft.<projectKey>.v1` record written before `ks.draftIndex.v1` existed is discoverable in "My keyboards" post-upgrade, and no record is deleted by the reconciliation pass — zero silent data loss. (Restated post-port; see [User Story 3](#user-story-3--pre-index-drafts-are-adopted-without-loss-priority-p1).)
- **SC-004**: A successful managed-PR submission produces a `status: "submitted"` entry with a working `prUrl`, and the project is no longer offered as Resumable.
- **SC-005**: `pnpm typecheck`, `pnpm --filter @keyboard-studio/oauth-backend test`, and `pnpm --filter @keyboard-studio/studio test` are green with `POSTGRES_URL` / `DATABASE_URL` / `BLOB_READ_WRITE_TOKEN` all unset.
- **SC-006**: A client that predates this feature (calls `/drafts` with no `draftId`) continues to function unmodified against the upgraded backend.

---

## Scope / non-goals

**In scope**: client per-project storage + migration; server `draftId` dimension + `status`/`prUrl` metadata + list endpoint; submission-status recording; the "My keyboards" list UI on the profile page.

**Explicitly out of scope (non-goals) for v1**:

- **GitHub-only.** The store is keyed on the numeric `github_user_id` (rename-stable identity), exactly as the existing single-draft server layer already is. **Google-identity users are out of scope** — there is no server-side linkage today between a Google identity and a GitHub user id (the Google OAuth endpoint is a separate, unlinked identity path; see the project's Google-OAuth work), so a Google-only author has no server-side "My keyboards" entries. Client-side local drafts still work for a Google-only guest exactly as they do today (local-only, no cloud sync) — this feature does not regress that.
- **Live env is a deploy-time gate, not a build/test dependency.** `POSTGRES_URL`/`DATABASE_URL` + `BLOB_READ_WRITE_TOKEN` gate the real Vercel deployment only; `MemoryDraftStore` + the standalone Fastify dev server + vitest/jsdom cover every code path described in this spec without them.
- **No cross-tab / cross-device conflict resolution.** Last-write-wins, unchanged from today's single-draft posture.
- **No re-keying of an in-flight project.** If `identity.keyboardId` changes mid-session, the project's storage key does not follow it; the display label does (re-derived on every save), but the `projectKey`/`draftId` is fixed at first save.
- **No re-import of a submitted project back into an editable draft.** "View PR" is read-only; reopening a submitted keyboard for further edits is a separate, unbuilt feature.
- **No pagination.** The list renders every entry; expected per-author counts are small enough that this is acceptable for v1.
- **No project rename/duplicate UI** beyond what the existing identity/base-picker steps already provide.

---

## Testing strategy (env-independent)

Every test path below runs without live Postgres/Blob or a live GitHub token — the deploy-time env is never a build or test dependency.

**Client** (`packages/studio`, vitest + jsdom):
- `projectKey` derivation (identity-present, base-only, neither-present-fallback) as pure-function unit tests.
- Migration adoption: legacy-draft-present, legacy-draft-absent, legacy-draft-expired/malformed, already-migrated no-op — each asserting the resulting index + per-project record + (absence of the) legacy key.
- Project index CRUD (add/update/remove entry) as store-level unit tests, mirroring the existing `draftAutosave.test.ts` structure.
- Component tests for the "My keyboards" list screen: loading, empty, error, and populated (draft + submitted cards, correct actions per status) — following [ResumeDraftBanner.test.tsx](../../packages/studio/src/components/ResumeDraftBanner.test.tsx)'s existing pattern of asserting on `data-testid` hooks.
- Resume flow: active-project pointer set → `StudioShell` mount → correct project applied (integration test at the `StudioShell` level, mirroring `StudioShell.test.tsx`'s existing resume-banner coverage).

**Server** (`utilities/oauth-backend`, vitest):
- `MemoryDraftStore` extended for the `draftId` dimension: `listMeta` returns all of a user's rows; `getMeta`/`getDraft`/`putDraft`/`deleteDraft` are correctly scoped per `(userId, draftId)` and do not leak across projects.
- `draft-handlers.ts`: the new list op, `draftId`-scoped GET/PUT/DELETE, the back-compat default-slot path (`draftId` omitted), and the existing 401/503/413/502 status-code contract — all with a stub `verifyUser` (no live GitHub call).
- The standalone Fastify dev server wires the same handlers for local/integration use, so no Vercel-specific code needs its own separate test path beyond the thin `_store.ts` mapping, which stays untested against real Postgres/Blob (deploy-time only) but is kept small enough (per the existing `VercelDraftStore` file) that its correctness rests on the shared, fully-tested `draft-handlers.ts`.

**Not covered by this spec's test suite (deploy-time only)**: applying `schema.sql` against a real Postgres instance; `VercelDraftStore` against real Blob storage; the actual GitHub-App-mediated submission that produces a real `prUrl`.

---

## Future

- Server-side Google-identity linkage, once it exists, would let a Google-only author's drafts appear in the same list without requiring a GitHub connection.
- Cross-tab/cross-device merge instead of last-write-wins, if concurrent-editing reports become common.
- Reopening a submitted project as a new adapted draft (Track 2-style re-import from the merged PR) rather than pure read-only "View PR".
- Pagination / search once per-author project counts grow past what a flat list comfortably shows.
