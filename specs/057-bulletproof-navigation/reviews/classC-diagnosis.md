# Class C diagnosis — decision-deeplink E2E (spec 057 US3)

## Symptom

`packages/studio/e2e/decision-deeplink.spec.ts:110` — after `driveIdentityLite →
pickBaseKeyboard(basic_kbdfr) → chooseAdaptTrack`, the trail tab never shows a
`[data-testid="decision-entry"]` matching `/Authoring approach/i` (`track_choice`'s
audit label). Element never appears; test times out.

## Root cause

`packages/studio/src/editors/adapters/makeFlowStepComponent.tsx`'s
`wrappedOnComplete` (the completion wrapper `makeFlowStepComponent` builds for
every YAML-driven flow step) discarded the real, untouched `SurveyPhaseResult`
after extracting a step-specific payload, and forwarded **the extracted
payload** to `props.onComplete` instead:

```ts
const extracted = options.extract(result);
if (extracted === undefined) return;
options.onCommit?.(extracted, depsRef.current);
onComplete(extracted as unknown);   // <- bug: should be onComplete(result)
```

`onComplete` is `EditorStepProps.onComplete`, which `StepHost.tsx`'s
`handleComplete(result)` receives verbatim and fans out to three consumers
(contract §2, `StepHost.tsx:353-372`):

1. `isSurveyPhaseResult(result)` → `recordPhase(result)` +
   `routeAnswersThroughMutate(result, …)`
2. `STEPS_WITH_APPLY_COMPLETION.has(stepId)` → `applyStepCompletion(...)`
3. **`recordStepCompletion(stepId, result, reducerDeps)`** — the decision-audit
   seam (spec 053), which calls `deps.recordDecision?.({ stepId, result })`

