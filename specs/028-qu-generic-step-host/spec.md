# Feature Specification: Generic StepHost — SurveyView hand-placement dies

**Feature branch:** `km/qu-028-generic-step-host`
**Stage:** 5 of the Unified Survey Architecture refactor (master plan, decisions D5 + D7).
**Governing decision:** [docs/adr/0001-flow-map-derived-from-one-source.md](../../docs/adr/0001-flow-map-derived-from-one-source.md)
— one source of truth per concern; no parallel hand-threaded copies to drift.
**Prerequisite:** [specs/027-qu-characters-step/spec.md](../027-qu-characters-step/spec.md)
(Stage 4) — this spec generalises the `step.component` seam that stage introduced for a single step to *every* step.
**Status:** Draft
**Created:** 2026-07-03

> ## Relationship to the surrounding stages
>
> Stage 1 (spec 024) retired `FLOW_SOURCES`; Stage 2 (spec 025) added the proposed-flow
> Library section; Stage 3 (spec 026) moved wizard **traversal** state into
> `surveySessionStore`; Stage 4 (spec 027) made the **characters** step self-contained —
> the *first* runtime use of a manifest `step.component`.
>
> **Stage 5 (this spec) makes *every* step component-driven and dismantles the survey
> component's hand-placement.** It introduces a generic `StepHost` that reads the active
> step id from `surveySessionStore`, resolves the manifest `Step`, and renders that step's
> declared `component` inside the correct chrome (full-screen vs two-pane) per its declared
> `layout`. A pure `steps/advance.ts` policy replaces the branching completion handlers. The
> survey component shrinks to the pipeline hooks + the pane/OSK shell + `<StepHost/>`.
>
> This is **the render-change stage** of the refactor. A committed-first golden-walk parity
> proof is mandatory (see Success Criteria). This spec deliberately does **not** build the
> `FlowStepHost` factory that would converge `PhaseTrack`/`PhaseProjectName`/`PhaseF` into
> one option-driven component — that is Stage 6, a documented follow-up.

---

## 1. Problem

The survey wizard is declared once (the manifest: an ordered `Step[]`, each carrying a
`component`, a `layout`, `inputs`/`writes`, and `flowRefs`) but **rendered twice**: the
manifest declares each step, and the survey component (`SurveyView`, currently inside
[packages/studio/src/StudioShell.tsx](../../packages/studio/src/StudioShell.tsx)) *separately*
hand-places every step. Concretely, `SurveyView` today carries:

1. **Three full-screen early returns** — `if (activeStepId === "carve")` / `"mechanisms"` /
   `"touch"` — that hand-mount `CarveGallery` / `MechanismGallery` / `TouchGallery` outside
   the two-pane layout.
2. **A `renderQuestionsPane` switch** with a hand-written branch per two-pane step
   (`identity`, `unsupported`, `choose_base`, `track`, `project_name`, `characters`, `help`,
   `done`), each mounting a specific component with hand-threaded props.
3. **~15 hand-written completion and back handlers** (`handleIdentityComplete`,
   `handleBaseResolved`, `handleTrackSelected`, `handleProjectNameNext`, `handleCarveComplete`,
   `handleMechanismsComplete`, `handlePhaseEComplete`, `handlePhaseFComplete`, plus the eight
   `handle*Back` handlers) that each duplicate the same shape: record/route the result, call
   `applyStepCompletion(stepId, …)`, then compute the next step and `advance`.
4. **The fork logic inline** — `handleTrackSelected` branches copy→`project_name` vs
   adapt→`nextSpineStepAfter("track")`; `handleProjectNameNext` advances to `characters`. The
   copy/adapt fork and the `joinTarget` hops live in the handler bodies, not in one policy.
5. **Placeholder manifest components** — `identityStep` and `helpStep` both declare
   `component: TrackOneIdentityPanelAdapter` as a *placeholder* (never mounted, because
   `SurveyView` hand-renders `IdentityLite` / `PhaseF` instead). The declared component and
   the rendered component disagree. `characters` is the only step whose declared component is
   the one actually mounted.

Because rendering is hand-placed, **adding, reordering, or re-homing a step means editing two
places** (the manifest *and* `SurveyView`), and the manifest's `layout` field is inert — no
code reads it. This violates ADR-0001 (one source of truth): the manifest is supposed to be
*the* source of survey structure, but `SurveyView` is a parallel, drift-prone copy of it.

## 2. Goal

Make the manifest the *sole* source of what renders and in what chrome. After this stage:

