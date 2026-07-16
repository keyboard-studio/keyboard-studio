---
description: "Task list for Facet Transform Engine (spec 039)"
---

# Tasks: Facet Transform Engine

**Input**: Design documents from [specs/039-facet-transform/](.)

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: INCLUDED. The spec's Success Criteria (SC-001..SC-006) and the plan's Testing section explicitly require vitest fixture tests (parity, invertibility, cause-tag preservation, opaque integrity, compile-regression decline, decline-with-reason). Test tasks are therefore first-class here.

**Organization**: Tasks grouped by user story (US1 P1 → US2 P2 → US3 P3) so each transform class ships and tests independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3 (setup, foundational, and polish tasks carry no story label)
- All paths are repo-relative. New engine module: `packages/engine/src/facet-transform/`

## Path Conventions

Engine module (working-copy mutation orchestration) per [plan.md](plan.md) Structure Decision:
- Engine code + fixtures + vitest specs: `packages/engine/src/facet-transform/`
- Package barrel re-export: `packages/engine/src/index.ts`
- Studio wiring: `packages/studio/src/`
- Docs: `docs/keyboard-index.md`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the module skeleton and the injected-measurement fixture harness so every later phase has a place to land.

- [ ] T001 Create the module directory + empty barrel `packages/engine/src/facet-transform/index.ts` and the `packages/engine/src/facet-transform/migrations/` subfolder, per [plan.md](plan.md) Source Code layout.
- [ ] T002 [P] Add module-scoped types file `packages/engine/src/facet-transform/types.ts` declaring `TransformImpactClass`, `LossProfile`, `CauseTag`, `PreviewKind`, and the `SourceFacetMeasurement` / `ExceptionSite` injected-input contract from [data-model.md](data-model.md) Entity 0.
- [ ] T003 [P] Create the fixture harness `packages/engine/src/facet-transform/fixtures/index.ts` that loads corpus `.kmn` bases (via `parseKmn`) and pairs each with a hand-authored `SourceFacetMeasurement` fixture (037/036 output shape), per [quickstart.md](quickstart.md) Prerequisites.
- [ ] T004 [P] Add a vitest smoke spec `packages/engine/src/facet-transform/module.test.ts` asserting the barrel exports resolve and the fixture harness loads at least one base + measurement (guards the module wiring before real logic lands).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The transition matrix, entity types, engine surface skeleton, and common commit gate that ALL three user stories depend on.

**⚠️ CRITICAL**: No user-story migration rule can be written until the matrix rows, the `MigrationRule`/`TransformProposal` types, and the common gate exist.

