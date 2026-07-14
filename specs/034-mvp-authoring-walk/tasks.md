---
description: "Task list for the MVP end-to-end authoring walk (034)"
---

# Tasks: MVP end-to-end authoring walk

**Input**: Design documents from `/specs/034-mvp-authoring-walk/`

**Prerequisites**: [plan.md](plan.md) (required), [spec.md](spec.md) (user stories), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: Test tasks ARE included. This feature is overwhelmingly a *verify-and-harden* effort over an already-built spine — its acceptance is defined by the per-story Independent Tests and the extended Playwright walk, so unit/integration/E2E tasks are first-class, not optional.

## Nature of this feature

Most stages are **BUILT and reused** (spec "Context" table). Work splits three ways:
- **US1** — verify + harden the built desktop walk against the **real engine** (Track 2 degrades silently under the mock today).
- **US2** — integration only: prove the spine reaches `touch` and that output exposes both publish paths honestly. Touch depth is owned by [035](../035-mobile-touch-derivation/spec.md); PR depth by [024](../024-option-a-github-app/spec.md).
- **US3** — the **one net-new build**: a durable localStorage draft that survives reload.

**Deferred, NOT in this task list** (recorded in [plan.md](plan.md) Complexity Tracking): FR-006 explicit desktop-lock affordance (UX decision open) and FR-013 Arabic/Hebrew/Devanagari acceptance (script-scope decision open). US3a (multi-project) is out of the build; the only US3a obligation here is honoring the FR-014 keyed-persistence seam inside US3.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on incomplete tasks)
- **[Story]**: US1 / US2 / US3 (Setup, Foundational, Polish carry no story label)
- Paths are repo-root-relative.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare the real-engine verification environment the whole walk is judged against.

- [x] T001 Confirm the studio dev + test stack runs against the **real** `@keyboard-studio/engine` (not the mock) for verification: build engine dist (`pnpm --filter @keyboard-studio/engine build`) and confirm the Playwright config in `packages/studio/playwright.config.ts` / `packages/studio/e2e/` launches the SPA with the real engine wired.
- [x] T002 [P] Enumerate the five proven alphabetic verification languages (Latin, Cyrillic, Greek, Georgian, Armenian) and their fixture bases from [docs/keyboard-index.md](../../docs/keyboard-index.md); record the chosen base id per script as a comment block at the top of `packages/studio/e2e/copy-edit.spec.ts` so the walk fixtures are explicit (FR-011, SC-004).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared assertions US1 and US2 both depend on — the authoritative spine shape — before per-story verification. Also the durable-draft module skeleton US3 builds on.

**⚠️ MUST complete before the user-story phases that depend on them.**

- [x] T003 Add/extend a unit test that `validateManifestShape()` and `advance()` produce the ordered spine `identity -> choose_base -> track -> [project_name if copy] -> characters -> carve -> mechanisms -> touch -> help -> done -> output` with no reorder of the physical->touch->docs tail, in `packages/studio/src/steps/advance.test.ts` (SR-1, SR-2, SR-5; blocks US1 + US2).
- [x] T004 [P] Create the durable-draft module skeleton `packages/studio/src/lib/draftPersistence.ts` with `DRAFT_KEY_PREFIX = "ks.draft."`, `DRAFT_VERSION = 1`, and `draftKey(projectKey)` returning the namespaced+versioned key per the [persistence contract](contracts/persistence.md) (blocks US3).

**Checkpoint**: Spine order is pinned by a regression test; the keyed draft-key scheme exists.

---

## Phase 3: User Story 1 — Author a desktop keyboard end-to-end and download it (Priority: P1) 🎯 MVP

**Goal**: An author goes identity → base → track → alphabet → carve → mechanisms → desktop lock → ZIP, producing a valid compilable keyboard, for a Latin and a non-Latin alphabetic language, against the real engine.

**Independent Test**: Run the walk for one Latin and one Cyrillic base; the downloaded ZIP contains `.kmn`/`.kvks`/`.kps` that passes Layer A/B and compiles via the kmcmplib oracle.

