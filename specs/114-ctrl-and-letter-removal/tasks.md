# Tasks: Ctrl rules and removing needed letters

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/identifiers.md](contracts/identifiers.md)

Task line format: `- [ ] **T###** [P?] [US#] Description · file`. `[P]` marks a task independent of the others in its wave.

## Phase 1: Setup

No setup task. The branch, packages and test configs exist.

## Phase 2: Foundational (blocks all stories)

Owns the shared criteria data and the check registration. Each live check gets a stub file here so registration typechecks and the story phases can replace their own file without sharing one.

**Wave 1 — independent (different files):**

- [ ] **T001** [P] Add four rows to the criteria data: `KM_LINT_RAW_CTRL` (FR-001, live), `KM_LINT_SIDED_CTRL_ADVISORY` (FR-004, live), `KM_LINT_CTRL_ALT_UNSIDED` (FR-005, stub, awaiting owner), `KM_LINT_TOUCH_CTRL_LAYER_NAMES` (FR-007, stub, awaiting owner) · packages/contracts/data/criteria.json
- [ ] **T002** [P] Create stub checks that return no findings, then register both live ids in the implemented-checks list and the gate-coverage rows · packages/keyboard-lint/src/checks/criteria/check-raw-ctrl.ts, packages/keyboard-lint/src/checks/criteria/check-sided-ctrl-advisory.ts, packages/studio/src/criteria/implementedChecks.ts, packages/studio/src/test/gateCoverage.ts

**Checkpoint**: the four ids resolve, both live checks are registered as stubs, and the suite still passes.

## Phase 3: User Story 1 — Raw Ctrl is reported and its characters move back to the gallery (P1) 🎯 MVP

Files: packages/keyboard-lint/src/checks/criteria/check-raw-ctrl.ts (+ test), packages/studio/src/criteria/rawCtrlUpgrade.ts (+ test), packages/studio/src/criteria/upgradePairs.ts (+ test).

### Tests

- [ ] **T010** [P] [US1] Write failing tests for the raw-Ctrl predicate: Ctrl without Alt reported; Ctrl+Space skipped; `basic_*` skipped; ASCII digit matching the base digit skipped; rules in deadkey and context groups reported · packages/keyboard-lint/src/checks/criteria/check-raw-ctrl.test.ts
- [ ] **T011** [P] [US1] Write failing tests for the fix on ewe: Ctrl rules removed by splice, characters added to the inventory unplaced once each, not offered when projection fails · packages/studio/src/criteria/rawCtrlUpgrade.test.ts, packages/studio/src/criteria/upgradePairs.test.ts

### Implementation

**Wave 1 — independent (different files):**

- [ ] **T012** [P] [US1] Implement the raw-Ctrl check and its finding wording (FR-001), replacing the stub · packages/keyboard-lint/src/checks/criteria/check-raw-ctrl.ts
- [ ] **T013** [P] [US1] Implement the fix: parse to IR, drop matching rules, `projectKmnText` back, add uncovered characters to the inventory unplaced (FR-002) · packages/studio/src/criteria/rawCtrlUpgrade.ts

**⟶ Wait for Wave 1 to finish, then:**

- [ ] **T014** [US1] Register the `KM_LINT_RAW_CTRL` pair `{ lintRuleId, build }` with fix id `upgrade:KM_LINT_RAW_CTRL:<file>` · packages/studio/src/criteria/upgradePairs.ts

**Checkpoint**: on ewe the criterion reports, accepting the fix passes it, and each vowel sits once in the inventory (SC-002). sil_bunong reports nothing.

## Phase 4: User Story 2 — No new Ctrl content or layers on either path (P1)

Files: packages/studio/src/editors/assignLoop/MechanismGallery.tsx, mechanismPlacement.ts, TouchGallery.tsx, touchBuilder/TouchBuilderPane.tsx, touchBuilder/touchBuilderModel.ts, lib/irToCarveNodes.ts (check only).

### Tests

- [ ] **T020** [P] [US2] Write failing tests: Mechanism gallery offers no Ctrl plane or layer on Copy or Open · packages/studio/src/editors/assignLoop/MechanismGallery.noCtrl.test.tsx
- [ ] **T021** [P] [US2] Write failing tests: carving a character typed on Ctrl removes its Ctrl rules with its other rules; a basic_kbdurdu Copy with nothing carved keeps every Ctrl rule (SC-004) · packages/studio/src/lib/irToCarveNodes.removal.test.ts

### Implementation

**Wave 1 — independent (different files):**

- [ ] **T022** [P] [US2] Filter Ctrl planes and layers out of the Mechanism gallery and its placement options (FR-003) · packages/studio/src/editors/assignLoop/MechanismGallery.tsx, packages/studio/src/editors/assignLoop/mechanismPlacement.ts
- [ ] **T023** [P] [US2] Filter Ctrl planes out of the Touch gallery (FR-003) · packages/studio/src/editors/assignLoop/TouchGallery.tsx
- [ ] **T024** [P] [US2] Stop the touch layer editor adding a Ctrl layer where the keyboard has none (FR-003) · packages/studio/src/editors/assignLoop/touchBuilder/TouchBuilderPane.tsx, packages/studio/src/editors/assignLoop/touchBuilder/touchBuilderModel.ts
- [ ] **T025** [P] [US2] Verify carve removal covers CTRL planes on basic_kbdurdu; change the file only if T021 fails · packages/studio/src/lib/irToCarveNodes.ts

