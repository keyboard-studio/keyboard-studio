# Tasks: Question decisions write only through `apply` (specs/089-decision-apply)

Dependency-ordered, organized by user story. Each phase's work is grouped into waves; a wave is a set of tasks touching different files with no incomplete dependencies between them. `[P]` marks tasks inside an independent wave. Same-file or dependent tasks are never in the same wave. Design references: [plan.md](plan.md), [research.md](research.md) (R1–R9), [data-model.md](data-model.md), [contracts/apply-contract.md](contracts/apply-contract.md).

**Hard ordering rule for the whole list:** T003 (baseline capture) lands before the first product-code task. The baseline is the SC-001 oracle; capturing it after changing the write path makes the criterion circular (research R8/R9).

## Phase 1: Setup

**Wave 1 — independent (different files):**
- [x] T001 Verify the 088 dependency at restack: read the landed `decisionStore` API (action names, record shape against 088 FR-001) in packages/studio/src/stores/decisionStore.ts and record any delta from [data-model.md](data-model.md)'s assumptions as an amendment note in specs/089-decision-apply/plan.md — stop and surface, do not adapt the design silently, if the landed shape differs
- [x] T002 [P] Golden-walk script (SC-001, reused by 090–093): scripted Playwright walk — copy track from `basic_kbdfr`, fixed answers, through identity, choose_base, track, project_name, characters (fixed `pb_standard_letters` answer), the default middle steps, and help, then source-zip download and byte comparison; `GOLDEN_WALK_CAPTURE=1` capture mode; capture environment pinned to `VITE_KM_MUTATE_SEAM=1` with the R9 rationale in the file header; any zip entry found to embed a timestamp/version stamp is listed in the header with its evidence · packages/studio/e2e/golden-walk.spec.ts (new), packages/studio/e2e/helpers/surveyFlow.ts (reuse, extend only if a step is not yet drivable)

**⟶ Wait for Wave 1, then:**
- [ ] T003 Capture the baseline on the pre-089 stacked base — **CAPTURE PENDING (environment block, 2026-10-06)**: the script and baseline record (`packages/studio/e2e/fixtures/golden-walk/README.md`) are committed; the capture was attempted on the merged stacked base (`25d4e075`) but the implementation sandbox's Chromium refuses every localhost navigation with `net::ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS` (the same block recorded in spec 088's T019 evidence). The capture + determinism re-run + literal-`main` capture/diff run wherever a browser permits localhost, via the one command in the baseline record. No baseline zip is committed yet, and the verify mode fails loudly on its absence (088 as landed, no 089 product code; baseline identity RULED — owner ruling 2026-10-06, km-lead proposals Q3, OI-2): run T002's capture, commit script + baseline together, and confirm a second capture run is byte-identical to the first (determinism check). Proof step under the same ruling: ALSO capture the baseline on literal `main`, diff the two zips, and record the result in the baseline record committed with the baseline — if the diff is empty, the baseline-identity question is permanently closed; if it is non-empty, the stacked-base capture still stands (it is the ruling) and the differing surface must be named in the record · packages/studio/e2e/fixtures/golden-walk/basic-kbdfr-copy.zip (new)

**Checkpoint:** the series oracle exists and is deterministic; 088's store API is confirmed against the plan.

## Phase 2: Foundational

Blocks all stories: the `apply` contract types, the runner, and the FR-005 selectors.

**Wave 1 — independent (different files):**
- [x] T004 [P] Contract types: add `ApplyContext` and `WorkingCopyPatch` and the optional `apply` member to `QuestionModule`; mark `mutate`/`MutateContext` as superseded in their doc comments (deletion is T020, after the last consumer migrates) · packages/studio/src/survey/types.ts
- [x] T005 [P] FR-005 selectors as pure functions over `DecisionSet` — `deriveIdentityResult`, `deriveScaffoldSpec` (null unless `authoring-track === "copy"`), `deriveSurveyContext`, `deriveIdentityResume` — reusing `extractIdentityLite`'s derivation helpers (`buildTargetBcp47`, `normalizeRegionSubtag`, `deriveScriptPrefill`) and `contextFromIdentity`'s exact output shape; thin zustand bindings over `decisionStore` beside them · packages/studio/src/decisions/identitySelectors.ts (new)

