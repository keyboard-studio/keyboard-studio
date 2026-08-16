# Feature Specification: Unified Step Model + Manifest-Driven Survey Ordering

**Feature Branch**: `claude/survey-modularity-cyoa-phase-4-q9ey3o`

**Created**: 2026-06-27

**Status**: Draft

**Input**: User description: Unified step model + manifest-driven ordering for the studio survey — **Phase 4 (P4a + P4b)** of [docs/survey-modularity-cyoa-plan.md](../../docs/survey-modularity-cyoa-plan.md) (§3.1, §3.4, §3.5, §3.6, §3.7, §4, §5, §6 P4a/P4b, §8). P4a builds the `steps/` types and per-step editor adapters for the galleries and the five hand-built wizard panels, landed **behind the existing `SurveyStage` machine**. P4b replaces the hardcoded `SurveyStage` union with a single `steps/manifest.ts`, routes side effects through a manifest-level `onComplete` reducer, repoints the dashboard at the manifest (map == runtime by construction), and ships the completeness/staleness checks for the §3.5 CYOA invariants.

**Governing scope**: This feature implements **Phase 4 (P4a + P4b)** of the Survey Modularity + CYOA Refactor plan ([docs/survey-modularity-cyoa-plan.md](../../docs/survey-modularity-cyoa-plan.md) §6 "P4a — Editor adapters behind the existing `SurveyStage` machine" and "P4b — Replace the `SurveyStage` union with manifest-driven ordering", with the architecture in §3.1/§3.4/§3.5/§3.6/§3.7, the target tree in §4, the migration listing in §5, and the boundary/risk decisions in §8). It does **not** re-derive that scope; it operationalizes it. P0 ([specs/010-dashboard-honest-flow-map](../010-dashboard-honest-flow-map/spec.md)), P1 ([specs/011-ui-primitives](../011-ui-primitives/spec.md)), and P2 ([specs/066-irpath-inputs-writes](../066-irpath-inputs-writes/spec.md)) are already landed and are prerequisites this feature builds on.

> **Note on technical content in this spec (deliberate).** Like P1 ([specs/011-ui-primitives](../011-ui-primitives/spec.md)), Phase 4 is principally an **architectural refactor** with little net-new *end-user-visible* behavior — its value is the architecture: one ordered step model, one manifest that both the runtime and the dashboard read, and a precise completeness/staleness contract. Per author direction and repository convention — where dependency-cruiser rules are architectural **contracts** and extracted `specs/NNN/` folders carry real contract material — the non-obvious architectural constraints (step model, manifest as single source of ordering, the §3.5 invariants, the reserved P5 seams) are specified here as Functional Requirements and Success Criteria. The *mechanics* (move order, the ~510-LOC `SurveyView` rewrite, exact depcruise rule syntax, codemod approach, import-extension handling) remain plan-level.

## Clarifications

### Session 2026-06-27

- Q: Folder/grouping names for the editor and dashboard layers (resolves FR-025) → A: Adopt the plan's proposed names as-is — `editors/` (with `editors/assignLoop/`, `editors/carve/`, `editors/panels/`, `editors/touchSuggest/`), `steps/`, and `dashboard/` (absorbing `flowmap/`).
- Q: Delivery split for P4a vs P4b → A: Two sequential PRs — P4a merges first (adapters behind the old stage machine, byte-identical), then P4b (manifest cutover + completeness checks) on top; each independently revertible.
- Q: How the spine-prefix shippability check is evaluated (FR-017 / SC-007) → A: Structural proxy — assert each spine prefix yields a complete, lock-consistent working copy (relying on the base-template shippability guarantee); no validator invocation is wired into the dashboard in this phase (real per-prefix validation is reserved for P5).

## User Scenarios & Testing *(mandatory)*

> The "users" of this refactor are the studio engineering and content teams (today) and the people running the survey (whose experience must not regress). The keyboard author is the end user whose flow must stay byte-identical through P4a and continue to work — now manifest-driven — after P4b. Stories are framed as the journeys each constituency depends on; each is independently testable and independently valuable.

### User Story 1 - Every gallery and wizard panel becomes a step the system can see (Priority: P1)

