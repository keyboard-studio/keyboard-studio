---

description: "Task list for spec 079 — survey answers persist per question"
---

# Tasks: Survey answers persist per question — navigation never undoes a decision

**Input**: Design documents from [specs/079-survey-answer-persistence/](.)

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md) (F-1…F-10, R-01…R-14),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: REQUIRED. The spec mandates them (FR-051 revisit test per fixed step, FR-052 shape-change
test per step with evidence, FR-053 reload test, FR-054 mark-guards idempotence, R-12 manifest gate).
Write each story's tests first and confirm they fail before implementing.

**Organization**: grouped by user story. Paths are relative to the repo root. `studio/` below means
`packages/studio/`.

**Commit cadence** (CLAUDE.md "multi-phase specs"): one commit per phase, pushed to
`km/079-survey-answer-persistence` when that phase's gates are green. Message names the tasks it closes
(e.g. `spec 079 T022-T036`). Out-of-scope repairs get their own commit. Verify the upstream with
`git rev-parse --abbrev-ref --symbolic-full-name '@{u}'` before the first push.

**Phase gates** (every phase): `pnpm build` (studio typecheck needs engine built) → `pnpm typecheck` →
`pnpm --filter @keyboard-studio/studio test` → `pnpm --filter @keyboard-studio/engine test` (when the
engine is touched) → `pnpm lint`. Never run bare `vitest` at the root.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1…US4 from [spec.md](spec.md)

---

## Phase 1: Setup

**Purpose**: confirm a green baseline and re-verify the plan-time greps the design relies on.

- [X] T001 Confirm branch `km/079-survey-answer-persistence` is checked out and clean, then run `pnpm build`, `pnpm --filter @keyboard-studio/studio test` and `pnpm --filter @keyboard-studio/engine test` to record a green baseline (note any pre-existing failures in the phase commit message, do not fix them here)
- [X] T002 [P] Re-run the R-08 grep for readers of stored `phaseResults[].answers` under `packages/studio/src` (expected: only `studio/src/stores/workingCopyStore.ts` inside `recordPhase` and `studio/src/survey/invisibles/InvisiblesStep.tsx` `writingDirectionFrom`); if any new reader appears, list it in T008's test and adjust T018
- [X] T003 [P] Re-run the R-01 grep for every writer/reader of `answerDrafts`, `setAnswerDraft`, `setStepCursor`, `peekStepCursor`, `peekAnswerDraft`, `cursors` (expected non-test sites: `studio/src/survey/SurveyRunner.tsx`, `studio/src/editors/assignLoop/MechanismGallery.tsx`, `studio/src/editors/assignLoop/TouchGallery.tsx`, `studio/src/hooks/useCharWalkPosition.ts`, `studio/src/lib/jumpToLocation.ts`, `studio/src/components/StudioFooter.tsx`); this list is T013's worklist

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: the store, envelope field, manifest declarations, evidence/reconcile, phase-slot ownership
and the per-Next recorder. Every user story depends on this phase.

**Closes**: FR-001, FR-002, FR-007 (gate), FR-011 (declarations), FR-030, FR-031, FR-033, FR-034, FR-050 scaffolding.

### Tests first (Foundational)

- [X] T004 [P] Write `studio/src/stores/surveyAnswerStore.test.ts`: `saveAnswer` is synchronous and readable immediately (FR-001), saving does not depend on `status.kind === "finished"` (FR-002), `setPosition`/`setStatus`/`markScreenRecorded` round-trip, `recordedScreenOf` map writes, `reset()` clears everything; plus a call-site test that scans `studio/src` source text and asserts `useSurveyAnswerStore.getState().reset()` appears only in `studio/src/StudioShell.tsx` (`handleStartOver`) and `studio/src/components/WelcomeScreen.tsx` ("Continue as guest") (FR-033)
- [X] T005 [P] Write `studio/src/steps/evidence.test.ts`: every `keyFn` in data-model.md §2 (`alphabet`, `marks` incl. per-answer attachment `has(M)|has(B)|attested(B+M)`, class/mark treatment, stack, output form, input order; `punctuation`; `invisibles`; `convenience`), and a `reconcile()` case per transition in data-model.md §3: none→`proposed`, key match→`current`, key mismatch→`reproposed` with `adjust` applied, key restored→`current` with no flag (FR-014), confirm re-stamp→`current`; a saved answer whose subject is gone from current evidence is `inactive` (not reproposed, not deleted); restoring the evidence returns it as `current` with no flag; assert `reconcile` never mutates `saved`
- [X] T006 [P] Write `studio/src/steps/manifest.persistence.test.ts` (R-12, FR-007, SC-007): every `STEP_MANIFEST` entry has `persistence`; an `{ exempt }` has a non-empty trimmed string; parse the table in `specs/079-survey-answer-persistence/contracts/step-classification.md` and assert its step ids equal the manifest ids (both directions) and each row's "Declaration after 079" matches the manifest value. Name the describe block `stepClassification` so quickstart's `test -- stepClassification` filter hits it
- [X] T007 [P] Extend `studio/src/lib/draftPersistence.test.ts`: `restoreSurveyAnswerSnapshot` keeps unknown step ids verbatim, drops a malformed `SavedAnswer` (bad `answerType`, non-string `screenId`, bad `origin`/`stage`), yields an empty store when `surveyAnswers` is absent (FR-032); `installDraftAutosave` teardown calls a fourth unsubscribe; `AUTOSAVE_DEBOUNCE_MS` is still 500 and only one `setTimeout` is scheduled per burst across all four stores (FR-034, D3)
- [X] T008 [P] Extend `studio/src/stores/workingCopyStore.test.ts` (D-4, FR-031): record invisibles then convenience into phase C with distinct `stepId`s and assert invisibles' answers survive; a step re-recording replaces only its own list (fewer answers leaves no stale ones); derived `phaseResults.C.answers` equals the concatenation in manifest order with `"legacy"` first; a snapshot without `phaseAnswersByStep` loads its existing `answers` under `"legacy"`
- [X] T009 [P] Create `studio/src/decisions/createDecisionRecorder.test.ts`: `recordQuestionAnswers` appends via `decisionLogStore.append`, then `captureAtBoundary` → `attachImpact`; a repeat with identical answers appends nothing and does not re-capture; a changed answer supersedes (one new entry, chain intact, FR-040/FR-041); an intermediate boundary with no source change attaches `{state: "none"}`; every appended entry id lands in `recordedScreenOf` with the passed `screenId`; `recordStepCompletion` after per-Next recording appends nothing new