- Every step is rendered by resolving `step.component` from the manifest — no per-step branch.
- `step.layout` becomes **load-bearing**: it decides full-screen vs two-pane chrome.
- The copy/adapt fork, `joinTarget` hops, and `done`/`unsupported` terminals live in one pure
  advance policy, not in scattered handlers.
- Result recording / mutate-routing / `applyStepCompletion` / `advance` happen in **one**
  completion path, not once per step.
- The `identity` and `help` manifest components are the components actually mounted (no
  placeholder disagreement).
- **User-visible behaviour is byte-for-byte identical** to before this stage — same screens,
  same order, same forks, same back navigation, same side effects, in the same sequence.

## 3. User Scenarios & Testing *(mandatory)*

The "user" here is dual: the **keyboard author** running the survey (whose experience must not
change at all), and the **studio maintainer** adding/reordering steps (whose experience gets
dramatically simpler). Parity for the former is the hard constraint; simplicity for the latter
is the value.

### User Story 1 - Copy-track author walks the survey unchanged (Priority: P1)

A keyboard author picks a base, chooses the **copy** track, names their project, works through
characters → carve → mechanisms → touch → help, and lands on Output — exactly the screens, in
exactly the order, with exactly the back-navigation behaviour they had before Stage 5.

**Why this priority**: This is the parity contract. The whole stage is a refactor; if the
copy-track walk changes in any observable way, the stage has failed regardless of how clean the
code is. Copy-track is the fork with the extra `project_name` side-trail, so it exercises the
advance policy's branch logic.

**Independent Test**: The golden-walk copy-track fixture (recorded on `main` *before* the
refactor) replays identically against the post-refactor tree: same ordered sequence of
`(stepId, applyStepCompletion calls, store mutations, navigateTo calls)`.

**Acceptance Scenarios**:

1. **Given** a resolved base and identity, **When** the author selects the copy track, **Then**
   the next step shown is `project_name` (the copy-only side-trail), identical to before.
2. **Given** the author is on `project_name`, **When** they confirm a name, **Then** the survey
   advances to `characters` and the same scaffold spec / identity are recorded as before.
3. **Given** the author completes `help`, **When** the step finishes, **Then** the session
   reaches the `done` terminal and the app navigates to Output — same as before.
4. **Given** the author is on any step with a back affordance, **When** they go back, **Then**
   they land on the same previous screen they would have before Stage 5 (walked-history pop).

### User Story 2 - Adapt-track author walks the survey unchanged (Priority: P1)

A keyboard author chooses the **adapt** track (no project rename) and works straight through
characters → carve → … → help → Output, skipping `project_name` exactly as before.

**Why this priority**: Adapt-track is the *other* fork — it must skip the `project_name`
side-trail. Together with US1 it proves the advance policy encodes both branches of the copy/
adapt fork correctly. Equal-priority with US1: both forks are load-bearing user journeys.

**Independent Test**: The golden-walk adapt-track fixture replays identically post-refactor;
`project_name` never appears in the walked sequence.

**Acceptance Scenarios**:

1. **Given** a resolved base and identity, **When** the author selects the adapt track, **Then**
   the next step shown is `characters` (project_name skipped), identical to before.
2. **Given** the author is on `characters` and goes back after Stage 5, **Then** back-navigation
   returns to the same predecessor (`track`) it did before.

### User Story 3 - Maintainer adds/re-homes a step by editing only the manifest (Priority: P2)

A studio maintainer changes a step's `layout`, reorders steps, or points a step at a different
component — by editing **only** the manifest entry — and the running survey reflects the change
with no edit to the survey component.

**Why this priority**: This is the *value* the refactor unlocks (the whole point of ADR-0001).
It is P2 because it is demonstrated rather than the hard release gate — the release gate is
parity (US1/US2). But it must be genuinely true, not aspirational: the survey component must
contain no per-step branch after this stage.

**Independent Test**: A per-step render-smoke test drives each manifest step id through
`StepHost` and asserts the correct component mounts in the correct chrome (full-screen for
`layout: "full"` steps, two-pane otherwise) — with **no** step-specific code in the host.

**Acceptance Scenarios**:

1. **Given** a step declares `layout: "full"`, **When** it becomes active, **Then** `StepHost`
   renders it full-screen (outside the two-pane shell).
2. **Given** a step declares `layout: "pane"` (or omits it), **When** it becomes active, **Then**
   `StepHost` renders it in the left survey pane alongside the OSK preview.
3. **Given** a maintainer changes only a manifest step's `component`, **When** the survey runs,
   **Then** the new component mounts with no change to the survey component.