A developer (or the dashboard) can treat **every** thing that advances the survey — registered questions, the carve/add galleries, and the five hand-built wizard panels — as a uniform **step** with an `id`, `title`, and declared `inputs`/`writes`, instead of three incompatible "forms" where only registered questions are visible to the registry and the map.

**Why this priority**: This is the foundational deliverable of P4a. Until galleries (Form 4) and wizard panels (Form 3) are adapted into the step model, they remain invisible to the registry and the flow map, and no manifest can order them. Everything in P4b builds on this uniform surface. It is also the safe half: it lands **behind the existing `SurveyStage` machine**, so it can ship and be verified before any ordering changes.

**Independent Test**: Pick any one gallery (e.g. the physical add gallery) and any one wizard panel (e.g. the choose-base panel); confirm each now renders through its editor-step adapter with an `id`/`title`/`inputs`/`writes`, that it advances the flow via a single completion callback, and that under the unchanged `SurveyStage` flow its on-screen behavior is identical to before the adaptation.

**Acceptance Scenarios**:

1. **Given** a Form-4 gallery (physical carve, physical add, or touch carve/add), **When** it is adapted into an editor-step and run under the existing `SurveyStage` flow, **Then** it renders and behaves identically to its pre-refactor version and exposes an `id`, `title`, and declared `inputs`/`writes`.
2. **Given** any of the five hand-built wizard panels (choose-track, project-name, scaffold, track-one identity, choose-base), **When** it is adapted into an editor-step, **Then** it is addressable by a unique step `id` and the registry/dashboard can enumerate it (it is no longer invisible for lacking `id`/`prompt`/`next`).
3. **Given** the carve (remove-mode) editor, **When** the galleries are grouped into the shared assignment-loop shell, **Then** carve **remains its own distinct remove-mode component** (sharing only the `ui/` kit) and is **not** folded into the add-shell — the three-into-one gallery merge is not performed.
4. **Given** the new editor groupings, **When** the architecture-boundary check runs, **Then** the editor layer's intended edges (editor → store, editor → shared lib helper) are explicitly **allowed** and no other new cross-layer edge is introduced.

---

### User Story 2 - Survey ordering and the map come from one source (Priority: P1)

A developer changes the order, branching, or lock placement of the survey by editing **one** ordered manifest, and both the running survey and the flow-map/dashboard reflect that change with no second place to update — the long-standing "stale flow map" problem is gone because **map == runtime by construction**.

**Why this priority**: This is the central deliverable of P4b and the reason Phase 4 exists. Today ordering is hardcoded in a `SurveyStage` union inside the shell while the map reads a separate legacy source, so they drift. Collapsing both onto one manifest is the structural fix; the completeness checks (US3) and the reserved seams (US4) hang off it.

**Independent Test**: Reorder two adjacent steps in the manifest (or change a branch target); confirm without any other code change that both the running survey advances in the new order and the dashboard renders the new order/edges — and that no `SurveyStage` union remains as a second ordering source.

**Acceptance Scenarios**:

1. **Given** the manifest as the single ordered list of steps, **When** the survey runs, **Then** step order, spine/side-trail membership, lock placement, and branching all derive from the manifest and **no hardcoded `SurveyStage` union remains**.
2. **Given** the same manifest, **When** the dashboard/flow map renders, **Then** its node and edge set equals the runtime step set exactly (no ghost nodes, no missing nodes).
3. **Given** a step that previously triggered an inline side effect on completion (physical lock, touch-layout build, the copy/adapt branch), **When** that step completes, **Then** the side effect fires from a **single manifest-level reducer keyed by step id**, and the editor component itself performs no side effect (it only reports completion).
4. **Given** the functional spine order (Identity → choose base → Characters → Carve → Mechanisms → physical lock → touch carve+add → touch lock → Help → Package*(reserved)*), **When** the manifest is authored, **Then** the steps appear in that order with the two lock gates positioned as in §3.5 and the retired sequential A–G vocabulary not reintroduced.
5. **Given** the touch-phase entry, **When** the survey reaches it, **Then** a `touch_seed_source` fork (marked off-spine) lets the author choose how the touch surface is seeded and **rejoins the spine** via an explicit join target — it forks only the seed, not the UI, and both branches converge on the same carve/add shell.

