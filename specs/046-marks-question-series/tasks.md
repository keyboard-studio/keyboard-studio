# Tasks: Mark Composition Model and the Marks Question Series

**Input**: Design documents from `specs/046-marks-question-series/` — [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/marks-series-contract.md](contracts/marks-series-contract.md)

**Branch**: `046-marks-question-series`

**Line format**: `- [ ] **T###** [P?] [US#] Description · exact/file/path` — `[P]` = independent of the other tasks in its wave (different file, no incomplete dependency); `[US#]` = the user story the task serves.

Every task includes its own vitest coverage in the same change unless it is a pure-UI wiring task covered by the story checkpoint's test.

---

## Phase 1: Setup

**Wave 1 — single task:**

- [x] **T001** Baseline: `pnpm install && pnpm build && pnpm typecheck && pnpm -r test` green on the branch before any edit, so later failures are attributable · (repo root)

---

## Phase 2: Foundational (blocks all user stories)

The contract types, the decomposition helper, the shared posture table, and the store split — everything downstream codes against these.

**Wave 1 — independent (different files):**

- [x] **T002** [P] New contracts module with the pinned types `DeclaredRole`, `AttestedStack` (ordered, closest-to-base first), `ConfirmedAlphabet` (`bases`/`marks`/`attestedStacks`/`declaredRoles`), `AttachmentState`, `MarkUnit`, `BlockedCombination`, `PlacementWorklist` — names exactly per the contract doc · `packages/contracts/src/confirmedAlphabet.ts`
- [x] **T003** [P] Grapheme decomposition helper `decomposeGrapheme(grapheme)` → `{ base, marks[] } | null` (NFD, order-preserving, full `\p{Mn}\p{Mc}` combining-run split; `null` for PUA / no known decomposition), reusing `isCombiningMarkChar` / `isPrivateUseCodePoint` from `characterMap.ts` · `packages/engine/src/character-discovery/decompose.ts`

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — independent (different files, all depend on T002):**

- [x] **T004** [P] Zod mirrors for every new type from T002 with compile-time drift guards, per the locked-contract convention (schema and type change in the same commit) · `packages/contracts/src/schemas.ts`
- [x] **T005** [P] Additive optional fields `alphabet?: ConfirmedAlphabet` and `marksWorklist?: PlacementWorklist` on `SurveyPhaseResult` and `SurveySession`, merge semantics in the session merge logic, and the derivation `ConfirmedAlphabet → confirmedInventory` (NFC graphemes, first-appearance order) so every existing consumer keeps working (FR-001) · `packages/contracts/src/surveyPhaseResult.ts`, `packages/contracts/src/surveySession.ts`
- [x] **T006** [P] Shared posture table `nfcPostureOfInventory(alphabet): PosturePair[]` (per attested/accepted stack: has-ready-made-form + the form), and flip the facet derivation `planned:nfc-posture-of-inventory` → implemented · `packages/engine/src/marks/nfc-posture-of-inventory.ts`, `content/facets/orth/mark-composition-posture.yaml`

**⟶ Wait for Wave 2 to finish, then:**

**Wave 3 — single task:**

- [x] **T007** Split the Phase B draft store into `bases` / `marks` / `attestedStacks` / `declaredRoles` sections (three-store canonical, flat list derived), keeping current consumers compiling · `packages/studio/src/stores/phaseBDraftStore.ts`

**Checkpoint**: Contracts + engine foundations exist and typecheck; no user-visible change yet.

---

## Phase 3: User Story 5 — Whole-grapheme picks visibly populate both lists (P1)

**Goal**: Picking a precomposed character records its base in Letters, its mark(s) in Marks, and the combination in attested stacks — visibly, with no interrupting question (FR-002, FR-003).

**Independent Test**: Search the picker for a precomposed character, select it, and verify Letters and Marks both update with a just-added indication, and the attested combination is recorded (US5 acceptance scenarios).

### Implementation

**Wave 1 — independent (different files):**

- [x] **T008** [P] Pick-commit decomposition in the picker: whole-grapheme pick runs `decomposeGrapheme`, records base → `bases`, mark(s) → `marks`, ordered sequence → `attestedStacks`, deduped (already-present items not duplicated, only the new attested combination added — edge case), with a transient "just added" highlight on the existing chip-indicator + `aria-live` announcer patterns · `packages/studio/src/survey/CharacterMapPane.tsx`
- [x] **T009** [P] Three-section inventory rendering (Letters / Marks / Accented letters), marks rendered on U+25CC carriers · `packages/studio/src/survey/PhaseB.tsx`

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — single task:**

