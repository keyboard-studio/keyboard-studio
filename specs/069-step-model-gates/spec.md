# Feature Specification: Step-model constitutional gates — machine-enforced survey integrity checks

**Feature Branch**: `km/step-model-gates`

**Created**: 2026-07-06

**Status**: Draft

**Input**: Step-model discipline codification — converting from convention to machine-enforced gates that mirror the repository's locked-contract pattern (e.g. the criteria-count gate and zod drift guards in `packages/contracts/src/{types,schemas}.test.ts`). This spec enforces three deliverables: a constitution amendment prohibiting user-facing survey surfaces outside the step manifest; a module-count gate on the question registry; and a manifest-resolves-component check plus a depcruiser boundary rule preventing direct editor imports in the renderer.

**Governing scope**: This feature implements the step-model guard infrastructure. It does not implement any step decomposition or gallery migration — those are Phase 2 features per the Question Unification migration plan. It does not amend the manifest structure (`steps/manifest.ts` lines 79–129, the spine order and lock declarations remain unchanged).

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Constitution gate prevents survey-surface drift (Priority: P1)

A content author or developer editing the survey code cannot introduce user-facing question surfaces outside the `steps/manifest.ts` manifest without triggering a build failure. The constitution amendment (`constitution.md` Core Principle IX) makes it explicit and machine-auditable that **all user-facing questions must flow through the manifest**, preventing parallel routing paths or orphan question modules.

**Why this priority**: The step-model foundation (specs 012 / 015 / 023) depends on the manifest being the single source of survey truth. Without this gate, a future contributor might land a question module in the registry but forget to add it to the manifest — the map would diverge silently, and the drift invariant (spec 016) would fail mysteriously. Codifying the rule prevents the error at its source.

**Independent Test**: Attempt to add a question module to the registry and the YAML flows without adding it to the manifest. The build MUST fail with a clear violation message before any code ships.

**Acceptance Scenarios**:

1. **Given** the constitution amendment (Principle IX), **When** a feature plan is checked, **Then** it MUST declare the manifest entry as a functional requirement if proposing any new question module or user-facing survey step.
2. **Given** a PR that lands a new question module in the registry, **When** CI runs, **Then** `pnpm typecheck` or the draft constitution audit MUST flag if the module is not also declared in the manifest.
3. **Given** the manifest as the single survey-ordering source, **When** an author modifies the manifest, **Then** the change affects both the runtime survey and the developer Flow Map (spec 012 / spec 015 invariant) because both read the same array.

---

### User Story 2 - Registry module count is gated and enforced (Priority: P1)

The question module registry consolidates four per-phase sub-registries (Phase A 35 modules, Phase B 55, Phase F 8, Phase G 3; consolidated total **101**, verified 2026-07-06 by counting module imports per sub-registry). A hard test gate asserts the exact count in the consolidated registry, catching accidental additions / removals and ensuring the test suite documents the inventory accurately.

**Why this priority**: The criteria catalog in `packages/contracts/data/criteria.json` has a **hardcoded count gate** in `packages/contracts/src/{types,schemas}.test.ts` (148 rows enforced; test fails if the count drifts). The question registry deserves equivalent rigor. The current test only asserts `"> 0"`; this feature upgrades it to an exact count with a clear rationale, making the inventory auditable and preventing silent drift.

**Independent Test**: Run `pnpm --filter @keyboard-studio/studio test src/survey/questions/registry.test.ts`. The test MUST assert the exact count (101) and MUST fail if a question is added or removed without updating the test. Developers adding a question MUST increment the count.

**Acceptance Scenarios**:

1. **Given** the consolidated registry, **When** the test runs, **Then** it MUST assert `Object.keys(questionRegistry).length === 101`.
2. **Given** a PR that lands a new question module, **When** the test runs, **Then** it MUST fail with the new count, and the PR author MUST update the test assertion as part of their change.
3. **Given** the test assertion, **When** the repository is audited, **Then** `Object.keys(questionRegistry).length` matches the test's hardcoded expectation (inventory is documented in the test itself, no silent drift).

---

### User Story 3 - Manifest step ids resolve to registered renderers; no direct editor imports in the renderer (Priority: P1)

Every step id in the manifest (`manifest.ts` lines 79–129: identity, choose_base, track, project_name, characters, carve, mechanisms, touch_seed_source, touch, help, package) must resolve to a registered component or renderer. The renderer (`StudioShell.tsx`) MUST NOT import editor components (e.g., `CarveGallery`, `MechanismGallery`, `TouchGallery`) directly; instead, all editor rendering MUST flow through a step-host / registry layer, preventing coupling between the orchestrator and editor internals.

**Why this priority**: Today, `StudioShell.tsx` (lines 23–25) imports `CarveGallery`, `MechanismGallery`, and `TouchGallery` directly, then switch-renders them by `activeStepId` (lines 773–806). This couples the SPA root to editor implementation details, making it fragile to refactor. A registry-based resolution layer (even if thin) severs that coupling and enables future modular loading. The depcruiser boundary rule (`dashboard` may not import `editors/` directly) already exists; this spec makes the renderer honor it for all steps.

