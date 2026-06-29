# Implementation Plan: Wire build-list — BuildListView resolves as the build-list branch drill-down behind the mandatory IntroChooser gate

**Spec**: [spec.md](./spec.md) · **Phase**: 1 (Question Unification) · **Spec #**: 6 of 8 · **Branch**: `speckit/question-unification-phase1-specs`

**Source**: [docs/design-notes/question-unification-migration-plan.md](../../docs/design-notes/question-unification-migration-plan.md) §2.1 `pb_build_list` row, §2.4 step 4, §2.5 `SurveyPhaseResult` oracle, §5 spec #6, §6 (Q1 inventory contracts + loop DEFERRED); findings [question-unification-findings.md](../../docs/design-notes/question-unification-findings.md) (a)/(b) build-list rows (mandatory IntroChooser gate, no auto-default).

## Summary

Confirm that the default Phase B `BuildListView` (`survey/PhaseB.tsx:535`, mounted ~`692`) resolves as the **build-list branch** drill-down node of `phase_b_characters.modular.yaml` — reached from the **mandatory** IntroChooser discovery-method gate (`PhaseB.tsx` IntroChooser ~`744`, mounted ~`682`), modeled as a **registry-keyed drill-down under the opaque `characters` node** (NOT a top-level manifest entry) — while its confirmed-inventory output (on `SurveyPhaseResult.confirmedInventory`, `PhaseB.tsx:610`, unioned via `mergePhaseResults`) is preserved **deep-equal** (byte-identical). Add a `SurveyPhaseResult` oracle (the §2.5 phase-result deep-equal) that locks the produced `confirmedInventory` for the build-list path. No new write routing, no `mutate()`, no contracts bump, SPA render unchanged, IntroChooser gate stays mandatory (no auto-default), `pb_*` battery untouched (the step-by-step branch off the same gate; its demotion is spec 022).

## Why this is mostly a confirmation + a regression lock (the core design constraint)

| Concern | State entering this spec | What this spec does |
|---|---|---|
| `pb_build_list` drill-down declaration | **Declared by spec 017** (dependency) — registry-keyed drill-down under `characters` | Nothing — consumes the 017 contract; confirms it renders on the node |
| Build-list branch map node | **Rendered by the spec-015 adapter** automatically (modular drill-down keyed off `questionRegistry`) | Nothing — confirms the node resolves; asserts it via the map-projection assertions |
| IntroChooser gate (mandatory, no auto-default) | **Already mandatory** (`PhaseB.tsx:680-687`) | Preserve exactly; confirm no auto-default is introduced |
| `confirmedInventory` output | **On `SurveyPhaseResult.confirmedInventory`** (`PhaseB.tsx:610`) | Preserve deep-equal; lock with the `SurveyPhaseResult` oracle |
| `pb_*` step-by-step battery | The other branch off the same gate | Explicitly NOT touched (demotion/move is spec 022) |
| top-level manifest entry / per-grapheme loop / `mutate()` | Phase 2 | Explicitly NOT done here |

So the only *new artifact* this spec adds is the **`SurveyPhaseResult` oracle test** (the `confirmedInventory` deep-equal). Everything else is a confirmation that the already-declared (017), already-projected (015) build-list branch resolves correctly with the unchanged inventory output and the unchanged mandatory gate.

## Components / files to touch

- **NO EDIT** to `survey/PhaseB.tsx` (`BuildListView`, `IntroChooser`, and the `confirmedInventory` write at `PhaseB.tsx:610` are all preserved byte-identically; the `discoveryMethod === null` mandatory gate and the `"build-list"` / step-by-step branches stay as-is), `survey/questions/registry.ts` / the `pb_build_list` drill-down declaration (spec 017 owns it), `buildStepGraph.ts` / the map adapter (spec 015), `phase_b_characters.modular.yaml`, or `packages/contracts` (the `SurveyPhaseResult.confirmedInventory` field already exists — additive, `PhaseB.tsx:9-10`).
- **NEW** test `packages/studio/src/survey/buildListPhaseResult.test.ts` (working name; co-locate with the existing `BuildListView.test.tsx` / the survey tests, or in the mirrored survey tree `packages/studio/tests/survey/questions/b/` per §2.5) — the §2.5 `SurveyPhaseResult` oracle: complete the build-list path and assert the produced `SurveyPhaseResult` (its `confirmedInventory` union via `mergePhaseResults`) is **deep-equal** to the baseline, and assert `KeyboardIR` is **not** written by the build-list path.
- **POSSIBLY** an addition to the spec-015 map-projection test (or a co-located assertion) confirming the build-list branch (`pb_build_list`) resolves as a registry-keyed drill-down under `characters`, behind the IntroChooser gate, with the spec-017 `inputs`/output populated and the `pb_*` battery as the other branch. Keep it additive; do not repurpose the spec-015 or spec-016 tests.
- **NO new flag** — the build-list branch node renders under the existing dev-only `SHOW_FLOWMAP` gate (`StudioShell.tsx:84`), inherited from spec 015.

