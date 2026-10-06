# Tasks: Decisions Backend (specs/087-decision-backend)

Dependency-ordered, organized by user story. Each phase's work is grouped into waves; a wave is a set of tasks touching different files with no incomplete dependencies between them. `[P]` marks tasks inside an independent wave. Same-file or dependent tasks are never in the same wave.

## Phase 1: Setup

**Wave 1 — prerequisite type change (single task):**
- [x] **T001** Widen `provides` from `DecisionId` to `DecisionId[]` on `QuestionModule` (Q4 consequence); update `gatedByFromNext` clause keying to one clause per provided decision · packages/studio/src/survey/types.ts, packages/studio/src/decisions/orderDecisions.ts

**Checkpoint:** the module contract speaks lists; every downstream annotation assumes multi-provide.

## Phase 2: Foundational

Blocks all stories: the extraction bundle and the real (non-fixture) flow runner.

**Wave 1 — independent (different files):**
- [x] **T002** [P] `ExtractContext` + `buildExtractContext(baseIr, baseKeyboard)` — the Q1 import bundle from the existing `workingCopyStore` slots · packages/studio/src/decisions/extractContext.ts (new)
- [x] **T003** [P] `decisionFlow` runner — extraction over the real bundle (validate through `validate()`, provenance + source attached) then `orderDecisions` + `filterGated`; replaces the fixture-based spike runner · packages/studio/src/decisions/decisionFlow.ts (new)

**⟶ Wait for Wave 1 to finish, then:**
- [x] **T004** Extend `decisionIRPaths` to every identity-lite decision; consistency lint green on the real module set (ordering DAG vs data-flow DAG never diverge) · packages/studio/src/decisions/decisionIRPaths.ts, packages/studio/src/decisions/orderDecisions.test.ts

**Checkpoint:** the bundle exists, the runner is real, the IR relation holds — stories can build on it.

## Phase 3: US1 — Safe decision foundation (P1)

**### Tests** — named-error cases (unresolved / duplicate / cycle) and extract-validation already landed in Phase 1; this phase adds:
- [x] **T010** [P] [US1] Parity test: derived order of the annotated identity-lite set equals `content/flows/identity_lite.modular.yaml` order exactly · packages/studio/src/decisions/orderDecisions.test.ts

**### Implementation**
**Wave 1 — independent (different files):**
- [x] **T011** [P] [US1] Annotate the real identity-lite modules (`questions/a/il_*.ts`) with `provides[]` / `requires` / `extract` per the wiring map · packages/studio/src/survey/questions/a/
- [x] **T012** [P] [US1] `registry.a.ts` registers modules by decision id (first fan-out retirement step) · packages/studio/src/survey/questions/registry.a.ts

**Checkpoint:** the identity-lite flow derives its order from declarations; the parity badge is green on the real set.

## Phase 4: US2 — Real base-keyboard extraction (P1)

**### Tests** — extraction over a real catalog keyboard, no fixtures (FR-006):
- [x] **T020** [P] [US2] Extraction test: import a real catalog keyboard, assert identity/script/inventory decisions pre-fill with `extracted` provenance and source identity · packages/studio/src/decisions/extractContext.test.ts (new)

**### Implementation**
**Wave 1 — independent (different files):**
- [x] **T021** [P] [US2] Wire real extractors: language-code → `catalog.languages[0]`, target-script → `catalog.script`, copyright-holder → `baseIr.header.copyright`, character-inventory → `buildProducedSet(baseIr)`; language identity reads from catalog where the codec leaves the IR empty · packages/studio/src/survey/questions/a/il_*.ts (`extract` fields)
- [x] **T022** [P] [US2] Fold `classifyBaseScript` into target-script extraction provenance (Q2); deprecate the parallel export · packages/studio/src/adaptation/firing.ts, target-script module in packages/studio/src/survey/questions/a/

**Checkpoint:** importing a real base keyboard pre-fills decisions with provenance; one system answers "what did the base decide".

## Phase 5: US3 — Decisions mutate the working keyboard (P2)

**### Tests** — fail-fast on writes violation (FR-007):
- [x] **T030** [US3] Test: a patch touching paths outside declared `writes` is rejected whole-patch; the working copy is untouched · packages/studio/src/steps/mutateApply.test.ts (new)

**### Implementation**
**Wave 1 — single task:**
- [x] **T031** [US3] `mutateApply`: reducer output → declared-`writes` containment check → path-scoped deep merge onto the working copy; wire step completion through it in `FlowStepHost` · packages/studio/src/steps/mutateApply.ts (new), packages/studio/src/survey/FlowStepHost.tsx

**Checkpoint:** answering a question changes the working copy through the contained apply path; violations fail fast.

## Phase 6: US4 — Retire the parallel module systems (P2)

**### Implementation**
**Wave 1 — independent (different files):**
- [x] **T040** [P] [US4] Delete the thin YAML order lists (Q3) — only after each flow's parity test is green · content/flows/*.modular.yaml
- [x] **T041** [P] [US4] `migrateDraft`: versioned old-answer-key → DecisionId table; answers map onto decisions at load, orphans surface visibly, never dropped (Q5) · packages/studio/src/decisions/migrateDraft.ts (new)

