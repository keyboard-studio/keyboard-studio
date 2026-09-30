# Spec 033 Mutate track: as built

**Status:** Retired 2026-09-29. No dedicated feature PR: the work landed inside the Unified Survey Architecture migration via `7ba08030` (T022-T027 manifest + reducer + adapters), `6baa4ad6` (promote track/project_name to manifest steps) and PR #981 (`d4f787b`, spec 028 Stage 5, 2026-07-03). Closed out by docs PR #1669 (`0fb8b6f`, 2026-08-24), which retroactively verified it. Tasks: 9/9 complete (all verification tasks; no code written in the closeout).
**Full docs:** [specs/_archive/033-qu-mutate-track/](../_archive/033-qu-mutate-track/) (spec, plan, tasks). Not read by default.
**Pinned here:** none

## What shipped
- The track fork (copy -> `project_name` -> `characters`; adapt -> `characters`) no longer lives in `StudioShell`: `handleTrackSelected` and `handleProjectNameNext` are deleted (a test asserts their absence: [manifest.test.ts:449-455](../../packages/studio/src/steps/manifest.test.ts)).
- `track` and `project_name` are manifest steps (`project_name` is `spine:false`, `joinTarget:"characters"`), declared in [registerEditorSteps.ts:95-124](../../packages/studio/src/steps/registerEditorSteps.ts).
- `project_name` declares `writes: [irPath("header","name"), irPath("header","keyboardId")]`.

## Public contracts
- Routing: `advance()` in [steps/advance.ts](../../packages/studio/src/steps/advance.ts) (see spec 028 AS-BUILT). Track and project-name completion effects: `trackOptions.onCommit` and `projectNameOptions.onCommit` in [flowStepOptions.tsx](../../packages/studio/src/editors/adapters/flowStepOptions.tsx) (see spec 029 AS-BUILT).
- Generic mutate branch: `isMutateRequest(result)` at the top of `applyStepCompletion` in [steps/reducer.ts:308-339](../../packages/studio/src/steps/reducer.ts).
- IR writes are seam-flag-gated by `isMutateSeamEnabled()` (`VITE_KM_MUTATE_SEAM === "1"`) in [flags/mutateFlag.ts](../../packages/studio/src/flags/mutateFlag.ts); routing itself is unconditional (FR-007 recommendation adopted).
- Manifest fork metadata stays the single source for the flow map; the spec 016 drift guardrail ([dashboard/driftGuardrail.test.ts](../../packages/studio/src/dashboard/driftGuardrail.test.ts)) enforces it.

## Key decisions
- Routing cutover is unconditional; only IR writes are behind the mutate-seam flag (pure routing is side-effect-free).
- No contracts bump: the fork writes to existing `header.*` IR paths.
- Not promoted: `project_name` stays an off-spine side trail.

## Gotchas and limits
- The fork is TypeScript, not YAML: `advance()` decides the route.
- `content/flows/track.modular.yaml` and `project_name.modular.yaml` remain thin membership manifests.

## Divergences from the spec
- FR-001/US1-US2 said the YAML `next` rule in `track_choice` becomes the load-bearing fork. In the code `track_choice` still has `next: null` ([questions/g/track_choice.ts:42](../../packages/studio/src/survey/questions/g/track_choice.ts)) and the fork is the pure `advance()` policy. The "Phase 2 makes `next` routing-live" comment there is stale.
- `content/flows/track.modular.yaml` header still says routing is "handled by PhaseTrack.tsx"; that component was deleted by spec 029.
- Tasks T006 cites `dashboard/trackRouting.test.ts` and `dashboard/prefillRouting.test.ts`; neither exists at `origin/main` (fork parity is now covered by the spec 028 golden-walk tests in `packages/studio/tests/steps/`).
- The spec's Gate 1 is unusual: the closeout PR is docs-only, the code shipped in earlier commits (all ancestors of `origin/main`).

## Follow-ups and open issues
- Fix the stale comments in `track_choice.ts` and `track.modular.yaml` (km-programmer / km-doc).
- No inbound path links to this folder outside `docs/spec-trace.json` (its `specs/033-qu-mutate-track` unit is orphaned on retirement).
