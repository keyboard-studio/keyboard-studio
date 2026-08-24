---

description: "Task list template for feature implementation"
---

# Tasks: Canonical-equivalence context tolerance

**Input**: Design documents from `specs/062-canonical-context-tolerance/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md) (Phase 0 section), [data-model.md](data-model.md), [contracts/context-tolerance-contract.md](contracts/context-tolerance-contract.md)

**Tests**: Included. The plan's own Project Structure lists a `.test.ts` sibling for every new source file — this codebase's convention (see `mark-guards.ts` / `pattern-apply` suites) is write-alongside, not a separate red/green gate, so each implementation task's test sibling is listed as its own checklist item rather than a prerequisite "must fail first" task.

**Organization**: Phase 3–6 map onto spec.md's four user stories in priority order (P1→P4). Two things are genuinely **foundational** rather than story-scoped even though the spec's Dependencies section only names one of them explicitly: simulator context seeding (spec's own words: "should be the first task in the plan") and the engine-side both-forms diagnostic (`context-tolerance.ts`), because the generator's own contract signature (`proposeContextVariants(ir, toleranceReport)`) takes the diagnostic's output as an input — Story 1 cannot generate a variant without first knowing which rule needs one, and Story 2 exists to report exactly that same finding. Both stories consume one shared diagnostic; neither owns it alone.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 (P1) / US2 (P2) / US3 (P3) / US4 (P4)
- Every task names an exact file path.

## Path Conventions

Existing monorepo packages, no new package added:

- `packages/contracts/src/` — additive types only
- `packages/engine/src/{simulator,validator,pattern-apply,facet-transform}/`
- `packages/keyboard-lint/src/checks/`
- `packages/studio/src/{stores,components/facet-transform}/`

---

## Phase 1: Setup (Shared Type Surface)

**Purpose**: Land the additive contract types every later phase imports. Type-only — no behaviour, no logic, so it is safe to parallelize and safe to land first.

- [X] T001 [P] Add `SimulatorContextSeed` interface (`text?`, `caretPos?`, `pendingDeadkeys?: DeadkeySnapshot[]`) to `packages/contracts/src/simulation.ts`, reusing the existing `DeadkeySnapshot` type in the same file — do not invent a parallel deadkey shape.
- [X] T002 [P] Create `packages/contracts/src/toleranceReport.ts` with `ToleranceStatus = "tolerant" | "made-tolerant" | "not-analysed"`, `RuleToleranceFinding` (`ruleId`, `location: SourceLocation`, `status`, `failingKeystrokes?: SimKeyInput[]`, `precomposedOutput?`, `decomposedOutput?`, `notAnalysedReason?`), and `ToleranceReport` (`findings: RuleToleranceFinding[]`, `notAnalysedCount: number`) exactly per [contracts/context-tolerance-contract.md](contracts/context-tolerance-contract.md). Export the new module from `packages/contracts/src/index.ts` alongside the other contract barrels.
- [X] T003 [P] Add an optional `contextToleranceWriteBack?: "echo" | "own-form"` field to `DiscoveryAxisVector` in `packages/contracts/src/axes.ts` (FR-007; default/absent behaves as `"echo"`). No zod mirror is required — confirm first that `DiscoveryAxisVector` has no full-shape schema in `packages/contracts/src/schemas.ts` (only the loosely-typed `AxisFillSchema` exists today); if that has changed, add the field to the mirror in the same commit per the contract source-of-truth chain in CLAUDE.md.

**Checkpoint**: New types compile and are importable; nothing yet reads or writes them at runtime.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infrastructure every user story needs before it can be implemented or independently tested. Per spec.md's Dependencies section, simulator seeding blocks every acceptance test in Stories 1, 2 and 4; the diagnostic blocks Story 1 (as the generator's required input) and is Story 2's own subject.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Implement simulator context seeding in `packages/engine/src/simulator/index.ts`: add an optional third parameter `initialContext?: SimulatorContextSeed` to `simulate(compiled, keys, initialContext?)`. Localize the change to where context is built today (~lines 182-185): construct `new SyntheticTextStore(initialContext?.text ?? "", ...)` (the vendored constructor already accepts `(text?, selStart?, selEnd?)`), call `processor.resetContext(textStore)` (this unconditionally clears deadkeys), THEN insert any `initialContext.pendingDeadkeys` one at a time — for each snapshot, move the caret to its `position` via the text store's selection setter and call `textStore.insertDeadkeyBeforeCaret(id)` (already exists) — and finally restore the caret to `initialContext?.caretPos ?? text.length`. Omitting the third argument must reproduce today's empty-buffer behaviour byte-for-byte (FR-004/SC-002 — existing callers, including `runPatternTests`, pass no third argument and must be unaffected). Depends on T001.
- [X] T005 [P] Add seeding tests to `packages/engine/src/simulator/simulate.test.ts`: seeded `text` + default caret-at-end, explicit `caretPos`, seeded `pendingDeadkeys` at a mid-string position, and a regression case asserting every existing no-seed call in this file still produces byte-identical `SimulationResult`s. Depends on T004.
- [X] T006 Implement `packages/engine/src/validator/context-tolerance.ts`: for each rule the codec modelled (skip `RawKmnFragment` opaque rules — status `"not-analysed"`, `notAnalysedReason` naming the opaque construct), derive the rule's relevant base+mark pair(s) from `nfcPostureOfInventory(alphabet)` (`packages/engine/src/marks/nfc-posture-of-inventory.ts`, imported as-is, no changes), run `simulate()` (T004) twice with the rule's failing keystroke sequence — once seeded with the precomposed form, once with the canonically-decomposed form (via `String.prototype.normalize`, no CCC table, per research.md's Phase 0 decision) — and compare `finalOutput`. Equal outputs → `status: "tolerant"`. Differing outputs → `status: "not-analysed"` with `failingKeystrokes`, `precomposedOutput`, `decomposedOutput` populated (this is the pre-fix "gap found" state data-model.md describes — distinct from the opaque-rule flavor of `"not-analysed"`, which instead populates only `notAnalysedReason`). Before treating a store-backed rule as fixable, call `analyzeStores(ir)` (`packages/engine/src/pattern-apply/applyStoreSlotRemovals.ts`) and check `pairSets`/`unresolvedIndexOutputNames` for that store — a store paired via `index()` with a different store is reported `not-analysed` with a pairing-specific reason, never silently mutated later. Return a `ToleranceReport` where `findings.length + notAnalysedCount === ir`'s total rule count (SC-006 invariant) — assert this invariant in the function itself, not just in tests. Depends on T002, T004.
- [X] T007 [P] Add `packages/engine/src/validator/context-tolerance.test.ts`: a keyboard with a precomposed-only diacritic rule reports a gap with concrete `failingKeystrokes` and both outputs (spec Story 2 Acceptance Scenario 1); a keyboard whose rules already accept both forms reports zero gaps (Acceptance Scenario 2); a keyboard containing an opaque `RawKmnFragment` rule reports it `"not-analysed"` (Acceptance Scenario 3); a store paired via `index()` with a different store is reported `not-analysed` rather than treated as fixable; the `findings.length + notAnalysedCount` invariant holds across all fixtures. Depends on T006.

**Checkpoint**: Foundation ready — simulator seeding and the both-forms diagnostic exist and are tested. User story implementation can now begin.

---

## Phase 3: User Story 1 - Diacritic keys work on decomposed text (Priority: P1) 🎯 MVP

**Goal**: Generate and apply IR-level context variants so an affected rule fires identically on either canonical form of its context, without perturbing the form it already handled.

**Independent Test**: Take a keyboard whose diacritic rules are written against precomposed characters, seed a simulated buffer with the decomposed form of a base+mark pair from its inventory, press the diacritic key, and confirm the result is canonically equivalent to the precomposed-buffer result — for every attested pair in the inventory.

- [X] T008 [US1] Implement `packages/engine/src/pattern-apply/context-variants.ts`: `proposeContextVariants(ir: KeyboardIR, toleranceReport: ToleranceReport)`. For each finding with a diagnosed gap (see T006), synthesize the canonically-equivalent context variant — an added rule or added store members, per `ContextVariant.kind` (`"added-rule" | "added-store-members"`) — following `mark-guards.ts`'s idempotent-generator pattern exactly: pure IR→IR, rebuild groups via spread (never mutate shared rule objects), name every generated node with a recognizable prefix (e.g. `generated_tolerance_*`) so a re-run recognizes and replaces rather than duplicates (FR-011). Resolve canonical mark ordering via `.normalize()` at generation time (FR-005) and decide decomposability the same way, never by Unicode property (FR-006, PUA-safe). Reuse `entryGroupOf`/`insertBeforeTerminalRules` from `packages/engine/src/pattern-apply/ir-insert.ts` to place each generated rule before any terminal `match`/`nomatch` rule in its group **and** before the existing fallback rule it must preempt when `ContextVariant.precedesFallbackRuleId` is set (spec Story 1 Acceptance Scenario 3 — e.g. `sil_yoruba8`'s `+ ']' > '´'` must not fire once the tolerant rule is present). Before adding store members, gate on the same `analyzeStores`/`pairSets` check as T006 — a paired store is skipped, reported, never mutated (spec's "Stores used with paired index()" edge case). Rules the codec could not model are never touched (FR-010). Depends on T006, T008's own reuse of `applyStoreSlotRemovals.ts`/`ir-insert.ts` (existing, unchanged).
- [X] T009 [US1] Register a `MigrationRule` for context tolerance in `packages/engine/src/facet-transform/migrations/context-tolerance.ts` (new file) and add it to the registry in `packages/engine/src/facet-transform/migrations/index.ts`, so committing a proposal can reuse the existing `applyFacetTransform` gate (`packages/engine/src/facet-transform/verify.ts`) unchanged. **Design note carried forward from research.md's Phase 0 (explicitly deferred there)**: the current `TransformProposal` type (`packages/engine/src/facet-transform/types.ts`) is NOT generic — it has a fixed `transitionId: {facetId, fromValue, toValue}` and an `affectedSites: AffectedSite[]` keyed by `siteId`, not the `TransformProposal<ContextVariant>` sketch in the contract doc. Resolve this by mapping each `RuleToleranceFinding` needing a fix to one `AffectedSite` (`siteId` = the rule's id), synthesizing a stable `transitionId` for this facet (e.g. `{facetId: "context-tolerance", fromValue: "not-tolerant", toValue: "tolerant"}`), and giving the registered rule's `apply(workingCopyIr, acceptedSiteIds, measurement)` a body that delegates to `proposeContextVariants`'s per-rule generation logic from T008, scoped to `acceptedSiteIds` (FR-012 partial acceptance). Depends on T008.
- [X] T010 [P] [US1] Add `packages/engine/src/pattern-apply/context-variants.test.ts` covering: Acceptance Scenarios 1-4 of Story 1 (decomposed-buffer parity, precomposed-buffer byte-identity per FR-004, fallback-rule preemption, toggle/cycle parity), FR-003/005/006/010/011 directly, and a case where a store is paired via `index()` and the generator reports it skipped rather than mutating it. Depends on T008.
- [X] T011 [P] [US1] Add a corpus regression test (e.g. `packages/engine/src/pattern-apply/context-variants.sil-yoruba8.test.ts`) against the `sil_yoruba8` keyboard proving SC-004 directly: with the buffer decomposed, the acute key applies an acute (not the `+ ']' > '´'` fallback), and the decomposed `a` + acute → acute-key toggle case behaves as it does on the precomposed form. Run this against the `keymanapp/keyboards` upstream corpus data, not assumptions about the local `../keyboards` fork's current state (see prior corpus-staleness note — the fork can drift from what a deterministic fixture test expects). Depends on T008, T009.

**Checkpoint**: User Story 1 is fully functional and independently testable — a keyboard can be diagnosed, given generated variants, committed, and re-simulated to observe tolerant behaviour.

---

## Phase 4: User Story 2 - The author is shown the gap, with a reproducible case (Priority: P2)

**Goal**: Surface the diagnostic (already built in Phase 2) through Layer C as classified, actionable findings — no fix applied.

**Independent Test**: Run the diagnostic against a keyboard known to have the gap and against one known not to. The first reports each affected rule with a concrete failing keystroke sequence and both observed outputs; the second reports nothing. No fix is applied in either case.

- [X] T012 [US2] Implement `packages/keyboard-lint/src/checks/check-19-x-context-tolerance.ts`: `checkContextTolerance(ir: KeyboardIR, toleranceReport: ToleranceReport | undefined): LintFinding[]`. Absent report → no-op (mirrors the existing `inventory`/`touchLayout` gating in `lintContext.ts`). Present report → one `LintFinding` per non-tolerant/not-analysed `RuleToleranceFinding`: `KM_WARN_CONTEXT_NOT_TOLERANT` (warning) for a diagnosed gap, `KM_HINT_CONTEXT_NOT_ANALYSED` (hint) for opaque/unresolved-pairing rules — both new codes, warning/hint severity only (Layer C ships zero error-severity codes today; this feature does not introduce the first one). **Design note to resolve here**: FR-012 requires naming characters "by codepoint and Unicode name" in the finding's `message`, but the two existing name-lookup utilities — `packages/engine/src/character-discovery/charNames.ts` (`loadCharNames()`) and `packages/studio/src/survey/codepointLabel.ts` — live in `engine` and `studio` respectively, and `keyboard-lint` is dependency-cruiser-forbidden from importing `packages/engine` (`lint-not-to-engine`, the same boundary the plan's Complexity Tracking table already resolved for the simulator). Either (a) have `context-tolerance.ts` (T006, already engine-side and already importing `charNames.ts`) precompute the codepoint+name-annotated text and carry it on `RuleToleranceFinding` as an additional plain-string field, or (b) have this check emit only raw codepoints in `message` and let the studio-side renderer decorate them via its own `codepointLabel.ts` at display time. Pick (a) unless it conflicts with data-model.md's stated intent that `RuleToleranceFinding` holds only raw codepoints — if so, document the chosen split in a comment at the top of this file so a future reader does not re-litigate the boundary. Depends on T002, T006.
- [X] T013 [P] [US2] Add `packages/keyboard-lint/src/checks/check-19-x-context-tolerance.test.ts`: a `ToleranceReport` with a diagnosed gap produces `KM_WARN_CONTEXT_NOT_TOLERANT` naming the rule's location and both outputs (Story 2 Acceptance Scenario 1, FR-012 wording check — no "NFC"/"NFD" in the message); a clean report produces zero findings (Acceptance Scenario 2); a not-analysed report produces `KM_HINT_CONTEXT_NOT_ANALYSED` (Acceptance Scenario 3); an absent report produces zero findings and does not throw. Depends on T012.
- [X] T014 [US2] Extend `LintContext` in `packages/keyboard-lint/src/lintContext.ts` with an optional `toleranceReport?: ToleranceReport` field, following the exact gating shape already used for `inventory`/`touchLayout` (`if (ctx.toleranceReport) { findings.push(...checkContextTolerance(ctx.keyboardIR ?? ir, ctx.toleranceReport)); }` inside `lintWithContext()`), and document the gate in the module's "Gate -> check mapping" comment block alongside the existing 18.x entries. Depends on T012.
- [X] T015 [P] [US2] Update `packages/keyboard-lint/src/lintContext.test.ts` to cover the new gate: `toleranceReport` present → check runs; absent → silently skipped, matching the existing 18.6 test shape. Depends on T014.

**Checkpoint**: User Stories 1 and 2 both work independently — a keyboard can be diagnosed and reported without any variant being generated or applied.

---

## Phase 5: User Story 3 - The author decides what gets written back (Priority: P3)

**Goal**: Let the author choose echo vs. own-form write-back (FR-007), with FR-008's consequence disclosed before commit.

**Independent Test**: With the same keyboard and the same decomposed buffer, switch the setting between its values and confirm the emitted bytes differ as specified while the visible result stays canonically equivalent in every case.

- [X] T016 [US3] Confirm `contextToleranceWriteBack` (T003) round-trips through `packages/studio/src/stores/workingCopyStore.ts`'s existing `setIrAxes`/`setAxisFills` actions with no new action needed (it is a plain optional field on `DiscoveryAxisVector`, picked up generically) — add a targeted read accessor only if no existing selector already exposes `irAxes` fields to callers that need this one. Depends on T003.
- [X] T017 [US3] Extend the context-tolerance `MigrationRule.apply()` (T009) to branch on `contextToleranceWriteBack`: default/`"echo"` emits the decomposed (or found) form with no backspace over pre-typed characters (FR-007 Acceptance Scenario 1); `"own-form"` rewrites the touched cluster to the keyboard's own form and populates the resulting `TransformProposal`'s `preview` with `previewKind: "output-diff"` and an `outputDiff` row per rewritten cluster, reusing `FacetTransformPanel.tsx`'s existing output-diff branch (`packages/studio/src/components/facet-transform/FacetTransformPanel.tsx`, ~line 149) unchanged — confirm no new `PreviewKind` variant is actually required before adding one. Depends on T009, T016.
- [X] T018 [P] [US3] Add tests (in `context-variants.test.ts` or a sibling `context-variants.writeBackPolicy.test.ts`) for: FR-007 Acceptance Scenario 1 (echo, no backspace over untyped text), Acceptance Scenario 2 (own-form, consequence surfaced via `TransformPreview.outputDiff` before commit), and Acceptance Scenario 3 (byte-identical output under both settings when the buffer already holds the keyboard's own form). Depends on T017.
- [X] T019 [US3] Add a `workingCopyStore` test (alongside `packages/studio/src/stores/workingCopyStore.facetTransform.test.ts`) confirming `contextToleranceWriteBack` survives a `draftPersistence.ts` snapshot/restore round-trip with no new wiring in that file, per the plan's claim that the generic `WorkingCopyData` snapshot already covers it. Depends on T016.

**Checkpoint**: User Stories 1–3 all work independently.

---

## Phase 6: User Story 4 - Backspace behaves the same over either form (Priority: P4)

**Goal**: Generalize the `sil_cameroon_qwerty` stepwise-unwrap technique so backspace peels one mark at a time regardless of which canonical form the buffer holds, for any keyboard the studio produces.

**Independent Test**: For each attested multi-mark form in the inventory, seed the buffer with that form in both normalizations, press backspace repeatedly, and confirm the two sequences of intermediate states are canonically equivalent at every step.

- [X] T020 [US4] Extend `packages/engine/src/pattern-apply/context-variants.ts` (T008) to also detect and generate variants for backspace context rules (`+ [K_BKSP] > ...`), reusing — not reimplementing — the store-pair idiom already built in `packages/engine/src/pattern-apply/mark-guards.ts` (`MARKS_UNWRAP_FROM_STORE`/`MARKS_UNWRAP_TO_STORE`, the stepwise backspace unwrap for ready-made NFC output), generalized to run off the same `nfcPostureOfInventory` per-pair table T008 already consumes rather than that module's independent normalize logic (per research.md's explicit decision not to consolidate the two call sites — call the shared function from this new call site too, don't refactor `mark-guards.ts`). Depends on T008.
- [X] T021 [P] [US4] Add tests covering Story 4's two acceptance scenarios: a precomposed two-mark form and its decomposed equivalent each lose exactly one mark on a single backspace and land in canonically-equivalent intermediate states (Scenario 1); a host that deletes a whole grapheme cluster on backspace still removes exactly one mark from a decomposed accented letter, not the whole cluster (Scenario 2). Depends on T020.

**Checkpoint**: All four user stories are independently functional. Context tolerance now covers input, diagnosis, write-back choice, and backspace.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Cross-story invariants (FR-011, SC-001/SC-006) and documentation upkeep. None of these gate any single story's independent test, but all are required before the feature is considered complete per its own Success Criteria.

- [X] T022 [P] Add `packages/engine/src/pattern-apply/context-variants.idempotency.test.ts` proving FR-011: running `proposeContextVariants` + commit twice against the same starting IR produces byte-identical resulting IR (the generated-node name-prefix recognize-and-replace behaviour from T008, exercised end-to-end).
- [X] T023 [P] Add `packages/engine/src/validator/context-tolerance.sweep.test.ts` proving SC-001 and SC-006 together over a fixture keyboard with a confirmed inventory: every attested base+mark pair produces a canonically-equivalent result from either starting form after variants are applied, and `findings.length + notAnalysedCount` accounts for 100% of the keyboard's rules.
- [X] T024 Update the module doc comment at the top of `packages/engine/src/marks/nfc-posture-of-inventory.ts` to record context tolerance as its fifth consumer (alongside the posture facet, output-form proposal, stepwise-unwrap stores, and blocking rules) — comment-only, no logic change, matching spec.md's Key Entities framing.
- [X] T025 [P] Cross-link this feature from `docs/design-notes/mark-composition-model.md`'s "uniformity invariant" section, noting spec 062 as the invariant's named second half ("output is uniform, context is tolerant") per spec.md's own "The invariant this feature names" section — a one- or two-sentence pointer, not a re-derivation.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — T001/T002/T003 are independent files, fully parallel.
- **Foundational (Phase 2)**: T004/T005 depend on T001. T006/T007 depend on T002 and T004. **Blocks all user stories.**
- **User Story 1 (Phase 3)**: Depends on Foundational completion (T006). No dependency on US2/US3/US4.
- **User Story 2 (Phase 4)**: Depends on Foundational completion (T002, T006) only — does NOT depend on US1's generator. Can run in parallel with Phase 3 by a second contributor.
- **User Story 3 (Phase 5)**: Depends on US1 (T008, T009) — it modifies the same `MigrationRule.apply()` write path — and on T003 (Setup).
- **User Story 4 (Phase 6)**: Depends on US1 (T008) — it extends the same generator module.
- **Polish (Phase 7)**: Depends on whichever of US1–US4 it references (T022/T023 need US1's T008; T024/T025 are documentation-only and can land any time after Phase 2).

### Within Each User Story

- US1: T008 (generator) → T009 (commit wiring) → T010/T011 (tests), T010 and T011 parallel to each other.
- US2: T012 (check) → T013 (test), T012 → T014 (context wiring) → T015 (test). T013 and T014 can run in parallel once T012 lands.
- US3: T016 (store) parallel to T017 (generator branch, depends on T009); T018 depends on T017; T019 depends on T016.
- US4: T020 → T021.

### Parallel Opportunities

- All of Phase 1 (T001-T003).
- T005 and T006 (both depend only on T004, not on each other).
- Phase 3 (US1) and Phase 4 (US2) can be staffed in parallel once Phase 2 completes — they touch disjoint files (`pattern-apply/` + `facet-transform/migrations/` vs. `keyboard-lint/`).
- T010/T011 within US1; T013/T014 within US2; T021 is solo within US4.

---

## Parallel Example: Phase 2 (Foundational)

```bash
# T004 must land first (simulator seeding); then run these two in parallel:
Task: "Add seeding tests in packages/engine/src/simulator/simulate.test.ts"
Task: "Implement packages/engine/src/validator/context-tolerance.ts"
```

## Parallel Example: User Story 1 and User Story 2 (different contributors)

```bash
# Once Phase 2 is complete, these two phases touch disjoint files:
Task: "US1 — implement packages/engine/src/pattern-apply/context-variants.ts"
Task: "US2 — implement packages/keyboard-lint/src/checks/check-19-x-context-tolerance.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (contract types).
2. Complete Phase 2: Foundational (simulator seeding + diagnostic) — CRITICAL, blocks everything.
3. Complete Phase 3: User Story 1 — a keyboard with generated-and-committed context variants now behaves tolerantly, provable by direct simulator re-runs.
4. **STOP and VALIDATE**: re-run the `sil_yoruba8` corpus test (T011) and confirm SC-004 directly.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. Add US1 → validate independently → this alone fixes the reported defect (MVP).
3. Add US2 → validate independently → authors can now see the gap on keyboards they choose not to fix.
4. Add US3 → validate independently → authors can choose write-back policy for FLEx-hostile hosts.
5. Add US4 → validate independently → backspace parity closes the loop `sil_cameroon_qwerty` solved by hand.
6. Polish (Phase 7) → idempotency/sweep proofs and doc cross-links.