**⟶ Wait for Wave 1, then:**
- [x] T006 Selector unit tests: identity derivation from decision values (incl. holder-falls-back-to-author, unsupported-script, region normalization), scaffold-spec gating on the track decision, survey-context optionals (`bcp47_tag`, `author_contact`), resume reconstruction · packages/studio/src/decisions/identitySelectors.test.ts (new)
- [x] T007 [P] The runner: rename `routeAnswersThroughMutate` → `applyDecisionEffects` in the reducer, unconditional for modules declaring `apply`; delete the `MutateRequest`/`isMutateRequest` branch from `applyStepCompletion`; implement the channel rules (authorization table + `ApplyChannelError`, `ir` containment first, no partial patch); add `applyWorkingCopyPatch`, `getDecisions`, `getHistoryEntryState` to `ReducerDeps` and wire them where the deps are built · packages/studio/src/steps/reducer.ts, packages/studio/src/components/StepHost.tsx, packages/studio/src/StudioShell.tsx
- [x] T008 [P] `pb_standard_letters`: the existing `mutate` body becomes `apply` returning `{ ir: … }`, byte-for-byte the same patch computation (idempotent `kmStandardLetters` rebuild) · packages/studio/src/survey/questions/b/pb_standard_letters.ts

**⟶ Wait for T007 + T008, then:**
- [x] T009 Runner tests (SC-003 evidence): a test module whose `apply` returns an `ir` leaf outside its `writes` is rejected with `MutatePatchContainmentError` and the working copy is untouched (no overlay channel of the same patch applied); an unauthorized overlay channel is rejected with `ApplyChannelError`; an empty patch is a no-op; with no working IR, overlay channels still apply and the `ir` channel is skipped · packages/studio/src/steps/applyDecisionEffects.test.ts (new), packages/studio/tests/survey/questions/b/pb_standard_letters.test.ts (retarget from `mutate` to `apply`)

**Checkpoint:** the runner executes `apply` unconditionally through containment; the one previously-live module writes through it with the flag off; selectors exist and are unit-proven. The old `onCommit`s still exist — US1 deletes them flow by flow against the golden walk.

## Phase 3: US1 — One write path for question decisions (P1)

**Independent Test:** with every per-flow `onCommit` deleted, the golden walk (T002) produces a source zip byte-identical to the T003 baseline, and the live walk through identity, project_name and help produces the same keyboard source as the stacked base.

**### Tests**
- [x] T010 [P] [US1] Update the adapter/factory expectations that pinned the old write sites (adapter write order, factory `onCommit` firing) to the new contract — effects asserted at the runner/host boundary, not in adapters · packages/studio/src/editors/adapters/panelAdapters.test.tsx, packages/studio/tests/steps/makeFlowStepComponent.test.tsx

**### Implementation**

**Wave 1 — the four composed/empty `apply`s (different files, all depend on Phase 2):**
- [x] T011 [P] [US1] Attribution composition as `apply` on `il_copyright_holder`: reproduce `extractAttribution`'s rule over `ctx.decisions` (author-name/author-email/copyright-holder; holder defaults to author name; `null` when no author name) returning `{ attribution }` · packages/studio/src/survey/questions/a/il_copyright_holder.ts
- [x] T012 [P] [US1] Empty `apply: () => ({})` on `track_choice`, with the spec edge case in its doc comment (working-copy setup is 092's; the adapt-track scaffold consequence is the R6 selector's, not a write) · packages/studio/src/survey/questions/g/track_choice.ts
- [x] T013 [P] [US1] Identity-patch composition as `apply` on `project_keyboard_id`: `{ identity: { keyboardId, displayName, ...identityLanguagePatch(deriveIdentityResult(ctx.decisions)) } }` — the exact composition `projectNameOptions.onCommit` performs today (spec 059) · packages/studio/src/survey/questions/g/project_keyboard_id.ts
- [x] T014 [P] [US1] Help composition: add a `DecisionSet`-shaped composition of the `help-*` decisions into `HelpDocsAnswers` (the `extractHelpDocs` rules, incl. blank `pf_welcome_paragraph` ⇒ no patch and the `pf_project_url` two-line split), and `apply` on `pf_welcome_paragraph` returning `{ helpDocs, historyEntryState? }` — the history channel only when a `help-history-entry` decision exists, via `applyHistoryEntryAction` against `ctx.currentHistoryEntryState` · packages/studio/src/decisions/helpDocsFromDecisions.ts (new), packages/studio/src/survey/questions/f/pf_welcome_paragraph.ts

