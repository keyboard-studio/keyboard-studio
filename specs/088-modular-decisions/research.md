# Research: Decision store — one record per decision (spec 088)

**Phase 0 output of `/speckit-plan`.** Every claim below was verified against the code on
`km/modular-decisions` @ 07356c2f (which is `main` @ 18e63aa4 plus the 088–093 spec split).
Where the [HANDOFF.md](HANDOFF.md) map disagrees with the code, the code wins and the
correction is recorded in §1.

## 1. Verified code map (handoff G1/G3/G4/G6a, re-checked)

| Handoff claim | Verdict | Verified location |
|---|---|---|
| `decisionsFromTraversal` builds a two-entry set from session fields | ✅ exact | `packages/studio/src/steps/decisionsFromTraversal.ts:19-43` — only `authoring-track` and `touch-seed-source`, both `provenance: "asked"` |
| Built from both fields by `advance.ts` | ✅ (line drift) | `steps/advance.ts:176` (handoff said 173-177); `AdvanceContext` carries the fields at `:70` and `:78` |
| Built from track only by `resolveLocation.ts` | ✅ (line drift) | `lib/resolveLocation.ts:101` (handoff said 98-101); the omission of the seed is deliberate (comment `:94`) and must be preserved as a *view* over the store, not a second set |
| No store holds a `DecisionSet`; no draft saves one | ✅ | `grep decisionStore` → no hits. Stores are zustand 5 (`packages/studio/package.json` `zustand ^5.0.14`) under `packages/studio/src/stores/`; the one exception is the decision *log* (below) |
| Decision record in `reducer.ts` is the 053/055 log, not the 087 `Decision` | ✅ | `steps/reducer.ts:576-582` `recordStepCompletion` → `deps.recordDecision`; the 087 `Decision` is `decisions/decisionTypes.ts:165-170`: `{ id, value, provenance, source? }` only — no `inputs`, `offered`, or `step` yet (FR-001 adds them) |
| `DecisionProvenance` is `asked \| extracted \| default` | ✅, with a trap | `decisions/decisionTypes.ts:157` — **studio-local**. `packages/contracts` exports a *different* `DecisionProvenance` (the 053 record's agency/proposed shape, imported by `decisions/recordSurveyAnswers.ts`). FR-002's `"derived"` goes on the studio-local type only; FR-010 forbids touching contracts anyway |
| Answers saved by step: `surveyAnswerStore` | ✅ | `stores/surveyAnswerStore.ts` — `saveAnswer(stepId, answerId, …)` / `setStepAnswers(stepId, …)`; snapshot idiom `getSurveyAnswerSnapshot` / `applySurveyAnswerSnapshot` at the file's end; SurveyRunner keys by session `activeStepId` (`survey/SurveyRunner.tsx:469-475`) |
| `phaseAnswersByStep` in working copy | ✅ | `stores/workingCopyStore.ts:677` (field), maintained only inside `recordPhase` (`:2056-2083`), which StepHost calls for every SurveyPhaseResult-shaped completion (`components/StepHost.tsx:432-436`) |
| Decision-log slot key `stepId\|q\|questionId` | ⚠️ corrected | The store is `decisions/decisionLogStore.ts` (**not** `stores/`); `slotKeyOf` at `:148-158` joins with a `\u0000` delimiter, not a literal `\|`. **Slot keys are computed, never persisted** — entries persist `stepId` + `payload`, and supersession recomputes the key (`:230-236`, `:295`). So FR-008's re-keying is a change to `slotKeyOf` (+ its callers' inputs), and v1 logs re-key automatically on hydrate; no stored-key migration exists to write |
| Draft envelope saves five slices | ✅ (type moved) | Construction: `lib/draftPersistence.ts:776-794`. The `DurableDraft` type now lives in `lib/draftTypes.ts:107-143` (handoff cited the construction site). Slices: `workingCopy`, `traversal`, `phaseBDraft`, `decisionRecord`, `surveyAnswers` |
| Session copies of the two gated decisions | ✅ plus full reader list | `stores/surveySessionStore.ts:317` (`selectedTrack`), `:364` (`touchSeedSource`); setters `:840`, `:846-856` (the latter also clears the touch draft in the working copy — a side effect FR-005 must re-home, see D-06). Snapshot: `snapshotTraversal()` `:897-920` includes both fields. Readers beyond advance/StepHost: `StudioShell.tsx:979`, `components/StudioFooter.tsx:103`, `editors/assignLoop/TouchGallery.tsx:1761`, `editors/touchSeedSource/TouchSeedSourcePanel.tsx:227`, `editors/adapters/addTouchAdapter.tsx:49`, `steps/reducer.ts:174,505,521` (injected `setTouchSeedSource` dep) |
| Completion write path | ✅ named | `components/StepHost.tsx:432-451`: `recordPhase` + `routeAnswersThroughMutate` (`steps/reducer.ts:584-601`, registry lookup per answer), then `recordStepCompletion`, then `advance(...)` built from post-mutation session state (`:464-474`). FR-003's write belongs in this seam, beside `routeAnswersThroughMutate` |
| Parity tests named by FR-009 | ✅ all exist | `decisions/orderParity.test.ts`, `decisions/gateWalkParity.test.ts`, `steps/manifest.test.ts` (+ `steps/stepOrder.parity.test.ts`, `steps/decisionsFromTraversal.test.ts` which pins the helper FR-004 deletes) |
| StepHost is drivable in a store-level test | ✅ | `components/StepHost.test.tsx` exists and renders the real component; `steps/reducer.decisionRecording.test.ts` already seeds session fields and reads them back (`:284`) |

