# Research: Survey answers persist per question

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-09-24

Part I records what the code does today. Three read-only sweeps of `packages/studio/src` and
`packages/engine/src` produced it, and it re-verifies the spec's D-1…D-6 against file and line.
Part II records the decisions (R-01…R-14) that resolve every open point in the plan's Technical
Context. Paths are relative to `packages/studio/src/` unless marked otherwise.

---

## Part I — Findings

### F-1. Accents and marks (D-1, D-6)

- All answer state in [MarksSeriesStep.tsx](../../packages/studio/src/survey/marks/MarksSeriesStep.tsx)
  is `useState`, and each piece is re-seeded from proposals by an effect:
  - `attachmentChecked` (:245, re-seed :248-250)
  - `treatment` `{classTreatment, markTreatment, promoted, inputOrder}` (:308-313, :319-335)
  - `orderExplicitlySet` (:307)
  - `outputForm` (:349-352)
  - `stackingAllowed` and `stacksConfirmed` (:375-382)
  - `stationIndex` (:395, reset to 0 on `alphabetKey` at :398-400)
- The evidence fingerprint already exists: `alphabetKey = confirmedAlphabetKey(alphabet)` (:197), a
  content key from contracts. Nothing is stored against it. The FR-023 re-confirmation works only
  because every mount rebuilds from fresh proposals.
- `complete()` (:421-454) records `{phase:"C", answers: [], marksWorklist, marksOutputForm, computedAxes}`.
  - `answers` is always empty, so no marks answer reaches the decision record as an answer.
  - `stackingAllowed` and `stacksConfirmed` are never read by `complete()`. The stacking answers are
    discarded.
  - Input order survives a revisit only by accident, through `session.axes.markInputOrder`.
- **D-6 is confirmed as a real bug, in a narrower form than the spec feared.**
  - `applyMarkGuards` ([engine mark-guards.ts:144-241](../../packages/engine/src/pattern-apply/mark-guards.ts))
    strips and rebuilds its generated group, rules and stores. Re-completing with the same answers is
    therefore idempotent.
  - The early return at :151-153 fires when the new worklist has nothing to block or unwrap, and it
    returns *before* the strip. Changing an answer from "some pairs blocked" to "none" leaves the old
    guards in the IR.
  - The call site is [steps/reducer.ts:348-370](../../packages/studio/src/steps/reducer.ts).

### F-2. Convenience letters (D-2, #1796)

- The file is [survey/convenience/ConvenienceCharsStep.tsx](../../packages/studio/src/survey/convenience/ConvenienceCharsStep.tsx).
  The spec's D-2 link omits the `convenience/` folder.
- Its answer state is `unchecked: Set<string>` (:155), held in component state only and never read
  back from the recorded result.
- `computeConvenienceGate` (:84-97) skips when `!hasSignal`.
  - `hasSignal` comes from [useCarveNeededSet.ts:171](../../packages/studio/src/hooks/useCarveNeededSet.ts)
    and means "tiered needed set non-empty, or needed chars resolved non-null".
  - This is the #1796 conflation of *unknown* with *not applicable*.
- When the gate skips, the step completes itself (:160-170) with `retainedConvenienceChars: []`, which
  means "asked, kept nothing".
- Carve ([CarveGalleryV2.tsx:480-500](../../packages/studio/src/editors/carve/CarveGalleryV2.tsx))
  unions `retainedConvenienceChars ?? []` into `neededSet`. An absent value and `[]` therefore behave
  the same: carve proposes removing every surplus letter. The harm comes from convenience skipping
  itself, not from how carve reads the value (see R-09).

### F-3. Characters step prefill (D-3)

- [CharactersStep.tsx:54-60](../../packages/studio/src/survey/CharactersStep.tsx): `onConfirm` calls
  `resetPhaseBDraft()` unconditionally, then sets sub-stage B.
- `reset()` ([phaseBDraftStore.ts:589-615](../../packages/studio/src/stores/phaseBDraftStore.ts)) clears
  the following, which includes the punctuation picks because they are ordinary draft entries:
  - picks, chars, bases, marks, attested stacks, declared roles
  - the derived classes, provenance, digraphs and confidence
