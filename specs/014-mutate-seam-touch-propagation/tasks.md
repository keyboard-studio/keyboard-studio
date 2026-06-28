---
description: "Task list for Phase 5 — KeyboardIR mutate seam + touch propagation"
---

# Tasks: KeyboardIR `mutate` seam + touch propagation

**Input**: Design documents from `specs/014-mutate-seam-touch-propagation/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: INCLUDED — the spec Success Criteria (SC-002..SC-009) and Q7 explicitly require per-question `mutate` output tests, provenance-tagged round-trip/no-clobber tests, and validator probes. Test tasks are NOT optional for this feature.

> ## ⚠️ ALL TASKS ARE GATED — DESIGN-ONLY / BLOCKED on #5b/#232
>
> This feature is **DESIGN-ONLY / BLOCKED** on the engine mutation contract **#5b/#232** (spec Q1=A, FR-001). **No task below may be executed until that contract ratifies, the §18 joint engine+content session lands the `TouchKeyIR` MAJOR bump, and [plan.md](plan.md) is re-validated against the ratified IR shape** (gates G-I/G-II/G-VI). Tasks tagged **[BLOCKED on #5b/#232]** are *hard-blocked* on the contract itself; the gate task **T000** must clear first regardless.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1–US5 (maps to spec.md user stories)
- **[BLOCKED on #5b/#232]**: hard-blocked on the unratified engine mutation contract
- All paths are repo-relative; root is `/workspace/keyboard-studio`.

---

## Phase 1: Setup & Gate (Shared Infrastructure)

**Purpose**: clear the dependency gate and capture the parity baseline before any code change.

- [ ] T000 **[BLOCKED on #5b/#232]** Confirm the engine mutation contract #5b/#232 has ratified, the §18 joint engine+content session is scheduled/recorded, and re-validate [plan.md](plan.md) Technical Context + the `writes` `IRPath`s in `packages/studio/src/survey/questions/` against the ratified `KeyboardIR` shape (gates G-I/G-II/G-VI; research.md D4 module-count reconciliation). Record the reconciled in-scope module set in the PR description. NOTHING else may start until this clears.
  - **[DONE] Module-count reconciliation (research.md D4):** the in-scope non-empty-`writes` set is **5** (`a/iso_code.ts`, `a/primary_script.ts`, `a/language_name_english.ts`, `a/pa_copyright_holder.ts`, `b/pb_standard_letters.ts`) — the earlier "8" was a stale P2-era snapshot, superseded by the P3 loader cutover + #781 legacy retirement. The strategy-bearing carve/mechanism/touch writes live in the `editors/` carve/add shell (FR-006a), not in question modules. Dependency gate cleared by **#822** (merged to main; contracts **0.12.0**). The remaining T000 prongs (the §18 joint-session record + full plan re-validation against the ratified shape) stay open.
- [ ] T001 [P] Capture the green P4b baseline: run `pnpm typecheck`, `pnpm --filter @keyboard-studio/studio test`, `pnpm --filter @keyboard-studio/contracts test`, `pnpm depcruise`; record pass counts in the PR as the byte-identical-to-P4b reference (SC-008).
- [ ] T002 [P] Create the new studio skeleton files (empty/`.gitkeep` placeholders): `packages/studio/src/flags/mutateFlag.ts`, `packages/studio/src/steps/mutateApply.ts`, `packages/studio/src/steps/repropagate.ts`, and `packages/studio/tests/fixtures/` for provenance-tagged layouts.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the contract field, the global flag, and the patch-apply helper that every user story builds on.

**⚠️ CRITICAL**: No user-story work can begin until these exist. T003–T006 are hard-blocked on the contract.

- [ ] T003 **[BLOCKED on #5b/#232]** Add the `provenance: "base-derived" | "physical-suggested" | "hand-set"` field to `TouchKeyIR` in `packages/contracts/src/keyboard-ir.ts` per [contracts/provenance.contract.md](contracts/provenance.contract.md) (P1/FR-008).
- [ ] T004 **[BLOCKED on #5b/#232]** Mirror the provenance field in the zod schema `packages/contracts/src/schemas.ts` in the SAME change (Art. I drift guard, P4); export the provenance type from `packages/contracts/src/index.ts`.
- [ ] T005 **[BLOCKED on #5b/#232]** Bump `@keyboard-studio/contracts` to the next MAJOR in `packages/contracts/package.json` and record the §18 coordination note (FR-011, P5/SC-010).
- [ ] T006 **[BLOCKED on #5b/#232]** Convert `packages/studio/src/editors/assignLoop/provenance.ts` `TouchKeyProvenance` into a RE-EXPORT of the contracts type (delete the parallel union + keep `defaultProvenance()` returning `"hand-set"`); update importers' specifiers incl. extension (FR-008/-009, P1/P2).
- [ ] T007 [P] Implement the single global flag in `packages/studio/src/flags/mutateFlag.ts` per [contracts/flag-and-validator.contract.md](contracts/flag-and-validator.contract.md) F1/F3 (build/deploy-time global; no live toggle) (FR-015).
- [ ] T008 **[BLOCKED on #5b/#232]** Implement the pure patch-apply helper `packages/studio/src/steps/mutateApply.ts`: path-scoped deep merge at declared `writes` `IRPath`s (M2/Q9) + fail-fast whole-patch declared-`writes` containment assertion in all builds (M3/Q11) + idempotent application (M4). Per [contracts/mutate-seam.contract.md](contracts/mutate-seam.contract.md).
- [ ] T009 [P] **[BLOCKED on #5b/#232]** Unit-test `mutateApply.ts` in `packages/studio/tests/steps/mutateApply.test.ts`: path-scoped merge preserves siblings (M2), out-of-`writes` patch rejected whole + IR unchanged + error surfaced (M3), empty patch `{}` is a no-op (M5), idempotent (M4).

**Checkpoint**: contract field + flag + patch-apply helper exist and are tested; stories can begin.

---

## Phase 3: User Story 1 — One write surface: `mutate()` replaces the direct-IR fork (Priority: P1) 🎯 MVP

**Goal**: `mutate()` is the single executed IR write path for all in-scope surfaces; the answer-store-vs-direct-IR state fork is closed.

**Independent Test**: take an in-scope non-empty-`writes` module (one of the 5 identity/header writers) + a known IR fixture, apply its `mutate()`, confirm the IR differs only at declared `writes`; confirm the carve/add edits (which carry the strategy-bearing carve/mechanism/touch writes) land through `mutate()`, not direct `workingCopyStore` mutators.

### Tests for User Story 1 ⚠️ (write first, ensure they FAIL)

- [ ] T010 [P] [US1] **[BLOCKED on #5b/#232]** Per-question `mutate` output test for each in-scope non-empty-`writes` module in `packages/studio/tests/survey/questions/<phase>/<id>.test.ts` (the 5-module identity/header set reconciled in T000): applies to a known IR fixture, writes exactly declared `writes` (siblings byte-identical, SC-002), out-of-`writes` fails fast/whole-patch-rejected (SC-002), idempotent (SC-003), round-trips reused IR fixtures (SC-004). Per [contracts/mutate-seam.contract.md](contracts/mutate-seam.contract.md).
- [ ] T011 [P] [US1] **[BLOCKED on #5b/#232]** Carve/add-shell test in `packages/studio/tests/editors/carve/CarveGallery.test.tsx` (+ add-gallery equivalent): an author edit produces a `mutate()` patch routed through the reducer; the direct `workingCopyStore` carve mutators are no longer the IR write path (AC US1-2).
- [ ] T012 [P] [US1] **[BLOCKED on #5b/#232]** Display-only / answer-store-only no-op test: a display-only (empty `writes`) module performs no `mutate()` IR change (AC US1-3, FR-007).

### Implementation for User Story 1

- [ ] T013 [US1] **[BLOCKED on #5b/#232]** Activate `mutate?(value, ctx): Partial<KeyboardIR>` in `packages/studio/src/survey/types.ts` (un-stub the P2 comment; pure signature) (FR-002).
- [ ] T014 [US1] **[BLOCKED on #5b/#232]** Wire `applyStepCompletion` in `packages/studio/src/steps/reducer.ts` to call `mutateApply.ts` for in-scope step ids when the flag is on (path-scoped merge + containment assert + idempotent); gated by `mutateFlag` (FR-002/-005, M6).
- [ ] T015 [P] [US1] **[BLOCKED on #5b/#232]** Implement `mutate()` in each of the 5 non-empty-`writes` identity/header modules under `packages/studio/src/survey/questions/<phase>/<id>.ts` (reconciled set from T000), returning a `Partial<KeyboardIR>` patch scoped to that module's declared `writes` (FR-006b).
- [ ] T016 [US1] **[BLOCKED on #5b/#232]** Convert `packages/studio/src/editors/carve/CarveGallery.tsx` to express carve edits as a `mutate()` patch routed through the reducer; retire `deleteNode`/`restoreNode`/`deleteItem`/`restoreItem`/`restoreAll`/`keepAll` as the in-scope IR write path in `packages/studio/src/stores/workingCopyStore.ts` (FR-006a).
- [ ] T017 [US1] **[BLOCKED on #5b/#232]** Convert the add galleries (`packages/studio/src/editors/assignLoop/`) to route their selected-pattern writes through `mutate()` instead of direct IR writes (FR-006a).
- [ ] T018 [US1] **[BLOCKED on #5b/#232]** Repo audit + depcruise rule confirming zero direct `workingCopyStore` IR mutations from the converted carve/add shell and zero other IR write routes for the 5 non-empty-`writes` modules when the flag is on (SC-001); update `.dependency-cruiser.cjs`.

**Checkpoint**: `mutate()` is the single write path for in-scope surfaces; US1 independently testable.

---

## Phase 4: User Story 2 — Physical change re-suggests only derived keys, never clobbers manual edits (Priority: P1)

**Goal**: a physical change auto-re-propagates touch suggestions over only derived keys; hand-set keys are never overwritten.

**Independent Test**: provenance-tagged fixture mixing `base-derived`/`physical-suggested`/`hand-set`; trigger re-propagation off a physical-step completion; confirm only the first two are overwritten and 100% of `hand-set` are byte-identical.

### Tests for User Story 2 ⚠️

- [ ] T019 [P] [US2] **[BLOCKED on #5b/#232]** No-clobber test in `packages/studio/tests/steps/repropagate.test.ts` using provenance-tagged touch-layout fixtures (`packages/studio/tests/fixtures/`): re-suggests only `base-derived`/`physical-suggested`, 100% of `hand-set` byte-identical (R2/SC-005); empty-hand-set trivial pass (AC US2-4).
- [ ] T020 [P] [US2] **[BLOCKED on #5b/#232]** Promotion test: a manual edit to a `physical-suggested` key promotes it to `hand-set`; a subsequent re-propagation leaves it untouched (R4/SC-006).
- [ ] T021 [P] [US2] **[BLOCKED on #5b/#232]** Coalescing test: one physical change marks several steps stale → re-propagation runs once over the union closure, each derived key re-suggested at most once (R3/Q10); no-dependents case is a no-op (R5).

### Implementation for User Story 2

- [ ] T022 [US2] **[BLOCKED on #5b/#232]** Implement `packages/studio/src/steps/repropagate.ts`: read the `workingCopyStore` `staleSteps` slice, re-run `touchSuggest` over the coalesced union of the staleness closure (R1/R3), overwrite only non-`hand-set` keys (R2). Per [contracts/repropagation.contract.md](contracts/repropagation.contract.md).
- [ ] T023 [US2] **[BLOCKED on #5b/#232]** Tag produced keys with provenance in `packages/studio/src/editors/touchSuggest/touchSuggest.ts` (`physical-suggested` for suggestions, `base-derived` for base-derived) (FR-012).
- [ ] T024 [US2] **[BLOCKED on #5b/#232]** Trigger `repropagate.ts` from `applyStepCompletion` (`packages/studio/src/steps/reducer.ts`) on physical-lock break / physical-step completion, gated by `mutateFlag` (R1/FR-012).
- [ ] T025 [US2] **[BLOCKED on #5b/#232]** Implement the `physical-suggested` → `hand-set` promotion on manual edit in `packages/studio/src/editors/assignLoop/touchBehavior.ts` (R4/FR-014).

**Checkpoint**: re-propagation safe + no-clobber holds; US2 independently testable.

---

## Phase 5: User Story 3 — Per-key provenance lives on the contract and survives round-trip (Priority: P2)

**Goal**: provenance is a durable contract field surviving serialize/round-trip; the editor type is a re-export.

**Independent Test**: round-trip a `KeyboardIR` with provenance-tagged touch keys; confirm every tag preserved and the editor `TouchKeyProvenance` resolves to the contracts type.

> Foundational tasks T003–T006 already land the contract field, zod mirror, MAJOR bump, and re-export. This phase adds the durability tests and the default-on-missing behavior.

### Tests for User Story 3 ⚠️

- [ ] T026 [P] [US3] **[BLOCKED on #5b/#232]** Round-trip test in `packages/contracts` (e.g. `packages/contracts/src/keyboard-ir.test.ts`): a `KeyboardIR` with provenance-tagged touch keys serializes → deserializes with every tag intact (P3/SC-007); untagged/legacy keys deserialize as `hand-set` (FR-009).
- [ ] T027 [P] [US3] **[BLOCKED on #5b/#232]** Single-source test: assert `editors/assignLoop/provenance.ts` resolves to the contracts type (no second definition) (P1/SC-007).

### Implementation for User Story 3

- [ ] T028 [US3] **[BLOCKED on #5b/#232]** Ensure deserialize applies the `hand-set` default to untagged/legacy touch keys in the contracts (de)serialization path (FR-009/-010, P2/P3).

**Checkpoint**: provenance durable across save/load; US3 independently testable.

---

## Phase 6: User Story 4 — A global flag makes the whole seam reversible (Priority: P2)

**Goal**: flag off ⇒ byte-identical to P4b, zero `mutate()`; flag on ⇒ `mutate()` is the write path.

**Independent Test**: flip the flag off, run the full spine, confirm IR + behavior byte-identical to P4b and zero `mutate()` calls; flip on, confirm `mutate()` is the write path.

> The flag itself is built in T007 (foundational). This phase wires it through and proves the rollback.

### Tests for User Story 4 ⚠️

- [ ] T029 [P] [US4] **[BLOCKED on #5b/#232]** Byte-identical-to-P4b test in `packages/studio/tests/survey/flagOff.test.ts`: full-spine run with flag off produces IR + observable behavior equal to the recorded P4b baseline and zero `mutate()` calls execute (F2/SC-008).
- [ ] T030 [P] [US4] **[BLOCKED on #5b/#232]** Flag-on test: `mutate()` is the IR write path for in-scope surfaces (F1/SC-008).

### Implementation for User Story 4

- [ ] T031 [US4] **[BLOCKED on #5b/#232]** Ensure every `mutate()` execution site (reducer apply T014, re-propagation trigger T024) is gated on `mutateFlag`, and the flag-off path falls back to the P4b declared-only seam with no other code change (F1/F2/FR-015/-016).

**Checkpoint**: rollback proven both states; US4 independently testable.

---

## Phase 7: User Story 5 — Real per-spine-prefix validator replaces the 012 structural proxy (Priority: P3)

**Goal**: shippability check graduates from structural proxy to the real per-spine-prefix validator against the `mutate()`-produced working copy.

**Independent Test**: per spine prefix, run the real validator against the `mutate()` working copy; passes base-template-derived prefixes, flags a deliberately broken one; distinct from inputs-satisfiability; no second debounce.

### Tests for User Story 5 ⚠️

- [ ] T032 [P] [US5] **[BLOCKED on #5b/#232]** Validator test in `packages/studio/tests/dashboard/completeness.test.ts` (extend C4): real validator passes base-template-derived prefixes, flags a deliberately broken prefix (V1/SC-009); stays distinct from C5 inputs-satisfiability (V2).
- [ ] T033 [P] [US5] **[BLOCKED on #5b/#232]** Article IV probe: assert no second debounce timer / parallel validation path is introduced (V3/SC-009).

### Implementation for User Story 5

- [ ] T034 [US5] **[BLOCKED on #5b/#232]** Replace 012's structural proxy `checkSpinePrefixShippability` in `packages/studio/src/dashboard/completeness.ts` (C4) with a call to the real Layer-A validator (`engine/src/validator`) against the `mutate()`-produced working copy at each prefix, within the existing single debounce/validation path (FR-017/-018, V1/V3).

**Checkpoint**: real validator wired; US5 independently testable.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T035 [P] **[BLOCKED on #5b/#232]** Update `docs/` / spec cross-links to record the contracts MAJOR bump + §18 coordination note landing (SC-010).
- [ ] T036 [P] **[BLOCKED on #5b/#232]** Run the [quickstart.md](quickstart.md) validation table end-to-end (all 11 checks, both flag states) and record results in the PR.
- [ ] T037 **[BLOCKED on #5b/#232]** Full green gate: `pnpm typecheck`, `pnpm --filter @keyboard-studio/studio test`, `pnpm --filter @keyboard-studio/contracts test`, `pnpm depcruise` all pass; confirm flag-off output matches the T001 baseline (SC-008).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup & Gate (Phase 1)**: T000 (the dependency gate) BLOCKS everything. T001/T002 can run once T000 clears.
- **Foundational (Phase 2)**: depends on Setup; BLOCKS all user stories. T003→T004→T005→T006 are sequential (same contract change); T007 [P]; T008→T009.
- **User Stories (Phase 3+)**: all depend on Foundational. US1 is the MVP and the substrate US2/US4/US5 build on (they need an executed `mutate()`); US3 is mostly delivered by Foundational + its own tests.
- **Polish (Phase 8)**: depends on all desired stories.

### User Story Dependencies

- **US1 (P1)**: after Foundational. The headline — others depend on `mutate()` existing.
- **US2 (P1)**: after US1 (needs the executed write surface + reducer wiring) + the provenance field (Foundational).
- **US3 (P2)**: after Foundational (the contract field). Independently testable.
- **US4 (P2)**: after US1/US2 wiring (gates their execution sites); the flag itself is Foundational (T007).
- **US5 (P3)**: after US1 (needs the `mutate()`-produced working copy).

### Parallel Opportunities

- T001, T002 [P] after T000.
- T007 [P] alongside T003–T006.
- Within US1: T010/T011/T012 [P] (tests), T015 [P] (per-module `mutate()` across different files).
- Within US2: T019/T020/T021 [P]. Within US3: T026/T027 [P]. Within US4: T029/T030 [P]. Within US5: T032/T033 [P].
- Polish: T035/T036 [P].

---

## Parallel Example: User Story 1

```bash
# Tests first (must FAIL before implementation):
Task: "Per-question mutate output tests — T010"
Task: "Carve/add-shell routing test — T011"
Task: "Display-only no-op test — T012"