- [x] **T010** Commit `ConfirmedAlphabet` (plus the derived flat `confirmedInventory`) onto the phase result when the characters step completes · `packages/studio/src/survey/CharactersStep.tsx`

**Checkpoint**: US5 is independently testable — a precomposed pick visibly lands in both lists and the stack list, and the confirmed alphabet carries the three stores forward.

---

## Phase 4: User Story 1 — No-marks languages skip the series entirely (P1)

**Goal**: The `marks` spine step exists between `carve` and `mechanisms`, and its S0 gate silently completes the step (empty worklist) whenever the marks store is empty (FR-005, FR-024).

**Independent Test**: Confirm a zero-marks alphabet, advance past alphabet confirmation, land directly on the mechanism gallery with no marks screen; add a marked character and verify the series becomes reachable again (US1 acceptance scenarios).

### Implementation

**Wave 1 — single task:**

- [x] **T011** [US1] `MarksSeriesStep.tsx` host skeleton: computes `MarksGateResult` (S0, never rendered); when `marks` is empty, completes the step immediately with an empty `PlacementWorklist`; otherwise sequences stations internally (stations stubbed for now) · `packages/studio/src/survey/marks/MarksSeriesStep.tsx`

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — independent (different files):**

- [x] **T012** [P] [US1] Register the new spine step id `marks` between `carve` and `mechanisms`: manifest entry hosting `MarksSeriesStep`, advance policy, and the `expectedSpine` update · `packages/studio/src/steps/manifest.ts`, `packages/studio/src/steps/advance.ts`
- [x] **T013** [P] [US1] Gate recompute on alphabet edit: revisiting alphabet confirmation and adding a marked character makes the series reachable on the next advance (US1 AC2; groundwork for FR-023) · `packages/studio/src/survey/marks/MarksSeriesStep.tsx` gate logic + step-state wiring

**Checkpoint**: US1 is independently testable — zero-marks alphabets never see a marks screen; marked alphabets route into the (stub) series.

---

## Phase 5: User Story 2 — Simple fully-attested orthography confirms in ≤2 screens (P1)

**Goal**: The S1 attachment station renders one prefilled row per mark (attested pre-checked, plausible proposed, rest blocked), auto-confirms the single-attested-base case, and the series sequencing keeps the simple case to at most two screens (FR-006, FR-007, FR-008, FR-009; SC-002).

**Independent Test**: Confirm an alphabet with one mark on one base and a ready-made form; verify the attachment station shows a pre-confirmed summary (not an open question) and the mechanism gallery is reached after ≤2 marks screens (US2 acceptance scenarios).

### Implementation

**Wave 1 — independent (different files):**

- [x] **T014** [P] [US2] Mark-class grouping by attachment-set similarity + linguistic function, with per-mark split-out support (FR-010 grouping side) · `packages/engine/src/marks/mark-classes.ts`
- [x] **T015** [P] [US2] Attachment proposals: per-mark tri-state over the confirmed bases — attested (from `attestedStacks`, pre-checked), plausible (mark-class heuristics, proposed unchecked), blocked (default); plus the FR-008 auto-confirm predicate (exactly one attested base, no plausible additions) and case-pair derivation from the alphabet's case data (FR-009) · `packages/engine/src/marks/attachment-proposals.ts`

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — independent (different files):**

- [x] **T016** [P] [US2] `AttachmentStation.tsx` (S1): one row per mark, pre-population per T015, unchecked-means-blocked consequence stated in row help text (FR-007), auto-confirmed summary rows still openable for edit (FR-008); container testid `marks-attachment` · `packages/studio/src/survey/marks/AttachmentStation.tsx`
- [x] **T017** [P] [US2] Station sequencing + screen accounting in the step host: skip every station whose render condition fails, so the single-mark/single-base/ready-made case reaches `mechanisms` after at most two rendered screens (SC-002, SC-006); series continue control testid `marks-continue` · `packages/studio/src/survey/marks/MarksSeriesStep.tsx`

**Checkpoint**: US2 is independently testable — the simple orthography flows through as a confirm, not an interrogation.

---

## Phase 6: User Story 3 — Never-composing orthography is proposed the base-plus-mark form, enforced keyboard-wide (P1)

**Goal**: The output-form decision is computed by an ordered decision table, presented as a pre-explained notice in the unambiguous cases, previews backspace behavior, and the uniformity invariant is mechanically checkable on the produced keyboard (FR-013, FR-014, FR-015, FR-017, FR-022; SC-003, SC-005).