- `reset()` keeps `rejected`, `seededProposals`, `invisibleDecisions` and `exemplarMethodDeclined`.
  - Keeping `seededProposals` is why the punctuation seeds never re-fire after the wipe. They are keyed
    `"punctuation:"+resolvedTag` and `"punctuation-base:"+baseId`, and the key is still present.
  - A second guard also blocks them: `alreadyConfirmed`
    ([PunctuationStep.tsx:229-236](../../packages/studio/src/survey/punctuation/PunctuationStep.tsx))
    is true whenever *any* phase-C `confirmedInventory` exists, whatever evidence it was built on.
  - Both explain the empty-list and no-reproposal half of D-3 and the FR-022 gap.
- `discoveryMethod` (`surveySessionStore.ts:370`) survives, so the author lands on an empty build list.
- The routes back into prefill:
  - [advance.ts:187-193](../../packages/studio/src/steps/advance.ts): adapt track, Done on Track.
  - [advance.ts:209-212](../../packages/studio/src/steps/advance.ts): Done on Project name.
  - `CharactersStep.tsx:88`: Back from Phase B.
  - [StepHost.tsx:399-403](../../packages/studio/src/components/StepHost.tsx) applies
    `setCharactersSubStage` unconditionally.
- There is no evidence key for language, script and base today. Every input to one lives in
  `surveySessionStore`:
  - `identityResult.bcp47`
  - `identityResult.prefill.script` and `.variant`
  - `localBase.id`

### F-4. Shared phase slot (D-4)

- `recordPhase` ([workingCopyStore.ts:1265-1273](../../packages/studio/src/stores/workingCopyStore.ts))
  finds the entry by phase letter and shallow-merges it, so the required `answers` field always
  overwrites.
- Phase C writers: marks, punctuation, invisibles, convenience, `recordAssignments` (:1275-1288) and
  `unflagCharForSequence`.
- Convenience's `answers: []` erases the per-candidate booleans that Invisibles recorded.
- One reader depends on `answers`: `InvisiblesStep.writingDirectionFrom` (:82-100). `mergePhaseResults`
  in contracts does not merge `answers` into the session.

### F-5. Question-by-question steps and reload (D-5)

- [stepWalkStore.ts](../../packages/studio/src/stores/stepWalkStore.ts) holds `walks`, `cursors`
  (the current question or character id) and `answerDrafts` (`Record<stepId, Record<questionId, string|string[]>>`).
- It is excluded from the draft by construction, because it is not in the envelope. The header at
  :11-20 justifies this for `walks` only.
- The only writer of `answerDrafts` is [SurveyRunner.tsx](../../packages/studio/src/survey/SurveyRunner.tsx)
  (:447-455, :558-585). It serves identity, track, project_name, help and PhaseB manual.
- `cursors` has these writers:
  - the galleries and `useCharWalkPosition`
  - `lib/jumpToLocation.ts:162`

### F-6. Precedents that already comply

- `phaseBDraftStore` is the precedent for sticky, durable, per-evidence-key state:
  - It keeps sticky `rejected`, `seededProposals` and `invisibleDecisions`.
  - `seedProposals(chars, source, seedKey)` is a no-op on a repeated key.
  - Every snapshot field is optional, and `restorePhaseBDraftSnapshot` is tolerant
    ([draftPersistence.ts:877-907](../../packages/studio/src/lib/draftPersistence.ts)).
- The model revisit test is [PunctuationStep.test.tsx:624](../../packages/studio/src/survey/punctuation/PunctuationStep.test.tsx)
  ("SC-006: removals survive a step revisit…").

### F-7. Draft envelope

- `DurableDraft` ([draftTypes.ts:106-134](../../packages/studio/src/lib/draftTypes.ts)) has
  `DRAFT_VERSION = 1`, and a draft with a different version is discarded.
- The field-addition policy has been the same every time: an optional field, a tolerant reader, and
  **no version bump**. Precedents: `phaseBDraft?`, `decisionRecord?`, `keyEditOverlay?`, and
  `seededProposals?` / `invisibleDecisions?`.
- The envelope has no zod schema. Its validation is hand-rolled.
- Autosave ([draftPersistence.ts:1309-1375](../../packages/studio/src/lib/draftPersistence.ts)):
  - one 500 ms `setTimeout`, subscribed to three stores
  - `AUTOSAVE_DEBOUNCE_MS`, which D3 does not govern

