# Feature Specification: Wire galleries — carve / mechanisms / touch resolve as first-class map nodes (existing write mechanisms preserved)

**Feature Branch**: `speckit/question-unification-phase1-specs`

**Created**: 2026-06-29

**Status**: **Ready for planning** — Phase 1, spec #7 of the Question Unification migration. Read-only / declare-consuming wiring of three **already-declared** manifest editor-steps. No contracts bump, no new write routing, no SPA render change, behavior byte-identical. **Two of the three flows (mechanisms / physical R1 and touch R2) are KNOWN-GOOD REFERENCE flows that MUST NOT regress.**

**Input**: Spec #7 (`qu-wire-galleries`) of [docs/design-notes/question-unification-migration-plan.md](../../docs/design-notes/question-unification-migration-plan.md) (§2.1 carve / mechanisms / touch rows; §2.4 step 4 "Wire each component step"; §2.5 per-surface emit-byte oracle + don't-regress physical/touch; §4 no-break constraints; §5 spec #7; findings (b) gallery rows + (c) touch-vs-physical verdict). Make the `carve` (`CarveGallery`), `mechanisms` (`MechanismGallery`, physical) and `touch` (`TouchGallery`) editor-steps resolve as first-class manifest map nodes on the developer Flow Map, with their declared `inputs`/`writes` (populated by spec 017) showing on each node, while each gallery's **current write mechanism is preserved unchanged**: carve via direct store mutators (`CarveGallery.tsx:28-72`); physical via R1 `lockDesktop()` running unconditionally (`reducer.ts:222`); touch via R2 `buildTouchLayoutJson`/`setTouchLayoutJson` + `.keyman-touch-layout` side-car running unconditionally (`reducer.ts:249-277`).

**Governing scope**: This feature implements **Phase 1 spec #7** of the Question Unification migration ([docs/design-notes/question-unification-migration-plan.md](../../docs/design-notes/question-unification-migration-plan.md) §2.1 carve / mechanisms / touch rows, §2.4 step 4). It does **not** re-derive that scope. The companion research is recorded in [docs/design-notes/question-unification-findings.md](../../docs/design-notes/question-unification-findings.md) (findings (b) carve / mechanisms / touch rows; finding (c): "touch works end-to-end — it is a known-good reference flow, NOT a risk"). It depends on the map projection (spec 015), the drift guardrail (spec 016), and the declared `inputs`/`writes` for `carve` / `mechanisms` / `touch` (spec 017).

