# Feature Specification: Retire the legacy full-YAML survey flow loader

**Feature Branch**: `013-retire-legacy-flow-loader`

**Created**: 2026-06-27

**Status**: Draft

**Input**: Phase 3b of [docs/survey-modularity-cyoa-plan.md](../../docs/survey-modularity-cyoa-plan.md) — the "beyond #410" follow-up that deletes the legacy full-YAML survey loader and its four full-flow YAMLs now that Phase 3a cut Phase A / F / identity-lite over to `loadModularFlow`.

## Context & Governing Source

This feature implements **Phase 3b (P3 part b)** of the Survey Modularity + CYOA plan. Phase 3a (shipped as [`specs/012-modular-loader-cutover`](../012-modular-loader-cutover/spec.md)) cut the survey **runtime** for Phase A, Phase F, and identity-lite from the legacy `parseFlow` loader to `loadModularFlow`, and created `content/flows/identity_lite.modular.yaml`. With that done, the legacy full-YAML loader and its four full-flow YAMLs are now redundant **delivery forms** of questions that already exist as modular question modules.

Per plan §3.8 ("Question library / reserve — preserve, don't delete"), this deletion removes **only redundant delivery forms**. The question *research content* — especially non-Roman-script questions — already lives in the modular `survey/questions/` modules and MUST NOT be touched.

Verified current state (the only remaining live consumers of the legacy loader are all in `flowmap/`):

- `packages/studio/src/survey/loadFlow.ts` exports `parseFlow`; `loadFlow.test.ts` is its test.
- `flowmap/FlowMapView.tsx` imports the three legacy `*.yaml?raw` sources (`phase_a_identity.yaml`, `phase_f_helpdocs.yaml`, `identity_lite.yaml`) and renders them via `buildFlowGraph` (the legacy `parseFlow` path). Phase B already renders via `buildModularFlowGraph`.
- `flowmap/buildFlowGraph.ts` imports `parseFlow` for its legacy `buildFlowGraph()` entry point (the modular `buildModularFlowGraph()` entry point already exists).
- `flowmap/buildScriptRouting.ts` imports `parseFlow` to parse `identity_lite.yaml` raw.
- `flowmap/buildFlowGraph.test.ts` imports the legacy YAMLs.
- The survey runtime (`PhaseA.tsx`, `PhaseF.tsx`, `PhaseB.tsx`, `IdentityLite.tsx`) is **already** on the `*.modular.yaml` manifests — no runtime consumer of the legacy loader remains.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Flow map renders A/F/identity-lite from the modular source (Priority: P1)

The flow-map / dashboard must stop reading the legacy full-YAML files and instead derive its Phase A, Phase F, and identity-lite graphs from the same modular manifests + registry that the live survey runtime uses — exactly as Phase B already does. This is the prerequisite that unblocks deletion: as long as the flow map reads the legacy YAML, those files cannot be removed.

**Why this priority**: Nothing can be deleted until every consumer is repointed. This story makes "map == runtime" true for A/F/identity-lite (the same principle Phase B already satisfies) and is the gating work; the deletions in Stories 2 and 3 are mechanical once it lands.

**Independent Test**: Open the flow map for Phase A, Phase F, and identity-lite; the node/edge set matches the live modular runtime for each (no ghost or missing nodes), with no import of any legacy `*.yaml` and no call into `parseFlow`.

**Acceptance Scenarios**:

1. **Given** the flow map is open, **When** the Phase A / Phase F / identity-lite graphs render, **Then** they are built from the modular manifests (`*.modular.yaml`) + registry, identical in node/edge set to the live survey runtime for that phase.
2. **Given** the repointed flow map, **When** the codebase is searched, **Then** `flowmap/` contains no import of `parseFlow` and no `?raw` import of a legacy full-flow YAML.
3. **Given** the repointed flow map, **When** the existing flow-map tests run, **Then** they pass (updated to assert against the modular source, not the legacy YAML).

---

### User Story 2 - Legacy loader source is removed (Priority: P2)

With no remaining consumer, delete the legacy parser `survey/loadFlow.ts` and its test `loadFlow.test.ts`.

**Why this priority**: This is the headline deletion of Phase 3b. It depends on Story 1 (no consumer may remain). Kept as its own commit so it can be reverted independently.

