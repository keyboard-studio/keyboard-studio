# Tasks: IRPath + declared `inputs`/`writes` + folder-per-question opt-in

**Input**: Design documents from `specs/010-irpath-inputs-writes/`
**Prerequisites**: plan.md, spec.md (+ research.md, data-model.md, contracts/, quickstart.md)

**Governing source**: P2 of [docs/survey-modularity-cyoa-plan.md](../../docs/survey-modularity-cyoa-plan.md) (§3.3, §3.8, §6 P2); spec §18 + Constitution Article I.

**Tests**: This feature's acceptance criteria **are** tests/CI gates (Design AC, Drift AC, coverage, orphan-input lint, write-surface, mirror). They are therefore **required first-class tasks**, not optional TDD extras.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete-task dependency)
- **[Story]**: US1–US5 map to the spec's user stories
- Paths are repo-relative; preserve **explicit `.ts`/`.tsx` import extensions** on every move/rename (Bundler resolution — see plan Constraints).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Net-new structure and the version-bump decision.

- [ ] T001 [P] Create the mirror test root directories `packages/studio/tests/survey/questions/a/`, `.../b/`, `.../f/` (sibling of `src/`; net-new per plan §7.2)
- [ ] T002 [P] Apply the `@keyboard-studio/contracts` breaking version bump in `packages/contracts/package.json` (**0.10.0 → 0.11.0** recommended per research R5; surface **1.0.0** as a user release call before finalizing) and add a CHANGELOG note for the breaking contract addition

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Plumbing every story needs. **No story work begins until this completes.**

- [ ] T003 Ensure `packages/studio` vitest + tsconfig discover the new `packages/studio/tests/**` mirror tree (update the `include`/path globs in `packages/studio/vitest.config.ts` and `tsconfig.json` as needed) — blocks all mirror-move tasks
- [ ] T004 Capture a green baseline (`pnpm typecheck && pnpm -r test`) before changes, so later regressions are attributable

**Checkpoint**: Mirror tree resolvable by the test runner; baseline recorded.

---

## Phase 3: User Story 2 — `IRPath` typed path algebra (Priority: P1) 🎯 MVP foundation

**Goal**: A net-new `IRPath` type over `KeyboardIR` covering both surfaces, where an invalid path is a compile error and a stale path fails typecheck.

**Independent Test**: Construct a valid physical path and the deep touch path — both compile; a malformed path is a compile error (`ir-path.test.ts` + `pnpm typecheck`). *(This story precedes US1 because `inputs`/`writes` are typed against `IRPath`.)*

- [ ] T005 [US2] Implement the `IRPath` derived key-path type over `KeyboardIR` in `packages/contracts/src/ir-path.ts` — cover physical (`header.*`, `stores[]`, `groups[].rules[].context|output`, `comments[]`, `raw[]`, `recognizedPatterns[]`) and touch (`touchLayout.platforms[].layers[].rows[].keys[]`), **bounded** — no recursion into `TouchKeyIR.sk`/`flick`/`multitap` (research R1/R3, data-model)
- [ ] T006 [US2] Add the `irPath(...segments)` typed builder and `formatIRPath(path): string` stringifier (e.g. `groups[].rules[].output`) to `packages/contracts/src/ir-path.ts`
- [ ] T007 [US2] Export `IRPath`, `irPath`, `formatIRPath` from `packages/contracts/src/index.ts` — this export **is** the named contract the P0 dashboard consumes (FR-012)
- [ ] T008 [US2] Write type-level tests in `packages/contracts/src/ir-path.test.ts`: positive assignability for one physical + one deep-touch path; `// @ts-expect-error` negative cases (Design AC / G1); a drift case asserting a renamed `keyboard-ir.ts` field breaks the path (Drift AC / G2)

**Checkpoint**: `IRPath` compiles, exported, type tests green. MVP foundation ready.

---

## Phase 4: User Story 1 — declared `inputs`/`writes` contract (Priority: P1) 🎯 MVP

**Goal**: Extend `QuestionModule` with optional `inputs`/`writes` (`IRPath[]`) as static data; `mutate` stays a stub.

**Independent Test**: Declare `inputs`/`writes` on one module — a valid path compiles, a bogus path fails typecheck — with no `mutate()` execution.

- [ ] T009 [US1] Extend `QuestionModule` in `packages/studio/src/survey/types.ts` with `inputs?: IRPath[]` and `writes?: IRPath[]` (import `IRPath` from `@keyboard-studio/contracts`); both address the **same** `IRPath` space (clarification Q1); keep `mutate` the commented stub and refresh the doc comment to describe `inputs`/`writes`
- [ ] T010 [US1] Prove the contract on one representative module (e.g. `packages/studio/src/survey/questions/b/pb_standard_letters.ts`): declare real `inputs`/`writes`, confirm a valid path compiles and a bogus path fails `pnpm typecheck` (single-module Design+Drift AC)

