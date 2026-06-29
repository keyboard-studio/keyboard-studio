# Feature Specification: Wire build-list — BuildListView appears as the build-list branch drill-down behind the mandatory IntroChooser gate

**Feature Branch**: `speckit/question-unification-phase1-specs`

**Created**: 2026-06-29

**Status**: **Ready for planning** — Phase 1, spec #6 of the Question Unification migration. Read-only / declare-consuming wiring of a **registry-keyed drill-down** under the opaque `characters` node. No contracts bump, no new write routing, no SPA render change, behavior byte-identical (the produced `SurveyPhaseResult.confirmedInventory` is deep-equal before/after).

**Input**: Spec #6 (`qu-wire-buildlist`) of [docs/design-notes/question-unification-migration-plan.md](../../docs/design-notes/question-unification-migration-plan.md) (§2.1 `pb_build_list` row; §2.4 step 4 "Wire each component step"; §2.5 `SurveyPhaseResult` oracle; §5 spec #6; findings (a)/(b) build-list rows — mandatory IntroChooser gate, no auto-default). Make the default Phase B `BuildListView` (`survey/PhaseB.tsx:535`, used ~`692`) resolve as the **build-list branch** drill-down node of `phase_b_characters.modular.yaml`, reached from the **mandatory** IntroChooser discovery-method gate (`PhaseB.tsx` IntroChooser ~`744`, mounted ~`682`), modeled as a **registry-keyed drill-down under the opaque `characters` node** (NOT a top-level manifest entry), while its inventory output continues to ride on `SurveyPhaseResult.confirmedInventory` (`PhaseB.tsx:610`), NOT `KeyboardIR`, **byte-identically**.

**Governing scope**: This feature implements **Phase 1 spec #6** of the Question Unification migration ([docs/design-notes/question-unification-migration-plan.md](../../docs/design-notes/question-unification-migration-plan.md) §2.1 `pb_build_list` row, §2.4 step 4). It does **not** re-derive that scope. The companion research is recorded in [docs/design-notes/question-unification-findings.md](../../docs/design-notes/question-unification-findings.md) (findings (a): "Phase B build-list default `BuildListView` — hand-built, in no data source … the map shows only the rarely-taken step-by-step `pb_*` battery"; findings (b) build-list row: "reached via the **mandatory** IntroChooser gate (~744), no auto-default; most mature B experience; the one users take"). It depends on the map projection (spec 015), the drift guardrail (spec 016), and the declared `pb_build_list` drill-down `inputs`/`writes` (spec 017, which lands the drill-down declaration).

