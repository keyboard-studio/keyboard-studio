# Feature Specification: specRef anchors + spec-trace impacted-steps join — automated code-to-spec traceability

**Feature Branch**: `km/specref-trace-join`

**Created**: 2026-07-06

**Status**: Draft

**Input**: First-phase code-to-spec traceability: annotate every runtime step (manifest entries, question modules) with optional `specRef` fields anchoring them to the spec corpus (monolith sections `§N`, extracted feature specs `specs/<slug>`, architecture docs), then extend [utilities/spec-trace/index.js](../../utilities/spec-trace/index.js) to join drifted spec units back to the steps they govern, so GitHub issue bodies and reports surface the impact scope.

**Governing scope**: This feature implements automated traceability between the spec corpus and the runtime step model, restricted to step and question-module annotations only. It does not retroactively annotate engine/contracts code, does not enforce any spec status as a gate, and does not make CI hard-fail on drift (spec-trace stays continue-on-error in [.github/workflows/ci.yml](.github/workflows/ci.yml)). Spec-trace is a standalone Node CJS utility that must not import packages/studio code; the feature bridges the gap by exporting manifest specRef data to a JSON artifact.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Every manifest step carries a specRef anchor (Priority: P1)

A spec curator can read each step in [packages/studio/src/steps/manifest.ts](packages/studio/src/steps/manifest.ts) and find an optional `specRef` field naming which spec unit governs that step (e.g. `specRef: "specs/023-qu-decompose-wizard"` for the `track` step). The specRef is human-readable and resolvable against [docs/spec-trace.json](docs/spec-trace.json) unit ids.

**Why this priority**: The manifest is the spine of the runtime; annotating it is the gating deliverable. Every step must carry >=1 specRef or be flagged by the completeness check.

**Independent Test**: Read the manifest; confirm every entry has `specRef` (string or array). Confirm every `specRef` value exists in `docs/spec-trace.json` `sections` or `specs` keys.

**Acceptance Scenarios**:

1. **Given** a step in the manifest, **When** it defines `specRef`, **Then** the value matches the vocabulary (`§N`, `§Na`, or `specs/<slug>`) and resolves in spec-trace.json.
2. **Given** a step with no `specRef`, **When** the manifest is loaded, **Then** the completeness vitest runs and reports the missing specRef.

---

### User Story 2 - Question modules carry optional specRef anchors (Priority: P1)

Question modules registered in [packages/studio/src/survey/questions/registry.ts](packages/studio/src/survey/questions/registry.ts) may carry an optional `specRef` field in their `QuestionModule` type, either as a single string or a readonly array of specRef values, allowing fine-grained mapping of individual questions to their governing spec sections.

**Why this priority**: Question modules are the decomposed units of the survey flow; annotating them enables step-level traceability within Phase A/B/F batteries and modular YAML flows.

**Independent Test**: Inspect a sample of question-module registrations; confirm those with `specRef` resolve against spec-trace.json. A vitest run confirms the type is accepted.

**Acceptance Scenarios**:

1. **Given** a question module with `specRef: "§8"` or `specRef: ["§7", "specs/023-..."]`, **When** it is registered, **Then** the specRef fields are preserved and resolvable.
2. **Given** the vitest suite, **When** it runs, **Then** all question-module specRefs resolve cleanly.

---

### User Story 3 - Spec-trace joins drifted units to impacted steps (Priority: P2)

When [utilities/spec-trace/index.js](../../utilities/spec-trace/index.js) runs `spec-trace check`, it detects which steps (manifest entries and question modules) cite the drifted unit, and includes the impact list in the auto-filed GitHub issue body. A spec curator can see "drift in §7 impacts: carve step, track step, iso_code question module, detect_script question module" without manually cross-referencing.

**Why this priority**: The impact list is the load-bearing signal for triage — which team needs to review the drift and whether it is safe to acknowledge? It is P2 because the manifest annotation (US1) is the gating upstream deliverable.

**Independent Test**: Manually drift a spec unit (edit spec.md §8 heading); run `spec-trace check --dry-run`; confirm the issue body lists impacted steps.

**Acceptance Scenarios**:

1. **Given** a drifted unit with downstream step references, **When** spec-trace files an Issue, **Then** the issue body includes "Impacted steps: [step-id, question-id, ...]".
2. **Given** the issue, **When** a curator reads the body, **Then** the impact list is actionable (each id is resolvable in the manifest or registry).

---

### User Story 4 - Spec-trace report prints coverage summary (Priority: P2)

