# Feature Specification: Mutate track — route the track fork through the manifest reducer/mutate seam, replacing the hand-coded StudioShell fork

**Feature Branch**: `km/qu-mutate-track`

**Created**: 2026-07-06

**Status**: **Draft** — GATED on the spec #9 loop-primitive resolution. This spec assumes **DEFER** (per [docs/design-notes/question-unification-migration-plan.md](../../docs/design-notes/question-unification-migration-plan.md) §6 — open decision Q-new). If **BUILD** is chosen instead, this spec needs re-planning only if the fork is re-modeled; that is unlikely since spec 023 already changed presentation and the manifest model (Option A, the modular gate question per Decision 6, 2026-06-29, Matt) is locked.

---

## Input

[docs/design-notes/question-unification-migration-plan.md](../../docs/design-notes/question-unification-migration-plan.md) §3.2 (`track` row in per-opaque-step breakup table), §5 spec #10 row, and §6 (open decisions Q2, resolved as Option A: modular gate question). Spec 023 (branch `km/decompose-wizard-questions`, PR pending) introduced the modular gate questions `track_choice`, `project_display_name`, `project_keyboard_id` and the thin flows `content/flows/track.modular.yaml` and `content/flows/project_name.modular.yaml`. This spec makes the YAML `next` rule the load-bearing fork, replacing the hand-coded fork in `StudioShell.handleTrackSelected` (packages/studio/src/StudioShell.tsx, lines 610–622).

**Current state (verified 2026-07-06)**:
- The live fork today: `StudioShell.handleTrackSelected` (packages/studio/src/StudioShell.tsx:610–622) — `track === "copy"` → `setActiveStepId("project_name")`; else → `nextSpineStepAfter("track")`.
- `handleProjectNameNext` (packages/studio/src/StudioShell.tsx:629–635) — writes `setScaffoldSpec` and `setStoreIdentity` directly.
- Spec 023 (branch `km/decompose-wizard-questions`) — created the modular flow with YAML `next` rule (advisory metadata only in Phase 1).
- The mutate seam (spec 014, SHIPPED) — `applyStepCompletion` in packages/studio/src/steps/reducer.ts dispatches side effects by step id; `isMutateSeamEnabled()` in packages/studio/src/flags/mutateFlag.ts gates execution.
- Manifest (packages/studio/src/steps/manifest.ts:79–96) — `project_name` is `spine:false` with `joinTarget:"characters"`.

---

## Governing scope

This feature implements migration-plan spec #10 (§3.2, §5). It does not re-derive that scope. The modular gate question model (Decision 6, Option A — fork in data, not a hand-coded `if`) is ratified; this spec makes the YAML `next` rule in `track.modular.yaml` the live routing path, executed through the step-completion reducer and the `mutate()` seam (where the fork affects IR header fields).

---

## User Scenarios

### User Story 1 — Copy-track advances via YAML `next` rule

A user selects "Copy base" on the track step. The track answer is recorded, the runner's `resolveNext()` evaluates the YAML `next` rule in `track_choice`, returns `"project_name"` (the branch condition), and the reducer advances the step. No hand-coded fork in `StudioShell`.

---

### User Story 2 — Adapt-track advances via YAML `next` rule

A user selects "Adapt base" on the track step. The runner evaluates the YAML `next` rule, returns `nextSpineStepAfter("track")` as the destination, and the reducer advances. The `project_name` step is skipped. No hand-coded fork.

---

### User Story 3 — Project-name identity writes route through the reducer

When the copy-track path reaches `project_name`, the user enters display name + keyboard ID. The `project_display_name` and `project_keyboard_id` answer pair is recorded; the step-completion reducer executes the identity writes (display name, keyboard ID into the IR header) via the declared `mutate()` patch (spec 014), consistent with the manifest fork metadata (`joinTarget:"characters"`).

---

## Functional Requirements