**Checkpoint**: Contract live on `QuestionModule`; one module declares; `mutate` untouched (Constitution II).

---

## Phase 5: User Story 3 — populate all 93 + coverage + orphan-input lint + mirror tree (Priority: P2)

**Goal**: Every module carries present `inputs`/`writes`; no orphan inputs in flow manifests; every module has a mirrored test.

**Independent Test**: Coverage spec confirms 93/93 carry present fields; orphan-input lint green over the 3 manifests; missing-mirror check green.

### Mirror test tree (FR-009)

- [ ] T011 [P] [US3] Move the 30 Phase A colocated tests `packages/studio/src/survey/questions/a/*.test.ts` → `packages/studio/tests/survey/questions/a/`, fixing relative import specifiers (keep explicit `.ts` extensions)
- [ ] T012 [P] [US3] Move the 29 Phase B colocated tests `.../questions/b/*.test.ts` → `packages/studio/tests/survey/questions/b/` (fix import specifiers)
- [ ] T013 [P] [US3] Move the 2 Phase F colocated tests `.../questions/f/*.test.ts` → `packages/studio/tests/survey/questions/f/` (fix import specifiers)
- [ ] T014 [US3] **Backfill (net-new authoring, NOT a move)** the missing per-question tests so all 93 modules have a mirrored test — **~26 Phase B + ~6 Phase F = ~32 net-new specs** (Phase A already complete) — minimal `validate`/`fixtures` specs under `packages/studio/tests/survey/questions/<phase>/`. **Scope note:** each spec needs real valid/invalid fixtures, so this is genuine authoring effort distinct from the mechanical moves in T011–T013; it is the work that makes SC-001 (93/93) and the FR-009 mirror gate (T015) pass, and should be sized accordingly when staffing the cycle.
- [ ] T015 [US3] Add the missing-mirrored-test directory-diff check as a vitest spec under `packages/studio/tests/` mapping each `src/survey/questions/<phase>/<id>` → `tests/survey/questions/<phase>/<id>.test.ts` (FR-009)

### Populate declarations (FR-006, clarification Q2)

- [ ] T016 [P] [US3] Populate `inputs`/`writes` on all 30 Phase A modules in `packages/studio/src/survey/questions/a/` — explicit arrays, `[]` where the question reads/writes nothing
- [ ] T017 [P] [US3] Populate `inputs`/`writes` on all 55 Phase B modules in `.../questions/b/` (explicit empty arrays where applicable)
- [ ] T018 [P] [US3] Populate `inputs`/`writes` on all 8 Phase F modules in `.../questions/f/` (explicit empty arrays where applicable)

### Gates (FR-006, FR-007)

- [ ] T019 [US3] Add the coverage check as a vitest spec in `packages/studio` asserting every registered module (`questionRegistry`) has **present** `inputs` and `writes` fields — fails on an **absent** field, passes on an explicit empty array (FR-006 / G7)
- [ ] T020 [US3] Add the **manifest-scoped** orphan-input lint as a vitest spec over `content/flows/phase_a_identity.modular.yaml`, `phase_b_characters.modular.yaml`, `phase_f_helpdocs.modular.yaml`: each manifest-referenced question's `inputs` ⊆ the union of upstream steps' `writes`; name any orphan; **exempt** questions referenced by no manifest (library/reserve §3.8) (FR-007)

**Checkpoint**: 93/93 populated; coverage, orphan-input, and mirror checks green.

---

## Phase 6: User Story 4 — `writes` ↔ strategy write surface (Priority: P2)

**Goal**: Strategy-bearing questions' declared `writes` match their §7.7 assignment-map write surface, conditionally on availability.

**Independent Test**: For each strategy-bearing question whose §7.7 surface is available, `writes` equals that surface; questions without an available surface are skipped (gate passes for the available portion).

- [ ] T021 [US4] Add the **conditional** write-surface test as a vitest spec in `packages/studio`: for each question whose `definition` links a `Pattern.strategyId`, assert declared `writes` == the strategy's §7.7 assignment-map write surface; **skip** questions whose surface is not yet exposed by §7.7 (clarification Q3 / FR-008). Document that the current population carries no `strategyId`, so the test passes vacuously today and is wired to grow as §7.7 lands

**Checkpoint**: Write-surface cross-check exists and is green against the available §7.7 surface; does not block on full §7.7.

---

## Phase 7: User Story 5 — folder-per-question opt-in (Priority: P3)

**Goal**: Modules with companion artifacts use the `<id>/index.ts` + `extras/` form; registry still resolves by `definition.id`.

**Independent Test**: A converted module resolves by `definition.id` exactly as a flat `<id>.ts`; its mirrored test still maps.

