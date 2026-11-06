# Tasks: Ctrl rules and removing needed letters

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/identifiers.md](contracts/identifiers.md)

Task line format: `- [ ] **T###** [P?] [US#] Description · file`. `[P]` marks a task independent of the others in its wave.

## Phase 1: Setup

No setup task. The branch, packages and test configs exist.

## Phase 2: Foundational (blocks all stories)

Owns the shared criteria data and the check registration. Each live check gets a stub file here so registration typechecks and the story phases can replace their own file without sharing one.

**Wave 1 — independent (different files):**

- [x] **T001** [P] Add two rows to the criteria data: `KM_LINT_RAW_CTRL` (FR-001) and `KM_LINT_SIDED_CTRL_ADVISORY` (FR-004). No rows for FR-005 or FR-007 until the owner rules on them (trigger: that ruling, recorded in spec.md). Finding and criterion wording is content-owned: mark it for content review · packages/contracts/data/criteria.json
- [x] **T002** [P] Create stub checks that return no findings, export them from the package index, and call both from the criteria check runner next to `checkCasedKeysDeclared`. Do not list them in `implementedChecks` or `gateCoverage` yet: the drift guard scans check sources for `code:` literals, which a stub lacks · packages/keyboard-lint/src/checks/criteria/check-raw-ctrl.ts, packages/keyboard-lint/src/checks/criteria/check-sided-ctrl-advisory.ts, packages/keyboard-lint/src/criteriaChecks.ts, packages/keyboard-lint/src/index.ts

**Checkpoint**: both ids resolve, both checks run from the criteria check runner as stubs, and the suite still passes.

## Phase 3: User Story 1 — Raw Ctrl is reported and its characters move back to the gallery (P1) 🎯 MVP

Files: packages/keyboard-lint/src/checks/criteria/check-raw-ctrl.ts (+ test), packages/studio/src/criteria/rawCtrlUpgrade.ts (+ test), packages/studio/src/criteria/upgradePairs.ts (+ test).

### Tests

- [x] **T010** [P] [US1] Write failing tests for the raw-Ctrl predicate: Ctrl without Alt reported; Ctrl+Space skipped; `basic_*` skipped; ASCII digit matching the base digit skipped; rules in deadkey and context groups reported · packages/keyboard-lint/src/checks/criteria/check-raw-ctrl.test.ts
- [x] **T011** [P] [US1] Write failing tests for the fix on ewe: Ctrl rules removed by splice, characters added to the inventory unplaced once each, not offered when projection fails · packages/studio/src/criteria/rawCtrlUpgrade.test.ts, packages/studio/src/criteria/upgradePairs.test.ts

### Implementation

**Wave 1 — independent (different files):**

- [x] **T012** [P] [US1] Implement the raw-Ctrl check and its finding wording (FR-001), replacing the stub, then list `KM_LINT_RAW_CTRL` in the implemented checks and gate coverage · packages/keyboard-lint/src/checks/criteria/check-raw-ctrl.ts, packages/studio/src/criteria/implementedChecks.ts, packages/studio/src/test/gateCoverage.ts
- [x] **T013** [P] [US1] Implement the fix: parse to IR, drop matching rules, `projectKmnText` back, and return the uncovered characters as the offer's inventory additions (FR-002). Per lead ruling 4: split each removed output with `charactersOf` (`lib/openInventory.ts`), skip characters still typed by a remaining `.kmn` rule, leave touch layouts unchanged, and list each removed rule's full output (with names for invisible characters) and a touch-layer note in the preview · packages/studio/src/criteria/rawCtrlUpgrade.ts
- [x] **T015** [P] [US1] Extend `UpgradeOffer` with optional inventory additions, and make the Upgrades step's accept path record them the way the Letters step's Add does (`lib/openInventory.ts`), so they survive the starting-point replay (Article III: state in plan.md how the addition maps to the decision set) · packages/studio/src/criteria/upgradePairs.ts, packages/studio/src/survey/openWalk/UpgradesStep.tsx

**⟶ Wait for Wave 1 to finish, then:**

- [x] **T014** [US1] Register the `KM_LINT_RAW_CTRL` pair `{ lintRuleId, build }` with fix id `upgrade:KM_LINT_RAW_CTRL:<file>` · packages/studio/src/criteria/upgradePairs.ts

**Checkpoint**: on ewe the criterion reports, accepting the fix passes it, and each vowel sits once in the inventory (SC-002). sil_bunong reports nothing.

## Phase 4: User Story 2 — No new Ctrl content or layers on either path (P1)

