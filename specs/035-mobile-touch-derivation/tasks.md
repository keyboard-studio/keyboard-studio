# Tasks: Mobile/touch layout derivation

**Input**: Design documents from `specs/035-mobile-touch-derivation/` — [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md) (R1–R13, post-amendment), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: INCLUDED — research R8 defines the testing strategy explicitly (engine/studio vitest for the pure functions and the advance policy; Playwright E2E per user story, CI-first).

**Organization**: Grouped by user story. US1 (import-and-adapt, P1) is the MVP; US2 (reseed-from-desktop, P2) builds on the same foundation. The foundational phase is deliberately large: the replay engine, the coverage guard, the fork wiring, and the `buildTouchLayoutJson` rework are prerequisites of **both** stories (research R3 corrected — Case A and Case B are both broken today).

**Non-negotiable premises** (from the amended research — do not re-derive these from the code comments):

- `baseIr` is the **pristine instantiation-time IR**; `lockDesktop()` snapshots nothing (R3). All desktop work reaches touch **only** via the `mods` replay.
- Criterion 18.6 **already has a shipped check** (`KM_LINT_INVENTORY_UNCOVERED`); the touch guard is a **sibling code** `KM_LINT_TOUCH_UNCOVERED` under the same criteria row — **no new criteria.json row** (the 148 count is test-enforced) (R5).
- Case B never round-trips the shipped layout through the IR (R9). Provenance is IR-only; Case B no-clobber is by pipeline ordering (R6).
- Reseed strips `ir.touchLayout` before projecting (R10). The derived seed is emitted even with zero Phase E edits per the R11 matrix.
- The `US_KEYCAPS` fallback in `buildCanonicalPhoneLayers` **stays** (R2).
- `buildTouchLayoutJson` is the **only** writer of the `touchLayoutJson` side-car in both mutate-flag states; the spec-014 seam's side-car write is removed by T024 (R13 — pinned via the PR #1088 triage escalation).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 or US2 (user-story phases only)

---

## Phase 1: Setup

**Purpose**: Green baseline so 035 regressions are distinguishable from pre-existing failures.

- [x] T001 Record a pre-change baseline: run `pnpm --filter @keyboard-studio/engine test src/scaffolder/scaffoldTouchLayout.test.ts src/pattern-apply/applyTouchAssignments.test.ts src/pattern-apply/applyTouchAssignmentsToRawJson.test.ts src/codec/parse-touch.test.ts` and `pnpm --filter @keyboard-studio/studio test src/lib/buildTouchLayoutJson.test.ts src/steps/advance.test.ts src/editors/assignLoop/TouchGallery.test.tsx`; note any pre-existing Windows-checkout failures (CRLF/golden — known, unrelated) in the PR description so they are not chased later

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The replay engine (both variants), the coverage helper + lint check, the derivation of `mods`, the `buildTouchLayoutJson` rework, and the seed-source fork. **Both user stories depend on all of this.**

**⚠️ CRITICAL**: No user-story phase can begin until this phase is complete.

### Engine — pure functions (contracts/seed-derivation.md, contracts/simplification.md)