**Independent Test**: `survey/loadFlow.ts` and `loadFlow.test.ts` no longer exist; a full-repo search finds no reference to `parseFlow` or `loadFlow` in shipped code; typecheck, lint, and the test suite stay green.

**Acceptance Scenarios**:

1. **Given** Story 1 has landed, **When** `survey/loadFlow.ts` and `loadFlow.test.ts` are deleted, **Then** `pnpm --filter @keyboard-studio/studio typecheck` and the studio test suite pass with no unresolved-import errors.
2. **Given** the deletion, **When** the codebase is searched for `parseFlow`/`loadFlow`, **Then** no shipped-code reference remains (doc/spec/plan prose references are out of scope).

---

### User Story 3 - Legacy full-flow YAMLs are removed (Priority: P2)

Delete the four legacy full-flow YAMLs — `content/flows/phase_a_identity.yaml`, `phase_b_characters.yaml`, `phase_f_helpdocs.yaml`, `identity_lite.yaml` — keeping the thin `*.modular.yaml` manifests and the `content/flows/_examples/*` fixtures.

**Why this priority**: Completes the delivery-form cleanup. Depends on Stories 1 and 2. Kept as a separate commit so it reverts independently (restore from git).

**Independent Test**: The four legacy YAMLs no longer exist; the three `*.modular.yaml` manifests and all `_examples/*` files remain; build, typecheck, lint, and tests stay green.

**Acceptance Scenarios**:

1. **Given** Stories 1–2 have landed, **When** the four legacy YAMLs are deleted, **Then** `pnpm build` / `pnpm --filter @keyboard-studio/studio test` succeed with no missing-asset errors.
2. **Given** the deletion, **When** `content/flows/` is listed, **Then** `phase_a_identity.modular.yaml`, `phase_b_characters.modular.yaml`, `phase_f_helpdocs.modular.yaml`, `identity_lite.modular.yaml`, and `_examples/*` all remain.
3. **Given** the deletion, **When** the modular question modules are inspected, **Then** every question's research content is intact (no module deleted); only the redundant full-YAML delivery forms were removed.

---

### Edge Cases

- **`buildScriptRouting.ts` depends on identity-lite shape.** It parses `identity_lite.yaml` to build the script-routing view. Repointing must preserve the script-routing output (the routing branch derived from identity-lite), since the modular manifest resolves the same questions through the registry.
- **Test fixtures vs. shipped source.** `buildFlowGraph.test.ts` imports the legacy YAMLs as test inputs. These imports must be retargeted to the modular manifests (or the tests rewritten) *before* the YAMLs are deleted, or the test build breaks.
- **Vite `?raw` asset resolution.** A dangling `?raw` import of a deleted YAML is a build-time error, not a silent miss — every such import must be removed in the same change as the file.
- **Documentation/prose references.** Many docs, specs, and `// Ported verbatim from content/flows/<file>.yaml` comments reference the legacy filenames. These are historical/provenance references, NOT live consumers; they are out of scope for deletion (see Assumptions).
- **Partial revert.** If only Story 3 is reverted, the restored YAMLs would have no consumer (harmless dead files); if only Story 1 is reverted, the flow map would again read deleted YAMLs (broken) — so the commits must be reverted in reverse dependency order.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The flow map MUST derive its Phase A, Phase F, and identity-lite graphs from the modular manifests (`content/flows/*.modular.yaml`) + the question registry, matching the live survey runtime — the same way Phase B already renders.
- **FR-002**: After repointing, `packages/studio/src/flowmap/` MUST contain no import of `parseFlow` and no `?raw` import of any legacy full-flow YAML (`phase_a_identity.yaml`, `phase_b_characters.yaml`, `phase_f_helpdocs.yaml`, `identity_lite.yaml`).
- **FR-003**: The script-routing view (`buildScriptRouting.ts`) MUST produce equivalent routing output after sourcing identity-lite from the modular manifest instead of the legacy YAML.
- **FR-004**: `packages/studio/src/survey/loadFlow.ts` and `loadFlow.test.ts` MUST be deleted.
- **FR-005**: The four legacy full-flow YAMLs MUST be deleted: `content/flows/phase_a_identity.yaml`, `phase_b_characters.yaml`, `phase_f_helpdocs.yaml`, `identity_lite.yaml`.
- **FR-006**: The thin modular manifests (`content/flows/*.modular.yaml`) and the example fixtures (`content/flows/_examples/*`) MUST be retained unchanged.
- **FR-007**: No modular question module (`survey/questions/**`) may be deleted or have its research content altered; deletion is limited to redundant delivery forms (the loader + the four YAMLs).
- **FR-008**: After all deletions, shipped code MUST contain no reference to `parseFlow`, `loadFlow`, or the four legacy YAML filenames. (Provenance/historical references in docs, specs, plans, and source comments are out of scope.)
- **FR-009**: Typecheck, lint (including dependency-cruiser), and the studio test suite MUST stay green after each story's commit.
- **FR-010**: The work MUST be split into independently revertible commits aligned with the user stories — repoint (Story 1), loader deletion (Story 2), YAML deletion (Story 3) — so any one can be reverted via git without disturbing the others, in reverse dependency order.