### F-8. Decision record

- `decisionLogStore.append` ([decisionLogStore.ts:293-318](../../packages/studio/src/decisions/decisionLogStore.ts))
  keys the slot by `stepId` plus `questionId`.
  - An identical value returns `null`, so nothing is appended.
  - A different value supersedes the previous entry through the existing chain.
  - This means FR-040's "a Next with no change records nothing" and "a change supersedes" **already
    hold at the store level**. Only the capture point moves.
- The capture point today is step completion only:
  - `StepHost.handleComplete` → `recordStepCompletion` → `createDecisionRecorder`
    (`recordSurveyAnswers` or `recordEditorStep`).
- `DecisionPayload` kinds are `survey-answer`, `editor-action` and `base-contribution`. `AnswerType`
  is part of the locked `Pattern` contract (`contracts/src/pattern.ts:34`), so neither may change here.

### F-9. Journey strip

- [progressDots.ts](../../packages/studio/src/decisions/progressDots.ts) `buildProgressDots` (:567)
  builds four kinds of dot, in order:
  1. one record dot per effective `survey-answer` entry (:270-321)
  2. one walk dot per published stop (:509-544)
  3. a stage-granular current dot
  4. an upcoming stage dot
- A walk made entirely of characters already collapses to one dot (`collapsedWalkDot`, :487).
- #1795 happens because Invisibles emits one answer per candidate (`invisibles.uXXXX`) and publishes
  no walk. `lookupQuestionLabel` finds no module for these ids and falls back to the raw id (:316).
- Visual states ([ProgressDot.tsx](../../packages/studio/src/components/ProgressDot.tsx)):
  - completed: filled 10 px circle
  - upcoming: hollow 10 px square
  - current: 15 px filled circle with a 2 px ring and `aria-current="step"`
- Accessible names use `footer.dot.*.ariaLabel`. Overflow scrolls on the x axis, with
  `scrollIntoView` on the current dot.
- Jumps go through `jumpToLocation` ([lib/jumpToLocation.ts:139](../../packages/studio/src/lib/jumpToLocation.ts)).
  A refusal, or a degraded jump, is announced through the footer's `role="status"` span
  ([StudioFooter.tsx:275](../../packages/studio/src/components/StudioFooter.tsx)).
- Nothing on the strip carries a badge today. The nearest precedents are:
  - `UnfinishedGalleryIndicator`, which counts from `useAccountedForGate()`
  - `ui/Badge.tsx`

### F-10. Galleries

- Physical: [MechanismGallery.tsx](../../packages/studio/src/editors/assignLoop/MechanismGallery.tsx)
  calls `recordAssignments` on each action.
- Touch: [TouchGallery.tsx](../../packages/studio/src/editors/assignLoop/TouchGallery.tsx) commits
  through `commitKeyEdit` and `setWorkingIR`.
- Both recompile through `useWorkingCopyTransform` → `useKeyboardArtifact`, inside the single D3 cycle.
- Every action is already saved immediately in the working copy, so the galleries already comply with
  FR-008.
- The only pages without a keyboard are:
  - the intro splash (`IntroSplash.tsx`), which takes no assignment actions
  - `GalleryEmptyState`

---

## Part II — Decisions

### R-01. Where saved answers live: a new `surveyAnswerStore`

- **Decision**: add one zustand store, `stores/surveyAnswerStore.ts`.
  - It is keyed by manifest step id and holds that step's saved answers, position and statuses (see
    [data-model.md](data-model.md)).
  - `stepWalkStore.answerDrafts` and `stepWalkStore.cursors` move into it. `stepWalkStore` keeps only
    the derived `walks`, and its "never persist" comment becomes true of everything it holds.
  - The store persists as a new optional envelope field, `DurableDraft.surveyAnswers?`, with a
    tolerant reader and no `DRAFT_VERSION` bump (F-7 precedent).
  - `installDraftAutosave` subscribes to it as a **fourth store on the existing timer**.
- **Rationale**:
  - Answers stay out of `surveySessionStore`, which is traversal only (spec 026 remains the single
    "where am I").
  - Answers stay out of `phaseResults.answers`, which holds *recorded* results that are overwritten
    field by field (F-4).
  - One keyed store is what makes FR-007 checkable (R-12).
  - Moving the cursors in resolves D-5 without persisting the large `walks`.