### Implementation (Foundational)

- [X] T010 Create `studio/src/stores/surveyAnswerStore.ts` per data-model.md §1 and contracts/answer-store-contract.md §1: types `SavedAnswer`, `StepStatus`, `StepAnswers`, `SurveyAnswerSnapshot`; state `steps` plus `recordedScreenOf: Record<entryId, ScreenId>`; actions `saveAnswer`, `setPosition`, `setStatus`, `markScreenRecorded`, `setRecordedScreen`, `reset`; export `getSurveyAnswerSnapshot()` and `applySurveyAnswerSnapshot()`. `AnswerType` is an `import type` from `@keyboard-studio/contracts`. No zod
- [X] T011 Add `useSurveyAnswerStore.getState().reset()` beside the existing `useStepWalkStore.getState().reset()` in `studio/src/StudioShell.tsx` (`handleStartOver`) and `studio/src/components/WelcomeScreen.tsx` ("Continue as guest") — no other call site (FR-033)
- [X] T012 Move answers and cursors out of `studio/src/stores/stepWalkStore.ts`: delete `answerDrafts`/`cursors` state and their setters, keep `walks`; re-point `peekAnswerDraft(stepId)` (project `.value` of each `SavedAnswer`, same return shape) and `peekStepCursor(stepId)` (reads `position`) at `surveyAnswerStore`; rewrite the header comment so "never persisted" is true of everything it still holds; update `studio/src/stores/stepWalkStore.test.ts` accordingly
- [X] T013 Migrate every cursor writer/reader from T003's list to `surveyAnswerStore`: `setPosition` in `studio/src/editors/assignLoop/MechanismGallery.tsx`, `studio/src/editors/assignLoop/TouchGallery.tsx`, `studio/src/hooks/useCharWalkPosition.ts`; `studio/src/lib/jumpToLocation.ts:162` writes `setPosition(target.step, target.question)` **before** `navigateTo` (keep the ordering comment); `studio/src/components/StudioFooter.tsx:109-110` reads positions from `useSurveyAnswerStore` and passes them as the unchanged `stepCursors` input of `buildProgressDots`. Update `MechanismGallery.test.tsx`, `StudioShell.test.tsx` and `StudioFooter.a11y.test.tsx` store setup mechanically
- [X] T014 Add `surveyAnswers?: SurveyAnswerSnapshot` to `DurableDraft` in `studio/src/lib/draftTypes.ts` (no `DRAFT_VERSION` bump); in `studio/src/lib/draftPersistence.ts` write it on save, add `restoreSurveyAnswerSnapshot` modelled on `restorePhaseBDraftSnapshot` (:877-907) and apply it with a direct `set()` (no `reset()`), and add `useSurveyAnswerStore.subscribe(scheduleSave)` as the fourth subscription in `installDraftAutosave` with teardown (makes T007 pass)
- [X] T015 Add `EvidenceDeclaration`, `EvidenceKeyFnId` and the required `persistence: PersistenceDeclaration` to `StepBase` in `studio/src/steps/types.ts` (data-model.md §2)
- [X] T016 Declare `persistence` (and `evidence` where R-02 lists one) on every entry in `studio/src/steps/manifest.ts`, exactly matching the "Declaration after 079" column of `specs/079-survey-answer-persistence/contracts/step-classification.md` (`package` gets the written `{ exempt }`; `characters` declares `phase-b-draft` with a same-line comment noting its sub-screen position lives in the answer store); follow any step whose entry is built in another module (makes T006 pass)
- [X] T017 [P] Create `studio/src/steps/evidence.ts`: pure key functions (`alphabetKey`, `marksKey` + per-answer marks keys, `punctuationKey`, `invisiblesKey`, `convenienceKey`) taking plain inputs, not stores, plus a thin `currentEvidence(stepId)` reader; and `reconcile()` / `AnswerView` / `ReproposalReason` per contracts/answer-store-contract.md §2 (makes T005 pass)
- [X] T018 Implement per-step phase ownership in `studio/src/stores/workingCopyStore.ts`: `recordPhase(result, opts?: { stepId })` keeps `phaseAnswersByStep`, derives `phaseResults[p].answers` as the ordered concatenation, and routes `recordAssignments` / `unflagCharForSequence` through a fixed owner id; persist the sidecar as an optional `WorkingCopySnapshot` field in `studio/src/lib/persistWorkingCopy.ts` with the `"legacy"` fallback on load (makes T008 pass)
- [X] T019 Pass `stepId` to every `recordPhase` call in `studio/src/components/StepHost.tsx` (and any direct caller found by T002)
- [X] T020 Add `recordQuestionAnswers(stepId, screenId, answers)` to the recorder built by `studio/src/decisions/createDecisionRecorder.ts`: append each answer through `decisionLogStore.append`, then `snapshotter.captureAtBoundary()` → `attachImpact`, then `markScreenRecorded` and `setRecordedScreen` for each appended entry id; make `recordStepCompletion` a no-op for answers already appended; wire it into `studio/src/decisions/createStudioDecisionRecorder.ts` and expose it to steps through `StepHost` (makes T009 pass)
- [X] T021 In `studio/src/components/StepHost.tsx`, record a single-screen step's answers at its completion through `recordQuestionAnswers(stepId, stepId, answers)` (screenId = stepId), so Invisible characters' one-answer-per-candidate Next is stamped with one screen (prerequisite for #1795)

**Checkpoint**: gates green; commit `feat(studio): 079 answer store, evidence keys, per-step phase slot, per-Next recorder` (spec 079 T001-T021).

---

## Phase 3: User Story 1 — Look back and come back with nothing lost (P1) — MVP

**Goal**: every step keeps its answers and position across leaving and returning, finished or not;
re-completing an unchanged step changes nothing. Closes D-1, D-2, D-6, #1787.

**Independent test**: per step, answer away from proposals without finishing, go Back one or more steps
and forward with no change, assert every answer and the position are unchanged (quickstart US1).

### Tests first (US1)

- [X] T022 [P] [US1] Extend `packages/engine/src/pattern-apply/mark-guards.test.ts` (FR-054, D-6): applying the same worklist twice yields byte-equal emitted `.kmn`; a worklist that had blocked pairs followed by one with none leaves no `generated_marks_guard` group, rules or stores
- [X] T023 [P] [US1] Extend `studio/src/survey/marks/MarksSeriesStep.test.tsx` with a revisit test modelled on `PunctuationStep.test.tsx:624`: un-tick two attachments, change a class treatment, set input order explicitly, change stacking, advance to station 3; unmount/remount with the same alphabet; assert every `surveyAnswerStore.steps.marks.answers` value and `position` are unchanged and the rendered controls match (#1787 scenario 1, FR-003, FR-004)
- [X] T024 [P] [US1] Same file: each station Next calls `recordQuestionAnswers` with `marks.<station>.<subject>` ids and existing `AnswerType`s (attachments `char-list`, treatments/input order/output form `select`, stacking `boolean`, stacks `char-list`); intermediate station Nexts do not apply mark guards; the final station's Next applies them once (R-04, R-05)
- [X] T025 [P] [US1] Extend `studio/src/survey/convenience/ConvenienceCharsStep.test.tsx`: un-tick two letters, unmount, remount with the same evidence, assert they are still un-ticked (US1 scenario 2)
- [X] T026 [P] [US1] Create `studio/src/survey/SurveyRunner.persistence.test.tsx`: for identity, track, project_name and help, give an answer on question 2 without finishing, unmount/remount, assert the answer and the current question are restored; Next records once, a second Next with no change records nothing, a changed answer supersedes (FR-040)
- [X] T083 [P] [US1] Extend `studio/src/survey/SurveyRunner.persistence.test.tsx` and `studio/src/survey/marks/MarksSeriesStep.test.tsx` (FR-003, 057 FR-031): a `jumpToLocation` deep link to a question of a never-finished step lands on the saved answer and position, not a proposal; switching the studio tab away and back keeps the draft answer and does not record it (FR-040)
- [X] T027 [P] [US1] Extend `studio/src/survey/invisibles/InvisiblesStep.test.tsx` and `studio/src/survey/punctuation/PunctuationStep.test.tsx` with a leave-and-return test that also asserts the phase-C slot still holds invisibles' answers after convenience records (FR-051, D-4)
- [X] T028 [P] [US1] Extend `studio/src/components/StepHost.test.tsx` (SC-005, FR-006, US1 scenario 4): revisit a finished marks step and a finished single-screen step, complete again with no change, assert zero new decision entries, no stale consequence, and an unchanged working-copy `.kmn`
- [X] T029 [P] [US1] Revisit tests for the "verify by revisit test" rows of contracts/step-classification.md: choose_base (`studio/src/components/StepHost.test.tsx` or the base picker's own test), carve (`studio/src/editors/carve/CarveGalleryV2.test.tsx`), touch_seed_source (its step test); a failure is either fixed in this phase or recorded for T072
- [X] T081 [P] [US1] Extend `studio/src/survey/CharactersStep.test.tsx` (FR-051, FR-004): on the build-list path, advance to sub-screen 2, unmount and remount with the same evidence, and assert `position` and the rendered sub-screen are unchanged; on the manual path, answer a question without finishing, leave and return, and assert the answer and the current question are restored; each sub-screen Next calls `recordQuestionAnswers("characters", subScreenId, …)` once, and a repeat Next with no change records nothing

### Implementation (US1)

- [X] T030 [US1] Fix `applyMarkGuards` in `packages/engine/src/pattern-apply/mark-guards.ts`: strip the previously generated group, rules and stores before the "nothing to block or unwrap" early return (:151-153); return early only when there was also nothing to strip (R-06; makes T022 pass). Own commit: `fix(engine): mark-guards strips stale guards when the worklist empties`
- [X] T031 [US1] Store-back `studio/src/survey/SurveyRunner.tsx`: every change handler (:447-455, :558-585) calls `saveAnswer(stepId, questionId, { value, answerType, origin: "confirmed", stage: "draft", evidenceKey: null, screenId: questionId })`; the initializer reads `peekAnswerDraft`/`peekStepCursor`; question navigation calls `setPosition`; each forward Next calls `recordQuestionAnswers(stepId, questionId, …)` and flips that answer's `stage` to `"confirmed"` (makes T026 pass)
- [X] T032 [US1] Store-back `studio/src/survey/marks/MarksSeriesStep.tsx`: replace the `useState` for `attachmentChecked`, `treatment`, `orderExplicitlySet`, `outputForm`, `stackingAllowed`, `stacksConfirmed` with reads of `surveyAnswerStore.steps.marks` passed through `reconcile()` against the per-answer keys from `steps/evidence.ts` (render `view.value`; flag UI lands in US3); every change calls `saveAnswer` with the current per-answer key; `stationIndex` becomes `position` and the `alphabetKey` reset-to-0 effect (:398-400) is removed; remove the re-seed effects (makes T023 pass)
- [X] T033 [US1] In the same file, give each station's Next a `recordQuestionAnswers("marks", stationId, …)` call with the R-04 ids and types, including the stacking answers; keep the keyboard effect on the final station only, and route `complete()` so `studio/src/steps/reducer.ts:348-370` applies mark guards once (makes T024 pass)
- [X] T034 [US1] Store-back `studio/src/survey/convenience/ConvenienceCharsStep.tsx`: `unchecked` is derived from `surveyAnswerStore.steps.convenience.answers` (one boolean answer per candidate, `evidenceKey` = per-candidate `offered(candidate)` key), each toggle calls `saveAnswer`, completion records through `recordQuestionAnswers` (makes T025 pass; the gate stays as-is until T055)
- [X] T035 [US1] Characters sub-screen position and manual path: `studio/src/survey/CharactersStep.tsx` / `studio/src/survey/PhaseB.tsx` write the current sub-screen via `setPosition("characters", subScreenId)` and restore it on mount; the manual path's SurveyRunner answers flow through T031; each sub-screen Next calls `recordQuestionAnswers("characters", subScreenId, …)` (makes T081 pass)
- [X] T036 [US1] Run the US1 tests; fix whatever T027-T029 surfaced or note it for T072

**Checkpoint**: US1 independently shippable. Commit `fix(studio): 079 US1 answers and position survive leaving a step` (spec 079 T022-T036, T081, T083), with T030 as its own `fix(engine)` commit.

---

## Phase 4: User Story 2 — Going back through the prefill confirmation keeps the alphabet (P1)

**Goal**: passing through an unchanged prefill never clears the alphabet or punctuation picks, on all
three routes; a real change re-derives dependent proposals. Closes D-3, FR-020…FR-022.

**Independent test**: build an alphabet with an addition and a removal, pick punctuation, take each prefill
route with no change, assert nothing changed and the build list is non-empty (quickstart US2).

### Tests first (US2)

- [X] T037 [P] [US2] Extend `studio/src/stores/phaseBDraftStore.test.ts`: `alphabetEvidenceKey` is stamped when the alphabet is first built, survives `reset()`, is cleared by `resetPhaseBDraftDecisions()`, and round-trips through `PhaseBDraftSnapshot`
- [X] T038 [P] [US2] Extend `studio/src/survey/CharactersStep.test.tsx` with a "prefill routes" suite: (a) Back from Phase B (`CharactersStep.tsx:88`) then confirm, (b) Done on Project name (`studio/src/steps/advance.ts:209-212`), (c) Done on Track, adapt track (`advance.ts:187-193`); each with unchanged evidence leaves picks, chars, bases, marks, provenance, punctuation picks and `alphabetEvidenceKey` untouched and lands on a non-empty build list at the saved sub-screen (FR-020, FR-021, FR-004)
- [X] T039 [P] [US2] Same file: changing bcp47, script, variant or base and confirming takes the "changed" branch (reset + fresh seeds + new stamp), not the unchanged branch (US2 scenario 3)
- [X] T040 [P] [US2] Extend `studio/src/survey/punctuation/PunctuationStep.test.tsx`: `alreadyConfirmed` is true only for a confirmed inventory built on the current `resolvedTag|baseId`; after an evidence change the punctuation defaults are proposed again (FR-022)
- [X] T041 [P] [US2] Extend `studio/src/lib/draftPersistence.test.ts`: `restorePhaseBDraftSnapshot` restores a string `alphabetEvidenceKey` and drops a non-string one

### Implementation (US2)

- [X] T042 [US2] Add sticky `alphabetEvidenceKey?: string` to `studio/src/stores/phaseBDraftStore.ts` (kept by `reset()`, cleared by `resetPhaseBDraftDecisions()`, optional in `PhaseBDraftSnapshot`), stamped from `steps/evidence.ts` `alphabetKey` when the alphabet is first built; restore it in `studio/src/lib/draftPersistence.ts` `restorePhaseBDraftSnapshot` (makes T037, T041 pass)
- [X] T043 [US2] Guard `onConfirm` in `studio/src/survey/CharactersStep.tsx` (:54-60): if the current alphabet key equals the stamp and the alphabet is non-empty, skip `resetPhaseBDraft()` and go to the saved sub-screen (`peekStepCursor("characters")`, default sub-stage B); otherwise reset, clear the `seededProposals` keys tied to the old evidence (`punctuation:<oldTag>`, `punctuation-base:<oldBase>`), re-seed and stamp the new key. Leave `studio/src/steps/advance.ts` and `StepHost.tsx:399-403` routing unchanged so every route hits this one chokepoint (makes T038, T039 pass)
- [X] T044 [US2] Scope `alreadyConfirmed` in `studio/src/survey/punctuation/PunctuationStep.tsx` (:229-236) to a confirmed inventory whose recorded evidence equals the current `resolvedTag|baseId` (store the key beside the confirmed inventory if it is not already derivable) (makes T040 pass)

**Checkpoint**: commit `fix(studio): 079 US2 unchanged prefill keeps the alphabet` (spec 079 T037-T044).

---

## Phase 5: User Story 3 — A real change re-proposes only what it affects (P2)

**Goal**: a shape change re-proposes only dependent answers, flags them with a reason, keeps explicit
choices, restores originals on change-back, shows a non-blocking notice and journey-strip badges, never
moves the author; Convenience letters gets a tri-state gate; the strip becomes two-tier. Closes FR-010…FR-017,
FR-041, FR-052, FR-060…FR-068, #1795, #1789, #1796.

**Independent test**: finish marks with overturned answers, add one base letter, return, assert only that
base's answers are flagged and every other answer is unchanged (quickstart US3).

### Tests first (US3)

- [X] T045 [P] [US3] Extend `studio/src/survey/marks/MarksSeriesStep.test.tsx` (FR-010, FR-052, SC-003): adding one base letter flags only attachments involving that base and treatments whose evidence includes it; every other answer renders its saved value unflagged; an explicitly set input order survives unless inapplicable (FR-012, US3 scenario 2); add-then-remove the letter before revisiting shows no flags and the originals (FR-014, US3 scenario 3); a flagged answer shows its catalog reason (US3 scenario 4); confirming or overturning clears the flag and supersedes the recorded entry (FR-041)
- [X] T082 [P] [US3] Same file (spec Edge Case "shape change that removes a question entirely"): answer marks with overturned values, remove the last diacritic so marks no longer applies, and assert the saved answers are still in `surveyAnswerStore` and the step shows no work-to-do; restore the diacritic, and assert every original answer renders unflagged (data-model.md §3 `inactive, kept`)
- [X] T046 [P] [US3] Same file (FR-013): the step lists flagged earlier stations with links; Next is blocked while a flagged station before the position is unresolved; the author's `position` is not changed by the flag (FR-004)
- [X] T047 [P] [US3] Extend `studio/src/survey/CharactersStep.test.tsx` (FR-015): after a script change, author removals are re-applied, additions that fit are kept, an addition outside the new script is kept and flagged `outside-script`, and nothing is dropped
- [X] T048 [P] [US3] Shape-change tests (FR-052) for punctuation (`PunctuationStep.test.tsx`: tag change re-proposes, removals for unchanged chars survive), invisibles (`InvisiblesStep.test.tsx`: a new candidate is proposed, existing decisions kept) and convenience (`ConvenienceCharsStep.test.tsx`: a new surplus candidate is proposed, existing un-ticks kept)
- [X] T079 [P] [US3] FR-013 outside marks: for characters (an `outside-script` addition after a script change), punctuation, invisibles and convenience, each `reproposed` answer shows its catalog reason cue; the step shows `FlaggedAnswersList`; Next is blocked while a flagged screen before `position` is unresolved; confirming or overturning clears the flag and supersedes the entry; `position` is not changed by a flag. Tests in `CharactersStep.test.tsx`, `PunctuationStep.test.tsx`, `InvisiblesStep.test.tsx` and `ConvenienceCharsStep.test.tsx`. Invisibles/convenience honestly assert NO flags ever occur (structurally impossible per their per-answer key design — see `survey/invisiblesFlags.ts`/`survey/convenience/convenienceFlags.ts`), not invented ones.
- [X] T049 [P] [US3] Create `studio/src/steps/workToDo.test.ts` (R-10, SC-008): `selectWorkToDo()` reports `reproposed` items per affected answer, `unassigned` items for mechanisms and touch after a letter is added (US3 scenario 5), `now-applicable` for a `not-asked` convenience step whose gate now says `applies` (FR-067); items vanish when resolved; unaffected steps have none
- [X] T050 [P] [US3] Extend `studio/src/survey/convenience/ConvenienceCharsStep.test.tsx` (FR-064, FR-065, FR-068): `computeConvenienceGate` returns `unknown{reason}` with no signal and the step renders with the gap explanation; `not-applicable{reason}` sets status `not-asked{reason, evidenceKey}`, leaves `retainedConvenienceChars` absent and appends no decision entry
- [X] T051 [P] [US3] Create `studio/src/hooks/useCarveNeededSet.test.ts` (FR-066, SC-010): the defaults path and the ask-me path produce the same `hasSignal` for the same evidence
- [X] T052 [P] [US3] Extend `studio/src/editors/carve/CarveGalleryV2.test.tsx` (R-09 regression): absent `retainedConvenienceChars` with a `not-asked` convenience status yields the same needed set as an answered-empty step, and carve does not propose removing a letter the author retained
- [X] T053 [P] [US3] Extend `studio/src/decisions/progressDots.test.ts` (FR-060…FR-063, SC-009): one section mark per manifest step; the active step expands into one question mark per published walk stop; marks' stations each get a question mark; an Invisibles Next with many answers sharing one `screenId` yields one question mark; entries without `recordedScreenOf` fall back to one mark per step; collapsed fill `full`/`partial`/`none`; badges from `selectWorkToDo()` fixtures land on the right question mark and on the collapsed section; no label equals a raw answer id such as `invisibles.u2068`; a character walk still collapses via `collapsedWalkDot`. Note in the PR any rewritten single-tier assertion
- [X] T054 [P] [US3] Extend `studio/src/components/StudioFooter.a11y.test.tsx`: accessible names for every state in journey-strip-contract.md §3a-§3c (partial, "no answer yet" vs "not yet reached", each badge kind); ring only on the current mark with `aria-current="step"`; Enter/Space on a badged collapsed section jumps to its earliest work item, on an unbadged one to the saved position; the FR-016 notice is announced in the existing `role="status"` span with catalog step names and no second `aria-live` region

### Implementation (US3)

- [X] T055 [US3] Tri-state gate in `studio/src/survey/convenience/ConvenienceCharsStep.tsx` (:84-97, :160-170): `applies` | `not-applicable{reason}` | `unknown{reason}`; `unknown` renders the step with an explanation; `not-applicable` calls `setStatus("convenience", { kind: "not-asked", reason, evidenceKey })` and completes without `retainedConvenienceChars` and without a decision entry; fix any defaults-vs-ask-me divergence in `studio/src/hooks/useCarveNeededSet.ts` found by T051 (makes T050-T052 pass)
- [X] T056 [US3] Create `studio/src/steps/workToDo.ts`: pure `selectWorkToDo()` combining (a) `reconcile()`-reproposed saved answers, (b) `useAccountedForGate` counts for mechanisms and touch (same source as `studio/src/components/UnfinishedGalleryIndicator.tsx`; extract the pure counting function from `studio/src/hooks/useAccountedForGate.ts` if it is hook-only), (c) `not-asked` steps whose live gate says `applies` (makes T049 pass)
- [X] T057 [US3] Create `studio/src/components/FlaggedAnswersList.tsx`: lists a step's flagged earlier screens from `selectWorkToDo()` with links that jump through `jumpToLocation` (one jump mechanism), each with its catalog reason; semantic list, keyboard-operable (docs/accessibility.md)
- [X] T058 [US3] Wire flags into `studio/src/survey/marks/MarksSeriesStep.tsx`: render a "needs reconfirming — {reason}" cue on each `reproposed` view, pass the input-order `adjust` (FR-012), show `FlaggedAnswersList`, block Next while a flagged station before `position` is unresolved, and re-stamp the key on confirm/overturn (makes T045, T046 pass)
- [X] T059 [US3] Carry-over reset in `studio/src/survey/CharactersStep.tsx` `onConfirm` "changed" branch (R-07 steps 1-7): snapshot author additions and `rejected`, reset, clear old seed keys, re-seed, re-apply removals, re-apply additions that fit the new script, save each non-fitting addition as a `characters` answer keyed to the old evidence so it surfaces as `reproposed{outside-script}`, stamp the new key (makes T047 pass)
- [X] T060 [US3] Make punctuation, invisibles and convenience proposal refreshes preserve saved decisions for unchanged per-answer keys in `studio/src/survey/punctuation/PunctuationStep.tsx`, `studio/src/survey/invisibles/InvisiblesStep.tsx` and `ConvenienceCharsStep.tsx` (makes T048 pass). Verified by T048's tests rather than changed: all three already preserve decisions across a shape change (punctuation's `seedProposals`/`rejected` ledger, invisibles' sticky `invisibleDecisions` + `carriedOver`, convenience's per-candidate `offeredKey` reads) — no production code change was needed for this task.
- [X] T080 [US3] Wire flags into `CharactersStep.tsx`/`PhaseB.tsx` (the `outside-script` additions from T059), `PunctuationStep.tsx`, `InvisiblesStep.tsx` and `ConvenienceCharsStep.tsx`, the same way T058 does for marks: a reason cue per `reproposed` view, `FlaggedAnswersList`, the Next gate, and a re-stamped key on confirm or overturn. Pull the gate into a shared hook (e.g. `studio/src/hooks/useFlaggedNextGate.ts`) that T058 also uses, so there is one gate implementation (makes T079 pass). Characters/PhaseB and punctuation wired with real flags (punctuation's one confirmed-inventory answer re-stamps on every Done, so no separate re-stamp step was needed there); invisibles/convenience wired as documented no-ops (`deriveInvisiblesFlags`/`deriveConvenienceFlags` always return `[]` — no per-answer evidence-key design in either step can ever produce a `reproposed` state).
- [X] T061 [US3] Publish walks for the strip: `MarksSeriesStep.tsx` publishes `visibleStations` and `CharactersStep.tsx`/`PhaseB.tsx` publish their sub-screens through `studio/src/lib/stepWalk.ts` into `stepWalkStore.walks` (R-11)
- [X] T062 [US3] Rework `studio/src/decisions/progressDots.ts` `buildProgressDots` into section × question marks per journey-strip-contract.md §2-§5: group record entries by `recordedScreenOf`, section fill `full`/`partial`/`none`, `badge?: WorkKind[]` from `selectWorkToDo()`, `jumpTo` per §5 (badged section → earliest work item; unbadged → saved `position`), labels only from the catalog with screen/stage fallback, never the raw id (:316) (makes T053 pass)
- [X] T063 [US3] Render two tiers in `studio/src/components/ProgressDot.tsx`: section 14 px, question 8 px; current = ring + `aria-current="step"` independent of size; half-filled circle for `partial`; top-right triangular notch for a badge; keep `data-progress-dot-kind` (current mark keeps `"current"`) so `StudioFooter.tsx:179-190` scroll-into-view and e2e selectors still work
- [X] T064 [US3] FR-016 notice: on Next at a step with `evidence` feeding later steps, `studio/src/components/StepHost.tsx` computes `selectWorkToDo()` before and after the commit and hands a non-empty delta to `studio/src/components/StudioFooter.tsx`, which renders it in the existing `role="status"` span (:275) and clears it on the next navigation; it never gates Next and adds no timer (makes T054 pass)
- [X] T065 [US3] FR-068 "passed — {reason}": `studio/src/decisions/DecisionTrailView.tsx` and the journey strip render a `not-asked` status from `surveyAnswerStore` as "passed — {reason}", not as an answer
- [X] T066 [US3] Add catalog ids with English source to `studio/src/locales/en/messages.json` and placeholders in `studio/src/locales/fr/messages.json` via the Lingui extract/compile flow (never hand-edit compiled output): journey-strip-contract.md §8 ids (`footer.dot.partial.ariaLabel`, `footer.dot.question.unanswered.ariaLabel`, `footer.dot.badge.reproposed.ariaLabel`, `footer.dot.badge.unassigned.ariaLabel`, `footer.dot.badge.nowApplicable.ariaLabel`, `footer.notice.reproposal.title`, `footer.notice.reproposal.body`), re-proposal reasons per `ReproposalReason.code`, the "passed — {reason}" string, the convenience unknown-evidence explanation, and marks screen labels; mark them Content-review in the PR body (R-14)
- [X] T067 [US3] Extend `studio/e2e/footer-progress.spec.ts` (or create `studio/e2e/journey-strip-badges.spec.ts`): entering Accents and marks expands per-station marks and collapses on leaving; completing Invisible characters adds exactly one question mark; an alphabet edit + Next shows the notice and badges mechanisms and touch without moving the author; activating the badge jumps to the gallery and the badge clears after the key is assigned (US3 scenario 5); overflow keeps the current mark visible

**Checkpoint**: commit `feat(studio): 079 US3 targeted re-proposal, work-to-do badges, two-tier journey strip` (spec 079 T045-T067, T079, T080, T082). If the strip is large, the grain half (T053, T061-T063 minus badges) may land as a separate commit first.

---

## Phase 6: User Story 4 — Answers survive a reload (P2)

**Goal**: every saved answer and position is restored from the durable draft; pre-feature drafts load
cleanly. Closes FR-030, FR-032, FR-053, SC-004.

**Independent test**: give partial answers, reload, restore, compare answers and position (quickstart US4).

- [X] T068 [P] [US4] Extend `studio/src/lib/draftPersistence.test.ts` (FR-053): populate marks answers (some stations answered, position on station 3) and a half-answered identity question, serialize through the autosave path, clear the stores, restore, assert `steps.marks`, `steps.identity`, positions and `recordedScreenOf` match exactly
- [X] T069 [P] [US4] Same file (FR-032, US4 scenario 3): a checked-in pre-feature draft fixture (no `surveyAnswers`, no `phaseAnswersByStep`, no `alphabetEvidenceKey`) under `studio/src/lib/__fixtures__/` restores without error, the store is empty, phase answers load under `"legacy"`, and every step renders its proposal with no invented answer
- [X] T070 [P] [US4] Extend `studio/src/survey/marks/MarksSeriesStep.test.tsx` and `studio/src/survey/SurveyRunner.persistence.test.tsx` with a restore-then-mount case: after `applySurveyAnswerSnapshot`, the step mounts on the saved station/question with the saved answers (US4 scenarios 1-2)
- [X] T071 [US4] Fix any restore gap T068-T070 expose in `studio/src/lib/draftPersistence.ts` or `studio/src/stores/surveyAnswerStore.ts`

**Checkpoint**: commit `fix(studio): 079 US4 answers and positions survive reload` (spec 079 T068-T071).

---

## Phase 7: Polish & cross-cutting

- [X] T072 Close the FR-050 table in `specs/079-survey-answer-persistence/contracts/step-classification.md`: flip each "verify by revisit test" row to compliant with its T029 test name, or file a tracked follow-up issue (`bug(studio): …`) and link it in the row; T006 must stay green
- [X] T073 [P] Fix the D-2 path in `specs/079-survey-answer-persistence/spec.md` to `packages/studio/src/survey/convenience/ConvenienceCharsStep.tsx`
- [X] T074 [P] Land the amendment notes from spec.md "Amendments to existing specs" in `specs/057-bulletproof-navigation/spec.md` (FR-042/FR-049 grain, FR-042 recording per Next, badge state, FR-007 narrowing), `specs/053-decision-audit/spec.md` (capture boundary per Next) and `specs/071-marks-question-series/spec.md` (FR-023 generalised), each citing spec 079; then run `node utilities/spec-trace check` and `acknowledge` the changed units
- [X] T075 [P] Record the R-09 / plan risk 1 open point (FR-068 "not asked" is not in the decision record; a record entry would need an additive `DecisionPayload` kind, a contracts change) in the PR body for 053/055 owner review — do not change contracts
- [X] T076 [P] Verify plan risk 2 in `studio/src/decisions/createDecisionRecorder.test.ts`: an intermediate marks station's entries carry `{state: "none"}` and the final station's entries carry the whole series' diff; and `DecisionTrailView` renders an intermediate entry as confirmed, not applied (spec FR-008 multi-screen steps)
- [X] T077 Run the full quickstart.md manual walk (US1-US4, #1795/#1789, #1796) in `pnpm dev` and note results in the PR body
- [X] T078 Final gates: `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm lint` (incl. both i18n tiers), `pnpm --filter @keyboard-studio/studio test:e2e footer-progress decision-deeplink`; reconcile the AC checkboxes of #1787, #1789, #1795 and #1796 per the CLAUDE.md issue closure policy (`closes` only for fully verified issues)

**Checkpoint**: commit `docs(spec): 079 polish — classification closed, amendments landed` (spec 079 T072-T078).

---

## Dependencies & execution order

### Phase dependencies

- **Setup (Phase 1)** → **Foundational (Phase 2)** → user stories.
- **US1 (P1)** depends only on Foundational. It is the MVP.
- **US2 (P1)** depends only on Foundational (`steps/evidence.ts` `alphabetKey`); it can run in parallel with US1. Both touch `CharactersStep.tsx` (T035 vs T043) and `CharactersStep.test.tsx` (T081 vs T038) — sequence T035 before T043 and T081 before T038.
- **US3 (P2)** depends on US1 (store-backed marks, convenience, SurveyRunner) and US2 (the guarded `onConfirm` that T059 extends).
- **US4 (P2)** depends on Foundational and on US1's store-backed steps; it can run in parallel with US3.
- **Polish** after all stories.

### Within phases

- Tests before implementation; confirm they fail first.
- Foundational: T010 → T011, T012 → T013, T014; T015 → T016; T017 independent; T018 → T019; T020 → T021.
- US1: T030 alone (engine); T031, T032→T033, T034, T035 in different files.
- US3: T055 and T056 before T057/T058/T080/T062; T058 and T080 share the gate hook; T061 before T062; T062 → T063 → T064; T066 alongside T058-T065.

### Parallel opportunities

- Setup: T002, T003.
- Foundational tests T004-T009 all [P]; T017 [P] alongside the store work.
- US1 tests T022-T029, T081, T083 all [P]; T030 (engine) runs in parallel with every studio task.
- US2 tests T037-T041 all [P].
- US3 tests T045-T054, T079, T082 all [P].
- US4 tests T068-T070 all [P].
- Polish T073-T076 all [P].

### Parallel example: User Story 1

```text
# All US1 tests together:
T022 mark-guards.test.ts         (engine)
T023/T024 MarksSeriesStep.test.tsx
T025 ConvenienceCharsStep.test.tsx
T026 SurveyRunner.persistence.test.tsx
T027 InvisiblesStep.test.tsx + PunctuationStep.test.tsx
T028 StepHost.test.tsx
T029 revisit tests for choose_base / carve / touch_seed_source

# Then implementation, in separate files:
T030 mark-guards.ts   |  T031 SurveyRunner.tsx  |  T032-T033 MarksSeriesStep.tsx
T034 ConvenienceCharsStep.tsx  |  T035 CharactersStep.tsx / PhaseB.tsx
```

### Parallel example: User Story 3

```text
T045/T046 MarksSeriesStep.test.tsx  |  T047 CharactersStep.test.tsx  |  T049 workToDo.test.ts
T050 ConvenienceCharsStep.test.tsx  |  T051 useCarveNeededSet.test.ts |  T052 CarveGalleryV2.test.tsx
T053 progressDots.test.ts           |  T054 StudioFooter.a11y.test.tsx
```

---

## Implementation strategy

### MVP (US1 only)

1. Phase 1 + Phase 2.
2. Phase 3 (US1): the #1787 data loss is fixed for every step, and D-6 is closed.
3. Stop and validate with quickstart US1; the branch is shippable as a PR here.

### Incremental delivery

1. Foundational → US1 (MVP, #1787) → US2 (alphabet wipe) — both P1, both data-loss fixes.
2. US3 (targeted re-proposal, badges, strip, #1795/#1789/#1796) — the largest phase; the strip grain can land ahead of the badges.
3. US4 (reload proof) — mostly tests, since Foundational already persists the store.
4. Polish.

### Crew split (km-lead)

- km-programmer / km-frontend: studio stores, steps, footer.
- km-programmer: the engine `mark-guards` fix (T030).
- km-testing: the test-first tasks per phase.
- km-verification: phase gates and the quickstart walk.
- Content review (R-14): T066 strings.

## Notes

- `[P]` = different files, no incomplete dependency.
- No change to `packages/contracts`, `Pattern`, `AnswerType`, `SurveyPhaseResult` or `DecisionPayload`. If a task appears to need one, stop and surface it (CLAUDE.md "Pattern schema is a contract").
- No new timer; the store rides `AUTOSAVE_DEBOUNCE_MS` (D3 scope note).
- No issue numbers in shipped code or comments.
- `tasks.md` checkboxes and `.spec-context.json` land with or after the work they describe.
