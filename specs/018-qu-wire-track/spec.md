# Feature Specification: Wire track — TrackStep resolves as its first-class manifest node (hand-coded fork preserved)

**Feature Branch**: `speckit/question-unification-phase1-specs`

**Created**: 2026-06-29

**Status**: **Ready for planning** — Phase 1, spec #4 of the Question Unification migration. Read-only / declare-consuming wiring of an **already-declared** manifest editor-step. No contracts bump, no new write routing, no SPA render change, behavior byte-identical.

**Input**: Spec #4 (`qu-wire-track`) of [docs/design-notes/question-unification-migration-plan.md](../../docs/design-notes/question-unification-migration-plan.md) (§2.1 track row; §2.4 step 4 "Wire each component step"; §2.5 branch/read-only oracle; §5 spec #4; §6 decision 6 RESOLVED). Make the `TrackStep` ("How do you want to use this base?") resolve as its first-class manifest editor-step node on the developer Flow Map, with its declared `inputs`/`writes` (populated by spec 017) showing on the node, while its existing hand-coded copy-vs-adapt fork in `StudioShell.handleTrackSelected` (`StudioShell.tsx:602`) is preserved **byte-identically**.

**Governing scope**: This feature implements **Phase 1 spec #4** of the Question Unification migration ([docs/design-notes/question-unification-migration-plan.md](../../docs/design-notes/question-unification-migration-plan.md) §2.1 track row, §2.4 step 4). It does **not** re-derive that scope. The companion research is recorded in [docs/design-notes/question-unification-findings.md](../../docs/design-notes/question-unification-findings.md) (findings (b) track row: "Track chooser — manifest editor-step with no question; mature & live; branch-defining"). It depends on the map projection (spec 015), the drift guardrail (spec 016), and the declared `inputs`/`writes` for `track` (spec 017).

> **Phase-1 vs Phase-2 boundary (load-bearing — do not blur).** Matt RESOLVED the canonical track-chooser model (§6 decision 6, 2026-06-29) as **Option A — the modular gate question**: the copy/adapt fork eventually becomes a YAML `next` rule (CYOA fork in data), not a hand-coded `if`. **That move is Phase 2, spec #10 (`qu-mutate-track`).** This Phase-1 spec deliberately does NOT move the fork into YAML. "Resolve as its manifest node" in Phase 1 means only that **the map node exists and the contract is declared** — the SPA render path is untouched: `StudioShell` continues to hand-place `TrackStep` via its `activeStepId` switch (`StudioShell.tsx:908-916`) and the copy-vs-adapt fork stays in `handleTrackSelected` (`StudioShell.tsx:602-614`) byte-identically.

> **Note on technical content in this spec (deliberate).** Per repository convention — where `packages/studio/src/steps/` manifest types and `packages/studio/src/dashboard/` graph model types are architectural contracts and the extracted `specs/NNN/` folders carry real material — the non-obvious constraints (the already-existing manifest declaration at `registerEditorSteps.ts:71-79` / `manifest.ts:77`, the spine/branch placement, the preserved `handleTrackSelected` fork, the `project_name` side-trail gating, the branch/read-only routing oracle) are specified here as Functional Requirements and Success Criteria. The *mechanics* (the exact snapshot harness, the precise drill-down nesting) remain plan-level.

## Phase-1 invariants (thread through every requirement)

- **No new write routing.** This spec introduces no IR write path. `track` declares `writes: []` (it makes a branch selection only, no IR leaf in Phase 1 — §2.1). `mutate()` is NOT introduced for this surface. The copy-vs-adapt routing stays exactly where it is today: `handleTrackSelected` (`StudioShell.tsx:602`).
- **No contracts bump.** This spec reuses existing manifest/`EditorStep` shapes and existing `KeyboardIR` locations. No new `KeyboardIR` field, no `@keyboard-studio/contracts` change, no §18 sign-off.
- **Behavior byte-identical.** The copy-vs-adapt fork resolves to exactly the same next-step id / branch selection as today; the SPA render of `TrackStep` is byte-identical; copy-track still gates the `project_name` side-trail.
- **Step appears as a map node.** The `track` node appears as a first-class node on the rendered Flow Map (automatically, once foundation (a)/spec 015 has landed — `track` is already a manifest entry).
- **Read-only / declare-only as applicable.** This spec adds no new declaration of its own — `track`'s `inputs`/`writes` are declared by spec 017. It only confirms the node resolves with that contract populated and that the fork is unchanged.

## Clarifications

### Session 2026-06-29