**Independent Test**: Confirm an alphabet with one attested pair lacking a ready-made form; verify the output-form station proposes base-plus-mark as a notice, in plain language with no "Unicode"/"normalization", applying uniformly to all mark-bearing letters (US3 acceptance scenarios).

### Implementation

**Wave 1 — independent (different files):**

- [x] **T018** [P] [US3] Output-form policy `resolveOutputFormProposal(posture, hasLetterPlusMarkClass)` as an ordered first-match-wins decision table (the `house-target-policy.ts` row shape): row 1 any pair lacks ready-made → base-plus-mark notice (FR-014); default row all compose + no letter-plus-mark class → ready-made notice (FR-015); open case flagged `open-choice` (FR-016 branch fires in Phase 8); authored explanations free of "Unicode"/"normalization" · `packages/engine/src/marks/output-form-policy.ts`
- [x] **T019** [P] [US3] Uniformity validator `checkNormalizationUniformity(ir): LintFinding[]` — IR-aware per the `layer-a-prime.ts` convention, `layer: "B"`, code `KM_LINT_MARK_NORMALIZATION_UNIFORM`, reusing the combining-run/compose logic from `nfd-to-nfc.ts`; wired into the existing single 300 ms debounce validation run (no second debounce) · `packages/engine/src/validator/layer-b-uniformity.ts` + validator index wiring

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — independent (different files):**

- [x] **T020** [P] [US3] `OutputFormStation.tsx` (S4): notice presentation for the unambiguous branches, mandatory step-by-step backspace preview for the selected form (FR-017), station not rendered when zero decidable pairs exist (edge case); mechanical SC-005 test asserting no "Unicode"/"normalization" in any designer-facing string; container testid `marks-output-form` · `packages/studio/src/survey/marks/OutputFormStation.tsx`
- [x] **T021** [P] [US3] New `layer-c-enforce` criteria row carrying `lintRuleId: "KM_LINT_MARK_NORMALIZATION_UNIFORM"`; enforced counts bump 148 → 149 and band 66 → 67 in the count tests and the summary recompute · `packages/contracts/data/criteria.json`, `packages/contracts/src/types.test.ts`, `packages/contracts/src/schemas.test.ts`, `criteria-summary.md`

**Checkpoint**: US3 is independently testable — the never-composing alphabet gets the decomposed proposal as a notice, and mixing forms is a mechanically detected defect.

---

## Phase 7: User Story 7 — The mechanism gallery receives the typed worklist (P1)

**Goal**: S2 (mental model), S3 (input order), and S5 (stacking) exist; the series exit assembles every decision into a `PlacementWorklist` covering every base and mark exactly once, and the gallery consumes it via an optional typed prop (FR-010, FR-011, FR-012, FR-018, FR-019, FR-020, FR-023; SC-007).

**Independent Test**: Run the series for an alphabet with one own-letter class and one letter-plus-mark class; inspect the gallery's input and verify own-letter units, mark units (with input order), and blocked combinations are three distinguishable groups with nothing unclassified; verify the skip path hands over an empty worklist (US7 acceptance scenarios).

### Implementation

**Wave 1 — independent (different files):**

- [x] **T022** [P] [US7] Mental-model prefill from the three FR-011 signals: productivity spread (attested base count per mark), base keyboard's deadkey-vs-direct mechanism (sibling detector next to `import-mark-order.ts`, informed by the `diacritic-mechanism` facet approach), and spare-key affordability (reusing `spare-key-budget` classifier logic; over-budget renders own-letter as unaffordable with the reason). Thresholds as named constants · `packages/engine/src/marks/mental-model-prefill.ts`
- [x] **T023** [P] [US7] Worklist builder `buildPlacementWorklist(...)`: series decisions → `{ ownLetterUnits, markUnits (with inputOrder), blockedCombinations }`, with the SC-007 invariant (every base and mark classified exactly once) asserted in tests; empty worklist for the skip path · `packages/engine/src/marks/worklist.ts`

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — independent (different files):**