## Wiring / oracle design

1. **Node resolution (no code change):** `pb_build_list` is declared (spec 017) as a registry-keyed drill-down under the opaque `characters` node, so the spec-015 `buildModularFlowGraph()` drill-downs (keyed off `questionRegistry`) project it under `characters`, behind the IntroChooser gate. Its `inputs`/output come from the spec-017 declaration. The build-list-vs-step-by-step branch split comes from the IntroChooser gate's two branches (`PhaseB.tsx:680-697`). This plan confirms — it does not build — the node.
2. **Inventory-output preservation (no code change):** `BuildListView.onComplete` (`PhaseB.tsx` ~`610`) is left exactly as-is — the inventory rides on `SurveyPhaseResult.confirmedInventory`, unioned via `mergePhaseResults`. The plan's job is to NOT touch this and to lock it with the oracle. No `mutate()`, no `KeyboardIR` write is introduced.
3. **Mandatory-gate preservation (no code change):** the `discoveryMethod === null` IntroChooser branch (`PhaseB.tsx:680-687`) and the `"build-list"` branch (`PhaseB.tsx:690-697`) stay as-is — no auto-default is added. The plan confirms the gate is reached before either branch.
4. **`SurveyPhaseResult` oracle (the new artifact):** a phase-result deep-equal. Because the build-list path writes no IR leaf (its output is `SurveyPhaseResult.confirmedInventory`), the oracle is the **produced `SurveyPhaseResult`** (`confirmedInventory` union via `mergePhaseResults`), NOT an emit-byte (`flagParity`-style) or flow-routing snapshot. Drive the build-list completion, capture the merged `confirmedInventory`, assert deep-equal to the baseline, and assert `KeyboardIR` is untouched on this path.
5. **Guardrail confirmation:** run the spec-016 drift guardrail with `pb_build_list` resolving as the build-list branch drill-down; it is checked in the **question** graph (the boundary-crossing step — reachable-from-flow-entry via `resolveNext` over `next`/`FlowGotoRule[]`, §2.2(b)), so the bijection holds (a reachable question-graph node with a rendered drill-down; no orphan, no uncovered step).

## Intra-spec sequencing (within spec 020)

1. Confirm the dependencies have landed: spec 015 (map projection — the build-list branch gets a rendered drill-down node automatically), spec 016 (drift guardrail — checks the build-list branch in the question graph), and spec 017 (the `pb_build_list` drill-down `inputs`/output declared). This spec does **not** declare the drill-down — it consumes 017's declaration.
2. Add the §2.5 `SurveyPhaseResult` oracle (the `confirmedInventory` deep-equal) and pin the current produced inventory as the byte-identical baseline **before** any other Phase-1 spec could perturb the phase result.
3. Add/extend the map-projection assertion that the build-list branch resolves as a registry-keyed drill-down under `characters` (behind the IntroChooser gate, with the `pb_*` battery as the other branch) and carries the spec-017 `inputs`/output.
4. Run the full gate (drift guardrail green — build-list branch checked in the question graph; typecheck, vitest, depcruise).

> Note on cross-spec sequencing: spec 017 sequences **writes-before-inputs** to keep completeness C5 from transiently reddening when declaring step contracts. **That ordering is spec 017's concern, not this spec's** — the build-list drill-down's declared output is the `SurveyPhaseResult.confirmedInventory` phase-result inventory (not a manifest-graph IR write), so it raises no manifest-level C5 obligation here; 020 only consumes the already-declared drill-down contract. Recorded so the dependency is visible, not to action it.

## How the Phase-1 invariants are preserved

- **No new write routing / no `mutate()`:** the inventory output stays on `SurveyPhaseResult.confirmedInventory` (`PhaseB.tsx:610`), unioned via `mergePhaseResults`; no store mutator, reducer, or `mutate()` path is added, and no `KeyboardIR` write is introduced (FR-005). CLDR suggestions stay in-component and async. The per-grapheme loop / `mutate()` move is Phase 2 spec #12.
- **No contracts bump:** reuses the existing `SurveyPhaseResult.confirmedInventory` field (already additive, `PhaseB.tsx:9-10`) and existing registry/drill-down shapes; `packages/contracts` untouched (FR-012). The Q1 inventory-contracts choice is deferred to Phase 2 (§6).
- **Behavior byte-identical:** `BuildListView`'s `onComplete` is unchanged; the `SurveyPhaseResult` oracle locks the produced `confirmedInventory` deep-equal; the `BuildListView` render is hand-placed by `StudioShell`/`PhaseB` exactly as today (FR-006/FR-007/SC-003/SC-005).
- **Step appears as a map node:** `pb_build_list` is declared (017) as a registry-keyed drill-down under `characters`, so the spec-015 modular adapter projects its node automatically; this spec confirms it with the 017 contract populated and the build-list-vs-step-by-step branch split off the IntroChooser gate (FR-001/FR-002/FR-003/FR-004/SC-001/SC-002).
- **Read-only / declare-consuming:** this spec adds no declaration of its own (017 owns the `pb_build_list` drill-down contract); it adds only the regression-lock oracle and a confirming assertion.
- **Mandatory gate, no auto-default:** the `discoveryMethod === null` IntroChooser branch stays mandatory; no auto-default is introduced on either branch (FR-008/SC-004).
- **Drift guardrail stays green:** `pb_build_list` is a reachable question-graph node with a rendered drill-down, so the spec-016 bijection holds in the **question** graph (the boundary-crossing step) (FR-010/SC-006).
- **`pb_*` battery untouched:** it remains the non-default step-by-step branch off the same gate; its demotion/move is spec 022 (FR-003/FR-012/SC-002).

