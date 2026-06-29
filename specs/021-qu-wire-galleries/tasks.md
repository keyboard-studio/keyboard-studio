# Tasks: Wire galleries — carve / mechanisms / touch resolve as first-class map nodes (existing write mechanisms preserved)

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Phase**: 1, spec #7 · **Branch**: `speckit/question-unification-phase1-specs`

Phase-1 invariants in force for every task: **no new write routing** (and no mechanism retired), **no contracts bump**, **behavior byte-identical**, **each gallery appears as a map node**, **read-only / declare-consuming (017 owns the gallery contracts; every write mechanism stays as-is)**, **physical (R1) and touch (R2) are REFERENCE flows — do not regress**, **the touch re-propagation add-on (`reducer.ts:228-243`) stays OFF**.

## A. Dependencies & grounding (read-only verification — do before any change)

- [ ] **T001** Confirm dependency specs have landed: spec 015 (map projection — each gallery gets a rendered node automatically), spec 016 (drift guardrail), and spec 017 (`carve` / `mechanisms` / `touch` `inputs`/`writes` declared). This spec **consumes** 017's declarations; it does NOT declare the galleries. If 017 has not declared them, this spec is **blocked**.
- [ ] **T002** Confirm `carve` / `mechanisms` / `touch` are **already** declared manifest editor-steps: `carveStep` (`registerEditorSteps.ts:107`), `mechanismsStep` (`:121`, `lock:"physical"`, spread `manifest.ts:96-99`), `touchStep` (`:153`, `lock:"touch"`, spread `manifest.ts:109-112`); plus the `touch_seed_source` side-trail (`registerEditorSteps.ts:137`, `spine:false`, `joinTarget:"touch"`). Confirm this spec must NOT add a second declaration or change any entry.
- [ ] **T003** Confirm the **carve** write mechanism (byte-identical baseline): `CarveGallery` uses `useWorkingCopyStore` direct mutators `deleteNode`/`restoreNode`/`deleteItem`/`restoreItem`/`restoreAll`/`keepAll` (`CarveGallery.tsx:28-72`), the deletion overlay over `groups[]`/`stores[]`/`raw[]`, and the undo stack. Record this as the byte-identical baseline; confirm this spec must NOT touch it (no `mutate()`).
- [ ] **T004** Confirm the **physical (R1)** write mechanism (REFERENCE): the `MECHANISMS_STEP_ID` reducer branch fires `deps.lockDesktop()` **unconditionally** (`reducer.ts:222`); `physicalAssignmentsOf` projects assignments. Confirm the flag-gated re-propagation add-on immediately below (`reducer.ts:228-243`) is guarded by `isMutateSeamEnabled() && …` and stays OFF. Record as the byte-identical baseline; confirm this spec must NOT touch it.
- [ ] **T005** Confirm the **touch (R2)** write mechanism (REFERENCE, verified #831 `c9f64ba`): the `TOUCH_STEP_ID` reducer branch fires `deps.buildTouchLayoutJson(...)` / `deps.setTouchLayoutJson(...)` + the `.keyman-touch-layout` side-car **unconditionally** (`reducer.ts:249-277`). Record as the byte-identical baseline; confirm this spec must NOT touch it.
- [ ] **T006** Confirm the SPA render path: `StudioShell` hand-places `<CarveGallery>` / `<MechanismGallery>` / `<TouchGallery>` via the `activeStepId` switch (`StudioShell.tsx:765-797, 908-940`); each `manifest[].component` is unrendered (no `SurveyView`). Confirm this spec must NOT change it.

## B. Reference-flow regression locks (REFERENCE flows first — pin the baseline before any perturbation)

- [ ] **T007** Add the dedicated **physical (R1) don't-regress** test: drive the physical-step completion and assert `lockDesktop()` runs **unconditionally** (flag off), assignments project via `physicalAssignmentsOf` exactly as today, and the emitted `.kmn` bytes are byte-identical to the baseline. REFERENCE — must stay green (FR-006/FR-012/SC-004).
- [ ] **T008** Add the dedicated **touch (R2) don't-regress** test: drive the touch-step completion and assert `buildTouchLayoutJson`/`setTouchLayoutJson` + the `.keyman-touch-layout` side-car run **unconditionally** (flag off), and the emitted `.kmn` bytes AND the side-car bytes are byte-identical to the baseline. REFERENCE — must stay green (FR-007/FR-012/SC-004).
- [ ] **T009** Assert the **touch re-propagation add-on stays OFF**: with `isMutateSeamEnabled()` off, the add-on (`reducer.ts:228-243`) does NOT run; only the unconditional base touch write path fires; the flag-off base path is byte-identical to today (FR-008/SC-005).

## C. Per-surface emit-byte oracle (§2.5, FR-011) — the new cross-gallery artifact

- [ ] **T010** Add the **carve** emit-byte oracle (`flagParity`-style): run a representative carve edit sequence (delete/restore nodes and items) and assert the emitted `.kmn` bytes are byte-identical before/after; confirm carve still routes through its direct store mutators (no `mutate()`) (FR-005/FR-011/SC-003).
- [ ] **T011** Add the **mechanisms** emit-byte oracle: run a representative physical-assignment sequence and assert the emitted `.kmn` bytes are byte-identical before/after (REFERENCE — overlaps T007; keep additive) (FR-006/FR-011/SC-003).
- [ ] **T012** Add the **touch** emit-byte oracle: run a representative touch-assignment sequence and assert both the emitted `.kmn` bytes and the `.keyman-touch-layout` side-car bytes are byte-identical before/after (REFERENCE — overlaps T008; keep additive) (FR-007/FR-011/SC-003).

## D. Map-node confirmation (additive assertions — do NOT repurpose spec-015/016 tests)

- [ ] **T013** Assert the `carve` node resolves on the rendered Flow Map: exactly one `carve` node on the manifest spine after `characters`, sourced from `buildManifestStepGraph()` via the spec-015 adapter (no new declaration), carrying its spec-017 `inputs`/`writes` over `groups[]`/`stores[]`/`raw[]` (`CARVE_WRITES`) (FR-001/FR-004/SC-001/SC-002).
- [ ] **T014** Assert the `mechanisms` node resolves: exactly one `mechanisms` node (`lock:"physical"`, spread `manifest.ts:96-99`), carrying its spec-017 `inputs`/`writes` over `groups[]`/`stores[]` (`ADD_GALLERY_WRITES`) (FR-002/FR-004/SC-001/SC-002).
- [ ] **T015** Assert the `touch` node resolves: exactly one `touch` node (`lock:"touch"`, spread `manifest.ts:109-112`), carrying its spec-017 `inputs`/`writes` over `touchLayout.platforms[].layers[].rows[].keys[]` (`TOUCH_WRITES`); the `touch_seed_source` side-trail (`spine:false`, `joinTarget:"touch"`) is projected as a fork/join into `touch`, not a spine step (FR-003/FR-004/SC-001/SC-002).

## E. Invariant guards (confirm nothing moved into Phase-2 territory)

- [ ] **T016** Confirm **no `mutate()` / no new write routing** for any of the three surfaces, and **no mechanism retired**: carve still uses its direct store mutators (not retired — Phase 2 spec #13); physical still R1 (Phase 2 spec #14, REFERENCE last); touch still R2 (Phase 2 spec #15, REFERENCE last) (FR-009/FR-015/SC-008).
- [ ] **T017** Confirm **no `@keyboard-studio/contracts` bump** and **no new `KeyboardIR` field**: every declared path is an existing location (touch already first-class via #825, 0.13.0) (FR-015/SC-008).
- [ ] **T018** Confirm the **SPA render path is unchanged** — `StudioShell` hand-places all three galleries via `activeStepId`; each `manifest[].component` stays unrendered; each gallery's render is byte-identical (FR-010/SC-006).
- [ ] **T019** Confirm **no re-declaration** — exactly one declaration per gallery (`registerEditorSteps.ts:107/121/153`) and one manifest entry each; this spec added none (FR-001–FR-003/FR-015).
- [ ] **T020** Confirm the **touch re-propagation add-on remains OFF** and was not enabled or anticipated; `isMutateSeamEnabled()` is untouched (FR-008/SC-005).

## F. Verification gate (run last)

- [ ] **T021** Run the spec-016 **drift guardrail** with the three galleries resolving as their nodes; confirm **green** — each is a reached manifest step with a rendered node (no orphan, no uncovered step) (FR-013/SC-007).
- [ ] **T022** `pnpm typecheck` — green (SC-008).
- [ ] **T023** Studio + contracts `vitest` — green, including the per-surface emit-byte oracle (T010–T012) and the dedicated R1/R2 don't-regress locks (T007–T009); the spec-015 map-projection and spec-016 drift-guardrail tests still pass (FR-011/FR-012/FR-014/SC-003/SC-004/SC-008).
- [ ] **T024** `pnpm depcruise` — green; assert **no new `dashboard → stores` or `dashboard → editors` edge** (FR-014/SC-008).
- [ ] **T025** Flag-off / byte-identical check — with `SHOW_FLOWMAP` off, `FlowMapView` does not mount; the SPA still hand-places all three galleries and each write mechanism fires identically; confirm emitted `.kmn` (+ touch side-car) bytes are byte-identical in any flag state (FR-010/SC-003/SC-006).
- [ ] **T026** Manual dev-build smoke (flag on): open the Flow Map → Survey flow tab; confirm the `carve`, `mechanisms` (`lock:"physical"`) and `touch` (`lock:"touch"`) nodes render in declared order with their declared `inputs`/`writes`, and the `touch_seed_source` fork/join into `touch`; then run a carve edit, a physical assignment, and a touch assignment in the SPA and confirm each emits identical bytes to today (SC-001/SC-002/SC-003).
