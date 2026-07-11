# Research: FlowStepHost Convergence (Stage 6)

Phase 0 — resolve the one non-obvious design question (layer placement + effect ordering) and
confirm the parity strategy. All other choices are dictated by the master plan and spec 028.

## R1 — Where does `makeFlowStepComponent` live, and how does it resolve `flowRef`?

**Decision**: `FlowStepHost` (the pure UI shell) lives in `survey/`; `makeFlowStepComponent` + the
per-flow options records live in `editors/adapters/`. The factory resolves `flowSources[flowRef]`
by runtime-importing `steps/flowSources.ts` from the adapter layer.

**Rationale**:
- `steps/flowSources.ts` runtime-imports `survey/questions/*` registries. The `no-circular`
  dependency-cruiser rule exempts `type-only` imports but NOT runtime imports. If `survey/FlowStepHost`
  runtime-imported `steps/flowSources`, we would create a `survey → steps → survey` runtime edge that
  inverts the intended `steps → survey` layering. Even where module-granular cycle detection might not
  flag it, it is fragile and violates the documented layer direction.
- `editors/ → steps/` is an **allowed** edge (the editors rule only forbids `editors/ → dashboard/`),
  and it is **acyclic**: `flowSources.ts` imports only `content` `?raw` + `survey/questions`
  registries — none of which import back into `editors/`. So `editors/adapters/makeFlowStepComponent`
  → `steps/flowSources` → `survey/questions` is a dead-end chain, no cycle.
- `editors/adapters/` is already the layer permitted to import `stores/` (the current
  `TrackStepAdapter`/`ProjectNameStepAdapter`/`PhaseFAdapter` do so). The R7 store-mutation effects
  therefore stay exactly where they legally are today.

**Alternatives considered**:
- *Factory in `survey/` resolving `flowSources`* — rejected: inverts layering / runtime-couples
  `survey → steps` (see above).
- *Factory in `steps/`* — rejected: `steps/` is a descriptor layer forbidden from importing
  `stores/`; it cannot host the R7 store effects. (It legally references component *values*, but the
  effects would have nowhere to go.)
- *Move `flowSources.ts` into `survey/`* — rejected: out of scope; Stage 1 deliberately placed it in
  `steps/` for the dashboard derivation, and moving it churns unrelated importers.

**Verification task**: `pnpm depcruise` must stay green after the new `editors → steps/flowSources`
runtime edge lands (this is an explicit polish-phase gate — SC-005).

## R2 — How are the R7 store-mutation effects preserved with identical ordering?

**Decision**: The effects the current adapters run BEFORE `onComplete` become an explicit,
per-flow `onCommit(extracted, deps)` hook invoked by the factory-produced component immediately
before it calls the host-supplied `onComplete`. The ordering contract is unchanged:

- `track` copy: `setSelectedTrack("copy")` → `onComplete({ track })`
- `track` adapt: `setSelectedTrack("adapt")` → `setScaffoldSpec(null)` → `onComplete({ track })`
- `project_name`: `setScaffoldSpec({keyboardId,displayName})` → `setIdentity(...)` →
  `onComplete({ displayName, keyboardId })`
- `phase_f` (help): no pre-`onComplete` store write; just `onComplete(result)`.

**Rationale**: The golden-walk oracle records `storeMutations` in order relative to `onComplete`
(spec 028 R7). Keeping the writes in the adapter layer and firing them synchronously before
`onComplete` reproduces the exact recorded sequence. The host itself performs no store writes.

**Alternatives considered**: *Move effects into the host via injected setters* — rejected: pushes
store awareness into `survey/`, muddying the pure/impure split for zero benefit.

## R3 — `project_name` seeding (slugify) placement

**Decision**: The `getSeedValue`/`onAnswerCommit` logic from `PhaseProjectName` moves verbatim into
the `project_name` options record's `seeds` field. The `displayNameRef` + `slugifyKeyboardId`
re-derivation (Back→forward re-arrival) is preserved exactly; `FlowStepHost` forwards `seeds` to
`SurveyRunner`'s `getSeedValue`/`onAnswerCommit` props.

**Rationale**: `SurveyRunner` already accepts these optional props; the wrapper only wired them. The
options record is the natural home. `defaultDisplayName` is derived by the factory/adapter from
`surveySessionStore.identityResult` (as `ProjectNameStepAdapter` does today).

**Alternatives considered**: *Bake slug logic into the host* — rejected: it is flow-specific; the
`seeds` option is exactly the seam for it (FR-005).

## R4 — `buildContext` per flow

**Decision**: Each options record supplies a `buildContext(deps) → SurveyContext`:
- `track`: `{ base_name: localBase.displayName }` (from `surveySessionStore.localBase`).
- `project_name`: `{}` (empty — matches `PhaseProjectName` today).
- `phase_f`: `surveySessionStore.surveyContext` (matches `PhaseFAdapter` today).

`deps` are read in the adapter/factory (store hooks), not in the pure host.

## R5 — `findingsByQuestionId` for `phase_f`

**Decision**: `PhaseFAdapter` today derives `findingsByQuestionId` from the `validatorFindings` store
bridge via `buildFindingsByQuestionId`. This stays in the adapter/factory layer and is passed to the
host as a plain prop, forwarded to `SurveyRunner`. No behaviour change.

## R6 — Extraction (`extract(result)`)

**Decision**: Each options record supplies `extract(result: SurveyPhaseResult)` returning the shaped
payload the current wrapper's `handleComplete` produced:
- `track`: pull `track_choice` answer → `{ track }` (only "copy"/"adapt"; else no-complete).
- `project_name`: pull `project_display_name` + `project_keyboard_id` → `{ displayName, keyboardId }`
  (only when both non-empty; else stay on step).
- `phase_f`: identity — the raw `SurveyPhaseResult` (the host guards on shape downstream).

The "stay on step when extraction yields nothing" guard moves into the factory (it decides whether to
call `onCommit`+`onComplete`), preserving the wrappers' current no-op-on-empty behaviour.

## R7 — Parity strategy

**Decision**: The Stage-5 `stepHost.goldenWalk` copy + adapt fixtures are the release gate and stay
UNMODIFIED. Existing `PhaseProjectName`/`PhaseTrack` behaviour tests are re-pointed at
`makeFlowStepComponent(...)` output with assertions unchanged. One new factory unit test covers
resolve→run→extract→complete and the unknown-`flowRef` loud failure.

**Note on the golden-walk mock seam**: the golden-walk test mocks `../survey/index.ts` (that is why
Stage 5 switched adapters to use `PhaseTrack`/`PhaseProjectName` from `survey/index.ts`). After
convergence the factory renders `FlowStepHost` (exported from `survey/index.ts`), so the mock seam is
preserved — the test still intercepts the survey layer without modification. This must be verified
when re-pointing (a task-level check), and is why `FlowStepHost` is exported from `survey/index.ts`.

## R8 — Identity is NOT in scope of the convergence

**Decision**: `identityStep` uses `IdentityLite` (a bespoke React component), NOT the
`Phase* → SurveyRunner` pattern. `IdentityLiteAdapter` stays as-is. Only `track`, `project_name`, and
`phase_f_helpdocs` (the three `SurveyRunner`-over-modular-YAML flows) converge. This matches the
master-plan wording ("generalizes PhaseTrack/PhaseProjectName/PhaseF").

## Open questions

None blocking. The pure/impure split (R1) is the single decision of substance; it is constrained by
depcruise, not preference, and is verified by SC-005.
