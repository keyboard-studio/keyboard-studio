---
description: "Task list for retiring the legacy full-YAML survey flow loader (Phase 3b)"
---

# Tasks: Retire the legacy full-YAML survey flow loader

**Input**: Design documents from `specs/013-retire-legacy-flow-loader/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/flow-graph-parity.md](./contracts/flow-graph-parity.md), [quickstart.md](./quickstart.md)

**Tests**: Test tasks ARE included — the spec/contract require test retargeting (`buildFlowGraph.test.ts`) and parity assertions (INV-1/INV-2) as acceptance criteria, and the existing Phase 3a parity harness must stay green. This is not new TDD scaffolding; it is the safety net the deletion rides on.

**Organization**: Tasks grouped by user story. **Unlike the default template, the three stories are strictly sequential** — US2 cannot start until US1 removes every legacy consumer; US3 cannot start until US2 deletes the loader. Each is its own revertible commit (FR-010, revert order 3→2→1).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 from [spec.md](./spec.md)
- Exact file paths are included in each description.

## Branch / commit convention

- One cycle branch: `km/retire-legacy-flow-loader`.
- Three commits aligned to the stories: `refactor(studio): repoint flow map to modular loader` (US1), `maint(studio): delete legacy parseFlow loader` (US2), `maint(studio): delete legacy full-flow YAMLs` (US3). No issue numbers in shipped code.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the branch and a baseline so research-preservation (INV-4) and parity (INV-1/INV-2) are verifiable after the change.

- [x] T001 Create the cycle branch `km/retire-legacy-flow-loader` off `main`.
- [x] T002 [P] Record the baseline question-module count: `find packages/studio/src/survey/questions -name '*.ts' ! -name '*.test.ts' | wc -l` and note it in the PR description (INV-4 / FR-007 guard).
- [x] T003 [P] Confirm starting state is green: run `pnpm --filter @keyboard-studio/studio test` and `pnpm typecheck` on the branch base; note any pre-existing failures so they are not attributed to this change.

**Checkpoint**: Branch ready; baseline counts and green starting state captured.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: No cross-story infrastructure is needed — the modular plumbing (`loadModularFlow`, `phaseARegistry`/`phaseFRegistry`/`phaseBRegistry`, `buildGraphFromQuestions`, `computeReserveNodes`) already exists from Phase 3a. This phase is intentionally empty.

*(No foundational tasks. Proceed to Phase 3.)*

**Checkpoint**: Proceed directly to User Story 1.

---

## Phase 3: User Story 1 — Flow map renders A/F/identity-lite from the modular source (Priority: P1) 🎯 MVP

**Goal**: Repoint every flow-map consumer of the legacy loader to the modular manifests + registries, so no `parseFlow`/legacy-YAML reference remains in `flowmap/`. This is the gate that unblocks all deletion.

**Independent Test**: `grep -rnE "parseFlow|loadFlow|phase_[abf]_*\.yaml|identity_lite\.yaml" packages/studio/src/flowmap` returns nothing (only `*.modular.yaml` remains); `pnpm --filter @keyboard-studio/studio test src/flowmap/buildFlowGraph.test.ts` passes; the Flow Map tab renders all four sections with no parse-error banner.

### Implementation for User Story 1

- [x] T004 [US1] Generalize `buildModularFlowGraph` in `packages/studio/src/flowmap/buildFlowGraph.ts` to take a third param `registry: Readonly<Record<string, QuestionModule>>` and pass it to `computeReserveNodes(flow, registry)` (contract C1; was hardwired to `phaseBRegistry`).
- [x] T005 [US1] In the same file `packages/studio/src/flowmap/buildFlowGraph.ts`, remove the legacy `buildFlowGraph(raw, title)` function and delete `import { parseFlow } from "../survey/loadFlow.ts";` (preserve explicit `.ts` extension conventions on remaining imports). No `flowmap/` symbol may import `loadFlow.ts` after this.
- [x] T006 [US1] Repoint `packages/studio/src/flowmap/buildScriptRouting.ts`: swap `import { parseFlow } from "../survey/loadFlow.ts"` → `import { loadModularFlow } from "../survey/loadModularFlow.ts"` and `parseFlow(raw)` → `loadModularFlow(raw)`; no other logic change (contract C2 / D4).
- [x] T007 [US1] Rewire `packages/studio/src/flowmap/FlowMapView.tsx`: replace the three legacy `?raw` imports (`identity_lite.yaml`, `phase_a_identity.yaml`, `phase_f_helpdocs.yaml`) with their `*.modular.yaml` counterparts; collapse the `FlowSourceEntry` union so every entry is modular and carries its `registry` (Identity-lite→`phaseARegistry`, Phase A→`phaseARegistry`, Phase B→`phaseBRegistry`, Phase F→`phaseFRegistry`); simplify `safeBuild` to always call `buildModularFlowGraph(raw, title, registry)`; feed `ScriptRoutingView` the `identity_lite.modular.yaml` raw string (data-model + contract C1 call-site table).
- [x] T008 [US1] Update the header comment block in `FlowMapView.tsx` (lines describing "legacy full-YAML loader (parseFlow)" per-import) to reflect that all sections now use the modular loader — remove the now-false "legacy" narration.
- [x] T009 [US1] Verify `packages/studio/src/flowmap/ScriptRoutingView.tsx` needs no change (still receives an identity-lite raw string prop); if it carries any legacy reference, update it.
- [x] T010 [US1] Retarget `packages/studio/src/flowmap/buildFlowGraph.test.ts`: replace legacy `*.yaml?raw` fixture imports with `*.modular.yaml?raw`; update reserve-node expectations for A/F/identity-lite (D3 — reserve nodes now appear, consistent with Phase B); assert the live (`kind: "live"`) node set per phase equals the manifest's question ids (INV-1).
- [x] T011 [US1] Add/confirm a script-routing parity assertion (INV-2): `buildScriptRouting(identity_lite.modular.yaml)` yields the same rows the legacy YAML produced, with `Ethi`/`Hani`/`Hang` rows `gated: true`. (Place in `buildScriptRouting`'s test if one exists, else add a focused case to `buildFlowGraph.test.ts` or a new `buildScriptRouting.test.ts`.)
- [x] T012 [US1] Run gates: `pnpm typecheck`, `pnpm lint` (incl. `pnpm depcruise`), `pnpm --filter @keyboard-studio/studio test`. Confirm `tests/survey/flow-parity.test.ts` (Phase 3a) stays green. Fix any fallout before committing.
- [x] T013 [US1] Commit US1 as `refactor(studio): repoint flow map to modular loader` on the cycle branch.

**Checkpoint**: All flow-map sections run on the modular loader; `flowmap/` has zero legacy references; the legacy loader + YAMLs are now dead code (no consumer). US1 is independently testable and revertible.

---

## Phase 4: User Story 2 — Legacy loader source is removed (Priority: P2)

**Goal**: Delete the now-unused legacy parser and its test.

**Independent Test**: `survey/loadFlow.ts` and `loadFlow.test.ts` no longer exist; `grep -rnE "parseFlow|loadFlow" packages/studio/src` returns nothing; typecheck/test green.

**Depends on**: US1 complete (T013) — no consumer may remain.

### Implementation for User Story 2

- [x] T014 [US2] Delete `packages/studio/src/survey/loadFlow.ts`.
- [x] T015 [US2] Delete `packages/studio/src/survey/loadFlow.test.ts`.
- [x] T016 [US2] Sweep for stragglers: `grep -rnE "parseFlow|loadFlow" packages/studio/src` must return nothing (FR-008, shipped code only). Resolve any remaining import.
- [x] T017 [US2] Run gates: `pnpm typecheck` + `pnpm --filter @keyboard-studio/studio test` (no unresolved-import errors).
- [x] T018 [US2] Commit US2 as `maint(studio): delete legacy parseFlow loader` (separate commit so it reverts independently).

**Checkpoint**: Legacy loader gone; build still green. US2 reverts independently.

---

## Phase 5: User Story 3 — Legacy full-flow YAMLs are removed (Priority: P2)

**Goal**: Delete the four legacy full-flow YAMLs; keep the modular manifests and example fixtures.

**Independent Test**: the four legacy YAMLs are gone; the four `*.modular.yaml` and all `_examples/*` remain; build/typecheck/lint/test green; question-module count unchanged (INV-4).

**Depends on**: US2 complete (T018) — and transitively US1 (no `?raw` import of these YAMLs may remain, removed in T007/T010).

### Implementation for User Story 3

- [x] T019 [P] [US3] Delete `content/flows/phase_a_identity.yaml`.
- [x] T020 [P] [US3] Delete `content/flows/phase_b_characters.yaml`.
- [x] T021 [P] [US3] Delete `content/flows/phase_f_helpdocs.yaml`.
- [x] T022 [P] [US3] Delete `content/flows/identity_lite.yaml`.
- [x] T023 [US3] Confirm retained assets: `ls content/flows/*.modular.yaml` shows all four manifests; `ls content/flows/_examples` shows the example fixtures (FR-006).
- [x] T024 [US3] Confirm research preserved (FR-007/INV-4): re-run the T002 count over `survey/questions` — must equal the baseline; no `survey/questions/**` file deleted.
- [x] T025 [US3] Run full gates from a clean build: `pnpm build` (resolves Vite `?raw` assets — catches any dangling import), `pnpm typecheck`, `pnpm lint`, `pnpm --filter @keyboard-studio/studio test`.
- [x] T026 [US3] Commit US3 as `maint(studio): delete legacy full-flow YAMLs` (separate commit).

**Checkpoint**: All six legacy files removed; modular manifests + examples + question research intact; whole suite green.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final verification and optional doc hygiene.

- [x] T027 [P] Run the full [quickstart.md](./quickstart.md) verification end-to-end (US1/US2/US3 sections + whole-feature gates + research-preservation check).
- [x] T028 [P] (Optional doc hygiene — not required by an FR) Update `content/flows/README.md` if it describes the deleted legacy YAMLs as live sources; flag for `km-doc`. Do NOT rewrite historical `// Ported verbatim from …` source comments (out of scope, FR-008 / research Out-of-scope).
- [x] T029 Reconcile spec acceptance criteria against the diff for the closing PR (SC-001…SC-006); open the PR against `main` with `refs`/`closes` per the issue-closure policy. This feature is the explicit "beyond #410" follow-up, so it does not by itself close #410.

---

## Dependencies & Execution Order

### Phase / story dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: empty.
- **User Story 1 (P1)**: starts after Setup. **Gates US2 and US3.**
- **User Story 2 (P2)**: starts only after US1 (T013). Removing the loader before US1 would break the still-legacy flow map.
- **User Story 3 (P2)**: starts only after US2 (T018). (The `?raw` imports of these YAMLs were already removed in US1, but keeping deletion last keeps each commit green and the revert order clean: 3→2→1.)
- **Polish (Phase 6)**: after US3.

> **This is NOT the usual "stories are independent" shape.** The retirement is inherently a chain: repoint → delete loader → delete data. The independence that matters here is **revert** independence (each commit reverts on its own, in reverse order), not parallel implementation.

### Within User Story 1

- T004 and T005 touch the same file (`buildFlowGraph.ts`) → sequential, not [P].
- T006 (`buildScriptRouting.ts`) is independent of T004/T005 → could run [P], but it is small; keep ordered for clarity.
- T007/T008 (`FlowMapView.tsx`) depend on T004 (new signature) and T006 (the modular script-routing source).
- T010/T011 (tests) come after the implementation they assert.
- T012 (gates) and T013 (commit) close the story.

### Parallel opportunities

- **Phase 1**: T002, T003 are [P].
- **US3**: T019–T022 are four independent file deletions, all [P].
- Cross-story parallelism does **not** apply (sequential chain).

---

## Implementation Strategy

### MVP (and the unblock)

US1 alone is the substantive change and the MVP: once the flow map is on the modular loader, the product is fully correct and the legacy files are dead weight. US2/US3 are pure cleanup that can even be deferred to a later commit if needed — but they are cheap and should land in the same PR as separate commits.

### Incremental delivery

1. Setup → branch + baseline.
2. US1 → repoint + tests green → **the real change** (map == runtime for A/F/identity-lite, legacy dead).
3. US2 → delete loader → green.
4. US3 → delete YAMLs → green.
5. Polish → quickstart + PR with AC reconciliation.

### Crew dispatch (optional)

If run through `/km-lead`: `km-frontend` owns T004–T011 (flow-map SPA edits + tests), `km-verification` runs T012/T017/T025/T027 gates, `km-archivist` handles T013/T018/T026 commits and T029 PR/AC reconciliation.

---

## Notes

- [P] = different files, no dependency on an incomplete task.
- Each story is one revertible commit; revert order is 3→2→1.
- Preserve strict-TS explicit `.ts`/`.tsx` import extensions on every edited import (plan Constraints).
- A dangling `?raw` import of a deleted YAML is a build-time error — T025's `pnpm build` is the catch-all.
- Do not touch `survey/questions/**` (research content) — INV-4 / FR-007.
