---

description: "Task list for Lens-Vocabulary Single Source of Truth"
---

# Tasks: Lens-Vocabulary Single Source of Truth

**Input**: Design documents from `specs/045-lens-vocabulary-source-of-truth/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md)

**Tests**: INCLUDED — FR-006's runtime lockstep test is the feature's own safety net; FR-007's byte-identical-output requirement is verified by the existing facet-index/strategy-selector fixture suites, not new tests.

**Organization**: Tasks are grouped by user story (US1, US2). Research narrowed scope to A1/A4 only — A7 (`spare-key-budget`) is already correctly sourced and needs no change (research R1); no task touches it.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [x] T001 Create feature branch `km/lens-vocabulary-source-of-truth` off `main`
- [x] T002 Re-confirm research R1's scope-narrowing before editing anything: read `utilities/facet-index/spare-key-budget-classifier.ts` and confirm `export type SpareKeyBudget = KeyBudgetBand;` is still present and unchanged — if it has drifted since 2026-08-19, the A7 exclusion needs re-justifying before proceeding

---

## Phase 2: Foundational — Constitution Check resolution (BLOCKS implementation)

**Purpose**: FR-010 is an explicit gating question spec.md forbids assuming the answer to. Research R6 resolved it, but this must be confirmed live, not carried forward blindly, since a wrong answer here means an Article I violation.

- [x] T003 Confirm FR-010's resolution: `grep -rn "StrategyId" utilities/facet-index/added-char-count-classifier.ts utilities/facet-index/diacritic-mechanism-classifier.ts content/keyboard-facets/added-char-count.yaml content/keyboard-facets/diacritic-mechanism.yaml` returns zero matches — confirms this feature's real scope (A1/A4) never touches `StrategyId` or any locked `Pattern` field, so the Article I ritual (major version bump + joint session) does NOT trigger. If this grep finds a match, STOP and escalate per FR-010's own instruction rather than proceeding.

**Checkpoint**: Constitution Check gate cleared for real, not just carried from the plan.

---

## Phase 3: User Story 1 - One enumeration, three importers (Priority: P1) 🎯 MVP

**Goal**: The two genuine straggler classifiers (A1, A4) derive their value sets from the existing `packages/contracts` enumerations instead of hand-restating them.

**Independent Test**: Grep the straggler sites; confirm each derives from contracts; confirm facet-index build + strategy selector output is byte-identical to before.

### Implementation for User Story 1

- [x] T004 [P] [US1] In `utilities/facet-index/added-char-count-classifier.ts`: change `export type A1Band = "tiny" | "small" | "medium" | "large" | "massive";` to `export type A1Band = Scale;` (import `Scale` from `@keyboard-studio/contracts`), keeping the exported name `A1Band` so no call site needs to change (FR-001, FR-003)
- [x] T005 [P] [US1] In `utilities/facet-index/diacritic-mechanism-classifier.ts`: introduce `type A4Value = DiacriticBehavior;` (import `DiacriticBehavior` from `@keyboard-studio/contracts`), change `let value: string;` to `let value: A4Value;` (FR-001, FR-003)
- [x] T006 [US1] Run the facet-index build and the strategy-selector's existing fixture suite; confirm output is byte-identical to the pre-change baseline (FR-007, SC-003) — capture the before/after diff (or lack thereof) as evidence

**Checkpoint**: SC-001's "zero independent re-declarations" holds for A1/A4; behavior is unchanged (SC-003).

---

## Phase 4: User Story 2 - The copies cannot drift (Priority: P2)

**Goal**: A compile-time guard and a runtime lockstep test make future divergence impossible to merge.

**Independent Test**: Deliberately introduce a divergence on a scratch branch; confirm both the build and the lockstep test fail; revert and confirm both pass.

**Depends on**: US1 (T004/T005 — there must be one shared type before a guard can assert lockstep against it).

### Implementation for User Story 2

- [x] T007 [P] [US2] Add `type _A1BandGuard = Expect<AssignableTo<A1Band, Scale>>;` to `added-char-count-classifier.ts`, mirroring the `Expect<AssignableTo<...>>` idiom already in `packages/contracts/src/schemas.ts` (research R4) — placed alongside the classifier, not in `schemas.ts`, since `utilities/facet-index` must gain no new workspace-package edge beyond its existing contracts import
- [x] T008 [P] [US2] Add the equivalent `type _A4ValueGuard = Expect<AssignableTo<A4Value, DiacriticBehavior>>;` to `diacritic-mechanism-classifier.ts`
- [x] T009 [US2] Create `utilities/facet-index/lens-vocabulary-lockstep.test.ts` (research R5 — new file colocated with the classifiers, not `scriptAxes.test.ts`/`driftGuardrail.test.ts`, which cover different axes): asserts `content/keyboard-facets/diacritic-mechanism.yaml`'s and `added-char-count.yaml`'s `limits.values` sets equal `DiacriticBehavior`'s and `Scale`'s member sets respectively (the shared-core check, extension-tolerant per the spec's core+extension model for facet-only measurement values)
- [x] T010 [US2] Manually verify the guard fires: on a scratch change, add a value to one YAML's `limits.values` without adding it to the corresponding contracts type; confirm `pnpm typecheck` (via T007/T008's guards, if the divergence is type-level) or the lockstep test (T009, for the YAML-only case) fails; revert and confirm both pass again (SC-002)

**Checkpoint**: SC-002 — a deliberate divergence is caught by at least one of the two guards, every time.

---

## Phase 5: Polish & Cross-Cutting Validation

- [x] T011 [P] Run the full repeatable gate: `pnpm typecheck`, `pnpm test` (including the new lockstep test), `pnpm lint` (`pnpm depcruise`, `pnpm run facet-lint`, `pnpm run facet-index-lint`) — SC-004
- [x] T012 Cross-link this spec from [docs/lens-model.md](../../docs/lens-model.md) and vice versa, and cite the 2026-07-21 DISCUS↔facets overlap audit finding (per spec.md's Acceptance checklist)
- [x] T013 Record the Constitution Check outcome (FR-010 resolved: no locked field touched) in `docs/spec-signoff.md` if this repo's convention requires a signoff entry for a candidate-Article proposal (spec.md's "Constitution check (candidate gate)" section) — note the decision NOT to adopt a new mechanical Article in this pass (plan.md's own call), leaving that as a separate documentation decision for `.specify/memory/constitution.md`'s maintainers

---

## Dependencies & Execution Order

- **Setup (Phase 1)**: no deps.
- **Foundational Constitution re-check (Phase 2)**: after Setup. Blocks implementation — a positive `StrategyId` grep hit means STOP, not proceed.
- **US1 (Phase 3, P1)**: after Phase 2 clears. T004/T005 are `[P]` (different files).
- **US2 (Phase 4, P2)**: after US1 (T004/T005) — needs the shared type to exist before asserting lockstep against it. T007/T008 are `[P]` (different files); T009/T010 depend on both guards existing.
- **Polish (Phase 5)**: after the desired stories complete.

## Notes

- `[P]` = different files, no incomplete-task dependency.
- A7 (`spare-key-budget`) is explicitly out of scope (research R1) — no task touches `spare-key-budget-classifier.ts` or `content/keyboard-facets/spare-key-budget.yaml`.
- NG-001 through NG-005 (no DISCUS/facets merge, no runtime-behavior change, no §7.2 tree-logic change, no new facets/classifiers, no locked-field edit) are hard non-goals — do not expand scope during implementation even if a "while I'm in here" opportunity presents itself.
