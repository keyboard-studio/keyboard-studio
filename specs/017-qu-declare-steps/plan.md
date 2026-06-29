# Implementation Plan: Declare steps — populate inputs/writes + prefill / pb_build_list drill-down declarations (declared-only, flag off)

**Spec**: [spec.md](./spec.md) · **Phase**: 1 (Question Unification) · **Spec #**: 3 of 8 · **Branch**: `speckit/question-unification-phase1-specs`

**Source**: [docs/design-notes/question-unification-migration-plan.md](../../docs/design-notes/question-unification-migration-plan.md) §2.1 (per-step contract table), §2.4 step 3 (declare-only + C5 obligation + writes-before-inputs), §2.5 (per-step unit tests), §5 spec #3, §6 (C5 mechanism is in the deferred / developer-decision bucket); findings [question-unification-findings.md](../../docs/design-notes/question-unification-findings.md) (b).

## Summary

Populate the empty `inputs: []` / `writes: []` on the **existing** `carve` / `mechanisms` / `touch` / `track` / `project_name` editor-steps (`steps/registerEditorSteps.ts`) from the existing `editorMutate.ts` containment sets, and add **new** registry drill-down declarations for `prefill` and `pb_build_list` under the opaque `characters` node. Nothing executes: no `mutate()`, flag off, no contracts bump, byte-identical behavior. The two load-bearing constraints are (1) **writes-before-inputs** sequencing so C5 never transiently reds, and (2) resolving the **cross-graph C5 obligation** for `prefill`'s session-derived `header.bcp47` (produced by `iso_code` inside the opaque `charactersStep`, invisible to the manifest graph), carried as **[NEEDS DECISION: D1]** with Option B recommended.

## Components / files to touch

- **EDIT** `packages/studio/src/steps/registerEditorSteps.ts` — populate `inputs` / `writes` on `carveStep`, `mechanismsStep`, `touchStep`, `trackStep`, `projectNameStep`. Source the `writes` from the existing `editorMutate.ts` containment sets:
  - `carveStep.writes` ← `CARVE_WRITES` (`groups[]`/`stores[]`/`raw[]`, `editorMutate.ts:42-46`); `carveStep.inputs` ← the `groups[]`/`stores[]`/`raw[]` the deletion overlay reads.
  - `mechanismsStep.writes` ← `ADD_GALLERY_WRITES` (`groups[]`/`stores[]`, `editorMutate.ts:203-206`); `mechanismsStep.inputs` ← base layout `groups[]`/`stores[]`.
  - `touchStep.writes` ← `TOUCH_WRITES` (`touchLayout.platforms[].layers[].rows[].keys[]`, `editorMutate.ts:172`); `touchStep.inputs` ← locked physical layout seed.
  - `trackStep.inputs` ← `irPath('header','bcp47')` (array) + resolved base IR; `trackStep.writes` ← `[]` (branch selection only — DEC-D2).
  - `projectNameStep` ← its declared contract against existing `KeyboardIR` locations (no `header.script`).
- **EDIT / NEW** the survey-question registry for the drill-down declarations: declare `prefill` and `pb_build_list` as registry-keyed drill-down nodes under the opaque `characters` node. Exact home is `survey/questions/registry.ts` (+ the `a` / `b` sub-registries) — confirm at plan time whether these are new registry entries (declaration-only, no live render) or a drill-down descriptor the spec-015 adapter consumes. They are **NOT** added to `steps/manifest.ts`.
- **NEW** per-step unit tests in the mirrored tree `packages/studio/tests/survey/questions/{a,b,f}/` — one spec per declared step (well-formedness; `prefill` input-satisfiability). Phase mapping: `prefill` → `a/` (identity/confirm segment), `pb_build_list` → `b/` (Phase B), per §2.5 `{a,b,f}` tree.
- **EDIT (D1-dependent)** `packages/studio/src/dashboard/completeness.ts` — ONLY if Option A or Option B is resolved in this spec: Option A adds a `writes` entry on the subsuming manifest step; Option B adds the cross-graph exemption + a separate question-writer C5. If D1 stays open, **no `completeness.ts` edit** lands here — only the writes-before-inputs ordering (which keeps C5 green under either option) plus the declared arrays.
- **NO EDIT** to `steps/editorMutate.ts` (containment sets reused as-is, not executed), `steps/manifest.ts` (no new manifest entry; `charactersStep` untouched unless Option A is chosen), the reducer (`reducer.ts`), any gallery component (`CarveGallery` / `MechanismGallery` / `TouchGallery`), `StudioShell.tsx` render path, `flags/mutateFlag.ts`, or `packages/contracts`.

## Declaration design