Files: packages/studio/src/editors/assignLoop/MechanismGallery.tsx, mechanismPlacement.ts, TouchGallery.tsx, touchBuilder/TouchBuilderPane.tsx, touchBuilder/touchBuilderModel.ts, lib/irToCarveNodes.ts (check only).

### Tests

- [x] **T020** [P] [US2] Write failing tests: the Mechanism gallery offers no raw Ctrl combination on Copy or Open, still offers AltGr in the keyboard's existing Alt form (`CTRL ALT`, `RALT`/`LALT` or `ALT`) and as `RALT` when it has none, and still offers `LCTRL` / `RCTRL` · packages/studio/src/editors/assignLoop/MechanismGallery.noCtrl.test.tsx
- [x] **T026** [P] [US2] Write failing tests: the Touch gallery offers no raw Ctrl plane, and the touch layer editor cannot add a Ctrl layer the keyboard lacks · packages/studio/src/editors/assignLoop/TouchGallery.noCtrl.test.tsx, packages/studio/src/editors/assignLoop/touchBuilder/touchBuilderModel.test.ts
- [x] **T021** [P] [US2] Write failing tests: carving a character typed on Ctrl removes its Ctrl rules with its other rules; a basic_kbdurdu Copy with nothing carved keeps every Ctrl rule (SC-004) · packages/studio/src/lib/irToCarveNodes.removal.test.ts

### Implementation

**Wave 1 — independent (different files):**

- [x] **T022** [P] [US2] Drop unsided `CTRL` without Alt from the gallery's modifier pool (`computeModifierPool`), and write new AltGr placements in the keyboard's existing Alt form, `RALT` when it has none (FR-003, lead ruling 2): extend `computeModifierPool` / `raltDefaultToken` to detect `CTRL ALT` with `collectLayerCombosInUse`, and check the hard-coded `RALT` fallbacks in `assignmentFromSuggestion.ts`. `mechanismPlacement.ts` has no Ctrl code; change it only if a test shows it must · packages/studio/src/editors/assignLoop/MechanismGallery.tsx
- [x] **T023** [P] [US2] Filter Ctrl planes out of the Touch gallery (FR-003) · packages/studio/src/editors/assignLoop/TouchGallery.tsx
- [x] **T024** [P] [US2] Stop the touch layer editor adding a Ctrl layer where the keyboard has none (FR-003) · packages/studio/src/editors/assignLoop/touchBuilder/TouchBuilderPane.tsx, packages/studio/src/editors/assignLoop/touchBuilder/touchBuilderModel.ts
- [x] **T025** [P] [US2] Verify carve removal covers CTRL planes on basic_kbdurdu; change the file only if T021 fails · packages/studio/src/lib/irToCarveNodes.ts

**Checkpoint**: no gallery or touch editor action on either path produces a Ctrl plane or layer (SC-005).

## Phase 5: User Story 3 — Removing a needed letter warns (P2)

Files: packages/studio/src/lib/carveNeededSet.ts (+ test), packages/studio/src/lib/removalWarning.ts (new, + test), packages/studio/src/hooks/useRemovalWarning.ts (new), packages/studio/src/editors/carve/CarveGalleryV2.tsx, packages/studio/src/editors/assignLoop/keyGrid/RemoveKeyDialog.tsx.

**Sequencing exception:** the gallery deletion warning in T037 edits `MechanismGallery.tsx` and `TouchGallery.tsx`, which Phase 4 owns. It runs after Phase 4 is done, never in parallel.

### Tests

- [ ] **T030** [P] [US3] Write failing tests for the removal warning: NFC-normalised lookup, composed and decomposed forms match, each character maps to every listed language, a non-needed character gives no warning, dismissal keeps the removal · packages/studio/src/lib/removalWarning.test.ts
- [ ] **T031** [P] [US3] Write failing tests for the per-language needed-letter map built from main exemplar sets · packages/studio/src/lib/openExpectedInventory.test.ts

### Implementation

**Wave 1 — independent (different files):**

- [ ] **T032** [P] [US3] Add the per-language needed-letter map (character to languages) from each listed language's main exemplar set, using the per-tag data in `openExpectedInventory.ts` (`standardExemplarChars`), NFC on both sides, shared by Copy and Open (FR-006). Do not build it on `carveNeededSet.ts`: that set covers one language and also unions marks and the confirmed inventory, so it would warn on characters no language needs · packages/studio/src/lib/openExpectedInventory.ts
- [ ] **T033** [P] [US3] Implement the pure warning model: `RemovalWarning` with char, languages and session-scoped dismissal (FR-006) · packages/studio/src/lib/removalWarning.ts
- [ ] **T034** [P] [US3] Implement the hook that exposes the warning to the removal paths (FR-006) · packages/studio/src/hooks/useRemovalWarning.ts