The `spec-trace report` command augments its output with a "Steps covered" section listing how many manifest steps and question modules cite each unit, so a spec maintainer can identify under-annotated or orphaned sections.

**Why this priority**: Coverage awareness is a hygiene signal for future contributions, but is not load-bearing for the issue workflow (US3). P2.

**Independent Test**: Run `spec-trace report`; confirm it lists step/module coverage per unit.

**Acceptance Scenarios**:

1. **Given** the report output, **When** it lists a unit with "Impacted steps: 0", **Then** the curator can investigate whether the unit is truly orphaned or undercited.

---

### Edge Cases

- **A manifest step with no specRef**: the completeness check (vitest) flags it as incomplete; the spec-trace anchor is required, not optional, for manifest entries.
- **A question module with no specRef**: optional — question modules may carry empty or absent specRef, unlike manifest steps. The completeness check only enforces manifest completeness.
- **A step with multiple specRef values** (e.g. `specRef: ["§8", "specs/023-qu-decompose-wizard"]`): both units' drift will list this step as impacted.
- **Spec-trace reads a stale manifest JSON artifact**: if the JSON is out of sync with the live manifest, steps will be missed. The artifact must be regenerated before every spec-trace check.
- **A specRef points to a non-existent unit**: vitest will flag this as a missing link; spec-trace check will log a warning but continue.

---

## Requirements *(mandatory)*

### Functional Requirements

**Step and question-module annotation**

- **FR-001**: Add an optional `specRef` field to the `Step` interface in [packages/studio/src/steps/types.ts](packages/studio/src/steps/types.ts). The field MUST accept either a single string or a readonly array of strings, each matching the vocabulary `§N`, `§Na`, or `specs/<slug>`.
- **FR-002**: Add an optional `specRef` field to the `QuestionModule` interface in [packages/studio/src/survey/types.ts](packages/studio/src/survey/types.ts), using the same vocabulary and signature as FR-001. The field is optional for question modules (unlike manifest entries).
- **FR-003**: Populate `specRef` on all manifest step entries in [packages/studio/src/steps/manifest.ts](packages/studio/src/steps/manifest.ts) at honest granularity. Each entry MUST carry >=1 specRef; use an array when a step spans multiple spec units.
- **FR-004**: Populate `specRef` on a representative set of question modules in the registries ([packages/studio/src/survey/questions/registry.a.ts](packages/studio/src/survey/questions/registry.a.ts), [registry.b.ts](packages/studio/src/survey/questions/registry.b.ts), [registry.f.ts](packages/studio/src/survey/questions/registry.f.ts), [registry.g.ts](packages/studio/src/survey/questions/registry.g.ts)) at the honest granularity for each phase. Question-module specRef is optional and may be empty.

**Completeness check**

- **FR-005**: Add a new vitest check in [packages/studio/src/dashboard/completeness.ts](packages/studio/src/dashboard/completeness.ts) (pattern: pure functions like `checkInputsSatisfiable`, no stores/ import) that validates every manifest step has >=1 `specRef` and every specRef (from steps and question modules) resolves against the unit ids in [docs/spec-trace.json](docs/spec-trace.json). The check MUST run as part of `pnpm test` and MUST fail if a manifest step lacks specRef or if a specRef is invalid.

**JSON artifact export**

- **FR-006**: Create a build/test artifact (generated by `pnpm build` or a dedicated test step) at [packages/studio/src/steps/manifest.specref.json](packages/studio/src/steps/manifest.specref.json) exporting the specRef annotations from the manifest and question-module registries in a flat structure: `{ stepId: ["specRef1", ...], questionId: ["specRef1", ...] }`. Spec-trace reads this JSON to join drifts to steps.
- **FR-007**: The artifact generation MUST NOT require any packages/studio code to import CJS modules or violate the studio's module boundaries. The artifact MUST be emitted by a studio test or build step (e.g. a vitest run hook or a prebuild script).

**Spec-trace extension**

- **FR-008**: Extend `spec-trace check` (when GITHUB_TOKEN + SPEC_TRACE_REPO are set) to read [packages/studio/src/steps/manifest.specref.json](packages/studio/src/steps/manifest.specref.json), find all steps whose `specRef` includes the drifted unit id, and include an "Impacted steps" section in the auto-filed GitHub issue body with a comma-separated list of step/question ids.
- **FR-009**: Extend `spec-trace report` to print a summary section listing, for each unit, the count of distinct manifest steps + question modules that cite it (e.g., "§8: Impacted steps: 4 (carve, track, iso_code, detect_script)").
- **FR-010**: If the manifest.specref.json artifact is missing or stale at spec-trace check time, spec-trace MUST log a non-fatal warning (e.g., "spec-trace: manifest.specref.json not found; step impact tracking unavailable") and continue processing drift units. The artifact is optional for backward compatibility.