- **Alternatives considered**:
  - Extend `phaseBDraftStore`. Rejected: that store is the alphabet draft, and putting identity and
    marks answers in it would couple unrelated resets (`reset()` on a genuine alphabet change must not
    touch identity answers).
  - Persist `stepWalkStore` wholesale. Rejected: `walks` are large and derived.
  - Store answers in `phaseResults`. Rejected: that slot is the *recorded* result, and FR-008 needs
    draft answers that are not yet applied.

### R-02. Evidence keys: a pure, per-step declaration

- **Decision**:
  - Add an optional `evidence?: EvidenceDeclaration` to `StepBase` (`steps/types.ts`). It names the
    shape-determining inputs in prose for reviewers and points at a pure function in
    `steps/evidence.ts`.
  - Each saved answer stores an **answer-grained** key, not a step-grained one: the fingerprint of
    exactly the evidence that answer depends on. For example, the attachment answer for mark M on base
    B depends on "M present, B present, B+M attested?". It does not depend on the whole alphabet.
  - An answer is *current* when its stored key equals the key recomputed now, and *affected* otherwise.
  - Keys:

    | Step | Step key | Answer grain |
    |---|---|---|
    | characters (alphabet) | `bcp47 \| script \| variant \| baseId` | per edit (addition or removal), see R-07 |
    | marks | `confirmedAlphabetKey` (already exists) | per mark×base attachment; per class and per mark for treatment; stacks per stack key; output form per posture |
    | punctuation | `resolvedTag \| baseId` (the existing seed-key parts) | per character (existing `rejected` / provenance) |
    | invisibles | candidate set | per candidate (existing `invisibleDecisions`) |
    | convenience | surplus candidate set + orthography-signal state | per candidate |
    | identity, track, project_name, help | none: no earlier answer shapes them | n/a |
- **Rationale**:
  - FR-011 and FR-012 need answer-level keys. With only a step-level key, a one-letter change
    re-proposes the whole step, which SC-003 forbids.
  - Keeping the declaration on the manifest entry satisfies Article IX: the manifest stays the single
    place a step describes itself. It is a studio-local type, not contracts.
