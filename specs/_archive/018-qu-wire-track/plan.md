# Implementation Plan: Wire track — TrackStep resolves as its first-class manifest node (fork preserved)

**Spec**: [spec.md](./spec.md) · **Phase**: 1 (Question Unification) · **Spec #**: 4 of 8 · **Branch**: `speckit/question-unification-phase1-specs`

**Source**: [docs/design-notes/question-unification-migration-plan.md](../../docs/design-notes/question-unification-migration-plan.md) §2.1 track row, §2.4 step 4, §2.5 branch/read-only oracle, §5 spec #4, §6 decision 6 (RESOLVED — modular gate canonical, fork-to-YAML deferred to Phase 2 spec #10); findings [question-unification-findings.md](../../docs/design-notes/question-unification-findings.md) (b) track row.

## Summary

Confirm the `track` editor-step — **already** declared at `registerEditorSteps.ts:71-79` and `manifest.ts:77` (`spine:true`), with its `inputs`/`writes` populated by spec 017 — resolves as a first-class branch-defining node on the rendered Flow Map (it gets the node automatically from the spec-015 map adapter), while its hand-coded copy-vs-adapt fork in `StudioShell.handleTrackSelected` (`StudioShell.tsx:602-614`) is preserved byte-identically. Add a flow-routing snapshot (the §2.5 branch/read-only oracle) that locks the resolved next-step id / branch selection for both tracks. No new write routing, no `mutate()`, no contracts bump, SPA render unchanged, fork stays in code (the YAML-fork move is Phase 2 spec #10).

## Why this is mostly a confirmation + a regression lock (the core design constraint)

| Concern | State entering this spec | What this spec does |
|---|---|---|
| `track` manifest entry | **Already exists** (`registerEditorSteps.ts:71-79`, `manifest.ts:77`, `spine:true`) | Nothing — must NOT re-declare or add a second entry |
| `track` `inputs`/`writes` | **Declared by spec 017** (dependency) | Nothing — consumes the 017 contract; confirms it renders on the node |
| `track` map node | **Rendered by the spec-015 adapter** automatically | Nothing — confirms the node resolves; asserts it via the map-projection assertions |
| copy-vs-adapt fork | **Hand-coded in `handleTrackSelected`** (`StudioShell.tsx:602`) | Preserve byte-identically; lock with a flow-routing snapshot |
| fork-in-YAML | Phase 2 (spec #10) | Explicitly NOT done here |

So the only *new artifact* this spec adds is the **branch/read-only oracle test** (the flow-routing snapshot). Everything else is a confirmation that the already-declared, already-projected `track` step resolves correctly with the 017 contract and the unchanged fork.

## Components / files to touch

- **NO EDIT** to `registerEditorSteps.ts` (`trackStep` already declared; `inputs`/`writes` are spec 017's edit), `manifest.ts` (track entry already present), `StudioShell.tsx` (`handleTrackSelected` preserved byte-identically; the `activeStepId` switch keeps hand-placing `TrackStep`), `buildStepGraph.ts` / the map adapter (spec 015), or `packages/contracts`.
- **NEW** test `packages/studio/src/.../trackRouting.test.ts` (working name; co-locate with the StudioShell/flow routing tests, or in the mirrored survey tree `packages/studio/tests/survey/questions/` per §2.5) — the §2.5 branch/read-only oracle: a flow-routing snapshot asserting `handleTrackSelected("copy")` → `project_name` and `handleTrackSelected("adapt")` → `nextSpineStepAfter("track")` (`characters`), with `charactersSub:"prefill"` and `scaffoldSpec` cleared on adapt.
- **POSSIBLY** an addition to the spec-015 map-projection test (or a co-located assertion) confirming the `track` node carries the spec-017 `inputs`/`writes` and is projected as branch-defining (fork to `project_name`, spine continuation to `characters`). Keep it additive; do not repurpose the spec-015 or spec-016 tests.
- **NO new flag** — the `track` node renders under the existing dev-only `SHOW_FLOWMAP` gate (`StudioShell.tsx:84`), inherited from spec 015.

## Wiring / oracle design

1. **Node resolution (no code change):** `track` is already in `manifest`, so the spec-015 `buildManifestStepGraph()` → adapter projects it with `kind:'stub'` on the spine after `choose_base`. Its `inputs`/`writes` come from the spec-017 declaration. The fork/join edges (fork to `project_name`, join at `characters`) come from the existing `buildManifestStepGraph` edge rules for `spine:false` + `joinTarget`. This plan confirms — it does not build — the node.
2. **Fork preservation (no code change):** `handleTrackSelected` (`StudioShell.tsx:602-614`) is left exactly as-is:
   - `"copy"` → `setActiveStepId("project_name")`.
   - `"adapt"` → `setScaffoldSpec(null)`, `setActiveStepId(nextSpineStepAfter("track"))`, `setCharactersSub("prefill")`.
   The plan's job is to NOT touch this and to lock it with the oracle.
3. **Branch/read-only oracle (the new artifact):** a flow-routing snapshot. Because `track` writes no IR leaf (`writes: []`), the oracle is the **resolved next-step id / branch selection**, not an emit-byte (`flagParity`-style) or `SurveyPhaseResult` deep-equal comparison. Drive `handleTrackSelected` (or the routing it produces) for both tracks and snapshot the resolved active step id + the side-effects that gate the branch (`charactersSub`, `scaffoldSpec`). Assert unchanged.
4. **Guardrail confirmation:** run the spec-016 drift guardrail with `track` resolving as its node; `track` is a manifest step the runtime reaches and has a rendered node, so the bijection holds (no orphan, no uncovered step).

## Intra-spec sequencing (within spec 018)

1. Confirm the dependencies have landed: spec 015 (map projection), spec 016 (drift guardrail), spec 017 (`track` `inputs`/`writes` declared). This spec does **not** declare `track` — it consumes 017's declaration.
2. Add the §2.5 branch/read-only oracle (flow-routing snapshot) and pin the current resolved routing for both tracks — establishing the byte-identical baseline **before** any other Phase-1 spec could perturb routing.
3. Add/extend the map-projection assertion that the `track` node carries the 017 `inputs`/`writes` and is branch-defining (fork to `project_name`, spine to `characters`).
4. Run the full gate (drift guardrail green, typecheck, vitest, depcruise).

> Note on cross-spec sequencing: spec 017 sequences **writes-before-inputs** to keep completeness C5 from transiently reddening when declaring step contracts. **That ordering is spec 017's concern, not this spec's** — `track` writes `[]`, so it raises no C5 obligation here; 018 only consumes the already-declared contract. Recorded so the dependency is visible, not to action it.

## How the Phase-1 invariants are preserved

- **No new write routing / no `mutate()`:** the copy-vs-adapt routing stays in `handleTrackSelected`; `track` declares `writes: []`; no store mutator, reducer, or `mutate()` path is added (FR-005). The fork-to-YAML move is Phase 2 spec #10.
- **No contracts bump:** reuses the existing `EditorStep`/manifest shapes and existing `KeyboardIR` locations (none, for `track`'s `[]` writes); `packages/contracts` untouched (FR-011).
- **Behavior byte-identical:** `handleTrackSelected` is unchanged; the flow-routing snapshot locks copy → `project_name` and adapt → `characters`; the `TrackStep` render is hand-placed by `StudioShell` exactly as today (FR-004/FR-006/SC-003/SC-005).
- **Step appears as a map node:** `track` is already a manifest entry, so the spec-015 adapter projects its node automatically; this spec confirms it with the 017 contract populated and the branch-defining edges (FR-001/FR-002/FR-003/SC-001/SC-002).
- **Read-only / declare-only:** this spec adds no declaration of its own (017 owns the `track` contract); it adds only the regression-lock oracle and a confirming assertion.
- **Drift guardrail stays green:** `track` is a reached manifest step with a rendered node, so the spec-016 bijection holds (FR-009/SC-006).
- **Copy-track gating preserved:** copy gates `project_name`; adapt bypasses it — locked by the oracle (FR-007/SC-004).

## Risks & mitigations

- **Accidentally moving the fork to YAML (scope creep into Phase 2):** the strongest temptation, since the canonical model is resolved as a modular gate. Mitigation: FR-005/FR-011 forbid it; the oracle proves the fork still runs in `handleTrackSelected`; spec #10 (`qu-mutate-track`) is the YAML move.
- **Re-declaring `track` and creating a duplicate manifest entry:** mitigation: FR-001 forbids a second declaration; the drift guardrail's negative test would catch a duplicate/uncovered node.
- **Oracle picking the wrong baseline (comparing IR instead of routing):** `track` has no IR/phase-result output; mitigation: the oracle is a flow-routing snapshot of the resolved next-step id / branch selection per §2.5 branch/read-only surfaces.
- **Depending on spec 017 not yet landed:** mitigation: sequencing step 1 confirms 017 declared `track`'s contract first; if 017 has not landed, this spec is blocked (dependency).

## Test strategy (per migration-plan §2.5)

- **Branch/read-only oracle (FR-008):** flow-routing snapshot — copy → `project_name`; adapt → `nextSpineStepAfter("track")` (`characters`), `charactersSub:"prefill"`, `scaffoldSpec` cleared. Resolved next-step id / branch selection unchanged. (No IR or `SurveyPhaseResult` to compare.)
- **Map-projection assertion (additive):** the `track` node carries the spec-017 `inputs`/`writes`, is projected as branch-defining (fork to `project_name`, spine to `characters`). Does not repurpose the spec-015 or spec-016 tests.
- **Drift guardrail (spec 016):** green with `track` resolving as its node — no orphan, no uncovered step.
- **Per-step unit test (mirrored tree, §2.5):** assert `track`'s declared `inputs`/`writes` are well-formed (`writes: []`); this overlaps spec 017's per-step test — keep additive, do not duplicate 017's authority.
- **Don't regress physical / touch:** unaffected by this spec, but the full suite (which includes the R1/R2 reference locks) must stay green.
- **Boundary:** `pnpm depcruise` (dashboard stays store-free); `pnpm typecheck`; studio + contracts `vitest`.

## Build / test commands

- Typecheck: `pnpm typecheck`
- Tests: `pnpm test` (studio + contracts vitest)
- Boundaries: `pnpm depcruise` (must stay green; forbids `dashboard → stores`)
- Full gate: `pnpm typecheck` + studio/contracts vitest (incl. the §2.5 branch/read-only oracle + the spec-016 drift guardrail) + `pnpm depcruise` + flag-off render unchanged
