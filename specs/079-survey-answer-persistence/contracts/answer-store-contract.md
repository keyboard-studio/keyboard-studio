# Contract: `surveyAnswerStore` and the answer-persistence API

**Feature**: [spec.md](../spec.md) (FR-001…FR-017, FR-030…FR-034, FR-040…FR-041) | **Decisions**:
[research.md](../research.md) R-01, R-02, R-03, R-04, R-08, R-09, R-10, R-12 | **Data model**:
[data-model.md](../data-model.md) §§1-6

All types here are studio-local (`packages/studio/src`). None of this touches
`@keyboard-studio/contracts` — not `AnswerType`, not `SurveyPhaseResult`, not `DecisionPayload`
(data-model.md's header constraint, unchanged).

## 1. Public surface — `stores/surveyAnswerStore.ts`

```ts
saveAnswer(stepId: StepId, answerId: AnswerId, a: Omit<SavedAnswer, "savedAt">): void;
setPosition(stepId: StepId, pos: string | null): void;
setStatus(stepId: StepId, s: StepStatus): void;
markScreenRecorded(stepId: StepId, screenId: ScreenId, hash: string): void;
reset(): void;
```

Full type shapes: [data-model.md §1](../data-model.md#1-surveyanswerstore-new-r-01).

### Call contract per method

| Method | Called from | Timing | Notes |
|---|---|---|---|
| `saveAnswer` | every question's change handler | synchronously, on the value change itself — **never** from an unmount or `Next` handler | FR-001/FR-002: an answer exists in durable state the instant it is given, whether or not the step finishes. This is what makes rapid Back/Forward safe by construction (spec Edge Cases: "the answer is saved when it is given, not when the author leaves"). |
| `setPosition` | the step's own runner/gallery, on navigating within the step | on every internal move | Replaces `stepWalkStore.cursors[stepId]` (FR-004). `lib/jumpToLocation.ts` also writes it on a jump that names a question — mirroring today's `useStepWalkStore.getState().setStepCursor(target.step, target.question)` at [jumpToLocation.ts:162](../../../packages/studio/src/lib/jumpToLocation.ts#L162). |
| `setStatus` | the step's gate logic (e.g. `computeConvenienceGate`) | when the step resolves its applicability | Carries `not-asked{reason, evidenceKey}` (FR-065) — see §5. |
| `markScreenRecorded` | `recordQuestionAnswers` (§3), same call | immediately after a successful `decisionLogStore.append` | Feeds the FR-040 "Next with no change records nothing" check via `lastRecorded[screenId]` hash comparison — a *duplicate* no-op check at the store layer, in addition to (not instead of) `decisionLogStore.append`'s own identical-value `null` return ([decisionLogStore.ts:293](../../../packages/studio/src/decisions/decisionLogStore.ts#L293)). |
| `reset` | **only** [StudioShell.tsx:1285](../../../packages/studio/src/StudioShell.tsx#L1285) and [WelcomeScreen.tsx:333](../../../packages/studio/src/components/WelcomeScreen.tsx#L333) | start-over / new project | FR-033. These are the exact two sites `useStepWalkStore.getState().reset()` is called today (verified: [StudioShell.tsx:1285](../../../packages/studio/src/StudioShell.tsx#L1285) inside `handleStartOver`, [WelcomeScreen.tsx:333](../../../packages/studio/src/components/WelcomeScreen.tsx#L333) inside "Continue as guest"). `surveyAnswerStore.reset()` is added as a **third** call at both sites, alongside the existing `useStepWalkStore.getState().reset()` — it does not replace that call, since `stepWalkStore` still owns the derived `walks`. A test enumerates exactly these two call sites and fails if a third appears (mirroring [data-model.md §1](../data-model.md#1-surveyanswerstore-new-r-01)'s "a test asserts the call-site set"). |

### State invariants

1. **No answer exists only in component state.** Every `SavedAnswer` write goes through
   `saveAnswer`; no step may hold an answer in `useState` that is not also mirrored here (FR-001,
   FR-007). A step's `persistence` manifest declaration (§4) names which mechanism it uses;
   `"answer-store"` steps are checked by the manifest test against actually calling `saveAnswer`.
2. **Saved answers are never overwritten by re-proposal.** Only an author's confirm or overturn
   calls `saveAnswer` again (R-03). A shape change alone must never call it — reconciliation is a
   pure read (`reconcile()`, §2), not a write.
3. **`stage: "draft"` vs. `"confirmed"`** tracks FR-008: a survey answer is a draft until the
   author's `Next` confirms it (`recordQuestionAnswers` transitions it to `"confirmed"` in the same
   call that applies the keyboard effect, R-05). A draft answer is still restored verbatim on
   navigation away and back (FR-003) — draft-vs-confirmed governs when the *keyboard* changes, not
   whether the *answer* is kept.
4. **`evidenceKey: null` means "depends on nothing earlier."** Identity, track, project_name, help
   answers always carry `null` (R-02's table). A non-null key is only ever compared for equality,
   never parsed — evidence keys are opaque fingerprints, not structured data other code branches on.
5. **One `StepAnswers` slot per step, one `SavedAnswer` per `AnswerId` within it.** No cross-step
   merge happens inside this store — see §5 for how a *phase* slot's plurality (multiple steps
   sharing phase C) is resolved, which is a `workingCopyStore` concern, not this store's.
6. **`reset()` clears the whole store, not per-step.** There is no partial/per-step reset method;
   a step that needs its own answers cleared (e.g. the alphabet carry-over reset, §6) does so by
   overwriting its own `StepAnswers` entry via repeated `saveAnswer`/`setStatus` calls, never by
   reaching into this store's internals.

## 2. `reconcile()` — the re-proposal view (R-03, FR-012, FR-014)

```ts
function reconcile<V>(
  saved: SavedAnswer | undefined,
  currentKey: EvidenceKey,
  proposal: V,
  adjust?: (savedValue: V, proposal: V) => V,
): AnswerView<V>;
```

- **Pure function.** No store reads, no store writes — every step calls it with its own saved
  answer, current evidence key, and freshly computed proposal, and renders whatever `AnswerView` it
  returns.
- **`state: "current"`**: `saved.evidenceKey === currentKey`. Render `saved.value` unmodified.
- **`state: "reproposed"`**: `saved !== undefined && saved.evidenceKey !== currentKey`. Render
  `adjust ? adjust(saved.value, proposal) : proposal`, flagged with a `ReproposalReason` ([data-model.md §3](../data-model.md#3-the-re-proposal-view-r-03)).
  The saved answer itself is **untouched** — `reconcile` never calls `saveAnswer`.
- **`state: "proposed"`**: `saved === undefined`. Render `proposal`, unflagged.
- **Callers must not special-case "changed back to the original value."** `reconcile` handles it for
  free: if `currentKey` returns to the value it had when `saved.evidenceKey` was stamped, the answer
  is `"current"` again with no flag (FR-014) — because the key, not a history of changes, is what
  is compared.
- **Confirming or overturning a `"reproposed"` view** calls `saveAnswer` with the *current* key
  stamped, which is what clears the flag on the next `reconcile` call (state table in
  [data-model.md §3](../data-model.md#3-the-re-proposal-view-r-03)).

## 3. `recordQuestionAnswers` — the decision-recorder dependency (R-04, FR-040)

```ts
recordQuestionAnswers(stepId: StepId, screenId: ScreenId, answers: SurveyAnswer[]): void;
```

- Added to the decision-recorder deps alongside the existing `recordSurveyAnswers` /
  `recordEditorStep` created by `createDecisionRecorder` ([research.md F-8](../research.md#f-8-decision-record)).
- **Call sites** (every forward `Next` within a step, per R-04):
  - `SurveyRunner`'s question `Next` (identity, track, project_name, help)
  - a marks station's `Next` (each station calls this on its own `Next`, not only at series
    completion — this is what stops the stacking answers being discarded, F-1)
  - a characters sub-screen's `Next`
  - the single screen of a step with no internal stations, at that step's own completion
- **Routes through the existing `decisionLogStore.append`** ([decisionLogStore.ts:293](../../../packages/studio/src/decisions/decisionLogStore.ts#L293)) —
  no new `DecisionPayload` kind, no new supersession model (053 untouched). `append` already
  returns `null` for an identical value and supersedes a changed one; `recordQuestionAnswers` relies
  on that rather than re-implementing the no-op/supersede check, and additionally calls
  `markScreenRecorded` (§1) so the *screen*-grained hash used for the journey strip's grouping
  (`recordedScreenOf`, [data-model.md §6](../data-model.md#6-work-to-do-r-10-and-journey-strip-marks-r-11)) stays in sync.
- **`screenId` is stamped on every `SurveyAnswer` payload it appends**, populating
  `recordedScreenOf[entryId] = screenId` ([data-model.md §6](../data-model.md#6-work-to-do-r-10-and-journey-strip-marks-r-11)) — this is the
  only mechanism the journey strip contract (see
  [journey-strip-contract.md §4](journey-strip-contract.md#4-screen-grain-1795--1789--fr-060)) uses to
  group several recorded answers onto one question mark. A caller that does not pass `screenId`
  cannot satisfy #1795; there is no fallback grouping at write time, only a read-time degrade for
  pre-feature entries.
- **`recordStepCompletion` stays**, and becomes idempotent by construction: by the time a step
  completes, every one of its answers was already appended via `recordQuestionAnswers` at its own
  `Next`, so completion re-recording the same values is a `null`-returning no-op at the
  `decisionLogStore` layer (R-04, D-6's decision-record half — the keyboard-effect half of D-6 is
  the separate `mark-guards.ts` fix, engine-owned, not in this store's scope).
- **Marks answers use existing `AnswerType`s only** (R-04's table: `char-list`, `select`,
  `boolean`) — this store introduces no new `AnswerType`, honoring the locked `Pattern` contract
  (`contracts/src/pattern.ts:34`).

## 4. Manifest sidecar — `persistence` declaration (R-12, FR-007, FR-050)

```ts
type PersistenceDeclaration =
  | "answer-store" | "phase-b-draft" | "working-copy"
  | { exempt: string };   // non-empty written justification, FR-007

interface StepBase {
  evidence?: EvidenceDeclaration;   // R-02, steps/types.ts
  persistence: PersistenceDeclaration;   // REQUIRED
}
```

- **Required, not optional** — every entry in `STEP_MANIFEST` must declare one. A vitest over the
  manifest fails the build if any step lacks it, or if an `exempt` variant's string is empty
  (R-12). This is what makes SC-007 ("unjustified exemptions: zero") a failing test rather than a
  review checklist.
- **`"answer-store"`** means the step's answers live in `surveyAnswerStore` per this contract.
  **`"phase-b-draft"`** names the characters step's existing precedent (`phaseBDraftStore`, §6).
  **`"working-copy"`** names the base/carve/mechanisms/touch steps, believed compliant per
  research.md's assumption — this declaration is what FR-050's classification table cross-checks
  against, not a new persistence path this feature builds.
- The [contracts/step-classification.md](step-classification.md) table (a separate artifact this
  feature also produces, tracked as R-12's FR-050 deliverable — not written by this doc) lists every
  manifest id against its declaration and evidence; a test cross-checks that the table names every
  manifest id and vice versa.

## 5. `not-asked` status and `selectWorkToDo()` (R-09, R-10, FR-064…FR-068)

```ts
type StepStatus =
  | { kind: "in-progress" }
  | { kind: "finished" }
  | { kind: "not-asked"; reason: NotAskedReason; evidenceKey: EvidenceKey };
```

- `setStatus(stepId, { kind: "not-asked", ... })` is called when a step's gate resolves
  `not-applicable` (R-09) — **never** for `unknown` (an `unknown` gate must render the step and ask,
  FR-064; it never reaches `setStatus` with `not-asked`).
- A `not-asked` status records **no answer** — `StepAnswers.answers` for that step stays whatever
  it was (typically empty). `not-asked` is a status, not a value in the answer map, so a downstream
  reader (carve) can distinguish "recorded emptiness" (an answered step that retained nothing) from
  "never asked" by checking `status.kind` first (FR-065's "a downstream step MUST treat 'not asked'
  differently from an answer" — carve's `neededSet` union must read this status, not default to
  treating an absent `retainedConvenienceChars` as "keep none").
- `setStatus` with `not-asked` appends **no** `decisionLogStore` entry (FR-065, unchanged 053
  model) — the trail and journey strip render "passed — {reason}" from this status field directly,
  not from a record entry (R-09's noted open risk: if the decision *record* itself must show the
  skip, that needs an additive `DecisionPayload` kind, a contracts change out of this store's scope
  — flagged for escalation, not resolved here).
- When the gate later resolves `applies` (evidence changed), `selectWorkToDo()` (below) surfaces the
  step as a `"now-applicable"` work item without touching `setStatus` itself — the stored
  `not-asked` status stays until the author actually answers the step, at which point the ordinary
  `saveAnswer` + `setStatus({kind:"finished"})` path applies (FR-067: the skip is a shape change,
  handled as work to do, never as an automatic re-ask).

```ts
function selectWorkToDo(): Record<StepId, WorkItem[]>;
```

- **Pure selector, never persisted** (R-10). Combines, per [data-model.md §6](../data-model.md#6-work-to-do-r-10-and-journey-strip-marks-r-11):
  (a) saved answers whose `evidenceKey` no longer matches current evidence (via `reconcile`'s
  `"reproposed"` state), (b) gallery items unaccounted for, reusing `useAccountedForGate()` counts —
  the same source [UnfinishedGalleryIndicator.tsx](../../../packages/studio/src/components/UnfinishedGalleryIndicator.tsx) already
  uses, and (c) steps whose stored status is `not-asked` but whose live gate now says `applies`.
- Read by three consumers: the journey strip's badge rendering (see
  [journey-strip-contract.md](journey-strip-contract.md)), a step's in-step "flagged earlier
  questions" list (FR-013), and the `Next` gate that blocks passing an unresolved flagged question
  before the author's position.
- **Nothing new is persisted by this selector.** If `selectWorkToDo()`'s output and the journey
  strip's badges ever disagree, that is a bug in one of the selector's three inputs, not a
  synchronization problem between a derived value and a stored one — there is no stored badge state
  to drift.

## 6. `DurableDraft.surveyAnswers?` — envelope field and restore rules (FR-030…FR-032)

```ts
interface DurableDraft {
  // ...existing optional fields (phaseBDraft?, decisionRecord?, keyEditOverlay?, ...)
  surveyAnswers?: SurveyAnswerSnapshot;   // new, R-01
}
```

Follows the field-addition policy already established for `phaseBDraft?` / `decisionRecord?` /
`keyEditOverlay?` / `seededProposals?` / `invisibleDecisions?`
([draftTypes.ts:100-133](../../../packages/studio/src/lib/draftTypes.ts#L100-L133)): **optional field, tolerant reader, no
`DRAFT_VERSION` bump.**

### Tolerant restore, precedent: `restorePhaseBDraftSnapshot`

The precedent is [restorePhaseBDraftSnapshot](../../../packages/studio/src/lib/draftPersistence.ts#L877-L907)
([draftPersistence.ts:877-907](../../../packages/studio/src/lib/draftPersistence.ts#L877-L907)): rebuild the snapshot field by field
from `isPlainRecord(raw) ? raw : {}`, filtering each field's members against its own type guard
(e.g. `v === "letter" || v === "mark"` for `declaredRoles`), never inventing a value for a field
that was absent or malformed. `restoreSurveyAnswerSnapshot` must follow the identical shape:

- An unknown step id is **kept verbatim** (forward-compat — a step added after this draft was
  written should not silently drop a later-renamed id's data if the rename round-trips).
- A malformed `SavedAnswer` (wrong `answerType`, non-string `screenId`, etc.) is **dropped**, never
  guessed at — the step then shows its live proposal for that one answer id, per FR-032 ("Any
  answer that draft never saved MUST fall back to its proposal, and the author MUST NOT be shown an
  answer they never gave").
- A **missing `surveyAnswers` field entirely** (a pre-feature draft) produces an empty store — every
  step renders its proposal, satisfying FR-032's third acceptance scenario (US4-3) directly: "it
  loads without error... nothing is invented."
- `reset()` is not called during restore — restore is a direct `set()` of the rebuilt snapshot into
  the store, mirroring how `applyPhaseBDraftSnapshot` sets `phaseBDraftStore`'s state wholesale
  rather than calling its `reset()` first.

### Autosave — rides the existing single timer (D3 scope note, FR-034)

- `installDraftAutosave` ([draftPersistence.ts:1309-1375](../../../packages/studio/src/lib/draftPersistence.ts#L1309-L1375)) currently
  subscribes three stores to one 500 ms `setTimeout` (`AUTOSAVE_DEBOUNCE_MS`):
  `useWorkingCopyStore`, `useSurveySessionStore`, `usePhaseBDraftStore`
  ([draftPersistence.ts:1357-1359](../../../packages/studio/src/lib/draftPersistence.ts#L1357-L1359)).
- `surveyAnswerStore` is added as a **fourth subscription on that same timer** — `const
  unsubscribeSurveyAnswers = useSurveyAnswerStore.subscribe(scheduleSave);`, torn down alongside the
  other three in the returned cleanup.
- **No second timer.** `AUTOSAVE_DEBOUNCE_MS` is explicitly out of D3's scope per [CLAUDE.md](../../../CLAUDE.md)
  ("D3 governs the *validation* cycle... It does not reach persistence or network-sync timers"),
  and FR-034 explicitly permits reusing the existing autosave mechanism. A new debounce timer for
  answer-saving would need km-validator sign-off per this repo's convention and is not what this
  contract calls for.
- The orphan guard at [draftPersistence.ts:1352](../../../packages/studio/src/lib/draftPersistence.ts#L1352)
  (`resolveActiveProjectKey() !== projectKey`) applies unchanged to the fourth subscription — no
  special-casing needed, since the guard fires per-tick, not per-store.

## 7. `stepWalkStore` compatibility selectors (R-01 migration)

`stepWalkStore.answerDrafts` and `stepWalkStore.cursors` move into `surveyAnswerStore`; `walks`
stays in `stepWalkStore`, unpersisted, exactly as today ([data-model.md §1 migration table](../data-model.md#migration-from-stepwalkstore)).

| Old reader | Old source | New source | Compatibility shape |
|---|---|---|---|
| [`peekAnswerDraft(stepId)`](../../../packages/studio/src/stores/stepWalkStore.ts#L199-L201) | `stepWalkStore.answerDrafts[stepId]` | `surveyAnswerStore.steps[stepId].answers` | Keep the exported function name and signature (`(stepId: string) => AnswerDraft | undefined`) as a thin selector over the new store, so `SurveyRunner`'s state initializer ([stepWalkStore.ts:193-198](../../../packages/studio/src/stores/stepWalkStore.ts#L193-L198)'s doc comment: "needs them before its first render") does not need its own call-site rewritten beyond the import path. The returned shape must stay `Record<questionId, string | string[]>` — a mapping step, not a type change, since `SavedAnswer.value` carries more than a bare string/string[] (origin, stage, evidenceKey); the compat selector projects `.value` out of each `SavedAnswer`. |
| [`peekStepCursor(stepId)`](../../../packages/studio/src/stores/stepWalkStore.ts#L189-L191) | `stepWalkStore.cursors[stepId]` | `surveyAnswerStore.steps[stepId].position` | Same treatment: keep the function name/signature, re-point its body. |
| the footer (`walks`, `cursors` reads at [StudioFooter.tsx:109-110](../../../packages/studio/src/components/StudioFooter.tsx#L109-L110)) | `useStepWalkStore((s) => s.walks)` / `(s) => s.cursors` | `walks` stays on `stepWalkStore`; the `cursors` read moves to `useSurveyAnswerStore` (per-step `position`) | `buildProgressDots`'s `stepCursors` input parameter name and shape are unchanged — only the store the caller reads it from moves, per [progressDots.ts:176-177](../../../packages/studio/src/decisions/progressDots.ts#L176-L177)'s existing `readonly stepCursors?: Readonly<Record<string, string>>` contract. |
| `jumpToLocation.ts`'s `useStepWalkStore.getState().setStepCursor(target.step, target.question)` ([jumpToLocation.ts:162](../../../packages/studio/src/lib/jumpToLocation.ts#L162)) | `stepWalkStore.setStepCursor` | `useSurveyAnswerStore.getState().setPosition(target.step, target.question)` | The call site changes which store it targets; the "write the position before the remount reads it" ordering constraint documented at [jumpToLocation.ts:150-164](../../../packages/studio/src/lib/jumpToLocation.ts#L150-L164) is unchanged and must be preserved — position is still written before `navigateTo`. |

`SurveyRunner.tsx`'s writers of `answerDrafts` ([:447-455, :558-585](../../../packages/studio/src/survey/SurveyRunner.tsx)) move to
call `saveAnswer` directly rather than `setAnswerDraft` — this is not a compatibility-selector case,
since the write side changes shape (`SavedAnswer` carries more fields than the old `AnswerDraft`
value), only the read side above is preserved as a thin selector.

## 8. Non-goals / explicit boundaries

- This store does not decide *when* the keyboard is recompiled — that stays
  `useWorkingCopyTransform` / `useKeyboardArtifact`, inside the single D3 cycle (unchanged, R-05).
- This store does not own phase-slot merge (`phaseAnswersByStep`, R-08) — that sidecar lives in
  `workingCopyStore`, not here, because it is a `WorkingCopySnapshot` concern (D-4), distinct from
  the per-step draft answers this store owns.
- This store introduces no `zod` schema of its own (matching the envelope's existing hand-rolled
  validation, [research.md F-7](../research.md#f-7-draft-envelope): "The envelope has no zod schema.
  Its validation is hand-rolled.") — restore validation here follows the same hand-rolled,
  type-guard-per-field style as `restorePhaseBDraftSnapshot`, not a new validation approach.

## 9. Test matrix

| Concern | Suggested coverage |
|---|---|
| `saveAnswer` synchronicity, no unmount-loss | unit test: call `saveAnswer`, unmount-simulate (no-op for a store), assert value still reads back |
| `reconcile()` state transitions | unit test per row of [data-model.md §3](../data-model.md#3-the-re-proposal-view-r-03)'s transition diagram, including "changed back to original ⇒ no flag" (FR-014) |
| `recordQuestionAnswers` no-op on unchanged `Next` | unit test asserting `decisionLogStore.append` returns `null` and `markScreenRecorded`'s hash comparison short-circuits |
| `reset()` call-site enumeration | a grep-based or reflection-based test asserting only `StudioShell.tsx` and `WelcomeScreen.tsx` call `useSurveyAnswerStore.getState().reset()` |
| Restore tolerance | unit test: malformed answer dropped, unknown step id kept, missing field ⇒ empty store (FR-032, mirrors `restorePhaseBDraftSnapshot`'s own test style) |
| `not-asked` vs. answered vs. never-reached | unit test on `selectWorkToDo()` distinguishing all three for Convenience letters (FR-065, FR-066 — same-signal test across defaults and ask-me paths) |
| Autosave subscription | extend the existing `installDraftAutosave` test to assert a fourth unsubscribe function is called on teardown, and that `AUTOSAVE_DEBOUNCE_MS` is unchanged (no second timer introduced) |
