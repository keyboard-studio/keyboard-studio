# Phase 0 Research: Dashboard-honest flow map (P0)

All items below resolve the Technical Context choices. No `NEEDS CLARIFICATION` markers remained from the spec (the three were closed in the 2026-06-26 `/speckit-clarify` session); this file records the *implementation* decisions the spec deliberately deferred to the plan.

## Decision 1 — Loader-agnostic graph core, modular adapter for Phase B

**Decision**: Extract the graph-building logic in `buildFlowGraph.ts` so it operates on already-parsed `FlowQuestion[]` (a `FlowDef`), and provide two thin entry points: the existing `parseFlow` path (A/F/identity-lite) and a new `loadModularFlow` path (Phase B). `FlowMapView.tsx` switches only the **Phase B** source to the modular manifest (`phase_b_characters.modular.yaml`) + registry.

**Rationale**: `loadModularFlow(raw)` already returns the same `FlowDef`/`FlowQuestion[]` shape `parseFlow` produces, and the graph core (`nodeLabel`, `next`→edge extraction, dangling detection) only depends on that shape. So "what runs" for Phase B (registry-resolved manifest) flows through the *identical* edge/label logic the runner mirrors — satisfying FR-001/FR-002 with no behavioral divergence in how edges are drawn. A/F/identity-lite stay on `parseFlow` because their legacy YAML *is* their runtime source today (FR-004); switching them is P3, not P0.

**Alternatives considered**:
- *Rewrite the builder to read the registry directly per phase.* Rejected — duplicates the edge logic and risks the map and runner diverging again, the very problem P0 fixes.
- *Switch all phases to modular now.* Rejected — A/F/identity-lite have no modular runtime yet (identity-lite has no `*.modular.yaml` at all); doing so would make the map *dishonest* for those phases. That cutover is P3.

## Decision 2 — Fail visible, never fall back to legacy YAML (FR-011)

**Decision**: If the modular Phase B load throws (empty/unparseable manifest, or a manifest ID absent from the registry — `loadModularFlow` already throws on all three), the Phase B graph surfaces the error visibly (the viewer already has an error slot per section) and renders no Phase B nodes; it does **not** catch-and-fall-back to `phase_b_characters.yaml`.

**Rationale**: A silent fallback to the legacy YAML would re-introduce exactly the ghost/missing-node dishonesty P0 exists to remove, and would do so invisibly. `loadModularFlow`'s existing throw-on-unknown-ID behavior is an asset here — it turns a stale manifest into a loud failure.

**Alternatives considered**: *Best-effort fallback to YAML on error.* Rejected per FR-011 — honesty over resilience for a dev/authoring tool.

## Decision 3 — Reserve ("library / not-in-flow") nodes (FR-008)

**Decision**: Compute the reserve set as `Object.keys(phaseBRegistry)` minus the IDs the modular manifest references, and emit each as a node of a distinct kind (`library-not-in-flow`) that the renderer styles differently and labels as not running. Live (manifest-referenced) nodes keep the normal kind; FR-002's "no ghost nodes" holds because a *live* node always maps to a step that runs, and a library node never claims to.

**Rationale**: The registry already contains every authored Phase B module; the manifest is the runtime subset. The set difference is the §3.8 reserve, computable with no new data source. This is the clarified (2026-06-26) behavior — surface the building-block catalog without lying about what runs.

**Alternatives considered**:
- *Only-what-runs (the recommended option in clarify, not chosen).* Would have shown no reserve nodes and deferred all of §3.7 surfacing; maintainer chose to surface them.
- *Toggle-gated reserve nodes.* Rejected — adds a UI affordance P0 otherwise avoids; a static visual distinction is enough.

## Decision 4 — Stub stages in a "not-yet-ordered" region (FR-005/FR-007)

**Decision**: Maintain a small **P0-local static list** of the non-question stages — the carve / mechanism / touch galleries and the five hand-built wizard steps (`TrackStep`, `ProjectNameStep`, `ScaffoldForm`, `TrackOneIdentityPanel`, `BaseResolution`) — and emit each as a `stub` node grouped in a separate "not-yet-ordered" region, carrying only a title/kind (FR-006: no fabricated inputs/writes/ordering).

**Rationale**: These components have no `id`/`prompt`/`next`, so they cannot be discovered from any manifest in P0; a hand-maintained list is the honest minimum. They cannot be correctly *ordered* until the P4 manifest exists, so a dedicated region avoids implying a spine sequence. The list is explicitly temporary — P4's `steps/manifest.ts` replaces it.

**Alternatives considered**:
- *Best-effort inline placement from `StudioShell`'s hardcoded `SurveyStage` union.* Rejected — encodes an ordering P0 doesn't own and P4 rewrites; risks looking authoritative.
- *Derive stubs by scanning components.* Rejected — over-engineered for P0; no stable signal to scan on (that is what P4's manifest provides).

## Decision 5 — Verification: derived-equality + edge/label snapshot (FR-010)

**Decision**: Two-part check. (1) A **derived-equality** unit test asserting the set of *live* Phase B nodes equals the registry-resolved manifest ID set (`loadModularFlow(phase_b_characters.modular.yaml)` question IDs) — directly encoding FR-002, robust against incidental graph changes. (2) An **edge/label snapshot** of the Phase B graph to catch branch-routing/labelling regressions. Library and stub nodes are asserted separately (presence + kind), not folded into the live-equality set.

**Rationale**: A pure snapshot rots and silently re-baselines on intentional change — too weak for the baseline every later phase (P1–P5) is verified against. Derived equality makes "map == runtime" a hard assertion; the snapshot adds cheap regression coverage on the parts equality doesn't pin (edge labels, routing). This is the clarified (2026-06-26) shape.

**Alternatives considered**: *Snapshot only* / *derived-equality only* — each rejected in clarify; the combination is the chosen FR-010.

## Cross-cutting notes

- **Dependency-cruiser**: no new cross-package edge; `flowmap → survey` already exists. No `.dependency-cruiser.cjs` rule change anticipated. (Confirm `flowmap → survey/questions/registry.b` is within the same package and not a forbidden edge.)
- **Import extensions**: any new/moved import must keep explicit `.ts`/`.tsx` extensions (repo uses Bundler resolution with explicit extensions).
- **Team**: Engine (`km-frontend`) implements; no Content-owned surface (survey text, gallery ordering) is modified.
