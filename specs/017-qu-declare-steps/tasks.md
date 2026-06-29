# Tasks: Declare steps — populate inputs/writes + prefill / pb_build_list drill-down declarations (declared-only, flag off)

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Branch**: `speckit/question-unification-phase1-specs`

> Phase-1 invariants apply to every task: **no new write routing, no `mutate()` execution, flag stays off, no contracts bump, behavior byte-identical.** This is a declared-only spec. **Writes-declaration MUST land before the matching inputs-declaration** so C5 never transiently reds. Each task is small and testable; the verification tasks come last (per §2.5).

## Group A — Prerequisites & decisions

- [ ] **T001** Confirm specs `015-qu-map-projection` and `016-qu-drift-guardrail` are landed and stable: the `StepGraph`→`FlowGraph`/`GraphNode` adapter + wired `DashboardView` projection exist (015), and the rendered ⟺ manifest+`questionRegistry` drift bijection with per-graph reachability is green (016). (Dependencies.)
- [ ] **T002** Resolve **[NEEDS DECISION: D1]** — the cross-graph C5 mechanism for `prefill`'s session-derived inputs: Option A (subsuming manifest step declares `header.bcp47` + `ScriptPrefill` in its `writes`) vs Option B (cross-graph/session-derived exemption + a separate question-writer C5 resolving `iso_code → header.bcp47`). Recommendation: **Option B**. **NOT yet human-resolved** (§6 deferred / developer bucket) — escalate to the developer decision; if unresolved, defer `prefill`'s cross-graph input declaration so manifest-level C5 stays green and carry [NEEDS DECISION: D1] forward.
- [ ] **T003** Resolve **[NEEDS DECISION: D2]** — `track`'s branch-selection write: `writes: []` (branch selection only, no IR leaf in P1 — recommended) vs a declared marker. Lock the recommendation: `writes: []`, `inputs` = `header.bcp47` (array) + resolved base IR.
- [ ] **T004** Confirm the registry home for the `prefill` / `pb_build_list` drill-down declarations (`survey/questions/registry.ts` + `a`/`b` sub-registries, or an adapter-side drill-down descriptor consumed by the 015 projection). Confirm they are **NOT** added to `steps/manifest.ts`. Verify against `pnpm depcruise`.

## Group B — Declare WRITES first (the load-bearing order)

> Per FR-009: every step's `writes` lands before its `inputs`, so C5 (`checkInputsSatisfiable`, `completeness.ts:419-437`) is satisfiable at every intermediate state.

- [ ] **T005** Populate `carveStep.writes` ← `CARVE_WRITES` (`groups[]`/`stores[]`/`raw[]`, `editorMutate.ts:42-46`) in `steps/registerEditorSteps.ts`. (FR-001, FR-002)
- [ ] **T006** Populate `mechanismsStep.writes` ← `ADD_GALLERY_WRITES` (`groups[]`/`stores[]`, `editorMutate.ts:203-206`). (FR-001, FR-002)
- [ ] **T007** Populate `touchStep.writes` ← `TOUCH_WRITES` (`touchLayout.platforms[].layers[].rows[].keys[]`, `editorMutate.ts:172`). (FR-001, FR-002)
- [ ] **T008** Set `trackStep.writes = []` (branch selection only, DEC-D2) and confirm `prefill`'s `writes` is `[]` (read-only). (FR-003, FR-006)
- [ ] **T009** (Option A ONLY, if D1 resolves to A) Declare `header.bcp47` (+ `ScriptPrefill` source) in the subsuming manifest step's `writes`; record the honesty trade-off (phantom write on the opaque placeholder). Skip if D1 = Option B or unresolved. (FR-011)
- [ ] **T010** Run `runCompleteness` after the writes group: confirm C1–C7 green (no input yet references an undeclared producer). (FR-009, FR-014)

## Group C — Declare INPUTS (after writes)

- [ ] **T011** Populate `carveStep.inputs` ← the `groups[]`/`stores[]`/`raw[]` the deletion overlay reads (via `irPath()`, existing locations). (FR-001, FR-002)
- [ ] **T012** Populate `mechanismsStep.inputs` ← base layout `groups[]`/`stores[]`. (FR-001, FR-002)
- [ ] **T013** Populate `touchStep.inputs` ← the locked physical layout seed. (FR-001, FR-002)
- [ ] **T014** Populate `trackStep.inputs` ← `irPath('header','bcp47')` (array) + resolved base IR (`base.displayName`); populate `projectNameStep` inputs/writes against existing `KeyboardIR` locations. (FR-003)
- [ ] **T015** Confirm **no declaration references `irPath('header','script')`** (it does not exist). (FR-004)