- **Alternatives considered**:
  - A step-level key only (today's `alphabetKey`). Rejected because of SC-003.
  - Deriving the dependencies at run time from IR `inputs`. Rejected: the shape inputs are mostly
    non-IR session signals (`manifest.ts:72-73`).

### R-03. Re-proposal is a derived view, never a write (FR-012, FR-014)

- **Decision**: saved answers are **never overwritten by a re-proposal**.
  - `reconcile(saved, currentEvidence, freshProposals)` is a pure function per step. It returns the
    view the step renders, with each answer marked `current` or `reproposed{reason}`:
    - When a saved answer's key still matches, the saved value is shown.
    - When it does not, the fresh proposal is shown, *adjusted from the saved value* where the step
      defines an adjustment. Example: an explicitly set input order is kept unless the new alphabet
      makes it inapplicable (FR-012 / US3-2).
    - When there is no saved answer, the proposal is shown, unflagged.
  - Only the author's confirm or overturn writes a new saved value, stamped with the current key.
- **Rationale**:
  - FR-014 (change and change back, then return to the originals with no flags) falls out for free:
    the saved value and its key were never touched.
  - The edge case "saved but inactive" (the last diacritic removed, then restored) likewise needs no
    extra state.
  - The flag clears on confirm (FR-013) because confirming re-stamps the key.
- **Alternatives considered**:
  - Rewrite saved answers on an evidence change and keep a `prior` copy. Rejected: it is two sources of
    truth, and restoring on change-back needs a matching rule that the pure view does not.

### R-04. Recording on each Next (FR-040), with no model change

- **Decision**:
  - Add `recordQuestionAnswers(stepId, screenId, answers)` to the decision-recorder deps.
  - Call it on every forward Next within a step:
    - SurveyRunner question Next
    - a marks station Next
    - a characters sub-screen Next
    - the single screen of an editor step, at completion
  - It routes through the existing `decisionLogStore.append`, which already returns `null` for an
    identical value and supersedes a changed one (F-8).
  - **It is a method of the recorder that `createDecisionRecorder` builds, not a bare append.**
    Plan-time review found that
    [createDecisionRecorder.ts:111-193](../../packages/studio/src/decisions/createDecisionRecorder.ts)
    is the only place an append is paired with `snapshotter.captureAtBoundary()` → `attachImpact`
    (055 FR-019/019a: "one net source diff per boundary, attached to every entry recorded at that
    boundary"). A bare append would leave entries with no impact.
    - Each Next is therefore a capture **boundary**. The recorder appends the screen's answers, then
      captures and attaches the net diff since the previous boundary.
    - An intermediate marks station changes no keyboard source (R-05), so its entries get the existing `{state: "none"}` impact ([decisionRecord.ts:193](../../packages/contracts/src/decisionRecord.ts)), not a missing one.
    - There is one recording path, which the step-completion path also uses.
  - `recordStepCompletion` stays and becomes idempotent, because the same answers were already
    appended.
  - Marks answers are recorded as ordinary `survey-answer` payloads using the existing `AnswerType`s:
    - attachments per mark: `char-list` of accepted bases
    - class and mark treatment: `select`
    - input order: `select`
    - output form: `select`
    - stacking allowed: `boolean`
    - confirmed stacks: `char-list`
  - Their question ids are `marks.<station>.<subject>`, and every answer carries its `screenId`.
- **Rationale**:
  - The 053 model is untouched (spec: out of scope).
  - The locked `AnswerType` union is untouched (Article I).
  - The stacking answers stop being discarded (F-1).
- **Alternatives considered**:
  - A new `DecisionPayload` kind for marks. Rejected: it is a contracts change and needs 053 sign-off.

### R-05. When an answer takes effect (FR-008)

- **Decision**:
  - **Single-screen survey steps**: the effect is applied at the step's Next, together with recording.
    This is today's behaviour.
  - **Multi-station steps (marks)**: the keyboard effect is a function of the *whole* series (the
    worklist). It is applied on the **final** station's Next, in the same completion call that records
    that station.
    - Intermediate station Nexts record their answers but do not touch the keyboard.
    - The keyboard therefore changes only at a point where every station's answer is recorded, and the
      trail still explains the keyboard.
  - **Galleries**: every action is applied fully and immediately, as today. Holding actions
    provisionally and batching them on confirm is **rejected**. No gallery page that hides the keyboard
    takes assignment actions (F-10), so batching would add a second, pending state for no benefit.
    Recompiling while hidden is left as it is today. It is inside the single D3 cycle, so no timer is
    added.
- **Alternatives considered**:
  - Apply `applyMarkGuards` on every station Next. Rejected: stations the author has not yet reached
    would take effect from proposals, before the author confirmed them.

### R-06. D-6 fix: always strip before the early return

- **Decision**: in `applyMarkGuards`, run the strip of the previously generated group, rules and stores
  before the "nothing to block" early return. Return early only when there was also nothing to strip.
- **Test**: FR-054 has two cases:
  - re-completing with no change leaves the emitted `.kmn` byte-equal
  - "blocked → none" leaves no `generated_marks_guard` artefacts
- **Rationale**: the rest of the function is already idempotent (F-1). This is an engine-package fix
  owned by Engine.

### R-07. Characters prefill: one chokepoint guarded by the alphabet evidence key (FR-015, FR-020…FR-022)

- **Decision**:
  - `phaseBDraftStore` gains a sticky `alphabetEvidenceKey?: string`, stamped when the alphabet is
    first built.
  - `CharactersStep.onConfirm` compares the current key (R-02) with the stamp:
    - **Equal, with a non-empty alphabet**: no reset. Go to sub-stage B, or wherever the author was
      (FR-004).
    - **Different**: run the **carry-over reset**:
      1. Snapshot the author's edits: the chars with provenance `author`, and `rejected`.
      2. `reset()`.
      3. Clear the seed keys tied to the old evidence.
      4. Re-seed the proposal for the new evidence.
      5. Re-apply the removals.
      6. Re-apply each addition that still fits the new script. Additions that do not fit are kept and
         flagged `reproposed{reason: "outside-script"}`. They are never dropped (FR-015).
      7. Stamp the new key.
  - The `advance.ts` routes stay as they are. Every route into prefill ends at this one guarded confirm,
    so FR-020 holds on all three routes by construction.
  - The punctuation `alreadyConfirmed` guard (F-3) changes from "any confirmed inventory exists" to
    "a confirmed inventory exists **for the current `resolvedTag|baseId`**". That fixes FR-022.
- **Rationale**: one chokepoint, and no second rule in `advance.ts` that could drift from it.
  057 FR-007 is narrowed exactly as the spec's Amendments describe.
- **Alternatives considered**:
  - Skip the prefill in `advance.ts` when the evidence is unchanged. Rejected: it duplicates the
    decision, and the Back route (`CharactersStep.tsx:88`) would still need the guard.

### R-08. D-4 fix: answers are owned per step within a phase

- **Decision**:
  - `recordPhase(result, opts?: { stepId })` keeps a sidecar, `phaseAnswersByStep: Record<phase, Record<stepId, SurveyAnswer[]>>`,
    in the working copy. It is persisted in `WorkingCopySnapshot` as an optional field.
  - The phase entry's `answers` is **derived** as the concatenation of all its steps' lists, in
    manifest order.
  - A step re-recording replaces only its own list.
  - `StepHost` passes `stepId`.
  - Old snapshots without the sidecar load their existing `answers` under a synthetic `"legacy"` owner.
    Nothing is invented (FR-032).
- **Rationale**: this is studio-only, and it leaves the contracts `SurveyPhaseResult` untouched.
  - A plan-time grep of `.answers` under `packages/studio/src` found exactly two readers of *stored*
    `phaseResults[].answers`:
    - `workingCopyStore.ts:1281` (inside `recordPhase`)
    - `InvisiblesStep.tsx:88` (`writingDirectionFrom`)
  - Every other match reads a step's own fresh result before it is recorded, for example
    `recordSurveyAnswers.ts:123`, `flowStepOptions.tsx`, `IdentityLite.tsx:130` and `PhaseB.tsx:1247`.
    These are unaffected.
  - Both stored readers keep working and stop losing data. Tasks re-run the grep before landing.
- **Alternatives considered**:
  - Add `stepId` to `SurveyPhaseResult` in contracts. Rejected: it is a contracts change for a studio
    concern.
  - Merge `answers` by `questionId`. Rejected: a step that re-records with fewer answers would leave
    stale ones behind.

### R-09. Convenience applicability is tri-state (FR-064…FR-068)

- **Decision**:
  - `computeConvenienceGate` returns one of:
    - `applies`
    - `not-applicable{reason}` (instantiated, the signal is known, and there are no surplus candidates)
    - `unknown{reason}` (the signal is not yet known)
  - `unknown` renders the step with an explanation of the gap. It is never skipped.
  - `not-applicable` passes without asking and writes a saved status `not-asked{reason, evidenceKey}`
    to `surveyAnswerStore`.
    - It records **no** `retainedConvenienceChars`. The field stays absent, which means "never asked".
    - It appends **no** decision entry: "not asked" is not an answer (FR-065), and the record model is
      unchanged.
  - The trail (055) and the journey strip render the step as "passed — {reason}" from the answer-store
    status (FR-068).
  - When the evidence key moves and the gate becomes `applies`, the step becomes work to do (R-10), and
    the author is not moved (FR-067).
  - The defaults path and the ask-me path must feed `useCarveNeededSet` the same signal (FR-066).
    Tasks include a test that runs both paths and compares `hasSignal`.
- **Carve: no code change.**
  - [CarveGalleryV2.tsx:480-490](../../packages/studio/src/editors/carve/CarveGalleryV2.tsx) already
    maps `retainedConvenienceChars ?? []`, so an absent value and `[]` produce the same empty
    retained set.
  - The #1796 harm is not carve misreading the value. It is convenience skipping on *unknown*
    evidence, so the author is never asked. The tri-state gate fixes that at the source.
  - A legitimate `not-applicable` skip means there are no surplus candidates, so carve has nothing
    to remove on its account.
  - Tasks add a carve regression test pinning this behaviour, and FR-065 is satisfied without a carve
    edit.
- **Open risk (flagged for review)**: FR-068 says the *decision trail* shows the skip. Under this
  decision the trail learns about it from the answer store, not the record. If km-doc or the 055 owners
  require the skip *in the record*, that needs an additive `DecisionPayload` kind, which is a contracts
  change. The plan escalates rather than does that silently.

### R-10. Work to do is derived, never stored (FR-013, FR-017, FR-063)

- **Decision**: a pure selector, `selectWorkToDo(): Record<stepId, WorkItem[]>`, combines:
  - (a) saved answers whose key is affected (R-03)
  - (b) gallery items still unaccounted for, reusing `useAccountedForGate` counts, the same source as
    `UnfinishedGalleryIndicator`
  - (c) steps whose saved status is `not-asked` but whose gate now says `applies` (R-09)
- The strip, the in-step flagged list and the Next gate all read this selector. A badge clears the
  moment its work item disappears, with no clear action to forget.
- **Rationale**: nothing can drift between the badge and the truth, and nothing new is persisted.

### R-11. Two-tier journey strip (FR-060…FR-063)

- **Decision**: rework `buildProgressDots` into sections × question marks.
  - Every manifest step with a presence on the strip becomes one **section mark** (large, 14 px).
  - The active step expands in place into **question marks** (small, 8 px), one per *screen*:
    - For steps that publish a walk, the screens are the published walk stops. Marks now publishes its
      `visibleStations` as a walk, and characters publishes its sub-screens.
    - For steps that don't, the screen is the step's single screen. So Invisibles is one question mark
      however many answers it records (#1795).
  - Record entries are grouped onto screens by the `screenId` stamped at record time (R-04). A
    pre-feature entry without one falls back to one mark per step.
  - Section mark fill:
    - `full`: every screen has a response.
    - `partial`: some do. Drawn as a half-filled circle (left half filled, right half hollow), with the
      accessible-name suffix `footer.dot.partial.ariaLabel`.
    - `none`: no screen has a response.
  - The current position is the ring plus `aria-current`, never size and never colour alone.
  - The badge is a small filled notch at the top-right, a distinct shape (a triangle corner). The
    accessible name adds "work waiting: {kind}".
  - Activating a mark:
    - a badged collapsed section jumps to its earliest work item
    - an unbadged collapsed section jumps to the author's last position there (the answer-store
      position)
    - all jumps go through `jumpToLocation`
  - Labels come only from the catalog. `lookupQuestionLabel` falls back to the *screen* or *stage*
    label, never the raw id (FR-062).
  - The current collapse of a character walk into one stage dot is kept. A character walk is one screen
    per character, and the gallery sub-task grain is out of scope here.
- **Rationale**: the strip's vocabulary is kept (fill, shape, ring) and size becomes the tier cue,
  exactly as the spec's clarification says.

### R-12. Making FR-007 and FR-050 machine-checked

- **Decision**:
  - Each manifest step gets a required `persistence` declaration:
    `"answer-store" | "phase-b-draft" | "working-copy" | { exempt: string }`.
  - A vitest over `STEP_MANIFEST` fails if any step lacks one, or if an `exempt` has an empty
    justification.
  - The FR-050 table ([contracts/step-classification.md](contracts/step-classification.md)) lists every
    step with its declaration and evidence. The test cross-checks that the table names every manifest
    id.
- **Rationale**: SC-007 ("unjustified exemptions: zero") becomes a failing test, not a review
  checklist.

### R-13. Non-blocking re-proposal notice (FR-016)

- **Decision**:
  - On Next at a step whose `evidence` feeds later steps, compute `selectWorkToDo()` before and after
    the commit. Newly added items produce a notice listing the affected steps and screens by their
    catalog labels, and pointing at the badged marks.
  - The notice is rendered in the footer's existing `role="status" aria-live="polite"` region, and it
    rides the Next itself (D3: no timer).
  - It never gates navigation. It is dismissed on the next navigation.
- **Rationale**: reusing the one footer live region avoids two polite regions competing (spec 056 house
  rules).

### R-14. Ownership and Content-owned strings

- **Engine** owns every code change:
  - the studio stores, steps, footer and draft persistence
  - the engine `mark-guards` fix
- **Content** owns and reviews the following strings, which Engine lands as catalog entries with English
  source text for Content to approve:
  - the re-proposal reasons, such as "you added ‹ɓ› to your alphabet"
  - the FR-016 notice wording
  - the "passed — reason" wording
  - the unknown-evidence explanation on Convenience letters
  - the new marks screen labels
