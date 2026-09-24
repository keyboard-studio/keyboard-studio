# Implementation Plan: Survey answers persist per question — navigation never undoes a decision

**Branch**: `km/079-survey-answer-persistence` | **Date**: 2026-09-24 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from [spec.md](spec.md) (clarified 2026-09-24). Code-level findings and
decisions are in [research.md](research.md), entities in [data-model.md](data-model.md), surfaces in
[contracts/](contracts/), and the validation guide in [quickstart.md](quickstart.md).

## Summary

The studio keeps some survey answers only while their question is on screen, and writes durable state
only when a step finishes. This feature makes three rules hold for every step, including the flow
defects from #1795, #1789 and #1796:

- An answer is **saved when it is given**.
- It is **recorded at each Next**.
- It is **re-proposed only when evidence it actually depends on changes**.

The technical approach reuses existing infrastructure wherever it already does the job:

- **One new store** (`surveyAnswerStore`) holds every question's saved answers, position and status.
  - `stepWalkStore`'s answer drafts and cursors move into it.
  - It persists as an optional field of the existing draft envelope, on the existing autosave timer
    (R-01).
- **Answer-grained evidence keys** are declared on each manifest step, and a **pure `reconcile` view**
  re-proposes without ever overwriting a saved answer. This makes "change it and change it back" free
  (R-02, R-03).
- **Recording moves from step completion to each Next**, through the existing `decisionLogStore.append`,
  which already dedupes and supersedes. Neither the record model nor `AnswerType` changes (R-04).
- **Point fixes** for each audited defect:

  | Defect | Fix | Decision |
  |---|---|---|
  | D-1 | Marks answers persist; stacking answers are recorded | R-04 |
  | D-2 / #1796 | Convenience letters persists; its gate becomes tri-state | R-09 |
  | D-3 | The prefill confirm is guarded by an alphabet evidence key, with carry-over on a real change | R-07 |
  | D-4 | Per-step ownership of phase answers | R-08 |
  | D-5 | Covered by the store move | R-01 |
  | D-6 | `applyMarkGuards` always strips before its early return | R-06 |
- **A two-tier journey strip.** Each section is one large mark, and the current section expands in
  place into one small mark per screen. Work-to-do badges come from a derived selector, and a
  non-blocking re-proposal notice rides the footer's existing live region (R-10, R-11, R-13).

## Technical Context

| Item | Value |
|---|---|
| Language/Version | TypeScript 5.x, React 18, Node ≥ 22.19.0 (hard floor) |
| Primary Dependencies | zustand (stores), Lingui (catalog), vitest + @testing-library/react, Playwright. No new dependency |
| Storage | Existing localStorage draft envelope (`DurableDraft`, `DRAFT_VERSION = 1`), with an additive optional field and no version bump (research F-7) |
| Testing | Per-package vitest (`pnpm --filter @keyboard-studio/studio test`, `… engine test`); studio Playwright e2e |
| Target Platform | Browser SPA ([packages/studio](../../packages/studio/)) |
| Project Type | pnpm monorepo. The change is almost entirely in `packages/studio`, plus one engine fix |
| Performance Goals | A saved answer is written synchronously in the change handler. A draft write is ≤ one per autosave debounce (500 ms), as today. The persisted answers stay small (keyed values, not walks) |
| Constraints | D3: no new timer, no validation path. 057 invariants: one jump mechanism, the session store stays the only "where am I". Record model and `AnswerType` unchanged. No contracts change |
| Scale/Scope | 15 manifest steps. Of these, 7 need fixes (identity, track, project_name, characters, marks, convenience, help), 3 need targeted fixes (punctuation, invisibles, carve), and 4 are verified by revisit test. Plus the footer strip |

Every Technical Context unknown is resolved in [research.md](research.md) Part II. None remains
`NEEDS CLARIFICATION`. The one decision the spec deferred to planning, gallery "apply fully vs hold and
batch", is resolved in R-05: apply fully.

## Constitution Check

*GATE: checked before Phase 0 and re-checked after Phase 1 (see the end of this file).*

