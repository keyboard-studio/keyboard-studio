---

description: "Task list for specRef anchors + spec-trace impacted-steps join"
---

# Tasks: specRef anchors + spec-trace impacted-steps join

**Input**: Design documents from `specs/031-specref-trace-join/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md)

**Tests**: INCLUDED — FR-005's completeness check is a first-class vitest gate, not optional.

**Organization**: Tasks are grouped by user story per spec.md (US1–US4).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US4 per spec.md; Setup/Foundational/Polish carry no story label
- All paths are repo-relative

---

## Phase 1: Setup

- [x] T001 Create feature branch `km/specref-trace-join` off `main` (shipped as `km/031-specref-trace-join`, per `gh pr view 1685 --json headRefName`)
- [x] T002 [P] Confirm the field-addition precedent: read `packages/studio/src/steps/types.ts`'s `StepBase` (the existing `flowRefs?: readonly string[]` field is the shape to mirror) and `packages/studio/src/survey/types.ts`'s `QuestionModule` — no drift expected per research R1, confirm before editing

---

## Phase 2: Foundational — type additions (BLOCKS every user story)

**Purpose**: `specRef` must exist on both types before anything can populate or check it.

- [x] T003 [P] Add `specRef?: string | readonly string[]` to `StepBase` in `packages/studio/src/steps/types.ts` (FR-001), matching the vocabulary `§N` / `§Na` / `specs/<slug>` (documented as a comment, not enforced by the type — enforcement is FR-005's runtime check)
- [x] T004 [P] Add `specRef?: string | readonly string[]` to `QuestionModule` in `packages/studio/src/survey/types.ts` (FR-002), same shape, explicitly optional (unlike the manifest requirement in FR-003)

**Checkpoint**: `pnpm --filter @keyboard-studio/studio typecheck` passes with the new optional fields; no existing call site breaks (additive).

---

## Phase 3: User Story 1 - Every manifest step carries a specRef anchor (Priority: P1) 🎯 MVP

**Goal**: Every one of the ~20 manifest step entries carries `specRef`, resolvable against `docs/spec-trace.json`.

**Independent Test**: Read the manifest; confirm every entry has `specRef`; confirm every value resolves in `docs/spec-trace.json`'s `sections`/`specs` keys.

### Implementation for User Story 1

- [x] T005 [US1] Populate `specRef` on every named step constant in `packages/studio/src/steps/registerEditorSteps.ts` (identityStep, chooseBaseStep, trackStep, projectNameStep, carveStep, and the rest) — one `specRef` value per step, citing the governing `§N` section or `specs/<slug>` folder at honest granularity (research R2: define at the point each step is actually declared, not re-stated at manifest-array inclusion)
- [x] T006 [US1] Populate `specRef` on the handful of step literals declared inline in `packages/studio/src/steps/manifest.ts`'s `manifest` array (e.g. the `marks` step) — same citation rule as T005
- [x] T007 [US1] Verify every populated `specRef` value resolves against a real unit id in `docs/spec-trace.json` (`sections` or the `specs/<slug>` directory listing) — fix any citation that doesn't resolve before moving to the completeness test (enforced by the `SC-001` vitest case in `completeness.test.ts`, which runs the real manifest against `docs/spec-trace.json`)

**Checkpoint**: Manifest fully annotated; ready for the completeness check to hold it honest.

---

## Phase 4: User Story 2 - Question modules carry optional specRef anchors (Priority: P1)

**Goal**: A representative sample (≥10) of question modules across Phase A/B/F carry `specRef`.

**Independent Test**: Inspect a sample of question-module registrations; confirm those with `specRef` resolve against `docs/spec-trace.json`.

### Implementation for User Story 2

- [x] T008 [P] [US2] Populate `specRef` on ≥4 representative Phase A question modules in `packages/studio/src/survey/questions/registry.a.ts` (e.g. the `il_*` identity-lite modules, citing `§8` or the governing spec folder) (shipped: `il_language_autonym`, `il_language_code`, `il_language_english`, `il_language_region` — 4)
- [x] T009 [P] [US2] Populate `specRef` on ≥4 representative Phase B question modules in `packages/studio/src/survey/questions/registry.b.ts` (shipped: `pb_indic_conjuncts`, `pb_rtl_direction_confirm`, `pb_text_sample`, `pb_use_case` — 4)
- [x] T010 [P] [US2] Populate `specRef` on ≥2 representative Phase F question modules in `packages/studio/src/survey/questions/registry.f.ts` (shipped: `pf_contact_info`, `pf_doc_language` — 2)

**Checkpoint**: SC-002's ≥10-module sample is met across three registries.

---

## Phase 5: Foundational (cont'd) - Completeness check + artifact (BLOCKS US3/US4)

**Purpose**: US3/US4 (the spec-trace join) read `manifest.specref.json`, which does not exist until this phase lands.

**Wave 1 — independent:**

- [x] T011 [P] Add `checkSpecRef(manifest: readonly Step[], validUnitIds: ReadonlySet<string>): SpecRefViolation[]` to `packages/studio/src/dashboard/completeness.ts` (FR-005), mirroring `checkInputsSatisfiableFromManifest`'s pure-function shape — flags a manifest step with no `specRef` and any `specRef` (step or question-module) that doesn't resolve against `docs/spec-trace.json`
- [x] T012 [P] Add `packages/studio/src/steps/generateManifestSpecRef.ts` — a Node/tsx script producing `packages/studio/src/steps/manifest.specref.json` (`{ [stepId | questionId]: readonly string[] }`) from the manifest + registries (FR-006), invoked as a `pnpm test`-time step per research R6 (not a `pnpm build` plugin) (shipped as a pure builder function called from `generateManifestSpecRef.test.ts` rather than a bare `tsx` script — `manifest.ts` transitively imports Lingui `<Trans>`-macro components that only resolve through Vite's transform pipeline, a constraint discovered during implementation; still `pnpm test`-time, not a build plugin, so R6's intent holds)

**⟶ Wait for Wave 1 to finish, then:**

- [x] T013 Add `completeness.test.ts` cases for `checkSpecRef`: a manifest step missing `specRef` is flagged; a `specRef` pointing to a non-existent unit is flagged; a fully-annotated manifest passes clean
- [x] T014 Wire `generateManifestSpecRef.ts` into the `pnpm test` script chain (package.json) and confirm `manifest.specref.json` is generated and committed (no `package.json` edit was needed — regeneration is a colocated vitest test file (`generateManifestSpecRef.test.ts`) that `pnpm test` already collects automatically; `manifest.specref.json` is committed in PR #1685)

**Checkpoint**: `pnpm --filter @keyboard-studio/studio test` includes and passes the new completeness check; `manifest.specref.json` exists and is current.

---

## Phase 6: User Story 3 - Spec-trace joins drifted units to impacted steps (Priority: P2)

**Goal**: `spec-trace check` includes an "Impacted steps" section in auto-filed issue bodies.

**Independent Test**: Drift a spec unit; run `spec-trace check --dry-run`; confirm the issue body lists impacted steps.

### Implementation for User Story 3

- [x] T015 [US3] Extend `buildDriftIssueBody(d)` in `utilities/spec-trace/index.js` (~line 477, per research R4) to read `manifest.specref.json`, filter entries whose `specRef` array includes the drifted unit id `d.id`, and append an "Impacted steps" line to the returned body array
- [x] T016 [US3] Wrap the JSON read in an `fs.existsSync()` guard matching this file's existing guard style — a missing/stale artifact logs a non-fatal warning and continues (FR-010), never crashes `spec-trace check`
- [ ] T017 [US3] Manually verify: drift a spec unit on a scratch branch, run `spec-trace check --dry-run`, confirm the issue body's "Impacted steps" list is accurate and every id resolves in the manifest/registry; revert the scratch drift (not verifiable retroactively — the PR's own test plan and km-verification's review cover typecheck/test/lint/depcruise and the missing-artifact degradation path, but no evidence of this specific scratch-branch drift-and-dry-run walkthrough was found in the diff, PR body, or commit trailers)

**Checkpoint**: SC-004 — the impact list appears and is actionable.

---

## Phase 7: User Story 4 - Spec-trace report prints coverage summary (Priority: P2)

**Goal**: `spec-trace report` prints a "Steps covered" section per unit.

**Independent Test**: Run `spec-trace report`; confirm it lists step/module coverage per unit, including zero-coverage units.

### Implementation for User Story 4

- [x] T018 [US4] Extend `report()` in `utilities/spec-trace/index.js` (~line 286, per research R5) to compute, for each unit id in `docs/spec-trace.json`, the count of `manifest.specref.json` entries citing it, printed alongside the existing `byStatus` tally
- [x] T019 [US4] Same `fs.existsSync()` guard as T016 — a missing artifact degrades the report to omit the new section rather than crashing

**Checkpoint**: SC-005 — coverage summary prints; zero-impact units are visible for triage.

---

## Phase 8: Polish & Cross-Cutting Validation

- [x] T020 [P] Run the full repeatable gate: `pnpm --filter @keyboard-studio/studio typecheck`, `pnpm --filter @keyboard-studio/studio test`, `pnpm lint` (depcruise — confirm `utilities/spec-trace` still imports no `packages/studio` code, FR-007) (PR #1685's own Test plan checks off all four: typecheck clean, 62/62 tests passing, eslint clean, depcruise confirms zero `packages/studio` imports from `utilities/spec-trace`)
- [x] T021 [P] Confirm CI posture unchanged: `spec-trace check`/`report` still run `continue-on-error: true` in `.github/workflows/ci.yml` (FR-012) — no hard-fail introduced (confirmed current: `.github/workflows/ci.yml`'s "Spec drift check" step still carries `continue-on-error: true`; PR #1685 did not touch this file)
- [x] T022 Update `docs/tooling.md` or the `spec-trace` section of CLAUDE.md if one exists, noting the new `manifest.specref.json` artifact and its generation command

---

## Dependencies & Execution Order

- **Setup (Phase 1)**: no deps.
- **Foundational type additions (Phase 2)**: after Setup. Blocks US1 and US2 (both populate the new field).
- **US1 (Phase 3, P1)** and **US2 (Phase 4, P1)**: both depend only on Phase 2; independent of each other (different files) — safe to run as parallel waves.
- **Foundational completeness+artifact (Phase 5)**: depends on US1+US2 being populated enough to test against (at minimum needs the manifest annotated, T005/T006). Blocks US3 and US4 (both read `manifest.specref.json`).
- **US3 (Phase 6, P2)** and **US4 (Phase 7, P2)**: both depend on Phase 5; independent of each other (different functions in the same file — sequential within `utilities/spec-trace/index.js`, but no cross-story blocking).
- **Polish (Phase 8)**: after the desired stories complete.

## Notes

- `[P]` = different files, no incomplete-task dependency.
- No `Pattern`/`KeyboardIR`/contract change (Constitution Check: all PASS).
- FR-013/FR-014 (no engine/contracts annotation, no gallery-component annotation beyond the manifest entry) are non-goals — do not expand scope during implementation.
