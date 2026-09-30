# Spec 027 qu-characters-step: as built

**Status:** Retired 2026-09-29. Shipped in PR #978 (squash `585baafc`, 2026-07-03, "Stage 4"). Tasks: 15/15 complete. (spec.md header still reads "Status: Draft"; stale.)
**Full docs:** [specs/_archive/027-qu-characters-step/](../_archive/027-qu-characters-step/) (spec, plan, tasks, research, data-model, contracts/CharactersStep.contract.md, quickstart, checklists). Not read by default.
**Pinned here:** none (code cites `specs/027-qu-characters-step` only as a `specRef` string, resolved via `docs/spec-trace.json`).

## What shipped
- Stage 4 of the Unified Survey Architecture refactor: `CharactersStep` is a self-contained step adapter that owns the Prefill then PhaseB sub-stage internally. It is the first runtime use of a manifest `component`.
- `charactersSub` (component-local in the shell) is replaced by a typed store slot, so back-from-carve re-enters at PhaseB without a shell-side setter.
- Copy-track and adapt-track screen sequences are unchanged.

## Public contracts
- `packages/studio/src/survey/CharactersStep.tsx`: `ComponentType<EditorStepProps>`; renders `Prefill` then `PhaseB` (from `survey/index.ts`), selected by `charactersSubStage`. Reads `identityResult`, `localBase`, `surveyContext`, `charactersSubStage` from `surveySessionStore`; `validatorFindings` via `useValidatorFindings`.
- Store delta in `stores/surveySessionStore.ts`: `charactersSubStage: "prefill" | "B"` (initial `"prefill"`), `setCharactersSubStage`; `reset()` returns it to `"prefill"`.
- Manifest `charactersStep` (`steps/manifest.ts`): `component: CharactersStep`, `writes:[header.bcp47]`, `spine:true`, `flowRefs:["phase_b_characters"]`, `rightPane:"character-map"`, `persistence:"phase-b-draft"`, `specRef:["§8","specs/027-qu-characters-step"]`.

## Key decisions
- Dedicated typed slot rather than a generic scratch map or a host-supplied prop, because a history pop remounts the step and component state would reset (D-R1).
- The component causes no survey-level transitions (no `advance`, `popHistory`, `applyStepCompletion`): it reports via `onComplete`/`onBack` and the host runs the reducer path.
- Fresh entry must start at prefill: `reset()` clears it, and `steps/advance.ts` signals `setCharactersSubStage: "prefill"` on the adapt branch and after project_name.

## Gotchas and limits
- `placementMap` is deliberately not passed to PhaseB.
- The component renders `null` in prefill when `identityResult`/`localBase` is null.
- It has since grown (specs 075, 079): it is now the single writer of this step's `surveyAnswerStore` position and seeds punctuation on prefill confirm. `discoveryMethod` is also in the store.

## Divergences from the spec
- The contract says no side effects; the code adds answer-store and punctuation-seeding effects (specs 079/075). It still calls no history mutators.

## Follow-ups and open issues
- None recorded in tasks.md.
