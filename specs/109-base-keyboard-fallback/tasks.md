# Tasks: Base-keyboard fallback

**Spec**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Data model**: [data-model.md](data-model.md) · **Contract**: [contracts/fallback-contract.md](contracts/fallback-contract.md)

Format: `- [ ] **T###** [P?] [US#] Description · file`. `[P]` = independent within its wave.

No Setup phase: the workspace, codegen and test harnesses already exist.

Story phases run in dependency order, not priority order: data (US3) and the enumerator (US4) feed the surface (US1) and the compile (US2). US1 may ship before US2 only with the FR-005 "removed keys only" copy.

## Phase 1: Foundational (blocks every story)

Files: `packages/contracts/src/fallbackPolicy.ts`, `packages/contracts/src/schemas.ts`, `packages/studio/src/survey/carve/fallbackPolicyMigration.ts`, `packages/studio/src/stores/workingCopyStore.ts`

**Wave 1 — one task (the type):**

- [x] **T001** Change `FallbackPolicy` to `{ letters, digits, punctuation }` of `Disposition`, default all `"swallow"`; add `LeakClass` · packages/contracts/src/fallbackPolicy.ts

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — independent (different files):**

- [x] **T002** [P] Update `FallbackPolicySchema` and both drift guards in the same commit; accept the legacy single value on parse · packages/contracts/src/schemas.ts
- [x] **T003** [P] Widen a legacy single value to all three classes and record `confirmed: false` (FR-021) · packages/studio/src/survey/carve/fallbackPolicyMigration.ts
- [x] **T004** [P] Hold `fallbackPolicy` per class and `fallbackPolicyConfirmed` (missing in old drafts reads false), persisted in the draft envelope · packages/studio/src/stores/workingCopyStore.ts

**⟶ Wait for Wave 2 to finish, then:**

- [x] **T005** Foundational tests: schema round-trip and drift, migration of old drafts, store persistence · packages/contracts/src/fallbackPolicy.test.ts, packages/studio/src/survey/carve/fallbackPolicyMigration.test.ts

**Checkpoint**: policy is per class and persisted; no compiled output has changed (SC-006).

## Phase 2: User Story 3 — character data for every catalog layout (P2)

Files: `scripts/codegen-base-layouts.mjs`, `scripts/codegen-windows-layouts.mjs`, `packages/studio/src/lib/generated/baseLayouts.generated.json`, `packages/studio/src/lib/referenceBaseLayouts.ts`, `packages/studio/src/lib/referenceBaseLayouts.codegen.test.ts`

**Wave 1 — one task:**

- [x] **T006** [US3] Extend `BASE_KEYBOARDS` to all 186 catalog layouts from their `basic_kbd*` sources, pin the corpus commit and a SHA-256 per source (FR-030, FR-031, FR-032) · scripts/codegen-base-layouts.mjs

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — independent (different files):**

- [x] **T007** [P] [US3] Keep the Windows-layout codegen in step with the widened import · scripts/codegen-windows-layouts.mjs
- [x] **T008** [P] [US3] Widen `BaseLayoutId` to the catalog ids; a layout without data yields "unknown", never a family guess · packages/studio/src/lib/referenceBaseLayouts.ts

**⟶ Wait for Wave 2 to finish, then:**

- [x] **T009** [US3] Regenerate the JSON (`pnpm prebuild` path, never hand-edit) · packages/studio/src/lib/generated/baseLayouts.generated.json
- [x] **T010** [US3] Codegen drift test over all catalog layouts, including `basic_kbdgr` (SC-004) · packages/studio/src/lib/referenceBaseLayouts.codegen.test.ts

**Checkpoint**: all 186 layouts carry data; the codegen test fails on drift.

## Phase 3: User Story 4 — one enumerator (P2)

Files: `packages/engine/src/pattern-apply/unhandledPositions.ts` and its test, engine index export.

**Wave 1 — one task:**

- [x] **T011** [US4] `enumerateUnhandledPositions(ir)`: positional, base-keyboard independent, sets `layerBound`, excludes frame keys (FR-040) · packages/engine/src/pattern-apply/unhandledPositions.ts

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — independent (different files):**

- [x] **T012** [P] [US4] Unit tests: overlay keyboard, unused layer, Caps layer, deadkey rules, frame keys · packages/engine/src/pattern-apply/unhandledPositions.test.ts
- [x] **T013** [P] [US4] Export from the engine without importing the studio (FR-041) · packages/engine/src/index.ts

**Checkpoint**: one function answers "which positions are unhandled". The SC-005 equivalence test against spec 108's fill lands with that spec's fill (follow-up, owner Engine, trigger: spec 108 fill implementation).

## Phase 4: User Story 2 — "Do nothing" is true (P1)

Files: `packages/engine/src/pattern-apply/swallowSet.ts`, `swallowUndefined.ts`, `fallbackPolicy.ts`, `fallbackProposal.ts`, `carvePipeline.ts` (and their tests), `packages/studio/src/lib/projectWorkingCopyVfs.ts`, `packages/studio/src/lib/projectionInput.ts`

**Wave 1 — independent (different files):**