**Independent Test**: Run `grep -n "import.*Gallery\|import.*Panel" packages/studio/src/StudioShell.tsx` and verify the list is empty (all editor imports removed). Run `pnpm depcruise` and verify the rule `studio/SurveyView → editors/` (or equivalent renderer component) has a **mediating layer** (either a step-host module or the registry mechanism). The direct import is forbidden.

**Acceptance Scenarios**:

1. **Given** the manifest with 11 spine / spine-false editor-steps (identity, choose_base, track, project_name, carve, mechanisms, touch_seed_source, touch, help, package, characters), **When** the renderer needs to mount a component, **Then** it MUST call a registry or step-host function (e.g., `resolveStepComponent(stepId)`) rather than a direct static import.
2. **Given** the direct editor imports in `StudioShell.tsx`, **When** they are removed, **Then** the app MUST continue to render byte-identically (the imports are replaced by a registry lookup that returns the same component).
3. **Given** the depcruiser rule (dashboard → editors forbidden), **When** the monorepo is audited, **Then** `pnpm depcruise` MUST stay green with zero new violations; all renderer → editor routing flows through the mediating layer.

---

### Edge Cases

- **A step with no component (e.g., a future metadata placeholder)**: the registry returns `null` without crashing the renderer; the renderer handles the null case gracefully.
- **A manifest step id that does not exist in the registry**: the build fails immediately (FR-003: manifest must resolve) rather than a silent blank screen at runtime.
- **Two phases decomposing in parallel**: they add their question modules to separate registries (e.g., spec 023 adds to `registry.g.ts`); the consolidated `registry.ts` merges them. No merge conflicts on the hot path because per-phase files keep edits isolated (FR-002).
- **The constitution amendment is a REQUIREMENT, not a plan decision**: this spec MUST state the amendment as an FR rather than perform it (FR-001).

---

## Requirements *(mandatory)*

### Functional Requirements

**Constitution amendment (FR-001)**

- **FR-001**: The system MUST **add Principle IX to the Core Principles of `.specify/memory/constitution.md`** (continuing the existing I–VIII numbering) stating: "**No user-facing survey surface may exist outside the step manifest.** Every step declares typed `IRPath` inputs and writes via `Step.inputs` and `Step.writes` (`steps/types.ts`). Every IR write routes through the `mutate()` seam ([specs/014-mutate-seam-touch-propagation](../014-mutate-seam-touch-propagation/spec.md)). The manifest (`steps/manifest.ts`) is the single source of survey ordering ([specs/012-step-model-manifest](../012-step-model-manifest/spec.md)). A plan proposing new survey content MUST include the manifest entry as a functional requirement." This amendment is REQUIRED as a deliverable; the spec itself does not amend the constitution, but specifies that the amendment MUST land before Phase 2 feature work proceeds.

**Module-count gate (FR-002)**

- **FR-002**: `packages/studio/src/survey/questions/registry.test.ts` MUST assert an **exact count** of `questionRegistry` entries, matching the verified consolidated total (Phase A 35 + Phase B 55 + Phase F 8 + Phase G 3 = **101 modules**, verified 2026-07-06). The test MUST fail if the count drifts. The assertion MUST be phrased as `expect(Object.keys(questionRegistry).length).toBe(101)` with a comment explaining the inventory ("35 Phase A + 55 Phase B + 8 Phase F + 3 Phase G = 101 total"). When spec 023's Phase-G additions or later phases land new modules, the count is updated in the same change — the gate documents intent, exactly as the criteria-count gate does for `criteria.json` (148).

**Manifest resolution (FR-003)**

- **FR-003**: Every step id in the manifest (`manifest.ts` lines 79–129) MUST be resolvable to a registered renderer component (either directly via a `step-host/registry` module or via an existing render function). The system MUST fail the build (typecheck or a new manifest-resolution test) if a manifest entry's id is not found in the available renderers, preventing orphan manifest entries.

**Depcruiser boundary (FR-004)**

- **FR-004**: The depcruiser configuration (`.dependency-cruiser.cjs`) MUST include or enforce a rule: **the SPA renderer component (e.g., `SurveyView`, `StudioShell`) MUST NOT import editor components directly** (no `import { CarveGallery } from "./editors/carve/CarveGallery.tsx"` in the renderer). All editor rendering MUST flow through a mediating layer (either a step-host registry or an existing wrapper component) that the depcruiser rule permits. The rule name and phrasing are implementation-level; the intent is that the renderer → editor boundary is explicit and checked by `pnpm depcruise`.

**Non-goals (explicit FR scope boundaries)**