- [x] T005 [US1] Harden Track 2 so `instantiateFromExisting` produces a live working copy against the real engine and does **not** silently no-op; make the mock-only `console.warn "Track 2 skipped: no parsed IR"` path in `packages/studio/src/steps/reducer.ts` unreachable under the real engine (FR-004, TI-1, TI-2).
- [x] T006 [P] [US1] Add a unit/integration test that Track 1 `instantiateFromBase` and Track 2 `instantiateFromExisting` each yield a mutable working copy (non-null `ir`, correct `instantiationMode`) against the real engine, in `packages/studio/src/steps/reducer.test.ts` (TI-1, TI-2).
- [x] T006a [P] [US1] Add a test that identity resolution proposes a BCP47 (language + script) tag for confirmation — never a blank form — for a typed language name, in the identity/IdentityLite tests (FR-002, AS-1).
- [x] T006b [P] [US1] Add a test that the base step (`lib/suggestBase.ts`) returns a ranked list containing an exact-or-family (language+script) tier plus the US-QWERTY fallback for a proven-script language, in `packages/studio/src/lib/suggestBase.test.ts` (FR-003, AS-2).
- [x] T007 [P] [US1] Add/extend a test that carve removes base characters absent from the declared alphabet from the **desktop** layout and the OSK preview reflects removals, in `packages/studio/src/steps/` carve coverage (FR-005; AS-4).
- [x] T008 [P] [US1] Add/extend a test that the mechanism gallery assigns every declared alphabet character to at least one key/mechanism (S-01/02/03/08) and the desktop locks (`lockDesktop()`) on completion, in the mechanisms-step tests (FR-006 functional path; AS-5). *(Explicit-gate UX affordance is deferred — do NOT add a lock button here.)*
- [x] T009 [P] [US1] Add an engine-output assertion that the ZIP from `toZip` for a completed working copy contains `.kmn`/`.kvks`/`.kps` and passes Layer A/B validation + the kmcmplib compile oracle, in `packages/engine/src/output/` tests (PP-1, PP-4; AS-6, SC-001).
- [x] T010 [US1] Extend `packages/studio/e2e/copy-edit.spec.ts` with a **Cyrillic** end-to-end walk (identity → ZIP) alongside the existing Latin walk, asserting the downloaded ZIP compiles (SC-001, FR-011).
- [x] T011 [US1] Add a walk smoke assertion covering all five proven scripts (Latin, Cyrillic, Greek, Georgian, Armenian) reach a downloadable ZIP — parameterized over the T002 fixture list (FR-011, SC-004).

**Checkpoint**: The desktop-only walk is proven end-to-end against the real engine for the proven script set — the anchor MVP is independently shippable.

---

## Phase 4: User Story 2 — Reach a mobile layout and a PR publish path from the walk (Priority: P1)

**Goal**: The spine advances past desktop lock into `touch` (never skipped) and the output screen honestly exposes both ZIP and PR publish paths.

**Independent Test**: Complete US1, then confirm the flow enters the touch stage and the output screen presents a working ZIP download and a PR-submit affordance that degrades honestly when the OAuth backend is down.

- [x] T012 [US2] Add a unit test that `mechanisms` completion fires `lockDesktop()` and advances to `touch` (NOT past it) and that `touch` is never skipped, in `packages/studio/src/steps/advance.test.ts` (SR-3, FR-007).
- [x] T013 [P] [US2] Add a unit test that a gated script (Ethi/Hani/Hang) routes `identity -> unsupported` and renders the "not supported" stub rather than an empty gallery, in the identity/routing tests (SR-4, FR-012, SC-005).
- [x] T014 [P] [US2] Verify/harden `packages/studio/src/components/OutputScreen.tsx` exposes both a ZIP download and a "submit as PR" affordance, and that the PR affordance shows an honest "unavailable" state (never a fake success) when `VITE_OAUTH_BACKEND_URL` / the managed-PR proxy is unreachable, while ZIP stays fully functional (FR-008, PP-2, PP-3).
- [x] T015 [P] [US2] Add a test that the PR submission path serializes the **same** working copy the ZIP path serializes — one working copy, no second instantiation (PP-4, Article III).
- [x] T016 [US2] Extend `packages/studio/e2e/copy-edit.spec.ts` to advance past desktop lock into `touch` and assert the output screen presents both publish paths, with an OAuth-backend-down variant asserting honest degradation (AS-2, AS-3 of US2; SC-002).