### Key Entities

- **Legacy loader (`parseFlow` / `loadFlow.ts`)**: the full-YAML survey flow parser being retired.
- **Legacy full-flow YAMLs**: `phase_a_identity.yaml`, `phase_b_characters.yaml`, `phase_f_helpdocs.yaml`, `identity_lite.yaml` — the redundant delivery forms.
- **Modular manifests (`*.modular.yaml`)**: the thin surviving manifests consumed by `loadModularFlow`; the source of truth the flow map repoints to.
- **Flow map / dashboard consumers**: `FlowMapView.tsx`, `buildFlowGraph.ts` (legacy `buildFlowGraph()` vs. modular `buildModularFlowGraph()`), `buildScriptRouting.ts`, and their tests — the last code that reads the legacy loader.
- **Modular question modules (`survey/questions/**`)**: the preserved research content; explicitly out of deletion scope.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero references to `parseFlow`, `loadFlow`, or the four legacy YAML filenames remain in shipped code (a repo search over `packages/studio/src` and `content/flows`, excluding `_examples/`, returns nothing).
- **SC-002**: The flow map's node/edge set for Phase A, Phase F, and identity-lite is identical to the live modular runtime for each phase (no ghost or missing nodes) — verifiable by the same kind of node-set assertion Phase B already uses.
- **SC-003**: All four legacy YAMLs and the two loader files (6 files total) are removed; the three modular manifests and all `_examples/*` fixtures remain.
- **SC-004**: 100% of modular question modules are intact after the change (module count unchanged; no `survey/questions/**` deletions).
- **SC-005**: `pnpm typecheck`, `pnpm lint`, and `pnpm --filter @keyboard-studio/studio test` all pass after each of the three commits.
- **SC-006**: Each of the three commits can be reverted independently with `git revert` (in reverse dependency order) and leaves the tree green.

## Assumptions

- **Phase 3a is complete.** The survey runtime for Phase A / F / identity-lite already resolves through `loadModularFlow` on the `*.modular.yaml` manifests, and `content/flows/identity_lite.modular.yaml` exists. Verified against the current tree.
- **Flow-map repointing is in scope for 3b.** Per the feature input, the remaining `flowmap/` consumers are repointed at the modular manifests/registry as part of this feature (not deferred to a separate dashboard cutover). The modular flow-graph path (`buildModularFlowGraph`) already exists for Phase B and is reused.
- **Functional manifest renames are OUT of scope.** The plan's later renaming of `*.modular.yaml` to functional names (e.g. `phase_a_identity.modular.yaml` → `identity.modular.yaml`, §2 reconciliation note) is a separate cutover concern and is NOT part of this deletion feature.
- **Prose/provenance references are OUT of scope.** Doc/spec/plan text and `// Ported verbatim from …` source comments that mention the legacy filenames are historical and are not deleted or rewritten here.
- **Team ownership**: this is an **Engine-team** change (the SPA / flow map / survey loader live under engine ownership per spec §12). No Pattern-schema, KeyboardIR, validator-layering, or VirtualFS contract is touched.
- **Rollback = git restore.** The defined rollback for the deletions is restoring the removed files from git history; this is why the work is split into independently revertible commits (FR-010).
- **No new behavior.** This is a pure retirement/cleanup: no new survey questions, no ordering changes, no schema changes. The flow map's rendered output for A/F/identity-lite is expected to be equivalent to today's (it already matched the modular runtime for Phase B).