**Checkpoint**: no gallery or touch editor action on either path produces a Ctrl plane or layer (SC-005).

## Phase 5: User Story 3 — Removing a needed letter warns (P2)

Files: packages/studio/src/lib/carveNeededSet.ts (+ test), packages/studio/src/lib/removalWarning.ts (new, + test), packages/studio/src/hooks/useRemovalWarning.ts (new), packages/studio/src/editors/carve/CarveGalleryV2.tsx, packages/studio/src/editors/assignLoop/keyGrid/RemoveKeyDialog.tsx.

**Sequencing exception:** the gallery deletion warning in T037 edits `MechanismGallery.tsx` and `TouchGallery.tsx`, which Phase 4 owns. It runs after Phase 4 is done, never in parallel.

### Tests

- [ ] **T030** [P] [US3] Write failing tests for the removal warning: NFC-normalised lookup, composed and decomposed forms match, each character maps to every listed language, a non-needed character gives no warning, dismissal keeps the removal · packages/studio/src/lib/removalWarning.test.ts
- [ ] **T031** [P] [US3] Write failing tests for the per-language needed-letter map built from main exemplar sets · packages/studio/src/lib/carveNeededSet.test.ts

### Implementation

**Wave 1 — independent (different files):**

- [ ] **T032** [P] [US3] Add the per-language needed-letter map over the existing exemplar union, NFC on both sides (FR-006) · packages/studio/src/lib/carveNeededSet.ts
- [ ] **T033** [P] [US3] Implement the pure warning model: `RemovalWarning` with char, languages and session-scoped dismissal (FR-006) · packages/studio/src/lib/removalWarning.ts
- [ ] **T034** [P] [US3] Implement the hook that exposes the warning to the removal paths (FR-006) · packages/studio/src/hooks/useRemovalWarning.ts

**⟶ Wait for Wave 1 to finish, then:**

- [ ] **T035** [US3] Show the dismissable warning on carve in Copy (FR-006) · packages/studio/src/editors/carve/CarveGalleryV2.tsx
- [ ] **T036** [US3] Show the dismissable warning on the Remove tool in Open (FR-006) · packages/studio/src/editors/assignLoop/keyGrid/RemoveKeyDialog.tsx

**⟶ Wait for Phase 4 to finish, then:**

- [ ] **T037** [US3] Show the dismissable warning on gallery deletion in Open (FR-006) · packages/studio/src/editors/assignLoop/MechanismGallery.tsx, packages/studio/src/editors/assignLoop/TouchGallery.tsx

**Checkpoint**: removing é on a French copy warns and names French; dismissing keeps it removed; no non-needed removal warns (SC-006).

## Phase 6: User Story 4 — Sided Ctrl gets an advisory (P3)

Files: packages/keyboard-lint/src/checks/criteria/check-sided-ctrl-advisory.ts (+ test).

### Tests

- [ ] **T040** [P] [US4] Write failing tests: an `RCTRL` rule yields the advisory and no failing finding · packages/keyboard-lint/src/checks/criteria/check-sided-ctrl-advisory.test.ts

### Implementation

- [ ] **T041** [US4] Implement the advisory check, replacing the stub, with wording that prefers an Alt-based placement (FR-004) · packages/keyboard-lint/src/checks/criteria/check-sided-ctrl-advisory.ts

**Checkpoint**: a keyboard with an `RCTRL` rule shows the advisory and no failing finding.

## Phase 7: Polish

Stubs for FR-005 and FR-007 have only criteria rows (T001). They have no implementation task, by the spec.

- [ ] **T050** Recompute the criteria count and band split in the criteria summary (206 → 208) · packages/contracts/data/criteria-summary.md
- [ ] **T051** Add keyboard-index rows for any keyboard this feature newly references and the index lacks (checked so far: ewe is present; sil_bunong, basic_kbdurdu, basic_kbdfr and esperanto_sava_eujao are to be checked) · docs/keyboard-index.md
- [ ] **T052** Run the raw-Ctrl census over `../keyboards/release`, record each difference from the spec's census and why, for SC-001 · specs/114-ctrl-and-letter-removal/census.md
- [ ] **T053** Validate against Success Criteria SC-001..SC-006: run `pnpm typecheck`, `pnpm -r test`, `pnpm lint`, and report any red result verbatim · (suite run; no file)

## Dependencies & Execution Order

- Phase 2 → Phases 3, 4, 6 (run in parallel; disjoint files). Phase 3 (US1) is the MVP.
- Phase 5 (US3) depends on Phase 4 for T037 only; T032–T036 can run as soon as Phase 2 is done.
- Phase 7 depends on Phases 3–6.
- Within Phase 3: Wave 1 (T012, T013) → T014.
- Within Phase 4: Wave 1 (T022–T025) only.
- Within Phase 5: Wave 1 (T032–T034) → T035, T036 → T037 (after Phase 4).
