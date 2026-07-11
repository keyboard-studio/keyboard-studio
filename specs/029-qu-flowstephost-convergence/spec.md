# Feature Specification: FlowStepHost Convergence

**Feature Branch**: `km/qu-029-flowstephost-convergence`

**Created**: 2026-07-03

**Status**: Draft

**Input**: User description: "FlowStepHost convergence (Unified Survey Architecture Stage 6, follow-up to spec 028). Generalize the three bespoke survey wrappers PhaseTrack, PhaseProjectName, PhaseF into one option-driven `FlowStepHost` mounted via a `makeFlowStepComponent(flowRef, options)` factory, with byte-identical behaviour proven by the existing golden-walk parity oracle."

> **Stage context.** This is **Stage 6 of the Unified Survey Architecture refactor** and the
> explicit follow-up carved out of [spec 028](../028-qu-generic-step-host/spec.md) (which delivered
> the generic `StepHost` + advance policy and named the `FlowStepHost` factory as "Stage 6, a
> documented follow-up"). Stage 5 is merged to `main`. This spec closes the "generated-from-flow"
> source of the master plan: after it, mounting a new YAML-driven survey flow as a wizard step
> requires only a `flowSources` entry + a manifest `flowRefs` + one options record — no new bespoke
> React component.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Survey author walks the copy track unchanged (Priority: P1)

A keyboard author who selects the **copy** track walks the survey exactly as before: the track
choice, project-name (with its auto-slugged keyboard id that still re-derives on Back→forward),
character discovery, the galleries, and the help-docs step all present the identical screens, in the
identical order, and produce the identical working-copy mutations. Nothing about the visible or
recorded behaviour changes even though the track / project-name / help-docs steps are now rendered
by one generic flow host instead of three hand-written wrappers.

**Why this priority**: This is the whole point of the stage — convergence with **zero** behaviour
change. The copy track exercises all three converged flows (track, project_name, help), so its
byte-identical replay is the primary release gate.

**Independent Test**: Replay the committed `stepHost.goldenWalk` **copy** fixture against the
refactored tree; the ordered `(stepId, applyStepCompletion, storeMutations, navigateTo)` sequence
diffs to zero. The fixture file is UNMODIFIED from Stage 5.

**Acceptance Scenarios**:

1. **Given** the copy-track golden-walk fixture recorded on `main`, **When** the survey is driven by
   the same script after the wrappers are replaced by the factory, **Then** the recorded traversal is
   byte-identical (SC-001).
2. **Given** the project-name step, **When** the author edits the display name and navigates
   Back then forward, **Then** the keyboard-id slug re-derives from the then-current display name
   exactly as the pre-refactor `PhaseProjectName` did.
3. **Given** the track step, **When** the author picks "copy" or "adapt", **Then** the same
   session-store mutations (`setSelectedTrack`, and for adapt `setScaffoldSpec(null)`) fire in the
   same order relative to `onComplete` as before.

---

### User Story 2 - Survey author walks the adapt track unchanged (Priority: P1)

A keyboard author who selects the **adapt** track walks the survey unchanged: `project_name` is
skipped (adapt has no project-name fork), and the track step still emits its adapt-specific store
mutations in the same order. The help-docs step at the tail behaves identically.

**Why this priority**: The adapt fork is the second independent path through the converged flows and
must prove the factory did not perturb the fork-skipping behaviour owned by the advance policy.

**Independent Test**: Replay the committed `stepHost.goldenWalk` **adapt** fixture; zero diff, and
`project_name` never appears in the traversal.

**Acceptance Scenarios**:

1. **Given** the adapt-track golden-walk fixture, **When** the survey is driven after convergence,
   **Then** the traversal is byte-identical and contains no `project_name` step (SC-001).

---

### User Story 3 - Maintainer adds a YAML-driven step with no new component (Priority: P2)

A maintainer who wants to mount an existing modular YAML flow as a wizard step does so by adding a
`flowSources` entry, a manifest `flowRefs`, and one options record passed to
`makeFlowStepComponent(flowRef, options)` — without writing a new bespoke React wrapper component.

**Why this priority**: This is the durable capability the stage unlocks (completes the
"generated-from-flow" source). It is proven by the factory covering the three existing flows through
option records rather than three separate components.

**Independent Test**: A factory unit test mounts `makeFlowStepComponent(flowRef, options)` for a
flow ref and asserts it resolves the flow, runs the runner, and emits the extracted result via
`onComplete` — with no per-flow branch inside the host.

**Acceptance Scenarios**:

1. **Given** a `flowRef` present in `flowSources` and an options record, **When**
   `makeFlowStepComponent(flowRef, options)` is mounted, **Then** the correct flow's questions render
   through the runner and completion emits the options' `extract(result)` payload.
2. **Given** the three existing converged flows, **When** the manifest/adapters are wired,
   **Then** each is expressed as one options record over the shared host (no bespoke wrapper
   component remains).

---

### Edge Cases

- **Missing / unknown `flowRef`**: `makeFlowStepComponent` is called with a ref not present in
  `flowSources`. The factory MUST fail loudly (a clear error), not silently render nothing —
  matching the "no default is a defect" / fail-loud posture of the codebase.
- **Seeding on Back→forward re-arrival**: the project-name slug must re-derive from the current
  committed display name when the runner's step stack pops and re-advances — identical to the
  pre-refactor behaviour; the seeds option must not capture a stale value.
- **`onBack` at the first question of a flow**: bottoming out of the runner's internal stack must
  still call the host-supplied `onBack` (the generic `StepHost` pop), unchanged from Stage 5.
- **A `proposed`-status flow ref**: mounting a step against a `status:"proposed"` flow is a promotion
  that must be explicit; the factory is not the place that silently promotes it (guardrails in
  earlier stages own that check — this feature MUST NOT weaken them).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a single generic flow-host component that, given a flow
  reference and an options record, resolves the flow from the flow-source registry, loads the
  modular flow, and runs it through the shared survey runner.
- **FR-002**: The system MUST provide a factory `makeFlowStepComponent(flowRef, options)` that
  produces a component satisfying the single editor-step prop contract (`EditorStepProps`), so its
  output plugs into the manifest/adapters wherever a step component is expected.
- **FR-003**: The options record MUST express, per flow: a title, a context builder
  (`buildContext` → the survey context passed to the runner), a result extractor
  (`extract(result)` → the shaped step payload passed to `onComplete`), and OPTIONAL seeding hooks
  (`getSeedValue` / `onAnswerCommit`) for flows that pre-fill answers.
- **FR-004**: The three bespoke wrapper components — the track wrapper, the project-name wrapper,
  and the help-docs wrapper — MUST be deleted and replaced by option records over the shared host.
- **FR-005**: The project-name flow MUST retain its "default once, then user owns it" seeding: the
  display name seeds from the default, and the keyboard id derives via the existing slugify helper
  from the committed display name, re-deriving on Back→forward re-arrival. This behaviour moves into
  the project-name options record with no logic change.
- **FR-006**: The step-specific store-mutation effects currently performed for these steps
  (`setSelectedTrack`, `setScaffoldSpec`, `setIdentity`, `setSurveyContext`, and the per-question
  findings derivation) MUST be preserved with **identical ordering relative to `onComplete`** — the
  ordering the golden-walk oracle asserts.
- **FR-007**: The existing `stepHost.goldenWalk` copy and adapt fixtures MUST replay with zero diff
  and MUST remain byte-for-byte UNMODIFIED (they are the recorded-on-`main` parity provenance).
- **FR-008**: Existing behaviour tests for the track and project-name flows MUST be re-pointed at the
  factory output with their assertions UNCHANGED; behaviour assertions MUST NOT be weakened.
- **FR-009**: The feature MUST NOT change the shared survey runner, the modular-flow loader, the
  flow-source registry shape, the advance policy, or any `contracts` type. `EditorStepProps` stays
  the single prop contract.
- **FR-010**: An unknown / unresolved `flowRef` MUST cause a clear, loud failure rather than a silent
  empty render.
- **FR-011**: The layering boundaries enforced by the dependency-cruiser rules MUST continue to
  pass — in particular the `survey/` layer's allowed-import set. The factory MUST NOT introduce a
  forbidden import (e.g. the host itself must not reach into stores if that crosses the boundary;
  store effects live in the adapter layer that is already permitted to touch stores).
- **FR-012**: After this feature, mounting a NEW YAML-driven flow as a wizard step MUST require only
  a flow-source entry, a manifest `flowRefs` declaration, and one options record — with no new
  bespoke React component.

### Key Entities

- **FlowStepHost**: the one generic component. Inputs: a resolved flow source + an options record +
  the standard editor-step props. Responsibility: resolve → load → run → extract → complete/back.
- **Flow options record**: per-flow configuration (`title`, `buildContext`, `extract`, optional
  `seeds`). One record replaces one former bespoke wrapper.
- **makeFlowStepComponent(flowRef, options)**: the factory binding a flow ref to its options record,
  producing an `EditorStepProps` component for the manifest/adapters.
- **Golden-walk fixtures (copy, adapt)**: the unmodified recorded traversals that gate parity.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Both `stepHost.goldenWalk` fixtures (copy + adapt) replay with **zero diff** against
  the refactored tree, with the fixture files unmodified.
- **SC-002**: No behaviour assertion in the re-pointed track/project-name tests is weakened; every
  pre-existing assertion still passes against the factory output.
- **SC-003**: The count of bespoke survey-wrapper components for the three converged flows drops to
  **zero** — all three are expressed as options records over the single host.
- **SC-004**: Adding a hypothetical new YAML-driven step is demonstrably a 3-artifact change
  (flow-source entry + manifest `flowRefs` + one options record) with no new component file — shown
  by the three existing flows each being exactly that.
- **SC-005**: All project gates stay green: typecheck, the studio test suite, dependency-cruiser
  boundaries, and the Flow Map drift guardrail (which MUST be unchanged — node sets do not move).
- **SC-006**: A factory unit test passes, proving resolve → run → extract → complete for at least
  one flow ref and a loud failure for an unknown ref.

## Assumptions

- Stage 5 (spec 028: generic `StepHost` + `advance.ts` + the golden-walk oracle) is merged to `main`
  and is the baseline this branch forks from.
- The store-mutation ordering that the golden-walk oracle records is the authoritative definition of
  "correct behaviour"; preserving it is equivalent to preserving user-visible behaviour.
- Step-specific store writes remain in the adapter layer (`editors/adapters/`), which is already
  permitted to import stores; the generic host stays store-agnostic and receives what it needs via
  its options / props. The exact split of "what lives in the host vs. the options vs. the adapter"
  is a planning-phase decision constrained by the dependency-cruiser boundaries, not a scope change.
- The flow-source registry (`steps/flowSources.ts`) already exposes `{ raw, title, registry, status }`
  per flow (delivered in Stage 1); this feature consumes it and does not change its shape.
- No `content/` YAML flow files change; the same modular YAML descriptors are loaded.
- Out of scope: gallery decomposition, the loop primitive, mutate-seam completion, any
  membership/ordering change to flows beyond expressing the existing three as option records.