- [x] T002 [P] Implement `DesktopModifications`, `ApplyDesktopModificationsResult`, and the pure IR-path `applyDesktopModifications(seed, mods)` in `packages/engine/src/pattern-apply/applyDesktopModifications.ts` per [contracts/seed-derivation.md](contracts/seed-derivation.md): removals purge `text`/`output`/`U_…` id/`sk`/`flick`/`multitap` on every platform/layer but **never delete a key object** — primary-production keys become inert placeholders (`T_removed_<n>` id, `text` cleared, `output` removed, other-char gestures kept); placements land on the phone `default` layer (sk/longpress when the host already outputs, warning + longpress fallback when `hostKey` is absent); replay-touched keys tagged `provenance: "physical-suggested"`, `hand-set` keys never overwritten; deterministic nodeId minting. Export from `packages/engine/src/pattern-apply/index.ts` (or the module barrel in use) and `packages/engine/src/index.ts`
- [x] T003 [P] Implement `applyDesktopModificationsToRawJson(rawJson, mods)` in `packages/engine/src/pattern-apply/applyDesktopModificationsToRawJson.ts` (R9): parse → splice-in-place → `JSON.stringify` exactly like `applyTouchAssignmentsToRawJson` (verbatim guarantee — never round-trip through `emitTouchLayout`); same removal/placement semantics as T002 but **no provenance fields** in the wire JSON; share dedupe/splice helpers with `touch-mechanism-shared.ts` where practical. Export alongside T002
- [x] T004 [P] Implement `touchCoverage(layout, inventory): { uncovered }` in `packages/engine/src/pattern-apply/touchCoverage.ts` per [contracts/simplification.md](contracts/simplification.md): a char is covered when produced by a navigable key's `text`/`output`/`U_…` id or any `sk`/`flick[dir]`/`multitap` entry, on the `default` layer or any layer reachable via a `nextlayer` chain from `default`; star-labels (`*Shift*`, `*123*`) and spacers are not producers. Export alongside T002
- [x] T005 [P] Engine unit tests in `packages/engine/src/pattern-apply/applyDesktopModifications.test.ts`: removal purges every producer form on every platform; **canonical matching** — a layout key whose `text`/`output` stores the NFD form (base + combining) of an NFC removal entry is still matched and removed (seed-derivation contract, Removals clause); primary-key removal yields the inert placeholder with row geometry/widths intact; placement appears (host-present and host-absent fallback cases, warning emitted); provenance tagged; `hand-set` untouched; same input → identical output
- [x] T006 [P] Engine unit tests in `packages/engine/src/pattern-apply/applyDesktopModificationsToRawJson.test.ts`: unmodified fields byte-preserved (per-key `layer`, `displayUnderlying`, `font`/`fontsize`, string-form `sp`/`width`/`pad`); same removal/placement semantics as the IR variant **including the NFD-stored canonical-matching case** (hand-authored shipped JSON is the likeliest place to find NFD strings); **no** `provenance` key anywhere in the output JSON
- [x] T007 [P] Engine unit tests in `packages/engine/src/pattern-apply/touchCoverage.test.ts`: orphan reported exactly once; coverage via sk/flick/multitap counts; a char only on an unreachable layer (no `nextlayer` chain from `default`) is uncovered; empty result when all covered

### Lint — the FR-008 guard (contracts/simplification.md)

- [x] T008 Implement `check-18-6-touch-coverage.ts` in `packages/keyboard-lint/src/checks/` emitting `KM_LINT_TOUCH_UNCOVERED` findings (one per uncovered char, message `U+XXXX <char> has no touch mechanism`) mapped to the **existing** criterion row `18.6-inventory-fully-covered`; register it in `packages/keyboard-lint/src/lintContext.ts` (`lintWithContext`) next to the desktop sibling; **no** `origin === "scaffolded"` scope guard (imported bases are the primary audience) and no raw-fragment skip (it walks the touch layout, not IR rules); severity **warning**; export from `packages/keyboard-lint/src/index.ts`; add unit tests in `packages/keyboard-lint/src/checks/check-18-6-touch-coverage.test.ts`. **Guard: `packages/contracts/data/criteria.json` is not touched — the criteria-count tests (148) must still pass** (depends on T004)
- [x] T009 Extend `useTouchLint` in `packages/studio/src/hooks/useTouchLint.ts` to accept optional context (`{ layout: TouchLayoutIR; inventory: readonly string[] }`) and route through `lintWithContext` when present (plain `engine.lint` otherwise); the existing single `useDebounce(DEBOUNCE_MS)` effect is the only timer — no second debounce (Constitution IV) (depends on T008)

### Studio — mods derivation, orchestrator, emission (contracts/seed-derivation.md, R3/R11)

