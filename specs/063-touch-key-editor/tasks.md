# Tasks: key-level touch layout editing

**Feature**: [specs/063-touch-key-editor](spec.md) · **Branch**: `063-touch-key-editor` · **Generated**: 2026-08-04

**Inputs**: [spec.md](spec.md) · [plan.md](plan.md) · [data-model.md](data-model.md) · [research.md](research.md) (R1–R10) · [contracts/touch-key-rule-join.md](contracts/touch-key-rule-join.md) · [contracts/key-id-policy.md](contracts/key-id-policy.md) · [contracts/layer-families.md](contracts/layer-families.md) · [contracts/key-edit-overlay.md](contracts/key-edit-overlay.md)

**Line format**: `- [ ] **T###** [P] [US#] Description · path`. `[P]` marks a task independent of the others in its wave (different file, no incomplete dependency). A wave of one carries no `[P]`.

---

## Phase shape, and the two ordering constraints that are not negotiable

Ten phases. Two of them are shared infrastructure sitting *between* stories rather than before all of them — that is the plan's sequencing, not a drafting accident:

- **Phase 4 (Layer C checks) must precede Phase 5 (the editor).** The checks are corpus-calibrated against layouts we did not create. Calibrate them after the editor can mint new instances of the same defects and you are measuring our own output ([plan.md](plan.md) "Ordering constraint worth naming").
- **Phase 5 blocks US2/US3/US4 but depends on US1's join.** It cannot be hoisted into Phase 2, and none of the three editing stories can start without it.

**Phase 3 (US1) ships independently with zero UI change.** It is the only phase that is a complete, deliverable increment on its own.

---

## Phase 1: Setup — prerequisite helper lifts (no behaviour change)

Six helpers the contracts name as reachable are private or absent ([research.md](research.md) R10.5). Lifting them is prerequisite work, not tidy-up. Nothing here changes behaviour.

**Wave 1 — independent (different files):**

- [x] **T001** [P] Move `isPlusSeparator` into contracts (it is already structurally typed, so the move is free — no IR import) and add its barrel entry · packages/contracts/src/rule-shape.ts
- [x] **T002** [P] Export the module-private `TOUCH_LAYER_PRECEDENCE_ORDER` so the layer decomposition can lift it rather than re-derive the order (R10.6) · packages/engine/src/pattern-apply/modifierCombos.ts
- [x] **T003** [P] Lift the private `entryGroupOf` and `insertBeforeTerminalRules` out of mark-guards into a shared module, so the mark-guard synthesizer and touch-rule synthesis cannot diverge · packages/engine/src/pattern-apply/ir-insert.ts
- [x] **T004** [P] Add `parseTouchKeyAddress` + `TouchKeyAddressParts` beside the three existing builders — the inverse the repo lacks — returning `undefined`, never throwing, for a non-address · packages/engine/src/pattern-apply/touchKeyAddress.ts

**⟶ Wait for Wave 1 to finish, then:**

- [x] **T005** [P] Re-export `isPlusSeparator` from its engine home so every existing call site is unchanged · packages/engine/src/shared/rule-shape.ts
- [x] **T006** [P] Rewire mark-guards onto the lifted helpers, asserting no behaviour change · packages/engine/src/pattern-apply/mark-guards.ts
- [x] **T007** [P] Address-parser round-trip test: `parse(build(...))` deep-equals inputs for all three builders including `sk`, `multitap`, and `flick` forms; an invalid string returns `undefined`; decide and pin the colon-bearing-id case (the `T_*` regex accepts any non-whitespace) · packages/engine/src/pattern-apply/touchKeyAddress.test.ts

**Do not** write the join's struck-key resolution on top of the private `extractRuleVkey` — it does not filter plus-separators, so the join's §2.1 rule is strictly stronger (R10.5). The join writes its own in T014.

---

## Phase 2: Foundational — the locked-type change, the join, and the `sp` correction

Blocks every story. The §18 contract change is signed off (2026-08-03, [docs/spec-signoff.md](../../docs/spec-signoff.md)); Article I's stop-and-escalate does not fire.

**Wave 1 — the locked-type change (one atomic edit; the compile-time drift guard fails the build if these are split):**

- [x] **T008** Add `TouchKeyIR.layer?: string` (per-key modifier override) and subkey `default?: boolean` (longpress preselect) to the interface, the zod mirror, **and** the drift guard beside `_TouchKeyIRGuard` in one edit; also correct the `sp` doc comment to `8 deadkey, 9 blank, 10 spacer` · packages/contracts/src/keyboard-ir.ts (+ packages/contracts/src/schemas.ts)

**⟶ Wait for T008, then:**

- [x] **T009** [P] Map `layer` and subkey `default` in `convertKey` — both are currently dropped unconditionally · packages/contracts/src/parseTouchLayout.ts
- [x] **T010** [P] Emit `layer` and subkey `default` so both round-trip · packages/engine/src/codec/parse-touch.ts
- [x] **T011** [P] Bump `@keyboard-studio/contracts` 0.17.0 → 0.18.0 (0ver-minor convention for a locked-surface change) · packages/contracts/package.json

**⟶ Wait for T009 + T010, then:**

- [x] **T012** Codec round-trip test: a key carrying `layer: "shift"` and, separately, a subkey carrying `default: true`, survive parse → emit unchanged; a duplicate-id fixture disambiguated **only** by a per-key `layer` override resolves as two distinct keys in `TouchLayoutIR`, not one collapsed key · packages/engine/src/codec/parse-touch.test.ts