> **Phase-1 vs Phase-2 boundary (load-bearing — do not blur).** In Phase 1, `BuildListView` resolves as a **registry-keyed drill-down under the opaque `characters` node** — NOT a top-level manifest entry. Promotion to a first-class manifest entry is **Phase 2** (and the per-grapheme build-list loop is **Phase 2 spec #12 `qu-mutate-buildlist-loop`**, itself deferred pending Matt's loop build-vs-defer call — §6 / §3.1 scope caveat). This Phase-1 spec deliberately does NOT route any inventory write through `mutate()`, does NOT introduce a per-grapheme loop, and does NOT touch the SPA render path: `StudioShell` continues to hand-place `BuildListView` (via `PhaseB`, mounted at `discoveryMethod === "build-list"`, `PhaseB.tsx:690-697`); the inventory continues to ride on `SurveyPhaseResult.confirmedInventory` exactly as today. "Resolve as the build-list branch node" in Phase 1 means only that **the map node exists (as a drill-down under `characters`) and the contract is declared** — the render path is byte-identical.

> **Note on technical content in this spec (deliberate).** Per repository convention — where `packages/studio/src/steps/` manifest types, `packages/studio/src/survey/questions/registry.ts` registry shapes, and `packages/studio/src/dashboard/` graph-model types are architectural contracts and the extracted `specs/NNN/` folders carry real material — the non-obvious constraints (the registry-keyed drill-down placement under the opaque `characters` node, the **mandatory** IntroChooser gate with no auto-default, the build-list-vs-`pb_*`-battery branch split off the same gate, the `confirmedInventory`-on-`SurveyPhaseResult` write surface that does NOT touch `KeyboardIR`, the `SurveyPhaseResult` deep-equal oracle) are specified here as Functional Requirements and Success Criteria. The *mechanics* (the exact registry-key wiring, the precise drill-down nesting, the snapshot/oracle harness) remain plan-level.

## Phase-1 invariants (thread through every requirement)

- **No new write routing.** This spec introduces no IR write path and no `mutate()`. `BuildListView`'s inventory output continues to ride on `SurveyPhaseResult.confirmedInventory` (`PhaseB.tsx:610`), unioned via `mergePhaseResults` — **NOT** `KeyboardIR`. The `pb_build_list` drill-down declares its output as that phase-result inventory, not an `irPath()` leaf. CLDR suggestions stay in-component and async.
- **No contracts bump.** This spec reuses the existing `SurveyPhaseResult.confirmedInventory` field (the already-additive contract field, `PhaseB.tsx:9-10`) and existing registry/drill-down shapes. No new `KeyboardIR` field, no `@keyboard-studio/contracts` change, no §18 sign-off.
- **Behavior byte-identical.** The produced `SurveyPhaseResult` (its `confirmedInventory` union via `mergePhaseResults`) is **deep-equal before/after** this spec lands; the SPA render of `BuildListView` is byte-identical; the IntroChooser gate stays mandatory with no auto-default.
- **Step appears as a map node.** The build-list branch node appears on the rendered Flow Map as a **registry-keyed drill-down under the opaque `characters` node**, behind the IntroChooser discovery-method gate — advertising the mature live path instead of only the rarely-taken `pb_*` battery.
- **Read-only / declare-consuming as applicable.** This spec adds no new declaration of its own — the `pb_build_list` drill-down `inputs`/`writes` are declared by **spec 017**. It only confirms the node resolves with that contract populated, that the inventory output is unchanged, and that the build-list branch is checked in the question graph by the drift guardrail (016).

## Clarifications

### Session 2026-06-29

Phase 1 scope was confirmed by Matt (2026-06-29, migration-plan §6): Phase 1 only specs converting the custom/bespoke flow stages into opaque "questions" with valid inputs and outputs. For this spec the per-component loop and contracts decisions are **DEFERRED**, not blocking:

- **Per-grapheme build-list loop — DEFERRED (§6 item 1, §3.1 scope caveat).** Whether to build the Phase-2 looping primitive is a post-Phase-1 developer decision; the per-grapheme build-list loop (Phase 2 spec #12) is parked until then. Phase 1 keeps `BuildListView` as one `multi_select`-style screen writing `confirmedInventory`. This is **not** a blocker for this spec.
- **Inventory contracts choice (Q1) — DEFERRED (§6 item 4).** Reuse the existing `SurveyPhaseResult.confirmedInventory` (no bump — Phase 1's choice) vs. a new `KeyboardIR` inventory field (bump + §18) is a Phase-2 per-component contracts decision. Phase 1 reuses `confirmedInventory`; the new-field option is **not** opened here.

There is therefore **no `[NEEDS DECISION]` blocking Phase 1** for this spec. No `[NEEDS CLARIFICATION]` markers remain.

## User Scenarios & Testing *(mandatory)*

> The "users" here are the keyboard author taking the mature build-list path (whose inventory-confirmation experience must not change) and the studio engineer reading the developer Flow Map (who gains a visible, contract-declared build-list branch node where today the map advertises only the rarely-taken `pb_*` battery). Each story is independently testable and independently valuable.

### User Story 1 - The mature build-list path appears on the map as the build-list branch behind the discovery-method gate (Priority: P1)

A keyboard author (via the studio engineer reading the developer Flow Map) sees the path they actually take — `BuildListView` — as the **build-list branch** node behind the discovery-method (IntroChooser) gate, modeled as a registry-keyed drill-down under the opaque `characters` node, so the map advertises the mature live path instead of only the rarely-taken `pb_*` step-by-step battery — **without any change to how the build-list experience behaves**.

**Why this priority**: This is the headline deliverable and the reason the spec exists. Today `BuildListView` is hand-built and in **no** data source (findings (a)); the map shows only the rarely-taken `pb_*` battery — the maturity inversion in one node. With the map projection (015) landed and the spec-017 `pb_build_list` drill-down declaration populated, the build-list branch gets a node behind the IntroChooser gate. This spec confirms it, closing the inversion for the build-list path without touching behavior.

**Independent Test**: With the dev flowmap flag on, render the Flow Map; confirm there is a `pb_build_list` (build-list branch) node reached from the IntroChooser discovery-method gate, modeled as a **registry-keyed drill-down under the opaque `characters` node** (not a top-level manifest spine entry), with the `pb_*` step-by-step battery shown as the other (non-default) branch off the same gate.

**Acceptance Scenarios**:

1. **Given** the map projection (spec 015) is active, **When** the Flow Map renders, **Then** the build-list branch (`pb_build_list`) appears as a **registry-keyed drill-down under the opaque `characters` node** (NOT a top-level manifest entry), reached from the IntroChooser discovery-method gate.
2. **Given** the IntroChooser gate, **When** its branches are projected, **Then** the **build-list** branch routes to the `pb_build_list` / `BuildListView` drill-down and the **step-by-step** branch routes to the `pb_*` battery (`phase_b_characters.modular.yaml`) — both branches off the **same** gate.
3. **Given** the declared `pb_build_list` drill-down contract (spec 017), **When** the build-list node renders, **Then** its declared `inputs` (CLDR suggestions, which stay async in-component, and the base-IR seed per §2.1) and its declared output (confirmed inventory, on `SurveyPhaseResult.confirmedInventory`, NOT `KeyboardIR`) are populated on the node.

---

### User Story 2 - The confirmed-inventory output is preserved exactly while the node appears (Priority: P1)

A studio engineer relies on `BuildListView`'s confirmed-inventory output — which rides on `SurveyPhaseResult.confirmedInventory` (`PhaseB.tsx:610`) and is unioned via `mergePhaseResults` — being preserved **byte-identically** (deep-equal before/after) while the build-list branch gains a map node, so the map gains the node **without re-routing any write**.

**Why this priority**: This is the safety guarantee that makes the wiring shippable. The build-list path's only output is the phase-result inventory; if Phase 1 touched that (e.g. re-routed it through `mutate()` into `KeyboardIR`), the "map node appears" change and a behavior change would be entangled, and the Phase-2 `mutate()`/loop migration (spec #12) would have no byte-identical baseline to parity-prove against. It is P1 because it is the same deliverable as US1 from the behavior side and is the cheapest regression lock on the inventory output.

**Independent Test**: Run the same build-list completion sequence; capture the produced `SurveyPhaseResult` (the `confirmedInventory` union via `mergePhaseResults`); assert it is **deep-equal** to the baseline before this spec lands (the §2.5 `SurveyPhaseResult` oracle) — and assert `KeyboardIR` is **not** written by the build-list path.

**Acceptance Scenarios**:

1. **Given** the build-list path is completed, **When** `BuildListView.onComplete` fires, **Then** the inventory rides on `SurveyPhaseResult.confirmedInventory` (`PhaseB.tsx:610`), exactly as today — **no** `KeyboardIR` write occurs on this path.
2. **Given** the produced `SurveyPhaseResult`, **When** it is unioned via `mergePhaseResults`, **Then** the resulting `confirmedInventory` is **deep-equal** to the baseline (the §2.5 `SurveyPhaseResult` oracle — build-list writes `confirmedInventory`, NOT `KeyboardIR`).
3. **Given** the build-list surface, **When** the inventory output is compared before/after this spec, **Then** it is **byte-identical** (deep-equal) — CLDR suggestions stay in-component and async, no new write route is introduced.

---

### User Story 3 - The IntroChooser gate stays mandatory with no auto-default (Priority: P2)

The keyboard author reaching Phase B still passes through the **mandatory** IntroChooser discovery-method gate — there is **no auto-default** to build-list (or to the `pb_*` battery); both paths remain branches off an explicit choice.

**Why this priority**: The build-list branch is the *default* (mature, most-taken) path, but "default" does NOT mean "auto-selected" — the IntroChooser gate is mandatory (`discoveryMethod === null` renders the chooser, `PhaseB.tsx:680-687`, before either branch resolves). Modeling the build-list branch as the advertised path on the map must not silently introduce an auto-default that skips the gate. It is P2 because it is a specific facet of US1/US2's byte-identical guarantee (the gate behavior) rather than an independent behavior, but it is called out because an accidental auto-default is the most likely way this wiring could change behavior.

**Independent Test**: Enter Phase B with no discovery method chosen; confirm the IntroChooser renders (the gate is reached, not skipped); choose build-list → `BuildListView` resolves; choose step-by-step → the `pb_*` battery resolves; confirm neither is reached without an explicit choice.

**Acceptance Scenarios**:

1. **Given** Phase B is entered with `discoveryMethod === null`, **When** the component renders, **Then** the **IntroChooser** renders (the mandatory gate, `PhaseB.tsx:680-687`) — neither branch is auto-selected.
2. **Given** the IntroChooser, **When** the author chooses **build-list**, **Then** `BuildListView` resolves (`PhaseB.tsx:690-697`); **When** the author chooses **step-by-step**, **Then** the `pb_*` battery resolves — both only after an explicit choice.
3. **Given** this spec, **When** the map and the runtime are inspected, **Then** **no auto-default** is introduced on either branch — the gate stays mandatory exactly as today.

---

### User Story 4 - The build-list branch is checked in the question graph by the drift guardrail and the wiring stays green (Priority: P2)

The studio engineer can ship this wiring with the drift guardrail (spec 016) checking the `pb_build_list` / build-list branch in the **question** graph (the boundary-crossing step) and staying green, and with `pnpm typecheck` + vitest + `pnpm depcruise` all green.

**Why this priority**: The drift guardrail (016) enforces the rendered-graph ⟺ manifest+`questionRegistry`-runtime bijection; a boundary-crossing step like `pb_build_list` (a build-list branch reached off the IntroChooser gate) is checked in the **question** graph (reachable-from-flow-entry via `resolveNext` over `next`/`FlowGotoRule[]`, §2.2(b)), not the manifest graph. This wiring must keep that bijection satisfied. It is P2 because it is a non-functional guard on US1–US3 rather than a user-visible behavior, but it is the gate that proves the wiring did not introduce drift.

**Independent Test**: Run the drift guardrail (spec 016) with `pb_build_list` resolving as the build-list branch drill-down; confirm green — the build-list branch is a reachable question-graph node with a rendered drill-down (no orphan, no uncovered step). Run `pnpm typecheck`, the studio + contracts vitest suites, and `pnpm depcruise`; confirm green.

**Acceptance Scenarios**:

1. **Given** `pb_build_list` resolving as the build-list branch drill-down, **When** the drift guardrail (spec 016) runs, **Then** it stays green — the build-list branch is checked in the **question** graph (the boundary-crossing step, §2.2(b)) and has a rendered drill-down (no orphan, no uncovered step).
2. **Given** the full gate, **When** `pnpm typecheck` + studio/contracts vitest + `pnpm depcruise` run, **Then** all are green, with no new `dashboard → stores` or `dashboard → editors` edge.
3. **Given** the `SurveyPhaseResult` oracle test, **When** it runs in CI, **Then** it is green and locks the produced `confirmedInventory` (deep-equal) for the build-list path (§2.5 `SurveyPhaseResult` surfaces).

---

### Edge Cases

- **Flag off entirely**: the developer Flow Map (`FlowMapView`) does not mount (per `SHOW_FLOWMAP`, `StudioShell.tsx:84`), so no projection runs; the SPA still hand-places `BuildListView` via `PhaseB`, the IntroChooser gate is still mandatory, and the inventory output is byte-identical to today.
- **No auto-default**: `discoveryMethod === null` renders the IntroChooser (`PhaseB.tsx:680-687`); neither the build-list branch nor the `pb_*` battery is reached without an explicit choice. This spec MUST NOT introduce an auto-default that skips the gate.
- **Build-list is a drill-down, not a manifest entry**: `pb_build_list` resolves as a **registry-keyed drill-down under the opaque `characters` node**, NOT a top-level manifest spine entry. Promotion to first-class is **Phase 2**; this spec must not add a manifest entry for it.
- **No IR write to compare**: the build-list path writes no `KeyboardIR` leaf — its output is `SurveyPhaseResult.confirmedInventory` (`PhaseB.tsx:610`). So the byte-identical oracle is a **`SurveyPhaseResult` deep-equal** (`confirmedInventory` union via `mergePhaseResults`), NOT an emit-byte or flow-routing comparison (§2.5 `SurveyPhaseResult` surfaces).
- **The `pb_*` battery is the other branch — not demoted or moved here**: the `pb_*` step-by-step battery remains the non-default branch off the same IntroChooser gate. Demoting/moving it (to reserve/library) is **spec 022 / `qu-library-demote` (spec #8)**, not this spec; this spec must not touch it.
- **CLDR suggestions stay in-component**: the CLDR suggestion source stays async and in-component (`BuildListView`); it is declared as an input on the node but is NOT moved out of the component or made a new write route.
- **Per-grapheme loop is out of scope**: any per-grapheme build-list loop is **Phase 2 spec #12** (deferred pending Matt's loop build-vs-defer call, §6); this spec keeps `BuildListView` as one inventory-confirmation screen and must not anticipate the loop.
- **Component resolution by manifest is out of scope**: `BuildListView` stays hand-placed by `StudioShell`/`PhaseB`; any move to render it from the manifest/registry is a Phase-2 user-facing render change requiring parity proof (§2.4 step 4).

## Requirements *(mandatory)*

### Functional Requirements

**The build-list branch resolves on the map**

- **FR-001**: The default Phase B `BuildListView` (`PhaseB.tsx:535`, used ~`692`) MUST resolve as the **build-list branch** drill-down node of `phase_b_characters.modular.yaml`, reached from the **mandatory** IntroChooser discovery-method gate (`PhaseB.tsx` IntroChooser ~`744`, mounted ~`682`), once foundation (a) / spec 015 has landed. This spec relies on the spec-017 `pb_build_list` drill-down declaration being projected by the map adapter; it MUST NOT add a top-level manifest entry.
- **FR-002**: The build-list branch MUST be modeled as a **registry-keyed drill-down under the opaque `characters` node** — **NOT** a top-level manifest entry. Promotion to a first-class manifest entry is **Phase 2**; this spec MUST NOT promote it.
- **FR-003**: The build-list branch MUST be projected as **one of two branches off the same IntroChooser gate**: the build-list branch routes to `pb_build_list` / `BuildListView`; the step-by-step branch routes to the `pb_*` battery. This spec MUST NOT demote or move the `pb_*` battery (that is spec 022).
- **FR-004**: The build-list node MUST render with its declared `inputs`/output (populated by spec 017) **populated on the node** — `inputs` covering the CLDR suggestions (which stay async in-component) and the base-IR seed (§2.1), and its declared **output** being the confirmed inventory on `SurveyPhaseResult.confirmedInventory` (NOT a `KeyboardIR` `irPath()` leaf).

**The confirmed-inventory output is preserved byte-identically**

- **FR-005**: `BuildListView`'s confirmed-inventory output MUST continue to ride on `SurveyPhaseResult.confirmedInventory` (`PhaseB.tsx:610`), unioned via `mergePhaseResults` — **NOT** `KeyboardIR`. This spec MUST NOT re-route the inventory through `mutate()` or any IR write path.
- **FR-006**: The produced `SurveyPhaseResult` (its `confirmedInventory` union via `mergePhaseResults`) MUST be **deep-equal before/after** this spec lands (byte-identical inventory output). CLDR suggestions MUST stay in-component and async.
- **FR-007**: The **SPA render path MUST be unchanged**: `StudioShell` MUST continue to hand-place `BuildListView` (via `PhaseB`, mounted at `discoveryMethod === "build-list"`, `PhaseB.tsx:690-697`); the `BuildListView` render MUST be byte-identical to today.

**The IntroChooser gate stays mandatory**

- **FR-008**: The IntroChooser discovery-method gate MUST remain **mandatory** — `discoveryMethod === null` renders the IntroChooser (`PhaseB.tsx:680-687`) before either branch resolves. This spec MUST NOT introduce an **auto-default** to build-list (or to the `pb_*` battery); both paths remain branches off an explicit choice.

**`SurveyPhaseResult` oracle (§2.5)**

- **FR-009**: A **`SurveyPhaseResult` oracle** test (migration-plan §2.5, `SurveyPhaseResult`-writing surfaces) MUST assert that the produced `SurveyPhaseResult` — the `confirmedInventory` union via `mergePhaseResults` — is **deep-equal before/after** this spec. Build-list writes `confirmedInventory`, NOT `KeyboardIR`, so the oracle is the phase-result deep-equal, not an emit-byte or flow-routing comparison.

**Guardrail & gate**

- **FR-010**: The drift guardrail (spec 016) MUST stay **green** with the build-list branch checked in the **question** graph (the boundary-crossing step, §2.2(b)) — `pb_build_list` is a reachable question-graph node (off the IntroChooser gate) that MUST have a rendered drill-down (no orphan, no uncovered step).
- **FR-011**: `pnpm typecheck` + studio/contracts `vitest` + `pnpm depcruise` MUST be **green**, with no new `dashboard → stores` or `dashboard → editors` edge introduced.

**Out of scope (explicit non-goals)**

- **FR-012**: This feature MUST NOT: promote the build-list branch to a top-level manifest entry (Phase 2); introduce a per-grapheme build-list loop (Phase 2 spec #12, deferred pending Matt's loop decision); introduce an auto-default that skips the IntroChooser gate; re-route the inventory through `mutate()` or any `KeyboardIR` write; bump `@keyboard-studio/contracts`; touch the SPA render path (`StudioShell`/`PhaseB` keep hand-placing `BuildListView`); demote or move the `pb_*` step-by-step battery (that is spec 022); move CLDR suggestions out of the component; or declare/re-declare the `pb_build_list` drill-down `inputs`/output (that is spec 017).

### Key Entities *(include if feature involves data)*

- **`BuildListView`** (`PhaseB.tsx:535`, mounted ~`692`): the hand-built default Phase B build-list component the SPA hand-places via `PhaseB` at `discoveryMethod === "build-list"` (`PhaseB.tsx:690-697`). Its confirmed-inventory output rides on `SurveyPhaseResult.confirmedInventory` (`PhaseB.tsx:610`). The node this spec confirms resolves as the build-list branch drill-down. Render and output **unchanged** by this spec.
- **`IntroChooser`** (`PhaseB.tsx:744`, mounted ~`682` when `discoveryMethod === null`): the **mandatory** discovery-method gate (no auto-default) off which the build-list branch and the `pb_*` step-by-step branch hang. Unchanged.
- **`pb_build_list` drill-down (registry-keyed)**: the build-list branch declaration (`inputs`/output populated by spec 017) modeled as a registry-keyed drill-down under the opaque `characters` node — NOT a top-level manifest entry. The node this spec confirms resolves. Declared by spec 017; consumed here.
- **`SurveyPhaseResult.confirmedInventory`** (`PhaseB.tsx:610`, additive contract field `PhaseB.tsx:9-10`): the existing phase-result field the build-list inventory rides on, unioned via `mergePhaseResults`. The build-list path's **only** output surface — **NOT** `KeyboardIR`. Reused as-is (no contracts bump).
- **`mergePhaseResults`**: the union over phase results that produces the merged `confirmedInventory`; the basis of the §2.5 `SurveyPhaseResult` deep-equal oracle. Unchanged.
- **`pb_*` step-by-step battery** (`phase_b_characters.modular.yaml`): the other (non-default) branch off the same IntroChooser gate. **Not touched** by this spec — demotion/move is spec 022.
- **`phase_b_characters.modular.yaml`**: the Phase B modular flow whose build-list branch this drill-down keys off. Unchanged.
- **`buildManifestStepGraph()` + `buildModularFlowGraph()` + the map adapter** (spec 015): project the opaque `characters` node (manifest) and the registry-keyed drill-downs (modular). The build-list branch hangs as a drill-down under `characters`. Consumed, not modified.
- **`SHOW_FLOWMAP`** (`StudioShell.tsx:84`): the dev-only flowmap gate under which the projected build-list branch node renders; off ⇒ byte-identical to today.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With the dev flowmap flag on, the Flow Map renders the build-list branch (`pb_build_list` / `BuildListView`) as a **registry-keyed drill-down under the opaque `characters` node** (NOT a top-level manifest entry), reached from the IntroChooser discovery-method gate.
- **SC-002**: The IntroChooser gate is shown with **two** branches — build-list → `BuildListView`, step-by-step → the `pb_*` battery — both off the **same** gate; the `pb_*` battery is **not** demoted or moved by this spec.
- **SC-003**: The produced `SurveyPhaseResult` (the `confirmedInventory` union via `mergePhaseResults`) is **deep-equal** before/after this spec — byte-identical inventory output; the build-list path writes **no** `KeyboardIR` leaf (§2.5 `SurveyPhaseResult` oracle).
- **SC-004**: The IntroChooser gate stays **mandatory** — Phase B with `discoveryMethod === null` renders the IntroChooser; **no auto-default** is introduced on either branch.
- **SC-005**: The **SPA render path is unchanged** — `StudioShell`/`PhaseB` hand-place `BuildListView`; the `BuildListView` render is byte-identical.
- **SC-006**: The drift guardrail (spec 016) stays **green** with the build-list branch checked in the **question** graph (the boundary-crossing step) — `pb_build_list` is a reachable question-graph node with a rendered drill-down (no orphan / uncovered step).
- **SC-007**: `pnpm typecheck` + studio/contracts `vitest` + `pnpm depcruise` pass; a repo audit finds **zero** new IR write route for the build-list path, **zero** auto-default, and **zero** top-level manifest entry added for `pb_build_list`.

## Assumptions

- **`BuildListView` is hand-built and in no data source today** (`PhaseB.tsx:535`, findings (a)); its inventory output rides on `SurveyPhaseResult.confirmedInventory` (`PhaseB.tsx:610`). This spec does not change the component or its output; it confirms the build-list branch resolves as a registry-keyed drill-down with the spec-017 contract populated.
- **Spec 015 (map projection) and spec 016 (drift guardrail) are landed** — the build-list branch gets a rendered drill-down node automatically from the map adapter (`buildModularFlowGraph` drill-downs keyed off `questionRegistry`), and the drift guardrail is the bijection gate (the build-list branch is checked in the question graph).
- **Spec 017 (declare steps) has populated the `pb_build_list` drill-down `inputs`/output** before this spec runs — the build-list branch's declared contract must exist first (dependency). Its declared output is the `SurveyPhaseResult.confirmedInventory` inventory, not an `irPath()` leaf, so no manifest-level C5 obligation arises from this spec (the output is a phase-result surface, not a manifest-graph IR write).
- **The IntroChooser gate is mandatory with no auto-default** (`PhaseB.tsx:680-687`, findings (b)). This is preserved exactly; "default" (mature, most-taken) does NOT mean "auto-selected."
- **The `pb_*` battery is the other branch off the same gate** and is **not** touched here — demotion/move is spec 022 (`qu-library-demote`).
- **The SPA render path is untouched** — `StudioShell`/`PhaseB` continue to hand-place `BuildListView`. Any component-resolution-by-manifest move is Phase 2 and requires parity proof (§2.4 step 4).
- **No contracts bump and no `mutate()`** — the build-list inventory reuses the existing `SurveyPhaseResult.confirmedInventory` field; all contracts decisions (Q1) and the per-grapheme loop are deferred to the post-Phase-1 developer decision (migration-plan §6).
- **"Byte-identical" for build-list** means the produced `SurveyPhaseResult` (`confirmedInventory` union via `mergePhaseResults`) is deep-equal to today's, verified by the §2.5 `SurveyPhaseResult` oracle, and the `BuildListView` render equals today's — not source-identical components.