---

### User Story 3 - The dashboard reports an honest completeness/staleness picture (Priority: P2)

A developer or content author looks at the dashboard and sees, across all reachable paths, which steps are stale, whether the flow graph is well-formed (no cycles, every side trail rejoins the spine), whether every stopping point on the spine is shippable, and whether each step's inputs can actually be satisfied — so broken flow structure is caught at author time, not at runtime.

**Why this priority**: The honest dashboard is the verification surface every later move is checked against, and the §3.5 invariants are subtle enough (transitive closure, acyclicity, rejoin) that a naive one-hop check silently misses real defects. It is P2 rather than P1 because it depends on the manifest existing (US2), but it is what makes the manifest trustworthy.

**Independent Test**: Construct a manifest fixture that violates each invariant in turn — a two-edge-distant downstream dependent of a re-opened step, a `writes→inputs` cycle, a side trail whose terminal branch lands off-spine, a spine prefix that fails the validity gate, and a step whose declared inputs no upstream step produces — and confirm the completeness check flags exactly those and passes a clean manifest.

**Acceptance Scenarios**:

1. **Given** a step is re-opened (e.g. a lock is broken), **When** staleness is computed, **Then** it marks **every** step reachable along the `writes → inputs` relation, iterated to a fixpoint — not just direct one-hop dependents.
2. **Given** a manifest whose `writes → inputs` graph contains a cycle, **When** the completeness check runs, **Then** it reports the cycle as a **hard error** (a cycle has no valid staleness ordering).
3. **Given** an off-spine (side-trail) chain, **When** the rejoin check runs, **Then** it verifies the chain carries an explicit join target and that the terminal branch of the chain lands on a spine step — no side trail may dead-end or leak off-spine.
4. **Given** any prefix of the spine, **When** the spine-prefix shippability check runs, **Then** it confirms stopping there yields a **complete, lock-consistent working copy** (a structural proxy for the validity/criteria gate, relying on the base-template shippability guarantee — no validator is invoked in this phase) — a check **distinct from** inputs-satisfiability.
5. **Given** a step whose declared inputs are produced by no upstream step's `writes`, **When** the inputs-satisfiability check runs, **Then** that orphan input is flagged.
6. **Given** the staleness result, **When** a lock is broken or a step is re-answered, **Then** the set of currently-stale steps is tracked as recomputable state and pre-existing state defaults to "fresh."

---

### User Story 4 - Reserved seams for touch propagation, declared now and inert (Priority: P3)

A future-phase (P5) contributor finds the per-key provenance tag and the `touchSuggest` defaults-as-data policy already **reserved** in the touch surface and the touch editor, so when the engine mutation seam lands, propagation has somewhere to land and pre-existing touch edits are never clobbered — without any propagation logic having shipped early.

**Why this priority**: These seams must be reserved *during* Phase 4 (per §3.6 / §8) so the first future propagation is safe, but they carry no runtime behavior in this phase. They are lowest priority because nothing in P4a/P4b executes them; they exist to be correct-by-default later.

**Independent Test**: Confirm each touch key can carry a provenance tag (`base-derived` / `physical-suggested` / `hand-set`), that pre-existing touch keys default to `hand-set` (the conservative, never-auto-overwritten tag), that the `touchSuggest` adaptation policy is expressed as overridable declarative data, and that **no** propagation/merge logic runs in this phase.

**Acceptance Scenarios**:

1. **Given** the touch surface, **When** a touch key is created or imported in this phase, **Then** it can carry a provenance tag and any pre-existing key defaults to `hand-set`.
2. **Given** the `touchSuggest` generator, **When** its adaptation preferences are expressed, **Then** they are **declarative, overridable data** (per-key and policy-level), framed as assistance not automation, and **no propagation logic that rewrites touch keys from physical changes runs in this phase** (that is P5).

---

### Edge Cases

