# Tasks: CharactersStep — self-contained characters step; `charactersSub` dies

**Feature**: `specs/027-qu-characters-step` | **Branch**: `km/qu-027-characters-step` (stacked on `km/qu-026-survey-session-store`)
**Stage**: 4 of the Unified Survey Architecture refactor (master plan D3).
**Owner**: `km-frontend` (all files under `packages/studio/src`).

Two user stories map to the spec:
- **US1** — a self-contained `CharactersStep` component owning the `prefill → PhaseB`
  substage, backed by a persisted store slot so carve-back re-enters at PhaseB (spec FR-001…
  FR-004, FR-007, FR-008; SC-001).
- **US2** — the manifest drives the characters step through its `component`, and the survey
  component deletes its `charactersSub` state + five handlers with zero user-visible change
  (spec FR-005, FR-006, FR-009, FR-010; SC-002, SC-003, SC-005). US2 depends on US1.

**HARD ACCEPTANCE GATES (whole feature):**
1. Zero user-visible screen change — the copy/adapt RTL walk (SC-002) renders identical
   sequences to `main`, incl. back-from-carve landing on PhaseB.
2. `dashboard/driftGuardrail.test.ts` passes **UNMODIFIED** (the Flow Map bijection node set
   is unchanged; SC-005).
3. The `pb_*` mirrored per-question tests and the spec-026 traversal oracles
   (`trackRouting`, `prefillRouting`) pass; `StudioShell.test.tsx` is edited **only** where it
   asserted `charactersSub` internals (now a store slot).

---

## Phase 1: Setup

- [x] T001 Confirm the working tree is on `km/qu-027-characters-step` (stacked on
  `km/qu-026-survey-session-store`, which supplies `surveySessionStore`) and clean of
  unrelated changes.
- [x] T002 Record the pre-change baseline: run `pnpm --filter @keyboard-studio/studio test`
  and confirm exactly the 4 known-baseline failures (3× `src/lib/projectWorkingCopyVfs.flagParity.test.ts`,
  1× `tests/dashboard/articleIVProbe.test.ts`) — everything else green. This is the
  before-image for the parity claim.

## Phase 2: Foundational

- [x] T003 Re-verify the current shapes the work depends on and record exact paths/props for
  the implementers: `EditorStepProps` (`steps/types.ts:105`), the `CharactersSubStage` type +
  `charactersSub` `useState` (`StudioShell.tsx:237`, `:421`), the inline characters branch
  (`StudioShell.tsx` ~`:957`), the five handlers (`handlePrefillConfirm` `:653`,
  `handlePhaseBComplete` `:661`, `handlePrefillBack` `:744`, `handlePhaseBBack` `:751`,
  `handleCarveBack` `:757`), the `Prefill`/`PhaseB` prop shapes as mounted today
  (`:959`–`:979`), `findingsByQuestionId = buildFindingsByQuestionId(findings)` (`:582`,
  helper in `lint/lintToQuestion.ts:31`), the `validatorFindings` store slot
  (`workingCopyStore.ts:246/876`), and the completion body (`recordPhase` →
  `routeAnswersThroughMutate` → `applyStepCompletion("characters", …)` → `advance`).

---

## Phase 3: US1 — self-contained CharactersStep + persisted substage 🎯 MVP

**Goal**: `CharactersStep` fully hosts the `prefill → PhaseB` substage, reading identity/
base/context/substage from the store and deriving findings internally; the substage survives
remounts. Unit-tested in isolation before any host wiring.
**Independent test**: `survey/CharactersStep.test.tsx` passes standalone (mount the component,
drive the substage, assert `onComplete`/`onBack`; pre-set the store slot to `"B"` and assert
it mounts at PhaseB).

- [x] T004 [US1] Add the persisted substage slot to
  `packages/studio/src/stores/surveySessionStore.ts` (additive to spec 026): export
  `type CharactersSubStage = "prefill" | "B"`; add state `charactersSubStage` (init
  `"prefill"`) and action `setCharactersSubStage`; extend `reset()` to set it back to
  `"prefill"`. Do **not** touch any other spec-026 slot/action. See
  [contracts/CharactersStep.contract.md](./contracts/CharactersStep.contract.md).
- [x] T005 [US1] Create `packages/studio/src/survey/CharactersStep.tsx` — a
  `React.ComponentType<EditorStepProps>` that: reads `identityResult`, `localBase`,
  `surveyContext`, `charactersSubStage` from `surveySessionStore` (selectors) and
  `validatorFindings` from `workingCopyStore`, memoising
  `buildFindingsByQuestionId(validatorFindings)`; renders `Prefill` when
  `charactersSubStage === "prefill"` (guard: `identityResult`/`localBase` non-null, else
  `null`) with `onConfirm → setCharactersSubStage("B")` and `onBack → props.onBack?.()`;
  renders `PhaseB` when `"B"` with `context={surveyContext}`, `findingsByQuestionId`,
  `onComplete → props.onComplete(result)`, `onBack → setCharactersSubStage("prefill")`.
  **No** survey-level side effects (no `applyStepCompletion`/`recordPhase`/`advance`/
  `popHistory`); `placementMap` intentionally omitted (D-INT-2). Same `Prefill`/`PhaseB`
  props as `StudioShell.tsx:959`–`:979`. See [data-model.md](./data-model.md) §2 and the
  contract.