**Checkpoint**: The walk reaches mobile and both publish paths are reachable and honest — depth of touch (035) and PR (024) remain owned by their specs.

---

## Phase 5: User Story 3 — Save progress and resume after a reload (Priority: P2)

**Goal**: The in-progress session (working copy + walk position) survives a hard reload and tab reopen, restored from a single per-project localStorage draft; "start over" clears it.

**Independent Test**: Advance several stages, hard-reload, and confirm the working copy (IR + inventory + assignments) and current step are restored, not reset to identity.

**Depends on**: T004 (draft-key scheme).

### Traversal serialization (surveySessionStore)

- [ ] T017 [US3] In `packages/studio/src/stores/surveySessionStore.ts`, remove the "No persistence" constraint for the draft path and expose a `TraversalSnapshot` serialize/restore of the non-action fields (`activeStepId`, `history`, `identityResult`, `identityPhaseResult`, `surveyContext`, `selectedTrack`, `scaffoldSpec`, `localBase`, `charactersSubStage`) per [data-model.md](data-model.md) TraversalSnapshot.

### Draft persistence core (draftPersistence.ts)

- [ ] T018 [US3] Implement `saveDraft(projectKey)` in `packages/studio/src/lib/draftPersistence.ts`: read both stores, guard no-op when `workingCopy.instantiationMode === null || ir === null` (VR-2), serialize the `DurableDraft` envelope `{ version, savedAt, projectKey, displayName, languageTag, workingCopy, traversal }` reusing `persistWorkingCopy.ts` serializers, and `setItem` in try/catch (VR-4). *(depends on T017)*
- [ ] T019 [US3] Implement `loadDraft(projectKey)` in `draftPersistence.ts`: parse in try/catch removing+returning false on failure (VR-3), discard on `version !== DRAFT_VERSION` (VR-1), return false on `instantiationMode === null` (VR-2), rehydrate `useWorkingCopyStore` (Base64→VFS, re-derive `removalCapabilities` from `baseIr`, re-derive `session` from `irAxes`+`phaseResults`) and `useSurveySessionStore` traversal, return true (G-1, G-5). *(depends on T017, T018)*
- [ ] T020 [P] [US3] Implement `clearDraft(projectKey)` (`removeItem`) and `resolveActiveProjectKey()` + the `ks.draft.active` active-project pointer in `draftPersistence.ts` (G-3; boot resolution without an index). *(depends on T004)*
- [ ] T021 [US3] Implement `installDraftAutosave(projectKey)` in `draftPersistence.ts`: subscribe to both stores, debounce ~500 ms, call `saveDraft`, return a teardown fn; the debounce timer MUST be independent of the 300 ms validate cycle (Article IV, G-2). *(depends on T018)*

### Boot + lifecycle wiring

- [ ] T022 [US3] In `packages/studio/src/components/StudioShell.tsx` (app boot, before route resolves), call `resolveActiveProjectKey()` then `loadDraft(key)` **before** the existing OAuth `rehydrateWorkingCopyFromSession()` so the durable draft is authoritative (research D4); resume at `traversal.activeStepId` or fresh-start at `identity`. *(depends on T019, T020)*
- [ ] T023 [US3] Call `installDraftAutosave(activeProjectKey)` after the first successful instantiation and tear it down on app unmount, in `StudioShell.tsx` (contract Integration points). *(depends on T021, T022)*
- [ ] T024 [US3] Wire "start over" (`surveySessionStore.reset()` / `WelcomeScreen` start-over) to call `clearDraft(activeProjectKey)` so reset does not immediately re-rehydrate (research D5, G-3, AS-3). *(depends on T020)*
- [ ] T025 [US3] Implement the VR-5 single-project guard: instantiating a new working copy while a draft under a different `projectKey` exists MUST replace-or-warn (never silently merge) — `clearDraft(prevKey)` after the replace/warn decision, in the instantiation path (`steps/reducer.ts` / `StudioShell`) (FR-009, US3 AS-4). *(depends on T020)*

