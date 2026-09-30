# Spec 034 MVP authoring walk: as built

**Status:** Retired 2026-09-29. Shipped in PR #1113 (Phases 1-4, `35039fc`, 2026-07-14) and PR #1119 (Phase 5 durable draft + gate close, `44abc50`, 2026-07-14). Tasks: 33/33 complete.
**Full docs:** [specs/_archive/034-mvp-authoring-walk/](../_archive/034-mvp-authoring-walk/) (spec, plan, tasks, research, data-model, contracts, quickstart). Not read by default.
**Pinned here:** none

## What shipped
- A verified end-to-end desktop walk (`identity -> choose_base -> track -> [project_name] -> characters -> carve -> mechanisms -> touch -> help -> done -> output`) for the proven alphabetic scripts Latin, Cyrillic, Greek, Georgian, Armenian; Ethiopic/CJK/Hangul stay on the "not supported" terminal.
- Track 2 (adapt in place) hardened against the real engine; both ZIP download and GitHub PR paths reachable from output (PR degrades to an honest "unavailable" when the OAuth backend is down).
- Durable draft persistence (US3): localStorage save/resume across reload, explicit start-over, keyed per project.
- Playwright E2E proof lives in `packages/studio/e2e/` (`copy-edit.spec.ts`, `browser-back.spec.ts`, `mobile-walk.spec.ts`); the CI e2e lane is annotated as carrying it.

## Public contracts
All in [packages/studio/src/lib/draftPersistence.ts](../../packages/studio/src/lib/draftPersistence.ts), types in `lib/draftTypes.ts` (`DurableDraft`, `ProjectIndexEntry`, `DraftMeta`):
- `DRAFT_KEY_PREFIX = "ks.draft."`, `DRAFT_VERSION = 1`, `draftKey(projectKey)` -> `ks.draft.<projectKey>.v1`.
- `saveDraft(projectKey)` (no-op when no working copy), `loadDraft(projectKey): boolean` (parse failure or version mismatch removes the key and returns false), `clearDraft(projectKey)`, `installDraftAutosave(projectKey): () => void` (`AUTOSAVE_DEBOUNCE_MS = 500`, independent of the 300 ms validate cycle).
- `resolveActiveProjectKey()`, `setActiveProjectKey`, `clearActiveProjectKey`; boot calls `loadDraft` in `main.tsx` before the OAuth rehydrate.
- Restore patches the single working-copy store; it never builds a second working copy.
- localStorage failures never throw into the authoring flow.

## Key decisions
- Reuse the existing serializer and add a localStorage path (research D1); persist traversal state (`activeStepId`) too (D2).
- Debounced store subscription, not a second validation timer (D3; CLAUDE.md D3 scope note).
- Boot rehydrate subsumes the OAuth session snapshot (D4); start over clears the draft (D5).
- Persistence is keyed by `projectKey` from day one so multi-project and server-side storage were additive (FR-014).
- Discard-on-mismatch for `DRAFT_VERSION` bumps; no migration.

## Gotchas and limits
- Untouched deferrals: FR-006 explicit desktop-lock affordance (lock fires automatically via reducer on `mechanisms` completion, with a post-lock banner and "Unlock to edit") and FR-013 Arabic/Hebrew/Devanagari acceptance (no RTL/reorder target).
- Arabic/Hebrew/Devanagari are selectable but are not an acceptance target.
- Carve propagation to touch belongs to spec 035, not here.

## Divergences from the spec
- The spec/contract treat multi-project as out of scope (US3a "not built"). The code has since grown it: `DRAFT_INDEX_KEY = "ks.draftIndex.v1"`, `listDrafts()`, `resumeProject`, `deleteProject`, `reconcileProjectIndex`, "My keyboards" UI (`components/MyKeyboardsList.tsx`) and cloud sync (`CLOUD_SYNC_DEBOUNCE_MS = 20_000`, [draftPersistence.ts:1731](../../packages/studio/src/lib/draftPersistence.ts)). The `contracts/persistence.md` "MVP single-project facade" description understates the current surface.
- `installDraftAutosave` now migrates its key on rename (`migrateProjectKeyIfChanged`), which the contract did not describe.

## Follow-ups and open issues
- Header comment at [draftPersistence.ts:13-14](../../packages/studio/src/lib/draftPersistence.ts) cites `specs/034-mvp-authoring-walk/contracts/persistence.md` and `data-model.md`; these move to the archive (path citations for km-programmer).
- Open decisions: FR-006 lock affordance UX and FR-013 script scope remain open.
- [docs/mvp-convergence-plan.md](../../docs/mvp-convergence-plan.md) cites spec 034 FR-006/FR-013 by number only; no link breaks.
