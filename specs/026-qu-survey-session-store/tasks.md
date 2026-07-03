# Tasks: surveySessionStore — wizard-traversal state migration

**Feature**: `specs/026-qu-survey-session-store` | **Branch**: `km/qu-026-survey-session-store`
**Stage**: 3 of the Unified Survey Architecture refactor (master plan D4/D5).
**Owner**: `km-frontend` (all files under `packages/studio/src`).

Two user stories map to the spec:
- **US1** — a single source of truth for wizard traversal (the store) with walked-history
  back semantics (spec FR-001, FR-002; SC-001).
- **US2** — the survey component reads the store with zero render change (spec FR-003…FR-008;
  SC-002, SC-003). US2 depends on US1.

**HARD ACCEPTANCE GATE (applies to the whole feature):** the three traversal oracle tests
must pass **UNMODIFIED** — `packages/studio/src/StudioShell.test.tsx`,
`packages/studio/src/dashboard/trackRouting.test.ts`,
`packages/studio/src/dashboard/prefillRouting.test.ts`. Any edit to those test sources to
make them pass = stage failure.

---

## Phase 1: Setup

- [ ] T001 Confirm working tree is on branch `km/qu-026-survey-session-store` and clean of
  unrelated changes; confirm `zustand@^5` is present in `packages/studio/package.json`.
- [ ] T002 Record the pre-change baseline: run `pnpm --filter @keyboard-studio/studio test`
  and confirm exactly the 4 known-baseline failures (3× `src/lib/projectWorkingCopyVfs.flagParity.test.ts`,
  1× `tests/dashboard/articleIVProbe.test.ts`) — everything else green. This baseline is the
  before-image for the parity claim.

## Phase 2: Foundational

- [ ] T003 Re-verify the exact `ActiveStepId` union members at
  `packages/studio/src/StudioShell.tsx:237` and the current locations of the types the store
  will import: `Track` (`survey/PhaseTrack.tsx`), `ScaffoldSpec` (`hooks/useKeyboardArtifact.ts`),
  `IdentityLiteResult` (`survey/index.ts`), `SurveyContext` (`survey/types.ts`), `BaseKeyboard`
  (`@keyboard-studio/contracts`). Note the exact import paths — they feed T004.

---

## Phase 3: US1 — the store (source of truth) 🎯 MVP

**Goal**: `surveySessionStore` fully implements the D4 shape + D5 walked-history back,
independently unit-tested, before any component wiring.
**Independent test**: `surveySessionStore.test.ts` passes in isolation (no component needed).

- [ ] T004 [US1] Create `packages/studio/src/stores/surveySessionStore.ts` mirroring the
  `workingCopyStore.ts` idiom (`create<SurveySessionState>((set, get) => ({...}))`). Export
  the `ActiveStepId` type from this module (copied verbatim from `StudioShell.tsx:237`, incl.
  terminals `"done"`/`"unsupported"`). State slots: `activeStepId` (init `"identity"`),
  `history: readonly string[]` (init `[]`), `identityResult` (null), `surveyContext` (`{}`),
  `selectedTrack` (null), `scaffoldSpec` (null), `localBase` (null). Actions: `advance`
  (push current `activeStepId` onto `history`, then set new), `popHistory` (pop last→active,
  no-op on empty), `reset` (all slots to initial), and plain setters
  `setIdentityResult`/`setSurveyContext`/`setSelectedTrack`/`setScaffoldSpec`/`setLocalBase`.
  Keep survey/hooks type imports `import type` only (depcruise / bundle hygiene, research D-R2).
  See [contracts/surveySessionStore.api.md](./contracts/surveySessionStore.api.md) and
  [data-model.md](./data-model.md).
- [ ] T005 [US1] Create `packages/studio/src/stores/surveySessionStore.test.ts` covering
  spec SC-001: (a) copy-track back-walk `identity→choose_base→track→project_name→characters`
  then `popHistory()` → `project_name`; (b) adapt-track back-walk
  `identity→choose_base→track→characters` then `popHistory()` → `track`; (c) `reset()` clears
  every slot to initial (incl. empty `history`); (d) double-advance idempotence — `advance(x)`
  twice does not corrupt the stack, later `popHistory` still returns to the prior distinct
  step (research D-R4); (e) empty-history `popHistory()` is a no-op (`activeStepId` stays
  `"identity"`). Use `useSurveySessionStore.getState()` + `.setState`/action calls; reset the
  store between cases.
