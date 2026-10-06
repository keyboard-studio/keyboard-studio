# Phase 1 Data Model: Dashboard-honest flow map (P0)

P0 introduces no persisted data. The "model" here is the in-memory **graph** the viewer derives at render and the node taxonomy that makes the map honest. It extends the existing `flowmap/model.ts` types (`GraphNode`, `GraphEdge`, `FlowGraph`); fields below are the P0-relevant additions, not a full redefinition.

## Entity: GraphNode (extended)

A node in the rendered flow map.

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Stable node id. For live/library nodes, the question `definition.id`; for stubs, a synthetic id for the stage. |
| `label` | `string` | Display text. `prompt ?? label ?? id` for questions (unchanged); stage title for stubs. |
| `kind` (extended) | `"live" \| "library-not-in-flow" \| "stub"` | **New P0 distinction.** `live` = a step the runtime runs (manifest-referenced for Phase B); `library-not-in-flow` = a registered Phase B module no manifest references (§3.8 reserve, FR-008); `stub` = a gallery/wizard stage with no question metadata (FR-005). Existing edge/branch kinds on `GraphEdge` are unaffected. |
| `region` | `"flow" \| "not-yet-ordered"` | **New P0 grouping.** `live` nodes live in `flow`; **both** `stub` (FR-007) **and** `library-not-in-flow` (FR-008) nodes live in `not-yet-ordered` — neither has a place in the ordered live spine, so both group out of `flow`. |
| `phase` | `string` | Which section the node belongs to (Phase B vs A/F/identity-lite), as today. |

**Validation / invariants**:
- A `live` node MUST correspond to a step the runtime runs (FR-002 — no ghost nodes). For Phase B this means its id is in the modular manifest's resolved set.
- A `library-not-in-flow` node MUST NOT be counted in the live-equality verification set (Decision 5), MUST be rendered visibly distinct from `live`, and carries `region: "not-yet-ordered"` (it is not part of the ordered live spine).
- A `stub` node MUST carry only `id`/`label`/`kind`/`region` — no `inputs`, `writes`, completeness, or precise ordering (FR-006).

## Entity: GraphEdge (unchanged shape, modular-sourced for Phase B)

Edges are derived from `definition.next` exactly as today (`buildFlowGraph.ts` mirrors `SurveyRunner.resolveNext`): a string `next` → one linear edge; `null`/absent → terminal; `FlowGotoRule[]` → one edge per rule (conditional rules carry condition text; `default` → "(else)"); a dangling target (`to` not in the known id set) is flagged `dangling` rather than dropped.

**P0 change**: for Phase B these edges are computed over the **modular-resolved** `FlowQuestion[]` rather than the legacy-YAML-parsed list, so the routing shown is the routing that runs (FR-003). A Phase B branch targeting an id absent from the live set surfaces as a `dangling` edge (FR-003 — not silently dropped).

## Entity: FlowGraph (per section)

`{ nodes: GraphNode[]; edges: GraphEdge[]; title: string }` (existing). One per section. P0 keeps four sections (Phase B modular; A/F/identity-lite legacy) plus the `not-yet-ordered` region for stubs.

## Derived sets (computed, not stored)

| Set | Definition | Used by |
|---|---|---|
| **Live Phase B set** | question IDs from `loadModularFlow(phase_b_characters.modular.yaml)` | FR-002 nodes; Decision 5 derived-equality test |
| **Reserve set** | `Object.keys(phaseBRegistry)` − Live Phase B set | FR-008 `library-not-in-flow` nodes |
| **Stub stages** | P0-local static list (3 galleries + 5 wizard steps) | FR-005/FR-007 `stub` nodes in `not-yet-ordered` |

## State transitions

None. The graph is recomputed from source on render; there is no mutable feature state, no lifecycle. (The `staleness` store slice mentioned in the plan doc §3.5 belongs to later phases, not P0.)