- [ ] T005 [P] Define `FacetTransition` and `MigrationRule` entity types in `packages/engine/src/facet-transform/types.ts` per [data-model.md](data-model.md) Entities 1–2 (natural key `(facetId, fromValue, toValue)`, sub-profile facet ids, `lossProfile`, `namedLosses`, `transformImpactClass`, `migrationRuleId`, `declineReason`).
- [ ] T006 [P] Define `TransformProposal`, `AffectedSite`, `TransformRefusal`, and `CommitResult` types in `packages/engine/src/facet-transform/types.ts` per [data-model.md](data-model.md) Entity 3 and the [transform-proposal.contract.md](contracts/transform-proposal.contract.md) engine surface.
- [ ] T007 [P] Define `HouseTargetPolicyRow` + `HouseTargetResolution` types in `packages/engine/src/facet-transform/types.ts` per [data-model.md](data-model.md) Entity 4 (ordered, first-match-wins; `isDefault`; provenance chip renders only when `isDefault === false`).
- [ ] T008 Author the value-transition matrix `packages/engine/src/facet-transform/transition-matrix.ts` — the v1 supported rows AND the declined-with-reason rows from [transition-matrix.contract.md](contracts/transition-matrix.contract.md) (depends on T005). Every requestable pair has a row (supported → `migrationRuleId`; unsupported → `declineReason`).
- [ ] T009 [P] Add the matrix invariant/drift-guard test `packages/engine/src/facet-transform/transition-matrix.test.ts` asserting the four matrix invariants from the contract: every requestable pair has a row, `lossless ⇒ behavior-preserving`, impact-class drift guard (row class equals sub-profile declared class), gate facets produce no rows (depends on T008).
- [ ] T010 Implement the ordered house-target policy resolver `packages/engine/src/facet-transform/house-target-policy.ts` (first-match-wins on `{script, displayDifficulty}` → `HouseTargetResolution`), per [data-model.md](data-model.md) Entity 4 (depends on T007).
- [ ] T011 Implement the common commit gate `packages/engine/src/facet-transform/verify.ts` — the class-dispatched `verify`, opaque-integrity diff of `ir.raw` (reusing the I4 `{feature,count}` inventory shape), and the one-shot undebounced `validateWithOracle`/`compile` regression check, per [transition-matrix.contract.md](contracts/transition-matrix.contract.md) "Common gate" and [transform-proposal.contract.md](contracts/transform-proposal.contract.md) "Commit gate" (depends on T005–T006). Imports `buildProducedSet`, `assertSemanticEquivalence`, `validateWithOracle`/`compile`, `simulate`, `generateCorpus` as black boxes.
- [ ] T012 Implement `proposeFacetTransform` (pure) and `applyFacetTransform` shells in `packages/engine/src/facet-transform/propose.ts` per the [transform-proposal.contract.md](contracts/transform-proposal.contract.md) engine surface: matrix lookup, gate/undetermined/declined → `TransformRefusal`; cause-tag → `AffectedSite.defaultDisposition`; accepted-subset commit filter; delegates the rewrite to a `MigrationRule` looked up by id and runs the T011 gate (depends on T008, T010, T011). Migration rule bodies are stubbed until their story phase.
- [ ] T013 Add a foundational spec `packages/engine/src/facet-transform/propose.test.ts` asserting the propose/refusal routing with a stub rule: gate facet → refusal, `undetermined` measurement → refusal, cause-tag → correct `defaultDisposition`, and no request→committed path skips a `TransformProposal` (SC-002 skeleton) (depends on T012).

**Checkpoint**: Matrix, types, gate, and propose/apply routing exist and are tested; the three migration rules can now be built independently.

---

## Phase 3: User Story 1 - Behavior-preserving encoding normalization (Priority: P1) 🎯 MVP

**Goal**: Normalize a mixed-encoding base to house style with byte-identical output and identical typing behaviour; reversible; house-target provenance chip when a non-default target fires.

**Independent Test**: Run the encoding transform toward house style on a mixed-encoding fixture; assert produced-output + behaviour unchanged (compile/simulate parity), source now matches house-style per role, and the transform is reversible (`assertSemanticEquivalence`).

### Tests for User Story 1

> Write these FIRST and confirm they FAIL before implementing the migration.

- [ ] T014 [P] [US1] Parity + invertibility test `packages/engine/src/facet-transform/migrations/encoding-spelling.test.ts` (SC-001): `buildProducedSet` equality, `simulate` finalOutput equality over `generateCorpus`, and `assertSemanticEquivalence(before, inverse(after)).equivalent === true` for `quoted-literal ↔ u-notation` and `mixed → house-style` (depends on T003).
- [ ] T015 [P] [US1] House-target provenance test `packages/engine/src/facet-transform/house-target-policy.test.ts` (US1 AC1): default target ⇒ no chip (`isDefault === true`); poorly-displaying-script fixture ⇒ `U+`-kept row fires with verbatim `explanation` and `isDefault === false` (depends on T010).
- [ ] T016 [P] [US1] Modifier-fold precondition test in `packages/engine/src/facet-transform/migrations/encoding-spelling.test.ts`: `named-modifier → split-modifier` emits the `LSHIFT`+`RSHIFT` pair; `split → named` refuses per-site when `LSHIFT`/`RSHIFT` outputs differ (never silently collapsed) per [transition-matrix.contract.md](contracts/transition-matrix.contract.md).