**⟶ Wait for T012 (the join's fixture needs `layer` to exist), then — the join:**

- [x] **T013** Build the reduced, deliberately defective Cameroon-derived fixture **inline** (contracts stay I/O-free and browser-safe): a mark key + its guard rule, a SHIFT-doubled mark key, a multi-char output, a `> nul` key with `nextlayer`, ruleless sentinel and frame keys, `U_` longpresses under a `T_` key, a guard store, a duplicate-id pair *and* a `layer`-disambiguated pair, and the injected AZERTY orphan (a rule pair for an id the layout carries only in its `U_` form). One fixture serves the role matrix, reachability, and the applier twins · packages/contracts/src/fixtures/touchKeyRuleJoin.ts

**⟶ Wait for T013, then:**

- [x] **T014** Implement the join — `TouchKeyRuleBinding`, `TouchKeyRuleIndex`, `buildTouchKeyRuleIndex`: struck-key resolution as the first vkey **after filtering plus-separators** (its own implementation, per T001's note), `T_`/`U_`/`K_` scope (FR-001), role classification in the fixed order suppresses → guard → transitions → opaque → produces (FR-002), case-insensitive normalization with every as-written spelling retained (FR-003), production collected **only** through the exported `collectFromElements` walk (FR-004), and `opaqueFragmentCount = ir.raw.length` · packages/contracts/src/touch-key-rule-join.ts

**⟶ Wait for T014, then:**

- [x] **T015** [P] Barrel exports for the join and the address-parts type · packages/contracts/src/index.ts
- [x] **T016** [P] Role-matrix test suite: produces · `> context` guard · `> nul` · `use()` · opaque raw · `index()`-driven · `outs()`-driven; case normalization and spelling capture; multi-char `producedText`; `[SHIFT T_…]` modifier capture; opaque-fragment count; `K_`-id indexing · packages/contracts/src/touch-key-rule-join.test.ts

**⟶ Independently of the join — the `sp`-class correction, isolated (FR-012):**

- [x] **T017** Correct `SPACER_SP_VALUES` from `{8,10}` to `{9,10}` and add a deadkey predicate; the enum is `deadkey=8, blank=9, spacer=10` upstream · packages/contracts/src/touch-coverage.ts

**⟶ Wait for T017, then:**

- [x] **T018** [P] Recount the keys-per-row check under the corrected predicate and update its test expectations · packages/keyboard-lint/src/checks/check-18-3-keys-per-row.ts
- [x] **T019** [P] Placeholder-promotion canary: the correction makes `isBlankPlaceholder` **stricter** about `sp:8` and **looser** about `sp:9`, changing which slots read as free — that file's existing test is the canary and must be updated deliberately, not silently · packages/engine/src/pattern-apply/applyTouchAssignmentsToRawJson.test.ts

---

## Phase 3 (US1, P1): The studio tells the truth about what my keyboard can type

**Goal**: Touch coverage joins the layout against the rules, so a `T_*` key whose output lives in a `.kmn` rule is credited — and the inverse defect (a rule whose key exists nowhere) is surfaced separately.

**Independent Test**: Load `sil_cameroon_qwerty` as a base, reach the touch stage, confirm all fourteen mark characters read as covered and the FR-008 gate does not block. Load `sil_cameroon_azerty` and confirm the orphan `T_03B1` rule is reported (its finding lands in Phase 4; the reachability *view* that detects it lands here).

**Zero UI change.** This phase is independently shippable.

### Implementation

**Wave 1 — the two producibility views (different files):**

- [x] **T020** [P] [US1] Add `buildReachableProducedSet` as a **sibling function, not an option** — returning `reachable`, `orphaned`, and `orphanBindings`; reachability by id prefix: `K_` always reachable, `T_`/`U_` only when carried by a key on a layer the `default` BFS reaches, **everything** reachable when the IR has no touch layout. Document the two scope limits (no `use()`-chain group reachability, no layer↔modifier cross-check) and the normative adopter list in the module header (FR-008, FR-009, FR-010) · packages/contracts/src/ir/reachableProducedSet.ts
- [x] **T021** [P] [US1] Freeze the plain view: add the adopter list to its module header and a regression test pinning that `buildProducedSet` **still counts** an orphan `T_` rule (FR-008, FR-010) · packages/contracts/src/ir/producedSet.ts
- [x] **T022** [P] [US1] `TouchCoverageOptions` as an optional **third** positional argument (`ruleIndex?`, `stripDottedCircle?`) — there is no options bag today (R10.7), and absent the argument behaviour must be byte-identical (FR-005) · packages/contracts/src/touch-coverage.ts

**⟶ Wait for Wave 1, then:**

- [x] **T023** [US1] The U+25CC strip: additive only, and only when the remainder after removing every U+25CC is non-empty **and** consists solely of combining marks — so a bare `◌` keycap is never stripped to empty (FR-006) · packages/contracts/src/touch-coverage.ts

**⟶ Wait for T020–T023, then — tests before the callers move:**

- [x] **T024** [P] [US1] Reachability tests: an orphan `T_` excluded from `reachable`; a `K_` rule always reachable; **no touch layout ⇒ the result deep-equals `buildProducedSet` and `orphaned` is empty**; a `T_` on an unreachable layer counted as orphaned · packages/contracts/src/ir/reachableProducedSet.test.ts
- [x] **T025** [P] [US1] Coverage regression locks: a two-argument call is byte-identical to today's output; `T_0300` under a `◌̀` keycap credits U+0300 **only** when the index is passed; the strip is additive; a bare `◌` is not stripped to empty; multi-char and `sp:8` keys behave per the corrected enum · packages/contracts/src/touch-coverage.test.ts

**⟶ Wait for T025, then — migrate all four callers in the same change (FR-007); leaving any one behind defeats the fix:**

- [x] **T026** [P] [US1] Engine wrapper: thread the index in **between** the coverage call and `augmentWithComposable`, so a mark credited by the join then feeds composability · packages/engine/src/pattern-apply/touchCoverage.ts
- [x] **T027** [P] [US1] Layer C inventory-coverage adopts the **joined** view — already scope-guarded to a scaffolded IR with no opaque fragments, so zero legacy-corpus fallout by construction · packages/keyboard-lint/src/checks/check-18-6-inventory-coverage.ts
- [x] **T028** [P] [US1] Studio inventory gate: pass the index at the coverage call · packages/studio/src/hooks/useInventoryDiff.ts
- [x] **T029** [P] [US1] TouchGallery's **direct** `computeTouchCoverage` call (`baseTouchCoveredSet`, feeding `collectCompositionMethod`) — the fourth caller, and the one most easily missed · packages/studio/src/editors/assignLoop/TouchGallery.tsx

**⟶ Wait for the four callers, then:**

- [x] **T030** [US1] Extend `useInventoryDiff` with a **third** `producedButUnreachable` array at all three return sites including the `baseIr === null` fallback. `lettersToAdd` / `alreadyProduced` arithmetic stays untouched, so author workload and the §18.6 denominator do not silently move (FR-011) · packages/studio/src/hooks/useInventoryDiff.ts

**⟶ Wait for T026–T030, then — the locks that prove nothing else moved:**

- [x] **T031** [P] [US1] Regenerate `docs/keyboard-facet-index.json` and assert it **byte-identical**: the facet classifiers, `producedGlyphs`, and facet-transform verify all keep the plain view (SC-003, FR-010) · docs/keyboard-facet-index.json
- [x] **T032** [P] [US1] SC-001 canary with the established skip-if-absent pattern: on `sil_cameroon_qwerty` all fourteen combining-mark characters read as covered once the index is threaded, and the completion gate does not block on them. Corpus-wide aggregates stay narrative and are **never** asserted · packages/engine/src/pattern-apply/touchCoverage.test.ts

**Checkpoint — US1 is independently functional and shippable.** Coverage tells the truth on Cameroon, the reachability view exists alongside the frozen plain view, the studio surfaces the unreachable delta, and no facet value moved. No UI changed.

---

## Phase 4 (US1 + US5): Layer C checks — calibrated *before* the editor can mint new defects

Shared phase. The orphan-rule and dead-key checks are US1's reporting surface (AS4, SC-002); duplicate-id, missing-required-key, and missing-layer are US5 siblings. **This phase must land before Phase 5** — see the ordering constraint at the top.

**No rows are added to `criteria.json`** (FR-043): `CriteriaBands.lintRuleId` is singular and 1:1, so every new code lands at check-module level, documented in that check file's own header. **Every code stays warning-or-hint** — a first error-severity Layer C row is a layering change nobody signed off on.

**Which 18.6 module hosts the three joined codes — pinned, because the two 18.6 files are not interchangeable.** `check-18-6-inventory-coverage.ts` opens with `if (ir.origin !== "scaffolded") return []`, and Phase 3's T027 relies on exactly that guard as the reason adopting the reachability view there is safe. The dead-key, orphan-rule, and case-hint codes must fire on **imported** keyboards — both SC-002 canaries are imported — so they cannot live behind that guard, and they land in `check-18-6-touch-coverage.ts`, the touch-layout-side 18.6 module the join contract's own §5.1 cites as the opaque-fragment precedent. Putting them in the scaffolded-guarded module would make SC-002 unsatisfiable while looking correct.

**Wave 1 — the shared input resolver first (everything below needs rules *and* layout):**

- [x] **T033** [US1] [US5] One internal layout resolver stating precedence once — the IR's touch layout first (spec-014 made it the canonical mutable home), then the lint context's, then a VFS parse — with the joined checks gated on a keyboard IR being present, exactly as the desktop inventory check is gated. No new `LintContext` field · packages/keyboard-lint/src/checks/_shared.ts

**⟶ Wait for T033, then — the six checks (three files, so three sub-groups; within a file they are sequential):**

- [x] **T034** [P] [US1] `KM_LINT_TOUCH_KEY_NO_RULE` (warning; 0x092 analogue) with **all** its exemptions: skip on `nextlayer`; run only when `sp ∈ {absent, 0, 8}`; skip `*`-prefixed frame labels; skip sentinel ids (`T_BLANK`, `T_SPACER`, `T_NUL`) and blank/spacer classes; skip `T_new_*` and the reserved `T_removed_*` / `T_carved_*` / `T_touchdel_*` prefixes; **downgrade to a hint when `ir.raw.length > 0`** (whole-IR scope, not per-group — an opaque fragment has no group to scope to); a key whose only bindings are guard/suppresses/transitions/opaque is **wired, not dead**. Descend into `sk`/`multitap`/`flick` itself — `walkTouchKeys` does not. **Not** the scaffolded-guarded module — see the note above · packages/keyboard-lint/src/checks/check-18-6-touch-coverage.ts
- [x] **T035** [P] [US5] `KM_WARN_TOUCH_DUPLICATE_KEY_ID` (warning) with its three exemptions in order: sentinel/auto ids; blank/spacer class; and **keys disambiguated by a per-key `layer` override** — the exemption that takes the check from ~13,900 corpus findings to ~1,170, and which T008 is what makes implementable at all · packages/keyboard-lint/src/checks/check-18-4-control-key-drift.ts
- [x] **T036** [P] [US5] `KM_WARN_TOUCH_MISSING_LAYER` (warning; 0x091 analogue). Do **not** promote it to an error even though a dangling `nextlayer` under-credits our own reachability BFS — upstream warns, and hundreds of corpus keyboards contain instances · packages/keyboard-lint/src/checks/check-18-5-layer-switch-return.ts

**⟶ Wait for T034, then (same file):**

- [x] **T037** [P] [US1] `KM_LINT_TOUCH_RULE_ORPHAN` (warning; Developer has no such check). Fires only when a touch layout exists, and distinguishes **absent** (on no key of any layer of any platform) from **unreachable-layer**. For absent, name the near-miss: for `T_03B1` the layout carries `U_03B1`, so the actionable message is that the self-outputting `U_` id **bypasses the author's `any(diablock)` guard** — that is the finding's real payoff · packages/keyboard-lint/src/checks/check-18-6-touch-coverage.ts
- [x] **T038** [P] [US1] `KM_HINT_TOUCH_KEY_ID_CASE` (**hint**) for the latent case asymmetry: `kmcmplib` interns case-insensitively so it works here, while Developer's case-sensitive validator warns · packages/keyboard-lint/src/checks/check-18-6-touch-coverage.ts

**⟶ Wait for T035, then (same file):**

- [x] **T039** [US5] `KM_WARN_TOUCH_MISSING_REQUIRED_KEY` (warning; 0x093 analogue) against the upstream set `CRequiredKeys = [K_LOPT, K_BKSP, K_ENTER]`, required of **every layer of every platform** — the set does not vary by platform or layer in that code path · packages/keyboard-lint/src/checks/check-18-4-control-key-drift.ts

**⟶ Wait for all six checks, then:**

- [x] **T040** [US1] [US5] Registry wiring — the three manual edits per check (import, invocation, re-export) · packages/keyboard-lint/src/lintContext.ts
- [x] **T041** [P] [US1] [US5] **One test per exemption, individually**, over inline fixtures (this package reads no disk — see T042). The exemptions *are* the design, so a single omnibus test is not sufficient coverage · packages/keyboard-lint/src/checks/check-18-6-touch-coverage.test.ts, check-18-4-control-key-drift.test.ts, check-18-5-layer-switch-return.test.ts
- [x] **T042** [P] [US1] SC-002 canaries, skip-if-absent: exactly **one** orphan finding on `sil_cameroon_azerty`, **zero** dead-`T_`-key findings on `sil_cameroon_qwerty`, and the QWERTY distinct-`T_`-id count pinned so drift is caught. **Hosted in studio, not keyboard-lint**: that package has zero `node:fs` usage anywhere and studio is the only package that depends on it, so the established `KEYBOARDS_ROOT` + `fs.existsSync` skip-if-absent pattern (see `applyTouchAssignmentsToRawJson.test.ts`) has a home there and not in the lint package · packages/studio/src/lib/touchDiagnostics.corpus.test.ts

**⟶ Independently of the six checks — 0x05A, which is deliberately *not* a Layer C check:**

- [x] **T043** [US5] Route `ERROR_TouchLayoutInvalidIdentifier` (0x05A) as a **validity** concern: an imported keyboard's existing ids get a new import-fidelity function coded `KM_ERROR_*` per that file's own namespace rule, spread into `runImportFidelityParseChecks`. Author-typed ids are handled by edit-time rejection in Phase 9 with no finding at all. Nothing is added to Layer C (FR-040) · packages/engine/src/validator/layer-a-prime.ts, packages/engine/src/validator/index-import-fidelity.ts

**Checkpoint — the diagnostics are calibrated against layouts we did not create.** Phase 5 may now begin.

---

## Phase 5: Editing foundation — blocks US2, US3, and US4

The overlay, both appliers, both projection passes, preview identity, the store and its persistence, layer families, the grid, and the mode selector. None of the three editing stories is testable without this; all three share it.

### 5a — The overlay, the appliers, and their twin test

**Wave 1 — one operation type, one resolver:**

- [x] **T044** Define the operation union and the shared machinery: `KeyEditOperation` (`seq`, `address`, optional `scope`, and the seven kinds `set`/`rename`/`add`/`remove`/`suppress`/`setSubKey`/`removeSubKey`), `EditableKeyFields` (`id`, `text`, `output?`, `sp` over the **full** legal set `{0,1,2,8,9,10}`, `nextlayer?`), the shared **resolver** (address parts → the addressed key against *current* state), and the shared **field-semantics** function (the one place a changed id clears a stale `output`). `width`/`pad` are deliberately absent — geometry is read-only this increment, and `redistribute` writes widths as a consequence of a remove. Row and layer operations are **not** admitted · packages/engine/src/pattern-apply/keyEditOps.ts

**⟶ Wait for T044, then — the two thin appliers (different files):**

- [x] **T045** [P] IR applier (Case A): reuse the existing structural-sharing skeleton and node-id minting · packages/engine/src/pattern-apply/applyKeyEditsToLayout.ts
- [x] **T046** [P] Raw-JSON applier (Case B): reuse the existing platform→layer→key index build and placeholder-promotion behaviour. Required by spec 035's R9 — the import-adapt path must never round-trip through the IR · packages/engine/src/pattern-apply/applyKeyEditsToRawJson.ts

**⟶ Wait for T045 + T046, then — the defence against the doubling is a test, not discipline:**

- [x] **T047** Applier-twin equivalence: run the *same* operation list (covering every `kind`) through both appliers, parse the raw-JSON result with the canonical parser, and compare structurally against the IR result — **modulo node ids** (`NodeIdMinter` restarts its per-kind counter on every call, so ids are deterministic per invocation but not comparable across appliers) and the fields Case A is documented to drop. Reuse the T013 fixture; do not add a second one · packages/engine/src/pattern-apply/applyKeyEdits.twin.test.ts

**⟶ Wait for T047, then — replay:**

- [x] **T048** Overlay replay: `KeyEditOverlay = { ops }` applied in commit order, each address resolving against the layout state the prior operations produced. Replay is total and pure, holds no reference to the layout it was authored against, and returns `{ layout, orphaned, warnings }` — a resolution failure is a **first-class outcome**, not an exception (FR-033a) · packages/engine/src/pattern-apply/keyEditOps.ts (`KeyEditOverlay`) + applyKeyEditsToLayout.ts (`replayKeyEditOverlay` — hosting it beside the type made `keyEditOps` ⇄ `applyKeyEditsToLayout` circular, which `depcruise`'s `no-circular` rule blocks; replay is a thin wrapper over Case A's loop, so it belongs with the loop)
- [x] **T049** Replay tests: ordering is semantic (rename-then-edit resolves; the same ops in reverse order do **not** silently succeed against the wrong key); replay is pure and idempotent for a fixed op list · packages/engine/src/pattern-apply/keyEditOps.test.ts

### 5b — Projection: two passes, one chain

**⟶ Wait for 5a, then:**

- [x] **T050** [P] The layout pass as **new step 1.7**, immediately after step 1.6 (`applyTouchKeycapRemovalsToVfs`) — step 1.5 is the text-matched carve pass, a different analog. Follow 1.6's shape exactly: gate on a non-empty overlay, wrap in `try`/`catch` pushing a `[project-working-copy] … skipped: <msg>` warning, and `vfs.set` only when the serialized string actually changed (FR-033) · packages/engine/src/pattern-apply/applyKeyEditsToVfs.ts, packages/studio/src/lib/projectWorkingCopyVfs.ts
- [x] **T051** [P] The **rule pass — required, not inherited**. R10.2: the working IR (`store.ir`) is never emitted into the artifact, so `applyMarkGuards`' path cannot be leaned on. Parse the VFS `.kmn` → apply `ensure`/`remove`/`rename` → re-emit, ordered so a rename's layout half and rule half land in the same projection. Without this, US2's rule-bearing assignment is a silent no-op in **both** preview and zip · packages/studio/src/lib/projectWorkingCopyVfs.ts

**⟶ Wait for T050 + T051, then:**

- [x] **T052** Projection tests: step 1.7 runs after 1.6 and before 2; an empty overlay leaves the file byte-identical; a pass failure pushes a warning and does **not** abort the chain; **Case B** — one key edited leaves every untouched key and every platform-level field (including fields the IR does not model, e.g. `font`) structurally identical to the shipped file (SC-006) · packages/studio/src/lib/projectWorkingCopyVfs.test.ts

**⟶ Wait for T052, then — preview/artifact identity (FR-038), which is where the second writer lives today:**

- [x] **T053** Give `useWorkingCopyTransform` an **optional live-layout override** (the in-progress `touchLayoutJson` plus the overlay), folded **into the primitive memo key** — the dep array is primitive-stable by design, and an overlay outside that key will not refresh the preview. Both existing gates stay: `null` when `baseIr` is null, and `null` when `previewedBaseId` disagrees with the store's base id · packages/studio/src/hooks/useWorkingCopyTransform.ts

**⟶ Wait for T053, then:**

- [x] **T054** Drop TouchGallery's local `vfsTransform` — it injects only `touchLayoutJson` and never calls `projectWorkingCopyVfs`, so the touch preview shows no carve, identity, or keycap-label projection — and consume the hook with the override instead · packages/studio/src/editors/assignLoop/TouchGallery.tsx
- [x] **T055** Preview-identity tests, one assertion per surface (R10.2 is exactly the class of gap where one passes and the other does not): a synthesized rule is present in the emitted `.kmn` **and** in the preview's VFS; the override refreshes the preview on an overlay change (guarding the primitive-memo-key miss); both gates still return `null` when they should · packages/studio/src/hooks/useWorkingCopyTransform.test.ts

### 5c — Store, undo, persistence, provenance, re-derivation

**⟶ Wait for 5b, then:**

- [x] **T056** Store state and actions: `keyEditOverlay` plus the touch step's mode-selector state (beside the `galleryIntrosSeen` per-step UI precedent), and `commitKeyEdit` / `undoKeyEdit` / `setTouchEditorMode` verb-first. Each new **action** name must join `WorkingCopyData`'s `Omit` list, and any new `Set`/`Map` must be re-created in **all four** reset paths — `INITIAL_STATE`, `reset`, `instantiateFromBase`, `instantiateFromExisting` · packages/studio/src/stores/workingCopyStore.ts

**⟶ Wait for T056, then:**

- [x] **T057** [P] One new `UndoEntry` kind — one entry per committed edit — with its branch in `undoDelete`, its restore-side filter, and clearing in `keepAll` (FR-032) · packages/studio/src/stores/workingCopyStore.ts
- [x] **T058** [P] Persistence: both fields join `WorkingCopySnapshot` (**not** `PersistedFields`, which does not exist) as **optional with a tolerant fallback read** in `prepareWorkingCopySnapshot`. **`DRAFT_VERSION` stays `1`** — VR-1 discards a version-mismatched draft rather than migrating it, so a bump would throw away every author's in-progress keyboard (R10.3, superseding FR-033c's parenthetical). Test that a snapshot written before these fields existed loads without clobbering store defaults, and assert `DRAFT_VERSION === 1` · packages/studio/src/lib/persistWorkingCopy.ts
- [x] **T059** [P] A **new address-matched** promotion path beside `promoteKeyToHandSet` — never replacing it. The existing helper's id-matched, all-platforms/all-layers semantics are intentional for the by-character flow; by-key edits need address matching so a rename cannot miss and same-id keys elsewhere are not promoted incidentally (FR-031) · packages/studio/src/editors/assignLoop/touchBehavior.ts

**⟶ Wait for T056–T059, then:**

- [x] **T060** Re-derivation resilience (FR-033b): when the Case A seed is re-derived, replay classifies each operation resolvable or **orphaned**, and orphaned operations are **reported, never silently dropped** — naming the affected keys and any characters whose placement is lost, offering to discard the orphaned edits or re-place those characters through the FR-062 worklist. `touchKeyAddress`'s silent miss is correct for the deletion overlay and is data loss here. Test: an overlay authored against seed A, replayed against a seed B that removed the addressed key, reports the op as orphaned and names the lost character · packages/studio/src/lib/keyEditOrphanReport.ts (the report + `discardOrphanedKeyEdits`), packages/engine/src/pattern-apply/keyEditOps.ts (`declaredOperationOutput`), packages/studio/src/lib/persistWorkingCopy.ts (doc only — a snapshot saves and restores `ir`/`baseIr`/`touchLayoutJson`/`keyEditOverlay` together, so restore never itself produces the seed-A/seed-B mismatch; that is a live in-session re-derivation). The **character** half needed a studio-side correlation the engine cannot do: four of the seven kinds name a key by address only, so an orphan's lost character is recovered by re-resolving its address against the *prior* seed replayed with only the ops committed before it. `report.lostCharacters` is the FR-062 worklist seam; T106 consumes it

### 5d — Layer families

**⟶ Independent of 5a–5c (needs only T002); may run in parallel with them:**

- [x] **T061** Layer-family machinery: decompose a layer id into `{ plane, tokens }` where an absent plane means the base alphabetic plane, returning a **canonical** token set documented as canonical-not-round-trip (`comboToTouchLayerId` is not injective — both `ALT` and `LALT` render as `alt`); group families as the ids sharing a plane; lift `TOUCH_LAYER_PRECEDENCE_ORDER` rather than re-deriving it (FR-063) · packages/engine/src/pattern-apply/layerFamilies.ts
- [x] **T062** Layer-family tests, including the **freeform fallback as a silence guarantee**: decomposition over the standard combo vocabulary (`default`, `shift`, `caps`, `rightalt`, `rightalt-shift`, `rightalt-caps`, `symbol`, `symbol-caps`, a chiral-ctrl combo); an unparseable layer id becomes its own plane and generates no parallelism finding, with **both** corpora pinned by their own regression lock — every one of `gff_amharic`'s 53 Ethiopic-named layers **and** every one of `fv_southern_carrier`'s 35 syllable-mnemonic layer names falls to freeform, none misparsed into a spurious family — plus an **all-freeform layout yielding zero parallelism findings**, so a later grammar extension cannot quietly start emitting noise there without a deliberate decision (FR-067, [layer-families.md](contracts/layer-families.md) §6) · packages/engine/src/pattern-apply/layerFamilies.test.ts

### 5e — The key grid (net-new; no ARIA grid exists in this repo)

`role="grid"`, `role="gridcell"`, `aria-colindex`, `aria-rowindex`, and `aria-activedescendant` have **zero occurrences** in `packages/` (R10.4). The two idioms to copy are both in [CharScrollStrip.tsx](../../packages/studio/src/editors/assignLoop/parts/CharScrollStrip.tsx): the roving-tabindex fallback (`isTabbable = isSelected || (!hasSelectedVisible && index === 0)`) and the **selection-centred** `useMemo` window (deliberately not stateful, so unrelated re-renders do not reset scroll).

**⟶ Wait for 5a (the view model reads the overlay) and Phase 2's join, then:**

- [x] **T063** The grid view model as a **pure projection** from layout + overlay + rule index, holding no state of its own: rows with `slackPct`, and per key `address`, `id`, `keycap`, `sp`, `nextlayer`, `padPct`/`widthPct` from the 100-unit model (`width ?? 100`, `pad ?? 15`), `producedChars` via the join, longpress/multitap/flick annotation counts, provenance, and findings · packages/studio/src/editors/assignLoop/keyGrid/keyGridViewModel.ts

**⟶ Wait for T063, then:**

- [x] **T064** `KeyGrid` + `KeyGridCell` from the APG grid pattern directly: `role="grid"` / `row` / `gridcell`, proportional geometry rendered from `padPct`/`widthPct`, and a **single Tab stop** via roving tabindex with the `hasSelectedVisible` fallback so the grid is never stranded outside the Tab order. Several hundred keys must not produce several hundred Tab stops (FR-020, FR-020a, FR-022) · packages/studio/src/editors/assignLoop/keyGrid/KeyGrid.tsx, KeyGridCell.tsx

**⟶ Wait for T064, then:**

- [x] **T065** [P] `useGridNav`: ←/→ within the row, ↑/↓ **geometry-based** (landing on the key whose horizontal span contains the current key's centre — index-clamping lands the caret somewhere the author is not looking on rows of unequal key counts and widths), Home/End for row ends, Ctrl+Home/Ctrl+End for the layer, **no wrap** between layers or platforms, and a layer switch that **preserves the selected row/column** so comparing one key across `default`/`shift`/`caps` is a single action (FR-020b, FR-020c, FR-020d) · packages/studio/src/editors/assignLoop/keyGrid/useGridNav.ts
- [x] **T066** [P] RTL: render mirrored per the layout's script direction, with **logical** Home/End and arrow semantics (row start/end in reading order), direction resolved **per layer** — a Latin-numeral layer inside an Arabic keyboard is legitimate (FR-020i) · packages/studio/src/editors/assignLoop/keyGrid/KeyGrid.tsx
- [x] **T067** [P] Windowing: mount only the active layer's keys, window the layer rail, and defer offscreen rows — corpus reality is up to 2,256 keys across 53 layers. FR-020a bounds Tab stops; this bounds DOM nodes (FR-020j) · packages/studio/src/editors/assignLoop/keyGrid/KeyGrid.tsx
- [x] **T068** [P] Focus restoration: after any remove/suppress/row action focus lands on the **nearest surviving cell** — next key in row, else previous key, else the row, else the grid container — and is **never** lost to `document.body` or an unmounted node (FR-020k) · packages/studio/src/editors/assignLoop/keyGrid/useGridNav.ts
- [x] **T069** [P] Add **both** `[role="grid"]` and `[role="tablist"]` to `SKIP_SELECTOR`. That hook is attached at the pane level and consumes ArrowLeft/ArrowRight from anywhere in its subtree unless the target matches, so without both entries the pane handler silently eats the arrows of the grid *and* the mode selector (FR-020f, R10.7) · packages/studio/src/editors/assignLoop/useCharCycleKeys.ts

**⟶ Wait for T065, then:**

- [x] **T070** [P] `KeyInspector`: selection is **separate from editing** — arrows and clicks change selection and update the inspector's display while focus stays in the grid; **Enter** or **F2** moves focus into the inspector; **Escape** returns it to the cell. The derived "Sends:" display must let `key.layer` **supersede** the containing layer — the field exists for exactly the keys where the two differ (FR-020b, FR-030) · packages/studio/src/editors/assignLoop/keyGrid/KeyInspector.tsx
- [x] **T071** [P] `FindPanel` — a find-by-value path to selection, not spatial navigation alone: jump by id, by the character a key produces (reusing `enumerateTouchMethodsForChar`), or by filtering to keys with **no assigned output** (which is the US2 worklist). Result ordering respects direction (FR-020e) · packages/studio/src/editors/assignLoop/keyGrid/FindPanel.tsx

### 5f — The mode selector: a view toggle, not a fork

**⟶ Wait for T064 + T056, then:**

- [x] **T072** Mode selector as an APG **tabs** pattern — two tabs, one surface — owned by the touch step's existing gallery component in `headerExtras` (a mode of the existing step, **not** a new step and not a post-lock step). Present **two visually distinct keyboard surfaces with two different verbs**: an editable schematic grid labelled for editing, and the live OSK labelled for testing. They must not look alike or read as two ways to do the same thing (FR-035, FR-020h) · packages/studio/src/editors/assignLoop/TouchGallery.tsx

**⟶ Wait for T072, then:**

- [x] **T073** [P] On entering the touch step, propose the by-key mode and route into it **only** when the effective layout has keys with no reachable output **and** the inventory has unplaced characters — so an imported keyboard is fixed up before the character walk. Otherwise the character walk remains the default (FR-036) · packages/studio/src/editors/assignLoop/TouchGallery.tsx
- [x] **T074** [P] Context carries **both** ways (FR-036c): character → by-key selects and reveals the producing key(s) via `enumerateTouchMethodsForChar`, or the candidate keys when unplaced; key → by-character lands on a character that key produces. On several producing keys, select the first in layout order (active platform, family-order layers), badge the rest, and offer next/previous cycling — the inspector shows one key at a time · packages/studio/src/editors/assignLoop/keyGrid/useModeContextCarry.ts
- [x] **T075** [P] **One** shared set of progress figures, derived: "characters still unplaced" and "keys with no letter" are two projections of one truth and must not be independently maintained counters that can disagree (FR-036d) · packages/studio/src/editors/assignLoop/TouchGallery.tsx
- [x] **T076** [P] Undo affordance states what it is about to undo, since after a mode switch the next undo may target the other view's work — a silent cross-mode undo reads as a defect. One chronological stack across both modes (FR-036g) · packages/studio/src/editors/assignLoop/TouchGallery.tsx
- [x] **T077** [P] Render whatever platforms exist — platform tabs only when more than one — and state the layout's provenance honestly without requiring the author to know whether it is Case A or Case B (FR-034) · packages/studio/src/editors/assignLoop/keyGrid/KeyGrid.tsx

**⟶ Wait for T073–T077, then:**

- [x] **T078** Mode-toggle store suite (SC-011): N toggles in any order lose no state in either direction — **nothing is cleared**, neither `touchDraft` nor the overlay, as a side effect of a mode change (that tidy-up is precisely what someone adds later) — and the shared progress figures never disagree between views (FR-036a, FR-036b) · packages/studio/src/stores/workingCopyStore.test.ts

**Checkpoint — the editing surface exists, projects truthfully, persists, and toggles losslessly.** US2, US3, and US4 may now proceed; they are independent of each other from here.

---

## Phase 6 (US2, P1): Assign a letter to an existing `T_*` key

**Goal**: The author selects a key that types nothing, picks a character, and the studio proposes the keycap, the id, and — when a rule is genuinely needed — the `.kmn` rule itself, shown literally before it is written.

**Independent Test**: On an import-adapt walk, select a `T_*` key with no rule, assign `ɛ` by typing `U+025B`, and confirm the live OSK preview types `ɛ` and the emitted layout carries the change.

### Implementation

**Wave 1 — minting and synthesis (different files):**

- [x] **T079** [P] [US2] Id-minting policy: `U_<HEX>` with **no rule** for a single-codepoint output; `T_*` plus a synthesized rule for multi-codepoint output, case triplication, or a **combining mark** (where a `U_` id would self-output before a guard could apply). `T_new_*` is **never** minted. A multi-codepoint grapheme cluster (e.g. an Indic conjunct treated as one inventory letter) is handled **mechanically identically** to any other multi-codepoint output — not as a special case (FR-025) · packages/engine/src/pattern-apply/keyIdMinting.ts
- [x] **T080** [P] [US2] Rule synthesis — `ensure` / `remove` / `rename`: **group choice** is the entry group (the first `using keys` writable group) resolved through the T003 helper, inserting before the terminal `match`/`nomatch` rules; **ordering is correctness** — emit guard-then-producing as a **contiguous pair** in that order, and when a guard already exists for this key+combo insert the producing rule **immediately after it**, never at the group tail, since a producing rule ahead of its guard silently defeats the guard; **idempotence is semantic, not nodeId-based** — recognize our own output by the `gen-touch-*` nodeId prefix but dedupe by matching (normalized id, canonical combo, role) against **any** existing rule via the join, so importing Cameroon and touching one key does not duplicate its hand-written `T_` rules, and a hand-written match is **never rewritten**; naming follows the mark-guards precedent exactly (nodeIds `gen-touch-*`, store/group names `generated_touch_*` — do not mint a third scheme); output passes through the same NFC run-merge `collectFromElements` applies. Mark stacking across successive keystrokes is explicitly out of scope · packages/engine/src/pattern-apply/touchRuleSynthesis.ts

**⟶ Wait for T080, then (same file):**

- [x] **T081** [P] [US2] Guard synthesis for a single combining mark: propose **reusing** an existing guard-shaped store (non-system, all char items, contains space and digits, contains no letters — Cameroon's `store(diablock)` matches) before minting one under `generated_touch_*`. A freshly minted guard store **must** be populated from the keyboard's own repertoire — declared exemplars or the discovered inventory — **never** a hardcoded ASCII literal: `diablock` is Cameroon's own convention, and a keyboard with non-Latin punctuation or digits needs its own set derived the same way or the guard protects nothing. Case variants: propose the CAPS/NCAPS triple **only** when the keyboard already handles CAPS, detected with the existing predicate (FR-026) · packages/engine/src/pattern-apply/touchRuleSynthesis.ts
- [x] **T082** [P] [US2] The FR-027a opaque carve-out: when `opaqueFragmentCount > 0`, synthesis **downgrades to warn-and-confirm before writing anything** — the gate applies **before** the group-choice step, not after. The join cannot prove no equivalent rule already hides inside a `RawKmnFragment`, and a silent synthesis risks a permanently-shadowed duplicate · packages/engine/src/pattern-apply/touchRuleSynthesis.ts
- [x] **T083** [P] [US2] Delete **must not cascade silently**: a `T_` id legitimately appears on several layers and platforms, so on key deletion recompute presence and only when the id is carried by **no** key anywhere **propose** removing its rules (producing and guard, plus the guard store if now unreferenced) — defaulting to remove for rules we generated and to **keep-and-let-the-orphan-check-report-it** for hand-written or imported ones · packages/engine/src/pattern-apply/touchRuleSynthesis.ts

**⟶ Wait for T079–T083, then:**

- [x] **T084** [US2] Rule-synthesis tests: re-running adds nothing; semantic dedupe against a hand-written Cameroon rule; guard-store reuse versus mint; guard-before-producing adjacency; insertion before an existing terminal rule; the CAPS triple gated on existing CAPS handling; rename and remove synchronization including the node-id map; and an **emit → parse → re-emit round-trip on the Cameroon fixture with opaque fragments present** — the emitter uses a position-faithful path keyed on source lines and synthesized rules carry none, so this is a risk to test rather than assume (FR-027) · packages/engine/src/pattern-apply/touchRuleSynthesis.test.ts

**⟶ Wait for T084, then — the UI:**

- [x] **T085** [US2] `AssignPanel`: inventory characters offered **first**, plus a single field accepting either a character or `U+xxxx`, plus the character map. The proposal shows the default (`U_025B`, no rule required) **and** the alternative — keep the `T_*` id and add `+ [T_X] > U+025B` — with the **literal rule text** and the honest reason to prefer it (the same id appears on N other layers, and one rule serves all of them). Propose-then-confirm: the author sees the store and the rules before they are written (FR-024, key-id-policy §2.1) · packages/studio/src/editors/assignLoop/keyGrid/AssignPanel.tsx

**⟶ Wait for T085, then:**

- [x] **T086** [P] [US2] Combining-mark proposal path: propose a `T_*` id **and** its guard rule, rendered as the contiguous pair the author will get (US2 AS4) · packages/studio/src/editors/assignLoop/keyGrid/AssignPanel.tsx
- [x] **T087** [P] [US2] Commit an assignment: append the overlay op, promote provenance through the T059 address-matched path, and push the undo entry — one entry per committed edit · packages/studio/src/editors/assignLoop/keyGrid/AssignPanel.tsx
- [x] **T088** [P] [US2] Warn **at the moment of the edit** when a key-level edit invalidates a by-character assignment, naming the affected character — e.g. suppressing a key that carries a longpress assigned for `ɛ`. Deferring this to the Continue gate is too late to be actionable (FR-036f) · packages/studio/src/editors/assignLoop/keyGrid/useKeyEditGuards.ts

**⟶ Wait for T086–T088, then:**

- [x] **T089** [US2] SC-004 e2e: a keyboard-only assign — Tab, arrows, Enter, type `U+025B`, Enter — completes in at most **12 discrete keyboard actions** beyond navigation to the touch stage, with **no pointer event and no modal detour**, and the live preview types the character. "Under two minutes" is narrative framing, not the assertion · packages/studio/e2e/touch-key-assign.spec.ts

**Checkpoint — US2 is independently functional and testable.** An imported keyboard's ruleless `T_*` keys can be given letters, and the preview proves it.

---

## Phase 7 (US3, P2): Redefine a key id

**Goal**: The author renames a key id, the studio validates it live, shows what else the rename touches, and fixes up every reference it owns.

**Independent Test**: Rename a `T_*` key that appears on three layers and is referenced by two rules; confirm the layout, the rules, and the node-id map are all updated and nothing is orphaned.

### Implementation

- [x] **T090** [US3] `RenameDialog`: the field is **pre-filled with the proposed id, never blank**, and validation runs on every keystroke — syntax, in-layer uniqueness, case collision (an id differing from an existing one **only** by case), and the reserved prefixes. Rename is disabled with a **specific reason**, not a generic invalid state (FR-028) · packages/studio/src/editors/assignLoop/keyGrid/RenameDialog.tsx

**⟶ Wait for T090, then:**

- [x] **T091** [US3] Complete reference fix-up in one operation: the layout key id, **every** binding for the old id (guard **and** producing alike), the `touchLayout.nodeIds` entries (which embed the key id), and any matching address in the studio's deletion overlay. The overlay remap happens at **edit-commit time** through the store's existing delete/restore actions — keeping undo entries consistent and ensuring step ordering can never observe a stale address (FR-028, FR-033) · packages/engine/src/pattern-apply/touchRuleSynthesis.ts, packages/studio/src/stores/workingCopyStore.ts

**⟶ Wait for T091, then:**

- [x] **T092** [P] [US3] When a rename would leave rules referencing an id no key carries, **propose** rather than silently perform the cleanup — defaulting to remove for rules the studio generated and to keep-and-report for hand-written ones · packages/studio/src/editors/assignLoop/keyGrid/RenameDialog.tsx
- [x] **T093** [P] [US3] SC-005: rename a `T_*` key on three layers referenced by two rules; nothing is orphaned, the emitted keyboard compiles clean, and the character remains reachable · packages/studio/src/editors/assignLoop/keyGrid/RenameDialog.test.tsx

**Checkpoint — US3 is independently functional and testable.**

---

## Phase 8 (US4, P2): Add and remove keys

**Goal**: The author adds a key to a row or removes one, by keyboard or pointer, with the geometry consequences made visible and the collateral named before it commits.

**Independent Test**: Add a key to a row, assign it a character, remove a different key, and confirm the emitted layout reflects both and untouched keys are structurally identical.

### Implementation

**Wave 1 — the three outcomes and the compound suppress (different files):**

- [x] **T094** [P] [US4] Add a key after the selected one, via Insert **and** via the key's command menu, proposing a **real** id through the T079 minting policy — **never** `T_new_<n>` (FR-029, US4 AS1) · packages/studio/src/editors/assignLoop/keyGrid/useKeyCommands.ts
- [x] **T095** [P] [US4] **Suppress** as one compound operation, not two: it sets a non-interactive `sp` (`9` blank when a keycap-shaped hole is wanted, `10` spacer otherwise) **and** neutralizes the id to a ruleless sentinel. `sp` governs rendering and interactivity; the id governs output; `sp` alone does not stop rule matching. Making it one operation is what makes the halves impossible to desynchronize (FR-029b) · packages/engine/src/pattern-apply/keyEditOps.ts
- [x] **T096** [P] [US4] Full `sp` control across `{0, 1, 2, 8, 9, 10}` — character, frame, active frame, deadkey-styled, blank, spacer. The studio **proposes** the appropriate value per context but **must not remove the control**: `sp` is an authoring mechanism, and §3c means propose a good default, not remove the option (FR-029a) · packages/studio/src/editors/assignLoop/keyGrid/KeyInspector.tsx

**⟶ Wait for Wave 1, then — the removal choice:**

- [x] **T097** [US4] "Remove this key" resolves to a choice between **three** outcomes, each stating its trade-off, because predictability across layers and touchable area are **opposed goals that cannot both be maximized**: suppress in place (positions preserved, area unchanged), remove and reflow (the row closes up and its stretched final key absorbs the slack unevenly), remove and redistribute (the freed width is shared, converting removed keys into genuinely larger touch targets). The studio **must not** hard-code one as globally correct (FR-029f) · packages/studio/src/editors/assignLoop/keyGrid/RemoveKeyDialog.tsx

**⟶ Wait for T097, then:**

- [x] **T098** [P] [US4] **Propose** the outcome from the layer's kind, always overridable: a casing-parallel or modifier twin → **suppress** (muscle memory across twins dominates); a standalone function layer with no positional correspondence → **remove and redistribute** (simplicity and target size dominate); and a row over the platform crowding limit (`phone: 10`, `tablet: 13`) → **remove and redistribute regardless of layer kind**, saying that the row is over the limit (FR-029g) · packages/studio/src/editors/assignLoop/keyGrid/RemoveKeyDialog.tsx
- [x] **T099** [P] [US4] Deleting the **last** key in a row prompts, defaulting to **keeping** the row with a full-width spacer — Developer silently deletes the row, which breaks the positional alignment sibling layers depend on (FR-029, US4 AS2) · packages/studio/src/editors/assignLoop/keyGrid/RemoveKeyDialog.tsx
- [x] **T100** [P] [US4] Render a row's remaining **slack visibly** (not printed as numbers) and offer "Fill row" / "Even out row" as explicit actions — widths are **never** silently redistributed (FR-022, FR-039) · packages/studio/src/editors/assignLoop/keyGrid/KeyGrid.tsx

**⟶ Wait for T095, then — the two half-done states and the frame-key rule:**

- [x] **T101** [P] [US4] Report a **half-done suppression** both ways: a non-interactive key that kept a rule-bearing id is still live, and a neutralized id left on a producing key type is an invisible dead key. A ruleless sentinel id used for suppression (e.g. `T_BLANK`) must **not** be reported as a dead key — that idiom is why the §5.1 exemptions exist (FR-029c, FR-029e) · packages/engine/src/pattern-apply/touchKeyDiagnostics.ts
- [x] **T102** [P] [US4] A layer-switching key is marked **active (`sp:2`) on the layer it switches to** and `sp:1` elsewhere: propose it automatically from the key's `nextlayer` and its containing layer, keep the value editable, and report a diagnostic when the two disagree (FR-029d, US4 AS9) · packages/engine/src/pattern-apply/touchKeyDiagnostics.ts
- [x] **T103** [P] [US4] Surface the **mixed-approach inconsistency**: a row that mixes suppressed and removed keys achieves neither predictability nor extra touch area, so the studio surfaces it rather than letting it accumulate silently (FR-029h, US4 AS8) · packages/engine/src/pattern-apply/touchKeyDiagnostics.ts

**⟶ Wait for T097, then — collateral, which must warn *before* the edit commits:**

- [x] **T104** [US4] Enumerate a key's **linked outputs** and warn before commit: its own output plus every `sk`, flick, and multitap sub-key it hosts, each named by the character it produces. Cameroon is the worked case — suppressing `T_0021` silently discards the `U_00A1` (`¡`) longpress beneath it, which the author never sees on the keycap (FR-060) · packages/engine/src/pattern-apply/touchKeyCollateral.ts

**⟶ Wait for T104, then:**

- [x] **T105** [P] [US4] Distinguish characters that become **unreachable** from those **still available elsewhere**, naming the surviving location for the latter. Deleting the apostrophe key when punctuation has moved to a symbol layer discards nothing in practice, and a warning that cannot tell those cases apart will be dismissed unread (FR-061) · packages/engine/src/pattern-apply/touchKeyCollateral.ts
- [x] **T106** [P] [US4] Characters that lose their **last** mechanism return to the unplaced worklist, are counted in the shared progress figures, and are offered for re-placement — not merely reported as lost (FR-062) · packages/studio/src/editors/assignLoop/keyGrid/useKeyEditGuards.ts

**⟶ Wait for T061 + T097, then — family coherence:**

- [x] **T107** [US4] Complain loudly when an edit breaks **positional parallelism within a family** — adding, removing, moving, or resizing a key on `shift` without the corresponding change on `default`, `caps`, `rightalt`, and the rest. This is the invariant an author cannot check by eye across eight layers (FR-064) · packages/engine/src/pattern-apply/layerFamilies.ts

**⟶ Wait for T107, then:**

- [x] **T108** [P] [US4] Offer **applying the edit across the family** as the proposed resolution, showing every affected layer **and its per-layer content first** — the same key may carry a different character on `shift` than on `default`, so this is not a blind fan-out (FR-065) · packages/studio/src/editors/assignLoop/keyGrid/FamilyApplyDialog.tsx
- [x] **T109** [P] [US4] Scope the complaints correctly: **distinct planes are freeform** — symbol, emoji, numeric, and alt-script planes are independent layouts, never variants of one, and must not be nagged; parallelism within a plane's own modifier family (`symbol` vs `symbol-caps`) may be checked but defaults to a **softer severity** than the alphabetic family's (FR-066) · packages/engine/src/pattern-apply/layerFamilies.ts
- [x] **T110** [P] [US4] The **property split** for frame and layer-switch keys, keyed on the key being a frame/layer-switch key rather than on a row index: `sp`, `nextlayer`, `id`, and keycap `text` **may** legitimately differ across the family and must not be reported (`sp` must alternate `1`/`2` by design; `nextlayer` targets necessarily differ; Cameroon carries `T_LOWER` on `symbol` and `T_UPPER` on `symbol-caps` doing the equivalent job) — while **position and width remain parallel and must still be checked** (FR-068) · packages/engine/src/pattern-apply/layerFamilies.ts

**⟶ Wait for T094–T110, then:**

- [x] **T111** [P] [US4] The pointer paths as **first-class design targets, not fallbacks**: click selects, hover reveals per-key add/`⋯` affordances, right-click opens the command menu, double-click follows a key's "Goes to" layer. Every command also has its keyboard route (FR-020b). **Drag-and-drop specifically** (reorder, resize) stays a pointer *enhancement* over commands that exist independently, since drag has no good keyboard analogue (FR-021) · packages/studio/src/editors/assignLoop/keyGrid/KeyGridCell.tsx
- [x] **T112** [P] [US4] SC-006 e2e on an import-adapt walk: add a key, assign it a character, remove a different key; the emitted layout reflects both, and within the touched `.keyman-touch-layout` every untouched key and platform-level field (including `font`) is **structurally** identical to the source. Untouched **files** are byte-identical. The raw-JSON pass re-serializes the whole file so formatting normalizes — a known limitation; byte-level patch-minimization is out of scope · packages/studio/e2e/touch-key-add-remove.spec.ts

**Checkpoint — US4 is independently functional and testable.**

---

## Phase 9 (US5, P2): Problems surface while I edit, not at compile

**Goal**: Every touch-layout warning Keyman Developer defers to compile time appears inline as the author edits, with a one-click fix — sharing **one underlying implementation** with the Phase 4 Layer C siblings so the two surfaces cannot drift.

**Independent Test**: Load a layout with a dead `T_` key, a dangling `nextlayer`, a duplicate id, and a layer missing `K_BKSP`; confirm four findings render with working fixes.

### Implementation

- [x] **T113** [US5] The `TouchKeyFinding` / `TouchKeyFix` shape: `code` (one of the eight), `severity`, `address`, **structured `fields`** for studio-composed localized copy — never English prose from the engine — and at least one fix descriptor (FR-044) · packages/engine/src/pattern-apply/touchKeyDiagnostics.ts

**⟶ Wait for T113, then:**

- [x] **T114** [US5] Compute all eight diagnostics as **synchronous pure joins** from the already-parsed working IR and layout (e.g. via `useMemo`) within the existing cycle's products, composed into the **single aggregated findings surface** — no second store field and no second timer, per that hook's own documented rule (FR-042, Decision D3). The eight: dead `T_` key, missing layer, unidentified key, missing required keys, special label on a normal key, duplicate id within a layer, orphan `T_` rule, modifier key not active on its own layer, and half-done suppression — reusing the Phase 4 check implementations rather than re-deriving them (FR-040) · packages/studio/src/hooks/useValidatorFindings.ts

**⟶ Wait for T114, then:**

- [x] **T115** [P] [US5] At least one **concrete fix action** per diagnostic — e.g. a dead `T_` key offers both "add the rule" and "convert to a `U_` id"; a dangling `nextlayer` offers to repoint or remove the switch (FR-041, US5 AS1/AS2) · packages/studio/src/editors/assignLoop/keyGrid/KeyInspector.tsx
- [x] **T116** [P] [US5] Studio-composed, **localized** copy for every finding and fix, following the existing method-label pattern (FR-044) · packages/studio/src/editors/assignLoop/keyGrid/findingCopy.ts
- [x] **T117** [P] [US5] Findings conveyed by **icon and text, never colour alone**, with a codepoint-derived accessible name for any glyph, announced through a single **grid-owned** `aria-live` region — the grid adds exactly one for its own announcements; the app is not being consolidated to one (US5 AS4, FR-050) · packages/studio/src/editors/assignLoop/keyGrid/KeyGrid.tsx

**⟶ Wait for T114, then — rejection, which is the counterpart to reporting:**

- [x] **T118** [US5] Edit-time **rejection**, not a finding, for mutations that would create an invalid state: a dead `T_` key must **not be creatable** and an in-layer id collision must **not be writable** — with the hard block downgrading to **warn-and-confirm** when `opaqueFragmentCount > 0`, because the join cannot prove a rule is not hiding inside opaque text. This is also where author-typed 0x05A ids are handled, with no finding emitted at all (FR-045, FR-040) · packages/engine/src/pattern-apply/keyEditOps.ts, packages/studio/src/editors/assignLoop/keyGrid/useKeyEditGuards.ts

**⟶ Wait for T118, then:**

- [x] **T119** [P] [US5] An edit that removes the last mechanism for an inventory character **warns inline** — an editor must permit invalid intermediate states — offering undo or restore, while the existing FR-008 gate still **blocks** at Continue (US5 AS3) · packages/studio/src/editors/assignLoop/keyGrid/useKeyEditGuards.ts
- [x] **T120** [P] [US5] **Either mode completes the step**: Continue is gated on coverage, never on which view is active, and at Continue **both** in-progress surfaces — the by-character draft and the key edit overlay — are committed or explicitly resolved, neither silently discarded (FR-036e) · packages/studio/src/editors/assignLoop/TouchGallery.tsx
- [x] **T121** [P] [US5] SC-007: every one of the eight diagnostics is reachable in the UI with a working fix, and none requires a compile to discover · packages/studio/src/editors/assignLoop/keyGrid/KeyInspector.test.tsx

**Checkpoint — US5 is independently functional and testable.**

---

## Phase 10: Polish, conformance, and the doc corrections

**Wave 1 — the conformance specs (different files):**

- [x] **T122** [P] SC-010: a fake-timer **behavioral** spec in the `useKeyboardArtifact.test.ts` mold asserting the new diagnostics resolve within the existing 300 ms cycle with **no additional timer callback** — no new debounce timer exists anywhere in the feature · packages/studio/src/hooks/useValidatorFindings.test.ts
- [x] **T123** [P] SC-009: an `expectNoSeriousAxeViolations` pass on the grid, with a dedicated run in **roving-tabindex state**, plus full operability with no pointer events · packages/studio/e2e/touch-key-grid-a11y.spec.ts
- [x] **T124** [P] SC-011's Playwright half: one toggle scenario confirming N mode switches in any order lose no state and the shared figures never disagree · packages/studio/e2e/touch-mode-toggle.spec.ts
- [x] **T125** [P] SC-008: assert it is **impossible** to reach the artifact with a `T_*` key that has no rule, no `nextlayer`, and a producing `sp` class · packages/studio/src/lib/projectWorkingCopyVfs.test.ts
- [x] **T126** [P] Declared-writes containment for the studio seam, verified **by test** rather than by reading the prose — the prefix rule is looser than it looks (research R9) · packages/studio/src/lib/projectWorkingCopyVfs.test.ts

**⟶ Wait for every phase's UI strings to exist, then:**

- [x] **T127** i18n: **extract** the new strings with `messages:extract` (never hand-add them) into the English catalog, with ids following `area ( "." segment )+` lowercase dot-separated per the convention. Node ≥ 22.19 is required or every `lingui` subcommand exits 0 having written nothing (FR-051). **Already run once mechanically at the Phase 5 checkpoint** so `pnpm lint`'s `i18n-catalog-lint` gate stayed green there; this task is the final re-run plus the id review over every phase's strings · packages/studio/src/locales/en/messages.json

**⟶ Independent of the specs above — the two doc corrections this feature owes:**

- [x] **T128** [P] Correct `docs/accessibility.md`'s **false conformance claim about our own code**: the "character-map grid" it names as audited against the APG grid pattern is a flex-wrap of plain buttons with no roles and every cell its own Tab stop. Either narrow the claim to the widgets genuinely audited (`SelectMenu`, `MultiSelect`, `RadioGroup`) or point the grid row at the new grid now that it exists (R10.4) · docs/accessibility.md
- [x] **T129** [P] Add phonebook rows for any keyboard this feature cites that is not already listed, reading each `<id>.kps` for name, BCP47 languages, and author — a stale phonebook is a defect, not an omission · docs/keyboard-index.md

**⟶ Wait for T122–T129, then:**

- [x] **T130** Full gate: `pnpm typecheck`, `pnpm -r test`, `pnpm lint` (which runs `depcruise`, so the contracts-cannot-import-engine boundary is machine-checked), and confirm the Success Criteria SC-001…SC-011 each have a named piece of evidence · (repo root)

### T130 gate result (2026-08-05)

| Gate | Result |
|---|---|
| `pnpm typecheck` | PASS — 7 projects, no errors |
| `pnpm -r test` | PASS — 9,299 tests across 560 files (contracts 646, engine 2,740 + 2 skipped, keyboard-lint 115, glottolog 42, llm 9, oauth-backend 160, studio 5,587) |
| `pnpm lint` | PASS — eslint (warnings only, none new), `depcruise`, `crew-lint`, `facet-lint`, `facet-index-lint`, `adaptation-catalog-lint`, `i18n-catalog-lint`, `content-i18n-freshness`, `content-i18n-lint`, `test-antipattern-lint` all green |

### SC-001…SC-011 evidence

| SC | Named evidence | State |
|---|---|---|
| SC-001 | `packages/engine/src/pattern-apply/touchCoverage.test.ts` (T032 canary) | Live, skip-if-corpus-absent |
| SC-002 | `packages/studio/src/lib/touchDiagnostics.corpus.test.ts` (T042) | Live, skip-if-corpus-absent |
| SC-003 | `docs/keyboard-facet-index.json` unchanged after regeneration (T031) | Verified — artifact byte-identical |
| SC-004 | `packages/studio/e2e/touch-key-assign.spec.ts` (T089) | Live |
| SC-005 | `packages/studio/src/editors/assignLoop/keyGrid/RenameDialog.test.tsx` (T093) | Live. **Disclosed limitation** (in that file's own header): "compiles clean" is asserted at the parse/emit level, because the real `compile()` oracle is not reachable from the studio vitest lane; the oracle itself is covered by engine's `compile.test.ts` |
| SC-006 | `packages/studio/src/lib/projectWorkingCopyVfs.test.ts` (T052 Case B fidelity) **plus** `packages/studio/e2e/touch-key-add-remove.spec.ts` (T112) | **Partial.** The unit half is live and passing. The e2e half is `test.skip`-ped with a named blocker: `TouchGallery.tsx` mounts neither `useKeyCommands` (add) nor `RemoveKeyDialog` (remove), so the walk has no UI route to drive. The spec is written in full against the real test ids and runs as-is once that wiring lands — the un-skip recipe is at the top of the file. This is the one SC not fully closed by this feature |
| SC-007 | `packages/studio/src/editors/assignLoop/keyGrid/KeyInspector.test.tsx` (T121) | Live — all **eleven** codes covered (FR-040's nine plus the two riders), exceeding the "eight" the task line names |
| SC-008 | `packages/studio/src/lib/projectWorkingCopyVfs.test.ts` (T125) | Live — includes a non-vacuity control proving the oracle detects the state when the guard is bypassed |
| SC-009 | `packages/studio/e2e/touch-key-grid-a11y.spec.ts` (T123) + the fast-lane structural guard in `KeyGrid.test.tsx` | Live and **passing**. It found a real critical `aria-required-children` violation (the row-action strip was a plain `<div>` child of `role="grid"`), fixed in `KeyGrid.tsx`. One documented exclusion: `["iframe", ".kmw-spacebar-caption"]`, WCAG 1.4.3, KeymanWeb's own stylesheet inside the OSK frame |
| SC-010 | `packages/studio/src/hooks/useValidatorFindings.test.ts` (T122) | Live — fake-timer behavioral, `vi.getTimerCount() === 0` |
| SC-011 | `packages/studio/src/stores/workingCopyStore.test.ts` (T078, store half) + `packages/studio/e2e/touch-mode-toggle.spec.ts` (T124, Playwright half) | Both live and passing |

**Not silently capped.** Two things this gate does not claim: SC-006's e2e half is skipped (above), and the E2E lane as a whole is excluded from the unit CI lanes by design (see `playwright.config.ts`) — the three touch specs exercised for this phase were run manually and pass (`touch-key-grid-a11y`, `touch-mode-toggle`, and previously `touch-key-assign`).

---

## Dependencies & Execution Order

**Phase order** — Setup → Foundational → **US1** → Layer C checks → Editing foundation → US2 / US3 / US4 → US5 → Polish. The two non-obvious edges are stated at the top of this file: the Layer C checks must precede the editor (calibration integrity), and the editing foundation depends on US1's join so it cannot be hoisted into Foundational.

| Phase | Waves, and what blocks what |
|---|---|
| **1 · Setup** | W1 (T001–T004, all independent) → W2 (T005–T007, three independent chains off W1). |
| **2 · Foundational** | W1 (T008, atomic — the drift guard forbids splitting) → W2 (T009–T011 independent) → W3 (T012) → W4 (T013 fixture) → W5 (T014 the join) → W6 (T015–T016 independent). The `sp` correction is a parallel chain: T017 → W (T018–T019 independent). |
| **3 · US1** | W1 (T020–T022 independent) → W2 (T023, same file as T022) → W3 (T024–T025 tests, independent) → W4 (T026–T029, the four callers, independent) → W5 (T030) → W6 (T031–T032 independent locks). |
| **4 · Layer C** | W1 (T033, the shared resolver — everything below needs it) → W2 (T034/T035/T036, one per file) → W3 (T037–T038 after T034; T039 after T035) → W4 (T040 wiring) → W5 (T041–T042 independent). T043 (0x05A / Layer A′) is a parallel chain off W1. |
| **5 · Editing foundation** | **5a** T044 → (T045, T046 independent) → T047 twin test → T048 → T049. **5b** (T050, T051 independent) → T052 → T053 → T054 → T055. **5c** T056 → (T057–T059 independent) → T060. **5d** T061 → T062, parallel to 5a–5c (needs only T002). **5e** T063 → T064 → (T065–T069 independent) → (T070–T071 independent). **5f** T072 → (T073–T077 independent) → T078. |
| **6 · US2** | W1 (T079, T080 independent) → W2 (T081–T083, all in the synthesis module, independent of each other) → T084 tests → T085 panel → W (T086–T088 independent) → T089 e2e. |
| **7 · US3** | T090 → T091 → (T092–T093 independent). |
| **8 · US4** | W1 (T094–T096 independent) → T097 → (T098–T100 independent); (T101–T103 independent) off T095; T104 → (T105–T106 independent); T107 → (T108–T110 independent) off T061+T097; then (T111–T112 independent). |
| **9 · US5** | T113 → T114 → (T115–T117 independent); T118 off T114 → (T119–T121 independent). |
| **10 · Polish** | W1 (T122–T126 independent) → T127 (needs every phase's strings); (T128–T129 independent doc corrections) parallel to W1 → T130 full gate last. |

**Story independence.** US1 (Phase 3) ships alone with zero UI change. US2, US3, and US4 are mutually independent **once Phase 5 lands** — each is a separate slice of the same grid. US5 consolidates the diagnostics surface and depends on Phases 4 and 5, not on US2–US4 individually.

### Parallel Opportunities

- **Phase 1** is almost fully parallel — four independent lifts, then three independent follow-ups.
- **Phase 2's `sp` correction** (T017–T019) is independent of the whole join chain (T013–T016) and can run beside it.
- **Phase 3's four coverage callers** (T026–T029) are four different files and are the widest genuinely-parallel wave in the feature — but they must land in the **same change**, since leaving any one on the unjoined path defeats the fix.
- **Phase 5's five sub-groups**: 5d (layer families) needs only T002 and can run from the start of the phase; 5a→5b→5c is one chain; 5e needs 5a's overlay and Phase 2's join; 5f needs 5e's grid and 5c's store.
- **Phases 6, 7, and 8** can run concurrently once Phase 5 closes — three stories, three mostly-disjoint file sets (the shared touch points are `touchRuleSynthesis.ts` between US2 and US3, and `keyEditOps.ts` between US4 and US5).
- **Phase 10's conformance specs** (T122–T126) and **doc corrections** (T128–T129) are five plus two independent files; only T127 (extraction) and T130 (the gate) must wait.

### Not silently capped

Two bounds this task list carries deliberately, stated rather than hidden:

- **Corpus-wide aggregate figures are never test-asserted.** Only the two named Cameroon canaries are pinned fixtures, and their tests skip if the corpus is absent (T032, T042). The narrative calibration table in the spec is not a test target.
- **Row, layer, and platform operations, and flick/multitap authoring, are out of the operation union entirely** (not merely untested) — they need the declared-writes extension and row-id stability, and admitting them now would invite an applier that half-supports them. Byte-level patch-minimization within a touched `.keyman-touch-layout` is likewise out of scope; the raw-JSON pass re-serializes the whole file and formatting normalizes (T112).
