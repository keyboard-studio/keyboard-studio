# Contract: decision store, draft v2, and log re-keying (spec 088)

Internal contracts between the studio's own modules (no external interface; nothing in
`packages/contracts`). An implementation that breaks any clause here breaks spec 088
even if its own tests pass.

## C-1. Store contract (`stores/decisionStore.ts`)

1. `record(r)` replaces any existing record with `r.id`, or inserts it. No other
   record changes. `recordAll` is `record` folded, in argument order.
2. The store holds no derived state: no cached subsets, no per-step indexes. Views
   are selectors computed at read time.
3. The store imports types from `decisions/decisionTypes.ts` only. It imports no
   other store, no step module, and no survey module. (Depcruise `no-circular` must
   stay green.)
4. `getDecisionSnapshot()` returns the live `DecisionSet` shape unchanged — the
   draft writer performs no transformation on it, and `applyDecisionSnapshot()`
   accepts exactly what `getDecisionSnapshot()` returns (round-trip identity).

## C-2. Completion-writer contract (`recordAnswersAsDecisions`, `steps/reducer.ts`)

1. Called once per survey-question step completion, from `StepHost.handleComplete`,
   in the same block as `recordPhase` / `routeAnswersThroughMutate`. No other call
   site may write question answers into the store.
2. For each answer: the module is `questionRegistry[answer.questionId]`; an answer
   whose question id has no registry entry writes nothing (this cannot happen for
   live questions — 087's registry tests pin one provider per decision).
3. For each id in `module.provides`, exactly one record is written, all carrying the
   answer's value (broadcast — research §1b), `step` = the completing step id, and
   `inputs` = the store's current values for `module.requires` (omitted when
   `requires` is empty/absent).
4. Provenance follows research D-05 exactly. `offered` is set only when a proposal
   existed and the completed value differs from it.
5. The writer is synchronous and introduces no timer, no async work, and no
   validation pass (D3 untouched).

## C-3. Gating contract (FR-004 / FR-005)

1. `gatedBy` is evaluated only over a `DecisionSet` read from `decisionStore`
   (callers may pass the live snapshot). `decisionsFromTraversal` and its test are
   deleted; no code rebuilds a decision set from session fields.
2. The one permitted deviation is a *view*: `resolveLocation` evaluates the set with
   the `touch-seed-source` record removed, preserving its current deliberate
   behaviour (a remembered seed must not strand the jump back to the chooser). The
   view is constructed by omission from the store snapshot at the call site, never
   stored.
3. After this spec, `grep -r "selectedTrack\|touchSeedSource" packages/studio/src`
   returns hits only in: the migration (§C-4), tests constructing v1 fixtures, and
   the `AdvanceContext` field names (which are fed from the store). No
   `surveySessionStore` field, setter, or snapshot member carries either name.

## C-4. Draft contract (FR-007 / US3)

1. Writer: `DRAFT_VERSION = 2`; the envelope's `decisions` slice is
   `getDecisionSnapshot()`; the persisted `surveyAnswers` slice contains no
   survey-question answers (gallery answers and within-step positions remain).
2. Reader: any envelope with `version === 1` is migrated by `migrateDraftEnvelope`
   before any version gate runs, including envelopes found under the `.v1`
   localStorage key suffix during the boot scan. A migrated envelope is
   indistinguishable from a native v2 envelope downstream.
3. Migration never drops data silently: every v1 answer ends up as (a) a decision
   record, (b) a retained gallery answer, or (c) an entry in `migrationOrphans`
   surfaced to the author. The migration test asserts (a)+(b)+(c) accounts for
   100% of the fixture's answers (SC-003).
4. On a session-field/log disagreement inside a v1 draft, the session field wins
   and the mismatch is logged to the console. No on-screen warning (house rule,
   spec edge case).

## C-5. Log contract (FR-008)

1. `slotKeyOf` for a `survey-answer` payload returns a key whose identity component
   is the payload's **decision id**, resolved through the registry. Two entries for
   the same decision supersede each other regardless of the step each was recorded
   on; two entries for different decisions never supersede, even on the same step.
2. Entries whose question id no longer resolves keep the legacy step-based slot
   (their history is preserved, not merged into a wrong decision).
3. `DecisionEntry.stepId` continues to be written on every entry, as display
   metadata.