### Implementation for User Story 1

- [ ] T017 [US1] Implement the `encoding-spelling` migration rule `packages/engine/src/facet-transform/migrations/encoding-spelling.ts` — copy-return `apply(ir, acceptedSiteIds[])` rewriting output base/combining spelling (`'a' ↔ U+0061`) and within-kind input spelling; per-site modifier-fold precondition check; never touches the match-kind axis (depends on T012). Sets `verify` to the behavior-preserving path.
- [ ] T018 [US1] Wire `preset: 'house-style'` in `proposeFacetTransform` to resolve via the house-target policy and populate `houseTargetProvenance` + `previewKind: 'source-diff'` with per-role before/after (depends on T017, T010).
- [ ] T019 [US1] Register the `encoding-spelling` rule in the migration-rule lookup and export `proposeFacetTransform`/`applyFacetTransform`/`TRANSITION_MATRIX`/types from `packages/engine/src/facet-transform/index.ts` (depends on T017).
- [ ] T020 [US1] Add the `source-diff` proposal preview + partial-acceptance (per-role/per-site disposition) to the studio proposal UI and wire the transform stage into `useWorkingCopyTransform` + a `setWorkingIR` commit write in `packages/studio/src/` per [plan.md](plan.md) (depends on T019).

**Checkpoint**: US1 is fully functional and independently testable — the MVP (safest transform class establishes the propose→confirm→rewrite→verify pattern).

---

## Phase 4: User Story 2 - UX-changing mechanism switch (longpress → flick) (Priority: P2)

**Goal**: Switch dominant touch longpress to flick; preserve principled-split sites by default (named); surface gap-omission as a fix; refuse over-budget keys per-site; output unchanged.

**Independent Test**: Run longpress→flick over a fixture with a known principled-split and a known gap; assert the dominant mechanism switched, principled-split preserved unless opted in, gap offered as a fix, over-budget key refused per-site, and emitted *output* unchanged.

### Tests for User Story 2

- [ ] T021 [P] [US2] Cause-tag disposition test `packages/engine/src/facet-transform/migrations/longpress-to-flick.test.ts` (SC-004): principled-split sites → `defaultDisposition: preserve` and named; gap-omission → `fix-offered`; both hold in 100% of fixture cases (depends on T003).
- [ ] T022 [P] [US2] Output-unchanged + per-site-refusal test in `packages/engine/src/facet-transform/migrations/longpress-to-flick.test.ts`: `simulate` output identical after the switch (only input UX changed); a key whose subkey count exceeds the flick-direction budget is refused per-site with a reason, never truncated (depends on T003).

### Implementation for User Story 2

- [ ] T023 [US2] Implement the `longpress-to-flick` migration rule `packages/engine/src/facet-transform/migrations/longpress-to-flick.ts` — copy-return over `TouchLayoutIR`, rewrite `TouchKeyIR.sk` → `TouchKeyIR.flick` through `parseTouchLayout`/`emitTouchLayout`, set `TouchKeyProvenance` per rewritten key (never clobber hand-set), `derivesParameters: true` (compass direction per subkey), per-site over-budget refusal, `namedLosses: [discoverability]` (depends on T012).
- [ ] T024 [US2] Populate the `ux-description` preview: every `namedLoss`, the derived flick-direction table for review, per-site refusals with reasons, and the preserve/offer disposition per exception site, per [transform-proposal.contract.md](contracts/transform-proposal.contract.md) (depends on T023).
- [ ] T025 [US2] Register the `longpress-to-flick` rule in the lookup/barrel and add the `ux-description` + derived-parameter-review sub-step to the studio proposal UI (depends on T023, T020).

**Checkpoint**: US1 and US2 both work independently; cause-tag-aware preservation and derived-parameter review are exercised.

---

## Phase 5: User Story 3 - Output-changing normalization (NFD → NFC) (Priority: P3)

**Goal**: Migrate output NFD→NFC with the coordinated backspace-rule rewrite; present an output-level diff; require explicit confirmation; result still compiles.

