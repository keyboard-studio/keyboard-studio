# Tasks: Steps derived from decisions

**Input**: Design documents from `/specs/091-derived-steps/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: The spec's success criteria are test-shaped (SC-001 through SC-005) and the series
measurement rule requires live-app or real-StepHost evidence, so test tasks are included and are
written before the implementation they pin.

**Organization**: Tasks are grouped by user story. This spec runs on the stacked branch
`km/derived-steps` on top of 088 (decision store), 089 (`apply` + golden walk) and 090 (every
decision is a module). Per the constitution, implementation runs one user-story phase per
conversation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- File paths are exact and repo-relative to the worktree root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the stacked predecessors' end-state and seed the declarations the
derivation reads. No behaviour change.

- [x] T001 Audit the stacked branch state the plan assumes — `decisionStore` live (088),
  `apply` the only question write path and the golden-walk script present (089), and a decision
  module with `provides`/`requires`/`renderer` for every `settles` name in
  `packages/studio/src/steps/stepDependencies.ts` (090) — and record any gap as a blocker note
  in specs/091-derived-steps/plan.md before proceeding
- [x] T002 Add the optional `group?: string` field (with the "never affects order" doc comment)
  to `QuestionModule` in packages/studio/src/survey/types.ts
- [x] T003 [P] Seed `group` on the live question modules in
  packages/studio/src/survey/questions/registry.ts: identity_lite → `"identity"`, track →
  `"track"`, project_name → `"project_name"`, phase_b_characters → `"characters"` and
  phase_f_helpdocs → `"help"` (the intra-step groups naming their enclosing custom screen, per
  research.md's two-level treatment)
- [x] T004 [P] Expose the single declaration-ordered decision-module list the derivation
  consumes (question modules plus 090's gallery/picker modules, concatenated in declaration
  order, documented as tie-break input only) in packages/studio/src/survey/questions/registry.ts,
  unless 090 already landed an equivalent export — in that case adopt it and delete this task's
  addition

**Checkpoint**: Declarations seeded; derivation inputs exist; nothing consumes them yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The derivation itself, as pure data beside the sort it consumes. MUST complete
before any user story.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T005 Implement `deriveScreens(modules)` in packages/studio/src/decisions/deriveScreens.ts
  per the data-model.md contract: order with the existing `orderByDependencies` (no second
  sort), partition into singleton custom screens and maximal same-`group` question runs, split
  a run at a group change or an intervening singleton, derive each screen's gate (present iff
  every member decision is gated) and trail structure via the existing `deriveStepStructure`
  logic; fail-fast named errors for the data-model validation rules; no store access, no
  component imports
- [x] T006 Write the derivation unit tests in packages/studio/src/decisions/deriveScreens.test.ts:
  singleton formation, merged question run, split run repeating the group label, group
  disagreement split, all-gated screen skipped while a partially gated screen is walked, the
  frozen trails (project_name → characters, touch_seed_source → touch), and each validation
  error
- [x] T007 Create the frozen legacy-id map in packages/studio/src/decisions/legacyStepIds.ts:
  all 18 step ids from `main` at 18e63aa4 (identity, layout, choose_base, track, project_name,
  characters, marks, punctuation, invisibles, convenience, carve, deadkeys, rules, mechanisms,
  touch_seed_source, touch, help, package — inventoried in research.md) mapped to the screen id
  holding that step's decisions, with `done`/`unsupported` documented as pass-through terminals
- [x] T008 Re-derive `STEP_ORDER` and `STEP_TRAILS` from `deriveScreens` output in
  packages/studio/src/steps/stepOrder.ts, keeping the exported shapes identical so existing
  consumers (`stores/workingCopyStore.ts` ranking, `steps/advance.ts`) compile unchanged
  — LANDED in Phase 2, REVERTED in Phase 3 (plan.md Delta P4: the D-090-7
  init-cycle bites under store-first entry orders; the Phase 2 batch
  masked it). Returned with Phase 4's rewiring (T012–T016) and LANDED at
  the finishing-phase flip: stepOrder now re-publishes the manifest's
  derivation (manifest.ts is the one deriveScreens call over the live
  registry; Delta P4's prerequisite — breaking the completeness →
  stepOrder-during-registry-evaluation path — was discharged by T014's
  threading of screenTrails). The deriveScreens standalone canary
  (the Phase 3 reproducer) passes.

**Checkpoint**: `deriveScreens` is tested pure; stepOrder still serves its consumers, now
screen-derived. `stepDependencies.ts` still exists but is no longer the source for STEP_ORDER.

---

## Phase 3: User Story 1 — Moving a decision takes one edit (Priority: P1) 🎯 MVP

**Goal**: A maintainer adds one `requires` to a module and the question appears in its new
place, with nothing else edited.

**Independent Test**: In a test registry, add `requires: ["base-keyboard"]` to
`il_language_autonym`. The derived steps show it after `choose_base`, the identity screen
splits into two screens both labelled `identity`, and the diff touches one line.

- [x] T009 [US1] Write the one-edit test first (it must fail against step-membership as
  currently wired): test-registry module list with the added edge, asserting the autonym lands
  after the `choose_base` screen in a second `identity`-labelled screen, in
  packages/studio/src/decisions/deriveScreens.test.ts
- [x] T010 [US1] Add the registry seam the SC-001 test needs: building the manifest/screen list
  from a supplied module list (defaulting to the live registry) in
  packages/studio/src/steps/manifest.ts, consumed by packages/studio/src/components/StepHost.tsx
  without changing its default behaviour
- [x] T011 [US1] Write the SC-001 store-level test driving the real `StepHost` with the test
  registry from T009 — screen sequence reflects the one-line edit, and reverting the edit
  restores the baseline sequence — in
  packages/studio/src/components/StepHost.derivedScreens.test.tsx

**Checkpoint**: US1 passes at both levels (pure derivation and real StepHost). This is the MVP
demonstration of the whole spec.

---

## Phase 4: User Story 2 — The default order is unchanged (Priority: P1)

**Goal**: The author sees the same wizard as `main` — while `stepDependencies.ts`, `flowRefs`,
`settles` and step-level `gatedBy` are deleted underneath it, and the parity tests are rewritten
to assert "same order as main unless a `requires` edge says otherwise" (FR-005).

**Independent Test**: A live walk in `pnpm dev` visits the same screens in the same order as
`main` with the same questions on each (SC-002); the golden walk is byte-identical (SC-003);
`stepDependencies.ts` does not exist (SC-004).

- [x] T012 [US2] Rewire packages/studio/src/steps/manifest.ts: the pool is keyed by screen id
  and arranged by the derived screen order; remove the `stepDependencies("characters")` spread
  and the pool-≡-declared-set assertion (replaced by pool-≡-derived-screens validation); keep
  the M-rule validations (locks, unique ids) running over the derived order
- [x] T013 [US2] Remove every remaining `stepDependencies(...)` spread from
  packages/studio/src/steps/registerEditorSteps.ts and packages/studio/src/steps/rulesStep.ts,
  leaving screen-host declarations only (component, inputs, writes, persistence, specRef, lock)
- [x] T014 [US2] Narrow `Step` in packages/studio/src/steps/types.ts — delete `provides`,
  `requires`, `gatedBy` and `flowRefs` — and move the Flow Map consumers to screen membership:
  packages/studio/src/dashboard/renderedNodeSet.ts (drill-downs from the screen's module list)
  and packages/studio/src/dashboard/buildStepGraph.ts (nodes/edges from derived screens and
  trails); re-derive flow liveness in packages/studio/src/steps/flowSources.ts from screen
  membership instead of "referenced via flowRefs"
- [x] T015 [US2] Move gate reads to the derived screen gate and legacy ids to the map:
  `walkedByTrack`/resolution in packages/studio/src/lib/resolveLocation.ts reads the screen's
  derived `gatedBy` against `decisionStore` and resolves unknown/old step ids through
  `legacyStepIds.ts`; restored-draft history sanitising in
  packages/studio/src/stores/surveySessionStore.ts maps stored step ids through the same map
  (also: steps/advance.ts's stepApplies gate read moved to the same screen
  gates — a consumer the task text did not name; manifest.ts publishes
  `screenGates`/`screenTrails` as the one source)
- [x] T016 [US2] Delete packages/studio/src/steps/stepDependencies.ts and verify SC-004: zero
  live references to `stepDependencies`, `flowRefs` or `settles` remain in
  packages/studio/src (grep gate in quickstart.md §1)
  — LANDED at the finishing-phase flip (after spec 090 completed, PR
  #1981). `settlesForStep`/`stepHasSettles` re-homed to
  decisions/screenSettles.ts over a pure `settlesByScreen` in
  decisions/deriveScreens.ts (a screen settles what its gallery members
  provide), computed lazily so no registry read happens at module-init
  time; 090's galleryLogEntries suite stays green (9/9). The two other
  partial manifest mocks (StepHost.test, deepLinkRevision) were extended
  to model the manifest module's derived exports, as galleryLogEntries'
  was. SC-004 grep gate verified empty.
- [x] T017 [US2] Rewrite packages/studio/src/steps/stepOrder.parity.test.ts per FR-005 —
  explicitly replacing the frozen-literal oracle, not regenerating it: carry the `main`@18e63aa4
  screen sequence, membership, trails and lock order over as baseline data; assert the derived
  screens equal the baseline unless a `requires` edge in the current declarations orders the
  pair differently (edge-explained differences are enumerated, not silent); keep the
  documented tie-break-pairs mechanism and the adversarial input-order property, run over
  screens
  — COMPLETED at the finishing-phase flip: the frozen-literal oracle is
  retired; the file now asserts FR-005 in baseline form (main@18e63aa4
  sequence/membership/trails/locks carried as BASELINE_* literals —
  membership from the deleted table's provides lists, captured
  mechanically before deletion), order admitted in edge-explained form,
  tie-break pairs and the adversarial input-order property re-run over
  deriveScreens itself. The tie-break set reproduced the frozen 14
  pairs exactly from the module graph.
- [x] T018 [US2] Rewrite the M2 assertion in packages/studio/src/steps/manifest.test.ts as
  manifest ≡ derived screens (M3–M6 unchanged, evaluated over screens); re-point
  packages/studio/src/decisions/gateWalkParity.test.ts to iterate derived question screens
  instead of `flowSources` flows, keeping its property (derived gates select exactly the
  walked set); confirm packages/studio/src/decisions/orderParity.test.ts passes **unmodified**
- [x] T019 [US2] Run the live verification from quickstart.md §3–§4: `pnpm dev` walk of both
  tracks matching `main` screen-for-screen (SC-002), a pre-091 deep link and a pre-091 draft
  landing correctly, and the golden walk byte-identical (SC-003); record the evidence in the
  phase commit message
  — LANDED at the finishing phase, store-level per the series' live-
  capture ruling (sandbox Chromium blocks localhost; the live walk runs
  in CI on this branch's PR): SC-002 = the FR-005 parity baseline
  (order + membership equal to main@18e63aa4, zero inversions) plus the
  golden walk's per-track traversals through the real StepHost;
  SC-003 = tests/steps/stepHost.goldenWalk.test.tsx, copy AND adapt
  tracks byte-identical to the committed fixtures on the flipped tree;
  deep link + pre-091 draft = lib/legacyStepIds.test.ts (SC-005
  inventory), lib/resolveLocation.test.ts and the draftPersistence
  suites, all green. The browser golden walk (e2e/golden-walk.spec.ts,
  byte-compare of the emitted zip) is CI-gated on the PR.

**Checkpoint**: `stepDependencies.ts` is gone, the rewritten parity is green, and the wizard is
visibly unchanged. US1 + US2 together are the spec's core delivery.

---

## Phase 5: User Story 3 — Survey screens still read as one page (Priority: P2)

**Goal**: Consecutive survey-question decisions merge into one screen labelled by their
`group` hint; a split run repeats the label; a screen whose decisions are all gated off is
skipped as steps are today.

**Independent Test**: The identity flow renders as one labelled page; the US1 split case shows
two pages with the same label; a fully gated screen is skipped in the walk.

- [x] T020 [US3] Surface the screen label from `group` in the question-screen host
  (packages/studio/src/survey/FlowStepHost.tsx) and the progress/stage surfaces that name the
  current screen (packages/studio/src/decisions/progressDots.ts), with no i18n id changes —
  labels key off existing ids or the structural group key, never a renamed message (FR-006)
- [x] T021 [US3] Add the walk-level tests: a split run yields two screens with the same group
  label in derived order, and a screen whose decisions are all gated off is skipped by
  packages/studio/src/steps/advance.ts while a partially gated screen is walked, in
  packages/studio/src/steps/advance.test.ts
- [x] T022 [US3] Point packages/studio/src/decisions/stageGroups.ts at screens (stage = derived
  screen, following the screen list) — display grouping only; entries keep the step display
  metadata recorded under 088 FR-008, so no recorded data changes shape

**Checkpoint**: All three stories pass independently; the trail and progress surfaces name
screens consistently.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Close the remaining success criteria and the series-level obligations.

- [x] T023 [P] Write the SC-005 inventory test: a test that lists every step id on `main` at
  18e63aa4 (the 18 ids in research.md, named in the test) and asserts each resolves through
  `legacyStepIds.ts` + resolveLocation to the screen holding that step's decisions, with
  `done`/`unsupported` passing through — in packages/studio/src/lib/resolveLocation.test.ts
  (or a new packages/studio/src/lib/legacyStepIds.test.ts if the suite fits better there)
- [x] T024 [P] Correct constitution Article IX's naming of `steps/stepDependencies.ts` in
  .specify/memory/constitution.md to name the derived screens as the step source, with the
  version footer bumped, in the same change that deletes the file (Governance: the article
  follows the change that prompts it)
- [x] T025 [P] Sweep docs/ and the dashboard/Flow Map docs for live references to
  `stepDependencies.ts`, `flowRefs` and `settles` as current machinery and update or retire
  them (historical spec text under specs/_archive and landed spec docs are not rewritten)
- [x] T026 Run the full gates from quickstart.md §5 on the phase result: studio typecheck,
  the studio vitest suite through the package (never bare vitest at root), and `pnpm lint`
  including depcruise (the decisions/ derivation must stay cycle-free); fix only 091 fallout
- [x] T027 Run `/speckit-analyze` (spec ↔ plan ↔ tasks consistency) and one scoped km-lead
  review cycle over the diff before the PR; confirm FR-006 by diffing the i18n catalogs
  (zero message-id changes) and record the check in the PR body
  — DONE at the finishing phase: analyze consistent (FR-001…FR-006,
  SC-001…SC-005 each mapped to landed tasks + named tests; 27/27 tasks
  checked); FR-006 confirmed — zero i18n catalog files in the branch
  diff; full gates in the PR body (studio tsc clean, depcruise 0
  violations, full suite 8791 passed / 8 failed = the named budget of
  4 local-corpus SC-004 + 4 spec-079, verified pre-existing).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — starts as soon as the 090 branch state is confirmed
  (T001 may report a blocker instead).
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational. The MVP demonstration.
- **User Story 2 (Phase 4)**: Depends on US1's registry seam (T010). Contains the deletion
  (T016) — T012–T015 must land before T016, and T017–T018 in the same phase so no commit leaves
  the tree with the old oracle testing deleted machinery.
- **User Story 3 (Phase 5)**: Depends on Foundational; independent of US2's deletion, but
  T021's advance-level tests are simplest after T015. Can run parallel to Phase 4 if staffed,
  except T022 which follows the manifest rewiring (T012).
- **Polish (Phase 6)**: T023 depends on T007 + T015; T024 lands with T016's change; T026–T027
  depend on all desired stories.

### User Story Dependencies

- **US1 (P1)**: Foundational only — independently testable via test registry + real StepHost.
- **US2 (P1)**: US1 (registry seam) — independently testable via the live walk + golden walk.
- **US3 (P2)**: Foundational — independently testable via label/skip tests; integrates with
  US2's screens.

### Within Each User Story

- Tests named by the spec's success criteria are written before the wiring they pin
  (T009 before T010's seam is exercised, T017/T018 with — not after — the deletion).
- One commit per phase, pushed as its gates go green (repo cadence in CLAUDE.md).

### Parallel Opportunities

- T003 and T004 (different concerns in registry.ts — coordinate the edit order, or one agent
  takes both).
- T023, T024, T025 in Polish are independent files.
- Phases 4 and 5 can overlap per the dependency notes above.

---

## Implementation Strategy

### MVP First (Foundational + User Story 1)

1. Complete Phase 1: Setup (declarations seeded)
2. Complete Phase 2: Foundational (`deriveScreens` green as pure data)
3. Complete Phase 3: User Story 1 (one-edit test through the real StepHost)
4. **STOP and VALIDATE**: the one-edit demonstration is the spec's reason to exist — show it
   before deleting anything.

### Incremental Delivery

1. Setup + Foundational → derivation exists, nothing consumes it differently yet
2. US1 → placement is provably a one-line edit (MVP)
3. US2 → `stepDependencies.ts` deleted, parity rewritten, wizard visibly unchanged
4. US3 → screens labelled and gated as pages
5. Polish → SC-005 inventory pinned, constitution corrected, review cycle, PR

### Conversation Boundaries

Per the constitution's one-conversation-per-phase rule for multi-phase features, each phase
above is implemented in its own conversation on `km/derived-steps`, in order, without waiting
for the predecessor specs' PRs to merge (stacked branches, owner's ruling).