**⟶ Wait for Wave 1 to finish, then:**
- [x] **T042** [US4] Manifest spine → derived projection, last (Article IX names it; the constitution is amended to name the registry when this lands) · packages/studio/src/steps/manifest.ts

**Checkpoint:** zero ordering artifacts outside the registry; in-flight drafts migrate automatically.

## Phase 7: US5 — Coverage proof (P3)

**### Implementation**
**Wave 1 — independent (different files):**
- [x] **T050** [P] [US5] Corpus mining harness: run the import pipeline over a catalog sample, record per-decision variance — decisions no keyboard varies become defaults with provenance · packages/studio/src/decisions/corpusMine.ts (new)
- [x] **T051** [P] [US5] Gate→decision mapping: every keyboard-lint submission gate traces to the decision(s) that satisfy it; unmapped gates become the explicit gap list (SC-005) · packages/studio/src/decisions/gateCoverage.ts (new)

**Checkpoint:** the DecisionId vocabulary is corpus-derived; every constraint traces to a decision or sits on the named gap list.

## Phase 8: Polish

**Wave 1 — independent (different files):**
- [x] **T060** [P] Demo page runs on `decisionFlow` instead of the fixture runner · packages/studio/src/decisions/ (demo, `?demo=decisions`)
- [x] **T061** [P] FR-009 regression: the management UI never renders in a production build (still `import.meta.env.DEV`-gated) · packages/studio/src/decisions/ (demo test)
- [x] **T062** Success-criteria validation: SC-001 (≥80% pre-fill on 5 real keyboards), SC-002 (fault-injection suite), SC-003 (zero artifacts + parity), SC-004 (corpus sample compiles through the unified flow) · specs/087-decision-backend/
- [x] **T063** [P] PR #1938 description refresh: spike framing → the real unification scope · (PR body, via gh)

**Checkpoint:** the streamlining is complete, measured, and PRed.

## Phase 9 — Full retirement (post-review)

Work that landed after the original 21 tasks, closing the residual ordering artifacts and the review findings.

- [x] **T070** Fold base-script posture into target-script extraction; `classifyBaseScript` deleted, single classifier `extractBaseScriptPosture` · packages/studio/src/survey/questions/a/il_target_script.ts (d31bfaaa)
- [x] **T071** Derive track + project_name order; derived-flow machinery generalized (`FlowSource.phase`, recipe in the `steps/flowSources.ts` header) (abcdfc97)
- [x] **T072** Derive phase B, F and proposed phase A order; all `content/flows/*.modular.yaml` deleted (45a2c8f5)
- [x] **T073** Single registry: `flowModules` becomes `questionRegistry` + `decisionIndex` in `survey/questions/registry.ts`; per-phase `registry.{a,b,f,g,reserve}.ts` and the thin-YAML loader (`survey/loadDerivedFlow.ts`) deleted; `gatedByFromNext` rewritten as graph visibility (merge-point bug fixed); `gateWalkParity` test added (7af9f942)
- [x] **T074** DecisionsDemo uses design tokens instead of raw hex (58db4c41)
- [x] **T075** Wizard step order derived: `steps/stepDependencies.ts`, `steps/stepOrder.ts`, generic `orderByDependencies`; `spine` / `joinTarget` flags deleted; constitution Article IX rewritten; 14 unconstrained step pairs frozen in `stepOrder.parity.test.ts` (ac12b6d0)
- [x] **T076** Renumber the spec folder 085 to 087 (96df49cc)
- [x] **T077** Gate derivation per-condition fail-open and cycle-safe reachability; `QuestionModule.gatedBy` deleted; step gates single-sourced (`advance.ts` and `lib/resolveLocation.ts` call the step `gatedBy`) (503eb3f3)
- [x] **T078** Real gate-to-gated `requires` edges (phase F 15, phase B 24); exhaustive `decisionIRConsistency` (7 mismatches fixed); stale references cleaned (cb0f6237)

**Checkpoint:** no YAML order lists, per-phase registries, spine flags or module-level `gatedBy` remain. Residual: adjacent pairs with no dependency between them are ordered by declaration order (see followups.md item 4).

## Dependencies & Execution Order

- **Phase 1 (Setup)** → **Phase 2 (Foundational)** → Phases 3–7 (stories, in priority order; US1 before US2 before US3 before US4 before US5 — each builds on the last) → **Phase 8 (Polish)**.
- Phase 2 Wave 2 joins on Wave 1 (the IR-path lint needs the bundle types).
- Phase 6 Wave 2 joins on Wave 1 (the manifest retires last, after YAML deletion and draft migration are in).
- T021 (extractors) and T022 (adaptation fold) are independent of each other but both feed T020's real-keyboard test.
- US5 (Phase 7) can start once Phase 2 is done, but its vocabulary feeds back into the registry — schedule it after US4's deletion waves to avoid moving targets.

## Parallel Opportunities

- Phase 2: T002 and T003 are different new files — parallel-safe.
- Phase 3: T010 (parity test) and T011 (annotations) / T012 (registry) are different files — parallel-safe.
- Phase 4: T020 (test), T021 (extractors), T022 (adaptation fold) — parallel-safe.
- Phase 6: T040 (YAML deletion) and T041 (draft migration) — parallel-safe.
- Phase 7: T050 (mining) and T051 (gate mapping) — parallel-safe.
- Phase 8: T060, T061, T063 — parallel-safe; T062 joins on everything.