- [ ] **T014** [P] [US2] Per-class `isInSwallowSet` predicate; deadkey carves still always suppress (FR-012) · packages/engine/src/pattern-apply/swallowSet.ts
- [ ] **T015** [P] [US2] Per-class dispositions: carved combination takes the class of its leak on the picked base keyboards, "any picked" rule (FR-015) · packages/engine/src/pattern-apply/fallbackPolicy.ts
- [ ] **T016** [P] [US2] `proposeFallbackPolicy`: per-class proposal with evidence, target script, no-data fallback to catalog language tags (FR-020) · packages/engine/src/pattern-apply/fallbackProposal.ts

**⟶ Wait for Wave 1 to finish, then:**

- [ ] **T017** [US2] `applySwallowUndefined` via `mutate()`: one store, one `nul` rule, bound layers only, no frame keys, no `nomatch > nul`, nothing when all classes pass through (FR-010, FR-011, FR-013, FR-014) · packages/engine/src/pattern-apply/swallowUndefined.ts

**⟶ Wait for Wave 1's tasks and T017, then:**

- [ ] **T018** [US2] Thread per-class policy, leaks and the confirmed gate through the carve pipeline (FR-015, FR-021) · packages/engine/src/pattern-apply/carvePipeline.ts

**⟶ Wait for T018 to finish, then:**

- [ ] **T019** [US2] Pass picks and base-layout character data into projection; unconfirmed policy leaves compiled output unchanged · packages/studio/src/lib/projectWorkingCopyVfs.ts, packages/studio/src/lib/projectionInput.ts

**⟶ Wait for T019 to finish, then:**

### Tests

- [ ] **T020** [US2] Tests: `swallowSet`, `fallbackPolicy`, `swallowUndefined` (store recompute on binding change, no double emit with carve suppression, RALT unbound), `fallbackProposal` (SC-007 three keyboards with evidence) · packages/engine/src/pattern-apply/swallowUndefined.test.ts, fallbackProposal.test.ts, swallowSet.test.ts, carvePipeline.fallbackPolicy.test.ts
- [ ] **T021** [US2] Corpus compile through Layer A/B and `kmcmplib` with "Do nothing" confirmed; no unhandled printable position outputs, frame keys intact (SC-002); unconfirmed draft output byte-equal before and after (SC-006) · packages/engine/src/pattern-apply/swallowUndefined.corpus.test.ts

**Checkpoint**: "Do nothing" suppresses every unhandled printable position on covered layers.

## Phase 5: User Story 1 — see what leaks (P1)

Files: `packages/studio/src/editors/fallback/FallbackPolicySection.tsx` and its test, `packages/studio/src/locales/en/**`, `packages/studio/src/locales/fr/**`, `packages/studio/e2e/fallback-policy.spec.ts`

**Wave 1 — one task:**

- [ ] **T022** [US1] Rebuild the section: title naming the base keyboards (FR-001), one leak list per picked base keyboard grouped by class, primary first (FR-002), deadkey and "unknown" entries, studio-guess caption when no picks (FR-003), A2 copy rules (FR-004), "Do nothing" copy variant chosen by whether `swallowUndefined` is active (FR-005), per-class summary line when collapsed (FR-006), per-class proposals with evidence and a confirm action (FR-020, FR-021), "not covered" marks for unbound layers; derived on render, no timer (FR-007) · packages/studio/src/editors/fallback/FallbackPolicySection.tsx

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — independent (different files):**

- [ ] **T023** [P] [US1] Lingui message ids with French in the same change (spec 046) · packages/studio/src/locales/en, packages/studio/src/locales/fr
- [ ] **T024** [P] [US1] Component tests: two picks, no-data base, deadkey entry, collapsed summary, no picks, copy-variant pairing (SC-003), retired slogan absent, accessibility (spec 056) · packages/studio/src/editors/fallback/FallbackPolicySection.test.tsx
- [ ] **T025** [P] [US1] Playwright walk: `sil_cameroon_qwerty` with UK English lists AltGr+4 → € (SC-001) · packages/studio/e2e/fallback-policy.spec.ts

**Checkpoint**: the author sees every leak per base keyboard and confirms a per-class choice.

## Phase 6: Polish

- [ ] **T026** Update the phonebook row for any new keyboard cited, and the spec 076 AS-BUILT cross-reference to FR-005 shipping · docs/keyboard-index.md, specs/076-rule-behaviours/AS-BUILT.md
- [ ] **T027** Validate against the Success Criteria: run `pnpm lint`, the contracts, engine and studio suites, and the Playwright walk (SC-001 to SC-007; SC-005 deferred as noted in Phase 3)

## Dependencies & Execution Order

Foundational → US3 and US4 (independent of each other, may run in parallel) → US2 (needs T001-T004, T011, T009 data for tests) → US1 (needs T001-T004, T006-T010, T011, T016; copy variant needs T017) → Polish.

- Phase 1: T001, then T002/T003/T004, then T005.
- Phase 2: T006, then T007/T008, then T009, T010.
- Phase 3: T011, then T012/T013.
- Phase 4: T014/T015/T016, then T017, T018, T019, then T020, T021.
- Phase 5: T022, then T023/T024/T025.