- [x] T010 Implement `deriveDesktopModifications` in `packages/studio/src/lib/deriveDesktopModifications.ts`: `removals` = produced-set diff `buildProducedSet(baseIr)` minus `buildProducedSet(projectedWorkingIR)` where `projectedWorkingIR` applies the carve overlay (`deletedNodeIds`/`deletedItemIds`) via the existing `projectWorkingCopyForOutput` projection machinery — **not** a rule-presence diff (carve nul-fills; the rule survives, the char disappears); `placements` = Phase C `phaseResults` assignments filtered `modality === "physical" && scope === "individual"` (same source as `TouchGallery.desktopAssignments`). **NFC caveat (triage P2)**: `buildProducedSet` run-merges consecutive char elements and NFC-normalizes on flush, so a carved base+combining sequence surfaces as the precomposed codepoint in the diff — verify that is the removal the touch replay wants for multi-codepoint carved sequences, and cover it explicitly. Unit tests in `packages/studio/src/lib/deriveDesktopModifications.test.ts` covering a nul-filled carve slot, a multi-char-rule removal, and an NFD-emitting (base+combining) carve whose diff yields the NFC form
- [x] T011 Rework `buildTouchLayoutJson` in `packages/studio/src/lib/buildTouchLayoutJson.ts` to the new signature `(baseIr, assignments, opts: { baseTouchJson?, mods, seedSource })`: reseed (or no `baseTouchJson`) → Case A `scaffoldTouchLayout({ ...baseIr, touchLayout: undefined })` (R10 strip) → `applyDesktopModifications` → `applyTouchAssignments` → `emitTouchLayout`; import-adapt with `baseTouchJson` → Case B `applyDesktopModificationsToRawJson` → `applyTouchAssignmentsToRawJson`; `json: null` only on engine failure. Update `packages/studio/src/lib/buildTouchLayoutJson.test.ts` for the new opts shape (depends on T002, T003)
- [x] T012 Update **both call sites in the same commit** (contract back-compat note): `packages/studio/src/editors/assignLoop/TouchGallery.tsx` (`touchLayoutJson` memo, `vfsTransform`, `editedVfsForLint`) and `packages/studio/src/StudioShell.tsx` (`handlePhaseEComplete` → `setTouchLayoutJson`) to pass `opts` from `deriveDesktopModifications` + the session seed-source, and implement the **R11 emission matrix** in all three surfaces: reseed → always emit; import-adapt with non-empty `mods` or a real Phase E edit → emit; truly-untouched import-adapt → emit nothing (shipped file verbatim). Update `packages/studio/src/StudioShell.test.tsx` Defect-B block for the new call shape (depends on T010, T011)

### Studio — seed-source fork (contracts/seed-source-fork.md, R12)

- [x] T013 Wire the fork in `packages/studio/src/steps/advance.ts`: `case "mechanisms"` returns `{ next: "touch_seed_source" }` when `ctx.touchSeedSource === null`, else `{ next: "touch" }`; add `case "touch_seed_source"` → `{ next: "touch" }`; add `"touch_seed_source"` to the local `ActiveStepId` mirror and add `touchSeedSource: TouchSeedSource | null` to `AdvanceContext`; `touch_seed_source` is **not** added to `STEPS_WITH_APPLY_COMPLETION`. Mirror the id in `surveySessionStore`'s `ActiveStepId`; add the `touchSeedSource` slot + setter to the session store (cleared on base re-instantiation; setting a *different* value clears `touchDraft`). Update `packages/studio/src/steps/advance.test.ts` (both conditional outcomes) and the golden-walk oracle test
- [x] T014 Build the chooser panel in `packages/studio/src/editors/touchSeedSource/` (new dir, e.g. `TouchSeedSourcePanel.tsx`): preview of the base layout when `resolveBaseTouchJson(baseVfs)` is present, "no base touch layout" statement otherwise; **Import & adapt** default when a layout exists, **Reseed from desktop** default when absent; advisory hints (e.g. "no phone platform") never disable a choice; reseed option states the shipped tablet/desktop platform drop when applicable; changing an existing choice with `touchDraft` present warns before discarding; on confirm set the session `TouchSeedSource` + `onComplete`; `onBack` → mechanisms. Register the component for the `touch_seed_source` step in `packages/studio/src/steps/registerEditorSteps.ts` (replacing `AddTouchAdapter` for that step only); rewire TouchGallery's host-supplied `onBack` to land on `touch_seed_source` (re-entry path, R12). Component unit tests in `packages/studio/src/editors/touchSeedSource/TouchSeedSourcePanel.test.tsx` (depends on T013)

**Checkpoint**: Engine replay + coverage + lint check + fork all exist and are unit-green. User stories can now be implemented.

---

## Phase 3: User Story 1 — Adapt the base's touch layout (Priority: P1) 🎯 MVP

**Goal**: A base that ships a touch layout is imported as the seed; the author's carve removals and letter placements are replayed onto it; the author fine-tunes with the existing four editing methods.

**Independent Test** (spec US1): author from a base **with** a touch layout, carve N chars and place M letters on desktop, and confirm the emitted `.keyman-touch-layout` starts from the base's layout with the N removals and M placements applied — not from QWERTY — and compiles.

