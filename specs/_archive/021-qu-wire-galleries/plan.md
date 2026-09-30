# Implementation Plan: Wire galleries — carve / mechanisms / touch resolve as first-class map nodes (existing write mechanisms preserved)

**Spec**: [spec.md](./spec.md) · **Phase**: 1 (Question Unification) · **Spec #**: 7 of 8 · **Branch**: `speckit/question-unification-phase1-specs`

**Source**: [docs/design-notes/question-unification-migration-plan.md](../../docs/design-notes/question-unification-migration-plan.md) §2.1 carve / mechanisms / touch rows, §2.4 step 4, §2.5 per-surface emit-byte oracle + don't-regress physical/touch, §4 no-break constraints, §5 spec #7; findings [question-unification-findings.md](../../docs/design-notes/question-unification-findings.md) (b) gallery rows + (c) touch-vs-physical verdict.

## Summary

Confirm the three gallery editor-steps — `carve` (`CarveGallery`), `mechanisms` (`MechanismGallery`, physical) and `touch` (`TouchGallery`), **all already** declared at `registerEditorSteps.ts:107/121/153` with their `inputs`/`writes` populated by spec 017 — resolve as first-class manifest nodes on the rendered Flow Map (each gets the node automatically from the spec-015 map adapter), while each gallery's **current write mechanism is preserved byte-for-byte**: carve via direct store mutators (`CarveGallery.tsx:28-72`) + undo stack; physical via R1 `lockDesktop()` running unconditionally (`reducer.ts:222`); touch via R2 `buildTouchLayoutJson`/`setTouchLayoutJson` + `.keyman-touch-layout` side-car running unconditionally (`reducer.ts:249-277`). Add a per-surface emit-byte oracle (the §2.5 `flagParity`-style `.kmn`-bytes comparison) for all three, plus dedicated R1/R2 don't-regress locks. No new write routing, no `mutate()` for any surface, no contracts bump, SPA render unchanged, the touch re-propagation add-on (`reducer.ts:228-243`) stays OFF. Routing the galleries through `mutate()` (carve R1, physical/touch REFERENCE last) is Phase 2 (specs #13/#14/#15).

## Why this is mostly a confirmation + regression locks (the core design constraint)

| Concern | State entering this spec | What this spec does |
|---|---|---|
| `carve` / `mechanisms` / `touch` manifest entries | **Already exist** (`registerEditorSteps.ts:107/121/153`) | Nothing — must NOT re-declare or add second entries |
| galleries' `inputs`/`writes` | **Declared by spec 017** (dependency) | Nothing — consumes the 017 contract; confirms it renders on each node |
| gallery map nodes | **Rendered by the spec-015 adapter** automatically | Nothing — confirms each node resolves; asserts it via the map-projection assertions |
| carve write mechanism | **Direct store mutators** (`CarveGallery.tsx:28-72`) | Preserve byte-identically; lock with the emit-byte oracle |
| physical (R1) write mechanism | **`lockDesktop()` unconditional** (`reducer.ts:222`) | Preserve byte-identically; lock with a dedicated R1 don't-regress test (REFERENCE) |
| touch (R2) write mechanism | **`buildTouchLayoutJson`/side-car unconditional** (`reducer.ts:249-277`) | Preserve byte-identically; lock with a dedicated R2/side-car don't-regress test (REFERENCE) |
| touch re-propagation add-on | Flag-gated OFF (`reducer.ts:228-243`) | Stay OFF; assert it does not run |
| galleries through `mutate()` | Phase 2 (specs #13/#14/#15) | Explicitly NOT done here |

So the only *new artifacts* this spec adds are the **per-surface emit-byte oracle** and the **dedicated R1/R2 don't-regress locks**. Everything else is a confirmation that the already-declared, already-projected gallery steps resolve correctly with the 017 contract and unchanged write mechanisms.

## Components / files to touch

- **NO EDIT** to:
  - `steps/registerEditorSteps.ts` (the three gallery steps already declared; `inputs`/`writes` are spec 017's edit),
  - `steps/manifest.ts` (the gallery entries + `lock` spreads `:96-99`/`:109-112` already present),
  - `editors/carve/CarveGallery.tsx` (direct store mutators preserved byte-identically),
  - `steps/reducer.ts` (R1 `lockDesktop()` `:222` and R2 `buildTouchLayoutJson` `:249-277` unchanged; the re-propagation add-on `:228-243` stays flag-gated OFF),
  - `StudioShell.tsx` (the `activeStepId` switch keeps hand-placing all three galleries; `manifest[].component` stays unrendered),
  - `dashboard/buildStepGraph.ts` / the map adapter (spec 015), or `packages/contracts`.
- **NEW** test(s) — the §2.5 per-surface emit-byte oracle and the R1/R2 don't-regress locks. Co-locate in the established test trees:
  - emit-byte oracle: a `flagParity`-style harness (mirroring `flagOff.test.ts`'s before/after equivalence method) comparing emitted `.kmn` bytes for carve / mechanisms / touch — and, for touch, the `.keyman-touch-layout` side-car bytes — over a representative edit sequence;
  - dedicated R1 don't-regress test: physical-step completion fires `lockDesktop()` unconditionally; output green;
  - dedicated R2 don't-regress test: touch-step completion fires `buildTouchLayoutJson`/`setTouchLayoutJson` + side-car unconditionally; output green; the re-propagation add-on (`reducer.ts:228-243`) does NOT run with the flag off.
- **POSSIBLY** an addition to the spec-015 map-projection test (or a co-located assertion) confirming the three gallery nodes carry their spec-017 `inputs`/`writes` and that `touch_seed_source` is projected as a fork/join into `touch`. Keep it additive; do not repurpose the spec-015 or spec-016 tests.
- **NO new flag** — the gallery nodes render under the existing dev-only `SHOW_FLOWMAP` gate (`StudioShell.tsx:84`), inherited from spec 015. `isMutateSeamEnabled()` stays off.

## Adapter / oracle / wiring design

1. **Node resolution (no code change):** each gallery is already in `manifest`, so the spec-015 `buildManifestStepGraph()` → adapter projects it with `kind:'stub'` on the spine in declared order (`carve` after `characters`; `mechanisms` `lock:"physical"`; `touch` `lock:"touch"`). Each node's `inputs`/`writes` come from the spec-017 declaration. The `touch_seed_source` fork/join (`spine:false`, `joinTarget:"touch"`) comes from the existing `buildManifestStepGraph` edge rules. This plan confirms — it does not build — the nodes.
2. **Carve preservation (no code change):** `CarveGallery` keeps its `useWorkingCopyStore` mutators (`deleteNode`/`restoreNode`/`deleteItem`/`restoreItem`/`restoreAll`/`keepAll`, `CarveGallery.tsx:28-72`), the deletion overlay over `groups[]`/`stores[]`/`raw[]`, and the undo stack. The plan's job is to NOT touch this and to lock it with the emit-byte oracle.
3. **Physical (R1) preservation (no code change — REFERENCE):** the `MECHANISMS_STEP_ID` reducer branch fires `deps.lockDesktop()` **unconditionally** (`reducer.ts:222`); the flag-gated re-propagation add-on immediately below (`reducer.ts:228-243`) is guarded by `isMutateSeamEnabled() && deps.getStaleSteps !== undefined && …` and stays OFF. Left exactly as-is; locked with a dedicated R1 don't-regress test.
4. **Touch (R2) preservation (no code change — REFERENCE):** the `TOUCH_STEP_ID` reducer branch fires `deps.buildTouchLayoutJson(...)` / `deps.setTouchLayoutJson(...)` **unconditionally** (`reducer.ts:249-277`), including the #831 side-car persistence. Left exactly as-is; locked with a dedicated R2/side-car don't-regress test.
5. **Per-surface emit-byte oracle (new artifact):** because all three are IR/emit-writing surfaces, the oracle is the §2.5 `flagParity`-style comparison of emitted `.kmn` bytes (NOT a `SurveyPhaseResult` deep-equal — that is for build-list — and NOT a flow-routing snapshot — that is for track/prefill). Run a representative edit sequence through each gallery and assert the emitted `.kmn` bytes are byte-identical before/after; for touch, additionally assert the `.keyman-touch-layout` side-car bytes are byte-identical (the R2 output).
6. **Guardrail confirmation:** run the spec-016 drift guardrail with the three galleries resolving as nodes; each is a manifest step the runtime reaches and has a rendered node, so the bijection holds (no orphan, no uncovered step).

## Intra-spec sequencing (within spec 021)

1. **Confirm dependencies have landed:** spec 015 (map projection), spec 016 (drift guardrail), spec 017 (`carve` / `mechanisms` / `touch` `inputs`/`writes` declared). This spec does **not** declare the galleries — it consumes 017's declarations.
2. **Pin the byte-identical baseline FIRST (regression locks before any perturbation):** add the dedicated R1 and R2 don't-regress tests and the per-surface emit-byte oracle, capturing the current emitted `.kmn` bytes (and touch side-car bytes) — establishing the byte-identical baseline before any other Phase-1 spec could perturb the surfaces. The REFERENCE flows (physical/touch) are locked first.
3. **Add/extend the map-projection assertion** that the three gallery nodes carry their 017 `inputs`/`writes` and that `touch_seed_source` projects as a fork/join into `touch`.
4. **Run the full gate** (drift guardrail green, typecheck, vitest incl. the new locks, depcruise).

> Note on cross-spec sequencing: spec 017 sequences **writes-before-inputs** to keep completeness C5 from transiently reddening when declaring step contracts. **That ordering is spec 017's concern, not this spec's** — 021 only consumes the already-declared contracts. Recorded so the dependency is visible, not to action it.

## Flag gating

- **`isMutateSeamEnabled()` stays OFF** throughout. No `mutate()` executes for any gallery; the touch re-propagation add-on (`reducer.ts:228-243`) never runs. The R2 don't-regress test asserts the add-on is dormant with the flag off (the base touch path is byte-identical to today).
- **`SHOW_FLOWMAP`** (dev-only, `StudioShell.tsx:84`) is the only flag under which the gallery nodes render; off ⇒ `FlowMapView` does not mount and output is byte-identical to today.

## How byte-identical behavior + the map-node requirement are preserved

- **No new write routing / no `mutate()`:** carve keeps its direct store mutators (`CarveGallery.tsx:28-72`); physical keeps R1 `lockDesktop()` unconditional (`reducer.ts:222`); touch keeps R2 `buildTouchLayoutJson`/side-car unconditional (`reducer.ts:249-277`); no `mutate()` route is added and none is retired (FR-005/FR-006/FR-007/FR-009). The `mutate()` move is Phase 2 (specs #13/#14/#15).
- **No contracts bump:** reuses the existing `EditorStep`/manifest shapes and existing `KeyboardIR` locations (`groups[]`/`stores[]`/`raw[]`, `touchLayout.platforms[].layers[].rows[].keys[]`); touch already first-class (#825, 0.13.0); `packages/contracts` untouched (FR-015).
- **Behavior byte-identical:** each write mechanism is unchanged; the per-surface emit-byte oracle locks the emitted `.kmn` bytes (and touch side-car bytes) before/after; each gallery is hand-placed by `StudioShell` exactly as today (FR-005–FR-007/FR-010/FR-011/SC-003/SC-006).
- **Reference flows not destabilized:** dedicated R1/R2 don't-regress tests keep physical and touch green; the re-propagation add-on stays OFF (FR-008/FR-012/SC-004/SC-005).
- **Step appears as a map node:** each gallery is already a manifest entry, so the spec-015 adapter projects its node automatically; this spec confirms each with the 017 contract populated and `touch_seed_source` as a fork/join (FR-001–FR-004/SC-001/SC-002).
- **Read-only / declare-consuming:** this spec adds no declaration of its own (017 owns the gallery contracts); it adds only the regression-lock oracle/tests and a confirming assertion.
- **Drift guardrail stays green:** all three are reached manifest steps with rendered nodes, so the spec-016 bijection holds (FR-013/SC-007).

## Risks & mitigations

- **Accidentally routing a gallery through `mutate()` (scope creep into Phase 2):** the strongest temptation, since the seam (`editorMutate.ts`, `applyMutatePatch`) is already a live flag-gated path. Mitigation: FR-009/FR-015 forbid it; the emit-byte oracle proves each surface still writes through its current mechanism; specs #13/#14/#15 are the `mutate()` moves.
- **Destabilizing a REFERENCE flow (physical/touch):** the single highest-severity risk. Mitigation: physical/touch are converted LAST in Phase 2 (§4); this spec only adds map nodes and locks R1/R2 with dedicated don't-regress tests (FR-012); the spec touches no reducer code.
- **Accidentally flipping `isMutateSeamEnabled()` / running the re-propagation add-on:** mitigation: FR-008/SC-005 keep the flag off and assert the add-on (`reducer.ts:228-243`) does not run; the R2 don't-regress test asserts the flag-off base path is byte-identical.
- **Re-declaring a gallery and creating a duplicate manifest entry:** mitigation: FR-001–FR-003 forbid a second declaration; the spec-016 drift guardrail's negative test would catch a duplicate/uncovered node.
- **Oracle picking the wrong baseline (routing/phase-result instead of emit bytes):** all three are IR/emit-writing surfaces; mitigation: the oracle is the §2.5 emit-byte `.kmn` comparison (+ touch side-car), not a flow-routing snapshot (track/prefill) or a `SurveyPhaseResult` deep-equal (build-list).
- **Depending on spec 017 not yet landed:** mitigation: sequencing step 1 confirms 017 declared the gallery contracts first; if 017 has not landed, this spec is blocked (dependency).

## Test strategy (per migration-plan §2.5)

- **Per-surface emit-byte oracle (FR-011):** `flagParity`-style comparison of emitted `.kmn` bytes for carve / mechanisms / touch; for touch, also the `.keyman-touch-layout` side-car bytes. Byte-identical before/after. (IR/emit-writing surfaces — NOT a `SurveyPhaseResult` or flow-routing comparison.)
- **Don't-regress physical / touch (FR-012):** dedicated tests locking R1 (`lockDesktop()` unconditional, `reducer.ts:222`) and R2 (`buildTouchLayoutJson`/side-car unconditional, `reducer.ts:249-277`) output green; assert the re-propagation add-on (`reducer.ts:228-243`) does NOT run with the flag off. Both REFERENCE flows stay green.
- **Map-projection assertion (additive):** the three gallery nodes carry the spec-017 `inputs`/`writes`; `touch_seed_source` projects as a fork/join into `touch`. Does not repurpose the spec-015 or spec-016 tests.
- **Drift guardrail (spec 016):** green with all three galleries resolving as nodes — no orphan, no uncovered step.
- **Per-step unit tests (mirrored tree, §2.5):** assert each gallery's declared `inputs`/`writes` are well-formed; this overlaps spec 017's per-step tests — keep additive, do not duplicate 017's authority.
- **Flag parity (F2):** the flag is off throughout Phase 1, so flag-off must remain byte-identical to today; no flag-on path is introduced.
- **Boundary:** `pnpm depcruise` (dashboard stays store-free); `pnpm typecheck`; studio + contracts `vitest`.

## Build / test commands

- Typecheck: `pnpm typecheck`
- Tests: `pnpm test` (studio + contracts vitest)
- Boundaries: `pnpm depcruise` (must stay green; forbids `dashboard → stores`)
- Full gate: `pnpm typecheck` + studio/contracts vitest (incl. the §2.5 per-surface emit-byte oracle + the R1/R2 don't-regress locks + the spec-016 drift guardrail) + `pnpm depcruise` + flag-off emitted-bytes unchanged
