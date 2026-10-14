# Implementation Plan: Decision store — one record per decision

**Branch**: `km/modular-decisions` (planning); implementation lands on the first stacked branch `km/decision-store`, cut from `km/modular-decisions` | **Date**: 2026-10-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/088-modular-decisions/spec.md`, source plan
[HANDOFF.md](HANDOFF.md), research in [research.md](research.md), entities in
[data-model.md](data-model.md), internal contracts in
[contracts/decision-store-contract.md](contracts/decision-store-contract.md).

## Summary

Spec 087 unified decision *ordering*; underneath, no live `DecisionSet` exists —
`gatedBy` is evaluated over a two-entry set rebuilt per call from session fields
(`steps/decisionsFromTraversal.ts`), answers are saved keyed by step in three places
(`surveyAnswerStore`, `workingCopy.phaseAnswersByStep`, the decision log's step-keyed
slots), and drafts save all of it. This plan creates the one live record: a zustand
`decisionStore` holding one `Decision` record per decision id; a single completion
writer in the StepHost seam that writes every survey-question completion into it
(split per the providing module's `provides`, provenance derived from the saved
answer's proposal); `gatedBy` evaluated over that store and the two session-field
copies (`selectedTrack`, `touchSeedSource`) deleted; question answers removed from
`surveyAnswerStore` persistence (the draft slice too); drafts bumped to
version 2 with a `decisions` slice and a v1→v2 migration that maps step-keyed
answers through `provides` and surfaces — never drops — anything unmapped; and the
decision log re-keyed by decision id. No visible change: the three parity suites
pass unmodified.

## Technical Context

**Language/Version**: TypeScript (repo stack), Node ≥ 22.19.0 (hard floor), pnpm 9.12.0

**Primary Dependencies**: React + zustand `^5.0.14` (existing studio store library);
no new dependencies. Vitest per package; Playwright `^1.61.1` for the live walk.

**Storage**: In-memory zustand stores; durable drafts in localStorage via
`lib/draftPersistence.ts` (`DurableDraft` envelope, versioned key `ks.draft.<key>.v<N>`).
No host-disk writes during authoring (Constitution Art. V).

**Testing**: Per-package vitest (never bare `vitest` at root); store-level tests
rendering the real `StepHost` (`components/StepHost.test.tsx` harness); Playwright
e2e in `packages/studio/e2e/` against `pnpm dev`. Parity suites:
`decisions/orderParity.test.ts`, `decisions/gateWalkParity.test.ts`,
`steps/manifest.test.ts`.

**Target Platform**: The studio SPA (`packages/studio`) in the browser.

**Project Type**: Web application — monorepo package (`packages/studio`); engine and
contracts untouched.

**Performance Goals**: No new timers and no work added to the 300 ms D3 validation
cycle (FR-010). The completion writer is synchronous and O(answers × provides) per
completion — bounded by one step's question count.

**Constraints**: No `packages/contracts` change; no i18n id change; no new timer;
`DecisionProvenance`'s `"derived"` is added to the **studio-local** type in
`decisions/decisionTypes.ts`, not the contracts type of the same name (research §1);
gallery steps keep saving as today until 090; session `identityResult` /
`scaffoldSpec` / help docs stay until 089 (spec ledger).

**Scale/Scope**: One package, ~12 source files touched, 5 deleted-or-shrunk
(`decisionsFromTraversal.ts` + its test deleted; session fields removed;
`phaseAnswersByStep` NOT removed here — retired by 090, see the Q8 ruling note below).
121 question modules already declare single-id `provides` (verified) — no
module annotation changes needed.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Article | Assessment |
|---|---|
| I — Pattern schema locked | PASS — no `packages/contracts` file changes; the provenance extension is studio-local (FR-002/FR-010). |
| II — KeyboardIR is the engine spine | PASS — no codec/IR work; no `RawKmnFragment` handling changes. |
| III — Single persistent working copy | PASS — the working copy is untouched as the one copy; 088 removes the answer copy in `surveyAnswerStore`/the draft slice, not `phaseAnswersByStep` (retired by 090 per the Q8 ruling), and it does not add a second copy or any intermediate serialization. Full derived-keyboard replay is 093. |
| IV — Validator layering / single D3 cycle | PASS — no new timer, no validation path added; the writer runs at completion, outside the debounce cycle (contract C-2.5). |
| V — VirtualFS only | PASS — drafts remain localStorage envelopes; no host-disk writes. |
| VI — Team boundaries | PASS — Engine (studio) owns stores, routing, draft persistence. No content-owned surface (prompts, gallery order, catalogs) changes. Declared owner: **Engine team**. |
| VII — Out of scope for v1 | PASS — nothing from the §16 list is touched. |
| VIII — House conventions | PASS — commit titles in the locked vocabulary (`feat(studio):`, `maint(studio):`, `docs(spec):`); no issue numbers in shipped code/comments; no emoji in console output; file references as markdown links in docs. |
| IX — No survey surface outside the decision registry | PASS, and strengthened — answers move *into* the decision registry's store; every write goes through the one completion seam (C-2); ordering sources are untouched (no hand-maintained list added or changed). The registry declaration requirement is satisfied by existing `provides`/`requires` (verified complete for live questions by 087's registry tests). |

**Post-design re-check (after Phase 1):** no article's assessment changed. The one
design point that could have strained Art. III — `phaseResults` — is handled
surgically (research D-07): only its answer-ownership map is deleted; the phase-field
merge and Phase C assignments that ride it are not survey-answer storage and stay.

No unjustified violations → **Complexity Tracking is empty** (see below).

## Project Structure

### Documentation (this feature)

```text
specs/088-modular-decisions/
├── spec.md                            # already written (specify)
├── HANDOFF.md                         # series source plan (already written)
├── decision-spine.html                # series overview (already written)
├── plan.md                            # this file
├── research.md                        # Phase 0: verified code map + D-01..D-09
├── data-model.md                      # Phase 1: record, store, draft v2, log re-key
├── contracts/
│   └── decision-store-contract.md     # Phase 1: C-1..C-5 internal contracts
├── quickstart.md                      # Phase 1: SC-001..SC-005 validation guide
├── checklists/
│   └── requirements.md                # spec quality checklist
└── tasks.md                           # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
packages/studio/src/
├── decisions/
│   ├── decisionTypes.ts               # EXTEND: provenance +"derived"; Decision +inputs?/offered?/step?
│   ├── decisionLogStore.ts            # FR-008: slotKeyOf keys survey-answer slots by decision id
│   └── recordSurveyAnswers.ts         # reuse: deriveAnswerProvenance comparison (research §1c)
├── stores/
│   ├── decisionStore.ts               # NEW: useDecisionStore + snapshot/apply/peek + track/seed selectors
│   ├── surveySessionStore.ts          # FR-005: selectedTrack/touchSeedSource + setters + snapshot members deleted
│   ├── surveyAnswerStore.ts           # FR-006: question answers no longer persisted (position/status/gallery stay)
│   └── workingCopyStore.ts            # unchanged by 088 (phaseAnswersByStep retired by 090 — Q8 ruling)
├── steps/
│   ├── reducer.ts                     # NEW writer recordAnswersAsDecisions beside routeAnswersThroughMutate
│   ├── decisionsFromTraversal.ts      # DELETE (FR-004) — and decisionsFromTraversal.test.ts
│   └── advance.ts                     # context now fed from decisionStore at call sites (signature kept)
├── components/
│   └── StepHost.tsx                   # call writer in handleComplete; advance ctx from store
├── lib/
│   ├── draftPersistence.ts            # FR-007: DRAFT_VERSION 2, decisions slice, migrateDraftEnvelope (runs before all version gates + boot scan)
│   ├── draftTypes.ts                  # DurableDraft + decisions slice
│   ├── resolveLocation.ts             # FR-004: gatedBy over store snapshot minus seed record (view, C-3.2)
│   └── __fixtures__/
│       └── v1-draft-18e63aa4.json     # NEW: v1 draft captured from main @ 18e63aa4 (SC-003)
├── editors/                           # FR-005 readers re-pointed to selectors:
│   ├── touchSeedSource/TouchSeedSourcePanel.tsx   # + re-homed touch-draft clear (D-06)
│   ├── adapters/addTouchAdapter.tsx
│   └── assignLoop/TouchGallery.tsx
├── StudioShell.tsx                    # FR-005 reader re-pointed
├── components/StudioFooter.tsx        # FR-005 reader re-pointed
└── (tests colocated with each file above)