- **A panel that is really one field.** A wizard panel reducible to a single field (e.g. project-name) MAY be modeled as a question-step instead of an editor-step; the spec requires only that it be addressable as a step, not which kind.
- **Identity/Help steps still on the legacy loader.** P3 (legacy-YAML cutover) is in progress on a separate branch. The manifest MUST be authorable for the spine even while Identity/Help resolve through whichever loader is current; this feature does not block on P3 deletion work and does not delete the legacy loader.
- **A touch key whose base isn't present** when provenance is assigned — the tag still attaches; no propagation is attempted (P5 concern).
- **A manifest with a step that is unreachable** from the spine entry — surfaced by the completeness check as an unreachable step, not silently dropped.
- **Breaking a lock that has no downstream dependents** — staleness closure yields the empty set; the step simply returns to "fresh"-with-nothing-stale, not an error.
- **Re-running P4a verification after P4b lands** — because P4a placed every editor behind the old stage machine, P4b must remain revertible to the union-driven flow without touching the editors.

## Requirements *(mandatory)*

### Functional Requirements

**Step model (P4a)**

- **FR-001**: The system MUST define a single ordered **step** abstraction with two kinds — a **question-step** (wrapping a registered question module, resolved by its definition id) and an **editor-step** (wrapping a gallery or hand-built panel that renders a rich editor and advances the flow).
- **FR-002**: Every step MUST carry a unique `id`, a `title`, declared `inputs`, and declared `writes`, plus its spine/side-trail membership and any lock placement, as static data.
- **FR-003**: Editor-steps MUST present one shared completion contract — each editor reports a result and a back action and receives shared survey context — so the differing gallery/panel signatures all satisfy one type behind the manifest. **Editors MUST NOT perform survey-level side effects themselves** (see FR-011).
- **FR-004**: The four galleries (physical carve, physical add, touch carve, touch add) MUST be regrouped so the **add** galleries share one assignment-loop **shell** (surface-parameterized chrome/loop) while keeping **separate physical and touch behaviors** underneath; **carve MUST remain its own distinct remove-mode component** sharing only the `ui/` kit. The three-into-one gallery merge MUST NOT be performed.
- **FR-005**: The five hand-built wizard panels (choose-track, project-name, scaffold, track-one identity, choose-base) MUST be adapted into editor-steps that **keep their current props/behavior**, so the dashboard and runtime can finally enumerate them.
- **FR-006**: All of P4a MUST land **behind the existing `SurveyStage` machine** (no ordering change yet), so any UI regression from the adaptation is isolated from the later ordering change and P4a is independently revertible by pointing the stage machine back at the original components.
- **FR-007**: The new editor layer's intended cross-layer edges (editor → working-copy store, editor → the shared IR-to-nodes helper) MUST be **explicitly allowed** by the architecture-boundary check; no other new cross-layer edge may be introduced, and the `ui/` leaf rule from P1 MUST stay green.

**Manifest-driven ordering (P4b)**

- **FR-008**: The system MUST provide a single **manifest** that is the one ordered list of all steps (with spine/side-trail/lock metadata) and the sole source of survey ordering.
- **FR-009**: The survey runtime MUST derive step order, branching, spine/side-trail membership, and lock placement **entirely from the manifest**, and the hardcoded `SurveyStage` union MUST be removed.
- **FR-010**: The dashboard/flow map MUST read the **same** manifest as the runtime, such that its node/edge set equals the runtime step set exactly (map == runtime by construction).
- **FR-011**: All side-effecting transitions that previously fired inline on step completion (physical lock, touch-layout build, the copy/adapt branch) MUST fire from a **single manifest-level reducer keyed by step id**; editors stay pure.
- **FR-012**: The manifest MUST encode the functional spine order — Identity → choose base → Characters → Carve → Mechanisms → physical lock → touch carve+add → touch lock → Help → Package*(reserved, out of scope)* — with the two lock gates placed per §3.5, and MUST NOT reintroduce the retired sequential A–G phase vocabulary.
- **FR-013**: The touch phase MUST open with a `touch_seed_source` **side-trail fork** (off-spine) that lets the author choose the touch seed and **rejoins the spine via an explicit join target**; both branches MUST converge on the same carve/add shell (fork the seed, not the UI).

**Completeness / staleness (P4b)**

