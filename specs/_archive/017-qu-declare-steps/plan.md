# Implementation Plan: Declare steps — populate inputs/writes + prefill / pb_build_list drill-down declarations (declared-only, flag off)

**Spec**: [spec.md](./spec.md) · **Phase**: 1 (Question Unification) · **Spec #**: 3 of 8 · **Branch**: `speckit/question-unification-phase1-specs`

**Source**: [docs/design-notes/question-unification-migration-plan.md](../../docs/design-notes/question-unification-migration-plan.md) §2.1 (per-step contract table), §2.4 step 3 (declare-only + C5 obligation + writes-before-inputs), §2.5 (per-step unit tests), §5 spec #3, §6 (C5 mechanism was in the deferred / developer-decision bucket — now RESOLVED to option (a) (subsumption) by Matt, 2026-06-29); findings [question-unification-findings.md](../../docs/design-notes/question-unification-findings.md) (b).

## Summary

Populate the empty `inputs: []` / `writes: []` on the **existing** `carve` / `mechanisms` / `touch` / `track` / `project_name` editor-steps (`steps/registerEditorSteps.ts`) from the existing `editorMutate.ts` containment sets, and add **new** registry drill-down declarations for `prefill` and `pb_build_list` under the opaque `characters` node. Nothing executes: no `mutate()`, flag off, no contracts bump, byte-identical behavior. The two load-bearing constraints are (1) **writes-before-inputs** sequencing so C5 never transiently reds, and (2) resolving the **cross-graph C5 obligation** for `prefill`'s session-derived `header.bcp47` (produced by `iso_code` inside the opaque `charactersStep`, invisible to the manifest graph), **resolved to option (a) — subsumption** (Matt, 2026-06-29): the `charactersStep` node declares the `header.bcp47` write in its own `writes`, keeping a single unified bijection invariant and a single C5 check.

## Components / files to touch

- **EDIT** `packages/studio/src/steps/registerEditorSteps.ts` — populate `inputs` / `writes` on `carveStep`, `mechanismsStep`, `touchStep`, `trackStep`, `projectNameStep`. Source the `writes` from the existing `editorMutate.ts` containment sets:
  - `carveStep.writes` ← `CARVE_WRITES` (`groups[]`/`stores[]`/`raw[]`, `editorMutate.ts:42-46`); `carveStep.inputs` ← the `groups[]`/`stores[]`/`raw[]` the deletion overlay reads.
  - `mechanismsStep.writes` ← `ADD_GALLERY_WRITES` (`groups[]`/`stores[]`, `editorMutate.ts:203-206`); `mechanismsStep.inputs` ← base layout `groups[]`/`stores[]`.
  - `touchStep.writes` ← `TOUCH_WRITES` (`touchLayout.platforms[].layers[].rows[].keys[]`, `editorMutate.ts:172`); `touchStep.inputs` ← locked physical layout seed.
  - `trackStep.inputs` ← `irPath('header','bcp47')` (array) + resolved base IR; `trackStep.writes` ← `[]` (branch selection only — DEC-D2).
  - `projectNameStep` ← its declared contract against existing `KeyboardIR` locations (no `header.script`).
- **EDIT / NEW** the survey-question registry for the drill-down declarations: declare `prefill` and `pb_build_list` as registry-keyed drill-down nodes under the opaque `characters` node. Exact home is `survey/questions/registry.ts` (+ the `a` / `b` sub-registries) — confirm at plan time whether these are new registry entries (declaration-only, no live render) or a drill-down descriptor the spec-015 adapter consumes. They are **NOT** added to `steps/manifest.ts`.
- **NEW** per-step unit tests in the mirrored tree `packages/studio/tests/survey/questions/{a,b,f}/` — one spec per declared step (well-formedness; `prefill` input-satisfiability). Phase mapping: `prefill` → `a/` (identity/confirm segment), `pb_build_list` → `b/` (Phase B), per §2.5 `{a,b,f}` tree.
- **EDIT (D1 → option (a) subsumption)** `packages/studio/src/steps/manifest.ts` — the subsuming opaque `charactersStep` node (`manifest.ts:47-56`) declares the `iso_code`-equivalent write (`header.bcp47` + `ScriptPrefill` source) in its **own `writes`**, so manifest-level C5 resolves `prefill`'s input within the single manifest graph. **No `completeness.ts` edit** is needed (C5 stays a single check; no exemption machinery, no separate question-writer C5).
- **NO EDIT** to `steps/editorMutate.ts` (containment sets reused as-is, not executed), the reducer (`reducer.ts`), any gallery component (`CarveGallery` / `MechanismGallery` / `TouchGallery`), `StudioShell.tsx` render path, `flags/mutateFlag.ts`, `completeness.ts`, or `packages/contracts`. (`steps/manifest.ts` is edited only to add the `charactersStep` `writes` entry per D1 → option (a); no new manifest entry is created.)

