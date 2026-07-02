# Tasks: Library demote — `pb_*` battery + full Phase A to reserve/library under the no-delete guardrail

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Phase**: 1, spec #8 (final) · **Branch**: `speckit/question-unification-phase1-specs`

Phase-1 invariants in force for every task: **no new write routing / no `mutate()`** (demotion is a flow-membership edit; the default path's `SurveyPhaseResult.confirmedInventory` output is untouched), **no contracts bump** (reuse `computeReserveNodes` / `buildModularFlowGraph` / registry shapes + the existing `provenance.orthographyUrl` field), **default-path behavior byte-identical** (`selectStrategy` output unchanged on the default build-list path), **demoted steps appear as reserve map nodes** (`computeReserveNodes`, `kind:"library-not-in-flow"`), **no-delete (modules stay registered + on disk + test-covered; nothing deleted/unregistered; no `PhaseA` revival into `StudioShell`)**.

## A. Dependencies & baselines (read-only verification + pin baselines — do before any change)

- [ ] **T001** Confirm dependency specs have landed: spec 015 (map projection — reserve nodes render through the `buildModularFlowGraph` modular path), spec 016 (drift guardrail — the rendered ⟺ runtime bijection the demotion must keep green with demoted modules as **reserve, not orphan**), and spec 020 (build-list wiring — the default build-list branch off the **same** mandatory IntroChooser gate the `pb_*` battery is demoted off of). This spec **consumes** those; if any is not landed, this spec is **blocked**.
- [ ] **T002** Confirm `computeReserveNodes` (`dashboard/buildStepGraph.ts:150-182`) is the demotion render mechanism and is **currently empty** (`reserveIds = Object.keys(registry).filter((id) => !liveIds.has(id))`, `buildStepGraph.ts:158`; every registered module is in some YAML — findings (a)). Confirm removing an id from a YAML's active ordering moves it into `reserveIds` automatically (no `computeReserveNodes` code change needed).
- [ ] **T003** Confirm the demotion targets: the `pb_*` step-by-step battery (55 modules, `content/flows/phase_b_characters.modular.yaml`) and the full non-identity Phase A (15 identity + 15 `provenance_*`, `content/flows/phase_a_identity.modular.yaml`, orphaned — `StudioShell.tsx:18` never imports `PhaseA`). Confirm `identity_lite` is canonical.
- [ ] **T004** Confirm the strategy-axis chain: the `pb_*` battery is the **sole runtime elicitor** of A1 (`pb_char_count.ts:63-66`), A3 (`pb_typing_approach.ts:69-72`), A4 (`pb_stacking_marks.ts:44` / `pb_mark_input_order`) onto `SurveyPhaseResult.computedAxes` (`surveyPhaseResult.ts:50`) → `selectStrategy` (`browserPatternLibrary.ts:160`); the default `BuildListView` leaves A1/A3/A4 **unelicited today** (collects `confirmedInventory` only) — the gap is **pre-existing on the default path**.
- [ ] **T005** **Pin the §7.5 default-path baseline (BEFORE the membership edit):** capture the `selectStrategy` output (recommended primary + secondaries) for the default build-list path on the §7.5 exemplar rows (A1/A3/A4 unelicited → default-filled from the script-class prior, recorded as `axisFills`). This is the pre-demotion reference for the regression lock.
- [ ] **T006** **Pin the `orthographyUrl` baseline:** confirm where `orthographyUrl` is captured today (reference: `PhaseA.tsx:163-164`, reusing `provenance.orthographyUrl`, `packages/contracts/src/provenance.ts`) and whether `identity_lite` / the documentation stage already captures it. Record the byte-identical baseline.

## B. The demotion (flow-membership edit — the demotion proper)

- [ ] ~~**T007** Take the `pb_*` battery off the default spine.~~ **STRUCK (Amendment 2026-06-29, approved Matt + km-verification + km-domain).** The `pb_*` battery stays a **live, reachable, non-default branch** off the mandatory IntroChooser gate — NOT library content. Removing it from `phase_b_characters.modular.yaml` is an internal contradiction against the landed 015/016 model (reserve = `registry − reachable`) and empirically turns `buildStepGraph.test.ts` (`danglingTargets === []`) and the spec-016 `driftGuardrail.test.ts` bijection RED, and breaks the live manual path. Any `pb_*` re-ordering is DEFERRED to the Phase-2 per-element loop. **No `phase_b_characters.modular.yaml` edit.**
- [x] **T008 (DONE)** Take the **full non-identity Phase A** out of the **active flow-source set** so all 15 identity + 15 `provenance_*` modules become **registry-only reserve** (FR-001). Mechanism (landed): drop the `phase_a_identity.modular.yaml` entry (and its `?raw` import) from `renderedNodeSet.ts` `FLOW_SOURCES` (NOT emptying `questions[]` — `loadModularFlow` throws on empty, and `ALL_FLOWS` / `flow-parity` snapshot would break). `identity_lite` is canonical. Did NOT wire `PhaseA` into `StudioShell` (`StudioShell.tsx:18`) — the revival alternative is rejected (FR-001/FR-011). **I-2 RESOLVED:** the collision with spec-017's prefill anchor (`registryKey: "primary_script"`) was fixed by re-anchoring 017's prefill drill-down to the LIVE `il_target_script` (`drillDownDeclarations.ts`) and updating `prefill.test.ts` FR-014 §2.2(b) to assert the live anchor reachable + `primary_script` unreachable. Verified via `collectRenderedNodeIds`: the 30 Phase-A ids (incl. `primary_script`) are no longer rendered/reachable.
- [x] **T009 (DONE)** Confirmed the demotion did **not** touch any module `.ts` file or any sub-registry entry (`registry.a.ts` / `registry.b.ts` / `registry.ts`) — it is a flow-source-membership change only (no-delete; FR-004). The 30 modules stay registered + on disk + test-covered (`noDeleteGuardrail.test.ts`).

## C. No-delete CI assertion (§4, FR-004/FR-005) — the first new artifact

- [ ] **T010** Add the no-delete CI assertion test (`packages/studio/src/survey/questions/noDeleteGuardrail.test.ts`, or co-located with `registry.test.ts` / the manifest-shape + completeness guards per §2.5). For every demoted `pb_*` and Phase A id, assert it is a **key in its sub-registry** (`questionRegistry` via `registry.b.ts` / `registry.a.ts`) (FR-004/FR-005).
- [ ] **T011** Assert each demoted id **resolves to a module on disk** (the static sub-registry import proves on-disk presence; a missing file fails the import at build) and **remains test-covered** (a colocated spec exists in the mirrored tree) (FR-004/FR-005).
- [ ] **T012** Demonstrate the **RED case**: locally delete a demoted module file (or remove a sub-registry entry) and confirm the assertion **fails**; restore and confirm it returns to **green** (SC-003).

## D. Strategy-axis regression lock (§2.3, FR-006/FR-007) — the second new artifact

- [ ] **T013** Add / extend the **§7.5 strategy-axis regression lock** (co-locate with the existing strategy-selection exemplar tests, e.g. alongside `browserPatternLibrary` / the engine `strategy-selector` exemplars): run the §7.5 exemplar rows for the **default build-list path** (A1/A3/A4 unelicited → default-filled from the script-class prior, recorded as `axisFills`) (FR-006/FR-007).
- [ ] **T014** Assert `selectStrategy` output (recommended primary + secondaries) is **identical** to the T005 pre-demotion baseline on **every** §7.5 exemplar row — the demotion removes only the *non-default* `pb_*` elicitation path the default path never traversed, so it is **not a regression** (FR-006/FR-007/SC-004).
- [ ] **T015** Confirm the gap (A1/A3/A4 default-filled, `axisFills`-recorded) is the **same** gap that exists on today's default path — demotion neither introduces nor widens it; per-character re-elicitation (D2) is **deferred to Phase 2** and is NOT added here (FR-007).

## E. `orthographyUrl` retention (§2.3 Phase-A provenance caveat, FR-008) — DEFERRED

> **DEFERRED (Matt-approved):** `orthographyUrl` (`provenance_orthography_url`) was only
> ever captured on the now-demoted **Phase A** path — it is NOT on the live
> `identity_lite.modular.yaml` flow and was never consumed by
> `StudioShell.contextFromIdentity`. Demoting Phase A therefore loses **no live capture**.
> Genuinely capturing it on the live survey needs a **new live orthography-URL question**,
> which is out of scope for this demotion spec. T016/T017 are **NOT done here** — no inert
> capture code is shipped; deferred to the future question-revival work.

- [ ] ~~**T016** Retain `orthographyUrl` capture on the canonical surface.~~ **DEFERRED** (FR-008) — was never on the live path; live capture needs a new live question, out of scope. No inert code shipped.
- [ ] ~~**T017** Add the retention test.~~ **DEFERRED** (FR-008) — a meaningful test requires a live capture surface that does not exist yet; a synthetic-input test would be a false "real default-path" claim, so it is not added.

## F. Reserve-node + reachability confirmation (additive assertions — do NOT repurpose spec-015/016 tests)

- [ ] **T018** Assert the demoted `pb_*` (off-branch) and full Phase A modules render as **reserve nodes** via `computeReserveNodes` (`kind:"library-not-in-flow"`, `region:"not-yet-ordered"`, `isTerminal:true`) on the `buildModularFlowGraph` registry-vs-YAML diff path — present on the Flow Map, **absent from the active default ordering** (FR-001/FR-003/SC-001).
- [ ] **T019** Assert the `pb_*` battery stays **reachable** via the mandatory IntroChooser gate (the step-by-step branch); confirm **no auto-default** skipping the gate was introduced; it is unreachable on the **default spine only** (FR-002/SC-002).

## G. Invariant guards (confirm nothing moved into deletion / Phase-2 / revival territory)

- [ ] **T020** Confirm **no deletion / no unregistration** — every demoted `pb_*` and Phase A id is still registered, on disk, and test-covered (no-delete §4); demotion is a flow-membership edit only (FR-004/FR-011/SC-007).
- [ ] **T021** Confirm **no `PhaseA` revival** — `StudioShell.tsx:18` is untouched; the revival alternative is rejected (FR-001/FR-011/SC-007).
- [ ] **T022** Confirm **no new write routing / no `mutate()` / no `KeyboardIR` write** and **no contracts bump** — the demotion touches no reducer/store/IR path; the `orthographyUrl` retention reuses the existing provenance field (FR-008/FR-011/SC-007).
- [ ] **T023** Confirm **no non-Latin default flip** — Phase 1 does not flip any non-Latin default to a path that drops the script-specific mark/joining/order sub-series; the non-Latin precondition (D1) is carried as a documented Phase-2 gate, not actioned here (FR-011).

## H. Verification gate (run last)

- [ ] **T024** Run the spec-016 **drift guardrail**; confirm **green** — demoted-but-registered modules are **reserve** (rendered by `computeReserveNodes`), NOT **orphan**; the rendered ⟺ runtime bijection holds over the **reachable** set (a registered-but-unreachable reserve module is rendered by the separate reserve mechanism — 016 edge case) (FR-009/FR-010/SC-006).
- [ ] **T025** Confirm the **no-delete CI assertion** (T010–T012) and the **§7.5 strategy-axis lock** (T013–T014) both stay **green** (FR-005/FR-006/FR-010/SC-003/SC-004).
- [ ] **T026** `pnpm typecheck` — green (SC-007).
- [ ] **T027** Studio + contracts `vitest` — green, including the no-delete assertion (T010–T012) and the §7.5 strategy-axis lock (T013–T015); the spec-015 map-projection, spec-016 drift-guardrail, and spec-017 prefill (re-anchored) tests still pass (FR-010/SC-003/SC-004/SC-006). (FR-008 `orthographyUrl` retention test is DEFERRED — not added; see §E.)
- [ ] **T028** `pnpm depcruise` — green; assert **no new `dashboard → stores` or `dashboard → editors` edge** (FR-010/SC-007).
- [ ] **T029** Flag-off / byte-identical check — with `SHOW_FLOWMAP` off (`StudioShell.tsx:84`), `FlowMapView` does not mount; the SPA still hand-places the live components and the default-path behavior (build-list inventory, `selectStrategy` output) is byte-identical to today; confirm the no-delete CI assertion is flag-independent and still runs (FR-010/SC-004). (No `orthographyUrl` live-capture exists to change — FR-008 deferred.)
- [ ] **T030** Manual dev-build smoke (flag on): open the Flow Map → Survey flow tab; confirm the full Phase A renders as reserve nodes (`library-not-in-flow`) absent from the active default ordering, while the `pb_*` battery stays a live reachable non-default branch off the IntroChooser gate (pb_* NOT demoted — Amendment); confirm the default build-list path's strategy output is unchanged (SC-001/SC-002/SC-004).
