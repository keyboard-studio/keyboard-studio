---

description: "Task list for My Keyboards — per-user multi-project draft + submission list (retroactive verification)"
---

# Tasks: My Keyboards — per-user multi-project draft + submission list

**Input**: Design documents from `specs/072-my-keyboards/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/drafts-api.md](contracts/drafts-api.md)

**Retroactive verification.** Every task below documents work already implemented and shipped on `main` (originally `specs/037-my-keyboards`, PR #1139, ported via #1334, refined by #1556/#1603). No task requires new code — each is checked off against the live tree, with the evidence cited inline. The one genuine finding (a doc-only debounce-value correction) is applied for real in Phase 7.

**Tests**: All test coverage described here is pre-existing (`draftPersistence.test.ts` + 4 companion test files, `MyKeyboardsList.test.tsx`, `draft-handlers.test.ts`, `serverDraftStore.test.ts`) — verified present and passing, not authored in this pass.

**Organization**: Tasks are grouped by user story, matching spec.md's five stories.

## Format: `[ID] [Story] Description`

---

## Phase 1: Setup

- [x] T001 Confirm the feature's true history: originally `specs/037-my-keyboards/spec.md` (PR #1139, merged 2026-07-15), renumbered to `072-my-keyboards` after `037` was reused by an unrelated spec (`037-facet-classifiers`) during a collision cleanup. `git log --oneline --all --grep "my keyboards" -i` confirms the lineage: `7cb4a119` (original) → `f98affb3` (merge) → `b6942d06` (#1334 port to main) → `2f1da475` (#1556 fix) → `35a86df0` (#1603 fix).

---

## Phase 2: Foundational — server `draftId` model + client index

**Purpose**: The multi-project storage substrate every user story depends on.

- [x] T002 [P] Verify `utilities/oauth-backend/src/draft-schemas.ts`'s `DraftMetaSchema` carries `draftId` (with `DEFAULT_DRAFT_ID = "default"` back-compat), `status: "draft"|"submitted"`, and `prUrl` — confirmed present, matching [data-model.md](data-model.md).
- [x] T003 [P] Verify `utilities/oauth-backend/src/draft-store.ts`'s `DraftStore` interface + `MemoryDraftStore` are `draftId`-scoped (`Map<number, Map<string, StoredDraft>>`) with a `listMeta(userId)` method — confirmed present.
- [x] T004 Verify `api/drafts/schema.sql` declares composite `PRIMARY KEY (github_user_id, draft_id)` from `CREATE TABLE IF NOT EXISTS`, plus an idempotent migration block for pre-existing single-key deployments — confirmed present, safe to re-run.
- [x] T005 Verify `api/drafts/_store.ts`'s `VercelDraftStore.blobPathname` is `drafts/${userId}/${draftId}.json` and its upsert conflict target is `(github_user_id, draft_id)` — confirmed present.
- [x] T006 [P] Verify the client index (`ks.draftIndex.v1` / `ProjectIndexEntry` in `packages/studio/src/lib/draftTypes.ts` + `draftPersistence.ts`) matches [data-model.md](data-model.md)'s shape (`projectKey, savedAt, activeStepId, label, langTag, status, prUrl`) — confirmed present.

**Checkpoint**: storage substrate for multi-project drafts confirmed shipped both client and server side.

---

## Phase 3: User Story 1 — Author sees all their keyboards on one screen (Priority: P1)

- [x] T007 [US1] Verify `packages/studio/src/components/ProfileScreen.tsx` renders `<MyKeyboardsList />` (line ~300) in place of the old disabled "My keyboards — Coming soon" placeholder — confirmed; placeholder is gone.
- [x] T008 [US1] Verify `packages/studio/src/components/MyKeyboardsList.tsx` implements loading/empty/error states plus Draft/Submitted badges per card, reusing `ResumeDraftBanner.tsx`'s style tokens (`BG_CARD, BORDER, TEXT_MAIN, TEXT_DIM, BLUE_ACTION, FONT`) and the shared `relativeTime.ts` helper — confirmed present in full, with `MyKeyboardsList.test.tsx` (401 lines) covering all four states.
- [x] T009 [US1] Verify `GET /drafts` (no `draftId`) returns `{ drafts: DraftMeta[] }` and is what the list screen calls — confirmed in `api/drafts/index.ts`'s branch on `?draftId` presence.

**Checkpoint**: US1 fully shipped — visibility acceptance scenarios 1–3 all satisfied by the live component.

---

## Phase 4: User Story 2 — Resume a specific in-progress project (Priority: P1)

- [x] T010 [US2] Verify `resumeProject()` in `draftPersistence.ts` sets `ks.draft.active` to the clicked card's `projectKey` and that `StudioShell` mount hydrates from that project's record specifically (not "most recently edited") — confirmed present.
- [x] T011 [US2] Verify a corrupt/partial working-copy snapshot surfaces a failure on Resume rather than silently landing on an empty survey — confirmed: PR #1603 ("My Keyboards card name activates Resume; surface a failed resume") shipped exactly this hardening.

**Checkpoint**: US2 fully shipped, including the failed-resume edge case the spec's acceptance scenario 2 calls for.

---

## Phase 5: User Story 3 — Pre-index drafts are adopted without loss (Priority: P1)

- [x] T012 [US3] Verify `reconcileProjectIndex()` exists in `draftPersistence.ts`, is called from `listDrafts()` (the read path, per the spec's ordering requirement), and adopts unindexed `ks.draft.<projectKey>.v1` records as `status: "draft"`, `prUrl: null` — confirmed present.
- [x] T013 [US3] Verify malformed/version-mismatched/never-instantiated records (VR-1/VR-2/VR-3) are skipped and left in place, never deleted, during reconciliation — confirmed present.
- [x] T014 [US3] Verify reconciliation is idempotent (adopts nothing on a second pass) and never reverts an already-`"submitted"` row back to `"draft"` — confirmed present, covered by `reconcileStatusPreservation` test file.
- [x] T015 [US3] Note a mechanism beyond the spec's text: `reconcileRenamedProjectRows()` / `runBootRenameReconciliation()`, a destructive de-dupe for rows created by a mid-session `identity.keyboardId` rename, run once at boot (moved there from the render-time path by PR #1556 after a bug). Documented in [research.md](research.md) R2 as a display-layer cleanup, not a re-key — does not conflict with the spec's re-keying non-goal.

**Checkpoint**: US3 fully shipped — zero-data-loss reconciliation confirmed, including the correctness gate scenarios (idempotent, non-destructive, submitted-row-preserving).

---

## Phase 6: User Story 4 — Author checks a submitted keyboard's PR (Priority: P2)

- [x] T016 [US4] Verify `ManagedPRSubmitPanel.tsx` no longer calls `clearDraft()` on a successful submission; it calls `recordProjectSubmission(result.prUrl, accessToken)` instead, with a comment citing this spec (`specs/072-my-keyboards`, US3a/FR-014) directly — confirmed present.
- [x] T017 [US4] Verify `recordProjectSubmission()` updates the local `ProjectIndexEntry` (`status: "submitted"`, `prUrl`) and issues `PUT /drafts?draftId=<projectKey>` with the same status transition server-side — confirmed present.
- [x] T018 [US4] Verify `api/submit/managed-pr.ts` / `github-pipeline.ts`'s success response is `{ ok: true, data: { prUrl, commitSha } }`, matching the spec's data-model claim exactly — confirmed (`github-pipeline.ts` line ~302).
- [x] T019 [US4] Verify a submitted card in `MyKeyboardsList.tsx` renders "View PR" (linking to `prUrl`) and never offers "Resume" — confirmed present.

**Checkpoint**: US4 fully shipped — the submission-to-record loop the spec's motivation section calls out as missing is closed.

---

## Phase 7: User Story 5 — Author deletes an abandoned draft (Priority: P2)

- [x] T020 [US5] Verify `deleteProject(projectKey, token)` in `draftPersistence.ts` removes the client index entry, the per-project localStorage record, and issues `DELETE /drafts?draftId=<projectKey>` — confirmed present.
- [x] T021 [US5] Verify deleting a submitted card's studio-side record never touches the already-open/merged PR on GitHub — confirmed: the delete path only calls the studio's own `/drafts` DELETE, no GitHub API call.

**Checkpoint**: US5 fully shipped.

---

## Phase 8: Superseded-rule verification (spec 034 VR-5)

- [x] T022 Verify `replaceActiveDraftIfDifferentProject()` does not exist as a callable function anywhere in the tree, and that its former call site in `StudioShell.tsx`'s `onInstantiate` is replaced by an explanatory comment rather than left as dead code — confirmed present (`// REMOVED (spec 072 US3a supersedes spec 034 VR-5): ...` in both `draftPersistence.ts` and `StudioShell.tsx`).
- [x] T023 Verify two drafts survive a project switch (the inverse of the old VR-5 behavior) and that only `discardActiveDraft()` removes one — confirmed via `draftPersistence.test.ts`'s SC-001 block.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [x] T024 [P] Correct the spec's local-autosave-debounce claim: [spec.md](spec.md)'s "Storage keys" section said "1 s local, 20 s cloud" — the shipped value is `AUTOSAVE_DEBOUNCE_MS = 500` (500ms), not 1000ms (the cloud figure, `CLOUD_SYNC_DEBOUNCE_MS = 20_000`, is correct). This is a documentation-only correction (see [research.md](research.md) R5) — no behavior change. Applied directly to spec.md in this pass.
- [x] T025 [P] Confirm `pnpm typecheck`, `pnpm --filter @keyboard-studio/oauth-backend test`, and `pnpm --filter @keyboard-studio/studio test` are green with `POSTGRES_URL`/`DATABASE_URL`/`BLOB_READ_WRITE_TOKEN` unset (SC-005) — `MemoryDraftStore` + the standalone Fastify dev server are confirmed the test-time backing store; live verification run in this pass (see `.spec-context.json` verified[] entries).
- [x] T026 Confirm back-compat: a client that omits `draftId` continues to function against the upgraded backend via `DEFAULT_DRAFT_ID = "default"` (SC-006) — confirmed present in `draft-schemas.ts` / `draft-handlers.ts`.
- [x] T027 Reconcile this spec's Success Criteria (SC-001..SC-006) against the verified evidence above — all six satisfied; see the final validation summary recorded in `.spec-context.json`.

---

## Dependencies & Execution Order

All phases here are **verification-only** and have no build-order dependency on each other — each phase independently confirms a slice of already-shipped code. Phase 1 (history) and Phase 2 (foundational storage model) were verified first since every user story's evidence cites them.

## Notes

- No task in this file produced new code. Where a genuine drift was found (T024), it was corrected in spec.md's prose, not in the shipped implementation.
- This tasks.md exists so the Companion pipeline has a real, checkable artifact recording what was verified — mirroring the retroactive-verify pattern already used for specs 058, 067, and 068.