## Risks & mitigations

- **Accidentally re-routing the inventory through `mutate()`/`KeyboardIR` (scope creep into Phase 2):** the strongest temptation, since Phase 2 (spec #12) does exactly that. Mitigation: FR-005/FR-012 forbid it; the `SurveyPhaseResult` oracle proves the inventory still rides on `confirmedInventory` and `KeyboardIR` is untouched; spec #12 (`qu-mutate-buildlist-loop`) is the `mutate()`/loop move.
- **Accidentally introducing an auto-default that skips the IntroChooser gate:** the build-list branch is the *default* (mature) path but the gate is mandatory. Mitigation: FR-008/SC-004 forbid an auto-default; the gate-preservation confirmation proves `discoveryMethod === null` still renders the IntroChooser before either branch.
- **Adding a top-level manifest entry for `pb_build_list` (over-promotion):** mitigation: FR-002 forbids it; it must stay a registry-keyed drill-down under `characters`; the drift guardrail checks it in the **question** graph, not the manifest graph.
- **Touching the `pb_*` battery (it is spec 022's surface):** mitigation: FR-003/FR-012 forbid demoting or moving it here; it stays the other branch off the same gate.
- **Oracle picking the wrong baseline (comparing IR instead of the phase result):** the build-list path has no IR output; mitigation: the oracle is a `SurveyPhaseResult` deep-equal of the `confirmedInventory` union via `mergePhaseResults` per §2.5 `SurveyPhaseResult` surfaces.
- **Depending on spec 017 not yet landed:** mitigation: sequencing step 1 confirms 017 declared the `pb_build_list` drill-down first; if 017 has not landed, this spec is blocked (dependency).

## Test strategy (per migration-plan §2.5)

- **`SurveyPhaseResult` oracle (FR-009):** complete the build-list path; assert the produced `SurveyPhaseResult` (`confirmedInventory` union via `mergePhaseResults`) is **deep-equal** to the baseline; assert `KeyboardIR` is **not** written by the build-list path. (No emit-byte or flow-routing comparison — build-list writes `confirmedInventory`, NOT `KeyboardIR`.)
- **Map-projection assertion (additive):** the build-list branch (`pb_build_list`) resolves as a registry-keyed drill-down under `characters`, behind the IntroChooser gate, with the spec-017 `inputs`/output populated and the `pb_*` battery as the other branch. Does not repurpose the spec-015 or spec-016 tests.
- **Mandatory-gate assertion:** Phase B with `discoveryMethod === null` renders the IntroChooser; choosing build-list resolves `BuildListView`, choosing step-by-step resolves the `pb_*` battery — neither without an explicit choice (no auto-default).
- **Drift guardrail (spec 016):** green with the build-list branch checked in the **question** graph (the boundary-crossing step, §2.2(b)) — a reachable question-graph node with a rendered drill-down (no orphan, no uncovered step).
- **Per-step unit test (mirrored tree, §2.5):** assert the `pb_build_list` drill-down's declared `inputs`/output are well-formed (output = `SurveyPhaseResult.confirmedInventory`, not an `irPath()` leaf); this overlaps spec 017's per-step test — keep additive, do not duplicate 017's authority.
- **Don't regress physical / touch:** unaffected by this spec, but the full suite (which includes the R1/R2 reference locks) must stay green.
- **Boundary:** `pnpm depcruise` (dashboard stays store-free); `pnpm typecheck`; studio + contracts `vitest`.

## Build / test commands

- Typecheck: `pnpm typecheck`
- Tests: `pnpm test` (studio + contracts vitest)
- Boundaries: `pnpm depcruise` (must stay green; forbids `dashboard → stores`)
- Full gate: `pnpm typecheck` + studio/contracts vitest (incl. the §2.5 `SurveyPhaseResult` oracle + the spec-016 drift guardrail checking the build-list branch in the question graph) + `pnpm depcruise` + flag-off render unchanged
