---

description: "Task list for Bake base-keyboard facets into the working-copy IR"
---

# Tasks: Bake base-keyboard facets into the working-copy IR

**Input**: Design documents from `specs/048-base-facets-in-ir/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/facet-set-api.md](contracts/facet-set-api.md)

**Tests**: INCLUDED — SC-002 (runtime matches offline classifier), SC-003 (override round-trip), SC-004 (undetermined never absent), SC-005 (additive-contract regression) are all test-gated, not just described.

**Organization**: Tasks are grouped by user story (US1 available, US2 overridable, US3 provenance). First increment: `casing` only.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [ ] T001 Create feature branch `048-base-facets-in-ir` off `main`
- [ ] T002 Re-confirm the hoist target: read `utilities/facet-index/casing-classifier.ts`'s `classifyCasing(ir, def)` in full and identify exactly which lines are the core casing determination (to be extracted) vs. the `Categorization` wrapper (to stay in `utilities/facet-index`)

---

## Phase 2: Foundational — the shared derivation hoist (BLOCKS every user story)

**Purpose**: FR-008's single-shared-derivation requirement must exist before anything bakes a facet into the IR.

- [ ] T003 Extract `classifyCasing`'s core determination logic into a new `deriveCasing(ir: KeyboardIR): { value: "cased" | "caseless"; determined: boolean }` function, in a location both `utilities/facet-index` and `packages/studio`/`packages/engine` can import (confirm at this task whether `packages/engine/src/facets/casing.ts` or a `packages/contracts`-side location avoids a circular import — research left this as a confirm-at-implementation-time decision)
- [ ] T004 Edit `utilities/facet-index/casing-classifier.ts`'s `classifyCasing` to call `deriveCasing` for its core value, then build the rest of `Categorization` (`confidence`, `confidenceClass`, `provenanceTier`, `evidenceSize`, `analyzedCoverage`, `analysisOutcome`) around that result exactly as it does today — no change to the offline report's output shape
- [ ] T005 Run the offline facet-index build against its existing fixtures; confirm byte-identical output to the pre-hoist baseline (this is the FR-008 "same input, same value" proof, structurally guaranteed by the hoist but verified here to catch an extraction mistake)

**Checkpoint**: The offline classifier's behavior is unchanged; the shared derivation function exists and is what the classifier itself now calls.

---

## Phase 3: User Story 1 - Facets are available at runtime from the working copy (Priority: P1) 🎯 MVP

**Goal**: A working copy's `casing` facet is readable through one accessor, with zero offline-artifact/network access.

**Independent Test**: Instantiate a working copy from a Latin base and a Devanagari base; confirm `casing = cased`/`caseless` respectively, read through one accessor.

### Tests for User Story 1

- [ ] T006 [P] [US1] Write `packages/contracts/src/facets.test.ts` (or colocated) asserting `getFacet(ir, "casing")` reads `ir.facets?.casing` correctly for a populated and an absent case (fails until T007 lands)

### Implementation for User Story 1

- [ ] T007 [P] [US1] Create `packages/contracts/src/facets.ts` — `FacetValue<T>`, `FacetSet` interfaces (per data-model.md; `casing` only for this increment) and the `getFacet` accessor
- [ ] T008 [US1] Add `facets?: FacetSet` to `KeyboardIR` in `packages/contracts/src/keyboard-ir.ts` (additive, optional)
- [ ] T009 [US1] Confirm `KeyboardIRSchema`'s `.passthrough()` in `packages/contracts/src/schemas.ts` — decide (per research R4) whether to add an explicit `facets: z.unknown().optional()` pin for documentation parity with `touchLayout`'s explicit pin, or rely on passthrough structurally; document the choice inline
- [ ] T010 [US1] Wire `deriveCasing` (T003) into `instantiateFromBase` in `packages/studio/src/stores/workingCopyStore.ts` (~line 1458): attach the derived facet as `ir.facets.casing` before the store sets the new working copy
- [ ] T011 [US1] Wire the same call into `instantiateFromExisting` (~line 1520) — Track 2 must derive facets identically to Track 1 (spec's own Edge Cases)
- [ ] T012 [US1] Integration test: instantiate a working copy from a representative cased base and a representative caseless base (real fixtures from `../keyboards`); assert `getFacet(ir, "casing")` matches the offline `utilities/facet-index` classification for the same keyboard (SC-002)
- [ ] T013 [US1] Confirm zero network/offline-artifact access during derivation — a test asserting `deriveCasing` does not touch `docs/keyboard-facet-index.json` or make any fetch call (FR-007, SC-001)

**Checkpoint**: US1 is independently demoable — a working copy's casing facet is readable, derived correctly, browser-safe.

---

## Phase 4: User Story 2 - Override a facet value (Priority: P1)

**Goal**: An author (or engine step) can override a facet; clearing restores the derived value.

**Independent Test**: Override a derived `casing`; confirm the effective value changes; clear the override; confirm it reverts.

**Depends on**: US1 (needs `facets` to exist and be populated before it can be overridden).

### Implementation for User Story 2

- [ ] T014 [P] [US2] Implement `setFacetOverride(ir, facet, value): KeyboardIR` in `packages/contracts/src/facets.ts` — pure function, returns a new IR with `provenance: "overridden"` (FR-004)
- [ ] T015 [P] [US2] Implement `clearFacetOverride(ir, facet, rederive): KeyboardIR` — re-derives rather than caching the pre-override value (FR-006)
- [ ] T016 [US2] Test: set an override on a working copy's `casing`, confirm `getFacet` returns the override (FR-005); clear it, confirm it returns the original derived value again (SC-003)
- [ ] T017 [US2] Confirm an override never mutates the base keyboard, the offline facet index, or any shared/off-working-copy data (FR-010) — a test asserting the base keyboard object is unchanged after an override

**Checkpoint**: SC-003 — override round-trip verified in test.

---

## Phase 5: User Story 3 - Provenance is visible (Priority: P2)

**Goal**: Every facet read carries `derived`/`overridden`/`undetermined` provenance.

**Independent Test**: Read a derived facet and an overridden facet; confirm provenance reports correctly for each.

### Implementation for User Story 3

- [ ] T018 [US3] Confirm `FacetValue.provenance` is set correctly at every write site: `"derived"` from `deriveCasing`'s success path, `"undetermined"` from its `determined: false` path (never absent — SC-004), `"overridden"` from `setFacetOverride`
- [ ] T019 [US3] Test: a base keyboard `deriveCasing` cannot classify reads as `FacetValue{value: "undetermined", provenance: "undetermined"}`, never as a missing key (SC-004)

**Checkpoint**: SC-004 — undetermined is always explicit, never silent absence.

---

## Phase 6: Polish & Cross-Cutting Validation

- [ ] T020 [P] Regression test: a base keyboard's `KeyboardIR` with no `facets` populated still parses, emits, and round-trips exactly as before this feature (SC-005, FR-009)
- [ ] T021 [P] Run the full repeatable gate: `pnpm typecheck`, `pnpm --filter @keyboard-studio/contracts test`, `pnpm --filter @keyboard-studio/engine test`, `pnpm --filter @keyboard-studio/studio test`, `pnpm lint` (`pnpm depcruise` — confirm no new boundary violation from the hoist location chosen in T003)
- [ ] T022 Confirm no facet metadata is emitted into the produced `.kmn`/`.kps` output (explicit non-goal) — a spot-check on the output serializer
- [ ] T023 Confirm `packages/studio/src/adaptation/evidence.ts` (`AdaptationEvidenceProvider`) and `packages/studio/src/survey/charNormUtils.ts` (`caseCounterpart`) are unchanged — this feature does not touch or supersede either (research R5)

---

## Dependencies & Execution Order

- **Setup (Phase 1)**: no deps.
- **Foundational hoist (Phase 2)**: after Setup. Blocks every user story — nothing can derive a facet until the shared function exists.
- **US1 (Phase 3, P1)**: after Phase 2. T007/T006 are `[P]` (different files, test-first).
- **US2 (Phase 4, P1)**: after US1 (needs facets populated to override). T014/T015 are `[P]`.
- **US3 (Phase 5, P2)**: after US1 (needs derived values to check provenance on) — can run alongside US2 since they touch different concerns (override vs. provenance-of-derived), but US3's "overridden" provenance check (if any) implicitly needs US2's `setFacetOverride`.
- **Polish (Phase 6)**: after the desired stories complete.

## Notes

- `[P]` = different files, no incomplete-task dependency.
- First increment is `casing` only — do not add other facets (directionality, script-family, etc.) in this pass; the `FacetSet` shape is designed to accept them later without redesign (data-model.md).
- No `.kmn`/`.kps` output change, no `AdaptationEvidenceProvider`/`caseCounterpart` change — both explicit non-goals (T022/T023 are verification tasks, not implementation tasks).