### Parallel Team Strategy

Foundational (Phase 2) must land as one sequential unit (T004 gates both downstream branches). After that:

- Developer A: User Story 1 (engine-heavy: generator + migration wiring).
- Developer B: User Story 2 (keyboard-lint-heavy: check + context wiring) — no file overlap with A.
- Once US1 lands, Developer A or C picks up US3 (write-back) and US4 (backspace) — both extend US1's same generator module, so stage them sequentially rather than splitting further to avoid merge conflicts in `context-variants.ts`.

---

## Notes

- [P] tasks touch different files and have no unmet same-phase dependency.
- Two genuine open design questions are carried forward into task descriptions rather than pre-decided incorrectly: the `TransformProposal`/`MigrationRule` shape mismatch with the contract doc's `TransformProposal<ContextVariant>` sketch (T009), and where FR-012's codepoint+Unicode-name formatting can live given the `lint-not-to-engine` boundary (T012). Resolve both at implementation time, not by editing this file.
- FR-009 discipline applies throughout: nothing here normalizes IR bytes on the parse/emit path; every mutation is proposed, previewed, and confirmed through the facet-transform seam.
- Rules the codec could not model are reported, never modified, at every phase (T006, T008, T012).
- Commit after each task or logical group, per this repo's phase-commit cadence (CLAUDE.md "Commit and push cadence for multi-phase specs") — one commit per completed phase, referencing the task IDs it closes.

