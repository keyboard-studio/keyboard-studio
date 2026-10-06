---

description: "Task list for Mutate track — route the track fork through the manifest reducer/mutate seam (retroactive verification)"
---

# Tasks: Mutate track — route the track fork through the manifest reducer/mutate seam

**Input**: Design documents from `specs/033-qu-mutate-track/`

**Retroactive verification.** Every task below documents work already implemented and shipped, folded into the broader Unified Survey Architecture migration (specs 026/028/029) rather than landing as an isolated PR. No task produced new code in this pass — each is checked off against the live tree, evidence cited inline.

## Format: `[ID] Description`

---

## Phase 1: Gate reassessment

- [x] T001 Determine whether the spec-header's "GATED on spec #9 loop-primitive resolution" framing still applies. Confirmed it does not: [docs/design-notes/question-unification-migration-plan.md](../../docs/design-notes/question-unification-migration-plan.md) §3.2's status note states the loop-primitive decision gates only the later gallery-decomposition specs, never `track`/`project_name`. Corrected spec.md's Status line to remove the stale gate framing.

## Phase 2: Functional Requirements verification

- [x] T002 (FR-001) Verify `track.modular.yaml`/`project_name.modular.yaml`'s `next` rules are the load-bearing fork, with no hand-coded `if` in `StudioShell` — confirmed `trackStep`/`projectNameStep` are manifest-declared (`registerEditorSteps.ts`) with `flowRefs`, and `grep -n "handleTrackSelected\|handleProjectNameNext" packages/studio/src/StudioShell.tsx` returns zero matches.
- [x] T003 (FR-002) Verify track answer + project-name identity writes route through `applyStepCompletion()` in `packages/studio/src/steps/reducer.ts` — confirmed: the function's generic `isMutateRequest(result)` branch (top of the function, before any step-id switch) handles any step's declared-writes mutate request uniformly; no project_name-specific case was needed or added.
- [x] T004 (FR-003) Verify identity writes route through the `mutate()` seam, honoring the already-declared `writes: [irPath("header","name"), irPath("header","keyboardId")]` on `projectNameStep` — confirmed present verbatim in `registerEditorSteps.ts`, and the reducer's mutate branch applies `applyMutatePatch` scoped to `result.writes`.
- [x] T005 (FR-004) Verify `handleTrackSelected()`/`handleProjectNameNext()` are deleted (not merely reduced) — confirmed via git history: removed by commit `d4f787b2` ("feat(studio): generic StepHost; SurveyView hand-placement dies (spec 028, Stage 5) (#981)"), the same commit that closed spec 028 earlier this session; zero references remain in `StudioShell.tsx`.
- [x] T006 (FR-005) Fork outcome byte-identical for both track choices — exercised by `packages/studio/src/dashboard/trackRouting.test.ts` and `packages/studio/src/dashboard/prefillRouting.test.ts`, both confirmed passing (49/49 combined with `surveySessionStore.test.ts`) during this session's spec 026 gate re-run.
- [x] T007 (FR-006) Manifest fork metadata (`project_name`: `spine:false`, `joinTarget:"characters"`) remains the single source — confirmed in `packages/studio/src/steps/manifest.ts`'s own header comment ("M4b — project_name is spine:false with joinTarget:'characters' (copy-track fork)").
- [x] T008 (FR-007) Flag-gating decision — confirmed the spec's own recommendation was adopted exactly: routing (via manifest/`flowRefs` resolution) is unconditional; only the IR writes are seam-flag-gated, via `isMutateSeamEnabled()` reading `VITE_KM_MUTATE_SEAM` (`packages/studio/src/flags/mutateFlag.ts`), checked in `reducer.ts` before any mutate() call.
- [x] T009 (FR-008) `pnpm typecheck` + studio/contracts vitest + `pnpm depcruise` green — confirmed via this session's spec 065 T060 full-gate run (typecheck clean repo-wide, depcruise passed as part of the lint chain before crew-lint).

**Checkpoint**: All 8 functional requirements (FR-001 through FR-008) verified against the live tree. No code changes were needed in this pass.