- [x] T006 [US1] Create `packages/studio/src/survey/CharactersStep.test.tsx` (RTL) covering
  SC-001: (a) prefill → confirm → PhaseB → complete emits the Phase B `SurveyPhaseResult` via
  `onComplete`; (b) PhaseB → back returns to prefill and does **not** fire `props.onBack`;
  (c) prefill → back calls `props.onBack`; (d) with the store slot pre-set to `"B"`, the
  component mounts **directly at PhaseB** (carve-back re-entry proof); (e) findings derived
  from a seeded `validatorFindings` equal `buildFindingsByQuestionId` of the same input. Seed
  the stores via `getState()`/`setState`; reset both stores between cases.
- [x] T007 [US1] Run `pnpm --filter @keyboard-studio/studio test src/survey/CharactersStep.test.tsx`
  — green. US1 checkpoint (the component is correct before touching the host).

---

## Phase 4: US2 — manifest-driven mount + host deletions (parity) 🎯

**Goal**: the manifest `charactersStep.component` is `CharactersStep` (first runtime use of
`step.component`); the survey component deletes `charactersSub` + the five substage handlers
and mounts the step via its manifest component, with zero render change.
**Independent test**: the copy/adapt RTL walk + the unmodified drift guardrail + the
`pb_*`/traversal oracles all pass.
**Depends on**: US1 (T004–T007).

- [x] T008 [US2] In `packages/studio/src/steps/manifest.ts`: swap
  `charactersStep.component: () => null` for the imported `CharactersStep`
  (`survey/CharactersStep`). Leave `writes`, the DEC-D1 comment, `spine`, `flowRefs`,
  `layout`, and manifest position unchanged. Update the stale "wired in T028" comment.
- [x] T009 [US2] In `packages/studio/src/StudioShell.tsx`: delete the `charactersSub`
  `useState` (`:421`) and relocate/remove the local `CharactersSubStage` type (`:237` — now
  exported from the store); delete `handlePrefillConfirm`, `handlePrefillBack`,
  `handlePhaseBComplete`, `handlePhaseBBack`, and the `setCharactersSub(...)` lines in
  `handleTrackSelected`, `handleProjectNameNext`, `handleStartOver`. Replace the
  `stepId === "characters"` inline `Prefill`/`PhaseB` branch with `<CharactersStep
  onComplete={…} onBack={() => sessionPopHistory()} />`, where `onComplete` runs the
  unchanged completion body (cast to `SurveyPhaseResult`; `recordPhase` →
  `routeAnswersThroughMutate` → `applyStepCompletion("characters", r, reducerDeps)` →
  `sessionAdvance(nextSpineStepAfter("characters"))`). Stop threading `findingsByQuestionId`
  into the characters branch (component derives it); leave the `PhaseF`/help thread untouched.
- [x] T010 [US2] Fix the substage-lifecycle sites in `StudioShell.tsx`: advance-to-characters
  paths (adapt branch of `handleTrackSelected`, `handleProjectNameNext`) call
  `setCharactersSubStage("prefill")` (fresh entry starts at prefill); `handleCarveBack` keeps
  `sessionPopHistory()` **only** (drop its `setCharactersSub("B")` line — the slot already
  holds `"B"`). Verify against the §4 re-entry table.

---

## Phase 5: Verification & Polish (hard gates)

- [x] T011 [US2] Add the RTL parity walk (SC-002): copy-track (track → project_name →
  prefill → PhaseB → carve) and adapt-track (track → prefill → PhaseB → carve) render
  identical screen sequences to `main`, and Back-from-carve lands on PhaseB. Place beside the
  existing survey RTL tests.
- [x] T012 Update `src/StudioShell.test.tsx` **only** where it asserted `charactersSub`
  internals (the substage now lives in the store); no other assertion changes. Confirm the
  `pb_*` mirrored per-question tests, `dashboard/trackRouting.test.ts`, and
  `dashboard/prefillRouting.test.ts` pass unmodified.
- [x] T013 Confirm `dashboard/driftGuardrail.test.ts` passes **UNMODIFIED** — the `characters`
  node + `phase_b_characters` drill-downs and the bijection node set are unchanged (SC-005).
- [x] T014 Run the full gate set: `pnpm --filter @keyboard-studio/studio typecheck`,
  `pnpm --filter @keyboard-studio/studio test` (only the 4 baseline failures allowed),
  `pnpm depcruise` — all green. Confirm no new depcruise violation from
  `steps/manifest.ts → survey/CharactersStep` or the component's store imports (research D-R4).
- [x] T015 Final scan of the diff: no leftover `charactersSub`/`setCharactersSub` references
  outside the store slot; no other per-step-prop change; `PhaseF` thread intact; commit-title
  style `feat(studio): …`; no emoji; no GitHub issue numbers in code (Constitution VIII).

---

## Dependencies

- Phase 1 → Phase 2 → US1 (Phase 3) → US2 (Phase 4) → Verification (Phase 5).
- US2 cannot start until US1's component test (T007) is green.
- T008 (manifest swap) must precede T009 (host mount) so the imported component exists.
- T011–T014 are the release gates; T015 is the cleanliness gate.

## Parallel opportunities

- T004 (store slot) and T005 (component) can be drafted together, but T005's tests (T006) and
  the manifest swap (T008) depend on both.
- Within US2, T008 is a distinct file (`manifest.ts`) and may be done in parallel with drafting
  T009/T010, but T009/T010 both touch `StudioShell.tsx` and must be **sequential** (same file) —
  keep them in one focused edit pass.
- Test tasks T011–T013 touch different files and are `[P]`-eligible once US2 lands.

## MVP scope

US1 (T004–T007) is the standalone MVP: a correct, unit-tested self-contained `CharactersStep`
with a persisted substage. US2 is the parity-preserving integration that makes it live. Ship
both together — the stage is only "done" when the parity walk and the unmodified drift
guardrail pass.

## Task count

15 tasks — Setup 2, Foundational 1, US1 4, US2 3, Verification/Polish 5.
