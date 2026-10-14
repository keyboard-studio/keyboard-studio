# Data Model: Question decisions write only through `apply` (specs/089-decision-apply)

Phase 1 design. All types live in `packages/studio` — nothing here touches
`packages/contracts`. Shapes verified against the code on this branch; the 088
dependency is specified from [088 spec.md](../088-modular-decisions/spec.md) FR-001.

## ApplyContext (new — `survey/types.ts`, supersedes `MutateContext`)

The `ctx` of FR-001. Read-only; the only things `apply` may read.

| Field | Type | Notes |
|---|---|---|
| `ir` | `KeyboardIR \| null` | the working copy's current IR; `null` before instantiation (identity/track completions). `apply` MUST NOT mutate it. |
| `writes` | `readonly IRPath[]` | the module's own declared `writes` — the containment set for the patch's `ir` channel. |
| `decisions` | `DecisionSet` | the live recorded decisions (088's store content) at runner time, **after** this completion's answers are recorded. This is how a composed `apply` reads its siblings (research R4) and how it reads its `requires` inputs: `decisions[requiredId]?.value`. |
| `currentHistoryEntryState` | `HistoryEntryState \| null` | present for the help composition only: the onMount-derived proposal state `applyHistoryEntryAction` transforms. Read by the runner from the working copy and passed in, so `apply` stays store-free. Absent/`null` for every other module. |

`MutateContext` (`survey/types.ts:186-191`, `{ ir, writes }`) is deleted with the
`mutate` field it served; `decisions/impact.ts`'s re-derivation builds an
`ApplyContext` instead. No other `MutateContext` consumer exists outside tests.

## WorkingCopyPatch (new — `survey/types.ts`)

The return of `apply` (FR-001). A partial record; an absent channel is no write.
All channels are whole-value replaces, matching the existing setters' semantics.

| Channel | Type | Working-copy field | Setter the runner calls |
|---|---|---|---|
| `ir` | `Partial<KeyboardIR>` | `ir` (merged) | `applyMutatePatch(base, ir, writes)` → `setWorkingIR` |
| `identity` | `IdentityPatch` (`stores/workingCopyStore.ts:338`) | `identity` | `setIdentity` |
| `attribution` | `Attribution \| null` (contracts) | `attribution` | `setAttribution` |
| `helpDocs` | `HelpDocsAnswers \| null` (contracts) | `helpDocs` | `setHelpDocs` |
| `historyEntryState` | `HistoryEntryState \| null` | `historyEntryState` | `setHistoryEntryState` |

Rules:

- `{}` is valid and means "this decision has no keyboard effect" (track, R4).
- The `ir` channel is containment-checked **before** any channel is written; a
  `MutatePatchContainmentError` rejects the whole patch — no overlay channel of
  the same patch is applied (US1 scenario 3: working copy untouched).
- If `ctx.ir` is `null`, a non-empty `ir` channel is skipped (today's behaviour
  when no working copy exists yet); overlay channels still apply.
- Idempotency (spec-014 M4 carries over): applying the same patch twice is a
  no-op the second time — whole-value replaces and the path-scoped merge both
  have this property; `pb_standard_letters`' array rebuild already relies on it.

### Channel authorization (containment analogue for overlay channels)

Overlay channels have no `IRPath`; the runner authorizes them by the module's
provided decisions:

| Channel | Authorized when the module provides |
|---|---|
| `ir` | (checked by `applyMutatePatch` against `writes`) |
| `identity` | `project-keyboard-id` (the composed owner, R4) |
| `attribution` | `copyright-holder` (the composed owner, R4) |
| `helpDocs` | `help-welcome-paragraph` (the composed owner, R4) |
| `historyEntryState` | `help-welcome-paragraph` (same composition as `helpDocs`) |

Any other module returning an overlay channel is rejected with a named error
(`ApplyChannelError`, new in `steps/reducer.ts` beside the runner) and the patch
is not applied. This table is a static record in the runner, reviewed like
`decisionIRPaths`; a future composed effect extends the table in the same commit
that adds its owner module.

## QuestionModule (extended — `survey/types.ts`)

| Field | Change | Notes |
|---|---|---|
| `apply` | **added** | `(value: string \| string[] \| undefined, ctx: ApplyContext) => WorkingCopyPatch`. Pure: reads only `ctx`, writes no store (FR-001). `value` is the module's own recorded decision value in answer shape, as `mutate` received it. |
| `mutate` | **deleted** | superseded by `apply` (research R1). Its one implementation moves to `pb_standard_letters.apply` returning `{ ir: … }`. |
| `provides` / `requires` / `extract` / `validate` / `inputs` / `writes` / `outputs` / `renderer` / `fixtures` | unchanged | in particular **no new `requires` edges are added by 089** — composition data flow goes through `ctx.decisions`, so derived order and the parity tests cannot move (research R4). |

Modules gaining an `apply` (complete list — every other module in the four flows
deliberately has none):

| Module | `apply` returns | Decisions it composes |
|---|---|---|
| `track_choice` | `{}` always | — (setup effect is 092's) |
| `project_keyboard_id` | `{ identity }` | own value + `project-display-name` + the derived identity (language overlay via `identityLanguagePatch`) |
| `il_copyright_holder` | `{ attribution }` | `author-name`, `author-email`, own value (holder defaults to author name; `attribution: null` when no author name) |
| `pf_welcome_paragraph` | `{ helpDocs, historyEntryState? }` | all recorded `help-*` decisions via the `extractHelpDocs` composition; `{}` when the composition is `undefined`; `historyEntryState` only when a `help-history-entry` decision exists and `ctx.currentHistoryEntryState` is non-null |
| `pb_standard_letters` | `{ ir }` | own value only (the existing `mutate` body) |

## The runner (changed — `steps/reducer.ts`)

`applyDecisionEffects(result, deps)` replaces `routeAnswersThroughMutate`:

1. For each answer in `result.answers`: `mod = questionRegistry[answer.questionId]`;
   skip when `mod?.apply` is absent.
2. Build `ApplyContext` (deps supply `getWorkingIR`, the recorded `DecisionSet`,
   and the current history-entry state).
3. `patch = mod.apply(answer.value, ctx)` — a throw propagates (fail-fast, as
   with `mutate` today; never swallowed).
4. Channel authorization (table above), then the `ir` containment merge; only
   then are channels handed to the injected sink in channel order
   `ir → identity → attribution → helpDocs → historyEntryState`.

`MutateRequest` and `isMutateRequest` are deleted. `applyStepCompletion`'s
`isMutateRequest` branch is deleted; its step-id switch (marks/mechanisms/touch/
choose_base) is untouched — those are step effects, and gallery/step `apply`s are
090's work.

`ReducerDeps` gains:

| Dep | Type | Wired from |
|---|---|---|
| `applyWorkingCopyPatch` | `(patch: WorkingCopyPatch, writes: readonly IRPath[]) => void` | `StudioShell`/`StepHost`: performs the checked `ir` merge via `getWorkingIR`/`setWorkingIR`, then the overlay setters on `workingCopyStore` |
| `getDecisions` | `() => DecisionSet` | 088's `decisionStore` |
| `getHistoryEntryState` | `() => HistoryEntryState \| null` | `workingCopyStore` |

(The containment merge may equally live in the runner with the sink receiving a
fully-checked patch; the tasks fix the split so the merge logic stays in one
place — `reducer.ts` beside `applyMutatePatch`'s existing call, as today.)

## Selectors (new — `decisions/identitySelectors.ts`)

Pure functions over `DecisionSet`; thin zustand bindings over 088's
`decisionStore` next to them. Full rationale in research R6.

| Selector | Returns | Replaces |
|---|---|---|
| `deriveIdentityResult(decisions)` | `IdentityLiteResult \| null` | session `identityResult` + `extractIdentityLite` at the adapter |
| `deriveScaffoldSpec(decisions)` | `{ keyboardId: string; displayName: string } \| null` — `null` unless `authoring-track === "copy"` and both project decisions recorded | session `scaffoldSpec` + both `setScaffoldSpec` writes (project_name's set, track's adapt-null) |
| `deriveSurveyContext(decisions)` | `SurveyContext` (`{}` until identity exists) | stored session `surveyContext` + `contextFromIdentity` + `setSurveyContext` |
| `deriveIdentityResume(decisions)` | `SurveyPhaseResult \| null` | session `identityPhaseResult` + `setIdentityPhaseResult` |

`IdentityLiteResult` (`survey/identityLiteResult.ts`) and its derivation helpers
(`buildTargetBcp47`, `normalizeRegionSubtag`, `deriveScriptPrefill`) are reused,
not rewritten — the selectors feed them decision values instead of answers.

## Session store (changed — `stores/surveySessionStore.ts`)

Deleted: fields `identityResult`, `identityPhaseResult`, `scaffoldSpec`, and the
stored `surveyContext`, with setters `setIdentityResult`,
`setIdentityPhaseResult`, `setScaffoldSpec`, `setSurveyContext`. Everything else
in the store (traversal, `localBase`, sub-stage fields, and 088's remaining
removals) is untouched. The draft envelope's traversal slice
(`lib/draftPersistence.ts`) stops carrying the deleted fields — safe under 088's
DRAFT_VERSION 2, whose loader already maps v1 state onto decisions; no 089
version bump.

## Relationships

- One module → at most one `apply`; one composed effect → exactly one owner
  module (R4 table). A decision with no keyboard effect has either an explicit
  empty `apply` (track — because the spec names it) or no `apply` at all
  (every other no-effect module).
- `apply` reads decisions; it never writes them — recording is 088's completion
  path, which runs before the runner in the host's sequence
  (`recordPhase`/record → `applyDecisionEffects` → `applyStepCompletion` →
  `recordStepCompletion` → `advance`).
- Selectors read decisions; readers that used the session fields read selectors.
  No selector writes anything.
- `WorkingCopyPatch` channels are the *only* writes `apply` can express — a
  module that needs a sixth channel is a design change to this data model, not
  an implementation detail.