# Then per-module mutate() across different files:
Task: "Implement mutate() in the 5 non-empty-`writes` identity/header modules — T015"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Clear the gate (Phase 1, T000) — **mandatory**.
2. Foundational (Phase 2): contract field + zod mirror + MAJOR bump + re-export + flag + patch-apply helper.
3. US1 (Phase 3): `mutate()` as the single write path.
4. **STOP and VALIDATE**: US1 independently (SC-001/-002/-003/-004).

### Incremental Delivery

US1 (write surface) → US2 (no-clobber re-propagation) → US3 (durable provenance) → US4 (rollback flag proof) → US5 (real validator). Each adds value without breaking the previous; the flag (US4) lets every increment ship rollback-safe.

---

## Notes

- **Every task is gated**: T000 must clear and the plan re-validated against the ratified #5b/#232 contract before any execution (FR-001).
- `[BLOCKED on #5b/#232]` = hard-blocked on the unratified engine mutation contract / locked-surface edit.
- [P] = different files, no dependency on an incomplete task.
- Tests are required for this feature (SC-002..SC-009, Q7) — write them before implementation and verify they fail.
- Commit after each task or logical group; commit/issue titles follow `<prefix>(<area>): …` (Constitution Art. VIII).
- **Total tasks: 38 (T000–T037).**
