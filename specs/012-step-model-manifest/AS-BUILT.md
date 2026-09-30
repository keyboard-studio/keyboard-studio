# Spec 012 Unified step model + manifest-driven survey ordering: as built

**Status:** Retired 2026-09-29. Shipped in PR #778 (P4a, squash `f9695d1a`) and PR #780 (P4b, squash `79776b31`), both 2026-06-27; tasks ticked by #1677 (`d9439b98`). Tasks: 45/45 complete.
**Full docs:** [specs/_archive/012-step-model-manifest/](../_archive/012-step-model-manifest/) (spec, plan, tasks, research, data-model, contracts, checklists). Not read by default.
**Pinned here:** none

## What shipped
- One step model: every gallery and wizard panel is an `EditorStep`, every registered survey question a `QuestionStep`.
- `steps/manifest.ts` is the single source of survey order, branching, spine/side-trail membership and lock placement. `SurveyStage` no longer exists as a union (only comments mention it).
- `applyStepCompletion` in `steps/reducer.ts` owns every side-effecting completion (lock, touch-layout build, instantiate); editors only call `onComplete`.
- Dashboard completeness checks: transitive staleness, cycle detection, side-trail rejoin, spine-prefix shippability, orphan inputs, unreachable steps.
- dependency-cruiser layering rules for `editors/`, `steps/`, `dashboard/` (`.dependency-cruiser.cjs`: `editors-no-dashboard`, `steps-layer`, `dashboard-layer`, `ui-is-a-leaf`).

## Public contracts (packages/studio/src)
- `steps/types.ts`: `StepKind`, `StepBase`, `QuestionStep`, `EditorStep`, `Step`, `EditorStepProps { onComplete; onBack?; ctx? }`. Fields in `StepBase`: `id, kind, title, spine?, lock?: "physical"|"touch", joinTarget?, inputs/writes: IRPath[]`, plus later additions `layout, rightPane, flowRefs, specRef, evidence, persistence (required)`.
- `steps/manifest.ts`: `manifest: readonly Step[]` (array order is survey order), `validateManifestShape()` (throws on duplicate id etc.). Manifest test: `steps/manifest.test.ts`.
- `steps/reducer.ts`: `applyStepCompletion(stepId, result, deps)`, step ids `MECHANISMS_STEP_ID`, `TOUCH_STEP_ID`, `MARKS_STEP_ID`, `CHOOSE_BASE_STEP_ID`, `ReducerDeps`, `recordStepCompletion`, `routeAnswersThroughMutate`. Unknown step id is a no-op.
- `dashboard/completeness.ts`: `runCompleteness`, `computeStaleness(FromAdj|FromManifest)`, `findCycles*`, `checkRejoin`, `checkSpinePrefixShippability`, `checkInputsSatisfiable*`, `findUnreachable`, `checkSpecRef`; `CompletenessReport { stale, cycles, rejoinViolations, unshippablePrefixes, orphanInputs, unreachable }`.
- Editor adapters: `editors/adapters/*` (carve, addPhysical, addTouch, deadkey, panel adapters), each assignable to `React.ComponentType<EditorStepProps>`.
- Invariants (manifest): exactly one `lock:"physical"` then one `lock:"touch"`, on spine steps; every `spine:false` step has a `joinTarget`; `touch_seed_source` and `project_name` are off-spine forks; step ids unique; no A-G phase-letter vocabulary.

## Key decisions
- Adopt `editors/`, `steps/`, `dashboard/` (absorbing `flowmap/`) as folder names (clarification 2026-06-27).
- Two sequential PRs so P4a (byte-identical adapters) and P4b (cutover) were independently revertible.
- Shippability was a structural proxy (no validator call) at ship time; real validation was reserved for spec 014 US5.
- Contract stays studio-internal, not in `@keyboard-studio/contracts`; `IRPath` reused verbatim from the P2 contract.

## Gotchas and limits
- The manifest is now the runtime order: new steps need `specRef` (checked by `checkSpecRef`) and a `persistence` declaration (cross-checked by `manifest.persistence.test.ts`).
- `steps/` may not import `dashboard/`, `stores/`, `lib/`, `components/` (depcruise `steps-layer`); `dashboard/` may not import `editors/` or `stores/`.
- `completeness.ts` builds a minimal StepGraph inline to avoid a circular import through the store.
- Constitution Principle IX (`.specify/memory/constitution.md`) cites this spec as the ordering authority.

## Divergences from the spec
- Spec: `mutate` stays a stub. Code: spec 014 made it real (`steps/mutateApply.ts`, `steps/editorMutate.ts`).
- Spec: shippability is structural only. Code: `unshippablePrefixes` also includes a blocking Layer-A finding (`dashboard/completeness.ts` report comment).
- Spec: `StepBase` lists 8 fields. Code has grown (see Public contracts). Additive.
- Spec: `EditorStepProps.onComplete` result goes to the reducer. Matches.

## Follow-ups and open issues
- Stale citations (code comments) to `specs/012-step-model-manifest/...` paths in `steps/types.ts`, `steps/manifest.test.ts`, `steps/reducer.test.ts`, `editors/assignLoop/provenance.ts`, `editors/touchSuggest/defaults.ts`; also `.specify/memory/constitution.md:77` and specs 014, 032, 069, 079, 081. Contract files moved to `specs/_archive/012-step-model-manifest/contracts/`; suggest km-programmer repoint the source-of-truth comments to the code.
- `docs/spec-trace.json` entry `specs/012-step-model-manifest` orphaned.