| Article | Assessment | Evidence |
|---|---|---|
| I. Pattern schema locked | PASS | No `Pattern`, `AnswerType`, zod schema or contracts change. Marks answers use the existing `AnswerType`s (R-04). All new types are studio-local ([data-model.md](data-model.md)). |
| II. KeyboardIR is the spine | PASS | The only IR mutation touched is `applyMarkGuards`, an IR→IR function whose strip becomes unconditional (R-06). No raw `.kmn` handling. |
| III. Single working copy | PASS | Saved answers are survey state, not a second copy. The `phaseAnswersByStep` sidecar lives in the one working copy and is serialized only through the existing snapshot (R-08). |
| IV. Validator layering / one 300 ms cycle (D3) | PASS | Nothing added validates. The new store joins the **existing** autosave `setTimeout`, which D3 does not govern (CLAUDE.md, the D3 scope note). The FR-016 notice rides the Next, with no timer. The galleries keep their current D3 compile path (R-05). |
| V. VirtualFS only | PASS | No host-disk writes. The envelope stays in localStorage. |
| VI. Team boundaries | PASS, mixed ownership declared | **Engine** owns all code: studio stores, steps, footer, draft persistence, and the engine `mark-guards` fix. **Content** owns and reviews the re-proposal reasons, the FR-016 notice text, the "passed — reason" text, the Convenience letters unknown-evidence explanation and the new marks screen labels (R-14). |
| VII. Out of scope | PASS | No opaque-fragment editing, no Compare-tab writes (057 FR-021), no record-model change. |
| VIII. House conventions | PASS | Catalog ids follow `area(.segment)+`. No issue numbers in code or comments. Commits follow `prefix(area): …`. |
| IX. Manifest is the single survey surface | PASS | No new survey surface. The new `evidence?` and required `persistence` fields are declarations **on existing manifest entries** (R-02, R-12). IR writes still route through the existing seams (`mutate()` / `setWorkingIR`). |

No violations, so Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/079-survey-answer-persistence/
├── spec.md
├── plan.md                              # this file
├── research.md                          # Part I findings, Part II decisions R-01..R-14
├── data-model.md                        # stores, keys, reconcile view, work-to-do, marks
├── quickstart.md                        # validation guide per user story
├── contracts/
│   ├── step-classification.md           # FR-050 table (machine-checked, R-12)
│   ├── answer-store-contract.md         # store / evidence / reconcile / recorder / envelope API
│   └── journey-strip-contract.md        # two-tier strip, badges, notice, a11y, message ids
└── tasks.md                             # /speckit-tasks (not created here)
```

### Source Code (repository root)

```text
packages/studio/src/
├── stores/
│   ├── surveyAnswerStore.ts             # NEW (R-01): saved answers, position, status per step
│   ├── stepWalkStore.ts                 # keeps `walks` only; answerDrafts/cursors → compat selectors
│   ├── phaseBDraftStore.ts              # + sticky alphabetEvidenceKey (R-07)
│   └── workingCopyStore.ts              # recordPhase({stepId}) + phaseAnswersByStep (R-08)
├── steps/
│   ├── types.ts                         # + evidence?, persistence (R-02, R-12)
│   ├── manifest.ts                      # declarations on every entry
│   ├── manifest.persistence.test.ts     # NEW: FR-007 / SC-007 gate
│   ├── evidence.ts                      # NEW: pure key fns + reconcile (R-02, R-03)
│   └── workToDo.ts                      # NEW: selectWorkToDo (R-10)
├── survey/
│   ├── SurveyRunner.tsx                 # save via store; recordQuestionAnswers on Next
│   ├── CharactersStep.tsx               # guarded onConfirm + carry-over (R-07)
│   ├── marks/MarksSeriesStep.tsx        # state → store + reconcile; walk publish; per-station record
│   ├── punctuation/PunctuationStep.tsx  # alreadyConfirmed keyed by evidence (FR-022)
│   └── convenience/ConvenienceCharsStep.tsx  # store-backed; tri-state gate (R-09)
├── editors/carve/CarveGalleryV2.tsx     # no change; regression test only (R-09)
├── components/
│   ├── StepHost.tsx                     # pass stepId to recordPhase; recorder wiring
│   ├── StudioFooter.tsx, ProgressDot.tsx  # two tiers, badge, partial fill, notice (R-11, R-13)
├── decisions/
│   ├── progressDots.ts                  # sections × screens; recordedScreenOf grouping
│   └── createDecisionRecorder.ts        # + recordQuestionAnswers (R-04)
├── lib/draftPersistence.ts, draftTypes.ts, persistWorkingCopy.ts  # surveyAnswers?, sidecar, tolerant restore
└── locales/{en,fr}/messages.json        # new ids (Content-reviewed)