Phase 1 scope was confirmed by Matt (2026-06-29, migration-plan §6): Phase 1 only specs converting the custom/bespoke flow stages into opaque "questions" with valid inputs and outputs. For this spec the canonical-model decision is **RESOLVED**, not open:

- **Track chooser canonical model — RESOLVED (Matt, §6 decision 6).** Option A: the copy/adapt fork becomes a YAML `next` rule (modular gate question). **Its implementation is deferred to Phase 2 spec #10 (`qu-mutate-track`).** Phase 1 keeps the hand-coded fork (`handleTrackSelected`, `StudioShell.tsx:602`) byte-identical. There is therefore **no `[NEEDS DECISION]` blocking Phase 1** for this spec.

No `[NEEDS CLARIFICATION]` markers remain.

## User Scenarios & Testing *(mandatory)*

> The "users" here are the keyboard author choosing how to use a base (whose copy-vs-adapt experience must not change) and the studio engineer reading the developer Flow Map (who gains a visible, contract-declared track node) and maintaining the safe path to the Phase-2 YAML-fork migration. Each story is independently testable and independently valuable.

### User Story 1 - The track chooser appears as a first-class branch-defining node on the map (Priority: P1)

A keyboard author (via the studio engineer reading the developer Flow Map) sees the track chooser — "How do you want to use this base?" — as a **first-class branch-defining node** on the rendered map, with its declared `inputs`/`writes` populated, so the copy-vs-adapt decision is visible in the flow **without any change to how the choice behaves**.

**Why this priority**: This is the headline deliverable. Today the track chooser is a manifest editor-step with no question and (before spec 015) no rendered map node (findings (b)). With the map projection (015) landed, `track` — already a manifest entry (`registerEditorSteps.ts:71-79`, `manifest.ts:77`, `spine:true`) — automatically gets a node; with the declared contract (017) populated, that node carries its `inputs`/`writes`. This spec confirms both, making the branch decision visible without touching behavior.

**Independent Test**: With the dev flowmap flag on, render the Flow Map; confirm there is exactly one `track` node on the manifest spine (after `choose_base`), that it is marked as branch-defining (the copy fork to `project_name`, the adapt path to `characters`), and that its declared `inputs`/`writes` (from spec 017) are populated on the node.

**Acceptance Scenarios**:

1. **Given** the map projection (spec 015) is active, **When** the Flow Map renders, **Then** the `track` node appears as a first-class node on the manifest spine after `choose_base`, sourced from `buildManifestStepGraph()` via the adapter (it is already a manifest entry — no new declaration).
2. **Given** the declared `track` contract (spec 017), **When** the `track` node renders, **Then** its declared `inputs` (the resolved base IR / `base.displayName`, plus the session-derived `header.bcp47` array per §2.1) and `writes` (`[]` — branch selection only, no IR leaf in Phase 1) are populated on the node.
3. **Given** the `track` node, **When** its branch structure is projected, **Then** it is shown as branch-defining: a fork edge to the `project_name` side-trail (`spine:false`, `joinTarget:"characters"`) on the copy track, and the spine continuation to `characters` (`nextSpineStepAfter("track")`) on the adapt track.

---

### User Story 2 - The existing hand-coded fork is preserved exactly while the node appears (Priority: P1)