- **FR-014**: The completeness checker MUST compute staleness as the **transitive closure to a fixpoint** over the `writes → inputs` relation when a step is re-opened (one-hop intersection is insufficient).
- **FR-015**: The completeness checker MUST verify the `writes → inputs` graph is **acyclic** and report any cycle as a **hard error**.
- **FR-016**: The completeness checker MUST verify the **side-trail rejoin** invariant — every off-spine chain carries an explicit join target and a reachability check confirms its terminal branch lands on a spine step.
- **FR-017**: The completeness checker MUST verify **spine-prefix shippability** as a check **distinct from** inputs-satisfiability. In this phase it is evaluated as a **structural proxy** — every spine prefix leaves a complete, lock-consistent working copy (relying on the base-template guarantee that the project always starts shippable). The completeness check MUST NOT invoke the validator per prefix; real per-prefix validation is reserved for P5 (when the `mutate` seam lands).
- **FR-018**: The completeness checker MUST verify **inputs-satisfiability** — each step's declared inputs are produced by some upstream step's `writes` — and flag orphan inputs.
- **FR-019**: The system MUST track which steps are currently **stale** as recomputable state (recomputed when a lock is broken or a step is re-answered); pre-existing state defaults to "fresh."

**Reserved P5 seams (declared, not executed)**

- **FR-020**: Each touch key MUST be able to carry a **provenance** tag (`base-derived` / `physical-suggested` / `hand-set`); pre-existing touch keys MUST default to `hand-set` (conservative — never auto-overwritten). No propagation logic is implemented in this phase.
- **FR-021**: The `touchSuggest` physical→touch generator MUST be reserved with its adaptation policy expressed as **overridable declarative data** (per-key and policy-level), framed as assistance not automation. No propagation/merge that rewrites touch keys from physical changes runs in this phase.

**Out of scope (explicit non-goals)**

- **FR-022**: This feature MUST NOT implement the question-module `mutate` execution or unify the answer-store-vs-direct-IR **state fork** — that is P5, gated on the engine mutation contract. Phase 4 unifies **ordering and the map only**.
- **FR-023**: This feature MUST NOT build the dev-only interactive flow-map editor (deferred to [specs/009-flow-map-editor](../009-flow-map-editor/spec.md)); only the read-only dashboard is in scope.
- **FR-024**: This feature MUST NOT delete the legacy YAML loader (P3) and MUST NOT delete unintegrated-but-vetted library question modules (§3.8 no-delete).

**Naming**

- **FR-025**: The folder/grouping names for the editor and dashboard layers are **decided** (Clarifications 2026-06-27): the plan's proposed names are adopted as-is — `editors/` (with `editors/assignLoop/`, `editors/carve/`, `editors/panels/`, `editors/touchSuggest/`), `steps/`, and `dashboard/` (absorbing `flowmap/`). P4a MUST use these names from the start, so no second rename pass is needed.

### Key Entities *(include if feature involves data)*