packages/engine/src/pattern-apply/
└── mark-guards.ts                       # strip before early return (R-06) + test
```

**Structure Decision**: this is an existing monorepo, and the feature lives in `packages/studio`, plus
one IR-function fix in `packages/engine`. No new package, and no change to `packages/contracts`.

## Delivery phases (input to /speckit-tasks)

The feature is multi-phase, so the constitution's one-conversation-per-phase rule applies. Each phase
is one commit, pushed on green.

| Phase | Scope | Closes |
|---|---|---|
| Setup + Foundational | `surveyAnswerStore`, envelope field and tolerant restore, autosave subscription, `stepWalkStore` compat move, `persistence` / `evidence` declarations with the manifest test, `evidence.ts` + `reconcile`, `recordPhase` sidecar (D-4), `recordQuestionAnswers` recorder dep | FR-001, FR-002, FR-007, FR-011, FR-030…FR-034, FR-031, FR-050 scaffolding |
| US1 (P1) | Marks, Convenience letters and the SurveyRunner steps are store-backed and restore their position. Per-Next recording. D-6 engine fix with revisit, idempotence and "blocked → none" tests | D-1, D-2, D-6; FR-003…FR-006, FR-008, FR-040, FR-051, FR-054; #1787 |
| US2 (P1) | Guarded prefill confirm on all three routes; punctuation evidence-keyed `alreadyConfirmed` | D-3; FR-020…FR-022 |
| US3 (P2) | `reconcile` wired into marks, characters carry-over (FR-015), work-to-do selector, in-step flagged list and Next gate, FR-016 notice, tri-state Convenience letters gate (#1796), two-tier journey strip with badges (#1795, #1789) | FR-010…FR-017, FR-041, FR-052, FR-060…FR-068 |
| US4 (P2) | Reload tests for marks and one SurveyRunner step; pre-feature draft fixture | FR-032, FR-053; SC-004 |
| Polish | FR-050 table closed (rows marked "verify by revisit test" either pass or are filed), Content string review, the spec's D-2 path link fixed, 057 / 053 / 071 amendment notes landed in those specs | FR-050, SC-006, SC-007 |

The journey strip sits in US3 because its badge half depends on `selectWorkToDo`. The grain fix alone
(#1795) could ship earlier, in US1, if tasks prefer. Its grouping needs only the `screenId` from R-04.

## Risks and open review points

1. **The FR-068 trail representation of "not asked"** (R-09). The trail reads the skip from the answer
   store, and the record gets no entry, because the record model is out of scope. If the 053 or 055
   owners require a record entry, that is an additive `DecisionPayload` kind: a contracts change, to be
   **escalated, not done silently**.
2. **Recording at intermediate Nexts** (R-04) makes every Next a 055 capture boundary. That is why
   `recordQuestionAnswers` is a recorder method: it pairs each append with `captureAtBoundary` →
   `attachImpact`, and never bypasses them. Tasks must verify two things:
   - An intermediate station's entries carry the `{state: "none"}` impact.
   - The final station's entries carry the whole series' diff.
3. **The size of the store move.** `stepWalkStore` cursors have several writers (the galleries,
   `useCharWalkPosition`, `jumpToLocation`). The compat selectors keep the move mechanical, but it
   touches the 057 footer and jump tests.

## Post-design Constitution Check

The Phase 1 artifacts ([data-model.md](data-model.md) and [contracts/](contracts/)) were re-checked
against Articles I–IX:

- Every new type is studio-local.
- The only engine change is an IR→IR function.
- The new store rides the existing autosave timer.
- The manifest gains declarations only.

**PASS**, with no new violations.

## Complexity Tracking

None. There are no constitution violations.