## Declaration design

1. **Mirror the existing containment sets — do not invent paths.** Every `writes` declaration is the exact `IRPath[]` already enumerated in `editorMutate.ts`. This guarantees FR-002 (existing locations, no new field) by construction and keeps the declaration aligned with the eventual Phase-2 `mutate()` surface.
2. **`inputs` are the reads each surface already performs**, expressed via `irPath()` over existing locations: carve reads the `groups[]`/`stores[]`/`raw[]` overlay; mechanisms reads the base layout `groups[]`/`stores[]`; touch reads the locked physical seed; track/prefill read `header.bcp47` (array) + session-derived signals.
3. **`prefill` is read-only** (`writes: []`); its `header.bcp47` + session `ScriptPrefill` are inputs only. **`irPath('header','script')` is never constructed** — `ScriptPrefill` is a session-level value, not an IR leaf (FR-004, FR-006). A guard test (FR-013) greps the declarations for `'header','script'` and fails if present.
4. **`pb_build_list`'s output is a phase-result field, not IR** — its confirmed inventory rides on `SurveyPhaseResult.confirmedInventory` (`PhaseB.tsx:610`), so it declares no `irPath()` write; its declared "output" is the phase-result field, modeled distinctly from `writes`.

### DEC-D1 — cross-graph C5 mechanism — RESOLVED to option (a) (subsumption), Matt 2026-06-29

`checkInputsSatisfiable` (`completeness.ts:419-437`) collects every node's `writePaths` into a string set and flags any `inputPath` not in it, over the **manifest-only** graph (`buildMinimalStepGraph`, `completeness.ts:532-567`). `prefill`'s `header.bcp47` writer `iso_code` (`iso_code.ts:80`) lives inside the opaque `charactersStep` and is not a manifest node, so a manifest-level `prefill` input declaration would orphan (RED) unless the writer is made visible to the manifest graph.

**Decision (Matt, 2026-06-29): option (a) — subsumption.** The subsuming opaque `charactersStep` node declares that it writes `iso_code` (the `header.bcp47`-equivalent `irPath('header','bcp47')`, + the session `ScriptPrefill` source) in its **own `writes`**, so the C5 invariant sees a writer and stays GREEN within the **single** manifest graph. **Rationale:** preserve a single unified bijection invariant (the one `016-qu-drift-guardrail` enforces) — one C5 check, one graph; the declared write is exactly what Phase 2 makes real when `iso_code` literally executes inside the decomposed step.

- **Implementation:** add `header.bcp47` (`irPath('header','bcp47')`) to `charactersStep.writes` in `steps/manifest.ts`. Sequenced before `prefill`'s input declaration (writes-before-inputs). No `completeness.ts` change.
- **Rejected — Option B (cross-graph exemption + separate question-writer C5):** would split the single bijection invariant into two checks plus an exemption category. Not pursued in Phase 1.

### DEC-D2 — track's branch-selection write

`track` selects a branch (copy/adapt; copy-track gates the `project_name` side-trail), not an IR leaf. **Resolved → `writes: []`** for the `track` step (branch selection only, no IR leaf in P1), by Matt 2026-06-29; `inputs` = `header.bcp47` (array) + resolved base IR. Empty `writes` produces no input to orphan and never reds C5. The rejected alternative (a declared branch marker) is not pursued — there is no IR leaf for a branch in P1.

## Intra-spec sequencing (writes-before-inputs — the load-bearing order)

Within spec 017, apply declarations in this strict order so C5 (`checkInputsSatisfiable`) is green after **every** intermediate step:

1. **Declare all `writes` first** — populate `carve` / `mechanisms` / `touch` `writes` (track/prefill are `[]`) and the subsuming `charactersStep`'s `writes` (the `header.bcp47` subsumption write, D1 → option (a)). After this step the producer set is complete; no input yet references an undeclared producer.
2. **Then declare `inputs`** — populate `carve` / `mechanisms` / `touch` / `track` / `project_name` `inputs`, then the `prefill` / `pb_build_list` drill-down inputs. Because every producer write already exists (including the `charactersStep` subsumption write), no input transiently orphans.
3. **Run completeness + the drift bijection** after each group; confirm C1–C7 green (C7 per-graph), `validateManifestShape()` M2–M6 green, spec-016 bijection green.

> Rationale: C5 is a pure set-membership check (`writePaths` ⊇ `inputPaths` across the graph). If an input is declared before its producer's write, the membership check fails for that intermediate state. Declaring writes first — including the `charactersStep` subsumption write — makes every intermediate state satisfiable.

## Flag gating

No flag change. The mutate seam stays off (`flags/mutateFlag.ts` untouched); no `mutate()` executes. The declarations are inert data on the step definitions and registry — read by the projection (015) and completeness checks only. Phase 1 introduces no flag-on path.