## Group D — prefill / pb_build_list drill-down declarations (US2)

- [ ] **T016** Declare `prefill` as a registry-keyed drill-down under the opaque `characters` node (NOT a manifest entry): `writes: []`, `inputs` = `header.bcp47` (array, session-derived) + session `ScriptPrefill` (script subtag / A2 class / routing group). No `irPath('header','script')`. (FR-005, FR-006)
- [ ] **T017** Declare `pb_build_list` as a registry-keyed drill-down under the opaque `characters` node behind the mandatory IntroChooser gate (`PhaseB.tsx` ~`744`): `inputs` = CLDR suggestions + base IR seed; output declared as riding on `SurveyPhaseResult.confirmedInventory` (`PhaseB.tsx:610`), **not** a `KeyboardIR` write. (FR-005, FR-007)
- [ ] **T018** Confirm neither `prefill` nor `pb_build_list` is promoted to a first-class manifest entry and no component is wired to resolve as its node (specs 018–021 / Phase 2). (FR-008)

## Group E — Cross-graph C5 resolution (US3, D1-dependent)

- [ ] **T019** Apply the chosen D1 option so manifest-level C5 returns **no spurious orphan** for `prefill`. If D1 unresolved, keep `prefill`'s cross-graph input out of the manifest-level C5 graph (declared as a session input distinct from `irPath()` inputs) so C5 stays green, and leave [NEEDS DECISION: D1] in the spec. (FR-010)
- [ ] **T020** (Option B ONLY) Add the cross-graph / session-derived exemption to manifest-level C5 and the separate question-writer C5 that resolves `iso_code (iso_code.ts:80) → header.bcp47` in the question graph; scope the exemption tightly so a genuine orphan is still flagged RED. (FR-011)

## Group F — Per-step unit tests (mirrored tree, §2.5)

- [ ] **T021** Add per-step well-formedness tests in `packages/studio/tests/survey/questions/{a,b,f}/`: each declared step's `inputs` / `writes` resolve via `irPath()` to existing `KeyboardIR` locations (no new field). (FR-012)
- [ ] **T022** Add the `prefill` input-satisfiability test (read-only; inputs satisfiable per the D1 resolution). (FR-012)
- [ ] **T023** Add the writes-before-inputs / C5-sequencing test: replay the declaration sequence and assert C5 (`runCompleteness`) green after **each** intermediate step — C5 never transiently reds. (FR-009, SC-004)
- [ ] **T024** Add the `header.script` guard test: assert no declaration references `irPath('header','script')`. (FR-004, FR-013)
- [ ] **T025** Add the C7 per-graph reachability assertion per §2.2(b) (editor-steps via `findUnreachable`; survey questions via `resolveNext`). (FR-012, FR-014)

## Group G — Verification (last, per §2.5)

- [ ] **T026** Run studio/contracts `vitest`: C1–C7 green (C7 per-graph), `validateManifestShape()` M2–M6 green, the new per-step tests green, the spec-016 drift bijection green. (SC-006)
- [ ] **T027** Per-surface byte-identical oracle (§2.5): carve/mechanisms/touch emit-byte equivalence; build-list `SurveyPhaseResult` `confirmedInventory` deep-equal; track/prefill flow-routing snapshot unchanged. Physical (R1) and touch (R2/side-car) regression tests stay green (do not regress). (SC-007)
- [ ] **T028** Run `pnpm typecheck` — green. (SC-007)
- [ ] **T029** Run `pnpm depcruise` — green; no new forbidden dependency boundary. (SC-007)
- [ ] **T030** Confirm Phase-1 invariants: no `mutate()` executes, flag stays off, no contracts change, no new write routing; flag-off / runtime / render / emitted-bytes output byte-identical to pre-017 (only diff is the populated declaration arrays + new tests). (FR-015, FR-016, SC-007)
- [ ] **T031** Confirm the [NEEDS DECISION: D1] (cross-graph C5 mechanism) and [NEEDS DECISION: D2] (track branch-selection write) markers are either resolved-and-applied or carried forward explicitly with their recommendations (D1 → Option B; D2 → `writes: []`). (FR-010, FR-016)
</content>