- **FR-001**: The `next` rules in `track.modular.yaml` and `project_name.modular.yaml` (authored by spec 023) MUST become the load-bearing fork: the runner's resolved next-target drives step advancement via the existing pure routing functions (no hand-coded `if` in `StudioShell`).
- **FR-002**: Track answer + project-name identity writes MUST route through `applyStepCompletion()` in the reducer (packages/studio/src/steps/reducer.ts), dispatching side effects keyed by step id.
- **FR-003**: Identity writes (display name, keyboard ID to the IR header) MUST route through the `mutate()` seam where flag-gated (spec 014), honoring the writes already declared on the `project_name` registration — `writes: [irPath("header","name"), irPath("header","keyboardId")]` (see `registerEditorSteps.ts`); this spec makes the write path honor the declaration rather than adding it.
- **FR-004**: `handleTrackSelected()` and `handleProjectNameNext()` (StudioShell.tsx:610–635) MUST be deleted or reduced to thin manifest-driven dispatch (calling `applyStepCompletion()` with the answer); no inline identity writes or manual `setActiveStepId()` calls for the fork.
- **FR-005**: Fork outcome MUST be byte-identical for both track choices — copy-track reaches `project_name` → characters; adapt-track reaches characters directly — exercised by existing integration tests.
- **FR-006**: The manifest fork metadata (`project_name`: `spine:false`, `joinTarget:"characters"`) MUST remain the single source for the map; the drift guardrail (spec 016) MUST remain green.
- **FR-007**: Parity flag decision — MUST specify whether the routing cutover itself is flag-gated (`VITE_KM_MUTATE_SEAM`), or unconditional since spec 023 already changed presentation. **Recommend**: routing is unconditional (pure `next` rule evaluation is side-effect-free); only the IR writes are seam-flag-gated. Justify the choice.
- **FR-008**: `pnpm typecheck`, studio/contracts `vitest`, and `pnpm depcruise` MUST remain green. The drift guardrail (spec 016) MUST remain green with the track/project_name routing resolved correctly.

**Out of scope (explicit non-goals)**

- **FR-009**: No loop primitive. No gallery decomposition. No contracts bump (the fork writes to existing `irPath("header", …)` locations).
- **FR-010**: Changes to other forks (touch_seed_source unchanged, other manifest steps unchanged).
- **FR-011**: Making project_name a first-class manifest entry (it is spine:false and will remain so; promotion is deferred to Phase 2 if needed).

---

## Success Criteria

- **SC-001**: The developer Flow Map shows the track/project_name steps as distinct nodes, with the fork metadata declared in the manifest (spine:false/joinTarget) and the YAML `next` rules visible on edges (spec 023 drill-downs now driving the runtime fork, not advisory metadata).
- **SC-002**: Integration tests confirm byte-identical fork behavior: copy-track → project_name → characters; adapt-track → characters (no regression).
- **SC-003**: `handleTrackSelected()` and `handleProjectNameNext()` are deleted or refactored to simple dispatch; no inline identity writes survive in StudioShell.
- **SC-004**: Identity writes (display name, keyboard ID) are declared in the project_name step manifest entry and executed via the reducer's `applyStepCompletion()` call; if flag-gated, parity is proven.
- **SC-005**: `pnpm typecheck` + studio/contracts `vitest` + `pnpm depcruise` pass; drift guardrail stays green.
- **SC-006**: The manifest fork metadata (spine:false/joinTarget:"characters") remains green in spec 016's bijection guardrail (the map projects manifest fork, the runtime executes it via `resolveNext()` + reducer).

---

## Assumptions

- Spec 023's PR (branch `km/decompose-wizard-questions`) merges first. The modular gate questions and thin flows are stable.
- Spec #9 (loop primitive) is **DEFERRED**. If BUILD is chosen instead, no major fork re-modeling is expected — the manifest model (Option A, modular gate question per Decision 6) is locked.
- The runner's `resolveNext()` function (packages/studio/src/survey/SurveyRunner.tsx) evaluates `FlowGotoRule[]` correctly and returns the resolved next-step id. No runner changes are anticipated (the YAML structure is already representable).
- Spec 014 (mutate seam, SHIPPED) and spec 016 (drift guardrail, Phase 1 foundation) are already landed. The seam is ready to route identity writes.
- The existing manifest completeness guardrail (spec 016 C1–C7) enforces the bijection. Declaring `writes` on project_name does not regress C5 (orphan inputs) because identity fields are top-level IR locations.
