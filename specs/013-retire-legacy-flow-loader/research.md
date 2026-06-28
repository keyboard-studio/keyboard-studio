# Phase 0 Research: Retire the legacy full-YAML survey flow loader

All decisions below are grounded in the verified current state of `packages/studio/src/flowmap/` and `packages/studio/src/survey/`. There were no open `[NEEDS CLARIFICATION]` markers from the spec; this file records the design choices that make the repoint (US1) safe so deletion (US2/US3) is mechanical.

## D1 — How the flow map sources A/F/identity-lite after repoint

**Decision**: Route all four flow-map sections through `buildModularFlowGraph(raw, title, registry)` reading the `*.modular.yaml` manifests, dropping the legacy `buildFlowGraph(raw, title)` entry point entirely.

**Rationale**: `parseFlow` and `loadModularFlow` both return a `FlowDef` with the same `{ flow_id, questions[] }` shape, and the graph core `buildGraphFromQuestions(flow, title, opts)` is already loader-agnostic. Phase B already proves the modular path produces a faithful map. Once A/F/identity-lite move over, the legacy `buildFlowGraph()` has no caller and would be the *only* remaining `parseFlow` importer — so it is removed in the same commit (satisfies FR-002: no `parseFlow` import left in `flowmap/`).

**Alternatives considered**:
- *Keep `buildFlowGraph()` but stop importing `parseFlow` (inline a parse)* — pointless; just moves the legacy parser. Rejected.
- *Defer flow-map repoint to a separate dashboard cutover (spec 010)* — the spec input explicitly scopes the repoint into 3b ("consumers must be repointed before deletion"). Rejected.

## D2 — `buildModularFlowGraph` registry parameter

**Decision**: Generalize the signature from `buildModularFlowGraph(raw, title)` (hardwired to `phaseBRegistry`) to `buildModularFlowGraph(raw, title, registry: Record<string, QuestionModule>)`. Callers pass the phase-appropriate registry:
- Phase A → `phaseARegistry`
- Phase F → `phaseFRegistry`
- Phase B → `phaseBRegistry` (unchanged behavior)
- identity-lite → `phaseARegistry` (its `il_*` modules live in `registry.a.ts`; identity-lite is the "Phase A head")

**Rationale**: `computeReserveNodes(flow, registry)` already takes a registry argument; only the public wrapper hardwired `phaseBRegistry`. Threading the registry through is the minimal change that keeps reserve-node semantics correct per section. Keeping the parameter explicit (no default) forces each call site to declare its registry and avoids a silent Phase-B default leaking into A/F.

**Alternatives considered**:
- *Compute reserves against the combined `questionRegistry`* — would flood every section's map with all other phases' modules as "library-not-in-flow." Misleading. Rejected.
- *Add a third public function per phase* — needless duplication; one parameterized function is clearer. Rejected.

## D3 — Reserve nodes newly appear on the A/F/identity-lite maps

**Decision**: Accept that the modular path adds `library-not-in-flow` reserve nodes to the A/F/identity-lite sections (the legacy `buildFlowGraph` computed none). This is a *more honest* map, consistent with Phase B, and does not violate "map == runtime": the **live** node set still equals the manifest's questions; reserve nodes are additively rendered as a distinct kind/region (`not-yet-ordered`).

**Specific effect**: identity-lite's reserve set (computed against `phaseARegistry`) will list the full Phase A questions not in the lite manifest. This is informative ("these exist but aren't in the lite flow"), matches the §3.8 library/reserve model, and is acceptable.

**Rationale**: SC-002 pins parity to the **live modular runtime**, not to the legacy-YAML map. Reserve nodes are a deliberate dashboard feature (the FlowLegend already documents the "reserve (not in live flow)" swatch). Surfacing them for A/F is the intended end state.

**Test consequence**: `buildFlowGraph.test.ts` assertions that counted "0 reserve nodes" for A/F (if any) are updated to the modular expectation. The live question-node set per phase must still match the manifest.

## D4 — Script-routing view repoint (`buildScriptRouting.ts`)

**Decision**: Swap `parseFlow(raw)` → `loadModularFlow(raw)` in `buildScriptRouting`, fed by `identity_lite.modular.yaml`. No other logic changes.

**Rationale**: `buildScriptRouting` only reads `flow.questions`, finds `il_target_script`, and walks its `options` + `next` branching (gate = branch lands on a `type: "notice"` node). Verified: the modular `il_target_script.ts` module preserves its `options` and its `next` rules routing `Ethi`/`Hani`/`Hang` → `il_script_not_supported`, which is `type: "notice"`. So `loadModularFlow` yields a `FlowDef` that produces byte-identical routing rows. `ScriptRoutingView` keeps its `identityLiteRaw: string` prop; only the manifest it is fed (in `FlowMapView`) changes from `identity_lite.yaml?raw` to `identity_lite.modular.yaml?raw`.

**Alternatives considered**:
- *Build routing from the registry module directly instead of the manifest* — larger change; the manifest+loader path already resolves the module. Rejected for minimality.

## D5 — Test retargeting before deletion

**Decision**: In the US1 commit, retarget `buildFlowGraph.test.ts` fixtures from the legacy `*.yaml?raw` imports to the `*.modular.yaml?raw` imports and assert against the modular graph. Delete `loadFlow.test.ts` in the US2 commit alongside `loadFlow.ts`.

**Rationale**: A test still importing a to-be-deleted YAML would break the US3 build (dangling `?raw`). Retargeting in US1 keeps each commit green (FR-009). The Phase 3a `flow-parity.test.ts` golden harness already guards runtime modular-vs-legacy equivalence and stays as the safety net; it does not import the legacy loader.

## D6 — Commit / revert ordering

**Decision**: Three commits in dependency order — (1) repoint + test retarget, (2) delete loader + its test, (3) delete four YAMLs. Revert order is the reverse (3 → 2 → 1).

**Rationale**: FR-010 / SC-006. After commit 1 the legacy files are dead (no consumer); commits 2 and 3 are pure deletions that revert cleanly via `git revert` / restore-from-git. Reverting only commit 1 without 2/3 would leave the map reading deleted YAMLs — hence reverse order.

## Out-of-scope confirmations (no research needed)

- **Functional manifest renames** (`phase_a_identity.modular.yaml` → `identity.modular.yaml`): deferred, not in 3b (spec Assumptions).
- **Prose / `// Ported verbatim from …` comment references**: historical, not live consumers; untouched (FR-008 scopes to shipped code).
- **`content/flows/README.md`**: references the legacy filenames descriptively. Update is optional doc hygiene, not required by an FR; flag for `km-doc` if desired but it is not a code consumer.
