---

description: "Task list for Dashboard-honest flow map (P0)"
---

# Tasks: Dashboard-honest flow map (P0)

**Input**: Design documents from `specs/010-dashboard-honest-flow-map/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/flow-graph.md](./contracts/flow-graph.md), [quickstart.md](./quickstart.md)

**Tests**: INCLUDED — the verification check (FR-010: derived-equality + edge/label snapshot) is a core deliverable of P0, not optional TDD. It is the honest-map guarantee every later phase (P1–P5) is verified against.

**Team / ownership**: Engine team — `km-frontend` (SPA / `flowmap/` infrastructure). No Content-owned surface (survey text, gallery ordering) is modified.

**Organization**: grouped by user story. US1 and US2 are both P1; US1 is the MVP (Phase B honesty). US3 (P2) hardens the verification into the durable baseline.

**GitHub issues** (keyboard-studio/keyboard-studio): US1 → #660 (incl. Setup/Foundational) · US2 → #661 · US3 → #662 (incl. Polish). Reconcile AC checkboxes against the shipped diff per the issue-closure policy at PR open.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 (Setup / Foundational / Polish carry no story label)
- All paths are repo-relative.

---

## Phase 1: Setup

**Purpose**: Establish a known-good baseline before refactoring an existing module.

- [ ] T001 Capture baseline: run `pnpm --filter @keyboard-studio/studio test src/flowmap/` and `pnpm --filter @keyboard-studio/studio test src/survey/loadModularFlow.test.ts`; record that they are green before any change (no file edits).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The loader-agnostic graph core and node taxonomy every story builds on.

**⚠️ CRITICAL**: No user-story work can begin until this phase is complete.

- [ ] T002 Extend the node model in `packages/studio/src/flowmap/model.ts`: add `kind: "live" | "library-not-in-flow" | "stub"` and `region: "flow" | "not-yet-ordered"` to `GraphNode` (default existing nodes to `live`/`flow`); update `FlowGraph` and any exported types so the additions typecheck. Per [data-model.md](./data-model.md).
- [ ] T003 Refactor `packages/studio/src/flowmap/buildFlowGraph.ts` to extract a loader-agnostic core `buildGraphFromQuestions(questions: FlowQuestion[], title)` and make the existing `buildFlowGraph(raw, title)` (parseFlow path) a thin wrapper over it — **no behavior change** for A/F/identity-lite. Preserve explicit `.ts` import extensions. (depends T002)

**Checkpoint**: graph core is loader-agnostic and node kinds exist — stories can begin.

---

## Phase 3: User Story 1 - Map reflects what actually runs for Phase B (Priority: P1) 🎯 MVP

**Goal**: Phase B nodes are derived from the live modular registry/manifest — no ghost/missing nodes — with reserve modules shown as distinct "library / not-in-flow" nodes, and a failed modular load failing visibly rather than falling back to legacy YAML.

**Independent Test**: the live Phase B node-id set equals `loadModularFlow(phase_b_characters.modular.yaml)`'s resolved id set (derived-equality test), with zero nodes sourced from `phase_b_characters.yaml`.

### Implementation for User Story 1

- [ ] T004 [US1] Add a modular Phase B entry point in `packages/studio/src/flowmap/buildFlowGraph.ts`: build the Phase B graph from `loadModularFlow(...)`-resolved `FlowQuestion[]` via the T003 core, marking question nodes `kind: "live"`. (depends T003)
- [ ] T005 [US1] Repoint the Phase B source in `packages/studio/src/flowmap/FlowMapView.tsx` from `content/flows/phase_b_characters.yaml?raw` to the modular manifest (`phase_b_characters.modular.yaml`) + registry path; leave A/F/identity-lite on `parseFlow`. (depends T004)
- [ ] T006 [US1] Implement fail-visible behavior (FR-011) in `packages/studio/src/flowmap/FlowMapView.tsx`: on a modular load throw (empty/unparseable manifest, or unknown id), surface the existing per-section error and render no Phase B nodes; **never** catch-and-fall-back to the legacy YAML. (depends T005)
- [ ] T007 [US1] Compute the reserve set (FR-008) in `packages/studio/src/flowmap/buildFlowGraph.ts`: `library-not-in-flow` ids = `Object.keys(phaseBRegistry)` − live ids; emit them as `kind: "library-not-in-flow"` nodes. (depends T004)
- [ ] T008 [P] [US1] Render `live` vs `library-not-in-flow` nodes distinctly (reserve marked not-running) in `packages/studio/src/flowmap/FlowGraphView.tsx`. (depends T002)
- [ ] T009 [US1] Confirm/adjust Phase B branch routing (FR-003) in `packages/studio/src/flowmap/buildFlowGraph.ts`: a `definition.next` target absent from the live set surfaces as a `dangling` edge, not dropped. (depends T004)

### Tests for User Story 1

- [ ] T010 [US1] Add the derived-equality test (FR-010 Part A) + reserve assertion (Part B reserve) in `packages/studio/src/flowmap/buildFlowGraph.test.ts`: live Phase B node ids == `loadModularFlow(phase_b_characters.modular.yaml)` ids; library ids == registry keys − live ids. (depends T004, T007)
- [ ] T011 [US1] Add the Phase B edge/label snapshot (FR-010 Part C) in `packages/studio/src/flowmap/buildFlowGraph.test.ts`; review the first-run snapshot before committing. (depends T004, T009)

**Checkpoint**: 🎯 MVP — the Phase B map is honest (no ghost/missing), reserve modules surfaced, failures loud, and the honesty assertion is in place.

---

## Phase 4: User Story 2 - Galleries and wizard steps visible as stub nodes (Priority: P1)

**Goal**: The carve/mechanism/touch galleries and the five hand-built wizard steps appear as stub nodes in a separate "not-yet-ordered" region, so no whole stage is invisible.

**Independent Test**: render the map and confirm each gallery + wizard step appears once as a `stub`/`not-yet-ordered` node carrying title/kind only (no fabricated inputs/writes/ordering).

### Implementation for User Story 2

- [ ] T012 [US2] Create the P0-local stub-stage list in `packages/studio/src/flowmap/stubStages.ts`: the 3 galleries (carve, mechanism, touch) + 5 wizard steps (TrackStep, ProjectNameStep, ScaffoldForm, TrackOneIdentityPanel, BaseResolution), each a `{ id, title }` with a synthetic stable id. Per [research.md](./research.md) Decision 4. (depends T002)
- [ ] T013 [US2] Emit `stub` nodes (`kind: "stub"`, `region: "not-yet-ordered"`, title/kind only) from the stub list into the assembled graph in `packages/studio/src/flowmap/buildFlowGraph.ts` (or the FlowMapView assembly point). (depends T012, T003)
- [ ] T014 [P] [US2] Render the "not-yet-ordered" region and stub-node styling in `packages/studio/src/flowmap/FlowGraphView.tsx` (and `layout.ts` / `tokens.ts` if region placement needs it). (depends T002)

### Tests for User Story 2

- [ ] T015 [US2] Add the stub-presence assertion (FR-005/006/007) in `packages/studio/src/flowmap/buildFlowGraph.test.ts`: each stub stage appears exactly once as `kind: "stub"` / `region: "not-yet-ordered"` and carries no `inputs`/`writes`/ordering fields. (depends T013)

**Checkpoint**: every stage is visible — Phase B live + reserve + the previously-invisible galleries/wizard steps.

---

## Phase 5: User Story 3 - The map is a trustworthy verification baseline (Priority: P2)

**Goal**: The honesty checks form a durable baseline later phases are verified against — a runtime step add/remove/rename is caught, and intentional changes re-baseline only the snapshot, not the hard equality.

**Independent Test**: add/remove a Phase B step in the manifest and confirm the derived-equality test fails (then revert).

### Implementation for User Story 3

- [ ] T016 [US3] Consolidate Parts A/B/C into a coherent suite in `packages/studio/src/flowmap/buildFlowGraph.test.ts` and confirm it runs under `pnpm --filter @keyboard-studio/studio test`; ensure an intentional change re-baselines only the snapshot (Part C), while Part A (set equality) stays a hard assertion. (depends T010, T011, T015)
- [ ] T017 [US3] Verify the honesty + fail-visible regression probes in [quickstart.md](./quickstart.md) against the final code (manifest add/remove ⇒ Part A fails; malformed manifest ⇒ visible error, no fallback); correct the quickstart if any step drifted. (depends T016)

**Checkpoint**: the "map == runtime" guarantee is enforced by CI-runnable tests — the baseline P1–P5 build on.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T018 [P] Run `pnpm lint` and `pnpm depcruise`; confirm no new forbidden `flowmap → survey` edge was introduced and explicit `.ts`/`.tsx` import extensions are preserved.
- [ ] T019 Run `pnpm --filter @keyboard-studio/studio test` and `pnpm typecheck`; all green.
- [ ] T020 Run the [quickstart.md](./quickstart.md) end-to-end (the `pnpm dev` eyeball pass for FR-002/004/005/008/009 plus the test signal).
- [ ] T021 [P] At PR open, update the `docs/survey-modularity-cyoa-plan.md` P0 status note and any `docs/github_flow.md` row if affected (km-archivist; reconcile spec ACs per the issue-closure policy).

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)** → no deps.
- **Foundational (P2: T002→T003)** → blocks all stories.
- **US1 (P3)** → after Foundational. MVP.
- **US2 (P4)** → after Foundational; independent of US1 (shares only the T002 model + T003 core). Can run in parallel with US1 if staffed.
- **US3 (P5)** → after US1 + US2 tests exist (T010/T011/T015).
- **Polish (P6)** → after the desired stories.

### Within stories

- T002 before T003 (types before core).
- US1: T004 → {T005→T006, T007, T009}; T008 parallel after T002; tests T010/T011 after their targets.
- US2: T012 → T013; T014 parallel after T002; T015 after T013.

### Parallel opportunities

- **US1 ∥ US2**: once T003 lands, the two stories touch mostly different files; the shared files (`buildFlowGraph.ts`, `FlowGraphView.tsx`, `buildFlowGraph.test.ts`) must be coordinated (sequence edits to those, parallelize the rest).
- `[P]` tasks: T008 (US1 render) and T014 (US2 render) are independent; T018 and T021 are independent.

---

## Parallel Example: after Foundational

```text
# Sequence the shared-file edits; parallelize the rest.
Track A (US1): T004 → T005 → T006 ; T007 ; T009 ; then T010, T011
Track B (US2): T012 → T013 ; then T015
Both: T008 / T014 (render, [P]) once T002 is in
```

---

## Implementation Strategy

### MVP first (US1 only)

1. Phase 1 Setup → Phase 2 Foundational (T002, T003).
2. Phase 3 US1 (T004–T011).
3. **STOP & VALIDATE**: derived-equality + snapshot green; eyeball Phase B in `pnpm dev`. This alone delivers the honest Phase B map + the "map == runtime" assertion.

### Incremental delivery

US1 (MVP, honest Phase B + reserve) → US2 (stubs for galleries/wizard steps) → US3 (harden the baseline) → Polish. Each is an independently testable increment.

---

## Notes

- `[P]` = different files, no incomplete-task dependency. `[Story]` maps to spec user stories for traceability.
- Don't run bare `vitest` at repo root (root config has empty `include`); always use the package filter.
- Keep the change read-only — no authoring affordance (that is the deferred [009-flow-map-editor](../009-flow-map-editor/spec.md)).
- No emoji in any console/log output; no GitHub issue numbers in shipped code/comments (cross-link via the PR body); commit titles `refactor(studio): …` / `feat(studio): …` / `test(studio): …`.
- `feature.json` is shared with a concurrent `011-ui-primitives` session — it is currently pointed at `010`; restore it to `011` if that session needs it back.