**⟶ Wait for Wave 1, then (deletions, in this order):**
- [x] T015 [US1] Delete the three `onCommit`s and their deps plumbing: remove `trackOptions.onCommit`, `projectNameOptions.onCommit`, `phaseFOptions.onCommit` and the now-unused `extractHelpDocs` (its composition lives in T014); remove `onCommit` from `FlowStepOptions` and the completion wrapper (the pure `extract` guard stays, research R5); shrink `FlowStepDeps` (drop `setSelectedTrack`, `setScaffoldSpec`, `setIdentity`, `setHelpDocs`, `setHistoryEntryState`, `identityResult`, `scaffoldSpec`) and re-point the FR-031 seed readers at selector values · packages/studio/src/editors/adapters/flowStepOptions.tsx, packages/studio/src/editors/adapters/makeFlowStepComponent.tsx
- [x] T016 [US1] `IdentityLiteAdapter` writes nothing: `handleComplete` forwards the result only (drop `setIdentityResult`/`setSurveyContext`/`setAttribution`/`setIdentityPhaseResult` and `contextFromIdentity`); the adapter reads its `context` prop and `BaseResolutionAdapter`'s suggest target from the identity selectors; identity `resume` comes from `deriveIdentityResume` · packages/studio/src/editors/adapters/panelAdapters.tsx

**⟶ Wait for T015 + T016, then:**
- [x] T017 [US1] Delete the stored session state (FR-005): remove `identityResult`, `identityPhaseResult`, `scaffoldSpec`, and the stored `surveyContext` plus `setIdentityResult`/`setIdentityPhaseResult`/`setScaffoldSpec`/`setSurveyContext` from the session store, and migrate every remaining reader to the T005 selectors — draft envelope traversal slice, project label, scaffold/compile-id in the artifact hook, advance inputs in the host, the instantiation seed in `confirmRebase` (reads the selector; its seed role is unchanged), and the step components that read `surveyContext` · packages/studio/src/stores/surveySessionStore.ts, packages/studio/src/lib/draftPersistence.ts, packages/studio/src/lib/projectLabel.ts, packages/studio/src/lib/confirmRebase.ts, packages/studio/src/hooks/useKeyboardArtifact.ts, packages/studio/src/components/StepHost.tsx, packages/studio/src/StudioShell.tsx, packages/studio/src/survey/CharactersStep.tsx
- [x] T018 [US1] Resume round-trip proof: a draft saved after identity, reloaded, resumes the identity step at its recorded position with every answer restored from decisions (drives the real `IdentityLite` resume path, not a harness) · packages/studio/src/editors/adapters/panelAdapters.test.tsx, packages/studio/src/decisions/identitySelectors.test.ts
- [x] T019 [US1] US1 gate: run the golden walk in verify mode (byte-identical or the phase stops); update the store-level golden-walk fixtures **only** where the mutation sequence changed by design (session setters → decision recording + `apply` effects), each fixture diff justified in the commit message · packages/studio/tests/steps/stepHost.goldenWalk.test.tsx, packages/studio/tests/steps/__fixtures__/goldenWalk/

**Checkpoint:** zero `onCommit` definitions remain for the identity, track, project_name and help flows; `IdentityLiteAdapter` writes to no store; FR-005's fields and setters are gone; the golden walk is byte-identical.

## Phase 4: US2 — The flag is gone (P1)

**Independent Test:** `VITE_KM_MUTATE_SEAM` and `flags/mutateFlag.ts` no longer exist, and `pb_standard_letters` writes through `apply` unconditionally (already true since T008/T009 — this phase removes the flag itself and its remaining readers).