- [x] **T024** [P] [US7] `MentalModelStation.tsx` (S2): per-class radio (`own-letter` / `letter-plus-mark` / `mixed` with per-mark/per-pair split recording — mixed-answer edge case), prefill + unaffordability rendering from T022; MVP degradation (one global confirmation still carrying the FR-011 signals) acceptable per the spec assumption; testid `marks-mental-model` · `packages/studio/src/survey/marks/MentalModelStation.tsx`
- [x] **T025** [P] [US7] `InputOrderStation.tsx` (S3): `pb_mark_input_order` content and prefill (`detectMarkInputOrderFromImport`) relocated verbatim, rendered only when ≥1 class is letter-plus-mark (FR-012, FR-025 preserve-and-relocate half); testid `marks-input-order` · `packages/studio/src/survey/marks/InputOrderStation.tsx`
- [x] **T026** [P] [US7] `StackingStation.tsx` (S5): rendered only on stacking evidence (attested ≥2-mark stack or overlapping plausible sets — FR-018), affirmative answer surfaces the specific attested multi-mark combinations for explicit confirmation, never inferred from attachment rows (FR-019, two-mark-stack edge case); testid `marks-stacking` · `packages/studio/src/survey/marks/StackingStation.tsx`

**⟶ Wait for Wave 2 to finish, then:**

**Wave 3 — ordered (same file, then the consumer):**

- [x] **T027** [US7] Series completion in the step host: assemble all station decisions through T023 into the `PlacementWorklist`, commit `marksWorklist` onto the session, and track per-station `stale` flags — an alphabet edit that changes a decision's evidence marks the affected station(s) requiring reconfirmation before the designer can proceed past them again (FR-023, attachment-set-edited edge case) · `packages/studio/src/survey/marks/MarksSeriesStep.tsx`
- [x] **T028** [US7] `MechanismGallery` accepts `worklist?: PlacementWorklist` as an optional typed prop (the `placementMap` seam pattern); absent ⇒ existing flat `lettersToAdd` behavior unchanged; present ⇒ own-letter units, mark units, blocked combinations drive placement · `packages/studio/src/editors/assignLoop/MechanismGallery.tsx`

**Checkpoint**: US7 is independently testable — the full P1 spine (pick → confirm → series → typed handoff → gallery) works end to end.

---

## Phase 8: User Story 4 — Fully-composable + productive-mark orthography gets the open choice (P2)

**Goal**: The genuinely ambiguous case renders as an open choice, recommendation first, both consequences plain-language, preview for both options (FR-016).

**Independent Test**: Confirm an all-pairs-compose alphabet with ≥1 letter-plus-mark class; verify S4 renders a choice (not a notice) with the recommended option first and a backspace preview for each option (US4 acceptance scenarios).

### Implementation

**Wave 1 — single task:**

- [x] **T029** [US4] Open-choice branch in the output-form station: radio with recommended option listed first, per-option consequence text, backspace preview demonstrating repeated backspace under **both** options (peel-one-mark vs disappear-in-one-step); still zero "Unicode"/"normalization" in prompt text · `packages/studio/src/survey/marks/OutputFormStation.tsx` (+ FR-016 rows in `packages/engine/src/marks/output-form-policy.ts`)

**Checkpoint**: US4 is independently testable — the ambiguous case is asked openly, everything else stays a notice.

---

## Phase 9: User Story 6 — Private-use characters prompt for their role at pick time (P2)

**Goal**: A PUA pick asks letter-or-mark before committing, records the answer as a permanent `declaredRoles` entry, and routes the character accordingly (FR-004).

**Independent Test**: Pick a PUA character; verify the role prompt fires before any list is updated, "mark" lands it in Marks (and later stations), "letter" lands it in Letters (and it never appears in a marks station) (US6 acceptance scenarios).

### Implementation

**Wave 1 — single task:**

- [x] **T030** [US6] Inline PUA role prompt at pick-commit (`isPrivateUseCodePoint` gate): asks letter vs mark before adding to any inventory list; answer recorded in `declaredRoles` (permanent, designer-owned; classifiers read it first, Unicode-property fallback only when absent); routes the character to `bases` or `marks` and in/out of series stations accordingly · `packages/studio/src/survey/CharacterMapPane.tsx` + `packages/studio/src/stores/phaseBDraftStore.ts`

**Checkpoint**: US6 is independently testable — PUA characters are the only picks that ever ask a question, and the answer sticks.

---

## Phase 10: User Story 8 — Blocked combinations are unreachable on the produced keyboard (P2)

**Goal**: The attachment matrix is load-bearing: unchecked base×mark pairs generate blocking (swallow) rules, and the decomposed form gets generated stepwise backspace-unwrap stores (FR-021; SC-004).

**Independent Test**: Complete the series leaving one combination blocked; produce the keyboard and verify typing that base+mark yields no composed result, while a checked combination composes as expected (US8 acceptance scenarios).

### Implementation

**Wave 1 — independent (different concerns, shared new module dir):**