- [ ] T015 [US1] Feed the derived seed to the gallery in `packages/studio/src/editors/assignLoop/TouchGallery.tsx`: replace the inline `detectedChars` walk with the shared `touchCoverage` traversal run against the **derived seed for the chosen seed source** (Case B: base layout + replay; today's unconditional `scaffoldTouchLayout(baseIr)` is wrong for this path); the "already in layout" suggestion (Accept → `touch_inherited`) and all four editing methods (longpress/flick/multitap/replace — FR-007) must behave exactly as before on the new seed
- [ ] T016 [US1] Surface the coverage guard: pass `{ layout, inventory: session.confirmedInventory }` context into `useTouchLint` from TouchGallery so `KM_LINT_TOUCH_UNCOVERED` warnings appear in the gallery `LintSummary`, and add the **completion gate** — the touch-stage completion path (`handlePhaseEComplete` or the stage-exit host) re-runs `touchCoverage` on the final layout and refuses to finalize while `uncovered` is non-empty (FR-008); files: `packages/studio/src/editors/assignLoop/TouchGallery.tsx`, `packages/studio/src/StudioShell.tsx`
- [ ] T017 [US1] Rewrite the stale TouchGallery header comment (FR-001) in `packages/studio/src/editors/assignLoop/TouchGallery.tsx` — the "fixed minimal QWERTY / desktop edits are NOT transferred" block — to describe the seed-source derivation + replay; update `packages/studio/src/editors/assignLoop/TouchGallery.test.tsx` (drop the obsolete `buildMinimalPhoneTouchLayout` mock if now unused; add a case asserting the derived seed is injected per the R11 matrix even with zero Phase E edits when mods are non-empty)
- [ ] T018 [P] [US1] Case B integration tests in `packages/studio/src/lib/buildTouchLayoutJson.test.ts`: with a shipped multi-platform layout, carved chars are absent from **every** platform (text/output/sk/flick/multitap); placements present; verbatim fields preserved; emission-matrix rows for import-adapt (non-empty mods → emit; untouched → no emit)
- [ ] T019 [US1] Playwright E2E `packages/studio/e2e/touch-derivation-us1.spec.ts`: full US1 walk per [quickstart.md](quickstart.md) Scenario A — base **with** touch layout → carve N + place M → seed-source step defaults to Import & adapt → touch gallery → emit ZIP → assert the layout starts from the base's platforms, none of the N carved chars appear, all M placements present, file compiles (SC-001, SC-004). Import from `"playwright/test"` (not `@playwright/test`) per repo convention; CI-first (local Playwright CLI unavailable — verify locally via Node probes/CDP). If the E2E base keyboard is not yet in `docs/keyboard-index.md`, add its row in the same change (mandatory phonebook rule)

**Checkpoint**: US1 fully functional — the default path carries desktop work onto an imported base layout. MVP deliverable.

---

## Phase 4: User Story 2 — Reseed from the desktop layers (Priority: P2)

**Goal**: When the base has no usable touch layout (or the author rejects it), project the locked desktop layers into the compact phone layout, replay the desktop work, keep every inventory char reachable.

**Independent Test** (spec US2): author from a base **without** a touch layout, choose reseed, and confirm the emitted layout is a simplified projection of the desktop layers (contains the placed characters, clutter-free) and is not QWERTY; separately, on a base **with** a layout, explicitly choosing reseed discards it.

- [ ] T020 [US2] Reseed-path unit tests in `packages/studio/src/lib/buildTouchLayoutJson.test.ts`: reseed on a base **with** a shipped `ir.touchLayout` produces **only** the compact phone projection (no base-derived platforms — proves the R10 strip, US2-AS4); reseed emission-matrix row (always emits, even with zero Phase E edits and empty mods — SC-002); projection contains the placed chars from `mods`
- [ ] T021 [P] [US2] Provenance tagging in `packages/engine/src/scaffolder/scaffoldTouchLayout.ts` (R6): `buildLetterKey` and deadkey-augmented keys emit `provenance: "physical-suggested"`; keys carried from an existing `ir.touchLayout` in the engine's internal Case B branch remain untagged/`base-derived` semantics; extend `packages/engine/src/scaffolder/scaffoldTouchLayout.test.ts`. **Guard: the `US_KEYCAPS` fallback stays (R2)**
- [ ] T022 [US2] Chooser reseed behaviors in `packages/studio/src/editors/touchSeedSource/TouchSeedSourcePanel.tsx` tests: defaults to Reseed when no base layout exists; explicit Reseed on a base with a layout shows the tablet/desktop-drop advisory and records the choice; changing import-adapt → reseed with an existing `touchDraft` triggers the discard warning and clears the draft (R12)
- [ ] T023 [US2] Playwright E2E `packages/studio/e2e/touch-derivation-us2.spec.ts`: US2 walk per [quickstart.md](quickstart.md) Scenario B — base **without** touch layout → Reseed default → gallery → emit → assert compact phone projection (default+shift+numeric, ≤10 keys/row) containing the placed chars, not QWERTY-only, compiles (SC-002, SC-004); include the AS4 variant on the Scenario-A base (explicit reseed discards the shipped layout). Same conventions/phonebook rule as T019

**Checkpoint**: Both stories independently functional; every acceptance scenario in spec.md exercised.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T024 Remove the spec-014 seam's side-car write (R13 — pinned decision, not an open choice): delete `setTouchLayoutJson` from `RepropagateDeps` and the `emitTouchLayout` write in `packages/studio/src/steps/repropagate.ts` (lines 163-165 region), and its injection at the reducer's mechanisms-completion call site in `packages/studio/src/steps/reducer.ts` (~line 248); update the docstrings in `repropagate.ts` and `packages/studio/src/editors/touchSuggest/touchSuggest.ts` to state the single-writer rule (`buildTouchLayoutJson` owns the artifact; the seam owns `ir.touchLayout` provenance only); update `packages/studio/tests/steps/repropagate.test.ts` (drop side-car assertions) and keep `packages/studio/src/lib/serializeWorkingCopy.flagParity.test.ts` green (flag-off byte-parity). **Constraint: must land before `VITE_KM_MUTATE_SEAM=1` is ever enabled on a 035-bearing build** — flag-on, the old write IR-round-trips shipped base layouts (violates R9) and bypasses the R11 matrix
- [ ] T025 [P] Verify the Flow Map renders the now-live `touch_seed_source` fork correctly (inputs/writes/joinTarget drill-down) and update the render layer if the fork's activation changed its display; files under the Flow Map component tree in `packages/studio/src/` (locate via the spec-021/023 render layer)
- [ ] T026 [P] Docs sync: update the E2E paragraph in `CLAUDE.md` with the two new specs' names and live/skip status; confirm `docs/github_flow.md` Status table needs no row change (touch layout serialisation already listed); add any newly referenced keyboards to `docs/keyboard-index.md` if T019/T023 did not already
- [ ] T027 Run the full [quickstart.md](quickstart.md) validation: unit blocks, Scenario A (US1), Scenario B (US2 + AS4), Scenario C (coverage guard warning → completion refusal → clear), and the constitution spot-checks (no host-disk writes, single debounce, IR-spine); then `pnpm lint && pnpm typecheck && pnpm -r test` — the contracts criteria-count tests (148) and depcruise boundaries must pass unchanged

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: none — start immediately
- **Phase 2 (Foundational)**: after T001. Internal ordering: T002/T003/T004 in parallel → T005/T006/T007 in parallel; T008 after T004; T009 after T008; T010 independent [can run parallel with engine tasks]; T011 after T002+T003; T012 after T010+T011; T013 independent of engine tasks; T014 after T013
- **Phase 3 (US1)**: after Phase 2 complete. T015 → T016; T017 after T015; T018 parallel with T015–T017; T019 last (needs the wired flow)
- **Phase 4 (US2)**: after Phase 2 complete (independent of Phase 3 except shared files — see note). T020/T021/T022 parallelizable across files; T023 last
- **Phase 5 (Polish)**: after Phases 3+4

### Story Independence Note

US1 and US2 are testable independently, but T015/T017 (TouchGallery.tsx) and T018/T020 (buildTouchLayoutJson.test.ts) touch the same files — if two implementers run in parallel, sequence those specific tasks or coordinate via short-lived branches. Single-implementer order: Phase 3 fully, then Phase 4.

### Parallel Opportunities

- **Foundational**: `{T002, T003, T004}` then `{T005, T006, T007}`; `{T010, T013}` alongside the engine group
- **US1**: T018 alongside T015–T017
- **US2**: T020, T021, T022 concurrently (different packages/files)
- **Polish**: T025, T026 concurrently

---

## Implementation Strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (US1).** That delivers the spec's core promise — "make similar modifications to the base's touch layout as we did to the desktop" — on the common case (bases that ship touch layouts), with the coverage guard live. Stop, validate against quickstart Scenario A, demo.

**Increment 2 = Phase 4 (US2)**, unlocking bases without touch layouts and the explicit-reseed escape hatch. **Increment 3 = Phase 5** polish.

Branch per the repo policy: one feature branch (suggested `km/035-touch-derivation`), PR per increment or one PR at the end of US1 for the MVP cut. Commit prefixes: `feat(engine)` for T002–T007, `feat(criteria)`/`feat(engine)` for T008, `feat(studio)` for the studio tasks, `test(studio)`/E2E per repo convention, `docs` for T026.