> **Reference-flow safety (load-bearing — do not blur).** Physical (R1 `lockDesktop()`, `reducer.ts:222`) and touch (R2 `buildTouchLayoutJson`/side-car, `reducer.ts:249-277`; verified end-to-end #831 `c9f64ba`) are **known-good reference flows** — the target shape every other flow should match, NOT flows to re-architect (§4, findings (c)). Both base write paths run **unconditionally** today. This spec gains them a map node and **must never destabilize them to unblock another flow**. The **flag-gated touch re-propagation add-on** (`reducer.ts:228-243`) stays **OFF** in Phase 1 (it is an optional enhancement over the working base flow, gated on `isMutateSeamEnabled()`); only the unconditional base touch write path runs, exactly as today.

> **Phase-1 vs Phase-2 boundary (load-bearing — do not blur).** "Resolve as a first-class map node" in Phase 1 means only that **the map node exists and the 017 contract is declared on it** — the SPA render path is untouched: `StudioShell` continues to hand-place `CarveGallery` / `MechanismGallery` / `TouchGallery` via its `activeStepId` switch (`StudioShell.tsx:765-797, 908-940`); `manifest[].component` remains unrendered (there is no `SurveyView`). Routing the galleries through `mutate()` — carve overlay (R1, highest-effort) and physical/touch (REFERENCE, converted LAST) — is **Phase 2** (specs #13 `qu-mutate-carve`, #14 `qu-mutate-mechanisms`, #15 `qu-mutate-touch`). No per-key loop or per-element decomposition happens here (Phase 2). `mutate()` is NOT introduced as a live write path for any of these three surfaces.

> **Note on technical content in this spec (deliberate).** Per repository convention — where `packages/studio/src/steps/` manifest types, `packages/studio/src/dashboard/` graph-model types and the `packages/studio/src/steps/editorMutate.ts` containment sets are architectural contracts and the extracted `specs/NNN/` folders carry real material — the non-obvious constraints (the existing manifest declarations at `registerEditorSteps.ts:107/121/153`, the locks `manifest.ts:96-99`/`109-112`, the three preserved write mechanisms, the per-surface emit-byte oracle, the dedicated R1/R2 don't-regress locks) are specified here as Functional Requirements and Success Criteria. The *mechanics* (the exact `flagParity`-style harness, the precise drill-down nesting) remain plan-level.

## Phase-1 invariants (thread through every requirement)

- **No new write routing.** This spec introduces no IR write path and retires none. Carve keeps its direct store mutators (`deleteNode`/`restoreNode`/`deleteItem`/`restoreItem`/`restoreAll`/`keepAll`, `CarveGallery.tsx:28-72`) + undo stack; physical keeps R1 `lockDesktop()` running unconditionally (`reducer.ts:222`); touch keeps R2 `buildTouchLayoutJson`/`setTouchLayoutJson` + side-car running unconditionally (`reducer.ts:249-277`). `mutate()` is NOT introduced for any of the three surfaces. Routing through `mutate()` is Phase 2 (specs #13/#14/#15).
- **No contracts bump.** This spec reuses existing manifest/`EditorStep` shapes and existing `KeyboardIR` locations. Touch is already first-class (#825, `@keyboard-studio/contracts` 0.13.0) — reuse the existing `touchLayout.platforms[].layers[].rows[].keys[]` location, no new bump. No new `KeyboardIR` field, no `@keyboard-studio/contracts` change, no §18 sign-off.
- **Behavior byte-identical.** Each gallery emits the same `.kmn` bytes (and, for touch, the same `.keyman-touch-layout` side-car) before and after; the SPA render of each gallery is byte-identical; the physical (R1) and touch (R2) reference flows are unchanged.
- **Step appears as a map node.** The `carve` / `mechanisms` / `touch` nodes appear as first-class manifest nodes on the rendered Flow Map (automatically, once foundation (a)/spec 015 has landed — all three are already manifest entries), each carrying its spec-017 `inputs`/`writes`.
- **Read-only / declare-consuming as applicable.** This spec adds no declaration of its own — the galleries' `inputs`/`writes` are declared by spec 017. It only confirms each node resolves with that contract populated and that each write mechanism is unchanged.

## Clarifications

### Session 2026-06-29

Phase 1 scope was confirmed by Matt (2026-06-29, migration-plan §6): Phase 1 only specs converting the custom/bespoke flow stages into opaque "questions" with valid inputs and outputs. For this spec there are **no `[NEEDS CLARIFICATION]` markers** — the contract decisions are deferred deliberately by phase boundary, not left ambiguous:

- **Routing the galleries through `mutate()` is Phase 2, not a Phase-1 decision.** Carve-overlay-through-`mutate()` (R1), physical-last and touch-last (REFERENCE) are §6-item-4 per-component contracts choices **DEFERRED to the post-Phase-1 developer decision**. Phase 1 keeps all three write mechanisms exactly as today. This is a phase boundary, not a `[NEEDS DECISION]` blocking this spec.
- **The touch re-propagation add-on stays OFF.** `reducer.ts:228-243` is the optional automatic physical→touch re-propagation, gated on `isMutateSeamEnabled()`; the flag stays off in Phase 1, so it never runs. Only the unconditional base touch write path (R2) runs.

No `[NEEDS CLARIFICATION]` markers remain.

## User Scenarios & Testing *(mandatory)*

> The "users" here are the studio engineer reading the developer Flow Map (who gains three visible, contract-declared gallery nodes for the mature Form-4 experiences that were hidden component steps) and the studio engineer who relies on the known-good physical (R1) and touch (R2) reference flows never being destabilized while they gain map nodes. Each story is independently testable and independently valuable.

### User Story 1 - The carve, mechanisms, and touch galleries appear as first-class nodes on the flow map (Priority: P1)

As a keyboard author (via the studio engineer reading the developer Flow Map), I want the carve, mechanisms, and touch galleries to appear as **first-class nodes** on the flow map, with their declared `inputs`/`writes` populated, so that the mature gallery experiences are visible in the flow instead of being hidden component steps.

**Why this priority**: This is the headline deliverable. Today the three galleries are manifest editor-steps with no rendered map node (findings (b): "mature & live; component"); the "stub (gallery / wizard step)" legend swatch is dead because nothing emits a node for them. With the map projection (015) landed, `carve` / `mechanisms` / `touch` — all already manifest entries (`registerEditorSteps.ts:107/121/153`) — automatically get nodes; with the declared contract (017) populated, each node carries its `inputs`/`writes`. This spec confirms both, making the mature gallery experiences visible in the flow.

**Independent Test**: With the dev flowmap flag (`SHOW_FLOWMAP`) on, render the Flow Map; confirm there is exactly one `carve` node, one `mechanisms` node (`lock:"physical"`), and one `touch` node (`lock:"touch"`) on the manifest spine in their declared order, each sourced from `buildManifestStepGraph()` via the spec-015 adapter, and each carrying its declared `inputs`/`writes` (from spec 017).

**Acceptance Scenarios**:

1. **Given** the map projection (spec 015) is active, **When** the Flow Map renders, **Then** the `carve` node appears as a first-class node on the manifest spine after `characters`, sourced from `buildManifestStepGraph()` via the adapter (it is already a manifest entry — no new declaration), carrying its spec-017 `inputs` (the `groups[]`/`stores[]`/`raw[]` the deletion overlay reads) and `writes` (`groups[]`/`stores[]`/`raw[]`, matching `CARVE_WRITES`).
2. **Given** the map projection, **When** the Flow Map renders, **Then** the `mechanisms` node appears as a first-class node (`lock:"physical"`, the spread at `manifest.ts:96-99`), carrying its spec-017 `inputs` (base layout `groups[]`/`stores[]` + gallery assignments) and `writes` (physical assignments → `groups[]`/`stores[]`, matching `ADD_GALLERY_WRITES`).
3. **Given** the map projection, **When** the Flow Map renders, **Then** the `touch` node appears as a first-class node (`lock:"touch"`, the spread at `manifest.ts:109-112`), carrying its spec-017 `inputs` (locked physical layout seed + gallery touch assignments) and `writes` (`touchLayout.platforms[].layers[].rows[].keys[]`, matching `TOUCH_WRITES`); the `touch_seed_source` side-trail (`spine:false`, `joinTarget:"touch"`) is projected as a fork/join, not as a spine step.

---

### User Story 2 - Each gallery's existing write mechanism is preserved byte-for-byte while it gains a map node (Priority: P1)

As a studio engineer, I want the galleries' existing write mechanisms preserved byte-for-byte while they gain map nodes, so that the known-good physical (R1) and touch (R2) reference flows are never destabilized.

**Why this priority**: This is the safety guarantee that makes the wiring shippable. Physical and touch are reference flows (findings (c); §4 no-break constraints) — the target shape, converted LAST, never destabilized to unblock another flow. Carve, while not a reference flow, must also emit identical bytes. If Phase 1 touched any write path, the "map node appears" change and a behavior change would be entangled, and the Phase-2 `mutate()` migration (specs #13/#14/#15) would have no byte-identical baseline to parity-prove against. It is P1 because it is the same deliverable as US1 from the behavior side and is the cheapest regression lock on the three flows.

**Independent Test**: For each of carve / mechanisms / touch, run the same edit sequence through the existing flow and assert the emitted `.kmn` bytes are identical before and after this spec lands (the §2.5 per-surface emit-byte / `flagParity`-style oracle); for touch additionally assert the `.keyman-touch-layout` side-car bytes are identical. Confirm carve still calls its direct store mutators (`deleteNode`/`restoreNode`/`deleteItem`/`restoreItem`/`restoreAll`/`keepAll`), physical still fires R1 `lockDesktop()` unconditionally, and touch still fires R2 `buildTouchLayoutJson`/`setTouchLayoutJson` unconditionally.

**Acceptance Scenarios**:

1. **Given** the carve gallery, **When** the author deletes/restores nodes and items, **Then** carve still mutates via its **direct store mutators** (`deleteNode`/`restoreNode`/`deleteItem`/`restoreItem`/`restoreAll`/`keepAll`, `CarveGallery.tsx:28-72`) and its undo stack; the deletion overlay over `groups[]`/`stores[]`/`raw[]` is unchanged; the emitted `.kmn` bytes are byte-identical to before (no `mutate()` is introduced).
2. **Given** the mechanisms (physical) gallery, **When** the physical step completes, **Then** R1 `lockDesktop()` still runs **unconditionally** (`reducer.ts:222`); the physical assignments are projected by `physicalAssignmentsOf` exactly as today; the emitted `.kmn` bytes are byte-identical (REFERENCE / known-good — do not regress).
3. **Given** the touch gallery, **When** the touch step completes, **Then** R2 `buildTouchLayoutJson`/`setTouchLayoutJson` + the `.keyman-touch-layout` side-car still run **unconditionally** (`reducer.ts:249-277`); the emitted `.kmn` bytes AND the side-car bytes are byte-identical (REFERENCE / known-good, verified #831 `c9f64ba` — do not regress).
4. **Given** the flag-gated touch re-propagation add-on (`reducer.ts:228-243`), **When** the physical step completes in Phase 1, **Then** it does **NOT** run (`isMutateSeamEnabled()` is off); only the unconditional base touch write path runs, exactly as today.

---

### User Story 3 - The wiring stays green under the drift guardrail and the full gate (Priority: P2)

A studio engineer can ship this wiring with the drift guardrail (spec 016) staying green with the three galleries resolving as manifest nodes, and with `pnpm typecheck` + vitest + `pnpm depcruise` all green.

**Why this priority**: The drift guardrail (016) enforces the rendered-graph ⟺ manifest+`questionRegistry`-runtime bijection; `carve` / `mechanisms` / `touch` resolving as nodes must keep that bijection satisfied (each is an existing manifest step the runtime reaches, so each must keep a rendered node). It is P2 because it is a non-functional guard on US1–US2 rather than a user-visible behavior, but it is the gate that proves the wiring did not introduce drift.

**Independent Test**: Run the drift guardrail (spec 016) with all three galleries resolving as their nodes; confirm green (each manifest step has a rendered node; the negative test stays red only for a deliberately-uncovered step). Run `pnpm typecheck`, the studio + contracts vitest suites (including the dedicated R1/R2 don't-regress locks), and `pnpm depcruise`; confirm green with no new `dashboard → stores` or `dashboard → editors` edge.

**Acceptance Scenarios**:

1. **Given** the three galleries resolving as their nodes, **When** the drift guardrail (spec 016) runs, **Then** it stays green — each is a manifest step the runtime reaches and each has a rendered node (no orphan, no uncovered step).
2. **Given** the full gate, **When** `pnpm typecheck` + studio/contracts vitest + `pnpm depcruise` run, **Then** all are green, with no new `dashboard → stores` or `dashboard → editors` edge.
3. **Given** the dedicated physical (R1) and touch (R2/side-car) don't-regress tests, **When** the suite runs in CI, **Then** both stay green; neither reference flow is destabilized.

---

### Edge Cases

- **Flag off entirely**: the developer Flow Map (`FlowMapView`) does not mount (per `SHOW_FLOWMAP`, `StudioShell.tsx:84`), so no projection runs; the SPA still hand-places all three galleries and each write mechanism fires identically. Output (emitted `.kmn` + side-car) is byte-identical to today.
- **Galleries are already declared — this spec does not re-declare them**: `carve` (`registerEditorSteps.ts:107`), `mechanisms` (`:121`, `lock:"physical"`), `touch` (`:153`, `lock:"touch"`) all exist; their `inputs`/`writes` are populated by **spec 017**. This spec MUST NOT add a second declaration or change a manifest entry — it only confirms each node resolves with the 017 contract.
- **Touch re-propagation add-on**: `reducer.ts:228-243` is gated on `isMutateSeamEnabled()` and stays OFF in Phase 1; the spec must not flip the flag or anticipate the Phase-2 add-on. A test asserts the base touch write path is byte-identical with the flag off.
- **No `mutate()` for any gallery**: carve's direct mutators are NOT retired (Phase 2, spec #13); physical/touch are NOT routed through `mutate()` (Phase 2, specs #14/#15, REFERENCE, converted LAST). A repo audit asserts no `mutate()` route was added for any of the three surfaces.
- **`touch_seed_source` is `spine:false`**: it is projected as a fork node joining `touch` (`joinTarget:"touch"`), not as a spine step — per the existing `buildManifestStepGraph` fork/join edge rules.
- **Carve byte-identity has no IR re-projection**: carve writes via the deletion overlay over `groups[]`/`stores[]`/`raw[]`; the oracle compares emitted `.kmn` bytes (the §2.5 IR/emit-writing-surface oracle), not a separate overlay snapshot.
- **Component resolution by manifest is out of scope**: `manifest[].component` for each gallery stays unrendered; any move to render a gallery from the manifest is a Phase-2 user-facing render change requiring parity proof (§2.4 step 4).
- **No per-key loop / per-element decomposition**: the galleries stay opaque whole-surface writers in Phase 1; per-key loops are Phase 2 (§3.2), gated on the loop-primitive build decision (§6).

## Requirements *(mandatory)*

### Functional Requirements

**The gallery nodes resolve on the map (US1)**

- **FR-001**: The `carve` editor-step (already declared — `registerEditorSteps.ts:107`, on the manifest spine after `characters`) MUST resolve as a **first-class node on the rendered Flow Map** once foundation (a) / spec 015 has landed. This spec MUST NOT add a new manifest entry or a second declaration of `carve`; it relies on the existing entry being projected by the map adapter.
- **FR-002**: The `mechanisms` editor-step (already declared — `registerEditorSteps.ts:121`, `lock:"physical"`, the spread at `manifest.ts:96-99`) MUST resolve as a **first-class node** on the map, carrying its spec-017 contract. This spec MUST NOT re-declare it.
- **FR-003**: The `touch` editor-step (already declared — `registerEditorSteps.ts:153`, `lock:"touch"`, the spread at `manifest.ts:109-112`) MUST resolve as a **first-class node** on the map, carrying its spec-017 contract, with the `touch_seed_source` side-trail (`spine:false`, `joinTarget:"touch"`) projected as a fork/join. This spec MUST NOT re-declare it.
- **FR-004**: Each gallery node MUST render with its declared `inputs`/`writes` (populated by spec 017) **populated on the node** — `carve` → `inputs`/`writes` over `groups[]`/`stores[]`/`raw[]` (`CARVE_WRITES`); `mechanisms` → `writes` over `groups[]`/`stores[]` (`ADD_GALLERY_WRITES`); `touch` → `writes` over `touchLayout.platforms[].layers[].rows[].keys[]` (`TOUCH_WRITES`). All are existing `KeyboardIR` locations expressible via `irPath()`; no new field.

**Each write mechanism is preserved byte-for-byte (US2)**

- **FR-005**: The `carve` write mechanism MUST be preserved byte-identically: `CarveGallery` keeps its **direct store mutators** (`deleteNode`/`restoreNode`/`deleteItem`/`restoreItem`/`restoreAll`/`keepAll`, `CarveGallery.tsx:28-72`) and its undo stack; the deletion overlay over `groups[]`/`stores[]`/`raw[]` is unchanged. No `mutate()` is introduced for carve (that is Phase 2 spec #13).
- **FR-006**: The `mechanisms` (physical) write mechanism MUST be preserved byte-identically: R1 `lockDesktop()` MUST continue to run **unconditionally** (`reducer.ts:222`); `physicalAssignmentsOf` projects assignments exactly as today. **REFERENCE / known-good — do not regress.** No `mutate()` is introduced for physical (that is Phase 2 spec #14, converted LAST).
- **FR-007**: The `touch` write mechanism MUST be preserved byte-identically: R2 `buildTouchLayoutJson`/`setTouchLayoutJson` + the shipped `.keyman-touch-layout` side-car MUST continue to run **unconditionally** (`reducer.ts:249-277`). **REFERENCE / known-good (verified #831 `c9f64ba`) — do not regress.** No `mutate()` is introduced for touch (that is Phase 2 spec #15, converted LAST).
- **FR-008**: The flag-gated touch re-propagation add-on (`reducer.ts:228-243`) MUST remain **OFF** in Phase 1 (`isMutateSeamEnabled()` off); it MUST NOT run, and only the unconditional base touch write path (R2) runs, exactly as today. This spec MUST NOT flip the flag.
- **FR-009**: This spec MUST introduce **no new write routing** and retire **no** existing mechanism: no `mutate()` route is added for any of the three surfaces; carve's direct mutators are NOT retired (Phase 2 spec #13); physical/touch are NOT routed through `mutate()` (Phase 2 specs #14/#15).

**The SPA render path is unchanged (US1/US2)**

- **FR-010**: The **SPA render path MUST be unchanged**: `StudioShell` MUST continue to hand-place `<CarveGallery>` / `<MechanismGallery>` / `<TouchGallery>` via its `activeStepId` switch (`StudioShell.tsx:765-797, 908-940`); `manifest[].component` for each gallery MUST remain unrendered (there is no `SurveyView`). Each gallery's render MUST be byte-identical to today.

**Per-surface emit-byte oracle (§2.5, US2)**

- **FR-011**: A **per-surface emit-byte equivalence oracle** (migration-plan §2.5 IR/emit-writing surfaces; `flagParity`-style, comparing emitted `.kmn` bytes) MUST assert that the emitted `.kmn` bytes are **byte-identical before/after** for `carve`, `mechanisms`, and `touch`. For `touch`, the oracle MUST additionally assert the `.keyman-touch-layout` side-car bytes are byte-identical (the R2 output, #831).
- **FR-012**: **Dedicated don't-regress tests** MUST lock the current physical (R1 `lockDesktop()` unconditional) and touch (R2 `buildTouchLayoutJson`/side-car unconditional) output **green**, asserting the flag-off base path runs and the add-on (`reducer.ts:228-243`) does not. Both reference flows MUST stay green; neither is destabilized.

**Guardrail & gate (US3)**

- **FR-013**: The drift guardrail (spec 016) MUST stay **green** with `carve` / `mechanisms` / `touch` resolving as their nodes — each is a manifest step the runtime reaches and MUST have a rendered node (no orphan, no uncovered step).
- **FR-014**: `pnpm typecheck` + studio/contracts `vitest` + `pnpm depcruise` MUST be **green**, with no new `dashboard → stores` or `dashboard → editors` edge introduced.

**Out of scope (explicit non-goals)**

- **FR-015**: This feature MUST NOT: introduce `mutate()` or any new write routing for any of the three surfaces; retire carve's direct store mutators (Phase 2 spec #13); route physical/touch through `mutate()` (Phase 2 specs #14/#15); flip `isMutateSeamEnabled()` or run the touch re-propagation add-on (`reducer.ts:228-243`); touch the SPA render path (StudioShell keeps hand-placing all three galleries; `manifest[].component` stays unrendered); bump `@keyboard-studio/contracts` or add a `KeyboardIR` field (touch is already first-class via #825, 0.13.0 — reuse existing locations); declare or re-declare any gallery's `inputs`/`writes` (that is spec 017); decompose any gallery into per-key/per-element sub-questions or introduce a loop (Phase 2 §3.2); or change `DashboardView` rendering (015) or the drift bijection test (016).

### Key Entities *(include if feature involves data)*

> No `@keyboard-studio/contracts` change. All entities below are **existing** symbols / locations reused as-is (no contracts bump). Touch is already first-class (#825, 0.13.0).

- **`carveStep` (`EditorStep`)** (`registerEditorSteps.ts:107`): the already-declared manifest editor-step — `id:"carve"`, `component:CarveGalleryAdapter`, `inputs`/`writes` populated by spec 017. The node this spec confirms resolves. Unchanged by this spec.
- **`mechanismsStep` (`EditorStep`)** (`registerEditorSteps.ts:121`): the already-declared manifest editor-step — `id:"mechanisms"`, `lock:"physical"` (spread `manifest.ts:96-99`). The REFERENCE physical node. Unchanged.
- **`touchStep` (`EditorStep`)** (`registerEditorSteps.ts:153`): the already-declared manifest editor-step — `id:"touch"`, `lock:"touch"` (spread `manifest.ts:109-112`). The REFERENCE touch node. Unchanged.
- **`touch_seed_source` side-trail** (`registerEditorSteps.ts:137`): `spine:false`, `joinTarget:"touch"` — projected as a fork/join into `touch`, not a spine step. Unchanged.
- **`CarveGallery` direct store mutators** (`CarveGallery.tsx:28-72`): `deleteNode` / `restoreNode` / `deleteItem` / `restoreItem` / `restoreAll` / `keepAll` from `useWorkingCopyStore` + the deletion overlay / undo stack. **Preserved byte-identically**; the Phase-2 migration target (spec #13).
- **R1 `lockDesktop()`** (`reducer.ts:222`): the unconditional physical-lock gate (`MECHANISMS_STEP_ID` branch); `physicalAssignmentsOf` projects assignments. **Preserved byte-identically**; REFERENCE; Phase-2 migration target (spec #14, converted LAST).
- **R2 `buildTouchLayoutJson` / `setTouchLayoutJson`** (`reducer.ts:249-277`): the unconditional touch-layout build (`TOUCH_STEP_ID` branch) + the shipped `.keyman-touch-layout` side-car. **Preserved byte-identically** (verified #831 `c9f64ba`); REFERENCE; Phase-2 migration target (spec #15, converted LAST).
- **Touch re-propagation add-on** (`reducer.ts:228-243`): the optional automatic physical→touch re-propagation, gated on `isMutateSeamEnabled()`. **Stays OFF in Phase 1.**
- **`CARVE_WRITES` / `ADD_GALLERY_WRITES` / `TOUCH_WRITES`** (`editorMutate.ts:42-46`, `:203-206`, `:172`): the existing containment sets — `groups[]`/`stores[]`/`raw[]`, `groups[]`/`stores[]`, `touchLayout.platforms[].layers[].rows[].keys[]` — the surfaces spec 017's declarations mirror. Declared, **not** executed in P1 (the seam is a live flag-gated path but the flag stays off).
- **`buildManifestStepGraph()` + the map adapter** (spec 015): project the three gallery nodes and the `touch_seed_source` fork/join. Unchanged by this spec (consumed, not modified).
- **`SHOW_FLOWMAP`** (`StudioShell.tsx:84`): the dev-only flowmap gate under which the projected gallery nodes render; off ⇒ byte-identical to today.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With the dev flowmap flag on, the Flow Map renders exactly **one `carve` node, one `mechanisms` node (`lock:"physical"`), and one `touch` node (`lock:"touch"`)** on the manifest spine in declared order, each sourced from `buildManifestStepGraph()` via the spec-015 adapter, with the `touch_seed_source` side-trail projected as a fork/join into `touch`.
- **SC-002**: Each gallery node's declared `inputs`/`writes` (from spec 017) are **populated on the node** — `carve` over `groups[]`/`stores[]`/`raw[]`, `mechanisms` over `groups[]`/`stores[]`, `touch` over `touchLayout.platforms[].layers[].rows[].keys[]` — all existing `KeyboardIR` locations, no new field.
- **SC-003**: **Emit-byte equivalence**: the emitted `.kmn` bytes are **byte-identical before/after** for `carve`, `mechanisms`, and `touch`; for `touch` the `.keyman-touch-layout` side-car bytes are also byte-identical (the §2.5 per-surface oracle).
- **SC-004**: The dedicated physical (R1) and touch (R2/side-car) **don't-regress** tests stay **green**; R1 `lockDesktop()` runs unconditionally, R2 `buildTouchLayoutJson`/side-car runs unconditionally, and neither reference flow is destabilized.
- **SC-005**: The touch re-propagation add-on (`reducer.ts:228-243`) **remains OFF**; the base touch write path runs unconditionally as today; a test demonstrates the flag-off base path is byte-identical and the add-on does not run.
- **SC-006**: The **SPA render path is unchanged** — `StudioShell` hand-places all three galleries via `activeStepId`; each `manifest[].component` stays unrendered; each gallery's render is byte-identical.
- **SC-007**: The drift guardrail (spec 016) stays **green** with the three galleries resolving as manifest nodes (no orphan / uncovered step).
- **SC-008**: `pnpm typecheck` + studio/contracts `vitest` + `pnpm depcruise` pass; a repo audit finds **zero** new IR write route for any gallery (carve still uses its direct store mutators; physical still R1; touch still R2) and **zero** `mutate()` introduced for the three surfaces.

## Assumptions

- **`carve` / `mechanisms` / `touch` are already declared manifest editor-steps** (`registerEditorSteps.ts:107/121/153`; `mechanisms` `lock:"physical"` spread `manifest.ts:96-99`; `touch` `lock:"touch"` spread `manifest.ts:109-112`). This spec does not declare them; it confirms each node resolves with the spec-017 contract populated.
- **Spec 015 (map projection) and spec 016 (drift guardrail) are landed** — each gallery gets a rendered node automatically from the map adapter, and the drift guardrail is the bijection gate.
- **Spec 017 (declare steps) has populated the galleries' `inputs`/`writes`** before this spec runs — each declared contract must exist first (dependency), mirroring `CARVE_WRITES` / `ADD_GALLERY_WRITES` / `TOUCH_WRITES`. This spec consumes those declarations; it does not author them.
- **Physical (R1) and touch (R2) are known-good reference flows** (findings (c); §4): both base write paths run unconditionally today, are the target shape, and are converted LAST in Phase 2 (specs #14/#15) — never destabilized to unblock another flow.
- **Touch IR is already first-class** (#825, `@keyboard-studio/contracts` 0.13.0) — `touchLayout.platforms[].layers[].rows[].keys[]` is an existing location; no new bump in Phase 1.
- **The touch re-propagation add-on is flag-gated and stays OFF** — `reducer.ts:228-243` runs only when `isMutateSeamEnabled()` is on; the flag stays off in Phase 1.
- **The SPA render path is untouched** — `StudioShell` continues to hand-place the galleries via its `activeStepId` switch; `manifest[].component` stays unrendered. Any component-resolution-by-manifest move is Phase 2 and requires parity proof (§2.4 step 4).
- **No contracts bump and no `mutate()`** — all three galleries keep their current write mechanisms; routing through `mutate()` (carve overlay R1; physical/touch REFERENCE last) and the per-component contracts choices (§6 item 4, Q1) are deferred to the post-Phase-1 developer decision (Phase 2 specs #13/#14/#15).
- **"Byte-identical" for the galleries** means the emitted `.kmn` bytes (and, for touch, the `.keyman-touch-layout` side-car bytes) equal today's, verified by the §2.5 per-surface emit-byte oracle — not source-identical components.