### US3 tests

- [ ] T026 [P] [US3] Unit-test `draftPersistence.ts` VR-1..VR-5 and G-1..G-5: version-mismatch discard, no-instantiation ignore, malformed removal, quota-failure no-throw, single-project replace-or-warn, and round-trip restore patches the single store (never a second working copy) — in `packages/studio/src/lib/draftPersistence.test.ts`. *(depends on T018–T021)*
- [ ] T027 [P] [US3] Add a FR-014 forward-compat seam test asserting the save/load/clear API takes `projectKey` as a parameter and the record carries `projectKey`/`displayName`/`languageTag` identity fields, so a future draft index + server store are additive (data-model Relationships). *(depends on T018)*
- [ ] T028 [US3] Extend `packages/studio/e2e/copy-edit.spec.ts` with a reload-and-resume assertion: advance several stages, hard-reload, confirm the working copy and `activeStepId` are restored (not reset); then navigate **Back** one or more steps and confirm the persisted draft/history stay consistent (FR-010); then "start over" clears the draft (SC-003, AS-1..AS-3). *(depends on T022–T024)*

**Checkpoint**: A reloaded session resumes at the right step with the working copy intact; the persistence layer is keyed for the multi-project follow-on without a migration.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify constitution guards, confirm deferred items stayed deferred, and run the full gate.

- [ ] T029 [P] Confirm no **second** validation debounce timer was introduced — the autosave subscription is a separate lightweight timer, not a parallel validation path (Article IV, plan Constraints); assert by inspection + a test that authoring still runs exactly one 300 ms validate cycle.
- [ ] T030 [P] Confirm FR-006 (explicit desktop-lock affordance) and FR-013 (Arabic/Hebrew/Devanagari acceptance) remain **unimplemented and documented as deferred** — no lock button, no RTL/reorder acceptance target added (plan Complexity Tracking).
- [ ] T031 Run the full gate from repo root: `pnpm typecheck && pnpm test && pnpm lint`, and the studio Playwright walk (`cd packages/studio && npx playwright test copy-edit.spec.ts`); all green before closing the feature.

---

## Dependencies & Execution Order

- **Setup (T001–T002)** → **Foundational (T003–T004)** → user-story phases.
- **US1 (P1, T005–T011)** and **US2 (P1, T012–T016)** depend only on Foundational and are otherwise independent of each other — they can proceed in parallel once T003 lands.
- **US3 (P2, T017–T028)** depends on T004; internally: T017 → T018 → T019; T020 depends on T004; T021 depends on T018; boot/lifecycle (T022–T025) depend on the core; tests (T026–T028) depend on their targets.
- **Polish (T029–T031)** last.

**Story independence**: US1 is the anchor MVP and independently shippable. US2 is verification/integration over the same built spine. US3 is the sole net-new build and is off the critical authoring path.

## Parallel Opportunities

- Setup: T002 ∥ T001-tail.
- Foundational: T004 ∥ T003.
- US1: T006, T006a, T006b, T007, T008, T009 are all `[P]` (distinct files) once T005 lands.
- US2: T013, T014, T015 are `[P]`.
- US3: T020 ∥ core; tests T026, T027 `[P]`.
- Polish: T029 ∥ T030.

## Implementation Strategy

**MVP-first**: Deliver **US1** (Phase 3) as the anchor — it is almost entirely BUILT, so the work is hardening Track 2 on the real engine + the verification/E2E net. Then **US2** (reachability + honest publish paths, also mostly verification). Then **US3** (the real build — durable draft). FR-006/FR-013 stay deferred until their decisions resolve.

**Suggested MVP scope**: Phases 1–4 (Setup + Foundational + US1 + US2). US3 is a MUST per the spec but is the increment to land last within the window.