**Out of scope (explicit non-goals)**

- **FR-011**: No enforcement that a specRef target has any particular `status` (e.g., "implemented", "reference"); the traceability is descriptive, not prescriptive.
- **FR-012**: No CI hard-fail on drift (spec-trace stays continue-on-error in .github/workflows/ci.yml).
- **FR-013**: No retroactive annotation of engine/contracts code (engine/src/, packages/contracts/src/); steps and question modules only.
- **FR-014**: No annotation of gallery editor components (carve, mechanisms, touch) beyond the manifest entry that wraps them.

---

## Key Entities *(include if feature involves data)*

- **`Step` (interface)**: [packages/studio/src/steps/types.ts](packages/studio/src/steps/types.ts) — the manifest entry type; to receive `specRef: string | readonly string[]` field.
- **`QuestionModule` (interface)**: [packages/studio/src/survey/types.ts](packages/studio/src/survey/types.ts) — the registered question-module contract; to receive optional `specRef` field.
- **`manifest` (const array)**: [packages/studio/src/steps/manifest.ts](packages/studio/src/steps/manifest.ts) — all spine and side-trail steps; to be populated with specRef values.
- **`questionRegistry`** and **phase registries** (`registry.a.ts`, `registry.b.ts`, `registry.f.ts`): [packages/studio/src/survey/questions/](packages/studio/src/survey/questions/) — question-module entries; to carry optional specRef.
- **`checkSpecRef()` (new function)**: a pure completeness check validating all manifest specRefs; defined alongside existing checks in completeness.ts.
- **`manifest.specref.json`** (artifact): [packages/studio/src/steps/manifest.specref.json](packages/studio/src/steps/manifest.specref.json) — exported specRef mapping for spec-trace consumption. Shape: `{ [stepId | questionId]: readonly string[] }`.
- **`spec-trace` utility**: [utilities/spec-trace/index.js](../../utilities/spec-trace/index.js) — extended with artifact reading and issue-body augmentation logic.
- **`spec-trace.json`** (data source): [docs/spec-trace.json](docs/spec-trace.json) — the registry of canonical spec unit ids and hashes; used for validation.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every manifest step in manifest.ts carries `specRef` (string or array); the completeness vitest runs and reports zero missing specRefs.
- **SC-002**: A representative sample of question modules (≥10 modules across Phase A/B/F) carry `specRef` values; vitest confirms all resolve.
- **SC-003**: The manifest.specref.json artifact is generated and contains the expected step/question → specRef[] mapping.
- **SC-004**: When a spec unit drifts, `spec-trace check --dry-run` includes the "Impacted steps" list in the issue body; the list is accurate and actionable.
- **SC-005**: `spec-trace report` prints a coverage summary showing step counts per unit; units with zero impact are identified.
- **SC-006**: `pnpm test` passes all vitest suites including the new specRef completeness check.
- **SC-007**: `pnpm build` (or a dedicated prebuild step) generates manifest.specref.json without error and includes the artifact in the build output.

---

## Assumptions

- Spec-trace currently hashes three unit kinds: spec.md sections (`§N`, `§Na` regex match), extracted feature specs (`specs/<slug>` folder names), and docs listed in EXTRA_DOCS (`docs/architecture.md`). The vocabulary is stable and documented in [utilities/spec-trace/index.js](../../utilities/spec-trace/index.js) lines 58–71.
- The manifest.ts file is the single source of truth for manifest-level step ordering and annotations (per CLAUDE.md); specRef values added here are definitive.
- Question modules in registry.a/b/f are the primary annotation points for Phase A/B/F; modular YAML flows (track.modular.yaml, etc.) do not carry their own specRef but inherit it from the question modules they instantiate.
- The completeness check (FR-005) follows the pattern of existing pure functions in completeness.ts and runs within the standard vitest suite for studio; no new build tool or CI stage is introduced.
- Spec-trace runs in CJS and does not and MUST NOT import packages/studio types or modules; the manifest.specref.json artifact is the contract boundary.
- CI workflows (check, report) continue to run with continue-on-error: true; no drift becomes a hard gate.
