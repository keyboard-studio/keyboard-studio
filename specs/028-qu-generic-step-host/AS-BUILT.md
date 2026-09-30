# Spec 028 Generic StepHost: as built

**Status:** Retired 2026-09-29. Shipped in PR #981 (squash `d4f787b`, 2026-07-03); gates closed out in #1186 (`5e2645e`). Tasks: 24/24 complete.
**Full docs:** [specs/_archive/028-qu-generic-step-host/](../_archive/028-qu-generic-step-host/) (spec, plan, tasks, research, data-model, contracts, checklists). Not read by default.
**Pinned here:** none

## What shipped
- One `StepHost` renders every survey step from the `manifest` array; `SurveyView` hand-placement per stage is gone (Stage 5 of the Unified Survey Architecture).
- Step sequencing is a single pure policy, `advance()`, in `steps/advance.ts`; the host has no per-step advance branching.
- `identity` mounts a real `IdentityLiteAdapter`; the mechanisms adapter self-sources placement priors.
- A golden-walk parity oracle (copy + adapt tracks) proved zero behavioural diff against the pre-refactor tree.

## Public contracts (studio-internal, no `packages/contracts` change)
- `advance(completedStepId, result, ctx: AdvanceContext): AdvanceOutcome` -- [steps/advance.ts](../../packages/studio/src/steps/advance.ts). `AdvanceOutcome = { next; navigate?: "output"; setCharactersSubStage?: "prefill" }`. Pure; imports only `./manifest.ts` + `./types.ts` (depcruise-enforced).
- `manifestIndexOf`, `nextSpineStepAfter` (moved out of StudioShell) and `STEPS_WITH_APPLY_COMPLETION` (the effect table) are exported from the same file.
- `StepHost({ reducerDeps, onStartOver, ctx? })` -- [components/StepHost.tsx](../../packages/studio/src/components/StepHost.tsx). Completion path: if result is `SurveyPhaseResult`-shaped, `recordPhase` + `routeAnswersThroughMutate`; then `applyStepCompletion` only for ids in `STEPS_WITH_APPLY_COMPLETION`; then `advance` -> `session.advance(next)` -> optional `setCharactersSubStage("prefill")` -> optional `navigateTo("output")`.
- Terminals `done` and `unsupported` are handled by the host, not manifest steps; an unknown step id renders a visible error panel, never a blank pane.
- Fork rules: `track` copy -> `project_name`; adapt -> `characters` + `setCharactersSubStage("prefill")`; `project_name` -> `characters` + same signal; `identity` unsupported -> `unsupported`.
- Layout: `step.layout === "full"` renders full-screen (carve, mechanisms, touch); others render in the survey pane.

## Key decisions
- Advance policy lives in `steps/`, not the host, and takes a snapshot ctx from the host so it never reads a store (research R1/R2).
- A small data table decides which steps call `applyStepCompletion`, replacing per-step handler code (R7).
- Sub-stage reset is a declarative outcome field the host executes, same pattern as `navigate` (keeps the policy pure and the golden-walk ordering).
- Parity oracle fixtures were committed before the refactor and asserted unchanged after (R8).

## Gotchas and limits
- The spine has grown since the spec: `marks`, `punctuation`, `invisibles`, `convenience`, `deadkeys`, `touch_seed_source` are now `advance()` cases. Read the manifest, not the spec's step list.
- `advance("help")` stays on `help` (no navigate) until `allCharactersImplemented`; this is a hard gate with no escape.
- `advance("track")` with a null `selectedTrack` logs an invariant violation and falls back to the copy path.
- `recordPhase` is called with `{ stepId }`; the spec showed a bare call.

## Divergences from the spec
- `AdvanceContext` has two more fields than the contract: `touchSeedSource` (spec 035 fork memory) and `allCharactersImplemented` ([advance.ts:63-84](../../packages/studio/src/steps/advance.ts)).
- `mechanisms` now routes to `touch_seed_source` when no fork choice is recorded, else `touch`; the contract listed `mechanisms -> touch` unconditionally.
- `help` no longer always yields `{ next: "done" }`; it is gated (see above).
- The contract's `helpStep.component = PhaseFAdapter` was superseded by spec 029: `PhaseFAdapter` is deleted and `helpStep` is a factory component wrapped by `PhaseFGate` ([registerEditorSteps.ts:260-273](../../packages/studio/src/steps/registerEditorSteps.ts)).

## Follow-ups and open issues
- `TrackOneIdentityPanelAdapter` ([panelAdapters.tsx:154](../../packages/studio/src/editors/adapters/panelAdapters.tsx)) is still exported but has no importers: dead code for km-simplify.
- Code comments cite `spec 028` (StepHost.tsx, advance.ts, addPhysicalAdapter.tsx); they still resolve to this stub folder.
- Living docs link the archived spec: [docs/architecture.md:67](../../docs/architecture.md) points at `specs/028-qu-generic-step-host/spec.md`, which moves; retarget to this file.