### Edge Cases

- **Unsupported script (CJK/Ethiopic §9 stub)**: identity resolving to an unsupported script
  advances to the `unsupported` terminal, which renders the not-yet-supported stub plus a
  "Start over" affordance — identical to today. The advance policy must encode this terminal.
- **`done` terminal**: after `help` completes, the session reaches `done`; the two-pane shell
  shows the "Survey complete" panel and navigation moves to Output. `done` is a terminal, not a
  manifest step, so `StepHost` must handle terminals distinctly from manifest steps.
- **Back at the first step**: `identity` is `history[0]`; back is disabled there (no predecessor
  to pop). Unchanged from Stage 3.
- **Intra-step back bottoming out**: `CharactersStep`'s internal `prefill → PhaseB` stack and
  `SurveyRunner`'s internal question stack own back *within* a step; only when that internal
  stack bottoms out does the step call `props.onBack`, which the host maps to a history pop.
  This boundary must be preserved (Stage 4 behaviour: back-from-carve re-enters characters at
  PhaseB).
- **Double-instantiation guard**: the `choose_base` compile-pipeline side effect
  (`onInstantiate` → `applyStepCompletion("choose_base")`) must still fire exactly once per
  session; the `instantiatedRef` guard stays in the survey component (pipeline concern, not a
  step-prop concern), per master-plan D4.
- **`localBase === null` right pane**: when no base is chosen yet, the OSK pane shows its
  placeholder. Pane scaffolding stays in the survey component, so this is unchanged.
- **Terminal with no component**: a step id that resolves to neither a manifest step nor a known
  terminal must render a visible error panel (not a blank pane) — preserving today's
  exhaustiveness guard.

## 4. Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The survey MUST render the active step by resolving its `component` from the
  manifest keyed on the active step id — with no per-step conditional branch in the survey
  component or the host.
- **FR-002**: `StepHost` MUST wrap the resolved component in full-screen chrome when the step
  declares `layout: "full"`, and in the two-pane (left survey pane) chrome otherwise. `layout`
  becomes load-bearing; the three current full-screen early returns are replaced by this rule.
- **FR-003**: A single pure advance policy (`steps/advance.ts`) MUST compute the next step id
  from `(completed step, result, session state)`, encoding: the copy/adapt fork
  (`track` → `project_name` on copy; `track` → the next spine step on adapt), the `project_name`
  → `characters` `joinTarget` hop, the `identity` → `unsupported` branch when the script is
  unsupported, and the `help` → `done` terminal. It MUST NOT perform side effects (pure input →
  output).
- **FR-004**: Step completion MUST flow through one centralized host path that performs the same
  effects the per-step handlers do today, in the same order: record the phase result where the
  result is `SurveyPhaseResult`-shaped, route in-scope answers through `mutate()` where
  applicable, call `applyStepCompletion(stepId, result, deps)`, then `advance` to the policy's
  next id (and `navigateTo("output")` on reaching `done`).
- **FR-005**: Back navigation MUST delegate to the step's internal back first (the component's
  `onBack` is called by the component only when its internal stack bottoms out); the host maps
  that to a walked-history pop (`popHistory`), reproducing Stage 3/4 behaviour exactly,
  including back-from-carve re-entering `characters` at PhaseB.
- **FR-006**: The `identity` manifest step MUST declare and mount a real `IdentityLite` adapter
  (replacing the `TrackOneIdentityPanelAdapter` placeholder); the `help` manifest step MUST
  declare and mount a real `PhaseF` adapter (replacing its placeholder). The declared component
  and the mounted component MUST be the same for every step.
- **FR-007**: Adapters MUST obtain their inputs (e.g. placement priors, local base, survey
  context, per-question findings) from stores/hooks rather than props hand-threaded by the
  survey component. Specifically, the corpus placement-priors dependency moves into the
  mechanisms adapter, and per-question findings are derived by the components that need them.
- **FR-008**: All step components MUST continue to satisfy the existing `EditorStepProps`
  contract (`onComplete`, optional `onBack`, optional `ctx`). No contract (schema) changes.
- **FR-009**: Pane scaffolding — resizable panes, the OSK preview, the single debounced
  validator call site (spec-014 V3 invariant: exactly one `useValidator`), `oskMode`, the
  pattern-map projection effect, and the `instantiatedRef` double-instantiation guard — MUST
  remain in the survey component. `StepHost` only decides *which container* a step renders into.
- **FR-010**: The Flow Map drift guardrail's rendered↔runtime node sets MUST be unchanged by
  this stage (no manifest node added or removed; only component/layout wiring changes).