- **FR-005**: This feature MUST NOT decompose gallery steps (carve, mechanisms, touch) or add them to the modular flow system — that is Phase 2 work gated on the loop primitive (migration-plan spec #9). The gallery steps remain full-screen (lines 773–806) during v1.
- **FR-006**: This feature MUST NOT implement a real step-host component or component registry runtime — it only enforces that such a seam MUST exist (either as an existing function like `resolveStepComponent()` or as a future module). The spec codifies the boundary; the implementation detail is planning-level.
- **FR-007**: This feature MUST NOT amend the manifest structure (`manifest.ts` lines 79–129), the step type system (`steps/types.ts`), or the `keyboardIR` contract. The spine order, lock declarations, spine/joinTarget flags, and `inputs`/`writes` fields are unchanged.
- **FR-008**: No contracts bump. No zod schema changes. The `Step` type is NOT a `@keyboard-studio/contracts` export; it lives in `steps/types.ts` and is internal to the studio.

### Key Entities *(include if feature involves data)*

- **`steps/manifest.ts` (lines 79–129)**: The ordered Step[] array defining the survey spine — 11 editor-steps (identity, choose_base, track, project_name, carve, mechanisms, touch_seed_source, touch, help, package) plus the characters Phase-A/B placeholder. Each Step has `kind`, `id`, `title`, `spine`, `inputs`, `writes`, `component`, and optional `lock` / `joinTarget`. Unchanged by this spec.
- **`steps/types.ts`**: The Step type definition (`kind: "editor-step" | "question-step"`, `id: string`, `component: () => ReactNode`, etc.). MUST remain unchanged.
- **`packages/studio/src/survey/questions/registry.ts` & sub-registries (`registry.a.ts` 35 modules, `registry.b.ts` 55, `registry.f.ts` 8, `registry.g.ts` 3)**: The consolidated QuestionModule registry. Inventory total 101 (verified 2026-07-06). The test gate (FR-002) enforces the count.
- **`.specify/memory/constitution.md` Principle IX**: New Core Principle stating the no-surface-outside-manifest rule. Codifies the step-model discipline.
- **`packages/studio/src/survey/questions/registry.test.ts`**: Current test only asserts `> 0`. MUST be updated to assert exact count (FR-002).
- **`StudioShell.tsx` (lines 23–25, 773–806)**: Currently imports `CarveGallery`, `MechanismGallery`, `TouchGallery` directly and switches on `activeStepId`. MUST be refactored to route through a registry / step-host layer (FR-004).
- **`.dependency-cruiser.cjs` (lines 62–108, existing rules)**: Existing rules already forbid `editors/ → dashboard/` and `dashboard/ → editors/`. FR-004 may add or clarify a rule for the renderer component itself if needed (implementation-level detail).

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `.specify/memory/constitution.md` Principle IX is committed under Core Principles, stating the no-surface-outside-manifest rule explicitly.
- **SC-002**: `packages/studio/src/survey/questions/registry.test.ts` asserts the exact count (101 modules) with a comment documenting the per-phase breakdown. The test fails if the count drifts.
- **SC-003**: A manifest-resolution check (either in a new test or in `typecheck`) verifies that every manifest step id resolves to a registered component; the build fails if an id is orphaned.
- **SC-004**: `StudioShell.tsx` and other renderer components have **zero** direct imports of editor components (CarveGallery, MechanismGallery, TouchGallery, or any component from `editors/`). All editor rendering routes through a registry / step-host layer.
- **SC-005**: `pnpm depcruise` stays green with the boundary rule (renderer → editors forbidden or mediated) enforced. A repo audit shows zero violations of the renderer → editor direct-import boundary.
- **SC-006**: `pnpm typecheck` and the studio vitest suite pass; the app renders byte-identically (no runtime behavior change, only governance + boundary enforcement).
- **SC-007**: A new issue or planning document exists recording the 101-module inventory, keyed to the test gate, so future phases can verify their question additions against this baseline.

---

## Assumptions

- **The consolidated registry has exactly 101 modules** (Phase A 35 + Phase B 55 + Phase F 8 + Phase G 3; verified 2026-07-06 by counting module imports per sub-registry). If modules land between ratification and implementation, FR-002's count is re-verified at implementation time.
- **The manifest is already the runtime survey source** (the P4b cutover of [specs/012-step-model-manifest](../012-step-model-manifest/spec.md) removed the `SurveyStage` union); this spec codifies the governance and prevents accidental drift, not introducing new behavior.
- **The depcruiser rule infrastructure is in place** (existing rules forbid `editors/ → dashboard/` and `dashboard/ → editors/`); this spec clarifies or extends it for the renderer component boundary.
- **The constitution amendment (Article IX) is an explicit governance requirement of this feature**, not a planning-level detail. It MUST land before Phase 2 modular decomposition begins, to prevent conflicting proposals.
- **No step-host runtime component is built in this feature** — only the boundary is enforced and the seam documented. A future feature may implement a real `StepHost` or `StepRegistry` class; this spec only ensures the interface exists (even as a convention).
- **The gallery steps remain full-screen during v1** — this spec does not move them into the modular system. Phase 2 will decompose them.