**Independent Test**: Run NFD→NFC on a fixture with matching two-codepoint backspace overrides; assert output normalization changed, the now-unreachable backspace override was removed so single backspace deletes the composed codepoint, and an output diff was shown before commit.

### Tests for User Story 3

- [ ] T026 [P] [US3] Coordinated-rewrite test `packages/engine/src/facet-transform/migrations/nfd-to-nfc.test.ts` (US3 AC1): output rules composed to precomposed codepoints AND the matching two-codepoint backspace override removed; the two stay mutually consistent; the working copy still compiles (depends on T003).
- [ ] T027 [P] [US3] Output-diff + confirmation test in `packages/engine/src/facet-transform/migrations/nfd-to-nfc.test.ts` (US3 AC2): `previewKind: 'output-diff'` names the emitted-byte changes and the companion backspace rewrite; no commit without explicit confirmation (depends on T003).

### Implementation for User Story 3

- [ ] T028 [US3] Implement the `nfd-to-nfc` migration rule `packages/engine/src/facet-transform/migrations/nfd-to-nfc.ts` — copy-return composing base+combining RHS → precomposed codepoints, with `companionRewrites` removing the now-unreachable two-codepoint backspace override (Check #11-adjacent unreachable-rule removal, not synthesized), per [transition-matrix.contract.md](contracts/transition-matrix.contract.md) (depends on T012).
- [ ] T029 [US3] Implement the `output-diff` verify/preview path (emitted-byte diff; output is meant to change so not parity-checked, but must not break compile) and populate `TransformProposal.previewKind: 'output-diff'` (depends on T028).
- [ ] T030 [US3] Register the `nfd-to-nfc` rule in the lookup/barrel and add the `output-diff` preview + explicit-confirmation gate to the studio proposal UI (depends on T028, T020).

**Checkpoint**: All three transform classes are independently functional and tested.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Cross-story invariants, the decline/refusal registry coverage, FR-013 re-derivation, opaque integrity, and docs.

- [ ] T031 [P] Decline-with-reason + refusal test `packages/engine/src/facet-transform/refusals.test.ts` (FR-004, quickstart Scenario 4): gate facet, `input-match-kind key-ref→char-ref` (permanent), `nfc→nfd` (deferred), and `undetermined` measurement each return a `TransformRefusal` with the verbatim reason; none reaches `proposed`; none mutates the working copy (depends on T008, T012).
- [ ] T032 [P] Opaque-integrity test `packages/engine/src/facet-transform/opaque.test.ts` (SC-005, quickstart Scenario 5): a transform over a fixture with `RawKmnFragment` regions drops/alters nothing and reports `opaqueUntouched` (depends on T011).
- [ ] T033 [P] Compile-regression guard test `packages/engine/src/facet-transform/commit-gate.test.ts` (SC-006, quickstart Scenario 5): a transform that would produce an invalid working copy returns `status: 'commit-failed'`, leaves the working copy unchanged, and attributes the failure — with no second debounce timer (depends on T011, T012).
- [ ] T034 [US2] Fall-through + FR-013 re-derivation: compute `fallThroughImpact.producedCharacterSetDelta` when a transition (un)blocks base-layout fall-through, and on commit re-seed discovery axes (`seedIrAxesFromBaseIr` → `setIrAxes`) when the produced set changed, per [transform-proposal.contract.md](contracts/transform-proposal.contract.md) commit step 4 (depends on T020).
- [ ] T035 [P] Studio store test for FR-013 in `packages/studio/src/` asserting a produced-set-changing commit re-seeds the discovery-axis vector so strategy/gallery re-derive (depends on T034).
- [ ] T036 [P] Add any newly-cited fixture keyboards to [docs/keyboard-index.md](../../docs/keyboard-index.md) (mandatory phonebook update — read each keyboard's `.kps` for name/BCP47/author).
- [ ] T037 [P] Add the `facet-transform` module to the package inventory/architecture notes in [CLAUDE.md](../../CLAUDE.md) and confirm the barrel re-export lands after the `pattern-apply` block in `packages/engine/src/index.ts`.
- [ ] T038 Run the [quickstart.md](quickstart.md) validation: `pnpm --filter @keyboard-studio/engine test src/facet-transform`, then `pnpm typecheck` and `pnpm lint` — confirm all five scenarios pass.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories. T008 (matrix) and T011 (gate) are the critical-path items.
- **User Stories (Phase 3–5)**: All depend on Foundational (esp. T012 propose/apply shell). Given team capacity, US1/US2/US3 migration rules can then proceed in parallel (different files under `migrations/`).
- **Polish (Phase 6)**: Depends on the user stories whose behaviour it exercises (T034/T035 depend on US1 studio wiring; T031 on the matrix + propose shell).

### User Story Dependencies

- **US1 (P1)**: Only depends on Foundational. The MVP — establishes the propose→confirm→verify pattern.
- **US2 (P2)**: Depends on Foundational; shares the studio proposal UI shell from US1 (T020) for its `ux-description` variant (T025).
- **US3 (P3)**: Depends on Foundational; shares the studio proposal UI shell from US1 (T020) for its `output-diff` variant (T030).

### Within Each User Story

- Tests are written first and must FAIL before implementation.
- Migration rule (`apply`) before its preview population before its barrel/studio registration.

### Parallel Opportunities

- Setup: T002, T003, T004 in parallel.
- Foundational: T005, T006, T007 (type blocks) in parallel; T009 after T008.
- Once T012 lands, the three migration rules (T017 / T023 / T028) sit in separate files under `migrations/` and can be built in parallel by different developers.
- All `[P]` test tasks within a story run in parallel (distinct files, or additive specs).
- Polish: T031, T032, T033, T035, T036, T037 in parallel.

---

## Parallel Example: Foundational type blocks

```bash
# After T002 lands the file, these three additive type blocks can be authored together:
Task: "Define FacetTransition + MigrationRule types (T005)"
Task: "Define TransformProposal + AffectedSite + refusal/commit types (T006)"
Task: "Define HouseTargetPolicyRow + HouseTargetResolution types (T007)"
```

## Parallel Example: migration rules after Foundational

```bash
# All three migration rules live in separate files under migrations/ — parallel-safe:
Task: "Implement encoding-spelling migration (T017)"
Task: "Implement longpress-to-flick migration (T023)"
Task: "Implement nfd-to-nfc migration (T028)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (matrix + gate + propose shell — CRITICAL, blocks all stories).
3. Complete Phase 3: US1 (behavior-preserving encoding normalization).
4. **STOP and VALIDATE**: run the US1 fixture tests (SC-001 parity + invertibility) and the studio propose→confirm walk.
5. Demo: the safest transform class end-to-end.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 → parity/invertibility verified → demo (MVP).
3. US2 → cause-tag preservation + derived-parameter review → demo.
4. US3 → output diff + coordinated backspace rewrite → demo.
5. Polish → decline registry, opaque integrity, FR-013 re-derivation, docs.

### Parallel Team Strategy

1. Team completes Setup + Foundational together (T008 matrix and T011 gate are the long poles).
2. Then split: Developer A → US1 (T014–T020), Developer B → US2 (T021–T025), Developer C → US3 (T026–T030), each owning a file under `migrations/` plus its tests; they converge on the shared studio proposal UI (US1 lands the shell in T020, US2/US3 extend it).

---

## Notes

- [P] = different files, no dependency on an incomplete task.
- Every migration is copy-return over `KeyboardIR`/`TouchLayoutIR` (the `carveFilterIr` precedent) — never in-place, never raw `.kmn` text (Article II).
- The commit gate calls the EXISTING `validateWithOracle`/`compile` once, undebounced — no second debounce timer (Article IV, research D8/D9).
- No transform commits without a `TransformProposal` + explicit confirmation (FR-002 / SC-002).
- Console output uses `[OK]`/`[WARN]`/`[ERROR]`; no GitHub issue numbers in shipped code; `feat(engine)` commit style.
