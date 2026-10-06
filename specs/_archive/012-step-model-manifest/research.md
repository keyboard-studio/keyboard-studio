# Phase 0 Research: Unified Step Model + Manifest-Driven Survey Ordering

**Feature**: 012-step-model-manifest | **Date**: 2026-06-27

No `[NEEDS CLARIFICATION]` markers remained after the 2026-06-27 clarification session (folder names, two-PR delivery, shippability-as-structural-proxy all resolved in [spec.md](spec.md) → Clarifications). This document records the design decisions that ground the plan, each derived from the current code (audited 2026-06-27) and the governing plan ([docs/survey-modularity-cyoa-plan.md](../../docs/survey-modularity-cyoa-plan.md)).

---

## D1 — Prop normalization: per-editor adapters vs. rewriting editors to one signature

**Decision**: Introduce thin **adapter** wrappers (`editors/adapters/`) that map each editor's current props to the one `EditorStepProps` contract (`onComplete(result)` / `onBack` / `ctx`). Editors keep their existing internal signatures during P4a.

**Rationale**: The audit confirmed the editors use **non-uniform callbacks** — `TrackStep` (`onNext(track)`), `ProjectNameStep` (`onNext(displayName, keyboardId)`), `BaseResolution` (`onResolved(base)`), `ScaffoldForm` (`onSubmit(spec)`), `TrackOneIdentityPanel` (no props, reads store), while the three galleries already use `onComplete`/`onBack`. Rewriting all of them to one signature in P4a would change component internals and risk the "byte-identical" guarantee (SC-002). An adapter layer keeps each component untouched, isolates the normalization, and makes P4a revertible by deleting the adapter and repointing imports (SC-009, FR-006).

**Alternatives considered**:
- *Change every editor to accept `EditorStepProps` directly* — rejected: touches component internals, breaks byte-identical isolation, larger blast radius for the same end state.
- *A single generic HOC* — rejected: the prop shapes differ enough (result payloads: `Track`, `{displayName, keyboardId}`, `BaseKeyboard`, `ScaffoldSpec`, void) that one HOC would need per-editor config anyway; explicit small adapters are clearer and individually testable.

---

## D2 — Where side effects live: a step-id-keyed reducer

**Decision**: Move the three inline side effects out of `SurveyView` into a single `steps/reducer.ts` keyed by step id, invoked on each step's `onComplete`. Editors stay pure (they only call `onComplete(result)`).

**Rationale**: The audit pinned the three side effects exactly: `lockDesktop()` at mechanisms-complete (`StudioShell.tsx:377`), the `buildTouchLayoutJson` block at touch/Phase-E-complete (`StudioShell.tsx:388–410` → `setTouchLayoutJson`), and the copy/adapt branch in `onInstantiate` (`StudioShell.tsx:240–253`, calling `instantiateFromExisting` vs `instantiateFromBaseIfConfirmed`). All three already call existing store actions and pure helpers — the reducer is a **routing** change, not a logic rewrite, which keeps behavior identical while removing the hardcoded ordering coupling (FR-011, §3.4). Keying by step id (not by stage enum) is what lets ordering move entirely to the manifest.

**Alternatives considered**:
- *Keep side effects in components, fire on completion* — rejected by the plan (§3.4): re-couples editors to flow transitions and prevents pure, reorderable editor-steps.
- *One monolithic switch in SurveyView* — rejected: that is the `SurveyStage` coupling we are removing; the reducer must be addressable by step id so the manifest is the only ordering source.

---

## D3 — Manifest representation: a typed TS module, not YAML

**Decision**: `steps/manifest.ts` is a typed TypeScript module (an ordered array of `Step` objects), not a YAML file.

**Rationale**: Steps reference React component types (editor-steps), `IRPath[]` `inputs`/`writes`, and `joinTarget` ids — all of which are compile-checked when the manifest is TS. The plan's target tree (§4) names `steps/manifest.ts`. YAML would lose the type safety that makes an invalid path/id a compile error (the whole point of P2's `IRPath`). Question-steps reference question modules **by `definition.id`** (resolved through the existing registry), keeping the registry the single resolver and the manifest free of question bodies.

**Alternatives considered**:
- *Reuse `content/flows/*.modular.yaml`* — rejected: those are Content-owned thin question manifests for the loader; the step manifest is a superset (galleries + panels + lock/spine metadata) that needs types. The two stay distinct; the step manifest references question ids that the modular flow also lists.

---

## D4 — Completeness checks: five distinct functions, graph built once

**Decision**: `dashboard/completeness.ts` exposes the five §3.5 checks as **separate** functions over a `writes → inputs` graph derived from the manifest: (1) transitive staleness closure to a fixpoint; (2) acyclicity (hard error on cycle); (3) side-trail rejoin (`joinTarget` reachability to a spine step); (4) spine-prefix shippability (structural proxy); (5) inputs-satisfiability (no orphan inputs).

**Rationale**: The spec (US3) and plan (§3.5) are explicit that these are **distinct invariants** a one-hop check would conflate. Staleness must iterate to a fixpoint (a 2-edge-distant dependent is real); acyclicity is a precondition for staleness termination; rejoin can't be inferred from `next` alone; shippability is a different question from inputs-satisfiability. Keeping them as separate, independently-testable functions matches SC-006 (each flagged independently on a crafted-violation fixture).