- **FR-011**: The survey component MUST retain no per-step completion or back handler after this
  stage; the `renderQuestionsPane` switch and the full-screen early returns MUST be removed.

### Key Entities

- **StepHost**: A component that, given the active step id, resolves the manifest `Step`,
  renders `step.component` with `EditorStepProps`, and selects chrome by `step.layout`. Owns the
  centralized `onComplete`/`onBack` wiring; owns no step-specific knowledge.
- **Advance policy (`steps/advance.ts`)**: A pure function mapping `(step, result, session)` to
  the next step id. Colocated with the manifest. The single home of the copy/adapt fork,
  `joinTarget` hops, and terminals.
- **Terminals (`done`, `unsupported`)**: Non-manifest active-step ids that the host renders with
  bespoke panels (survey-complete / unsupported-script stub) rather than a manifest component.
- **Golden-walk fixture**: An ordered recording of a scripted survey walk — the sequence of
  `(stepId, applyStepCompletion calls, store mutations, navigateTo calls)` — captured on `main`
  before the refactor and asserted identical after. One per fork (copy, adapt).

## 5. Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The copy-track and adapt-track golden-walk fixtures — recorded and committed
  **before** the refactor lands — replay **identically** against the refactored tree (same
  ordered step ids, same `applyStepCompletion` invocations, same store mutations, same
  `navigateTo` calls). Zero diff is the pass condition.
- **SC-002**: Every existing survey/routing test (`StudioShell`, track-routing, prefill-routing,
  `CharactersStep`, manifest-shape) passes with only mount-plumbing updates — no test that
  asserts user-visible behaviour is weakened or deleted to make the refactor pass.
- **SC-003**: A per-step render-smoke test confirms each manifest step id mounts its declared
  component in the correct chrome (full-screen for `layout: "full"`, two-pane otherwise), with
  no step-specific code path in `StepHost`.
- **SC-004**: The survey component contains **zero** per-step completion/back handlers and
  **zero** per-step render branches after the stage (the `renderQuestionsPane` switch and the
  three full-screen early returns are gone). Verifiable by inspection / a lint-style assertion.
- **SC-005**: The manifest declares a real (non-placeholder) `component` for every step, and the
  declared component equals the mounted component for all step ids.
- **SC-006**: The Flow Map drift guardrail passes unchanged (rendered↔runtime node sets
  identical), and `pnpm typecheck` / `pnpm --filter @keyboard-studio/studio test` /
  `pnpm depcruise` are all green.

## 6. Assumptions

- **Parity is defined against `main` at the point the fixtures are recorded.** The golden-walk
  fixtures are the parity oracle; they must be committed in a separate commit *before* the
  refactor commit so the "recorded on main" provenance is auditable (analogue:
  `wireGalleries` `emitByteOracle.test.ts`).
- **Stage 6 is out of scope.** The `FlowStepHost` factory + `makeFlowStepComponent` convergence
  of `PhaseTrack`/`PhaseProjectName`/`PhaseF` is a documented follow-up; this stage keeps those
  three bespoke wrappers as-is, only re-homing them behind manifest components/adapters where
  needed for the generic host.
- **No contract changes.** `EditorStepProps`, the `Step`/`EditorStep` types, and
  `packages/contracts` are untouched. `layout` and `flowRefs` already exist on `StepBase`
  (added in Stage 0/1); this stage only makes `layout` load-bearing.
- **`surveySessionStore` is the traversal source of truth** (Stage 3) and already exposes
  `activeStepId`, `history`, `advance`, `popHistory`, `reset`, and the value slots
  (`identityResult`, `surveyContext`, `selectedTrack`, `scaffoldSpec`, `localBase`,
  `charactersSubStage`). This stage consumes them; it does not add new traversal state beyond
  what the advance policy needs.
- **The reducer (`applyStepCompletion`) and its `ReducerDeps` injection stay as-is.** The host
  calls the same reducer with the same deps the survey component builds today; the boundary
  (steps/ imports no stores/lib) is preserved by keeping `ReducerDeps` construction in the
  survey component and passing it to the host.
- **Boundary compliance**: `components/StepHost.tsx` may import stores/hooks (it is a component,
  not in `steps/`); `steps/advance.ts` imports only the manifest/types (no stores/lib), matching
  the existing `steps/` depcruise rule.
- **The two galleries that read placement priors** (mechanisms; and any other) obtain them via a
  hook inside their adapter rather than a prop, so the host need not thread gallery-specific
  props.