1. **Mirror the existing containment sets — do not invent paths.** Every `writes` declaration is the exact `IRPath[]` already enumerated in `editorMutate.ts`. This guarantees FR-002 (existing locations, no new field) by construction and keeps the declaration aligned with the eventual Phase-2 `mutate()` surface.
2. **`inputs` are the reads each surface already performs**, expressed via `irPath()` over existing locations: carve reads the `groups[]`/`stores[]`/`raw[]` overlay; mechanisms reads the base layout `groups[]`/`stores[]`; touch reads the locked physical seed; track/prefill read `header.bcp47` (array) + session-derived signals.
3. **`prefill` is read-only** (`writes: []`); its `header.bcp47` + session `ScriptPrefill` are inputs only. **`irPath('header','script')` is never constructed** — `ScriptPrefill` is a session-level value, not an IR leaf (FR-004, FR-006). A guard test (FR-013) greps the declarations for `'header','script'` and fails if present.
4. **`pb_build_list`'s output is a phase-result field, not IR** — its confirmed inventory rides on `SurveyPhaseResult.confirmedInventory` (`PhaseB.tsx:610`), so it declares no `irPath()` write; its declared "output" is the phase-result field, modeled distinctly from `writes`.

### DEC-D1 — cross-graph C5 mechanism (carry as [NEEDS DECISION], Option B recommended)

`checkInputsSatisfiable` (`completeness.ts:419-437`) collects every node's `writePaths` into a string set and flags any `inputPath` not in it, over the **manifest-only** graph (`buildMinimalStepGraph`, `completeness.ts:532-567`). `prefill`'s `header.bcp47` writer `iso_code` (`iso_code.ts:80`) lives inside the opaque `charactersStep` and is not a manifest node, so a manifest-level `prefill` input declaration orphans (RED).

- **Option A — subsumption:** `charactersStep` (or the subsuming step) declares `header.bcp47` (+ `ScriptPrefill` source) in its own `writes`, resolving C5 in one graph. Pro: one check, one graph. Con: phantom write on a placeholder that does not execute it in P1; Phase 2 must unwind.
- **Option B — cross-graph exemption (RECOMMENDED):** exempt cross-graph / session-derived inputs from manifest-level C5 and run a separate question-writer C5 that resolves `iso_code → header.bcp47` in the question graph. Pro: honest per-step contracts; matches §2.2(b) per-graph reachability (already adopted by C7 and spec 016). Con: a second check + an exemption category to scope tightly.
- **Recommendation: Option B.** **But the C5 mechanism choice is NOT yet human-resolved** (§6 deferred / developer bucket), so this spec carries it as **[NEEDS DECISION: D1]** and does not silently pick B. Resolve with developers; until then, only the writes-before-inputs ordering lands (it keeps C5 green under either option), and `prefill`'s manifest-level input is either deferred or declared as a session input distinct from `irPath()` inputs per the chosen option.

### DEC-D2 — track's branch-selection write

`track` selects a branch (copy/adapt; copy-track gates the `project_name` side-trail), not an IR leaf. **Recommendation: `writes: []`** (branch selection only, no IR leaf in P1), `inputs` = `header.bcp47` (array) + resolved base IR. Empty `writes` produces no input to orphan and never reds C5. Lock at plan time; marked [NEEDS DECISION: D2] in the spec.

## Intra-spec sequencing (writes-before-inputs — the load-bearing order)

Within spec 017, apply declarations in this strict order so C5 (`checkInputsSatisfiable`) is green after **every** intermediate step:

