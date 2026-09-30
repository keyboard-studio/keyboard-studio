# Contract: Flow-map graph + verification (P0)

This feature exposes a **UI contract** (what the read-only viewer renders) and a **verification contract** (the automated check that keeps the map honest). No network/API surface.

## UI contract — what the map renders

For each survey section the viewer renders a `FlowGraph` of nodes and edges. P0 guarantees:

1. **Phase B nodes are live-sourced.** The set of `kind: "live"` Phase B nodes equals the set of steps the runtime runs (the modular registry resolved through `phase_b_characters.modular.yaml`). No live node lacks a runtime step (no ghost); no runtime step lacks a live node (no missing). *(FR-001, FR-002)*
2. **Phase B routing reflects runtime.** Edges are derived from `definition.next` over the modular-resolved questions; a route to an id absent from the live set is shown as a `dangling` edge, never dropped. *(FR-003)*
3. **A/F/identity-lite remain honestly legacy-sourced.** Those sections still build from their `content/flows/*.yaml` (their current runtime source) and are neither blanked nor broken by the Phase B switch. *(FR-004)*
4. **Reserve modules appear, distinguished.** Each registered Phase B module the manifest does not reference renders as `kind: "library-not-in-flow"`, visually distinct and marked not-running. *(FR-008)*
5. **Galleries + wizard steps appear as stubs.** Carve/mechanism/touch galleries and the five wizard steps render as `kind: "stub"` nodes in the `region: "not-yet-ordered"` group, carrying title/kind only. *(FR-005, FR-006, FR-007)*
6. **Read-only.** No node/edge is editable; no reorder, constraint-edit, or promotion affordance exists. *(FR-009)*
7. **Fail visible.** A failed modular load renders a visible per-section error and no Phase B nodes — never a silent fallback to legacy YAML. *(FR-011)*

## Verification contract — the honesty check *(FR-010)*

A test-time contract (vitest), not a runtime API:

### Part A — derived-equality (the hard guarantee)

```
liveNodeIds(buildPhaseBGraph())  ==  questionIds(loadModularFlow(phase_b_characters.modular.yaml))
```

- LHS: the ids of `kind: "live"` nodes the builder emits for Phase B.
- RHS: the ids the modular loader resolves from the live manifest against `phaseBRegistry`.
- The two sets MUST be **equal** (same membership). A later-phase change that adds/removes/renames a runtime step fails this test unless the map tracks it. *(FR-002, FR-008 guard: library ids are excluded from LHS and RHS.)*

### Part B — reserve + stub presence

- `libraryNodeIds(graph) == keys(phaseBRegistry) − liveNodeIds(graph)` *(FR-008)*
- Every stub stage in the P0-local list appears exactly once as a `kind: "stub"`, `region: "not-yet-ordered"` node *(FR-005/FR-007)*

### Part C — edge/label snapshot (regression coverage)

A snapshot of the Phase B graph's edges and node labels, to catch routing/labelling drift that set-equality does not pin. Intentional changes re-baseline the snapshot; Part A remains the authoritative "map == runtime" assertion. *(FR-003, FR-010)*

## Non-goals (contract boundaries)

- No `inputs`/`writes`/`IRPath` metadata on any node (P2).
- No manifest-driven ordering of stubs (P4) — hence the `not-yet-ordered` region.
- No completeness/staleness/acyclicity/rejoin checks (P5 dashboard) — P0 verifies only node-set honesty + edge regression.
- No authoring write-back (the deferred [009](../../009-flow-map-editor/spec.md) editor).