- [x] **T031** [P] [US8] Blocking-rule generation over the working-copy IR: for every mark × base left blocked, the mark key path produces no composed result (swallow behavior — the minimal A6 pull-forward, per R7); derived from the same posture/attachment tables as everything else · `packages/engine/src/pattern-apply/` (new blocking-rules module)
- [x] **T032** [P] [US8] Stepwise backspace-unwrap store generation per the design-note recipe: enumerate valid combinations from the attachment matrix, pair each composed form with its one-mark-shorter predecessor; shape recognized by `nfd-to-nfc.ts`'s `isUnreachableBackspaceOverride` · `packages/engine/src/pattern-apply/` (new unwrap-stores module)

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — single task:**

- [x] **T033** [US8] Wire rule generation into series completion: generated blocking + unwrap rules land in the working-copy IR (never raw `.kmn` text); record the `migrationNeeded` session flag when base-plus-mark is chosen over a ready-made-form base keyboard (R10 — recorded consequence only, no reverse transform) · series-completion path in `packages/studio/src/survey/marks/MarksSeriesStep.tsx` + engine seam

**Checkpoint**: US8 is independently testable — a blocked pair cannot be typed on the produced keyboard; the uniformity check (T019) passes on the generated output.

---

## Phase 11: Polish & cross-cutting

**Wave 1 — independent (different files):**

- [ ] **T034** [P] Retire the five superseded questions — `pb_accent_marks_gate`, `pb_diacritic_select`, `pb_mark_style`, `pb_capitals_marks`, `pb_stacking_marks` — from the registry and the flow YAML, retarget the surrounding `next` routing, update the flow-parity snapshot (FR-025 removal half) · `packages/studio/src/survey/questions/registry.b.ts`, `packages/studio/src/survey/questions/b/` (5 modules), `content/flows/phase_b_characters.modular.yaml`
- [ ] **T035** [P] Digraph wording-parity pass: the digraph question stays outside the series (FR-026), with parallel wording where the "unit or sequence" distinction is the same — review and align prompt text only, no structural change · existing digraph question module under `packages/studio/src/survey/questions/`
- [ ] **T036** [P] E2E: `driveMarksSeries(page, ...)` helper slotted between the characters helpers and `confirmMechanismsEmpty`, plus walk coverage of the skip path (US1) and the simple-confirm path (US2) using `seedReturningVisitor` · `packages/studio/e2e/helpers/surveyFlow.ts` + a walk spec under `packages/studio/e2e/`

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — single task:**

- [ ] **T037** Success-criteria validation + docs sync: run `pnpm typecheck && pnpm -r test && pnpm lint` green; verify SC-001..SC-007 each have a passing mechanical assertion or documented manual check; update the criteria count mentions (148 → 149) in CLAUDE.md and any prose cross-links per the source-of-truth chain · `CLAUDE.md`, `criteria-summary.md` cross-check

---

## Dependencies & Execution Order

- **Phase 1 → Phase 2 → Phases 3–10 → Phase 11.** Foundational (Phase 2) blocks every story; Polish runs last.
- **Story-phase dependencies**: Phase 3 (US5) needs only Phase 2. Phase 4 (US1) needs Phase 3's committed `ConfirmedAlphabet`. Phase 5 (US2) needs Phase 4's step host. Phase 6 (US3) needs Phase 5's sequencing. Phase 7 (US7) needs Phases 5–6 (its worklist consumes attachment + output-form decisions). Phase 8 (US4) extends Phase 6's station. Phase 9 (US6) extends Phase 3's picker path and is otherwise independent of Phases 4–8. Phase 10 (US8) needs Phase 7's completed series state.
- **Waves within phases**: Phase 2 — W1 (T002∥T003) → W2 (T004∥T005∥T006) → W3 (T007). Phase 3 — W1 (T008∥T009) → W2 (T010). Phase 4 — W1 (T011) → W2 (T012∥T013). Phase 5 — W1 (T014∥T015) → W2 (T016∥T017). Phase 6 — W1 (T018∥T019) → W2 (T020∥T021). Phase 7 — W1 (T022∥T023) → W2 (T024∥T025∥T026) → W3 (T027 → T028). Phase 8 — T029. Phase 9 — T030. Phase 10 — W1 (T031∥T032) → W2 (T033). Phase 11 — W1 (T034∥T035∥T036) → W2 (T037).
- **MVP slice**: Phases 1–7 (all P1 stories). Phases 8–10 (P2) each layer on independently; Phase 11 closes out.