### 1a. Draft versioning — the load-bearing detail for FR-007/US3

- `DRAFT_VERSION = 1` at `lib/draftPersistence.ts:93`, with an explicit current policy
  comment: *"a draft whose stored version does not equal this is discarded, not
  migrated (VR-1)"*.
- The version is **in the localStorage key**: `draftKey()` → `ks.draft.<projectKey>.v1`
  (`:100-105`), and the boot scan filters keys by the `.v${DRAFT_VERSION}` suffix
  (`:408`). A naive bump to 2 makes v1 drafts *invisible*, not merely rejected.
- Every load path gates on `envelope.version !== DRAFT_VERSION` (at least
  `:436, :471, :1061, :1692`).
- `lib/draftTypes.ts:121-142` records the house precedent *against* bumps: `decisionRecord`
  and `surveyAnswers` were added as optional/additive fields **without** a bump,
  precisely because a bump "would throw away every existing author's in-progress
  keyboard". FR-007 mandates the bump anyway — so the plan must make the bump safe by
  construction (D-04), not by precedent.

### 1b. The split rule (spec edge case, 087 Q4)

Verified: **no live question module provides more than one decision** — 121 `provides`
declarations under `survey/questions/`, all single-id. The existing precedent is
`decisions/decisionFlow.ts` (final loop): *"One Decision per provided id: the module's
single answer/extract fills each decision it provides"* — a broadcast. The spec's edge
case says the split rule is the module's own, not the store's; broadcast-by-the-writer
satisfies that (the store never splits; the module-aware writer does, and a future
module needing a real split changes its writer entry, not the store).

### 1c. Pre-fill provenance (FR-003's second clause)

The live pre-fill machinery is survey-side, not decision-side: `SavedAnswer`
(`steps/answerTypes.ts:25-45`) carries `origin: "proposed" | "confirmed" | "overturned"`
and an optional `proposal { value, source? }`. `decisions/recordSurveyAnswers.ts`
`deriveAnswerProvenance` already performs exactly the comparison FR-003 needs for the
log (proposal match + source `base` ⇒ base-derived; match otherwise ⇒ tool-proposed;
differ/absent ⇒ hand-set). The decision-store writer reuses that comparison and maps
onto the 087 vocabulary (D-05).

### 1d. `phaseResults` is load-bearing beyond answers (FR-006 caution)

`phaseResults` is **not** answer storage only: `recordPhase` merges per-phase results
whose non-answer fields ride along (`useContextToleranceApply.ts:53` re-records a marks
entry; `survey/PhaseB.tsx:966,1491` emits inventory fields), `recordAssignments`
(`workingCopyStore.ts:2085-2098`) writes Phase C assignments into it, and
`mergePhaseResults` derives `workingCopy.session` from it (`:1346-1352`). FR-006
deletes `phaseAnswersByStep` and demotes `phaseResults` to a derived selector *if still
read* — it is still read, so the plan treats the answer-ownership map as the deletion
target and keeps the phase-field merge working (D-07).

## 2. Decisions