packages/studio/e2e/
└── decision-store-reload.spec.ts      # NEW: SC-001 Playwright walk in pnpm dev
```

**Structure Decision**: All work lands inside the existing `packages/studio/src`
layout — the new store follows the `stores/` snapshot idiom, the writer follows the
`steps/reducer.ts` seam precedent, and the migration follows the `draftPersistence`
tolerant-restore precedent. No new directories, no new packages.

## Implementation phases (commit cadence: one commit per phase, pushed as it goes green)

1. **Foundation** — record type extension (FR-001/FR-002), `decisionStore` + snapshot
   idiom, v1 fixture capture. No behaviour change.
2. **US3 plumbing first (reader before writer)** — `migrateDraftEnvelope` and the
   version-gate/boot-scan changes land *before* anything writes v2, so no build ever
   writes a draft it cannot also read back or migrate (Risk R-1).
3. **US1 (P1)** — completion writer + StepHost wiring; question answers stop being
   persisted from `surveyAnswerStore`; draft v2 write side flips on (writer +
   reader together). (`phaseAnswersByStep` deletion/selector re-pointing moved
   to 090 by the Q8 ruling — T016/T017 stopped.)
4. **US2 (P1)** — `gatedBy` over the store; `decisionsFromTraversal` deleted;
   session fields/selectors migration incl. the re-homed touch-draft side effect.
5. **US4 (P2)** — log re-keying by decision id; moved-question StepHost test (SC-005,
   which also closes US1's AC2); orphan surfacing for US3 in the decision trail
   (OPEN-088-1 ruled 2026-10-06 — see below; the collection machinery is in
   phase 2's tasks regardless).
6. **Polish** — parity suites unmodified (SC-004), grep gates (SC-002), Playwright
   walk (SC-001), full studio suite + lint + typecheck.

## Risks

- **R-1 Draft data loss on the version bump.** The bump changes the localStorage key
  suffix and every load gate (research §1a). Mitigation: migration is a task-gated
  phase of its own, lands *before* the writer flips to v2, and SC-003's fixture test
  must be green before the bump commit exists.
- **R-2 `recordPhase` merge semantics.** `phaseAnswersByStep` is the ownership map
  inside the phase merge; multi-step phases depend on replace-only-my-answers
  behaviour (spec 079 D-4). Mitigation: foundational task T006 inventories every
  `recordPhase` caller and every reader of `phaseResults[].answers` before the
  deletion tasks (T016/T017) are written against that inventory. **Outcome: the
  inventory falsified the deletion premise (live phase answers are predominantly
  gallery answers that become decisions only in 090); the owner ruling 2026-10-06 (km-lead proposals Q8) stops
  T016/T017 and assigns the retirement to 090.**
- **R-3 Hidden readers of the session fields.** Verified reader list is in research
  §1; a reader missed by it compiles fine (the selector returns the same types) but
  behaves wrong if it read during render from the session closure. Mitigation:
  SC-002's grep gate plus the gate-walk parity suite.
- **R-4 The `advance()` context shape.** `advance.test.ts` and
  `decisionsFromTraversal.test.ts` construct contexts by hand; deleting the helper
  deletes the second file outright and narrows the first's fixture changes to
  construction only (advance's pure logic is untouched).

## Open questions (owner's calls — recorded verbatim, NOT decided by this plan)

- **OPEN-088-1 — RESOLVED by owner ruling 2026-10-06 (Matthew, adopting the
  km-lead proposals, Q1; ~/workspace/keyboard-studio-notes/modular-decisions-proposals.md).**
  Spec US3, Acceptance Scenario 2: *"Given a v1 answer whose question no longer
  exists, When it loads, Then it is shown to the author to re-answer, never
  dropped (087 Q5 precedent)."* The spec did not name the surface. **Ruled: the
  decision trail.** Each orphaned answer is written as a decision-log entry
  visible in the trail, carrying its value, following the trail's existing
  entry shapes and FR-035 degrade behaviour; no new surface, no notice-store
  machinery. T030 is implemented on that basis.
- **Q8 (same ruling) — `phaseAnswersByStep` disposition.** The T006 inventory
  falsified the T016/T017 premise (see R-2's outcome above): the field is
  **retired by spec 090** as a tail task after its US4, not deleted by 088.
  FR-006's 088 scope is the surveyAnswerStore + draft-slice removal only.

No other open questions: every other point the research phase surfaced was settled
by the spec's own text (console-only mismatch logging; session field wins) or is a
technical decision recorded in [research.md](research.md) D-01..D-09.

## Complexity Tracking

> No Constitution Check violations — this table is intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