A studio engineer relies on the copy-vs-adapt fork in `handleTrackSelected` (`StudioShell.tsx:602`) being preserved **byte-identically** while `track` gains a map node, so the branch behavior is unchanged and the Phase-2 YAML-fork migration (spec #10) can happen later from a stable, contract-declared base.

**Why this priority**: This is the safety guarantee that makes the wiring shippable. The canonical model is resolved as a modular gate (Matt, §6 decision 6), but moving the fork into YAML is Phase 2. If Phase 1 touched the routing, the "map node appears" change and a behavior change would be entangled, and the Phase-2 migration would have no byte-identical baseline to parity-prove against. It is P1 because it is the same deliverable as US1 from the behavior side and is the cheapest regression lock on the branch.

**Independent Test**: Run the same selection sequence for both tracks through the existing flow; assert that `handleTrackSelected("copy")` resolves to `project_name` and `handleTrackSelected("adapt")` resolves to `nextSpineStepAfter("track")` (i.e. `characters`, skipping the `spine:false` `project_name`), via a flow-routing snapshot — identical before and after this spec lands.

**Acceptance Scenarios**:

1. **Given** the copy track is selected, **When** `handleTrackSelected("copy")` runs, **Then** the next active step is `project_name` (the `spine:false` side-trail), exactly as today.
2. **Given** the adapt track is selected, **When** `handleTrackSelected("adapt")` runs, **Then** `scaffoldSpec` is cleared and the next active step is `nextSpineStepAfter("track")` (`characters`, bypassing the `spine:false` `project_name`), with `charactersSub` set to `"prefill"` — exactly as today.
3. **Given** either track, **When** the resolved next-step id / branch selection is captured in a flow-routing snapshot, **Then** it is **unchanged** by this spec (the branch/read-only oracle, §2.5).
4. **Given** the SPA, **When** `StudioShell` reaches `stepId === "track"`, **Then** it hand-places `<TrackStep>` via the `activeStepId` switch (`StudioShell.tsx:908-916`) exactly as today; `manifest[].component` (`TrackStepAdapter`) remains unrendered (there is no `SurveyView`); the `TrackStep` render is byte-identical.

---

### User Story 3 - Copy-track still gates the project_name side-trail (Priority: P2)

The keyboard author choosing the copy track is still routed through the `project_name` side-trail (to name the new project), and the author choosing adapt still bypasses it — the side-trail gating is unchanged.

**Why this priority**: The copy-vs-adapt fork is meaningful precisely because copy gates `project_name` (a copy creates a new, separately-named project) while adapt reuses the base's own id/displayName. Preserving this gating is part of "byte-identical fork behavior" but is called out separately because the `project_name` step is the visible consequence of the branch and is the first thing a regression would surface. It is P2 because it is a specific facet of US2's byte-identical guarantee rather than an independent behavior.

**Independent Test**: Select copy; confirm `project_name` is reached. Select adapt; confirm `project_name` (`spine:false`, `joinTarget:"characters"`) is bypassed and the flow lands on `characters`. Confirm the `project_name` node still renders on the map as the copy-track fork target.

**Acceptance Scenarios**:

1. **Given** the copy track, **When** the fork resolves, **Then** the `project_name` side-trail (`spine:false`, `joinTarget:"characters"`, `manifest.ts:82-86`) is entered, exactly as today.
2. **Given** the adapt track, **When** the fork resolves, **Then** `project_name` is bypassed and the flow continues to `characters` at the join target, exactly as today.
3. **Given** the rendered map, **When** the `track` node's fork is projected, **Then** the `project_name` node appears as the copy-track fork target and rejoins at `characters` (the existing `buildManifestStepGraph` fork/join edge rules).

---

### User Story 4 - The wiring stays green under the drift guardrail and the full gate (Priority: P2)

The studio engineer can ship this wiring with the drift guardrail (spec 016) staying green with `track` resolving as its node, and with `pnpm typecheck` + vitest + `pnpm depcruise` all green.

**Why this priority**: The drift guardrail (016) enforces the rendered-graph ⟺ manifest+registry-runtime bijection; `track` resolving as its node must keep that bijection satisfied (it is an existing manifest step the runtime reaches, so it must keep a rendered node). It is P2 because it is a non-functional guard on US1–US3 rather than a user-visible behavior, but it is the gate that proves the wiring did not introduce drift.

**Independent Test**: Run the drift guardrail (spec 016) with `track` resolving as its node; confirm green (the `track` manifest step has a rendered node, the negative test stays red only for a deliberately-uncovered step). Run `pnpm typecheck`, the studio + contracts vitest suites, and `pnpm depcruise`; confirm green.

**Acceptance Scenarios**:

1. **Given** `track` resolving as its node, **When** the drift guardrail (spec 016) runs, **Then** it stays green — `track` is a manifest step the runtime reaches and it has a rendered node (no orphan, no uncovered step).
2. **Given** the full gate, **When** `pnpm typecheck` + studio/contracts vitest + `pnpm depcruise` run, **Then** all are green, with no new `dashboard → stores` or `dashboard → editors` edge.
3. **Given** the flow-routing snapshot test, **When** it runs in CI, **Then** it is green and locks the resolved next-step id / branch selection for both tracks (§2.5 branch/read-only oracle).

---

### Edge Cases

- **Flag off entirely**: the developer Flow Map (`FlowMapView`) does not mount (per `SHOW_FLOWMAP`, `StudioShell.tsx:84`), so no projection runs; the SPA still hand-places `TrackStep` and the fork resolves identically. Output is byte-identical to today.
- **`track` is already declared — this spec does not re-declare it**: `track` exists at `registerEditorSteps.ts:71-79` and `manifest.ts:77` (`spine:true`); its `inputs`/`writes` are populated by **spec 017**. This spec MUST NOT add a second declaration or change the manifest entry — it only confirms the node resolves with the 017 contract.
- **Fork stays in code, not YAML**: the copy-vs-adapt `if` stays in `handleTrackSelected` (`StudioShell.tsx:602-614`). Moving it to a YAML `next` rule is **Phase 2 spec #10** (`qu-mutate-track`); this spec must not anticipate that move.
- **`project_name` is `spine:false`**: it is projected as a fork node from `track` with a join edge back to `joinTarget:"characters"` (the existing `buildManifestStepGraph` edge rules), not as a spine step — the adapt track correctly bypasses it via `nextSpineStepAfter("track")`.
- **No IR write to compare**: `track` writes no IR leaf in Phase 1 (`writes: []`), so the byte-identical oracle is a **flow-routing snapshot** (resolved next-step id / branch selection), NOT an emit-byte or `SurveyPhaseResult` comparison (§2.5 branch/read-only surfaces).
- **Component resolution by manifest is out of scope**: `manifest[].component` (`TrackStepAdapter`) stays unrendered; any move to render `TrackStep` from the manifest is a Phase-2 user-facing render change requiring parity proof (§2.4 step 4).

## Requirements *(mandatory)*

### Functional Requirements

**The track node resolves on the map**

- **FR-001**: The `track` editor-step (already declared — `registerEditorSteps.ts:71-79`, `manifest.ts:77`, `spine:true`) MUST resolve as a **first-class node on the rendered Flow Map** once foundation (a) / spec 015 has landed. This spec MUST NOT add a new manifest entry or a second declaration of `track`; it relies on the existing entry being projected by the map adapter.
- **FR-002**: The `track` node MUST render with its declared `inputs`/`writes` (populated by spec 017) **populated on the node** — `inputs` covering the resolved base IR (`base.displayName`) and the session-derived `header.bcp47` array (§2.1), and `writes` being `[]` (branch selection only — no IR leaf in Phase 1).
- **FR-003**: The `track` node MUST be projected as **branch-defining**: a fork edge to the `project_name` side-trail (`spine:false`, `joinTarget:"characters"`) on the copy track and the spine continuation to `characters` on the adapt track, per the existing `buildManifestStepGraph` fork/join edge rules.

**The hand-coded fork is preserved byte-identically**

- **FR-004**: The copy-vs-adapt fork in `handleTrackSelected` (`StudioShell.tsx:602-614`) MUST be preserved **byte-identically**: `handleTrackSelected("copy")` MUST set the active step to `project_name`; `handleTrackSelected("adapt")` MUST clear `scaffoldSpec`, set the active step to `nextSpineStepAfter("track")` (`characters`), and set `charactersSub` to `"prefill"` — exactly as today.
- **FR-005**: This spec MUST NOT move the fork into a YAML `next` rule, MUST NOT introduce `mutate()` for the `track` surface, and MUST NOT introduce any new write routing. The canonical modular-gate model (Matt, §6 decision 6) is implemented in **Phase 2 spec #10 (`qu-mutate-track`)**, not here.
- **FR-006**: The **SPA render path MUST be unchanged**: `StudioShell` MUST continue to hand-place `<TrackStep>` via its `activeStepId` switch (`StudioShell.tsx:908-916`); `manifest[].component` (`TrackStepAdapter`) MUST remain unrendered. The `TrackStep` render MUST be byte-identical to today.

**Copy-track gating**

- **FR-007**: The copy track MUST continue to gate the `project_name` side-trail (copy → `project_name`; adapt → bypass `project_name` → `characters`), exactly as today.

**Branch/read-only oracle (§2.5)**

- **FR-008**: A **branch/read-only oracle** test (migration-plan §2.5, branch/read-only surfaces) MUST assert that the **resolved next-step id / branch selection is unchanged** for both tracks via a **flow-routing snapshot** — there is no IR or phase-result output to compare for `track` (`writes: []`), so the oracle is the resolved routing, not an emit-byte or `SurveyPhaseResult` comparison.

**Guardrail & gate**

- **FR-009**: The drift guardrail (spec 016) MUST stay **green** with `track` resolving as its node — `track` is a manifest step the runtime reaches and MUST have a rendered node (no orphan, no uncovered step).
- **FR-010**: `pnpm typecheck` + studio/contracts `vitest` + `pnpm depcruise` MUST be **green**, with no new `dashboard → stores` or `dashboard → editors` edge introduced.

**Out of scope (explicit non-goals)**

- **FR-011**: This feature MUST NOT: move the fork into YAML `next` rules (Phase 2 spec #10); touch the SPA render path (StudioShell keeps hand-placing `TrackStep`; `manifest[].component` stays unrendered); introduce new write routing or `mutate()`; bump `@keyboard-studio/contracts`; change the byte-identical fork behavior; declare or re-declare `track`'s `inputs`/`writes` (that is spec 017); or promote anything to a new manifest entry beyond what already exists.

### Key Entities *(include if feature involves data)*

- **`trackStep` (`EditorStep`)** (`registerEditorSteps.ts:71-79`): the already-declared manifest editor-step — `id:"track"`, `spine:true`, `component:TrackStepAdapter`, `inputs`/`writes` populated by spec 017. The node this spec confirms resolves. Unchanged by this spec.
- **`manifest` track entry** (`manifest.ts:77`): the spine placement of `trackStep` after `choose_base` and before the `project_name` side-trail. Unchanged.
- **`handleTrackSelected`** (`StudioShell.tsx:602-614`): the hand-coded copy-vs-adapt fork — copy → `project_name`; adapt → clear `scaffoldSpec`, `nextSpineStepAfter("track")`, `charactersSub:"prefill"`. **Preserved byte-identically**; the Phase-2 migration target (spec #10).
- **`TrackStep` / `TrackStepAdapter`** (`editors/.../TrackStep.tsx:40`): the live React component hand-placed by `StudioShell` (`StudioShell.tsx:908-916`); its `TrackStepAdapter` manifest `component` stays unrendered (no `SurveyView`). Render unchanged.
- **`project_name` side-trail** (`manifest.ts:82-86`): the `spine:false`, `joinTarget:"characters"` step the copy track gates and the adapt track bypasses. Unchanged.
- **`buildManifestStepGraph()` + the map adapter** (spec 015): project the `track` node and its fork/join edges. Unchanged by this spec (consumed, not modified).
- **`SHOW_FLOWMAP`** (`StudioShell.tsx:84`): the dev-only flowmap gate under which the projected `track` node renders; off ⇒ byte-identical to today.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With the dev flowmap flag on, the Flow Map renders exactly **one `track` node** on the manifest spine after `choose_base`, shown as branch-defining (fork to `project_name`, spine continuation to `characters`).
- **SC-002**: The `track` node's declared `inputs`/`writes` (from spec 017) are **populated on the node** — `writes` is `[]` (branch selection only, no IR leaf in Phase 1).
- **SC-003**: The copy-vs-adapt fork is **byte-identical** to today: a flow-routing snapshot shows copy → `project_name` and adapt → `nextSpineStepAfter("track")` (`characters`, `charactersSub:"prefill"`, `scaffoldSpec` cleared), unchanged (§2.5 branch/read-only oracle).
- **SC-004**: Copy-track still gates the `project_name` side-trail; adapt-track still bypasses it — demonstrated for both tracks.
- **SC-005**: The **SPA render path is unchanged** — `StudioShell` hand-places `TrackStep` via `activeStepId`; `manifest[].component` stays unrendered; the `TrackStep` render is byte-identical.
- **SC-006**: The drift guardrail (spec 016) stays **green** with `track` resolving as its node (no orphan / uncovered step).
- **SC-007**: `pnpm typecheck` + studio/contracts `vitest` + `pnpm depcruise` pass; a repo audit finds **zero** new IR write route for `track` and **zero** fork-in-YAML change (the fork stays in `handleTrackSelected`).

## Assumptions

- **`track` is already a declared manifest editor-step** (`registerEditorSteps.ts:71-79`, `manifest.ts:77`, `spine:true`). This spec does not declare it; it confirms the node resolves with the spec-017 contract populated.
- **Spec 015 (map projection) and spec 016 (drift guardrail) are landed** — `track` gets a rendered node automatically from the map adapter, and the drift guardrail is the bijection gate.
- **Spec 017 (declare steps) has populated `track`'s `inputs`/`writes`** before this spec runs — `track`'s declared contract must exist first (dependency). `track`'s `writes` is `[]` (branch selection only), so no cross-graph C5 obligation arises from this spec.
- **The canonical track-chooser model is RESOLVED as a modular gate** (Matt, §6 decision 6), but its **implementation is Phase 2 spec #10** (`qu-mutate-track`). Phase 1 keeps the hand-coded fork byte-identical; this is not a deferred decision for this spec, it is a deliberate phase boundary.
- **The SPA render path is untouched** — `StudioShell` continues to hand-place `TrackStep` via its `activeStepId` switch; `manifest[].component` stays unrendered. Any component-resolution-by-manifest move is Phase 2 and requires parity proof (§2.4 step 4).
- **No contracts bump and no `mutate()`** — `track` writes no IR leaf in Phase 1; all contracts decisions are deferred to Phase 2 (migration-plan §6).
- **"Byte-identical" for `track`** means the resolved next-step id / branch selection (and the `TrackStep` render) equal today's, verified by a flow-routing snapshot — not source-identical components.