**⟶ Wait for Wave 1 to finish, then:**

- [ ] **T035** [US3] Show the dismissable warning on carve in Copy (FR-006) · packages/studio/src/editors/carve/CarveGalleryV2.tsx
- [ ] **T036** [US3] Show the dismissable warning on the Remove tool in Open (FR-006) · packages/studio/src/editors/assignLoop/keyGrid/RemoveKeyDialog.tsx

**⟶ Wait for Phase 4 to finish, then:**

- [ ] **T037** [US3] Show the dismissable warning on gallery deletion in Open (FR-006). First locate the real deletion entry points: the Mechanism gallery's "remove" removes a modifier slot, not a character; character deletion likely goes through the key grid (`useKeyEditGuards`) · files to be confirmed

**Checkpoint**: removing é on a French copy warns and names French; dismissing keeps it removed; no non-needed removal warns (SC-006).

## Phase 6: User Story 4 — Sided Ctrl gets an advisory (P3)

Files: packages/keyboard-lint/src/checks/criteria/check-sided-ctrl-advisory.ts (+ test).

### Tests

- [ ] **T040** [P] [US4] Write failing tests: an `RCTRL` rule yields a `warning`-severity finding; a criterion whose findings are all warnings shows as a warning, and neither the Open submit gate nor the Copy gate stops on it · packages/keyboard-lint/src/checks/criteria/check-sided-ctrl-advisory.test.ts, packages/studio/src/criteria/resolveCriteria.test.ts, packages/studio/src/criteria/openRatchet.test.ts

### Implementation

- [ ] **T041** [US4] Implement the advisory check, replacing the stub, with `warning`-severity findings and wording that prefers an Alt-based placement (FR-004; wording for content review); list `KM_LINT_SIDED_CTRL_ADVISORY` in the implemented checks and gate coverage · packages/keyboard-lint/src/checks/criteria/check-sided-ctrl-advisory.ts, packages/studio/src/criteria/implementedChecks.ts, packages/studio/src/test/gateCoverage.ts
- [ ] **T042** [US4] Teach the criteria resolver and the Open submit gate that a criterion whose findings are all `warning` severity is a non-blocking warning (FR-004; no contracts change) · packages/studio/src/criteria/resolveCriteria.ts, packages/studio/src/criteria/openRatchet.ts

**Checkpoint**: a keyboard with an `RCTRL` rule shows the advisory as a warning, and no gate stops on it.

## Phase 7: Polish

FR-005 and FR-007 are deferred out of this spec (lead rulings 1 and 3). T054 gathers FR-007's evidence; it changes no code.

- [ ] **T050** Recompute the criteria count and band split in the criteria summary from the data (don't hard-code the result) · packages/contracts/data/criteria-summary.md
- [x] **T051** Add keyboard-index rows for any keyboard this feature newly references and the index lacks. Done when the spec was written: ewe, sil_bunong and esperanto_sava_eujao added; basic_kbdurdu, basic_kbdfr and basic_kbdth0 were already present · docs/keyboard-index.md
- [ ] **T052** Run the raw-Ctrl census over `../keyboards/release`, record each difference from the spec's census and why, for SC-001 · specs/114-ctrl-and-letter-removal/census.md
- [ ] **T054** [P] FR-007 evidence, read-only: for the 14 `basic_*` keyboards with a touch `ctrl` / `shift-ctrl` layer (and basic_kbdsp's `nextlayer: ctrl` references), record each layer's real content (AltGr, genuine Ctrl as in basic_kbda1, or `LCTRL` as in basic_kbdth0), whether KeymanWeb derives a touch key's modifiers from its layer id (cite the source), and the touch output under the current id and under `rightalt`, as a table for the owner · specs/114-ctrl-and-letter-removal/fr-007-verification.md
- [ ] **T053** Validate against Success Criteria SC-001..SC-006: run `pnpm typecheck`, `pnpm -r test`, `pnpm lint`, and the Copy golden walk e2e (`packages/studio/e2e/golden-walk.spec.ts`, SC-003), and report any red result verbatim · (suite run; no file)

## Dependencies & Execution Order

- Phase 2 → Phases 3, 4, 6 (run in parallel; disjoint files). Phase 3 (US1) is the MVP.
- Phase 5 (US3) depends on Phase 4 for T037 only; T032–T036 can run as soon as Phase 2 is done.
- Phase 7 depends on Phases 3–6.
- Within Phase 3: Wave 1 (T012, T013, T015) → T014.
- Within Phase 4: Wave 1 (T022–T026) only.
- Within Phase 5: Wave 1 (T032–T034) → T035, T036 → T037 (after Phase 4).
