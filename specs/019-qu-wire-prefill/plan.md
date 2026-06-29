# Implementation Plan: Wire prefill — Prefill resolves as a read-only registry drill-down under the opaque characters node (writes: [])

**Spec**: [spec.md](./spec.md) · **Phase**: 1 (Question Unification) · **Spec #**: 5 of 8 · **Branch**: `speckit/question-unification-phase1-specs`

**Source**: [docs/design-notes/question-unification-migration-plan.md](../../docs/design-notes/question-unification-migration-plan.md) §2.1 prefill row, §2.4 step 4, §2.5 branch/read-only oracle, §5 spec #5, §2.4 step 3 C5 caveat (resolved/carried in spec 017); findings [question-unification-findings.md](../../docs/design-notes/question-unification-findings.md) (a) prefill no-node, (b) prefill hand-built sub-stage of `characters` → "Promote to read-only modular node (`writes: []`)".

## Summary

Confirm the `prefill` step ("Confirm the basics", hand-built `Prefill.tsx:64`) — declared (by spec 017) as a registry-keyed drill-down **under the opaque `characters` node** with `writes: []` and `inputs` = `header.bcp47` array + session `ScriptPrefill` — resolves as a **read-only registry drill-down node** on the rendered Flow Map (it gets the node from the spec-015 `questionRegistry`-keyed drill-down layer), while the hand-built `Prefill` render and its flow-advancing confirm (`handlePrefillConfirm`, `StudioShell.tsx:632-634`, sets `charactersSub` "prefill" → "B") are preserved byte-identically. Add a flow-routing snapshot (the §2.5 branch/read-only oracle) that locks the resolved next sub-stage for the confirm. No new write routing, no `mutate()`, no contracts bump, SPA render unchanged, `prefill` stays a drill-down under `characters` (the promotion to a first-class manifest entry — which requires decomposing the `characters` placeholder — is Phase 2 spec #11).

## Why this is mostly a confirmation + a regression lock (the core design constraint)

| Concern | State entering this spec | What this spec does |
|---|---|---|
| `prefill` manifest entry | **None — and must stay none in P1** (would require decomposing `charactersStep`, `manifest.ts:47-56`) | Nothing — must NOT add a manifest entry; it is a drill-down |
| `prefill` drill-down declaration (`writes: []`, inputs) | **Declared by spec 017** (dependency) | Nothing — consumes the 017 contract; confirms it renders on the node |
| cross-graph C5 (session-derived inputs) | **Resolved/carried by spec 017 (D1)** | Nothing — consumes the 017 resolution; opens NO new decision |
| `prefill` drill-down map node | **Rendered by the spec-015 `questionRegistry` drill-down layer** | Nothing — confirms the node resolves; asserts it via map-projection assertions |
| `Prefill` render + confirm | **Hand-built, hand-placed as a `characters` sub-stage** (`StudioShell.tsx:930-940`) | Preserve byte-identically; lock the confirm advance with a flow-routing snapshot |
| promotion to first-class manifest entry | Phase 2 (spec #11) | Explicitly NOT done here |

So the only *new artifact* this spec adds is the **branch/read-only oracle test** (the flow-routing snapshot of the confirm advance) plus an additive map-projection assertion. Everything else is a confirmation that the already-declared, already-projected `prefill` drill-down resolves correctly with the 017 contract and the unchanged render/confirm.

## Components / files to touch

- **NO EDIT** to the `prefill` drill-down declaration (spec 017 owns it), `manifest.ts` (`prefill` must NOT become a manifest entry; `charactersStep` placeholder stays opaque), `StudioShell.tsx` (`handlePrefillConfirm` / `handlePrefillBack` preserved byte-identically; the `activeStepId` / `charactersSub` switch keeps hand-placing `Prefill` as a `characters` sub-stage at `StudioShell.tsx:930-940`), `buildStepGraph.ts` / the map adapter (spec 015), the `questionRegistry` (`survey/questions/registry.ts`), or `packages/contracts`.
- **NEW** test `packages/studio/src/.../prefillRouting.test.ts` (working name; co-locate with the StudioShell/flow routing tests, or in the mirrored survey tree `packages/studio/tests/survey/questions/` per §2.5) — the §2.5 branch/read-only oracle: a flow-routing snapshot asserting `handlePrefillConfirm()` advances `charactersSub` from `"prefill"` to `"B"`, and that the back action is unchanged. There is **no** IR or `SurveyPhaseResult` output to compare (`writes: []`).
- **POSSIBLY** an addition to the spec-015 map-projection test (or a co-located assertion) confirming the `prefill` drill-down node hangs **under** the opaque `characters` node (NOT a top-level manifest entry), is marked read-only (`writes: []`), carries the spec-017 `inputs` (`header.bcp47` array + session `ScriptPrefill`), and references no `irPath('header','script')`. Keep it additive; do not repurpose the spec-015 or spec-016 tests.
- **POSSIBLY** an additive assertion (or reuse of spec 017's test) that no declaration references `irPath('header','script')` (FR-004/FR-012) — keep additive, do not duplicate 017's authority.
- **NO new flag** — the `prefill` drill-down node renders under the existing dev-only `SHOW_FLOWMAP` gate (`StudioShell.tsx:84`), inherited from spec 015.

## Wiring / oracle design

1. **Node resolution (no code change):** `prefill` is declared (by spec 017) as a `questionRegistry`-keyed drill-down under the opaque `characters` node. The spec-015 projection hangs the `buildModularFlowGraph` drill-downs (keyed off `questionRegistry`) under each opaque manifest node, so `prefill` resolves as a read-only drill-down under `characters` automatically. Its `writes: []` / `inputs` come from the spec-017 declaration. This plan confirms — it does not build — the node, and it must NOT promote `prefill` to a top-level manifest entry (that requires decomposing `charactersStep`; Phase 2 spec #11).
2. **Render + confirm preservation (no code change):** `StudioShell` is left exactly as-is:
   - `stepId === "characters" && charactersSub === "prefill"` → hand-places `<Prefill>` (`StudioShell.tsx:930-940`).
   - `handlePrefillConfirm()` (`StudioShell.tsx:632-634`) → `setCharactersSub("B")` (advance into Phase B).
   - `handlePrefillBack()` (`StudioShell.tsx:721`) → unchanged.
   The plan's job is to NOT touch this and to lock the confirm advance with the oracle.
3. **Branch/read-only oracle (the new artifact):** a flow-routing snapshot. Because `prefill` writes no IR leaf (`writes: []`), the oracle is the **resolved next sub-stage** (`charactersSub` "prefill" → "B"), not an emit-byte (`flagParity`-style) or `SurveyPhaseResult` deep-equal comparison. Drive `handlePrefillConfirm` (or the routing it produces) and snapshot the resolved `charactersSub`. Assert unchanged.
4. **Satisfiability (consumed from 017):** `prefill`'s inputs (`header.bcp47` array + session `ScriptPrefill`) are satisfiable per the **017 C5 decision (D1)** — Option B's separate question-writer C5 resolving `iso_code (iso_code.ts:80) → header.bcp47` in the question graph, or Option A's subsuming-step write. This plan consumes that resolution; it opens no new decision and re-resolves nothing.
5. **Guardrail confirmation:** run the spec-016 drift guardrail with `prefill` resolving as a question-graph drill-down node; `prefill` is a registry id the runtime reaches (via the confirm sub-stage) and has a rendered drill-down node, so the bijection holds (no orphan, no uncovered id) — checked in the **question** graph per §2.2(b).

## Intra-spec sequencing (within spec 019)

1. Confirm the dependencies have landed: spec 015 (map projection — `prefill` gets a rendered drill-down node from the `questionRegistry` layer), spec 016 (drift guardrail), spec 017 (`prefill`'s drill-down `inputs`/`writes` declared **and** the cross-graph C5 decision D1 resolved or carried). This spec does **not** declare `prefill` and does **not** resolve C5 — it consumes 017's declaration and resolution. If 017 has not landed, this spec is **blocked**.
2. Add the §2.5 branch/read-only oracle (flow-routing snapshot) and pin the current resolved routing for the confirm (`charactersSub` "prefill" → "B") — establishing the byte-identical baseline **before** any other Phase-1 spec could perturb routing.
3. Add/extend the map-projection assertion that the `prefill` drill-down hangs under `characters` (not a top-level entry), is read-only (`writes: []`), carries the 017 `inputs`, and references no `irPath('header','script')`.
4. Run the full gate (drift guardrail green, typecheck, vitest, depcruise).

> Note on cross-spec sequencing: spec 017 sequences **writes-before-inputs** to keep completeness C5 from transiently reddening when declaring step contracts, and 017 owns the cross-graph C5 decision (D1) for `prefill`'s session-derived inputs. **That ordering and that decision are spec 017's concern, not this spec's** — 019 only consumes the already-declared contract and the already-chosen C5 mechanism. `prefill` writes `[]`, so it raises no C5 obligation of its own here. Recorded so the dependency is visible, not to action it.

## Flag gating

- **No new flag.** The `prefill` drill-down node renders only under the existing dev-only `SHOW_FLOWMAP` gate (`StudioShell.tsx:84`), inherited from spec 015. With the flag off, `FlowMapView` does not mount, no projection runs, and the SPA still hand-places `Prefill` as a `characters` sub-stage — byte-identical to today. The mutate seam flag (`VITE_KM_MUTATE_SEAM`) is **irrelevant** here: `prefill` writes nothing (`writes: []`), so no `mutate()` path exists for it in any flag state.

## How the Phase-1 invariants are preserved

- **No new write routing / no `mutate()`:** `prefill` declares `writes: []`; the confirm routing stays in `handlePrefillConfirm` (`StudioShell.tsx:632-634`, `setCharactersSub("B")`); no store mutator, reducer, or `mutate()` path is added (FR-009). The promotion / modular-read conversion is Phase 2 spec #11.
- **No contracts bump:** reuses the existing manifest/registry/`StepGraph` shapes and existing `KeyboardIR` locations (none, for `prefill`'s `[]` writes); `irPath('header','script')` does not exist and is not declared; `packages/contracts` untouched (FR-004/FR-013).
- **Behavior byte-identical:** `handlePrefillConfirm` / `handlePrefillBack` are unchanged; the flow-routing snapshot locks `charactersSub` "prefill" → "B"; the `Prefill` render is hand-placed by `StudioShell` exactly as today (FR-007/FR-008/SC-003/SC-004).
- **Step appears as a map node:** `prefill` resolves as a read-only `questionRegistry`-keyed drill-down **under** the opaque `characters` node from the spec-015 projection; this spec confirms it with the 017 contract populated and `writes: []` (FR-001/FR-002/FR-003/SC-001/SC-002).
- **Read-only / declare-consuming:** this spec adds no declaration of its own (017 owns the `prefill` drill-down contract and the C5 decision); it adds only the regression-lock oracle and a confirming assertion.
- **Drift guardrail stays green:** `prefill` is a reached registry id with a rendered drill-down node, so the spec-016 bijection holds in the question graph (FR-011/SC-005).
- **No promotion to manifest entry:** `prefill` stays a drill-down under `characters`; promotion requires decomposing the opaque placeholder and is Phase 2 spec #11 (FR-001/FR-009/FR-013/SC-007).

## Risks & mitigations

- **Promoting `prefill` to a top-level manifest entry (scope creep into Phase 2):** the strongest temptation, since the target shape is a first-class node. Mitigation: FR-001/FR-009/FR-013 forbid it; promotion requires decomposing the `characters` placeholder, which is Phase 2 spec #11; the drift guardrail's negative test would catch an unexpected manifest node.
- **Re-resolving the cross-graph C5 mechanism here:** the C5 decision (D1) lives in spec 017. Mitigation: FR-005/FR-013 forbid opening a new decision; this spec surfaces it only as **[NEEDS DECISION — inherited from 017]** and consumes whatever 017 picks.
- **Declaring `irPath('header','script')`:** the path does not exist. Mitigation: FR-004/FR-012 forbid it; a test asserts no declaration references it; `prefill`'s script signal is the session-level `ScriptPrefill`.
- **Oracle picking the wrong baseline (comparing IR/phase-result instead of routing):** `prefill` has no IR or `SurveyPhaseResult` output (`writes: []`). Mitigation: the oracle is a flow-routing snapshot of the resolved sub-stage (`charactersSub` "prefill" → "B") per §2.5 branch/read-only surfaces.
- **Touching the SPA render path:** mitigation: FR-007/FR-013 forbid it; `StudioShell` keeps hand-placing `Prefill` as a `characters` sub-stage; there is no `SurveyView` / manifest-resolved render.
- **Depending on spec 017 not yet landed:** mitigation: sequencing step 1 confirms 017 declared `prefill`'s contract and resolved/carried D1 first; if 017 has not landed, this spec is blocked (dependency) and inherits the [NEEDS DECISION].

## Test strategy (per migration-plan §2.5)

- **Branch/read-only oracle (FR-010):** flow-routing snapshot — `handlePrefillConfirm()` advances `charactersSub` "prefill" → "B"; the resolved next sub-stage is unchanged. (No IR or `SurveyPhaseResult` to compare since `prefill` writes `[]`.)
- **Per-step / input-satisfiability test (mirrored tree, §2.5):** assert the `prefill` drill-down's declared `inputs` (`header.bcp47` array + session `ScriptPrefill`) are **satisfiable** subject to the 017 C5 decision, and `writes: []`; this overlaps spec 017's per-step test — keep additive, do not duplicate 017's authority.
- **Map-projection assertion (additive):** the `prefill` node hangs as a read-only drill-down **under** the opaque `characters` node (NOT a top-level manifest entry), carries the spec-017 `inputs`, and references no `irPath('header','script')`. Does not repurpose the spec-015 or spec-016 tests.
- **Drift guardrail (spec 016):** green with `prefill` resolving as a question-graph drill-down node — no orphan, no uncovered id; reachability per-graph (question graph).
- **No-script-path test (FR-004/FR-012):** assert no declaration references `irPath('header','script')`.
- **Don't regress physical / touch:** unaffected by this spec, but the full suite (which includes the R1/R2 reference locks) must stay green.
- **Boundary:** `pnpm depcruise` (dashboard stays store-free); `pnpm typecheck`; studio + contracts `vitest`.

## Build / test commands

- Typecheck: `pnpm typecheck`
- Tests: `pnpm test` (studio + contracts vitest)
- Boundaries: `pnpm depcruise` (must stay green; forbids `dashboard → stores`)
- Full gate: `pnpm typecheck` + studio/contracts vitest (incl. the §2.5 branch/read-only oracle + the spec-016 drift guardrail) + `pnpm depcruise` + flag-off render unchanged