- **Step**: A unit that advances the survey. Has `id`, `kind` (question-step | editor-step), `title`, `inputs`, `writes`, spine/side-trail membership, optional lock placement, and (for side trails) a join target. The common abstraction over questions, galleries, and wizard panels.
- **Manifest**: The single ordered list of steps with spine/side-trail/lock metadata — the one source of truth for both runtime ordering and the dashboard.
- **Completion reducer**: A manifest-level handler keyed by step id that performs the side-effecting transitions (lock, touch-layout build, copy/adapt branch) on each step's completion, keeping editors pure.
- **Completeness report**: The result of the §3.5 checks — staleness closure, acyclicity, side-trail rejoin, spine-prefix shippability, inputs-satisfiability — surfaced by the dashboard.
- **Staleness state**: The recomputable set of currently-stale steps; defaults to "fresh."
- **Touch-key provenance**: The per-key tag (`base-derived` / `physical-suggested` / `hand-set`) reserved on the touch surface for safe P5 propagation; defaults to `hand-set`.
- **`touchSuggest` policy**: The reserved, declarative, overridable adaptation policy (defaults-as-data) for the physical→touch generator.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every gallery and every one of the five wizard panels is addressable as a step with a unique id and declared `inputs`/`writes`; the count of survey-advancing UI elements invisible to the registry/dashboard drops to **zero**.
- **SC-002**: Through P4a, every adapted gallery/panel behaves **identically** to its pre-refactor version under the unchanged stage flow (existing gallery/panel tests pass unchanged; visual regression on the five wizard steps shows no diff).
- **SC-003**: After P4b, **no `SurveyStage` union remains**; reordering or rebranching the survey requires editing exactly **one** file (the manifest), with no second ordering source to update.
- **SC-004**: The dashboard node/edge set equals the runtime step set **exactly** (zero ghost nodes, zero missing nodes) for the full spine.
- **SC-005**: Every former inline side effect (physical lock, touch-layout build, copy/adapt branch) fires from the manifest-level reducer keyed by step id, and **zero** survey-level side effects remain inside editor components.
- **SC-006**: The completeness checker flags each §3.5 violation on a crafted-violation fixture and passes a clean manifest — covering all five distinct checks (transitive staleness, acyclicity, rejoin, spine-prefix shippability, inputs-satisfiability) independently.
- **SC-007**: A full end-to-end run of the spine order completes successfully via the manifest, and every spine prefix is confirmed shippable by the structural proxy check (complete, lock-consistent working copy at each prefix; no validator invocation).
- **SC-008**: The architecture-boundary check is green with the new editor edges explicitly allowed and the P1 `ui/` leaf rule still enforced.
- **SC-009**: Reverting P4b restores the union-driven flow **without touching the editors** (demonstrating the P4a/P4b layering held).
- **SC-010**: Touch keys can carry provenance (defaulting to `hand-set`) and the `touchSuggest` policy exists as overridable data, with **zero** propagation logic executing in this phase.

## Assumptions

- **P0/P1/P2 are landed and stable.** This feature builds directly on the dashboard-honest flow map (P0), the `ui/` primitive library (P1), and the `IRPath` + declared `inputs`/`writes` contract (P2). The typed path algebra and per-module `inputs`/`writes` already exist and are reused as-is.
- **P3 is a soft, not hard, prerequisite.** Legacy-YAML cutover/retirement is in progress on a separate branch. The manifest is authorable for the spine regardless; Identity/Help may still resolve through whichever loader is current, and this feature neither deletes the legacy loader nor blocks on P3.
- **P5 is out of scope and gated elsewhere.** The `mutate` seam, the answer-store-vs-direct-IR state unification, and touch propagation wait for the engine mutation contract (#5b/#232). Phase 4 declares the provenance and `touchSuggest` seams but executes neither.
- **The `SurveyView` rewrite is substantial (~510 LOC) but behavior-preserving.** P4b is a real rewrite of `SurveyView`, not a config swap; its observable survey behavior (order aside) is preserved, and its side effects move to the reducer rather than changing.
- **Team ownership.** This is a studio/front-end + content boundary change (survey ordering, gallery grouping, dashboard) executed within the Engine/Content team split per the constitution; no `Pattern` schema or KeyboardIR-spine contract is altered by this feature (the P2 contract additions already landed).
- **"Byte-identical" means observable behavior**, not source-identical components — adapters wrap existing components and may add an `id`/`title`/`inputs`/`writes` envelope without changing rendered output or interaction.
- **Folder names are decided** (FR-025, Clarifications 2026-06-27): the plan's proposed names — `editors/` (`assignLoop/`, `carve/`, `panels/`, `touchSuggest/`), `steps/`, and `dashboard/` (absorbing `flowmap/`) — are adopted as-is and used from the start of P4a.
- **Delivery is two sequential PRs** (Clarifications 2026-06-27): P4a merges first (adapters behind the unchanged `SurveyStage` machine, byte-identical), then P4b (manifest cutover + completeness checks) on top. Each is independently revertible, which is what makes SC-009 (revert P4b without touching editors) a merge-boundary guarantee, not just an internal commit boundary.
- **Spine-prefix shippability is a structural proxy in this phase** (FR-017, Clarifications 2026-06-27): the completeness check asserts a complete, lock-consistent working copy at each prefix rather than invoking the validator; real per-prefix validation waits for P5.