1. **Declare all `writes` first** — populate `carve` / `mechanisms` / `touch` `writes` (track/prefill are `[]`) and (if Option A) the subsuming step's `writes`. After this step the producer set is complete; no input yet references an undeclared producer.
2. **Then declare `inputs`** — populate `carve` / `mechanisms` / `touch` / `track` / `project_name` `inputs`, then the `prefill` / `pb_build_list` drill-down inputs. Because every producer write already exists, no input transiently orphans.
3. **Apply the D1 resolution** (or, if D1 stays open, defer `prefill`'s cross-graph input declaration so manifest-level C5 stays green).
4. **Run completeness + the drift bijection** after each group; confirm C1–C7 green (C7 per-graph), `validateManifestShape()` M2–M6 green, spec-016 bijection green.

> Rationale: C5 is a pure set-membership check (`writePaths` ⊇ `inputPaths` across the graph). If an input is declared before its producer's write, the membership check fails for that intermediate state. Declaring writes first makes every intermediate state satisfiable. This holds regardless of the D1 option.

## Flag gating

No flag change. The mutate seam stays off (`flags/mutateFlag.ts` untouched); no `mutate()` executes. The declarations are inert data on the step definitions and registry — read by the projection (015) and completeness checks only. Phase 1 introduces no flag-on path.

## How byte-identical behavior + the map-node requirement are preserved

- **No new write routing / no `mutate()`:** only declaration arrays and registry entries are added; no reducer, store mutator, or `mutate()` path changes. Every gallery keeps its current write mechanism (carve direct store mutators; physical R1; touch R2). (FR-015.)
- **No contracts bump:** every declared path mirrors an existing `editorMutate.ts` `IRPath`; `packages/contracts` is untouched; no `KeyboardIR` field added. (FR-002.)
- **Behavior byte-identical:** the SPA render path is untouched (`StudioShell` still hand-places the real components via `activeStepId`); the only observable diffs are the populated declaration arrays and new tests. IR/emit-writing surfaces (carve/mechanisms/touch) verified via emit-byte equivalence; `SurveyPhaseResult`-writing surface (build-list) via deep-equal `confirmedInventory`; branch/read-only surfaces (track/prefill) via flow-routing snapshot (per §2.5 per-surface oracle). (FR-015, SC-007.)
- **Step appears as a map node:** declarations surface through the spec-015 projection; the spec-016 drift bijection stays green with the new drill-down nodes present (declarations must not orphan a rendered node or leave a runtime step uncovered). (FR-014.)
- **C5 never transiently reds:** writes-before-inputs sequencing guarantees C5 green at every intermediate state; the D1 resolution removes the cross-graph orphan for `prefill`. (FR-009, FR-010.)

## Risks & mitigations

- **Cross-graph C5 orphan for `prefill` (the central risk):** declaring `header.bcp47` as a manifest-level input reds C5 because its writer is inside the opaque `charactersStep`. Mitigation: carry D1 as [NEEDS DECISION] (Option B recommended); until resolved, defer the cross-graph input declaration so manifest-level C5 stays green — never declare it manifest-level without the exemption/subsumption in place.
- **Accidentally declaring `irPath('header','script')`:** it does not exist and would not even typecheck via `irPath()`, but a belt-and-braces guard test (FR-013) asserts no declaration references it.
- **Over-declaring `pb_build_list` as an IR write:** its output is `SurveyPhaseResult.confirmedInventory`, not IR. Mitigation: declare the output as the phase-result field, distinct from `irPath()` `writes`; assert no IR write is declared for it.
- **`track`'s branch write modeled as an IR leaf:** there is no IR leaf for a branch in P1. Mitigation: `writes: []` (DEC-D2); confirm C5 unaffected (empty writes produce no orphan).
- **Drill-down registry home ambiguity:** confirm at plan time whether `prefill`/`pb_build_list` are new registry entries or adapter-side drill-down descriptors; either way they are NOT manifest entries and the 016 bijection must stay green.

## Test strategy (per migration-plan §2.5)

- **Per-step unit tests (mirrored tree `tests/survey/questions/{a,b,f}/`):** for each declared step, assert `inputs` / `writes` are well-formed (resolve via `irPath()` to existing locations); for read-only `prefill`, assert inputs are satisfiable (per D1). (FR-012.)
- **`header.script` guard:** assert no declaration references `irPath('header','script')`. (FR-013.)
- **Writes-before-inputs / C5 sequencing test:** replay the declaration sequence and assert C5 (`runCompleteness`) green after each intermediate step; assert C5 never transiently reds. (FR-009, SC-004.)
- **Cross-graph C5 test (D1-dependent):** assert manifest-level C5 returns no spurious orphan for `prefill` once the option is applied; (Option B) assert the separate question-writer C5 resolves `iso_code → header.bcp47`. (FR-010, FR-011, SC-005.)
- **Completeness + manifest shape:** C1–C7 green (C7 per-graph per §2.2(b)); `validateManifestShape()` M2–M6 green; spec-016 drift bijection green. (FR-014.)
- **Per-surface byte-identical oracle (§2.5):** carve/mechanisms/touch emit-byte equivalence; build-list `SurveyPhaseResult` deep-equal; track/prefill flow-routing snapshot. Physical (R1) and touch (R2/side-car) regression tests stay green (REFERENCE / known-good — do not regress).
- **Boundary:** `pnpm depcruise` green (dashboard stays store-free); `pnpm typecheck`; studio + contracts `vitest`.

## Build / test commands

- Typecheck: `pnpm typecheck`
- Tests: `pnpm test` (studio + contracts vitest)
- Boundaries: `pnpm depcruise` (must stay green; forbids `dashboard → stores/editors`)
- Full gate: `pnpm typecheck` + studio/contracts vitest + `pnpm depcruise` + flag-off output byte-identical (no `mutate()` executes)
</content>