- [x] T022 [US5] Discovery: enumerate modules with companion artifacts (inline sample-text blocks, images, custom render components) across `packages/studio/src/survey/questions/**` (research R7); produce the conversion list (may be empty/small) and record it in this file

  Discovery result (2026-06-26): **NONE.** Scanned all 93 question modules across phases a/, b/, f/. Every module exports only `definition`, `validate` (where applicable), `fixtures`, and a default `QuestionModule` object. No module imports image/SVG/CSS/asset files, React/JSX components, or contains non-trivial co-located assets that would justify a folder-per-question layout. No subdirectories exist under any phase directory. The conversion list is empty — T023 and T024 are no-ops.
- [ ] T023 [US5] Convert each identified module to `packages/studio/src/survey/questions/<phase>/<id>/index.ts` + `extras/`, updating its phase sub-registry import to `…/<id>/index.ts` (explicit extension); confirm `questionRegistry` resolves by `definition.id`
- [ ] T024 [US5] Confirm the mirrored test path still resolves for each converted module (mirror path derives from the source path; the FR-009 check from T015 covers this)

**Checkpoint**: Companion-artifact modules in folder form; resolution and mirror invariants hold.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T025 [P] Run the full gate: `pnpm typecheck && pnpm -r test && pnpm lint && pnpm depcruise` — all green; confirm `mutate()` is still a stub (Constitution II / FR-005)
- [ ] T026 [P] Execute the 7 validation scenarios in `specs/010-irpath-inputs-writes/quickstart.md`
- [ ] T027 Update the P2 status note in `docs/survey-modularity-cyoa-plan.md` and confirm the `IRPath`/`inputs`/`writes` contract is locked & exported for P0 consumption (FR-012)
- [ ] T028 [P] Finalize the CHANGELOG entry for the `@keyboard-studio/contracts` breaking bump (area `contracts`); reconcile the chosen version (T002) once the user confirms 0.11.0 vs 1.0.0

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)**: no dependencies.
- **Foundational (P2)**: after Setup. T003 blocks T011–T013 (mirror moves).
- **US2 (Phase 3, P1)**: after Foundational. **Blocks US1** (`inputs`/`writes` type against `IRPath`).
- **US1 (Phase 4, P1)**: after US2.
- **US3 (Phase 5, P2)**: after US1 (needs the populated field on `QuestionModule`). Mirror moves (T011–T013) also need T003.
- **US4 (Phase 6, P2)**: after US3 population; further gated on §7.7 availability (conditional).
- **US5 (Phase 7, P3)**: after US3 population (convert *after* declarations land, to avoid editing the same files twice).
- **Polish (Phase 8)**: after all desired stories.

### Within-story notes

- US2: T005 → T006 → T007 (same file `ir-path.ts`, sequential) ; T008 after T007.
- US3: mirror moves (T011–T013) are independent of population (T016–T018); gates (T019, T020, T015) after their inputs land.

### Parallel opportunities

- **T001 ‖ T002** (Setup).
- **T011 ‖ T012 ‖ T013** (mirror moves — different dirs).
- **T016 ‖ T017 ‖ T018** (population — different dirs), and these run **in parallel with** the mirror moves (different files).
- **T025 ‖ T026 ‖ T028** (Polish).

```bash
# US3 bulk work in parallel (different directories, no shared file):
Task: "Move Phase A tests to packages/studio/tests/survey/questions/a/"
Task: "Move Phase B tests to packages/studio/tests/survey/questions/b/"
Task: "Move Phase F tests to packages/studio/tests/survey/questions/f/"
Task: "Populate inputs/writes on all 30 Phase A modules"
Task: "Populate inputs/writes on all 55 Phase B modules"
Task: "Populate inputs/writes on all 8 Phase F modules"
```

---

## Implementation Strategy

### MVP (Stories US2 + US1)

1. Phase 1 Setup → Phase 2 Foundational.
2. **US2** (`IRPath`) → **US1** (`QuestionModule` extension). **STOP & VALIDATE**: the typed contract exists and is exported — the P0 dashboard spec can now consume `IRPath`/`inputs`/`writes` by name even before full population. This is the concurrency hand-off to P0.

### Incremental delivery

- + **US3** → all 93 populated, coverage + orphan-input + mirror green (the substance of P2).
- + **US4** → write-surface cross-check (conditional on §7.7).
- + **US5** → folder-form conversions.
- Polish → full gate + quickstart + docs/CHANGELOG.

### Notes

- `mutate()` stays a stub end-to-end (Constitution Article II / FR-005).
- Do **not** edit locked `Pattern` schema fields; reads `Pattern.strategyId` only (Article I / FR-013) — escalate to the user if any task appears to require a `Pattern` field change.
- Preserve explicit `.ts`/`.tsx` import extensions on every move/rename.
- The 0.11.0-vs-1.0.0 version string (T002/T028) is the one open user release call; it does not block engineering.
