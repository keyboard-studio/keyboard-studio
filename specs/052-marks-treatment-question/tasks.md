# Tasks: Marks treatment question

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Branch**: `052-marks-treatment-question`

**Design inputs**: [data-model.md](data-model.md) · [research.md](research.md) · [contracts/mark-treatment-answer.md](contracts/mark-treatment-answer.md) · [contracts/key-budget.md](contracts/key-budget.md) · [contracts/station-ui.md](contracts/station-ui.md)

Format: `- [ ] **T###** [P] [US#] Description · path`. `[P]` = independent of the others in its wave (different file, no incomplete dependency). Waves are the execution map; join lines mark where work must wait.

---

## Phase 1: Setup

Prerequisites for a locked-contract change. Both are gates, not code.

**Wave 1 — independent (different files):**

- [x] **T001** [P] Record the §18 joint engine+content session outcome for reshaping `MentalModelAnswer` → `MarkTreatmentAnswer` — the decision, the attendees, and the `0.1.0 → 0.2.0` bump rationale (pre-1.0 semver: the minor is the breaking signal) · `docs/spec-signoff.md`
- [x] **T002** [P] Bump the owning package's version `0.1.0` → `0.2.0` per the §18 change record · `packages/engine/package.json`

---

## Phase 2: Foundational (blocks every user story)

The answer type and its derivations. US1, US2, and US4 all code against these identifiers; US3 replaces one stubbed signal inside them. No story work begins until this phase is done.

**Wave 1 — independent (different files):**

- [x] **T003** [P] Create the answer type module: `MarkTreatment` (`"own-key" | "composed"`), `PromotedComposedCharacter`, `MarkTreatmentAnswer` (`classTreatment` / `markTreatment` / `promoted` / `inputOrder`), and `treatmentFor(mark, answer, classes, prefills)` resolving override → class → prefill with no unanswered state (FR-001, FR-004, FR-009). Reuse `MarkInputOrder` from `@keyboard-studio/contracts` `axes.ts` (A3a) — do not redefine it · `packages/engine/src/marks/treatment.ts`
- [x] **T004** [P] Create the promotion module: `promotableCharacters(alphabet, markClass, attachments, bcp47?)` returning NFC composed characters for reachable pairs on **lowercase and caseless bases only**, and `expandCaseCounterpartPromotions(alphabet, promoted, bcp47?)` deriving uppercase counterparts **additively, never withdrawing** (FR-002, FR-023). Reuse the `caseCounterpart` primitive `expandCaseCounterpartAttachments` already uses — no second casing rule · `packages/engine/src/marks/promotion.ts`

**⟶ Wait for Wave 1 to finish, then:**

- [x] **T005** Replace the prefill module: `MarkTreatmentPrefill` (`classId`, `recommended`, `promotionProposal`, `signals.{productivitySpread, baseMechanism, promotionAffordable, unaffordableReason?}`) and `computeMarkTreatmentPrefills`. Carry today's always-affordable behaviour behind an explicit `keyBudget` input that US3 (T033) supplies for real — the stub is named and typed here, not hidden in a `null` check. Delete the superseded module in the same change · `packages/engine/src/marks/treatment-prefill.ts` (new), `packages/engine/src/marks/mental-model-prefill.ts` (deleted)

**⟶ Wait for T005, then:**

- [x] **T006** Update the barrel exports (~lines 190–193) — export `treatment.ts`, `promotion.ts`, `treatment-prefill.ts`; remove `MentalModelAnswer`, `MentalModelPrefill`, `computeMentalModelPrefills` · `packages/engine/src/index.ts`

**Checkpoint**: `pnpm --filter @keyboard-studio/engine typecheck` fails only at the not-yet-updated worklist and studio call sites — the new vocabulary exists and the old is gone.

---

## Phase 3: User Story 1 — Record both mechanisms for one alphabet (P1)

**Goal**: One pass through the marks series records a productive mark's own key, a set of promoted composed characters, and the input order — independently, at one station, with the series down to four.

