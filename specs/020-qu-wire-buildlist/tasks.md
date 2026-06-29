# Tasks: Wire build-list — BuildListView resolves as the build-list branch drill-down behind the mandatory IntroChooser gate

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Phase**: 1, spec #6 · **Branch**: `speckit/question-unification-phase1-specs`

Phase-1 invariants in force for every task: **no new write routing / no `mutate()`** (inventory stays on `SurveyPhaseResult.confirmedInventory`, NOT `KeyboardIR`), **no contracts bump**, **behavior byte-identical** (produced `SurveyPhaseResult` deep-equal), **build-list branch appears as a registry-keyed drill-down map node under `characters`**, **read-only / declare-consuming (017 owns the `pb_build_list` drill-down contract; the IntroChooser gate stays mandatory with no auto-default; the `pb_*` battery is untouched)**.

## A. Dependencies & grounding (read-only verification — do before any change)

- [ ] **T001** Confirm dependency specs have landed: spec 015 (map projection — the build-list branch gets a rendered drill-down node automatically via `buildModularFlowGraph` drill-downs keyed off `questionRegistry`), spec 016 (drift guardrail — checks the build-list branch in the **question** graph), and spec 017 (the `pb_build_list` drill-down `inputs`/output declared). This spec **consumes** 017's declaration; it does NOT declare the drill-down. If 017 has not declared `pb_build_list`, this spec is **blocked**.
- [ ] **T002** Confirm `BuildListView` is hand-built and mounted via `PhaseB` at `discoveryMethod === "build-list"` (`PhaseB.tsx:535`, mounted `PhaseB.tsx:690-697`); its confirmed-inventory output rides on `SurveyPhaseResult.confirmedInventory` (`PhaseB.tsx:610`), unioned via `mergePhaseResults`. Confirm this spec must NOT change the component or its output.
- [ ] **T003** Confirm the **mandatory** IntroChooser gate: `discoveryMethod === null` renders `IntroChooser` (`PhaseB.tsx:680-687`, component ~`744`) before either branch; the build-list branch and the `pb_*` step-by-step branch both hang off it; there is **no auto-default**. Record this as the byte-identical baseline.
- [ ] **T004** Confirm the SPA render path: `StudioShell`/`PhaseB` hand-place `BuildListView`; there is no `SurveyView` resolving it from the manifest/registry. Confirm this spec must NOT change it.
- [ ] **T005** Confirm the `pb_*` step-by-step battery (`phase_b_characters.modular.yaml`) is the other (non-default) branch off the same gate. Confirm this spec must NOT demote or move it (that is spec 022 / `qu-library-demote`).

## B. `SurveyPhaseResult` oracle (§2.5, FR-009) — the one new artifact; write it FIRST to pin the baseline

- [ ] **T006** Add the `SurveyPhaseResult` oracle test (`packages/studio/src/survey/buildListPhaseResult.test.ts`, or in the mirrored survey tree `packages/studio/tests/survey/questions/b/` per §2.5). Drive the build-list completion path; capture the produced `SurveyPhaseResult` and its `confirmedInventory` union via `mergePhaseResults` (FR-005/FR-006).
- [ ] **T007** Assert the produced `confirmedInventory` (post `mergePhaseResults`) is **deep-equal** to the baseline — byte-identical inventory output (FR-006/FR-009/SC-003).
- [ ] **T008** Assert the build-list path writes **no** `KeyboardIR` leaf — the inventory rides only on `SurveyPhaseResult.confirmedInventory`; no `mutate()` / IR write route exists on this path (FR-005/FR-009/SC-003).

## C. Map-node confirmation (additive assertions — do NOT repurpose spec-015/016 tests)