`createDecisionRecorder.ts`'s `recordDecision` callback only calls
`recordSurveyAnswers` (which is what turns an answer into a
`{ kind: "survey-answer", questionId, ... }` decision entry, keyed by
`questionId` for `DecisionEntryRow`'s label lookup) when
`isSurveyPhaseResult(result)` is true — i.e. `result` has an `answers` array.

For the **`track`** step, `trackOptions.extract()` (flowStepOptions.tsx)
reshapes the real result into `TrackPayload = { track: "copy" | "adapt" }`,
which has no `answers` array. Once that reshaped value reached
`handleComplete` instead of the real result, `isSurveyPhaseResult` was false
for every branch above:
- `recordPhase`/`routeAnswersThroughMutate` never ran for `track` (harmless in
  practice — see below — but not what the host's contract describes),
- `recordStepCompletion` → `recordDecision` saw `{ track: "adapt" }`, which is
  not survey-phase-shaped, so **no `track_choice` decision entry was ever
  appended** — nothing for the trail to render, nothing for
  `decision-deeplink.spec.ts` to find or jump back to.

This was not a random oversight: `packages/studio/src/steps/reducer.decisionRecording.test.ts`
had a unit test asserting exactly this outcome as *intended* —
`"records nothing for a step that carries no answers and is not an editor"`,
using `{ track: "copy" }` captioned "the track step's real payload
(flowStepOptions.ts trackOptions.extract)". The test was truthfully describing
the shipped code; the code itself was wrong. The 053 decision-audit work and
057's decision-trail deep-link feature made an implicit, undocumented
assumption in opposite directions about what `makeFlowStepComponent` hands to
`onComplete`.

## Shaped-bug sweep

**Shape:** any `FlowStepOptions.extract()` that reshapes the real
`SurveyPhaseResult` into a step-specific payload silently hides that step's
survey answers from the decision-audit seam, because the reshaped payload —
not the original result — is what reaches `StepHost.handleComplete`.

There are exactly three `FlowStepOptions` records wired through
`makeFlowStepComponent` today (`flowStepOptions.tsx`):

| record | `extract()` | affected? |
|---|---|---|
| `trackOptions` (`track` step) | returns `{ track }` — reshapes | **yes** — original bug site |
| `projectNameOptions` (`project_name` step) | returns `{ displayName, keyboardId }` — reshapes | **yes** — sibling, same shape |
| `phaseFOptions` (`help` step) | returns `result` unchanged (identity extraction) | no — already passes the raw result through |

`project_name`'s two questions (`project_display_name`, `project_keyboard_id`)
both declare `audit_label` (`project_display_name.ts:17` —
`"Keyboard display name"`) and were silently missing from the decision trail
for the same reason, even though nothing in spec 057's test suite happened to
assert on them directly. Both sites are fixed in the same commit; no sibling
was left unfixed.

## Fix

`packages/studio/src/editors/adapters/makeFlowStepComponent.tsx` — forward the
untouched `result` to `onComplete`, not `extracted`:

```ts
options.onCommit?.(extracted, depsRef.current);
onComplete(result);
```

`extract()`/`onCommit()` still do exactly what they did before — they exist
for this factory's OWN store side effects (`setSelectedTrack`, `setIdentity`,
etc.) and the "stay on step" no-advance guard. Only what flows onward to
`StepHost`'s generic completion path changes, and that path was always
supposed to receive the real result per its own header comment ("the host
passes the same opaque `result` it already has").

**Why this is safe / doesn't ripple:**
- `advance()` (`steps/advance.ts`) takes `result` as `_result: unknown` and
  never reads it — the fork logic (`ctx.selectedTrack`, set by `onCommit`
  *before* `onComplete` fires) is what it actually branches on.
- `STEPS_WITH_APPLY_COMPLETION` does not include `"track"` or `"project_name"`,
  so `applyStepCompletion` is not newly invoked for either step.
- `routeAnswersThroughMutate` is a no-op for all three affected question ids
  (`track_choice`, `project_display_name`, `project_keyboard_id`) — none of
  their question modules declare a `mutate` function.
- `recordPhase(result)` now fires for `track`/`project_name` (previously it
  silently didn't). Verified inert: `mergePhaseResults` (contracts/
  `surveySession.ts`) never reads `SurveyPhaseResult.answers` — it only folds
  `computedAxes`, `selectedPatternIds`, `assignments`, `confirmedInventory`,
  `attestedDigraphs`, `alphabet`, `marksWorklist`, `marksOutputForm`,
  `retainedConvenienceChars`, none of which either flow's YAML populates. This
  also brings `track`/`project_name` in line with every OTHER spine step
  (`identity`, `characters`, `marks`, `help`), all of which already show
  `recordPhase` in the golden-walk fixtures — `track`/`project_name` were the
  two outliers.

## Tests

- **Updated** `packages/studio/src/steps/reducer.decisionRecording.test.ts`:
  replaced the test that locked in the bug (`{ track: "copy" }` as "the track
  step's real payload") with two new regression tests driving each sibling's
  REAL post-fix payload shape (a `SurveyPhaseResult`) through
  `recordStepCompletion`, asserting the `track_choice` /
  `project_display_name` / `project_keyboard_id` decision entries are
  recorded with the correct `questionId`s. The "records nothing" case is kept,
  re-pointed at a genuinely non-informative step (`"sequences"` with
  `undefined`) so it still tests what it claims to.
- **Updated** `packages/studio/tests/steps/makeFlowStepComponent.test.tsx`:
  the R7-ordering test's `onCompleteSpy` assertion now expects the raw
  `SurveyPhaseResult` the mocked `FlowStepHost` hands back, not `{ track:
  "copy" }`.
- **Updated** `packages/studio/src/survey/PhaseProjectName.integration.test.tsx`:
  both integration assertions now read `displayName`/`keyboardId` out of the
  real result's `answers` array (matching what `projectNameOptions.extract`
  itself does), instead of assuming `onComplete` receives the extracted pair
  directly.
- **Updated** golden-walk fixtures
  `packages/studio/tests/steps/__fixtures__/goldenWalk/{copy,adapt}.json`:
  added `"recordPhase"` to the `track` step's `workingCopyMutations` (both
  fixtures) and to `project_name`'s (copy fixture) — the correct, verified
  new behaviour, not a regression to paper over.

## Verification

- `pnpm --filter @keyboard-studio/studio test` — **361 test files / 5264
  tests, all passing** (full suite, not just the touched files).
- `pnpm --filter @keyboard-studio/studio exec tsc -b` — clean, no errors.
- E2E (`decision-deeplink.spec.ts`) was **not** run per this task's
  instructions (dev server in use by the main session); the fix is verified
  at the unit/integration level above, with the exact question id
  (`track_choice`) and audit label chain (`registry.g.ts` →
  `lookupQuestionLabel.ts` → i18n `flowQuestions.json` `track_choice.audit_label`
  = "Authoring approach") traced and unaffected by this change — only the
  presence of the decision entry was missing, not its label resolution.

## Files touched

- `packages/studio/src/editors/adapters/makeFlowStepComponent.tsx` (fix + contract-comment update)
- `packages/studio/src/steps/reducer.decisionRecording.test.ts` (test fix + 2 new regression tests)
- `packages/studio/tests/steps/makeFlowStepComponent.test.tsx` (assertion updated to match corrected contract)
- `packages/studio/src/survey/PhaseProjectName.integration.test.tsx` (assertions updated to match corrected contract)
- `packages/studio/tests/steps/__fixtures__/goldenWalk/copy.json` (fixture updated: `recordPhase` added for `track`, `project_name`)
- `packages/studio/tests/steps/__fixtures__/goldenWalk/adapt.json` (fixture updated: `recordPhase` added for `track`)