**Independent Test**: Confirm an alphabet with one mark attested on five bases; choose a dedicated key for the mark and promote two composed characters; verify the worklist contains a `MarkUnit` for the bare mark *and* `ownLetterUnits` entries for exactly the two promoted characters, and that the recorded `inputOrder` reaches the mark unit.

### Tests

Written first, failing. The engine tests pin the contract's behavioural guarantees; the station test pins [contracts/station-ui.md](contracts/station-ui.md)'s assertion surface.

**Wave 1 — independent (different files):**

- [x] **T007** [P] [US1] Worklist tests: dual reachability produces both a `MarkUnit` and the promoted `ownLetterUnits` entries (FR-005, FR-006, US1 AC1); a `composed` mark with no promotions matches today's output (US1 AC2); NFC dedup means a pair both `composed`-produced and promoted yields one entry; coverage is "at least one unit, nothing unclassified" (SC-009) and the `classified twice` problem is gone · `packages/engine/src/marks/worklist-and-prefill.test.ts`
- [x] **T008** [P] [US1] Treatment/promotion tests: `treatmentFor` resolves override → class → prefill; a class-level answer with one member overridden leaves siblings on the class answer (US1 AC3); an internally-mixed class is legal; an override key absent from `alphabet.marks` is dropped on re-proposal; `expandCaseCounterpartPromotions` is additive and tolerates a base with no single-character uppercase form (FR-023, edge case) · `packages/engine/src/marks/marks-foundations.test.ts`
- [x] **T009** [P] [US1] Station tests over a fixture matrix (Latin cased, Devanagari dependent vowel sign, Arabic ḥaraka, Hebrew niqqud, caseless): the `marks-treatment` subtree's `textContent` matches none of `/letter of the alphabet/i`, `/its own letter/i`, `/alphabet/i` (FR-007, SC-004, US1 AC4) and none of `/dead ?key/i`, `/unicode/i`, `/normali[sz]/i`, `/codepoint/i`, `/precomposed/i` (FR-008); the series renders at most 4 stations (FR-018, SC-003); a fully-attested single-mark orthography confirms in at most 2 screens (SC-002); an empty marks store skips the series (US1 AC5); a class with nothing to decide renders no screen and takes treatment, promotion, **and** order from the proposal (FR-019, US1 AC6); an alphabet edit re-proposes all three and returns to the first station (FR-020, US1 AC7) · `packages/studio/src/survey/marks/MarksSeriesStep.test.tsx`

### Implementation

**Wave 2 — independent (different files):**