**Spine-prefix shippability is a structural proxy this phase** (Clarifications 2026-06-27): assert each spine prefix leaves a **complete, lock-consistent working copy** (relying on the base-template guarantee that the project always starts shippable). The completeness check **does not invoke the validator** — that is reserved for P5 when `mutate()` lands. This keeps P4b a pure ordering/map refactor with no new validation path (Constitution Art. IV).

**Alternatives considered**:
- *Single combined "is the flow valid?" check* — rejected: hides which invariant failed, untestable per SC-006.
- *Invoke the validator per prefix now* — rejected by clarification: pulls the validator into the dashboard, adds runtime cost, and overlaps the P5 `mutate` seam.

---

## D5 — `staleness` store slice: derived set, defaults fresh

**Decision**: Add a `staleness` slice to `workingCopyStore` holding the recomputed set of currently-stale step ids, recomputed when a lock breaks or a step is re-answered; pre-existing state defaults to "fresh" (empty stale set).

**Rationale**: The audit confirmed `workingCopyStore` already holds `desktopLocked` and the survey-results slices but **no staleness state** (§3.5 calls this net-new). Staleness is mutable UI state derived from the manifest graph + which steps were re-opened, so it belongs in the store alongside `desktopLocked`/`unlockDesktop`. Defaulting to "fresh" is the conservative, non-breaking default (FR-019).

**Alternatives considered**:
- *Compute staleness on every render in the dashboard* — rejected: it must persist across the survey (a broken lock marks downstream stale until re-answered), so it is state, not a render-time derivation.

---

## D6 — Touch provenance + `touchSuggest`: reserved in the studio editor layer, not in contracts

**Decision**: Reserve the per-key provenance tag and the `touchSuggest` defaults-as-data policy in `editors/assignLoop/provenance.ts` and `editors/touchSuggest/` respectively. No propagation logic; pre-existing touch keys default to `hand-set`.

**Rationale**: The audit confirmed provenance does not yet exist on the touch surface. Placing it in the **studio editor layer** (not `packages/contracts`/`TouchKeyIR`) keeps this phase off the locked-contract path (Constitution Art. I). The plan notes that moving provenance into `TouchKeyIR` is part of the already-ratified P5 major contract bump — out of scope here. Reserving it now (defaulting to `hand-set`, the never-auto-overwritten tag) is exactly the §8 mitigation against late-added provenance clobbering existing edits (FR-020, FR-021). `touchSuggest` policy is overridable declarative data so it is extensible without touching the gallery.

**Alternatives considered**:
- *Add provenance to `TouchKeyIR` now* — rejected: that is a `packages/contracts` major bump (P5 scope); doing it here would violate the "ordering and map only" boundary (FR-022).
- *Defer provenance entirely to P5* — rejected by §8 risk: if added late, existing touch edits carry no provenance and the first propagation could clobber them.

---

## D7 — Dashboard rename and data source

**Decision**: Rename `flowmap/` → `dashboard/`, `FlowMapView.tsx` → `DashboardView.tsx`, `buildFlowGraph.ts` → `buildStepGraph.ts`. The graph builder reads `steps/manifest.ts` for the full step set; it retains the existing modular-registry resolution (P0) for question bodies.

**Rationale**: The audit confirmed P0 already gave `buildFlowGraph.ts` a `buildModularFlowGraph` path that reads the live Phase B registry, plus a legacy YAML path for A/F. P4b points the builder at the manifest so the **whole** step set (galleries + panels included) is rendered, achieving map == runtime (FR-010). The rename is the §8 "decide names before P4a" item, now resolved to the plan's proposed names (Clarifications 2026-06-27).

**Sequencing note**: The rename touches many imports (strict explicit `.ts`/`.tsx` extensions — §8 constraint). Do it as a single mechanical move within P4b, with extension-preserving updates.

**Alternatives considered**:
- *Keep `flowmap/`* (clarify option B) — not chosen; user selected adopting the plan's proposed names (option A).

---

## D8 — Dependency-cruiser layering (all net-new)

**Decision**: Add intra-`studio/src` rules: `ui/` stays a leaf (P1, unchanged); `steps/` may depend on `survey/` (registry) + `editors/`; `dashboard/` may read `steps/` + `contracts` + `ui/`; **`editors/ → stores/` and `editors/ → lib/` are explicitly ALLOWED**.

**Rationale**: The audit confirmed the **only** existing intra-studio rule is the `ui/` leaf (feature 011); everything else here is net-new (§8). The galleries genuinely bind `stores/workingCopyStore.ts` and `lib/irToCarveNodes.ts` / `lib/buildTouchLayoutJson.ts`, so those edges must be whitelisted, not forbidden (FR-007). dependency-cruiser rules are treated as architectural contracts in this repo, so these belong in the plan/spec, not just code.

**Alternatives considered**:
- *No new rules* — rejected: without them the new layering is unenforced and will rot as P5 lands.
- *Forbid `editors/ → stores/`* — rejected: that edge is intentional (the galleries mutate the working copy today).

---

## Summary of resolved unknowns

| Unknown | Resolution |
|---|---|
| Prop normalization strategy | Per-editor adapters (D1) |
| Side-effect home | Step-id-keyed reducer (D2) |
| Manifest format | Typed TS module (D3) |
| Completeness check shape | 5 distinct functions; shippability = structural proxy (D4) |
| Staleness state location | New `workingCopyStore` slice, defaults fresh (D5) |
| Provenance / touchSuggest placement | Studio editor layer, reserved, no propagation (D6) |
| Dashboard naming + source | `dashboard/` reading the manifest (D7) |
| Boundary rules | Net-new depcruise layering; `editors/→stores/+lib/` allowed (D8) |