### Follow-ups surfaced by the km-lead review cycle (not blocking, tracked here)

- **FR-012's "Unicode name" half is unmet.** `check-19-x-context-tolerance.ts` names characters by codepoint only; no studio-side renderer decorates a finding with the Unicode character name. See that file's own "KNOWN GAP" comment.
- **Mnemonic-layout backspace-unwrap doesn't fire.** On a MNEMONIC keyboard (`sil_yoruba8` included), `any(store) + [K_BKSP] > index(store,1)` never matches through this repo's KeymanWeb-model simulator — root-caused to `setMnemonicCode`'s `Lcode` deletion for non-modifier keys with no character mapping (upstream KeymanWeb behavior, `keymanapp/keyman#3744`). Not confirmed against Keyman's native Core engine. See `context-variants.ts`'s `addBackspaceUnwrap` doc, "KNOWN LIMITATION 1".
- **Canonical mark order vs. typing order.** The backspace-unwrap generator (and its `mark-guards.ts` precedent) drops the canonically-LAST NFD mark, not the most-recently-typed one — wrong for a base carrying marks of two different Unicode combining classes (Vietnamese circumflex+tone is the corpus example). Spec-compliant (Story 4/FR-014 ask only for canonical equivalence + count), not typing-order-faithful. See `addBackspaceUnwrap`'s doc, "KNOWN LIMITATION 2".
- **Codec gap: multi-codepoint store items don't round-trip.** `codec/emit.ts`'s `emitStoreItems` has no per-item separator, so a `char` store item whose value is more than one codepoint silently loses its boundary against its neighbor on emit. Real `.kmn` allows this; this codebase's codec does not preserve it. Worth its own follow-up ticket independent of spec 062.
