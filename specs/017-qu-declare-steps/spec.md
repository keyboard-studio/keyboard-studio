# Feature Specification: Declare steps — populate inputs/writes on existing editor-steps and add prefill / pb_build_list drill-down declarations (declared-only, flag off)

**Feature Branch**: `speckit/question-unification-phase1-specs`

**Created**: 2026-06-29

**Status**: **Ready** — Phase 1 spec (opaque-step import). This is spec #3 of the question-unification Phase-1 decomposition ([docs/design-notes/question-unification-migration-plan.md](../../docs/design-notes/question-unification-migration-plan.md) §5). It is a **declared-only** feature: no `mutate()` executes, the flag stays off, no contracts bump, no new write routing, behavior byte-identical. Depends on spec #1 `015-qu-map-projection` (declared steps surface as nodes via the projection) and spec #2 `016-qu-drift-guardrail` (the per-graph reachability framing and the rendered ⟺ runtime bijection that these declarations must keep green).

**Input**: User description: Populate the currently-empty `inputs: []` / `writes: []` on the **existing** `carve` / `mechanisms` / `touch` / `track` / `project_name` editor-steps (`steps/registerEditorSteps.ts`; `track` already exists at `registerEditorSteps.ts:71-79`, `manifest.ts:77`, `spine:true` — these are NOT new declarations), and add **new** registry drill-down declarations only for `prefill` and `pb_build_list` (which have no manifest entry today). Declared-only: no `mutate()` executes, the flag stays off. Writes-declaration MUST be sequenced **BEFORE** inputs-declaration so C5 (`checkInputsSatisfiable`, `completeness.ts:419-437`) never transiently reds. Resolve the cross-graph C5 obligation for `prefill`: its reads (`header.bcp47` array + the session-level `ScriptPrefill`) are written by the survey question `iso_code` (`iso_code.ts:80` writes `irPath('header','bcp47')`) inside the opaque `charactersStep` placeholder (`manifest.ts:47-56`), not a manifest step, so a naive manifest-level input declaration orphans.