- [ ] T006 [US1] Run `pnpm --filter @keyboard-studio/studio test src/stores/surveySessionStore.test.ts`
  — green. This is the US1 checkpoint (store is correct before touching the component).

---

## Phase 4: US2 — component migration (parity) 🎯

**Goal**: `StudioShell.tsx` sources the seven traversal slots from the store with zero render
change; the `selectedTrackRef` dance is gone; back uses `popHistory`.
**Independent test**: the three parity oracles pass UNMODIFIED (the hard gate).
**Depends on**: US1 (T004–T006).

- [ ] T007 [US2] In `packages/studio/src/StudioShell.tsx`: delete the local `useState` for
  `activeStepId`, `identityResult`, `surveyContext`, `selectedTrack`, `scaffoldSpec`,
  `localBase`; replace each with a `useSurveySessionStore` selector (one per slot, matching
  the existing `useWorkingCopyStore` call style). Delete the local `ActiveStepId` type decl
  at ~line 237 and import it from `./stores/surveySessionStore.ts`. Keep `charactersSub`,
  `oskMode`, and `instantiatedRef` as local `useState`/`useRef` (unchanged this stage).
- [ ] T008 [US2] Delete `selectedTrackRef` and its sync effect; change the memoised
  `onInstantiate` to read `useSurveySessionStore.getState().selectedTrack` (research D-R3/D-R5).
- [ ] T009 [US2] Route every forward transition through `advance(nextId)` (was
  `setActiveStepId(nextId)`), so `history` records the walked path. Route back handlers through
  `popHistory()` where it reproduces today's destination exactly: `handlePrefillBack`
  (copy→project_name / adapt→track), `handleProjectNameBack` (→track), `handleBaseBack`
  (→identity). Preserve intra-step `charactersSub` pairing: `handleCarveBack` = pop to
  `characters` **and** `setCharactersSub("B")`; `handlePhaseBBack` stays a pure
  `setCharactersSub("prefill")` (no pop). Setters for the migrated value slots now call the
  store actions.
- [ ] T010 [US2] Rewire `handleStartOver` to call `session.reset()` first, then
  `instantiatedRef.current = false` (ordering per research D-R5). Confirm `localBase`'s
  compile-pipeline effect still fires on base selection (only storage location changed).

---

## Phase 5: Verification & Polish (hard gates)

- [ ] T011 Run the three parity oracles and confirm they pass **without any source edit**:
  `src/StudioShell.test.tsx`, `src/dashboard/trackRouting.test.ts`,
  `src/dashboard/prefillRouting.test.ts`. If any required a test edit → revert and fix the
  refactor instead (hard gate).
- [ ] T012 Run the full gate set: `pnpm --filter @keyboard-studio/studio typecheck`,
  `pnpm --filter @keyboard-studio/studio test` (only the 4 baseline failures allowed),
  `pnpm depcruise` — all green. Confirm no new depcruise violation from the store's imports.
- [ ] T013 Final scan of the diff: no leftover `setActiveStepId`/`selectedTrackRef` references;
  no component-tree or per-step-prop change; commit-title style `refactor(studio): …`; no
  emoji; no GitHub issue numbers in code (Constitution VIII).

---

## Dependencies

- Phase 1 → Phase 2 → US1 (Phase 3) → US2 (Phase 4) → Verification (Phase 5).
- US2 cannot start until US1's store test (T006) is green.
- T011/T012 are the release gates; T013 is the cleanliness gate.

## Parallel opportunities

Limited by design (single file `StudioShell.tsx` dominates US2). T004 and T005 can be drafted
together but T006 needs both. Within US2, T007–T010 all touch `StudioShell.tsx` and must be
**sequential** (same file). Keep them in one focused edit pass.

## MVP scope

US1 (the store, T004–T006) is the standalone MVP: a correct, tested traversal store. US2 is
the parity-preserving integration that makes it live. Ship both together (the stage is only
"done" when the parity oracles pass).

## Task count

13 tasks — Setup 2, Foundational 1, US1 3, US2 4, Verification/Polish 3.