### D-01 — `decisionStore` is a new zustand store in `stores/`, following the surveyAnswerStore idiom
- **Decision:** Create `packages/studio/src/stores/decisionStore.ts`:
  `useDecisionStore` holding `decisions: DecisionSet`, with `record(record)`,
  `recordAll(records)`, `reset()`, plus module-level `getDecisionSnapshot()` /
  `applyDecisionSnapshot()` / `peekDecision(id)` mirroring
  `getSurveyAnswerSnapshot` / `applySurveyAnswerSnapshot` / `peekStepAnswers`.
- **Rationale:** Every persisted zustand store except the log follows this exact
  snapshot/apply idiom, and `draftPersistence` already imports those helpers from
  `stores/`. The log (`decisions/decisionLogStore.ts`) is the counter-precedent, but it
  is append-only history, not live state; live state belongs with the other live stores.
- **Alternatives:** `decisions/decisionStore.ts` beside the log — rejected: splits the
  snapshot/restore wiring `draftPersistence` does and invites an import cycle with
  `steps/` (depcruise `no-circular` is enforced, `.dependency-cruiser.cjs:17`).

### D-02 — The record type extends the studio-local `Decision`, in place
- **Decision:** Extend `decisions/decisionTypes.ts`: `DecisionProvenance` gains
  `"derived"` (FR-002, declared in 088, first *written* by 090), and `Decision` gains
  `inputs?: Partial<Record<DecisionId, unknown>>`, `offered?: unknown`, and
  `step?: string` (display metadata only, per FR-001). No new parallel record type.
- **Rationale:** `DecisionSet` is already the type `gatedBy` consumes
  (`steps/stepDependencies.ts:45`); a second record type would recreate the duplication
  this spec exists to delete. `exactOptionalPropertyTypes` is in force in this codebase
  (see `decisionFlow.ts`), so optional fields are only set when present.
- **Alternatives:** A separate `DecisionRecord` in the store — rejected (name also
  collides with the 053 `DecisionRecord` snapshot type, `decisionLogStore.ts:51`).

### D-03 — The completion writer lives beside `routeAnswersThroughMutate`
- **Decision:** Add `recordAnswersAsDecisions(result, stepId)` in `steps/reducer.ts`,
  called from `StepHost.handleComplete` in the same block as `recordPhase` /
  `routeAnswersThroughMutate` (`StepHost.tsx:432-436`). For each answer it looks the
  module up in `questionRegistry` (the same lookup `routeAnswersThroughMutate` does),
  and for each id in `module.provides` writes one record (broadcast per §1b) with
  `step: stepId`, `inputs` snapshotted from the store's current values of
  `module.requires`, and provenance per D-05.