**Governing scope**: This feature implements **Phase 1 step 3 ("Declare-only")** of the Question Unification migration ([docs/design-notes/question-unification-migration-plan.md](../../docs/design-notes/question-unification-migration-plan.md) §2.1 per-step contract table, §2.4 step 3, §2.5 per-step unit tests, §5 spec #3), with the cross-graph C5 mechanism drawn from §6 (the deferred / developer-decision bucket). It does not re-derive that scope. Specs #1 ([specs/015-qu-map-projection](../015-qu-map-projection/spec.md)) and #2 ([specs/016-qu-drift-guardrail](../016-qu-drift-guardrail/spec.md)) are the landed prerequisites this feature builds on. **It declares contracts on existing steps; it does NOT wire any component to resolve as its node** (that is specs 018–021) and it does NOT promote `prefill` / `pb_build_list` to first-class manifest entries (Phase 2).

> **Note on the two Phase-1 safety constraints (deliberate, load-bearing).** Per §2, Phase 1 (a) introduces **no new write routing** — every gallery keeps its current mechanism (carve via direct store mutators `CarveGallery.tsx:28-72`; physical via R1 `lockDesktop` `reducer.ts:222`; touch via R2 `buildTouchLayoutJson` `reducer.ts:249-277`); `mutate()` is NOT introduced as a live write path for any new surface and the flag stays off — and (b) requires **no contracts bump** — every declared input/write reuses an existing `KeyboardIR` location expressible via `irPath()` (`groups[]` / `stores[]` / `raw[]` / `touchLayout…` / `header.bcp47`). **KeyboardIR has no top-level `layers[]`** (`keyboard-ir.ts:348-359`); a `layers[].rows[].keys[]` shape exists ONLY nested under `touchLayout.platforms[]`. **`irPath('header','script')` does not exist and MUST NOT be declared anywhere.**

## Clarifications

### Session 2026-06-29

These are the Phase-1 invariants threaded through this spec; all are settled by the migration plan (Matt's 2026-06-29 Phase-1 scope confirmation, §6) and require no `[NEEDS CLARIFICATION]` marker:

- **No new write routing.** This spec only populates declared `inputs` / `writes` arrays on step definitions and registry declarations. It adds no IR write path, flips no flag, and touches no reducer. No `mutate()` executes. (§2 Phase 1 constraint (a).)
- **No contracts bump.** No `@keyboard-studio/contracts` change; no new `KeyboardIR` field; no §18 sign-off. Every declared path is an existing `KeyboardIR` location reachable via `irPath()`. (§2 Phase 1 constraint (b).)
- **Behavior byte-identical.** No runtime/IR/render-path change; the SPA render path is untouched (`StudioShell` still hand-places `CarveGallery` / `MechanismGallery` / `TouchGallery` / `TrackStep` / `Prefill` via its `activeStepId` switch). The only artifacts are the populated declaration arrays plus per-step unit tests. (§2.4 step 3 + step 4 note.)
- **Step appears as a map node.** The declarations surface via the spec-015 projection; the spec-016 drift bijection must stay green (declaration must not orphan a rendered node or leave a runtime step uncovered). (Dependency on 015 / 016.)
- **Writes-before-inputs sequencing.** Within this spec, the `writes`-declaration on every step MUST land **before** the corresponding `inputs`-declaration, so C5 (`checkInputsSatisfiable`, `completeness.ts:419-437`) never transiently reds during the declaration sequence — regardless of which cross-graph C5 option is ultimately chosen. (§2.4 step 3.)

### Open items requiring a planning decision

Surfaced as `[NEEDS DECISION]` and resolved during `/speckit-plan` (or escalated to the §6 developer-decision bucket), **not** invented here:

- **[NEEDS DECISION: D1] — Cross-graph C5 mechanism for `prefill`'s session-derived inputs.** `prefill` reads `header.bcp47` (an **array**, session-derived) and the session-level `ScriptPrefill` (script subtag / A2 class / routing group). The writer of `header.bcp47` is the survey question `iso_code` (`iso_code.ts:80` writes `irPath('header','bcp47')`), which is hidden inside the opaque `charactersStep` placeholder (`manifest.ts:47-56`) — **not** a manifest step. `checkInputsSatisfiable` (`completeness.ts:419-437`) flags any input path not produced by some node's `writePaths` **in the same StepGraph**, and `runCompleteness` builds that graph from the **manifest only** (`buildMinimalStepGraph`, `completeness.ts:532-567`). So declaring `header.bcp47` as a manifest-level `prefill` input makes manifest-level C5 return an **ORPHAN (RED)** — the writer is invisible to the manifest graph.
  - **Option A — subsumption:** the manifest step that subsumes the identity/character survey questions (the opaque `charactersStep`, or whatever step stands in for that survey segment) declares `header.bcp47` (and the session `ScriptPrefill` source) in its **own `writes`**, so manifest-level C5 resolves the input within the single manifest graph. **Pro:** one C5 check, one graph, no exemption machinery. **Con:** attributes a write to an opaque placeholder that does not literally execute it in Phase 1 (the write really happens inside `iso_code`), overstating the placeholder's true Phase-1 contract and risking misleading the Phase-2 decomposition.
  - **Option B — cross-graph exemption (RECOMMENDED):** exempt cross-graph / session-derived inputs (those satisfied by a question inside an opaque placeholder, or session-derived like `ScriptPrefill`) from manifest-level C5, and run a **separate question-writer C5** check that resolves `iso_code → header.bcp47` within the question graph. **Pro:** each write is attributed to its true producer, the manifest contract stays honest, and it matches the §2.2(b) per-graph reachability framing already adopted for C7 (and by spec 016 for the drift bijection). **Con:** introduces a second satisfiability check and an explicit exemption category that must be scoped tightly so it cannot mask a genuine orphan.
  - **Recommendation: Option B.** It preserves honest per-step contracts, aligns with the per-graph reachability model 016 already adopts, and avoids attributing a phantom write to `charactersStep` that Phase 2 would have to unwind. **However the C5 mechanism choice is NOT yet human-resolved** — it sits in the §6 deferred / developer-decision bucket and was not among the 2026-06-29 resolved items — so this spec **carries it as an explicit `[NEEDS DECISION]`** rather than silently picking B. Whichever option is chosen, writes-declaration is sequenced before inputs-declaration so C5 never transiently reds.
- **[NEEDS DECISION: D2] — `track`'s branch-selection "write".** `track` selects a branch (copy vs adapt; the copy-track gates the `project_name` side-trail) rather than writing an IR leaf. The plan models this as "branch selection only (no IR leaf in P1)". The decision: declare `track`'s `writes` as **empty `[]`** (branch selection is not an IR write in P1) — the recommendation — **vs** model the branch decision as some declared marker. Resolve at plan time; recommended `writes: []`, `inputs` = `header.bcp47` (array, session-derived) + resolved base IR (`base.displayName`).

## User Scenarios & Testing *(mandatory)*

> The "users" here are the studio engineering team (who gain a stable Phase-1 contract on every mature flow without touching any write path) and the completeness maintainer (who needs writes-before-inputs ordering and the cross-graph C5 obligation resolved so C5 never transiently reds). Each story is independently testable and independently valuable.

### User Story 1 - Every existing manifest editor-step carries a well-formed declared contract (Priority: P1)

A studio engineer wants every existing manifest editor-step (`carve`, `mechanisms`, `touch`, `track`, `project_name`) to carry well-formed declared `inputs` / `writes` against **existing** `KeyboardIR` locations, so that each step has a stable Phase-1 contract **without changing any write path**.

**Why this priority**: This is the headline deliverable. Phase 1 step 1 (015) made the steps appear on the map and step 2 (016) locked the bijection; this step gives each existing step the declared contract that every Phase-2 decomposition will refactor behind. The galleries already declare containment sets in `editorMutate.ts` (`CARVE_WRITES`, `ADD_GALLERY_WRITES`, `TOUCH_WRITES`) — this story populates the step definitions from those existing surfaces, executing nothing.

**Independent Test**: For each of `carve` / `mechanisms` / `touch` / `track` / `project_name`, read its populated `inputs` / `writes`; assert every declared path resolves to an existing `KeyboardIR` location via `irPath()` (no new field); assert `carve` writes `groups[]`/`stores[]`/`raw[]` (matching `CARVE_WRITES`, `editorMutate.ts:42-46`), `mechanisms` writes `groups[]`/`stores[]` (matching `ADD_GALLERY_WRITES`, `editorMutate.ts:203-206`), `touch` writes `touchLayout.platforms[].layers[].rows[].keys[]` (matching `TOUCH_WRITES`); run the full spine and confirm the produced IR / emitted bytes are byte-identical to before (no write path moved).

**Acceptance Scenarios**:

1. **Given** the `carve` editor-step, **When** its declaration is populated, **Then** its `writes` resolve (via `irPath()`) to `groups[]` / `stores[]` / `raw[]` (the `CARVE_WRITES` surface) and its `inputs` are the `groups[]`/`stores[]`/`raw[]` the deletion overlay reads — both existing `KeyboardIR` locations, no new field.
2. **Given** the `mechanisms` editor-step (`lock:"physical"`), **When** its declaration is populated, **Then** its `writes` resolve to `groups[]` / `stores[]` (the `ADD_GALLERY_WRITES` surface) and its `inputs` are the base layout `groups[]`/`stores[]`; R1 `lockDesktop()` still runs unconditionally (`reducer.ts:222`) and the output is byte-identical (REFERENCE / known-good — do not regress).
3. **Given** the `touch` editor-step (`lock:"touch"`), **When** its declaration is populated, **Then** its `writes` resolve to `touchLayout.platforms[].layers[].rows[].keys[]` (the `TOUCH_WRITES` surface) and its `inputs` are the locked physical layout seed; R2 `buildTouchLayoutJson` still runs unconditionally (`reducer.ts:249-277`) and the output is byte-identical (REFERENCE / known-good, verified #831 `c9f64ba` — do not regress).
4. **Given** the `track` editor-step (already declared, `registerEditorSteps.ts:71-79`), **When** its declaration is populated, **Then** its `inputs` are `header.bcp47` (array, session-derived) + resolved base IR (`base.displayName`) and its `writes` are **empty `[]`** (branch selection only, no IR leaf in P1 — [NEEDS DECISION: D2]); the hand-coded copy/adapt fork in `StudioShell` `handleTrackSelected` (`StudioShell.tsx:602`) is byte-identical.
5. **Given** the `project_name` editor-step (`spine:false`, `joinTarget:"characters"`, the M4b copy-track fork), **When** its declaration is populated, **Then** it carries its declared contract against existing `KeyboardIR` locations and `irPath('header','script')` is **not** declared anywhere.

---

### User Story 2 - prefill and pb_build_list are declared as registry-keyed drill-down nodes (Priority: P1)

A studio engineer wants `prefill` and `pb_build_list` declared as **registry-keyed drill-down nodes** (NOT top-level manifest entries), so that they appear on the map with declared contracts ahead of being wired.

**Why this priority**: `prefill` and `pb_build_list` are the mature, hand-built experiences with **no** manifest entry today (`Prefill.tsx:64`; `BuildListView` `PhaseB.tsx:535`, used ~`692`). They cannot be first-class manifest nodes in Phase 1 without decomposing the opaque `charactersStep` placeholder (Phase 2 work). Declaring them as drill-downs under the opaque `characters` node gives them a declared contract on the map now, behind a stable boundary.

**Independent Test**: Read the new registry drill-down declarations for `prefill` and `pb_build_list`; assert `prefill` declares `writes: []` (read-only confirm) and `inputs` of `header.bcp47` (array) + session `ScriptPrefill` — and **no** `irPath('header','script')`; assert `pb_build_list` declares `inputs` of CLDR suggestions + base IR seed and an **output that rides on `SurveyPhaseResult.confirmedInventory`** (`PhaseB.tsx:610`), NOT a `KeyboardIR` write; confirm neither becomes a top-level manifest entry; confirm the spec-016 drift bijection stays green with the drill-down nodes present.

**Acceptance Scenarios**:

1. **Given** `prefill`, **When** it is declared, **Then** it is a **registry-keyed drill-down under the opaque `characters` node** (NOT a manifest entry), with `writes: []` and `inputs` = `header.bcp47` (array, session-derived) + the session-level `ScriptPrefill` (script subtag / A2 class / routing group); **no** `irPath('header','script')` is declared.
2. **Given** `pb_build_list`, **When** it is declared, **Then** it is a **registry-keyed drill-down under the opaque `characters` node** behind the mandatory IntroChooser discovery-method gate (`PhaseB.tsx` ~`744`), with `inputs` = CLDR suggestions (async, stays in component) + base IR seed, and its confirmed-inventory output declared as riding on **`SurveyPhaseResult.confirmedInventory`** — **not** a `KeyboardIR` write.
3. **Given** the declarations land, **When** the spec-015 projection renders, **Then** `prefill` and `pb_build_list` appear as registry-keyed drill-downs (not top-level nodes), and the spec-016 drift bijection (rendered ⟺ manifest + `questionRegistry` runtime reach) stays **green**.
4. **Given** Phase 1, **When** the declarations land, **Then** **neither** `prefill` nor `pb_build_list` is promoted to a first-class manifest entry (that is Phase 2) and **no** component is wired to resolve as its node (that is specs 018–021).

---

### User Story 3 - Writes are declared before inputs and the cross-graph C5 obligation is resolved (Priority: P1)

A completeness maintainer wants `writes` declared **before** `inputs`, and the cross-graph C5 obligation resolved, so that **C5 never transiently reds** and `prefill`'s session-derived inputs are handled honestly.

**Why this priority**: `checkInputsSatisfiable` (C5, `completeness.ts:419-437`) flags any input path not covered by some node's writes in the same graph; declaring an input before its producer's write exists would transiently red C5 mid-sequence. And `prefill`'s `header.bcp47` input is produced by `iso_code` inside the opaque `charactersStep`, invisible to the manifest graph — a naive manifest-level declaration orphans regardless of ordering. Both must be handled or C5 reds.

**Independent Test**: Replay the declaration sequence step-by-step and assert C5 (`runCompleteness`) is green after **every** intermediate step (writes always land before the matching inputs); then apply the chosen cross-graph C5 option (D1) and assert manifest-level C5 returns **no spurious orphan** for `prefill`'s `header.bcp47` / `ScriptPrefill`, and (Option B) that the separate question-writer C5 resolves `iso_code → header.bcp47` in the question graph.

**Acceptance Scenarios**:

1. **Given** the declaration sequence, **When** each step is applied, **Then** the `writes` array is populated **before** the matching `inputs` array, so C5 (`checkInputsSatisfiable`) is green at every intermediate point — never transiently RED.
2. **Given** `prefill`'s `header.bcp47` + `ScriptPrefill` inputs (produced by `iso_code` inside the opaque `charactersStep`, not a manifest step), **When** the chosen cross-graph C5 option (D1) is applied, **Then** manifest-level C5 returns **no spurious orphan** for `prefill`.
3. **Given** Option B is chosen, **When** the separate question-writer C5 runs, **Then** it resolves `iso_code (iso_code.ts:80) → header.bcp47` within the question graph, and the cross-graph exemption is scoped tightly enough that a genuine orphan is still flagged RED.
4. **Given** Option A is chosen instead, **When** the subsuming manifest step declares `header.bcp47` (+ `ScriptPrefill` source) in its own `writes`, **Then** manifest-level C5 resolves `prefill`'s input within the single manifest graph; the spec records that this attributes a write to a placeholder that does not literally execute it in P1.

---

### Edge Cases

- **Declaring `irPath('header','script')`**: forbidden — the path does not exist in `KeyboardIR` (`keyboard-ir.ts:348-359`); `prefill`'s script signal is the session-level `ScriptPrefill`, not a `header.script` IR leaf. A test asserts no declaration references it.
- **`header.bcp47` is an array, session-derived**: `prefill` and `track` read it as an array; it is produced by `iso_code` inside the opaque `charactersStep`. Declaring it as a manifest-level input without the D1 resolution orphans (C5 RED) — see US3.
- **`track`'s branch selection has no IR leaf in P1**: `track` selects a branch (copy/adapt) rather than writing an IR leaf, so its `writes` are `[]` (D2). Empty `writes` is valid — it means "this step writes no IR" and never reds C5 (it produces no input to orphan).
- **`pb_build_list` output is not a `KeyboardIR` write**: its confirmed inventory rides on `SurveyPhaseResult.confirmedInventory` (`PhaseB.tsx:610`), a phase-result field, not an IR location — so its "output" is NOT declared as an `irPath()` write. The build-list surface compares byte-identically via the produced `SurveyPhaseResult` (deep-equal `confirmedInventory` union), not IR/emit bytes.
- **A declared input whose producer is on a different graph**: the cross-graph C5 obligation — handled by D1. Off-spine-but-transitively-joining steps (`project_name` → `joinTarget:"characters"`) are reached per `findUnreachable`'s transitive-`joinTarget` rule and are not orphaned by reachability.
- **Reserve / library modules**: a registered-but-unreachable registry id is out of scope here; no-delete demotion is spec 022's concern.

## Requirements *(mandatory)*

### Functional Requirements

**Populate existing manifest editor-steps (US1)**

- **FR-001**: The system MUST populate the currently-empty `inputs` / `writes` on the **existing** `carve` / `mechanisms` / `touch` / `track` / `project_name` editor-steps (`steps/registerEditorSteps.ts`). These are **NOT new declarations** — `track` already exists (`registerEditorSteps.ts:71-79`, `manifest.ts:77`, `spine:true`); the others (`carve`, `mechanisms`, `touch`, `project_name`) already exist with empty arrays.
- **FR-002**: Every declared `input` / `write` MUST resolve to an **existing** `KeyboardIR` location expressible via `irPath()`; **no new `KeyboardIR` field** may be referenced and **no contracts bump** is permitted. Concretely: `carve` → `groups[]` / `stores[]` / `raw[]` (matching `CARVE_WRITES`, `editorMutate.ts:42-46`); `mechanisms` → `groups[]` / `stores[]` (matching `ADD_GALLERY_WRITES`, `editorMutate.ts:203-206`); `touch` → `touchLayout.platforms[].layers[].rows[].keys[]` (matching `TOUCH_WRITES`, `editorMutate.ts:172`).
- **FR-003**: `track` MUST declare `inputs` = `header.bcp47` (array, session-derived) + resolved base IR (`base.displayName`) and `writes` = **`[]`** (branch selection only, no IR leaf in P1 — **[NEEDS DECISION: D2]**). `project_name` MUST carry its declared contract against existing `KeyboardIR` locations.
- **FR-004**: **`irPath('header','script')` MUST NOT be declared anywhere.** It does not exist in `KeyboardIR` (`keyboard-ir.ts:348-359`); a test MUST assert no declaration references it (FR-013).

**Add prefill / pb_build_list drill-down declarations (US2)**

- **FR-005**: The system MUST add **new** registry drill-down declarations for `prefill` and `pb_build_list` (which have no manifest entry today). Both MUST be **registry-keyed drill-downs under the opaque `characters` node**, NOT top-level manifest entries.
- **FR-006**: `prefill` MUST declare `writes: []` (read-only confirm) and `inputs` = `header.bcp47` (an array, session-derived) + the session-level `ScriptPrefill` (script subtag / A2 class / routing group). It MUST NOT declare `irPath('header','script')`.
- **FR-007**: `pb_build_list` MUST declare `inputs` = CLDR suggestions (async, stays in component) + base IR seed, and its confirmed-inventory **output MUST be declared as riding on `SurveyPhaseResult.confirmedInventory`** (`PhaseB.tsx:610`), **not** as a `KeyboardIR` write. `pb_build_list` MUST be reached behind the mandatory IntroChooser discovery-method gate (`PhaseB.tsx` ~`744`).
- **FR-008**: This feature MUST NOT promote `prefill` or `pb_build_list` to first-class manifest entries (Phase 2) and MUST NOT wire any component to resolve as its node (specs 018–021).

**Sequencing and the cross-graph C5 obligation (US3)**

- **FR-009**: Within this spec, the `writes`-declaration on every step MUST be sequenced **strictly before** the corresponding `inputs`-declaration, so C5 (`checkInputsSatisfiable`, `completeness.ts:419-437`) **never transiently reds** during the declaration sequence — regardless of which cross-graph C5 option (D1) is chosen.
- **FR-010**: The cross-graph C5 obligation for `prefill`'s session-derived inputs MUST be resolved per the chosen option (D1: Option A subsumption vs Option B cross-graph exemption + separate question-writer C5), OR carried as the explicit **[NEEDS DECISION: D1]** clarification with Option A / Option B framing and the Option B recommendation. Once the decision is applied, manifest-level C5 MUST return **no spurious orphan** for `prefill`.
- **FR-011**: If Option B is chosen, the **separate question-writer C5** MUST resolve `iso_code (iso_code.ts:80) → header.bcp47` within the question graph, and the cross-graph exemption MUST be scoped so it cannot mask a genuine orphan. If Option A is chosen, the subsuming manifest step MUST declare `header.bcp47` (+ `ScriptPrefill` source) in its own `writes`; the spec records the honesty trade-off this incurs.

**Per-step unit tests and completeness (US1–US3)**

- **FR-012**: Per-step unit tests MUST live in the mirrored test tree (`packages/studio/tests/survey/questions/{a,b,f}/`) and assert that each declared step's `inputs` / `writes` are **well-formed** (resolve via `irPath()` to existing locations) and — for the read-only `prefill` — that its inputs are **satisfiable** (per the D1 resolution). C7 (reachable) is computed **per-graph** per §2.2(b) (editor-steps via `findUnreachable`; survey questions via `resolveNext`).
- **FR-013**: A test MUST assert **no declaration references `irPath('header','script')`** (FR-004).
- **FR-014**: C1–C7 MUST stay green (C7 per-graph), and `validateManifestShape()` M2–M6 (incl. M4b) MUST stay green. The spec-016 drift bijection MUST stay green with the new drill-down nodes present.

**Phase-1 invariants (no-op / declared-only)**

- **FR-015**: This feature MUST introduce **no new write routing** (no `mutate()` executes; the flag stays off; every gallery keeps its current write mechanism), **no contracts bump**, and behavior MUST remain **byte-identical**. The only artifacts are the populated declaration arrays plus the per-step unit tests.

**Out of scope (explicit non-goals)**

- **FR-016**: This feature MUST NOT execute any `mutate()` or flip any flag; MUST NOT add new write routing or change any existing write mechanism; MUST NOT bump contracts or add a `KeyboardIR` field; MUST NOT wire any component to resolve as its node (specs 018–021); MUST NOT promote `prefill` / `pb_build_list` to first-class manifest entries (Phase 2); MUST NOT change `DashboardView` rendering (015) or the drift bijection test (016); and MUST NOT finalize the D1 C5 mechanism (it is presented as options with a recommendation and parked as [NEEDS DECISION]).

### Key Entities *(include if feature involves data)*

> No `@keyboard-studio/contracts` change. All entities below are **existing** symbols / locations reused as-is (no contracts bump).

- **`EditorStep.inputs` / `EditorStep.writes` (`IRPath[]`)**: The declared per-step contract arrays on the existing editor-steps (`steps/registerEditorSteps.ts`), currently empty (`inputs: []` / `writes: []`); populated by this spec against existing `KeyboardIR` locations.
- **`CARVE_WRITES` / `ADD_GALLERY_WRITES` / `TOUCH_WRITES`**: The existing containment sets in `steps/editorMutate.ts` (`editorMutate.ts:42-46`, `203-206`, `172`) — `groups[]`/`stores[]`/`raw[]`, `groups[]`/`stores[]`, and `touchLayout.platforms[].layers[].rows[].keys[]` respectively — the source-of-truth surfaces the carve / mechanisms / touch declarations mirror. Declared, **not** executed in P1.
- **`irPath()` / `IRPath`**: `@keyboard-studio/contracts` (`ir-path.ts:205` / `:186`) — the typed path algebra; every declared input/write is an `irPath()` over an existing `KeyboardIR` location. `irPath('header','script')` is not constructible and is forbidden.
- **`prefill` (drill-down)**: The hand-built `Prefill` confirm screen (`Prefill.tsx:64`); a registry-keyed drill-down under the opaque `characters` node; `writes: []`, `inputs` = `header.bcp47` (array) + session `ScriptPrefill`.
- **`pb_build_list` (drill-down)**: The hand-built `BuildListView` (`PhaseB.tsx:535`, used ~`692`); a registry-keyed drill-down behind the mandatory IntroChooser gate (~`744`); output rides on `SurveyPhaseResult.confirmedInventory` (`PhaseB.tsx:610`), not IR.
- **`charactersStep` (opaque placeholder)**: `manifest.ts:47-56` — the single manifest node subsuming the Phase A/B survey questions; the cross-graph boundary `prefill`'s `header.bcp47` writer (`iso_code`) hides behind.
- **`iso_code` (survey question)**: `survey/questions/a/iso_code.ts`; writes `irPath('header','bcp47')` (`iso_code.ts:80`); the true producer of `prefill`'s `header.bcp47` input, invisible to the manifest graph.
- **`checkInputsSatisfiable` (C5)**: `completeness.ts:419-437` — flags any `inputPath` not present in any node's `writePaths` **in the same StepGraph**; `runCompleteness` builds that graph from the manifest only (`buildMinimalStepGraph`, `completeness.ts:532-567`).
- **`SurveyPhaseResult.confirmedInventory`**: `surveyPhaseResult.ts` / `PhaseB.tsx:610` — the phase-result field `pb_build_list` outputs to; NOT a `KeyboardIR` location.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `carve` / `mechanisms` / `touch` / `track` / `project_name` each carry well-formed `inputs` / `writes` resolving (via `irPath()`) to existing `KeyboardIR` locations; an audit finds **no** new `KeyboardIR` field referenced and **no** `@keyboard-studio/contracts` change.
- **SC-002**: `prefill` is declared with `writes: []` and `inputs` of `header.bcp47` (array) + session `ScriptPrefill`; an audit finds **no** `irPath('header','script')` declared anywhere.
- **SC-003**: `pb_build_list` is declared as a registry-keyed drill-down (NOT a manifest entry) whose output rides on `SurveyPhaseResult.confirmedInventory`, behind the mandatory IntroChooser gate.
- **SC-004**: Writes are declared before inputs at every step of the sequence; C5 (`checkInputsSatisfiable`) **never transiently reds** during the declaration sequence (demonstrated by replaying the sequence and asserting C5 green after each intermediate step).
- **SC-005**: The cross-graph C5 obligation is resolved per the chosen option (D1) — manifest-level C5 returns **no spurious orphan** for `prefill` once the decision is applied — OR is carried as the explicit [NEEDS DECISION: D1] clarification with Option A / Option B framing and the Option B recommendation.
- **SC-006**: Per-step unit tests assert well-formed `inputs` / `writes` and `prefill` input-satisfiability; C1–C7 stay green (C7 per-graph); `validateManifestShape()` M2–M6 stays green; the spec-016 drift bijection stays green.
- **SC-007**: `pnpm typecheck` + studio/contracts `vitest` + `pnpm depcruise` are green; flag-off / runtime / render / emitted-bytes output is **byte-identical** to pre-017 (the only diff is the populated declaration arrays + the new tests; no `mutate()` executes).

## Assumptions

- **Specs 015 and 016 are landed and stable.** The `StepGraph`→`FlowGraph`/`GraphNode` adapter + wired `DashboardView` projection (015) and the rendered ⟺ manifest+`questionRegistry` drift guardrail with per-graph reachability (016) exist; declarations surface as nodes via 015 and must keep the 016 bijection green.
- **The existing editor-steps have empty declaration arrays today.** `carve` / `mechanisms` / `touch` / `track` / `project_name` are declared in `registerEditorSteps.ts` with `inputs: []` / `writes: []`; `track` already exists at `registerEditorSteps.ts:71-79` (`manifest.ts:77`). This spec populates, it does not create new manifest steps.
- **The containment sets in `editorMutate.ts` are the source surfaces.** `CARVE_WRITES` / `ADD_GALLERY_WRITES` / `TOUCH_WRITES` already enumerate the exact `irPath()`s; the declarations mirror them. The seam is a live flag-gated write path but the flag stays off and nothing executes in P1.
- **`prefill` / `pb_build_list` have no manifest entry today** and cannot be first-class manifest nodes without decomposing `charactersStep` (Phase 2). They are declared as registry-keyed drill-downs under the opaque `characters` node in P1.
- **`header.bcp47` is an array, session-derived, and produced by `iso_code` inside `charactersStep`.** `iso_code.ts:80` writes `irPath('header','bcp47')`; that writer is invisible to the manifest graph, which is the root of the cross-graph C5 obligation (D1).
- **The cross-graph C5 mechanism is NOT yet human-resolved.** It is in the §6 deferred / developer-decision bucket and was not among the 2026-06-29 resolved items; this spec carries it as [NEEDS DECISION: D1] (Option B recommended) rather than picking it.
- **Phase-1 invariants hold.** No new write routing, no `mutate()` execution, flag off, no contracts bump, behavior byte-identical; every declared step appears as a map node (declared-only / read-only as applicable).
</content>
</invoke>