- [ ] **T009** Assert the build-list branch (`pb_build_list` / `BuildListView`) resolves on the rendered Flow Map as a **registry-keyed drill-down under the opaque `characters` node** (NOT a top-level manifest entry), reached from the IntroChooser discovery-method gate (FR-001/FR-002/SC-001).
- [ ] **T010** Assert the IntroChooser gate is projected with **two** branches off the **same** gate: build-list → `pb_build_list` / `BuildListView`, step-by-step → the `pb_*` battery (FR-003/SC-002).
- [ ] **T011** Assert the build-list node carries its declared `inputs`/output (from spec 017): `inputs` cover the CLDR suggestions (async, in-component) and the base-IR seed (§2.1); the declared **output** is the confirmed inventory on `SurveyPhaseResult.confirmedInventory` (NOT a `KeyboardIR` `irPath()` leaf) (FR-004/SC-001).

## D. Invariant guards (confirm nothing moved into Phase-2 territory)

- [ ] **T012** Confirm **no new write routing / no `mutate()`** for the build-list path, and **no `KeyboardIR` write** — the inventory stays on `SurveyPhaseResult.confirmedInventory` (`PhaseB.tsx:610`); the per-grapheme loop / `mutate()` move is **Phase 2 spec #12 (`qu-mutate-buildlist-loop`)** (FR-005/FR-012/SC-007).
- [ ] **T013** Confirm **no `@keyboard-studio/contracts` bump** — the build-list inventory reuses the existing additive `SurveyPhaseResult.confirmedInventory` field; the Q1 inventory-contracts choice is deferred to Phase 2 (§6) (FR-012/SC-007).
- [ ] **T014** Confirm the **IntroChooser gate stays mandatory** — Phase B with `discoveryMethod === null` renders the IntroChooser; **no auto-default** was introduced on either branch (FR-008/SC-004).
- [ ] **T015** Confirm the **SPA render path is unchanged** — `StudioShell`/`PhaseB` hand-place `BuildListView`; the `BuildListView` render is byte-identical (FR-007/SC-005).
- [ ] **T016** Confirm **no top-level manifest entry** was added for `pb_build_list` (it stays a registry-keyed drill-down under `characters`) and **no re-declaration** of the drill-down (017 owns it) (FR-002/FR-012).
- [ ] **T017** Confirm the **`pb_*` battery is untouched** — it remains the non-default step-by-step branch off the same gate; not demoted or moved (that is spec 022) (FR-003/FR-012/SC-002).

## E. Verification gate (run last)

- [ ] **T018** Run the spec-016 **drift guardrail** with `pb_build_list` resolving as the build-list branch drill-down; confirm **green** — the build-list branch is checked in the **question** graph (the boundary-crossing step, §2.2(b)): a reachable question-graph node with a rendered drill-down (no orphan, no uncovered step) (FR-010/SC-006).
- [ ] **T019** `pnpm typecheck` — green (SC-007).
- [ ] **T020** Studio + contracts `vitest` — green, including the new §2.5 `SurveyPhaseResult` oracle (T006–T008); the spec-015 map-projection and spec-016 drift-guardrail tests still pass (FR-009/FR-011/SC-003/SC-007).
- [ ] **T021** `pnpm depcruise` — green; assert **no new `dashboard → stores` or `dashboard → editors` edge** (FR-011/SC-007).
- [ ] **T022** Flag-off / byte-identical check — with `SHOW_FLOWMAP` off, `FlowMapView` does not mount; the SPA still hand-places `BuildListView`, the IntroChooser gate is still mandatory, and the produced `confirmedInventory` is identical; confirm no behavior change in any flag state (FR-006/FR-007/SC-003/SC-005).
- [ ] **T023** Manual dev-build smoke (flag on): open the Flow Map → Survey flow tab; confirm the build-list branch renders as a registry-keyed drill-down under `characters` behind the IntroChooser gate (with the `pb_*` battery as the other branch) and carries its declared `inputs`/output; then in the SPA enter Phase B, confirm the IntroChooser renders (no auto-default), choose build-list and confirm `BuildListView` resolves with an unchanged inventory output (SC-001/SC-002/SC-004/SC-005).