- [ ] T020 [US2] Retire `mutate` from the module contract: `decisions/impact.ts`'s counterfactual re-derivation reads the module's `apply` (`ir` channel) instead of `mod.mutate`; then delete the `mutate` field and `MutateContext` from the module types and refresh the module-shape snapshot · packages/studio/src/decisions/impact.ts, packages/studio/src/survey/types.ts, packages/studio/src/survey/questions/__snapshots__/questionModules.test.ts.snap
- [ ] T021 [US2] (OI-1 RULED global — owner ruling 2026-10-06, km-lead proposals Q2; unblocked, proceeds as written) Delete the flag: remove `flags/mutateFlag.ts` and un-gate the four non-question readers (mechanisms → `repropagate` in the reducer, hand-set promotion in the touch gallery, carve seam path and add-gallery derivation in the VFS projection) so each runs unconditionally · packages/studio/src/flags/mutateFlag.ts (delete), packages/studio/src/steps/reducer.ts, packages/studio/src/editors/assignLoop/TouchGallery.tsx, packages/studio/src/lib/projectWorkingCopyVfs.ts
- [ ] T022 [US2] Retire the flag-shaped tests per the OI-1 ruling (global — owner ruling 2026-10-06, km-lead proposals Q2): the flag-parity suites become single-path suites (their byte-parity assertions survive as plain output assertions), and every `vi.stubEnv("VITE_KM_MUTATE_SEAM", …)` is removed · packages/studio/src/lib/projectWorkingCopyVfs.flagParity.test.ts, packages/studio/src/lib/serializeWorkingCopy.flagParity.test.ts, packages/studio/src/steps/reducer.test.ts, packages/studio/src/decisions/successCriteria.sc004.test.ts, packages/studio/src/decisions/successCriteria.sc004.kmp.test.ts, packages/studio/src/decisions/impact.test.ts, packages/studio/src/stores/workingCopyStore.test.ts
- [ ] T023 [US2] US2 gate (SC-002): zero references to `VITE_KM_MUTATE_SEAM` in source and tests, `flags/mutateFlag.ts` absent, golden walk still byte-identical in verify mode · packages/studio/e2e/golden-walk.spec.ts (verify run), packages/studio/src/flags/

**Checkpoint:** one write path, no flagged second one. OI-1 was ruled GLOBAL (owner ruling 2026-10-06, km-lead proposals Q2), so T021/T022 complete FR-003 in full — no partial state to record. (The runner-only alternative, under which they would have closed as explicitly partial with FR-003 unmet for the non-question sites, was rejected under the ruling; see plan.md OI-1.)

## Phase 5: Polish & Cross-Cutting

- [ ] T024 [P] Full gates on the final tree: studio typecheck, the full studio vitest suite (per package config — never bare vitest at root), `pnpm lint` (ESLint + depcruise + checkers), and the golden walk in verify mode · packages/studio/, repo root configs
- [x] T025 [P] Series hand-off record: what 090 inherits (the runner + channel table as the gallery seam, the golden-walk script and baseline, the OI-1 global un-gating as landed (no remainder), the `onMount` history derivation still writing directly) · specs/089-decision-apply/followups.md (new)
- [ ] T026 Open the PR against `km/modular-decisions` (the stacked base, not `main`): body reconciles SC-001 (baseline commit + verify result), SC-002 (grep evidence), SC-003 (T009), and states the OI-1/OI-2 rulings as given; spec status in specs/089-decision-apply/spec.md updated to match what actually shipped · specs/089-decision-apply/spec.md (PR via gh)

**Checkpoint:** the spec is implemented, measured in the live app, and PRed against its stacked base.

## Dependencies & Execution Order

- **Phase 1** → **Phase 2** → **Phase 3 (US1)** → **Phase 4 (US2)** → **Phase 5 (Polish)**.
- T003 joins on T002 and gates everything: no product code before the baseline exists.
- Phase 2 Wave 1 (T004 types, T005 selectors) is parallel-safe — different files, no shared dependency beyond T001. T006 joins on T005. T007 and T008 are parallel-safe (different files) and both join on T004; T009 joins on both.
- Phase 3 Wave 1 (T011–T014) is parallel-safe — four different module files. T015 joins on T013+T014 (it deletes the code they replace); T016 joins on T005/T011 (the selectors and the attribution apply must exist before the adapter stops writing); T017 joins on T015+T016 (readers migrate only once the writers are gone); T018 joins on T017; T019 joins on the whole phase.
- T020 joins on US1 (impact is the last `mutate` consumer). T021 joins on T020 (its former second join, the OI-1 ruling, was given 2026-10-06 — global, km-lead proposals Q2 — and no longer gates); T022 joins on T021; T023 joins on T022.
- MVP scope: Phase 1 + Phase 2 + US1 — one write path for question decisions, flag still present but unread by the question path. US2 completes the spec.

## Parallel Opportunities

- Phase 1: T001 (verification note) and T002 (walk script) — different files, parallel-safe; T003 is their join and the phase gate.
- Phase 2: T004 ∥ T005; then T007 ∥ T008.
- Phase 3: T010 (tests) ∥ Wave 1 (T011–T014, themselves parallel across four module files).
- Phase 5: T024 (gates) ∥ T025 (follow-ups doc); T026 joins on both.
