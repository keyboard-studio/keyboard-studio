# Contract: FlowStepHost + makeFlowStepComponent

Behavioural contract for the Stage-6 convergence. "MUST" items are release-gated by the parity
oracle (SC-001) and the factory unit test (SC-006).

## §1 — FlowStepHost (pure, `survey/`)

- **C1.1** MUST render the shared shell: styled container + `<h2>{title}</h2>` +
  `<SurveyRunner key={flow.flow_id} flow={flow} context={context} onComplete={onComplete} … />`.
  The container styling MUST equal the three wrappers' current markup (dark shell, blue `h2`) so no
  DOM/visual diff appears.
- **C1.2** MUST forward `onBack`, `getSeedValue`, `onAnswerCommit`, `findingsByQuestionId` to
  `SurveyRunner` ONLY when defined (same optional-prop guarding as the wrappers today).
- **C1.3** MUST NOT import `stores/`, `steps/flowSources` (runtime), `dashboard/`, or `lib/`. It is a
  pure presentational component. Type-only imports of `steps/types` are permitted.
- **C1.4** MUST be exported from `survey/index.ts` (preserves the golden-walk `vi.mock("../survey/index.ts")`
  seam — R7).

## §2 — makeFlowStepComponent (factory, `editors/adapters/`)

- **C2.1** `makeFlowStepComponent(options)` MUST return a `React.ComponentType<EditorStepProps>`.
- **C2.2** MUST resolve `flowSources[options.flowRef]` and **throw a descriptive Error** if the ref
  is absent (FR-010) — never render empty.
- **C2.3** MUST `loadModularFlow(source.raw)` once (memoised) and pass the resulting `FlowDef` to
  `FlowStepHost`.
- **C2.4** On runner completion MUST, in this order: `extracted = options.extract(result)`; if
  `extracted === undefined` **return without advancing** (stay-on-step parity); else run
  `options.onCommit?.(extracted, deps)` (store effects) **before** calling the host-supplied
  `props.onComplete(extracted-shaped payload)`. This reproduces the R7 ordering the golden walk
  records.
- **C2.5** MUST confine ALL store/hook access to itself (the factory component); `FlowStepHost`
  receives plain values.
- **C2.6** MUST pass depcruise: the new `editors/adapters/ → steps/flowSources` runtime edge is
  acyclic and allowed; no new forbidden edge is introduced.

## §3 — Per-flow options records (parity table)

Each record MUST reproduce, exactly, the behaviour of the wrapper it replaces:

### track
- context: `{ base_name: <surveySessionStore.localBase.displayName> }`; guard: if `localBase` is
  null, render nothing (matches `TrackStepAdapter`).
- extract: `track_choice` answer, accept only `"copy"`/`"adapt"`, else `undefined`.
- onCommit: `setSelectedTrack(track)`; if `track !== "copy"` also `setScaffoldSpec(null)`.
- payload to onComplete: `{ track }`.

### project_name
- defaultDisplayName: `identityResult ? (autonym || english) : ""`.
- context: `{}`.
- seeds.getSeedValue: `project_display_name` → defaultDisplayName (or undefined if empty);
  `project_keyboard_id` → `slugifyKeyboardId(currentDisplayName)` (or undefined if empty).
- seeds.onAnswerCommit: track latest `project_display_name` into the ref used by getSeedValue
  (Back→forward re-derivation — FR-005).
- extract: display + id answers, both trimmed; `undefined` unless both non-empty.
- onCommit: `setScaffoldSpec({keyboardId,displayName})` then `setIdentity({keyboardId,displayName})`.
- payload: `{ displayName, keyboardId }`.

### phase_f_helpdocs
- context: `surveySessionStore.surveyContext`.
- usesFindings: derive `findingsByQuestionId` via `buildFindingsByQuestionId(validatorFindings)`.
- extract: identity (raw `SurveyPhaseResult`).
- onCommit: none.
- payload: the raw result (host's downstream `recordPhase`/`applyStepCompletion` unchanged).

## §4 — Manifest / adapter wiring

- **C4.1** `registerEditorSteps.ts` `trackStep.component`, `projectNameStep.component`, and
  `helpStep.component` MUST resolve to the factory output for `track` / `project_name` /
  `phase_f_helpdocs` respectively (directly, or via a one-line adapter that supplies nothing extra).
- **C4.2** Declared `inputs` / `writes` / `flowRefs` on those steps MUST be unchanged.
- **C4.3** `IdentityLiteAdapter` and all gallery adapters MUST be untouched (R8 — identity is not a
  `SurveyRunner`-over-YAML flow; galleries are out of scope).

## §5 — Parity & test gates

- **C5.1** `stepHost.goldenWalk` copy + adapt fixtures replay zero-diff, files unmodified (SC-001).
- **C5.2** Re-pointed `PhaseProjectName`/`PhaseTrack` behaviour tests keep every assertion (SC-002).
- **C5.3** New `makeFlowStepComponent.test.tsx`: resolve→run→extract→complete for one flow, and a
  loud throw for an unknown ref (SC-006).
- **C5.4** `pnpm typecheck`, studio `vitest`, `pnpm depcruise`, and the Flow Map drift guardrail all
  green; drift guardrail UNCHANGED (SC-005).
- **C5.5** Zero bespoke wrapper components remain for the three flows (SC-003).