## How byte-identical behavior + the map-node requirement are preserved

- **No new write routing / no `mutate()`:** only declaration arrays and registry entries are added; no reducer, store mutator, or `mutate()` path changes. Every gallery keeps its current write mechanism (carve direct store mutators; physical R1; touch R2). (FR-015.)
- **No contracts bump:** every declared path mirrors an existing `editorMutate.ts` `IRPath`; `packages/contracts` is untouched; no `KeyboardIR` field added. (FR-002.)
- **Behavior byte-identical:** the SPA render path is untouched (`StudioShell` still hand-places the real components via `activeStepId`); the only observable diffs are the populated declaration arrays and new tests. IR/emit-writing surfaces (carve/mechanisms/touch) verified via emit-byte equivalence; `SurveyPhaseResult`-writing surface (build-list) via deep-equal `confirmedInventory`; branch/read-only surfaces (track/prefill) via flow-routing snapshot (per §2.5 per-surface oracle). (FR-015, SC-007.)
- **Step appears as a map node:** declarations surface through the spec-015 projection; the spec-016 drift bijection stays green with the new drill-down nodes present (declarations must not orphan a rendered node or leave a runtime step uncovered). (FR-014.)
- **C5 never transiently reds:** writes-before-inputs sequencing guarantees C5 green at every intermediate state; the D1 → option (a) resolution (the `charactersStep` subsumption write) removes the cross-graph orphan for `prefill` within the single manifest graph. (FR-009, FR-010.)

## Risks & mitigations

- **Cross-graph C5 orphan for `prefill` (the central risk):** declaring `header.bcp47` as a manifest-level input would red C5 because its writer is inside the opaque `charactersStep`. Mitigation: D1 → option (a) (subsumption, Matt 2026-06-29) — the `charactersStep` node declares the `header.bcp47` write in its own `writes` (sequenced before `prefill`'s input), so the writer is visible within the single manifest graph and C5 stays GREEN. Never declare `prefill`'s manifest-level input before the `charactersStep` subsumption write is in place.
- **Accidentally declaring `irPath('header','script')`:** it does not exist and would not even typecheck via `irPath()`, but a belt-and-braces guard test (FR-013) asserts no declaration references it.
- **Over-declaring `pb_build_list` as an IR write:** its output is `SurveyPhaseResult.confirmedInventory`, not IR. Mitigation: declare the output as the phase-result field, distinct from `irPath()` `writes`; assert no IR write is declared for it.
- **`track`'s branch write modeled as an IR leaf:** there is no IR leaf for a branch in P1. Mitigation: `writes: []` (DEC-D2); confirm C5 unaffected (empty writes produce no orphan).
- **Drill-down registry home ambiguity:** confirm at plan time whether `prefill`/`pb_build_list` are new registry entries or adapter-side drill-down descriptors; either way they are NOT manifest entries and the 016 bijection must stay green.

## Test strategy (per migration-plan §2.5)

- **Per-step unit tests (mirrored tree `tests/survey/questions/{a,b,f}/`):** for each declared step, assert `inputs` / `writes` are well-formed (resolve via `irPath()` to existing locations); for read-only `prefill`, assert inputs are satisfiable (per D1). (FR-012.)
- **`header.script` guard:** assert no declaration references `irPath('header','script')`. (FR-013.)
- **Writes-before-inputs / C5 sequencing test:** replay the declaration sequence and assert C5 (`runCompleteness`) green after each intermediate step; assert C5 never transiently reds. (FR-009, SC-004.)
- **Cross-graph C5 test (D1 → option (a)):** assert the `charactersStep` node declares the `header.bcp47` write and that manifest-level C5 returns no spurious orphan for `prefill` as a **single** check (no separate question-writer C5, no exemption carve-out). (FR-010, FR-011, SC-005.)
- **Completeness + manifest shape:** C1–C7 green (C7 per-graph per §2.2(b)); `validateManifestShape()` M2–M6 green; spec-016 drift bijection green. (FR-014.)
- **Per-surface byte-identical oracle (§2.5):** carve/mechanisms/touch emit-byte equivalence; build-list `SurveyPhaseResult` deep-equal; track/prefill flow-routing snapshot. Physical (R1) and touch (R2/side-car) regression tests stay green (REFERENCE / known-good — do not regress).
- **Boundary:** `pnpm depcruise` green (dashboard stays store-free); `pnpm typecheck`; studio + contracts `vitest`.

## Build / test commands

- Typecheck: `pnpm typecheck`
- Tests: `pnpm test` (studio + contracts vitest)
- Boundaries: `pnpm depcruise` (must stay green; forbids `dashboard → stores/editors`)
- Full gate: `pnpm typecheck` + studio/contracts vitest + `pnpm depcruise` + flag-off output byte-identical (no `mutate()` executes)
</content>
