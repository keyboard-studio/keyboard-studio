# Migration Plan — Complete the Question Unification

> Status: **draft for review** (no application source changes here). Companion to
> `docs/design-notes/question-unification.html` (the design note), which carries the
> full flow inventory and verified facts. This plan turns that note into an ordered,
> speckit-ready execution sequence. Verified against current `main` (HEAD `ff0fe65`).
> Structural claims were verified against working-tree code; the file:line **anchors**
> below are approximate (files are actively edited) — trust the symbol names, treat the
> line numbers as a starting point.

---

## 1. Goal & the load-bearing invariant

**Invariant (the single principle everything else serves):**

> The flow map is a **read-only projection of the SAME structure the app renders
> from** — the manifest (`packages/studio/src/steps/manifest.ts`) plus the
> `questionRegistry` (`packages/studio/src/survey/questions/registry.ts`). Because
> the map and the runtime derive from one structure, they **cannot drift — by
> construction, not by intent**.

The manifest header already *declares* this intent — "The runtime (T028) and the
dashboard (T031) both read this array … `map == runtime by construction`"
(`steps/manifest.ts:1-6`). The migration's job is to make that true everywhere it
is currently only aspirational.

### Why the current state violates the invariant

Three concrete, code-confirmed violations:

1. **Two parallel ordering sources.** The dashboard's survey-flow section is built
   only from the four per-phase `*.modular.yaml` files — `FLOW_SOURCES`
   (`dashboard/DashboardView.tsx:48-54`) via `buildModularFlowGraph()`. It **never
   calls** `buildManifestStepGraph()` (`dashboard/buildStepGraph.ts:237`), which is
   the one function that emits exactly one node per manifest entry. The manifest
   editor-steps (carve, mechanisms, touch — `steps/manifest.ts`) therefore get **no
   map node**, and the "stub (gallery / wizard step)" legend swatch is dead because
   nothing emits `kind:'stub'` (it is a `FlowGraph` `GraphNode.kind` value;
   `buildManifestStepGraph` emits `StepGraphNode.type` of `'editor-step'`/
   `'question-step'`, never `kind:'stub'`). Two ordering lists ⇒ drift is possible.

2. **`buildManifestStepGraph` written but never wired.** The projection function
   exists and is correct (`buildStepGraph.ts:237`), exercised only by tests
   (`completeness.ts` deliberately AVOIDS importing it to prevent a circular
   dependency — see `completeness.ts:526`). The dashboard does not consume it. The
   mechanism for "can't drift" is built and sitting on the shelf.

3. **"Generate from real questions" assumed everything is a question.** The mature,
   canonical experiences are NOT questions in any data source: the Phase B build-list
   default `BuildListView` (`survey/PhaseB.tsx:535`, used ~`692`) is hand-built and in
   **no** data source; "Confirm the basics" Prefill (`survey/Prefill.tsx:64`) is hand-built;
   "How do you want to use this base?" TrackStep (`editors/.../TrackStep.tsx:40`) is
   a manifest editor-step with no question; the carve / mechanism / touch galleries
   are editor-steps that still write outside the unified seam. Meanwhile the full
   non-identity Phase A is **orphaned** — `StudioShell.tsx:18` imports
   `IdentityLite, Prefill, PhaseB, PhaseF`, never `PhaseA`, so the
   `phase_a_identity.modular.yaml` battery is shown in the map but never rendered.

**Enforcement gate (headline acceptance criterion):** after this migration, any
divergence between the node set the dashboard **renders** and the union of manifest
step ids + `questionRegistry` ids the runtime reaches is a **CI failure**, not a silent
divergence (see §2 foundation piece (b) and §4 — note this is the real bijection, not
the pre-existing tautological manifest↔`buildManifestStepGraph` test).

---

## 2. Phase 1 — Import mature components as OPAQUE first-class steps

**Thesis.** Phase 1 makes every mature flow *appear on the map as a first-class node
with declared inputs/outputs*, **without changing any write path and without a
contracts bump.** Each component becomes a black box with a well-defined contract
(what it reads, what it writes, where it sits in the flow). We move the boundary, not
the behavior. This is the low-risk, high-leverage half: the map stops lying, drift
becomes impossible, and every subsequent decomposition (Phase 2) has a stable
contract to refactor behind.

**Two explicit constraints that make Phase 1 safe:**

- **No new write routing.** Phase 1 preserves every existing write path. Galleries
  keep their current mechanisms (carve via direct store mutators; physical via R1
  `lockDesktop`; touch via R2 `buildTouchLayoutJson`/side-car). `mutate()` is NOT
  introduced as a live write path for any new surface in Phase 1.
- **No contracts bump.** Phase 1 reuses existing `KeyboardIR` `groups[]` / `stores[]`
  / `raw[]` / `touchLayout` locations for declared inputs/writes. **KeyboardIR has no
  top-level `layers[]`** — its top-level arrays are `stores[]` / `groups[]` / `raw[]`
  plus optional `touchLayout?` / `visualKeyboard?` (`keyboard-ir.ts:348-359`); a
  `layers[].rows[].keys[]` shape exists ONLY nested under
  `touchLayout.platforms[]`. Each declared input/write (`groups[]`, `stores[]`,
  `raw[]`, `touchLayout…`, `header.bcp47`, `header.script`) is therefore an existing
  KeyboardIR location expressible via `irPath()` — so no new `KeyboardIR` field, no
  `@keyboard-studio/contracts` change, and no §18 sign-off in this phase. (All
  contracts decisions are deferred to Phase 2 — see §6 Open decisions.)

> Note (current code): `steps/editorMutate.ts` already declares containment sets and
> patch builders — `CARVE_WRITES` (`groups[]`/`stores[]`/`raw[]`, `editorMutate.ts:42-46`),
> `TOUCH_WRITES`, `ADD_GALLERY_WRITES` (`groups[]`/`stores[]`, `editorMutate.ts:203-206`)
> with `buildCarvePatch` / `applyAddGalleryMutate`. **The seam is already a live,
> flag-gated IR write path**, not dormant scaffolding: `applyCarveMutate` and
> `applyAddGalleryMutate` route through `applyMutatePatch` when `isMutateSeamEnabled()`
> is on (`projectWorkingCopyVfs.ts:243,289`; `reducer.ts` mutate branch ~`205-217`).
> What Phase 1 does NOT do is route any **new** surface through the seam or flip the
> flag on by default — the galleries' current write paths stay as-is
> (`editors/carve/CarveGallery.tsx:28-72` still calls
> `deleteNode/restoreNode/deleteItem/restoreItem/restoreAll/keepAll` directly).
> Phase 2 extends the seam to the remaining surfaces and per-iteration writes.

### 2.1 Per-step contract table

For each mature flow, Phase 1 declares the contract below. "Current write mechanism"
is **preserved unchanged** in Phase 1. Acceptance for every row: **behavior is
byte-identical to today AND the step appears as a node in the map.**