- [x] **T010** [P] [US1] Reshape `WorklistInputs` — `treatment: MarkTreatmentAnswer` + `prefills` replacing `mentalModel` / `markOverrides` / `inputOrder`; implement the production rules table (plain base → `ownLetterUnits`; `own-key` mark → `markUnits` carrying `inputOrder`; `composed` mark → each reachable pair; **a promoted character → `ownLetterUnits` regardless of its mark's treatment**); **delete** `verifyWorklistCoverage`'s `classified twice` problem (not suppress, not work around) and restate the invariant as "at least one unit, nothing unclassified" · `packages/engine/src/marks/worklist.ts`
- [x] **T011** [P] [US1] Build the replacement station: `role="radiogroup"` treatment options per class with the recommendation pre-selected and tagged `(suggested)`, a **checkbox** promotion group (independent of treatment — FR-003), and the input-order group folded in. Pin the `data-testid` handles from [contracts/station-ui.md](contracts/station-ui.md): `marks-treatment`, `treatment-<classId>`, `treatment-option-<classId>-<value>`, `promotion-<classId>`, `promotion-<classId>-<char>`, `promotion-unavailable-reason-<classId>`, `input-order`. Promotion is **absent from the DOM** when there is nothing to promote and **present-but-disabled with a reason** when unaffordable — distinct states. Read the order question's content from `survey/questions/reserve/pb_mark_input_order.ts`; never duplicate its strings · `packages/studio/src/survey/marks/MarkTreatmentStation.tsx`
- [x] **T012** [P] [US1] Amend the governing spec in this same change: FR-010 (the single mutually-exclusive per-class confirmation → the three-part answer), FR-011 (proposal-signal list gains the key budget), FR-012 (mark input order is no longer its own station), SC-006 (five-screen ceiling → four, superseded by this feature's SC-003), SC-007 ("exactly once" → "at least once / nothing unclassified") · `specs/046-marks-question-series/spec.md`
- [x] **T013** [P] [US1] Update the output-form proposal input: `hasLetterPlusMarkClass` becomes "at least one mark resolves to `own-key`". The output-form decision stays a **separate whole-keyboard question** and keeps deriving its proposal from this station (FR-022) · `packages/engine/src/marks/output-form-policy.ts`

**⟶ Wait for Wave 2 to finish, then:**

- [x] **T014** [US1] Rewire the series: drop `"marks_input_order"` from `MarksStationId` (leaving `marks_attachment`, `marks_treatment`, `marks_output_form`, `marks_stacking` — four, FR-018/SC-003); render `MarkTreatmentStation`; call `computeMarkTreatmentPrefills`; pass the reshaped `WorklistInputs.treatment` to `buildPlacementWorklist`; extend re-proposal on `confirmedAlphabetKey` change to re-seed treatment, prune promotions to still-reachable pairs, and re-seed order only when not explicitly set (FR-020) · `packages/studio/src/survey/marks/MarksSeriesStep.tsx`

**⟶ Wait for T014, then:**

- [x] **T015** [US1] Delete the superseded components now that nothing renders them · `packages/studio/src/survey/marks/MentalModelStation.tsx`, `packages/studio/src/survey/marks/InputOrderStation.tsx`
- [x] **T016** [US1] Run `lingui` extraction and fill the new station's message ids (`area.segment(.segment)+`, lowercase dot-separated); leave `fr` untranslated rather than machine-filled · `packages/studio/src/locales/en/messages.json`, `packages/studio/src/locales/fr/messages.json`

**Checkpoint**: US1 is independently functional. An author can record a mark key *and* promoted composed characters *and* the input order in one pass, in four stations, with no alphabetic-unithood or jargon wording anywhere in the station. Options are plain text — no demonstration yet.

---

## Phase 4: User Story 2 — Understand the options by trying them (P2)

**Goal**: Every offered option carries an operable two-or-three-key demonstration built from the author's own letters, with the `prefix` option's otherwise-invisible pending state shown and announced.

**Independent Test**: Open the station for an alphabet with at least one attested composed character; operate each option's demo with pointer and with keyboard only; verify each produces that option's correct text, that `prefix` shows a pending state between presses, and that operating a demo does not select its option.

### Tests

- [x] **T017** [US2] Demo tests: every offered option has a `demo-<classId>-<optionValue>` node (FR-010, SC-005); in the `prefix` demo **every** press leaves either `demo-pending` or a non-empty `demo-output` — no press after which the demo appears to have done nothing (FR-011, SC-006, US2 AC2); in the `postfix` demo the first press shows the bare letter (US2 AC3); operating a demo leaves the selected radio and the working-copy revision unchanged and emits no diagnostic (FR-012, US2 AC1/AC5); demos advance only on author action, never on a timer (FR-013); option controls and demo controls are separately reachable by keyboard and neither traps focus (US2 AC6) · `packages/studio/src/survey/marks/MarkTreatmentStation.test.tsx`

**⟶ Wait for T017, then:**

### Implementation

- [x] **T018** [US2] Build the demonstration widget: two-or-three keys drawn from the author's confirmed letters and marks, producing the exact text that option would produce; `demo-key-<n>`, `demo-output`, `demo-reset` handles; `demo-pending` rendered **only** in the `prefix` intermediate state, carrying `role="status"` `aria-live="polite"` and announcing a mark awaiting a letter (FR-011). No timer, no autoplay; no working-copy write; no diagnostic · `packages/studio/src/survey/marks/MarkDemoWidget.tsx`

**⟶ Wait for T018, then:**

**Wave 3 — independent (different files):**

- [x] **T019** [P] [US2] Mount one demo per **offered** option in the station, keeping selection and demo operation on separate controls · `packages/studio/src/survey/marks/MarkTreatmentStation.tsx`
- [x] **T020** [P] [US2] Pin FR-014's load-bearing clause with a derivation test: for **every** `(treatment, order)` combination the author can produce, no `sk[]`-free deadkey reaches a touch layout — the scaffolder resolves deadkey patterns into long-press subkey menus, so "prefix on touch" is unrepresentable rather than warned (research D5) · `packages/engine/src/scaffolder/scaffoldTouchLayout.test.ts`
- [x] **T021** [P] [US2] Extract the new demo strings into the catalogs · `packages/studio/src/locales/en/messages.json`, `packages/studio/src/locales/fr/messages.json`

**Checkpoint**: US2 is independently functional. Every selectable option can be tried before it is selected, and the pending state is legible side by side with the letter-first contrast.

---

## Phase 5: User Story 3 — Only be offered what actually fits (P3)

**Goal**: One authoritative key-budget determination, read by the marks station and by the facet index, with A7 defined as its projection. Promotion is offered only when the base has room.

**Independent Test**: Run the station against a base with a saturated SHIFT and AltGr plane — promotion is unavailable with a stated reason; run it against a base with ample free keys — promotion is offered. Re-run `facet-index` and diff `docs/keyboard-facet-index.json` — expect no change.

### Tests

- [x] **T022** [US3] Key-budget tests: the band → A7 mapping is **total and bijective** on the three bands (FR-016); a base binding no stock physical key yields `null` (never a false `many`); `spareKeys >= 0` for every corpus keyboard; the three intermediate-band rows (`sil_euro_latin`, `armenian_mnemonic_r`, `russian_mnemonic_r`) stay at `"RAlt only"` so decision rule 10 remains dormant · `packages/contracts/src/keyBudget.test.ts`
- [x] **T023** [US3] Station budget tests: a fully-booked base makes promotion **unavailable with a plain-language reason** (`promotion-unavailable-reason-<classId>` present, US3 AC1, SC-007); an ample base offers it (US3 AC2); `composed` remains selectable at every band so at least one option is always available (FR-017, US3 AC3); exhausted budget **and** high productivity still completes the station (edge case) · `packages/studio/src/survey/marks/MarkTreatmentStation.test.tsx`

**⟶ Wait for the tests, then:**

### Implementation

- [x] **T024** [US3] Relocate the pinned stock-key table, preserving its pin semantics and provenance note verbatim · `utilities/facet-index/data/base-layouts.json` → `packages/contracts/data/base-layouts.json`

**⟶ Wait for T024, then:**

- [x] **T025** [US3] Create the canonical determination: `KeyBudgetBand` (`"many" | "ralt-only" | "fully-booked"`), `KeyBudget { band, spareKeys, notes }`, `measureKeyBudget(ir): KeyBudget | null`, and the total projection `keyBudgetToSpareKeyAvailability(band)`. Port the existing algorithm **unchanged** — stock `kbdus` universe, base plane excluded, reserved Ctrl/Alt chords excluded, distinct bound keys counted per plane, half-of-N boundary. Reads the base's typed `KeyboardIR`; never parses `.kmn` text; counts `RawKmnFragment` nodes as unmeasured coverage rather than dropping them · `packages/contracts/src/keyBudget.ts`

**⟶ Wait for T025, then:**

**Wave 4 — independent (different files):**

- [x] **T026** [P] [US3] Add the `KeyBudget` zod mirror and its compile-time drift guard alongside the existing mirrors · `packages/contracts/src/schemas.ts`
- [x] **T027** [P] [US3] Document A7 `spareKeyAvailability` as a **projection** of `keyBudget.ts`, pointing at the mapping table, and restate that its display-string values remain unsafe as map keys — project first · `packages/contracts/src/axes.ts`
- [x] **T028** [P] [US3] Export the new module from the contracts barrel · `packages/contracts/src/index.ts`
- [x] **T029** [P] [US3] Make the facet classifier a thin delegate to `measureKeyBudget`, leaving its `Categorization` wrapper (confidence, provenance tier, analysed coverage, `undetermined` fallback) untouched so shipped values do not move · `utilities/facet-index/spare-key-budget-classifier.ts`
- [x] **T030** [P] [US3] Read the relocated table from `@keyboard-studio/contracts` instead of the tool-local path · `utilities/facet-index/base-layout.ts`

**⟶ Wait for Wave 4 to finish, then:**

- [x] **T031** [US3] Wire the real budget through the prefill: replace T005's stub with `measureKeyBudget(baseIr)`, computing `signals.promotionAffordable` and `signals.unaffordableReason` from `spareKeys`, and budget-filtering `promotionProposal`. The budget gates **promotion only, never treatment** (FR-017) · `packages/engine/src/marks/treatment-prefill.ts`
- [x] **T032** [US3] Call the prefill with `{ baseIr, keyBudget }` instead of today's `{ baseIr }` and thread the budget to the station's promotion gate · `packages/studio/src/survey/marks/MarksSeriesStep.tsx`

**⟶ Wait for T031/T032, then:**

- [x] **T033** [US3] Re-run the facet index over the `../keyboards` corpus and **diff the artifact — expect no change**; record the result. A non-empty diff means the relocation altered the measurement and must be fixed, not accepted · `docs/keyboard-facet-index.json`

**Checkpoint**: US3 is independently functional. One measurement, read by the marks station and the facet index, with A7 defined as its projection and **not** newly seeded into `session.axes` (research D2). All reports of key availability agree (SC-008).

---

## Phase 6: User Story 4 — Strategy selection can see the answer (P4)

**Goal**: The recorded treatment reaches strategy selection, with a stated precedence, so a keyboard can no longer be built on two contradictory premises. Widest regression surface — last.

**Independent Test**: Construct a case where the recorded treatment and the diacritic-behaviour axis imply different mechanisms for the same mark; verify the disagreement is resolved by stated precedence or surfaced, never silently built. Then run the strategy self-consistency suite and verify every covered keyboard selects what it selected before, or that each changed row carries a recorded reason.

### Tests

- [x] **T034** [US4] Reconciliation tests: a recorded treatment giving composed characters their own keys, against an independently-indicated compose-as-you-type A4, is resolved by precedence or surfaced — never silently built (US4 AC1, SC-011); changing the recorded treatment changes the subsequent selection (FR-027, US4 AC3); an internally-mixed class contributes its **dominant** treatment to the class-level axis and the mix is surfaced (edge case); a base whose own behaviour the author knowingly overrode is a legitimate override and does **not** fire the FR-024 surface — the check runs on the **selected strategy**, after `selectStrategy`, not on the raw axis (edge case) · `packages/engine/src/marks/strategy-reconcile.test.ts`

**⟶ Wait for T034, then:**

### Implementation

- [x] **T035** [US4] Build the projection: derive `diacriticBehavior` (A4) from the recorded treatments — ≥1 `own-key` with two or more distinct mark families → `"multi-family"`; one family of stacking marks → `"stacking-combining"`; every mark `composed` → `"none"`; **never** derive `"replacing-cycling"`, which this station does not elicit — plus `markInputOrder` (A3a) verbatim. Add the post-`selectStrategy` disagreement surface (FR-024) · `packages/engine/src/marks/strategy-reconcile.ts`

**⟶ Wait for T035, then:**

**Wave 5 — independent (different files):**

- [x] **T036** [P] [US4] Emit `computedAxes: { diacriticBehavior, markInputOrder }` on the marks phase result. No contract change — `SurveyPhaseResult.computedAxes` already exists as an additive optional field merged by `mergePhaseResults`; its omission today *is* the defect · `packages/studio/src/survey/marks/MarksSeriesStep.tsx`
- [x] **T037** [P] [US4] Amend §7.2 with the stated precedence (FR-025): a recorded mark treatment wins over a default-filled or prior-derived A4, and `defaultFillAxes` never overwrites an axis already present — stated, not left implicit in behaviour · `specs/007-strategy-selection/spec.md`

**⟶ Wait for Wave 5 to finish, then:**

- [x] **T038** [US4] Re-run the §7.5 self-consistency suite and reconcile the table: every covered keyboard selects what it selected before, or the row is amended **in this same change** with a recorded reason (FR-026, SC-012, US4 AC2). Restate the EuroLatin multi-family row as **open with its reason unchanged** — MML-as-target is out of scope for v1, so closing it would need evidence this feature does not produce (research D7, US4 AC4) · `specs/007-strategy-selection/spec.md`

**Checkpoint**: US4 is independently functional. The recorded answer and the selected strategy can no longer disagree silently, and the self-consistency table is green with every changed row reasoned.

---

## Phase 7: Polish

**Wave 1 — independent (different files):**

- [x] **T039** [P] Update the stale design note's S2/S3 sections — it quotes the retired "own letter of the alphabet" wording and describes input order as its own station · `docs/design-notes/mark-composition-model.md`
- [x] **T040** [P] Verify FR-021/SC-010 by loading a draft saved before this feature and confirming it loads **unmigrated** — station answers are transient; only the derived worklist and output form persist, and `PlacementWorklist`'s shape is unchanged · `packages/studio/src/lib/draftPersistence.test.ts`
- [x] **T041** [P] Walk the requirements checklist and mark each item against the shipped behaviour · `specs/052-marks-treatment-question/checklists/requirements.md`

**⟶ Wait for Wave 1 to finish, then:**

- [x] **T042** Run the full gate: `pnpm typecheck`, `pnpm -r test`, `pnpm lint` (including `test-antipattern-lint` and the i18n catalog lints). Record each result; a failure is fixed here, not deferred
- [x] **T043** Acknowledge the spec-corpus drift introduced by the 046 and 007 amendments — `node utilities/spec-trace check` then `acknowledge` · `utilities/spec-trace`

---

## Dependencies & Execution Order

**Phase order**: Setup → Foundational → US1 (P1) → US2 (P2) → US3 (P3) → US4 (P4) → Polish. Each story phase is independently testable and shippable at its checkpoint.

**Wave dependencies**:

- **Phase 1** — T001/T002 are independent of each other and of everything else; both gate the Foundational contract change.
- **Phase 2** — T003/T004 independent → T005 (needs both) → T006 (needs T005).
- **Phase 3 (US1)** — T007/T008/T009 (tests, independent) → T010/T011/T012/T013 (independent, different files) → T014 (needs T010–T013) → T015/T016 (need T014).
- **Phase 4 (US2)** — T017 (test) → T018 (widget) → T019/T020/T021 (independent).
- **Phase 5 (US3)** — T022/T023 (tests) → T024 (relocation) → T025 (canonical module) → T026/T027/T028/T029/T030 (independent) → T031/T032 (wiring) → T033 (corpus diff, needs the wiring settled).
- **Phase 6 (US4)** — T034 (test) → T035 (projection) → T036/T037 (independent) → T038 (table revalidation, needs everything above it).
- **Phase 7** — T039/T040/T041 independent → T042 → T043.

**Cross-phase constraints** (from the plan's sequencing note):

- The 046 amendments (**T012**) land in the **same change** as the P1 behaviour, not afterwards — including deleting the `classified twice` assertion (**T010**) rather than working around it.
- The §7.5 revalidation (**T038**) runs **after** all of P4 and its result is recorded per FR-026.
- **T031** replaces the stub **T005** names; the stub is explicit and typed precisely so this replacement is a one-line change rather than an archaeology exercise.

**Parallel opportunities**: the largest independent waves are Phase 3 Wave 2 (T010/T011/T012/T013 — engine worklist, studio station, spec 046, output-form policy: four different files, no shared dependency) and Phase 5 Wave 4 (T026–T030 — contracts schemas/axes/barrel and the two facet-index files). Phase 7 Wave 1 is fully independent.