- **Rationale:** That seam is the one place every survey-question completion already
  passes through, for every flow, including identity (via its adapter's generic path).
  Writing anywhere else (SurveyRunner, per-flow `onCommit`) would leave a second path —
  the G3 defect.
- **Alternatives:** Write from `surveyAnswerStore.saveAnswer` — rejected: saves fire per
  keystroke-level change (drafts included), while FR-003 says *completion*; the draft /
  confirmed distinction is `SavedAnswer.stage`'s whole purpose.

### D-04 — Draft v2: bump the writer, teach every reader to migrate v1 first
- **Decision:** `DRAFT_VERSION` → 2. A single `migrateDraftEnvelope(raw: unknown)`
  step runs **before** any `version !== DRAFT_VERSION` gate and before the key-suffix
  scan conclusion: it accepts a v1 envelope (found under the `.v1` key suffix *or* by a
  version-agnostic scan) and produces a v2 envelope whose `decisions` slice is built
  per D-08, whose `surveyAnswers` slice has survey-question answers removed (gallery
  answers remain until 090), and whose `decisionRecord` entries need no transformation
  (slot keys are computed, §1). All current version gates then see only v2.
- **Rationale:** FR-007 mandates both the bump and the migration; §1a shows the bump
  alone silently discards every existing draft — the exact outcome the draftTypes
  precedent warns against. One migration entry point keeps the ~5 gate sites from
  diverging.
- **Alternatives:** Keep version 1 and add `decisions` additively (the phaseBDraft /
  decisionRecord precedent) — rejected: FR-007 is explicit (`1 → 2`), and 093 will bump
  again to 3; the migration machinery has to exist now regardless.

### D-05 — Completion provenance mapping (FR-003)
- **Decision:** The writer derives provenance by comparing the completed value against
  the saved answer's `proposal` (the `deriveAnswerProvenance` comparison, §1c):
  value ≠ proposal or no proposal → `asked`; value = proposal with
  `proposal.source === "base"` → `extracted` (with `source` naming the starting-point
  keyboard where the recorder's existing lookup provides it); value = proposal
  otherwise → `default`. When an author overrode a proposal, the proposal's value is
  kept on the record as `offered` (FR-001).
- **Rationale:** Reuses the one comparison the codebase already trusts for the same
  question (it feeds the 053 log), and gives `extracted`/`default` their 087 meanings
  without waiting for 092's live extraction.
- **Alternatives:** Always `asked` in 088 — rejected: FR-003 explicitly requires the
  pre-fill provenance to survive acceptance, and SC-001 checks provenance on reload.

### D-06 — Session-field retirement: selectors, and re-homing the touch-draft side effect
- **Decision:** `authoring-track` / `touch-seed-source` readers move to selectors over
  `useDecisionStore` (`selectTrack`, `selectTouchSeedSource` helpers in the store file).
  `advance()` keeps its pure signature but its callers (StepHost `:464-474`,
  `StudioFooter`) pass values read from the decision store; `AdvanceContext` field
  names stay, so `advance.test.ts` changes are limited to fixture construction.
  `resolveLocation` keeps omitting the seed by evaluating `gatedBy` over a set with the
  seed record removed — a view, not a rebuild (§1). The `setTouchSeedSource` side
  effect (clearing `touchDraft` in the working copy when the seed changes,
  `surveySessionStore.ts:846-856`, also injected into the reducer at `reducer.ts:505,521`)
  moves to the touch-seed decision's *writer* call sites (`TouchSeedSourcePanel`,
  reducer touch cases) as an explicit `clearTouchDraftOnSeedChange` step — it must not
  hide inside the decision store (the store writes no other store; D-01).
- **Rationale:** FR-005 deletes the fields; the side effect is real behaviour (a stale
  touch draft must not survive a reseed) that today rides on the setter being deleted.
- **Alternatives:** Keep a session mirror synced from the store — rejected outright:
  that is the duplication FR-005 exists to remove, and SC-002 greps for it.

### D-07 — `phaseAnswersByStep` deletion is surgical: answers leave, phase fields stay
- **Decision:** `recordPhase` stops maintaining the per-step answer-ownership map.
  Question answers in a phase result are no longer stored in the working copy at all
  (they are in `decisionStore`, D-03); `phaseResults` keeps its non-answer phase
  fields and the Phase C assignments path, and a new selector
  `selectPhaseAnswers(decisions, phase)` in `workingCopyStore.ts` (or
  `steps/evidence.ts` if the cycle check prefers) derives a phase's question answers
  from `decisionStore` for the readers that consumed `phaseResults[p].answers` as
  answers (the `mergePhaseResults` session derivation is the named one to re-point).
- **Rationale:** §1d — a wholesale `phaseResults` deletion would break marks context
  tolerance, Phase B inventory fields, and Phase C assignments, none of which are
  survey-question answers and none of which 088 is chartered to move.
- **Alternatives:** Delete `phaseResults` entirely in 088 — rejected: out of charter,
  and the spec's own FR-006 wording is conditional ("*if* `phaseResults` is still
  read, it becomes a selector").

### D-08 — v1 → v2 answer migration maps through `provides`, orphans are surfaced, never dropped
- **Decision:** The migration walks a v1 envelope's `surveyAnswers.steps[*].answers`
  and `traversal` session fields: each answer's question id resolves through
  `questionRegistry[questionId].provides` (the same index `decisionIndex`,
  `survey/questions/registry.ts:377`, is built from) to its decision id(s);
  `selectedTrack` → `authoring-track`, `touchSeedSource` → `touch-seed-source`
  (both `provenance: "asked"`). An answer whose question id is absent from the
  registry is collected into a `migrationOrphans` list on the migrated envelope and
  surfaced to the author on load (087 Q5 precedent; the *surface* is OPEN-088-1 in
  plan.md — the owner has not chosen it). Log entries migrate by doing nothing
  (§1, slot keys are computed) except that `slotKeyOf` now keys survey-answer slots
  by decision id, resolved through the same registry lookup at append/supersede time.
- **Rationale:** `provides` is the only question→decision map that exists, and 087
  enforced exactly one provider per decision, so the mapping is total for live
  questions by construction.
- **Alternatives:** A hand-written question→decision table in the migration —
  rejected: a second copy of `provides`, guaranteed to drift.

### D-09 — Test strategy: live-app and real-StepHost only
- **Decision:** SC-001 is a new Playwright spec under `packages/studio/e2e/`
  (dev-server walk per the root `pnpm dev` script; `packages/studio` `test:e2e` =
  `playwright test`). SC-005/US1-AC2/US4 are store-level tests rendering the real
  `StepHost` (extending the `components/StepHost.test.tsx` harness) with a test
  registry in which `il_copyright_holder` sits in a different step. No test counts
  `DecisionsDemo` or `src/test/sc004Harness.ts` as evidence (spec's lesson from 087).
- **Rationale:** The spec's own acceptance language; both harnesses already exist.

## 3. Open items carried to plan.md

- **OPEN-088-1** (owner's call, recorded verbatim in plan.md): the surface on which an
  unmapped v1 answer is "shown to the author to re-answer" (US3 AC2) is not specified.
- The v1 fixture (SC-003) does not exist yet: existing precedents are
  `lib/__fixtures__/pre079-draft.json` and `prePrDraft.json`, consumed by
  `lib/draftPersistence.test.ts:2401`. Capturing the 088 fixture from `main` @
  18e63aa4 is a setup task (T002), not a research blocker.

## 4. T006 inventory — `recordPhase` callers and `phaseResults` answer readers

Appended by the 088 implementation (T006). Production callers of `recordPhase`
(workingCopyStore) outside tests:

| Caller | What it records |
|---|---|
| `components/StepHost.tsx:435` | Every manifest-step completion that is `SurveyPhaseResult`-shaped, with `{ stepId }` — the only caller whose answers are survey-question answers |
| `hooks/useContextToleranceApply.ts:53` | Re-records a marks phase entry to stamp `marksContextTolerance.appliedFingerprint` (non-answer field) |
| `survey/journey-runner.ts` (several) | Journey/walk harness completions, same shape as StepHost's |
| `survey/PhaseB.tsx:966,1491` | Emits inventory fields on the Phase B result (non-answer fields ride the merge) |

All other call sites are tests seeding phase state directly.

Readers of `phaseResults[p].answers` / `phaseAnswersByStep` in production code:

| Reader | What it actually consumes |
|---|---|
| `lib/persistWorkingCopy.ts:403,500` | Snapshot/restore of the `phaseAnswersByStep` sidecar itself |
| `survey/invisibles/InvisiblesStep.tsx` (`writingDirectionFrom`) | Phase-slot answers by *answer-level* question id (`writing_direction`, `pb_rtl_direction_confirm`, `invisibles.u200c`, …) — phase/gallery answers, not registry-module answers |
| `stores/workingCopyStore.ts` (`recordPhase`, `ownersOf`) | The ownership merge itself |
| `mergePhaseResults` (contracts `surveySession.ts`) | **Does not read `.answers` at all** — the session derivation consumes axes, inventories and other non-answer fields |

**Finding that changes T016/T017 (reported, not worked around):** the plan
(D-07) assumes a phase's question answers can be derived from `decisionStore`
via `selectPhaseAnswers(decisions, phase)`, with `mergePhaseResults` as the
named reader to re-point. Against the code: (a) `mergePhaseResults` never
reads answers; (b) the live contents of the phase slots' `answers` are
predominantly *gallery/phase* answers whose ids are not registry question ids
(`invisibles.u200c`, `convenience.*`, marks lists) — they become decisions
only in spec 090, so in 088 they have no decision record to derive from;
(c) no phase↔decision mapping exists (modules declare flows, not phases).
Deleting `phaseAnswersByStep` in 088 would therefore either drop gallery
answers on re-record (the spec-079 D-4 bug, for steps 088 is not chartered
to move) or require a replacement per-step storage under another name.
T016/T017 are stopped pending an owner/plan ruling; the sound subset — the
draft `surveyAnswers` slice (T015) and the decision records themselves —
proceeds, and `phaseAnswersByStep`'s remaining contents after US1 are exactly
the gallery answers the spec ledger assigns to 090.