| Step id (proposed) | Flow placement (branch / lock / order) | Declared INPUTS (reads) | Declared OUTPUTS / WRITES | Current write mechanism (preserved in P1) | Acceptance criteria |
|---|---|---|---|---|---|
| `track` (TrackStep) | Spine editor-step after `choose_base`; branch-defining (copy vs adapt). **Already a declared manifest editor-step** (`registerEditorSteps.ts:71-79`, `manifest.ts:77`, `spine:true`) — P1 only populates inputs/writes | `header.bcp47` (array, session-derived), resolved base IR (`base.displayName`) | branch selection only (no IR leaf in P1); copy-track gates the `project_name` side-trail | Hand-coded fork in `StudioShell` `handleTrackSelected` (`StudioShell.tsx:602`) | Byte-identical fork behavior; gets a map node automatically once foundation (a) lands; branch (`project_name` fork) moved to YAML in Phase 2 (spec #10) |
| `prefill` ("Confirm the basics") | **Phase-1 drill-down inside the opaque `characters` node** (NOT a top-level manifest entry); rendered as a sub-stage of `characters` (`StudioShell.tsx:930-940`) | `header.bcp47` (an **array**, session-derived) + the **session-level `ScriptPrefill`** (script subtag / A2 class / routing group). **NOT** a `header.script` IR leaf — `irPath('header','script')` does not exist and must NOT be declared. These are session-derived, so either C5 treats `ScriptPrefill` as a satisfiable upstream source, or they are declared as session inputs distinct from `irPath()` inputs | **none** (read-only confirm; `writes: []`) | Hand-built `Prefill` (`Prefill.tsx:64`); advancing the confirm advances the flow | Byte-identical; appears as a read-only registry drill-down. **C5 caveat:** declaring `header.bcp47` as a manifest-level input would orphan (its writer `iso_code` is a survey question inside the opaque `characters` placeholder, not a manifest step) — see §2.4 step 3 |
| `pb_build_list` (BuildListView, build-list branch) | **Build-list branch** of `phase_b_characters.modular.yaml`, reached from the IntroChooser discovery-method gate; a **registry-keyed drill-down** under the opaque `characters` node in P1 (NOT a top-level manifest entry). The IntroChooser gate is **mandatory** — there is no auto-default | CLDR suggestions (async, stays in component), base IR seed | confirmed character inventory | Hand-built `BuildListView` (`PhaseB.tsx:535`, used ~`692`); inventory rides on `SurveyPhaseResult.confirmedInventory` (`PhaseB.tsx:610`), NOT IR | Byte-identical inventory output; appears as the build-list branch node behind the IntroChooser gate (`PhaseB.tsx` IntroChooser ~`744`); the `pb_*` battery is the step-by-step branch |
| `carve` (CarveGallery) | Spine editor-step after `characters` (`manifest.ts`); "Form 4" gallery | the `groups[]`/`stores[]`/`raw[]` the deletion overlay reads | deletion overlay over `groups[]` / `stores[]` / `raw[]` (declared in P1 per `CARVE_WRITES` `editorMutate.ts:42-46`; not executed via mutate) | **Direct store mutators** (`CarveGallery.tsx:28-72`) maintaining deletion overlay + undo stack | Byte-identical carve overlay; appears as a map node; declared `inputs`/`writes` populated |
| `mechanisms` (MechanismGallery, physical) | Spine editor-step, `lock: "physical"` (the spread in `manifest.ts:96-99`; surface declared `registerEditorSteps.ts:119-128`) | base layout `groups[]` / `stores[]`; gallery assignments from `phaseResults` | physical assignments → `groups[]` / `stores[]` (per `ADD_GALLERY_WRITES` `editorMutate.ts:203-206`) | R1 `lockDesktop()` runs **unconditionally** (`reducer.ts:222`); the flag-gated touch re-propagation add-on at `reducer.ts:228-243` is OFF in P1; assignments projected by `physicalAssignmentsOf` | **REFERENCE / known-good — do not regress.** Byte-identical; appears as a map node |
| `touch` (TouchGallery) | Spine editor-step, `lock: "touch"` (the spread in `manifest.ts:109-112`); `touch_seed_source` side-trail (`spine:false`, `joinTarget:"touch"`) | locked physical layout (seed); gallery touch assignments | touch layout → `KeyboardIR.touchLayout.platforms[].layers[].rows[].keys[]` (per `TOUCH_WRITES`) + shipped `.keyman-touch-layout` side-car | R2 `buildTouchLayoutJson`/`setTouchLayoutJson` runs **unconditionally** (`reducer.ts:249-277`) | **REFERENCE / known-good — VERIFIED end-to-end (#831 merged `c9f64ba`); do not regress.** Byte-identical; appears as a map node |

**Decision item — orphaned full Phase A** (`phase_a_identity.modular.yaml`, 15
identity + 15 `provenance_*`): not rendered (`StudioShell.tsx:18` never imports
`PhaseA`). **Recommended disposition: demote to the inert library** (the
`identity_lite` head is the canonical identity experience). Alternative: wire `PhaseA`
back into `StudioShell` if product intends to revive the long battery soon. This is an
open product decision for Matt (§6); the plan assumes demote-to-library unless told
otherwise. Demotion is **not deletion** (no-delete guardrail, §4).

### 2.2 Foundation pieces (land these first — they make the table true)

**(a) Wire DashboardView to project the manifest — via a new StepGraph adapter.**
`buildManifestStepGraph()` (`buildStepGraph.ts:237`) returns a `StepGraph` of
`StepGraphNode` (`type:'editor-step'|'question-step'`, `spine`, `writePaths`, `lock`,
`joinTarget`), a **different type** from the `FlowGraph`/`GraphNode` the dashboard
renders. The only renderer (`FlowGraphView`, `FlowGraphView.tsx:60`) and the only
layout (`layoutFlowGraph`, `layout.ts:60`) consume `FlowGraph` **only**. So this
foundation is NOT a one-line renderer switch: the deliverable is a **`StepGraph` →
`FlowGraph`/`GraphNode` adapter** (or a `StepGraph`-aware layout+view) that maps each
manifest editor-step node to a `GraphNode`, assigning `kind:'stub'` so the existing
"stub (gallery / wizard step)" legend renders — **nothing emits `kind:'stub'` today**,
so the legend does not "go live automatically"; the adapter is what lights it. The
per-phase modular graphs (`buildModularFlowGraph`) hang as **registry-keyed
drill-downs** under each question-step node. Result: the carve / mechanism / touch
editor-steps appear (they are already in the manifest). **`computeReserveNodes`
(`buildStepGraph.ts:150-182`) is a SEPARATE mechanism** — it runs on the
`buildModularFlowGraph` registry-vs-YAML diff path, NOT on this manifest projection; it
gets library content from the §2.3 YAML/registry demotions, not from foundation (a).
This is still **read-only, zero-runtime/IR-impact** but materially more than a switch —
it is the load-bearing first step everything else sits behind. Gated by the existing
dev-only flowmap flag — ship it first. **Constraint preserved:** the dashboard must
stay store-free / props-only (`DashboardView.tsx:11-14`); the adapter must avoid
`stores/` and `editors/`; `pnpm depcruise` forbids dashboard→stores/editors and must
stay green (baseline green at 593 modules).

**(b) CI drift-guardrail test — guard the REAL bijection, not a tautology.** A
near-identical trivial test **already exists** at `buildStepGraph.test.ts:323-356`,
asserting `buildManifestStepGraph()` node ids == manifest step ids. That bijection is a
**tautology** — `buildManifestStepGraph` maps over the same `manifest` array, and
`findUnreachable` (`completeness.ts:475-499`) reads the same manifest — so it can never
catch the drift §1 indicts (the `*.modular.yaml` survey questions vs the manifest;
the whole Phase A/B battery is one opaque `charactersStep` placeholder,
`manifest.ts:47-56`). **The new guardrail is NOT that test.** It must assert the
bijection between the node set the dashboard **actually renders** (post foundation (a):
the `buildManifestStepGraph` spine adapter + the `buildModularFlowGraph` drill-downs
keyed by `questionRegistry`) and the **union of manifest step ids + `questionRegistry`
ids the runtime reaches** — so a YAML/registry/manifest divergence fails CI. Add an
explicit **negative test**: a manifest step with no registry/YAML coverage (and
vice-versa) must go **RED**. Define "reachable" **per-graph**: for manifest
editor-steps, `findUnreachable`'s spine-or-transitive-`joinTarget` rule
(`completeness.ts:475-499`); for survey questions, reachable-from-flow-entry via
`resolveNext` over `next`/`FlowGotoRule[]` (the `buildGraphFromQuestions` edge set,
`buildStepGraph.ts:84-112`) — `findUnreachable` has no awareness of `FlowGotoRule`
branching. The guardrail runs BOTH computations; a boundary-crossing step (e.g.
`pb_build_list` as a build-list branch) is checked in the **question** graph. This is
the headline enforcement of the §1 invariant. Co-locate with the existing
manifest-shape guards (`validateManifestShape()` M2–M6, incl. M4b — `manifest.test.ts:3`)
and completeness checks C1–C7 (`dashboard/completeness.ts`).

### 2.3 Library demotions (under the no-delete guardrail)

Demote into the inert library (rendered as reserve nodes, never reached at runtime,
still registered + test-covered + revivable):

- The **`pb_*` step-by-step battery** (55 modules, `phase_b_characters.modular.yaml`)
  — kept reachable via the discovery-method gate (off the default spine), rendered as
  reserve where not on the active branch.
- The **full non-identity Phase A** (15 identity + 15 `provenance_*`) — the orphaned
  battery; demote since `identity_lite` is canonical. (Subject to §6 decision.)

No-delete guardrail: modules stay registered in their sub-registries and on disk;
they are simply absent from the active flow ordering, so `computeReserveNodes`
renders them. A no-delete CI assertion (registry membership preserved) backs this.

**Strategy-axis impact of the `pb_*` demotion (§7 chain — required).** The `pb_*`
battery is the **sole runtime elicitor** of strategy decision-tree axes:
`pb_char_count` drives **A1** (Scale; buckets `<5`/`5-20`/`21-100`/`>100`,
`pb_char_count.ts:63-66`), `pb_typing_approach` drives **A3**
(phonetic-intuition strong/weak, `pb_typing_approach.ts:69-72`), and
`pb_stacking_marks`/`pb_mark_input_order` drive **A4** (diacritic behaviour,
`pb_stacking_marks.ts:44`). These computed axes ride on
`SurveyPhaseResult.computedAxes` (`surveyPhaseResult.ts:50`) and feed `selectStrategy`
(`browserPatternLibrary.ts:160`). The default build-list path (`BuildListView`) collects
inventory **only** (`confirmedInventory`) and leaves A1/A3/A4 **unelicited**. Per spec
§7's full-axis-vector input contract, the strategy selector **default-fills** the
unelicited A1/A3/A4 from the **script-class prior** and records each as `axisFills`, so
`selectStrategy` output is unchanged — demotion **preserves today's default-path
behaviour and is not a regression** (the gap already exists on today's default path).
Phase-2 note: the per-character build-list loop (§3.2) is the intended future home for
re-eliciting A1/A3/A4 inline, closing the default-fill gap. **Acceptance criterion for
`qu-library-demote`:** `selectStrategy` output for the default build-list path is
unchanged (axisFills-driven), verified against the §7.5 exemplar rows.

**Non-Latin precondition (km-domain).** Demoting the `pb_*` battery off the DEFAULT
spine is acceptable **ONLY** until the Phase 2 per-element loop re-incorporates the
script-specific mark/joining/order sub-series for non-Latin classes. For
`A2 != alphabetic-Latin`, the discovery-method gate MUST still route to (or the loop
MUST subsume) the Indic / SEA / RTL / syllabic sub-questions
(`pb_mark_input_order` / `pb_stacking_marks` / direction-control routing). Therefore
**"the loop subsumes `pb_*` script semantics" is a precondition for any default flip on
non-Latin scripts** — a non-Latin default may not flip to a path that drops these
sub-series.

**Phase-A provenance caveat (km-domain).** Demoting full Phase A drops **runtime
capture** of `orthographyUrl` (a linguist-agent grounding input) and community
provenance, even though the modules stay on disk. Recommendation: `identity_lite` or
the documentation stage should **retain at least `orthographyUrl` capture** so the
linguist-agent grounding input is not lost when Phase A is demoted.

### 2.4 Intra-Phase-1 sequencing

1. **Map-projection first** — foundation (a). Read-only, zero-risk. Lights up every
   gallery node and the reserve nodes immediately.
2. **Drift guardrail** — foundation (b). Lock in the invariant before adding steps.
3. **Declare-only** — populate the currently-empty `inputs: []` / `writes: []` on the
   **existing** carve / mechanism / touch **AND** `track` / `project_name`
   editor-steps (`registerEditorSteps.ts` — `track` already exists at
   `registerEditorSteps.ts:71-79`, `manifest.ts:77`; it is NOT a new declaration), and
   add **new** registry drill-down declarations only for `prefill` and `pb_build_list`
   (which have no manifest entry today). **No `mutate()` executes** (flag off).
   **C5 obligation (corrected — declaring inputs does NOT auto-green C5).**
   `checkInputsSatisfiable` (`completeness.ts:419-437`) flags any input path not
   produced by some node's `writes` **in the same StepGraph**, and `runCompleteness`
   builds that graph from the **manifest only** (`buildMinimalStepGraph`,
   `completeness.ts:532-567`). `prefill`'s reads (`header.bcp47`, the session
   `ScriptPrefill`) are written by the survey question `iso_code` (`iso_code.ts:80`
   writes `irPath('header','bcp47')`), which is hidden inside the opaque
   `charactersStep` placeholder and is **not** a manifest step — so declaring those as
   manifest-level inputs would make C5 return an **orphan (RED)**, not green. Resolve by
   either (a) having the manifest step that subsumes the identity survey questions
   declare those writes so manifest-level C5 resolves them, or (b) explicitly **exempting
   cross-graph inputs** (satisfied by a question inside an opaque placeholder, or
   session-derived like `ScriptPrefill`) from manifest-level C5 and treating
   question-writer C5 as a separate check. Pick one, and **sequence writes-declaration
   BEFORE inputs-declaration** so C5 never transiently reds. C7 (reachable) is computed
   per-graph as defined in §2.2(b).
4. **Wire each component step** — make each mature component resolve as its declared
   manifest/registry node (TrackStep, the three galleries on the manifest; Prefill,
   BuildListView as **registry-keyed drill-downs under the opaque `characters` node**,
   NOT top-level manifest entries — promotion to first-class manifest entries is Phase 2
   work), keeping its existing write mechanism. **The SPA render path is untouched in
   Phase 1:** `StudioShell` continues to hand-place the real components
   (`CarveGallery`/`MechanismGallery`/`TouchGallery`/`TrackStep`/`Prefill`) via its
   `activeStepId` switch (`StudioShell.tsx:765-797, 908-940`); `manifest[].component`
   remains unrendered (there is no `SurveyView`), so "resolve as its manifest/registry
   node" means only that the map node exists and the contract is declared — render stays
   byte-identical. Any move to component-resolution-by-manifest is deferred to Phase 2 and
   is itself a user-facing render change requiring parity proof.
5. **Verify** — run the full test strategy below; confirm the drift guardrail is green
   and physical/touch are unregressed.

### 2.5 Phase 1 test strategy

- **Per-step unit tests** — one spec per declared step in the mirrored tree
  (`packages/studio/tests/survey/questions/{a,b,f}/`): assert declared `inputs`/
  `writes` are well-formed and (for read-only `prefill`) that inputs are satisfiable.
- **Map-projection test** — assert the dashboard spine node set equals the
  `buildManifestStepGraph()` → adapter node set, with drill-downs keyed off
  `questionRegistry`.
- **Drift guardrail** — foundation (b); the rendered-graph ⟺ manifest+registry-runtime
  bijection (NOT the trivial manifest↔`buildManifestStepGraph` test that already exists
  at `buildStepGraph.test.ts:323-356`), with the negative test described in §2.2(b).
- **Per-surface "byte-identical" oracle** (the acceptance gate is not one mechanism —
  Phase 1 introduces no recorded byte baseline and relies on before/after equivalence
  runs, mirroring `flagOff.test.ts`'s documented method):
  - IR/emit-writing surfaces (carve / mechanisms / touch) — emit-byte equivalence
    (`flagParity`-style, compares emitted `.kmn` bytes) as the regression lock;
  - `SurveyPhaseResult`-writing surfaces (build-list) — assert the produced
    `SurveyPhaseResult` (`confirmedInventory` union via `mergePhaseResults`) is
    deep-equal before/after (build-list writes `confirmedInventory`, NOT `KeyboardIR`);
  - branch/read-only surfaces (track, prefill) — assert the resolved next-step id /
    branch selection is unchanged via a flow-routing snapshot (no IR or phase-result
    output to compare).
- **Flag parity where applicable** — flag is off throughout Phase 1, so flag-off must
  remain byte-identical to today (F2); no new flag-on path is introduced yet.
- **Don't regress physical / touch** — dedicated tests locking in current physical
  (R1) and touch (R2 / side-car) output; both are known-good and must stay green.
- **Boundary** — `pnpm depcruise` (dashboard stays store-free); `pnpm typecheck`;
  studio + contracts `vitest`.

---

## 3. Phase 2 — Break opaque steps into first-class sub-questions and/or loops

**Thesis.** With every mature flow now an opaque node with a stable contract, Phase 2
opens the boxes: decompose each into first-class sub-questions, introduce the
**looping primitive the schema lacks today**, and route writes through `mutate()` —
one chunk at a time, each behind `VITE_KM_MUTATE_SEAM`, each parity-proven before the
default flips.

### 3.1 The looping primitive (the schema gap to close)

**Confirmed gap (re-verified against current code):**

- The schema has **no iteration construct**. `FlowQuestion.next` is
  `string | null | FlowGotoRule[]` (`survey/types.ts:53`); `FlowGotoRule` is
  `{condition?, goto, default?}` (`survey/types.ts:30-34`). `FlowDef` is a flat
  `questions[]` + optional `provenance_questions[]` (`survey/types.ts:61-67`). No
  loop-entry/exit, no per-iteration index, no collection binding.
- The runner's visited guard is **narrower than it looks**: `advanceThrough()`'s
  `Set<string>` visited guard (`SurveyRunner.tsx:189-204`) applies **ONLY** to the
  consecutive `engine_resolved` skip-chain — a non-`engine_resolved` node returns
  `nextId` immediately (line 197) and is **never recorded as visited**. So ordinary
  user-answered question revisits are **not** currently cycle-guarded here at all;
  they are governed by the per-advance `resolveNext` loop and the back-navigation
  `AnswerStackEntry` stack. The guard exists solely to break an infinite loop while
  skipping `engine_resolved` nodes.
- Completeness treats cycles as a **hard error**: `findCycles` (C2) flags any cycle in
  the writes→inputs data graph (`dashboard/completeness.ts:182-246`, DFS back-edge
  detection ~`229-233`). This — **not** a general user-revisit ban — is the real
  structural blocker to looping.

**Loop unit definition (linguistic — km-domain, required).** The iterated unit is the
**Unicode extended grapheme CLUSTER** (per `InventoryChar`, via `Intl.Segmenter`) —
**NOT** a codepoint and **NOT** a physical key. **Combining marks and direction-control
characters are NOT placement-loop elements** — they route to the mark-mechanism
sub-series (prefix / postfix / stacking). Cross-reference `pb_mark_input_order` and
`pb_stacking_marks` for the mark routing.

**The primitive (additive to `FlowQuestion`/`FlowDef`):**

1. **Loop entry/exit + collection binding (must carry element TYPE).** A new step kind
   (a `loop` / `for-each` node) that names the collection it iterates and the ordered
   sub-series (question-id list / sub-flow) to run per element. Entry establishes the
   iteration set; exit is reached when exhausted. **The collection binding MUST iterate
   a STRUCTURED inventory element — `LinguistInventory`-shaped, typed as one of
   `base-letter` / `cased-pair` / `combining-mark` / `digraph-unit` /
   `independent-vowel` / `nukta` / `direction-control` / `syllabic-final`
   (ref `contracts/linguistInventory.ts`) — NOT a flat NFC `string[]`
   (`confirmedInventory`).** The element class is what routes a unit to the placement
   loop vs the mark-mechanism sub-series; a flat string list cannot recover that class.
   **Open decision (binding type):** the loop's collection binding MUST carry element
   TYPE. If a spec binds `confirmedInventory:string[]`, the plan must FIRST state how
   element class is recovered — it **cannot** be recovered from a flat list, so this is
   an explicit blocker, not an implementation detail. Representable so the map projection
   renders the loop as a **single loop node with the sub-series as a drill-down**, not
   N flattened copies.
2. **Per-iteration state (loop variable).** A bounded, named `{ index, item }`
   threaded into `SurveyContext` so prompts interpolate the current character/key and
   `validate()` can range-check.
3. **Runner change — bounded re-entry (scoped narrowly).** The change is **not**
   "relax an existing user-revisit ban" (no such ban exists for user-answered
   questions — see the corrected gap above). It is: add a **bounded-re-entry mechanism
   + per-iteration state** for the new loop NODE, defining how a user-driven
   per-iteration re-entry interacts with **both** the `engine_resolved` skip-guard
   (`SurveyRunner.tsx:189-204`) **AND** the back-navigation `AnswerStackEntry` stack. A
   loop is a bounded revisit (cardinality = collection length), distinct from an
   unbounded `goto` back-edge.
4. **Completeness change — C2 must distinguish a bounded loop from an illegal cycle
   (concrete mechanism).** `findCycles` today (`completeness.ts:182-246`) builds
   adjacency purely from `writePaths`-intersect-`inputPaths` data edges with **no
   node-kind awareness**, so a per-iteration loop writing `stores[i]` and reading
   `stores[i]` creates exactly the producer→consumer self-edge the back-edge detection
   (~`229-233`) flags as a hard error. The plan's "C2 must not flag it" needs a hook:
   either (a) **tag loop nodes** (`isLoop`/`loopCardinality` on `StepGraphNode`) and
   have `findCycles` skip a back-edge whose **entire cycle is one loop node's
   intra-iteration self-dependency**, OR (b) **model the loop body as a distinct
   sub-graph** so the iteration edge never appears in the top-level `dataEdges`. C5
   (orphan inputs) and C7 (reachable) must understand the sub-series' inputs are
   satisfied by the loop's collection binding.
5. **Per-iteration `mutate()` into IR arrays.** Each pass writes one element of an IR
   collection (per-grapheme/per-key into `groups[]` / `stores[]` / `raw[]`, or
   `touchLayout.platforms[].layers[].rows[].keys[]` for touch — **not** a non-existent
   top-level `layers[]`). The seam already supports the *shape*: `pathAuthorizes`
   authorizes array-index sub-paths under an array `writes` declaration
   (`mutateApply.ts:90-96`), and `pb_standard_letters` already rebuilds a `stores[]`
   array idempotently by stable name (`questions/b/pb_standard_letters.ts:105-125`).
   What's missing: the iteration index/key carried in `MutateContext` and a
   **deterministic per-element slot key**, so re-running pass *i* replaces slot *i*
   (preserving M4 idempotence). No `mutate()` *signature* change is forced.
   **Identification vs output normalization (km-domain).** The loop iterates **NFC**
   graphemes for identification, but the value WRITTEN into the IR follows the
   **output-normalization contract** (NFC for ID; NFD reorder where Phase C dictates) —
   see `linguistInventory.ts:28-33`. Do not assume the IR-written form equals the
   loop's identification form.

> Contracts implication: if the iteration key must round-trip in the IR, that is a
> `KeyboardIR` field ⇒ contracts bump + §18 sign-off (Q5/R3). If it stays purely in
> `MutateContext` (transient per-pass), no contract change. Decide per Q5 (§6).

**Loop scope is IR-write-only — axes do NOT change mid-flow (§7 gate).** If the loop is
built, per-grapheme answers do **NOT** mutate the §7 axis vector. Mark-behaviour-per-
grapheme is exactly the **A4** signal and inventory cardinality is the **A1** signal, so
allowing loop answers to contribute to `computedAxes` would make the axis vector a
function of loop completion and would interact with `selectStrategy`
(`browserPatternLibrary.ts:160`) and the §7.5 exemplar regression. Axis derivation
remains a separate roll-up step; any change to it is a **distinct §7-touching change
requiring km-strategy sign-off**, not part of `qu-mutate-buildlist-loop`. Add a Tier-2
test: loop conversion keeps the §7.5 strategy-selection exemplar rows green.

**Scope caveat — separate "write per-element IR" from "render a per-element loop".**
The per-inventory IR array WRITE is **already achievable with NO schema / runner / C2
change** via the whole-array-rebuild-by-stable-name pattern
(`pb_standard_letters.ts:105-125` rebuilds the whole `stores[]` array from `ctx.ir` in a
single `mutate()`). The loop CONSTRUCT (new step kind, loop variable in
`SurveyContext`/`MutateContext`, runner bounded re-entry, C2 loop-vs-cycle change) is
justified **ONLY** if a committed Phase-2 UX adds genuine per-element **sub-questions**
(placement / casing / mark-behaviour per grapheme). `BuildListView` is one
`multi_select` screen and `MechanismGallery` is one gallery screen — neither is a
per-element question sequence today, and no `*.modular.yaml` contains a loop construct.
**Whether to BUILD the loop is therefore an open product/roadmap decision for Matt (§6),
not something the plan can settle.** Spec #9 (`qu-loop-primitive`) is **deferred pending
Matt's call**; until then, treat per-inventory IR writes as solved by the
rebuild-by-stable-name pattern.

### 3.2 Per-opaque-step breakup

| Opaque step (from P1) | Sub-questions to extract | Loop? | Contracts decision (per-component) |
|---|---|---|---|
| `track` | One radio gate (copy / adapt) → modular gate question; its branch (`project_name` on copy) becomes a YAML `next` rule, not a hand-coded `if` (`StudioShell.tsx:602-614`) | No | Reuse existing (branch is data, no new IR field) |
| `prefill` | Display/read-only `notice/confirm` module, `writes: []`, declaring `header.bcp47` (array) + session `ScriptPrefill` (script subtag / A2 class / routing group) as inputs — **NOT** an `irPath('header','script')` leaf (it does not exist) | No | None (read-only; cleanest fit) |
| `pb_build_list` | A `multi_select`/char-list module that seeds from CLDR + base IR and confirms an inventory; then (only if the loop is built — see §3.1 scope caveat) **per-grapheme sub-series** (placement; casing — **bicameral scripts only**, skipped for unicameral per the `CasedLetters` equal-lists convention; mark behaviour). The loop iterates **NFC grapheme clusters** of the STRUCTURED `LinguistInventory`, not a flat `string[]` | **Deferred** (per-grapheme loop) over confirmed inventory — only if per-element sub-question UX is committed | **Q1:** inventory over existing `stores[]` (à la `pb_standard_letters`, no bump) **vs** a new `confirmedInventory` `KeyboardIR` field (clean but bump + §18). Prefer reuse first |
| `carve` | Per-key/element decisions over the deletion overlay | **Deferred** (per-key/element loop) over base keys | **Q1/R1:** carve-overlay over existing `groups[]`/`stores[]`/`raw[]` (no bump, per `CARVE_WRITES`) **vs** a dedicated carve-overlay IR field (bump + §18). Highest-effort overlay conversion |
| `mechanisms` (physical) | Per-key assignment sub-series | **Deferred** (per-key loop) | Reuse `groups[]`/`stores[]` (per `ADD_GALLERY_WRITES`); batch-patch authorized by one `writes` declaration (`mutateApply.ts:90-96`). REFERENCE — convert **last** |
| `touch` | Per-key touch assignment sub-series | **Deferred** (per-key loop) | `KeyboardIR.touchLayout` already first-class (#825, contracts 0.13.0) — writes target `touchLayout.platforms[].layers[].rows[].keys[]` (`TOUCH_WRITES`), no new bump. **S-13 (Touch layer switch, spec §7.2)** is triggered structurally by `>1` entry in the touch layout layer array, OUTSIDE the decision tree; the per-key touch loop must NOT alter the set of named touch layers in a way that changes S-13 applicability — add an S-13-stability assertion (layer-array cardinality identical flag-on vs flag-off) to the touch 50/50 parity test. REFERENCE — convert **last** |

### 3.3 Phase 2 ordering & rollout

- **One chunk at a time, each independently shippable behind `VITE_KM_MUTATE_SEAM`**
  (default off — `flags/mutateFlag.ts`; F2 = flag-off byte-identical to today).
- Suggested order (lowest-risk first; reference flows last):
  `track` → `prefill` → **loop primitive (only IF committed per Matt's §6 decision;
  landed/co-landed behind the flag with its own parity + completeness tests, R3)** →
  `pb_build_list` (per-grapheme loop only if the primitive is built; otherwise a single
  `multi_select` writer via the rebuild-by-stable-name pattern) → `carve` (overlay, R1)
  → `mechanisms` (physical, REFERENCE) → `touch` (REFERENCE).
- **Parity-proven before flipping default.** Per converted flow, a flag-on/flag-off
  IR-equivalence test (#832 50/50 parity style): run the same answer sequence with
  the flag off (legacy route) and on (`mutate()` route) and assert the resulting
  `KeyboardIR` is equal. A flow does **not** flip its default until its 50/50 parity
  test is green. For the looping build-list the sequence must include a multi-element
  collection so per-iteration writes are exercised on both paths.

### 3.4 Phase 2 test strategy (plan §7 two-tier)

- **Tier 1 — per-question unit tests (mirrored tree):** each promoted module gets a
  colocated spec in `packages/studio/tests/survey/questions/<phase>/<id>.test.ts`
  asserting the mutate() obligations (`contracts/mutate-seam.contract.md`): M2 (only
  declared paths change, siblings byte-identical), M3 (out-of-writes patch fails fast,
  whole-patch rejected), M4 (idempotent), round-trip against reused IR fixtures.
  Read-only `prefill` asserts input satisfiability, not a patch. A loop construct adds
  per-iteration tests: pass *i* writes only slot *i*; re-running pass *i* is
  idempotent; empty collection is a clean no-op. The loop parity fixture must be a
  **NEW multi-element collection (≥3 elements, with at least one re-answered element)**
  exercised on BOTH the legacy and `mutate()` paths, so per-slot idempotence
  (re-running pass *i* replaces only slot *i*) and the empty-collection no-op are both
  proven. Note `pb_standard_letters`' single-store rebuild is **not** a sufficient
  model for per-iteration array writes — a dedicated array-write fixture is needed.
- **Tier 2 — mirrored / structural tree:** keep `validateManifestShape()` (M2–M6, incl. M4b) and
  C1–C7 green. Promotions must keep C3 (rejoin), C5 (orphan inputs), C7 (unreachable)
  passing; the loop must keep C2 green (a bounded loop is not an illegal cycle).
  Physical and touch each keep a dedicated flag-on/flag-off IR-equality test.

---

## 4. Cross-cutting concerns

- **No-break constraints.** Physical (R1 `lockDesktop()` unconditional at
  `reducer.ts:222`; the flag-gated touch re-propagation add-on at `reducer.ts:228-243`
  is OFF in Phase 1) and touch (R2 `buildTouchLayoutJson`/side-car,
  `reducer.ts:249-277`; verified #831 `c9f64ba`) are **known-good reference flows** —
  both base write paths run
  unconditionally today. They are the target shape every other flow should match, not
  flows to re-architect. **Convert them LAST** so neither is ever destabilized to
  unblock another flow.
- **Flag rollout strategy.** `VITE_KM_MUTATE_SEAM` is a single build/deploy-time
  global (F1/F3, `flags/mutateFlag.ts`), default OFF (F2 = the conservative default;
  rollback is "leave it off"). Per-flow conversions land behind it; flip to on in
  dev/preview only after every converted flow's 50/50 parity test is green, soak, then
  default-on (R2: the flip is the riskiest single moment — soak in preview first).
- **No-delete library guardrail.** Demotion ≠ deletion. Reserve modules (`pb_*`
  battery; full Phase A) stay registered + on disk + test-covered, rendered via
  `computeReserveNodes` (`buildStepGraph.ts:150-182`), revivable by re-adding their id
  to a YAML branch. A CI assertion enforces registry membership is preserved.
- **Single-source-of-truth enforcement (headline acceptance gate).** The drift
  guardrail (§2.2b) is the top-level gate, and it must guard the REAL bijection: the
  node set the dashboard **actually renders** ⟺ the union of manifest step ids +
  `questionRegistry` ids the runtime reaches (NOT the tautological
  manifest↔`buildManifestStepGraph` test that already exists). A rendered node with no
  runtime step — or a reachable runtime step with no rendered node — fails CI. The map
  projects manifest + `questionRegistry`; so does the runtime; "adding a question
  appears on the map" is then enforced, not a maintenance chore.

---

## 5. Speckit decomposition (ordered specs)

Each sub-step maps to one speckit spec. Proposed slugs and one-line scopes:

**Phase 1 (opaque-step import — no contracts bump, no new write routing):**

1. `qu-map-projection` — wire DashboardView to render the spine via a **new
   `StepGraph`→`FlowGraph`/`GraphNode` adapter** over `buildManifestStepGraph()` (the
   renderer/layout consume `FlowGraph` only — `layout.ts:60`, `FlowGraphView.tsx:60`),
   mapping editor-steps to `kind:'stub'` so the existing legend renders; registry-keyed
   drill-downs; read-only, dev-flag gated, store/editor-free (depcruise green). **Scope
   is an adapter, not a one-line switch.** (`computeReserveNodes` content comes from
   §2.3 demotions on the modular path, NOT from this projection.)
2. `qu-drift-guardrail` — CI test asserting the **rendered-graph ⟺
   manifest+`questionRegistry`-runtime** bijection (NOT the pre-existing trivial
   manifest↔`buildManifestStepGraph` test at `buildStepGraph.test.ts:323-356`), with a
   negative test (uncovered manifest step / orphan registry id ⇒ RED) and per-graph
   reachability (editor-steps via `findUnreachable`; survey questions via `resolveNext`).
3. `qu-declare-steps` — populate `inputs`/`writes` on the **existing** carve/mechanism/
   touch + track/project_name editor-steps and add **drill-down** declarations for
   prefill/pb_build_list (declared-only, flag off). **Sequence writes BEFORE inputs**;
   resolve the cross-graph C5 obligation (prefill's `header.bcp47` writer `iso_code` is
   inside the opaque `charactersStep`, so manifest-level C5 would orphan unless the
   subsuming step declares the write or cross-graph inputs are exempted — §2.4 step 3).
4. `qu-wire-track` — TrackStep resolves as its first-class manifest node (write path
   unchanged).
5. `qu-wire-prefill` — Prefill resolves as a read-only registry **drill-down under the
   opaque `characters` node** (`writes: []`), NOT a top-level manifest entry; SPA render
   path untouched (StudioShell still hand-places it). Promotion to first-class manifest
   entry deferred to Phase 2.
6. `qu-wire-buildlist` — BuildListView appears as the **build-list branch** drill-down
   behind the **mandatory** IntroChooser discovery-method gate (inventory still on
   `SurveyPhaseResult.confirmedInventory`); NOT a top-level manifest entry; SPA render
   path untouched.
7. `qu-wire-galleries` — carve/mechanisms/touch resolve as first-class map nodes
   (existing write mechanisms preserved; SPA render path untouched).
8. `qu-library-demote` — demote `pb_*` battery + full Phase A to reserve/library under
   the no-delete guardrail (+ CI membership assertion). **Acceptance:** `selectStrategy`
   output for the default build-list path is unchanged (axisFills-driven), verified
   against the §7.5 exemplar rows; retain `orthographyUrl` capture (Phase-A provenance
   caveat, §2.3); demotion of non-Latin `pb_*` script semantics is gated on the loop
   subsuming them (§2.3 non-Latin precondition).

**Phase 2 (decomposition, looping, mutate() routing — behind the flag):**

9. `qu-loop-primitive` — **DEFERRED pending Matt's build-vs-defer decision (§6).**
   Additive loop construct on `FlowQuestion`/`FlowDef` whose collection binding carries
   element TYPE (structured `LinguistInventory`, NOT flat `string[]`), iterating NFC
   grapheme clusters; runner bounded-re-entry (interacting with the `engine_resolved`
   skip-guard AND the answer stack), C2 loop-vs-cycle distinction (tag-loop-node OR
   sub-graph), `MutateContext` iteration key; behind flag, own parity + completeness
   tests. Justified ONLY if per-element sub-question UX is committed — per-inventory IR
   writes are otherwise solved by the rebuild-by-stable-name pattern (§3.1 scope caveat).
10. `qu-mutate-track` — track fork moves into YAML `next` rules, routed via `mutate()`.
11. `qu-mutate-prefill` — prefill as a modular read question (no write).
12. `qu-mutate-buildlist-loop` — build-list as a `mutate()` writer; per-grapheme
    sub-series only if spec #9 is committed (otherwise a single `multi_select` writer
    via the rebuild-by-stable-name pattern); 50/50 parity with multi-element collection;
    axes stay IR-write-only (§3.1) and the §7.5 exemplar rows stay green.
13. `qu-mutate-carve` — carve routed through the reducer's overlay-preserving
    `setWorkingIR` (R1; highest-effort) over `groups[]`/`stores[]`/`raw[]`; per-key loop
    only if spec #9 is committed.
14. `qu-mutate-mechanisms` — physical gallery → batch `mutate()` (REFERENCE; convert
    after others; byte-for-byte parity).
15. `qu-mutate-touch` — touch gallery → `mutate()` (REFERENCE; convert last;
    byte-for-byte parity).
16. `qu-flag-flip` — flip `VITE_KM_MUTATE_SEAM` default-on after all 50/50 parity gates
    green; soak in preview; retire dead direct-store carve mutators.

(Contracts-bump specs are inserted only if Q1/Q5 resolve toward new IR fields — e.g.
`qu-contracts-inventory` / `qu-contracts-loop-key` — gated on Matt's decision.)

---

## 6. Open decisions for Matt

> **Phase 1 scope confirmed (Matt, 2026-06-29):** Phase 1 only specs the conversion of
> the custom/bespoke flow stages into opaque "questions" with valid inputs and outputs.
> The remaining loop-primitive and contracts decisions are deferred to a decision with
> the developers after Phase 1.

1. **[DEFERRED → post-Phase-1 decision with developers]** — the loop build-vs-defer call
   is made with the developers after Phase 1 (it gates the other loop items below).
   **Loop primitive scope — BUILD vs DEFER (Q-new, the headline open decision).** Is
   the Phase-2 looping primitive committed, or deferred? km-simplify argues it is a
   premature abstraction (the current flows are single-screen, and the per-inventory IR
   write is already solved by the `pb_standard_letters` rebuild-by-stable-name pattern);
   four other specialists treat it as legitimate Phase-2 scope. This hinges on whether
   product intends to introduce genuine per-element sub-question UX (placement / casing /
   mark-behaviour per grapheme) — a roadmap decision the plan author cannot make. Spec #9
   is parked until this resolves. (Q1/Q5 below touch the loop's contract scope but not
   the build-vs-defer question.)
2. **[DEFERRED → post-Phase-1 decision with developers]** — depends on the loop being
   built; resolved with the developers after Phase 1.
   **Per-character axis feedback (if the loop is built).** Should per-character
   build-list answers feed back into the §7 strategy axis vector mid-flow?
   Mark-behaviour-per-grapheme is the A4 signal and inventory size is the A1 signal; if
   loop answers contribute to `computedAxes`, the axis vector becomes a function of loop
   completion and interacts with `selectStrategy` and the §7.5 exemplar regression. The
   plan gates this to IR-write-only unless a distinct §7-touching change with km-strategy
   sign-off is committed (§3.1) — but whether axes SHOULD eventually be re-elicited
   per-character is a product call. Related: S-13 (touch layer switch) applicability can
   change if the per-key touch loop alters the set of named touch layers — needs the
   S-13-stability assertion (§3.2 touch row) if the touch loop is built.
3. **[RESOLVED 2026-06-29 — Matt]** — DEMOTE to the inert library ("demote the orphaned
   Phase A. We'll re-use some of that later"). Demote, not delete: modules stay
   registered, on disk, and test-covered per the no-delete guardrail (§4), explicitly
   flagged for later reuse. Retain `orthographyUrl` capture in `identity_lite` / the
   documentation stage so the linguist-agent grounding input is not lost.
   **Orphaned full Phase A disposition (Q3).** Demote to library (plan's default,
   `identity_lite` is canonical) **vs** wire `PhaseA` back into `StudioShell`
   (`StudioShell.tsx:18`) if revival is planned soon. Demote-unless-revival assumed.
   (If demoted, retain `orthographyUrl` capture in `identity_lite` / the documentation
   stage — §2.3 Phase-A provenance caveat.)
4. **[DEFERRED → post-Phase-1 decision with developers]** — per-component contracts
   choices are resolved with the developers after Phase 1.
   **Per-component contracts choices (deferred to Phase 2, Q1).** For build-list
   inventory and the carve overlay: reuse existing IR locations (`stores[]` /
   `groups[]` / `raw[]`, **no bump** — preferred) **vs** new `KeyboardIR` fields
   (clean but contracts bump + §18 joint engine+content sign-off, à la #822/#825).
5. **[DEFERRED → post-Phase-1 decision with developers]** — depends on the loop being
   built; resolved with the developers after Phase 1.
   **Loop iteration key round-trip (Q5/R3).** Does the iteration index/key need to
   round-trip in the IR (contracts touch) or stay transient in `MutateContext` (no
   bump)? Gates the loop-primitive spec's contract scope.
6. **[RESOLVED 2026-06-29 — Matt]** — Option A, the modular gate question: the
   copy/adapt fork becomes a YAML `next` rule (CYOA fork in data), not a hand-coded
   `if`. No contracts bump. This sets the canonical model for spec #4 (wire) and spec #10
   (move fork to YAML).
   **Track chooser model (Q2).** Canonical model: modular gate question (CYOA fork in
   data — cleanest for the map) **vs** editor-step (fork stays in `handleTrackSelected`
   code). Affects specs 4 and 10.
7. **[DEFERRED → post-Phase-1 decision with developers]** — depends on the loop being
   built; resolved with the developers after Phase 1.
   **Loop collection-binding element type (if the loop is built).** The binding MUST
   carry element TYPE (structured `LinguistInventory`). If a spec proposes binding a
   flat `confirmedInventory:string[]`, it must FIRST state how element class is recovered
   — which it cannot be from a flat list — so this is a blocker to resolve, not an
   implementation detail (§3.1 item 1).

---

### Build / test commands (the process expects these)

- Build (build order matters — contracts/engine first via the workspace graph):
  `pnpm -r build` (or targeted: build `@keyboard-studio/engine` then studio, per the
  `dev` script).
- Typecheck: `pnpm typecheck` (`pnpm -r typecheck`).
- Tests: `pnpm test` (`pnpm -r test`) — studio + contracts vitest.
- Lint + boundaries: `pnpm lint` (eslint + `pnpm depcruise`, which enforces
  dashboard→stores forbidden).
- Full green gate per migration PR: `pnpm typecheck` + studio/contracts vitest +
  `pnpm depcruise` + flag-off output matching the recorded baseline.

---

## Review & sign-off (km-lead)

**Review cycle.** This plan was reviewed by a 7-seat KM specialist panel: six seats ran
in parallel via the review workflow (km-frontend, km-validator, km-strategy,
km-testing, km-synthesis, km-simplify) followed by a lead synthesis; a seventh seat
(km-domain) reviewed out-of-band. The edits above incorporate every blocking (P0/P1)
issue plus the agreed P2/P3 items.

**Verdicts.**

| Specialist | Verdict | Blocking issues raised |
|---|---|---|
| km-frontend | CONDITIONAL | 3× P1 (non-existent `layers[].rows[].keys[]` path; foundation (a) under-scoped/no StepGraph renderer; "stub legend goes live"/computeReserveNodes misattributed) |
| km-validator | CONDITIONAL | 3× P1 (drift-guardrail tautology; "reachable" undefined for the question graph; declaring prefill/track inputs reds C5) |
| km-strategy | CONDITIONAL | 1× P1 (pb_* demotion drops the sole A1/A3/A4 elicitors without acknowledging the §7 default-fill chain) |
| km-testing | CONDITIONAL | 1× P1 (drift-guardrail guards the wrong bijection / duplicates the existing trivial C8/C9 test) |
| km-synthesis | CONDITIONAL | 2× P1 (non-existent IR path; prefill/pb_build_list cannot be first-class manifest nodes without decomposing the opaque `characters` placeholder) |
| km-simplify | REJECT | 1× P0 (non-existent IR path) + 2× P1 (loop primitive premature; foundation (a) type mismatch) |
| km-domain | CONDITIONAL | 2× P0 (loop must iterate a STRUCTURED inventory element, not a flat `string[]`; loop unit = NFC grapheme cluster, marks/direction-control route to the mark sub-series) + 2× P1 (non-Latin default-flip precondition; prefill reads `header.bcp47` array + session `ScriptPrefill`, not a `header.script` leaf) |

**How each blocking (P0/P1) issue was resolved.**

- **Non-existent `KeyboardIR.layers[].rows[].keys[]`** (km-frontend/synthesis/simplify P0-P1): replaced everywhere with the real surfaces — carve = `groups[]`/`stores[]`/`raw[]` (`CARVE_WRITES`), mechanisms/physical = `groups[]`/`stores[]` (`ADD_GALLERY_WRITES`), touch = `touchLayout.platforms[].layers[].rows[].keys[]` (`TOUCH_WRITES`); §2 headline and no-bump conclusion re-derived against the real paths (§2, §2.1, §3.1 item 5, §3.2).
- **Foundation (a) under-scoped** (km-frontend/validator/simplify P1): §2.2(a)/spec #1 now state `buildManifestStepGraph` returns a `StepGraph` the renderer cannot consume (FlowGraphView/layoutFlowGraph take `FlowGraph` only) and the deliverable is a `StepGraph`→`GraphNode` adapter mapping editor-steps to `kind:'stub'`; the "stub legend goes live automatically" and computeReserveNodes claims are corrected/re-attributed to the §2.3 demotions.
- **Drift-guardrail tautology / wrong bijection** (km-validator/testing P1): §2.2(b)/§4/spec #2 rewritten to assert the rendered-graph ⟺ manifest+`questionRegistry`-runtime bijection (with a negative test and per-graph reachability), explicitly distinguished from the pre-existing trivial test at `buildStepGraph.test.ts:323-356`.
- **"reachable" undefined for the question graph** (km-validator P1): §2.2(b) now defines reachable per-graph (findUnreachable for editor-steps; `resolveNext` over `next`/`FlowGotoRule[]` for survey questions).
- **Declaring prefill/track inputs reds C5** (km-validator P1): §2.1 prefill row + §2.4 step 3 corrected — the writer `iso_code` sits inside the opaque `charactersStep`, so manifest-level C5 orphans unless the subsuming step declares the write or cross-graph inputs are exempted; writes sequenced before inputs.
- **prefill/pb_build_list cannot be first-class manifest nodes** (km-synthesis P1): they are now Phase-1 **registry-keyed drill-downs under the opaque `characters` node**, with promotion deferred to Phase 2; the SPA render path is documented as untouched (StudioShell hand-places via `activeStepId`).
- **pb_* demotion drops A1/A3/A4 elicitors** (km-strategy P1): added the §2.3 "Strategy-axis impact" subsection (pb_char_count→A1, pb_typing_approach→A3, pb_stacking_marks/pb_mark_input_order→A4; default-fill from the script-class prior as `axisFills`) + a `qu-library-demote` acceptance criterion against the §7.5 exemplars.
- **Loop primitive premature vs legitimate** (km-simplify P1, contested): NOT forced either way — added the §3.1 scope caveat (per-inventory IR writes solved by rebuild-by-stable-name; loop justified only for committed per-element sub-question UX), deferred spec #9, and routed the build-vs-defer question to Matt (§6).
- **Loop must iterate a STRUCTURED inventory element** (km-domain P0): §3.1 item 1 now requires the collection binding to carry element TYPE (`LinguistInventory`-shaped), with an explicit open decision/blocker that a flat `confirmedInventory:string[]` cannot recover element class (§6 item 7).
- **Loop unit = NFC grapheme cluster; marks route out** (km-domain P0): added the "Loop unit definition (linguistic)" subsection (Unicode extended grapheme cluster per `InventoryChar`/`Intl.Segmenter`; combining marks + direction-control route to the mark-mechanism sub-series; cross-ref `pb_mark_input_order`/`pb_stacking_marks`).
- **Non-Latin default-flip precondition** (km-domain P1): §2.3 now makes "the loop subsumes `pb_*` script semantics" a precondition for any default flip on non-Latin scripts; spec #8 acceptance updated.
- **prefill reads `header.bcp47` array + session `ScriptPrefill`** (km-domain P1): §2.1 prefill row, §3.2 prefill row, and §2.4 step 3 corrected; `irPath('header','script')` explicitly forbidden.

Resolved P2/P3 items: per-surface byte-identical oracle (§2.5), SurveyRunner visited-guard correction (§3.1), C2 loop-exclusion mechanism (§3.1 item 4), loop multi-element parity fixture (§3.4), S-13 touch-layer stability (§3.2), casing-sub-series qualified to bicameral scripts (§3.2), NFC-ID-vs-output-normalization (§3.1 item 5), Phase-A `orthographyUrl` provenance (§2.3), `validateManifestShape` M2–M6 (§2.2b/§3.4), mutate-seam "live flag-gated" framing (§2), completeness.ts circular-dependency note (§1/findings), `track` already-declared (§2.1/§2.4), and the stale file:line anchors throughout (locks → `manifest.ts:96-99`/`109-112`; PhaseB → `535`/`610`/`744`; reducer R1 split → `222` / `228-243`).

**KM-Reviewed sign-off (blocking issues addressed by these edits):**
km-frontend, km-validator, km-strategy, km-testing, km-synthesis, km-simplify, km-domain.

All seven specialists' P0/P1 issues are resolved in the plan text. km-simplify's REJECT
rested on a single P0 (the non-existent IR path) that km-frontend and km-synthesis
independently rated P1 and that has a concrete, unanimous fix now applied; its other two
P1s (loop scope, foundation-(a) type story) are likewise addressed (loop deferred to
Matt with the no-loop write path documented; adapter scope corrected). No specialist's
blocking issue is left unresolved.

**Decisions recorded (Matt, 2026-06-29) — Phase 1 scope confirmed** (see §6 for detail).
Phase 1 only specs converting the custom/bespoke flow stages into opaque "questions"
with valid inputs and outputs. Decision states:

- **(3) Orphaned full Phase A disposition — RESOLVED:** demote to the inert library
  ("we'll re-use some of that later"); not deletion (modules stay registered, on disk,
  test-covered per the no-delete guardrail §4), flagged for later reuse; retain
  `orthographyUrl` capture in `identity_lite` / the documentation stage.
- **(6) Track chooser model — RESOLVED:** Option A, the modular gate question (copy/adapt
  fork becomes a YAML `next` rule, not a hand-coded `if`); no contracts bump; sets the
  canonical model for specs #4 and #10.
- **(1) loop primitive BUILD vs DEFER; (2) per-character axis feedback into the §7 vector
  (and S-13 stability if the touch loop is built); (4) per-component contracts choices
  (reuse existing IR vs new fields); (5) loop iteration-key round-trip (IR vs transient
  `MutateContext`); (7) loop collection-binding element type (structured vs flat) —
  DEFERRED** to a decision made with the developers after Phase 1 is complete (several
  depend on the loop build-vs-defer call, which is itself part of this deferred bucket).
