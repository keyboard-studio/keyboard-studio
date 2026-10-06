# Spec 072 My Keyboards: as built

**Status:** Retired 2026-09-29. Shipped in PR #1139 (squash `f98affb3`, 2026-07-15); a retroactive verify-and-complete pass landed as #1657 (squash `3df87391`, 2026-08-24). Tasks: 27/27 complete.
**Full docs:** [specs/_archive/072-my-keyboards/](../_archive/072-my-keyboards/) (spec, plan, tasks, research, data-model, contracts/drafts-api.md). Not read by default.
**Pinned here:** none (no living non-spec doc links a file in this folder as a format reference; source comments cite `specs/072-my-keyboards` generally).

## What shipped
- A "My keyboards" list on the profile screen: one card per project (name, language tag, last-edited time, Draft or Submitted badge) with Resume, Delete, and View PR actions.
- Per-project drafts: many drafts per user, keyed by `projectKey`, client-side and server-side, with backward compatibility for the old single-draft slot.
- Adoption of pre-index drafts without loss (`reconcileProjectIndex`).
- A submitted project is kept and marked `submitted` with its `prUrl`, not deleted; a submitted card never offers Resume.
- Retirement of spec 034 VR-5 (auto-replace of the active draft when a different project is instantiated).

## Public contracts
- Client keys (`packages/studio/src/lib/draftPersistence.ts`): `ks.draftIndex.v1` (`DRAFT_INDEX_KEY`, array of `ProjectIndexEntry`), `ks.draft.<projectKey>.v1` (`draftKey()`, a `DurableDraft`), `ks.draft.active` (active project pointer). Types in `draftTypes.ts`: `ProjectIndexEntry { projectKey, savedAt, activeStepId, label, langTag, status: "draft"|"submitted", prUrl }`, `DurableDraft`, `DraftMeta`.
- `projectKey = identity.keyboardId ?? baseKeyboard.id`; before any working copy exists the reserved `PENDING_PROJECT_KEY = "__pending__"` slot is used (`deriveProjectKeyFromWorkingCopy`).
- Client API: `listDrafts`, `saveDraft`, `loadDraft`, `clearDraft`, `resumeProject`, `deleteProject(projectKey, token)`, `recordProjectSubmission(prUrl, token)`, `reconcileProjectIndex`, `installDraftAutosave`, `startCloudSync`.
- Server (`api/drafts/index.ts`, `api/drafts/content.ts`, logic in `utilities/oauth-backend/src/draft-handlers.ts`): `GET /drafts` (list metadata), `GET /drafts?draftId=X`, `GET /drafts/content?draftId=X`, `PUT /drafts?draftId=X` (upsert `{meta, draft}`), `DELETE /drafts?draftId=X`. Omitted `draftId` means `DEFAULT_DRAFT_ID = "default"`. Statuses: 401 unauthorized, 400 invalid_request, 413 draft_too_large (`MAX_DRAFT_BYTES`, checked before parse), 503 draft_not_configured, 502 draft_unavailable. Schema in `api/drafts/schema.sql`, transport in `packages/studio/src/lib/serverDraftStore.ts`.
- UI: `packages/studio/src/components/MyKeyboardsList.tsx`; submit recording in `ManagedPRSubmitPanel.tsx`.

## Key decisions
- Client index is a lightweight mirror of the server `DraftMeta`, so the list never loads working-copy payloads (spec data model).
- Delete removes only the studio-side record; the submitted GitHub PR is untouched.
- Guests see a local-only list; no server call without a bearer token.
- Submission is a status transition on the same row, not a delete-and-recreate.
- `reconcileRenamedProjectRows` (boot-time, from `main.tsx`) merges duplicate index rows caused by a mid-session keyboardId rename; it is display-layer cleanup, not a re-key.

## Gotchas and limits
- `/api` functions must stay bundle-safe: no value imports of `@keyboard-studio/*` in modules under `utilities/oauth-backend/src` (CLAUDE.md invariant; enforced by `api/bundle-safety.test.ts`).
- Debounces: `AUTOSAVE_DEBOUNCE_MS = 500` (local), `CLOUD_SYNC_DEBOUNCE_MS = 20_000`, `MAX_CLOUD_DRAFT_BYTES = 4 MiB`. These persistence timers are outside the D3 validation-debounce rule.
- No pagination on the list; content GET has no list mode.

## Divergences from the spec
- spec.md's body and some text still name `ks.studio.project.<key>`, `ks.studio.projects.index` and `ks.studio.activeProject` (the pre-consolidation `dev` scheme). The code uses `ks.draft.*` and `ks.draftIndex.v1`.
- `draftAutosave.ts` no longer exists; `startDraftAutosave` was renamed `installDraftAutosave` and lives in `draftPersistence.ts` (commit `215ede33`).
- `replaceActiveDraftIfDifferentProject()` is gone; only explanatory comments remain (`StudioShell.tsx:944`, `draftPersistence.ts:1270`).

## Follow-ups and open issues
- Possible stale citations for km-doc: source comments that point at `specs/072-my-keyboards/spec.md` for the key scheme (`draftPersistence.ts:359`, `StudioShell.tsx:958`) now land on the archive stub; the pointer text should reference this file.
- Namespaced or non-`release/` project ids and re-keying on rename are out of scope.
