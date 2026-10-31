---
description: "Task list for spec 107: headless scripted author for decision walks"
---

# Tasks: Headless scripted author for decision walks

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: this feature *is* test tooling, and the spec's acceptance scenarios and SCs are test
assertions, so test tasks are included throughout.

**Paths**: `HA/` below means `packages/studio/src/test/headlessAuthor/`. All other paths are from the
repo root.

**Commit cadence** (CLAUDE.md): one commit per phase, pushed to `107-headless-scripted-author` when the
phase's gates are green, message naming the tasks it closes (`spec 107 T0NN-T0NN`).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: the user story the task serves (US1-US6)

---

## Phase 1: Setup

**Purpose**: the folder, the types and the PR-set skeleton.

- [X] T001 Create `packages/studio/src/test/headlessAuthor/` with an `index.ts`-free layout per plan.md (no barrel; test files import modules directly) and a short header comment in `HA/runAuthorCase.ts` stating the governing rule: test-only; it bypasses the UI and nothing else; its own code is only case input, the walk-policy choice, the `zzq` typing and reporting; anything it cannot reach is lifted (FR-040) or listed Playwright-only (FR-042), never re-stated (FR-013)
- [X] T002 [P] Define `Case`, `Override`, `PrSetEntry`, `Shape`, `PolicyStep`, `RunReport`, `AuthorRun`, `ParityAllowEntry`, `SweepSummary` in `HA/caseTypes.ts` exactly as [data-model.md](data-model.md)
- [X] T003 [P] Create `HA/prSet.json` with the six FR-031 entries (`basic_kbdus`, `basic_kbdfr` Ewondo, `bj_cree_woods`, `sil_cameroon_qwerty`, `sil_cameroon_azerty`, `chechen_latin`), each with `shape`, `reason` and, for regression guards, `guards`. The four harness keyboards reference their case by `caseId` in the canonical `HA/cases/harness-cases.json` (T076): `p1-whole-bafut-kbdus`, `p1-whole-ewondo-kbdfr`, `p4-unwrap-bafut-camqwerty`, `p4-unwrap-ewondo-camazerty`. `bj_cree_woods` (`cr`, `Cans`) and `chechen_latin` (`ce-Latn`, `Latn`) carry an inline whole-alphabet case with sample text from the keyboard's own `welcome.htm`/README
- [X] T076 [P] Commit the canonical harness case definitions (FR-035): write `git show origin/km/2302-walk-zips:tools/testing-profiles-2302/harness/cases.json` byte for byte to `HA/cases/harness-cases.json`, and `HA/cases/PROVENANCE.md` naming the source branch `km/2302-walk-zips`, commit `a4bd8591be30360e06ec4c6b88812f5376d84548` (the last commit touching that file), the source path, the copy date, the rule that this copy is canonical (the PR set and the scheduled run read it; case changes are made here), and the follow-up for the harness owner to read from or sync from it. Do not edit `km/2302-walk-zips`. (ID appended so existing IDs stay stable.)
- [X] T004 Confirm `packages/studio/vitest.corpus.config.ts` discovers `HA/*.corpus.test.ts` and the default `packages/studio/vitest.config.ts` discovers `HA/driftGuard.test.ts` and excludes the corpus files; adjust only the `include`/`exclude` globs if not

**Checkpoint**: `pnpm --filter @keyboard-studio/studio typecheck` green.

---

## Phase 2: Foundational (blocks every story)

**Purpose**: load, decide, walk, hand off. Every step driver is still a stub returning "use the
default" at the end of this phase.

**Non-divergence first.** T078 and T079 land before any other `HA/` source in this phase, so the
boundary holds from the first line of author code (FR-013 to FR-016).

- [X] T078 [P] Add the depcruise rule `product-not-to-headless-author` to `.dependency-cruiser.cjs`: `from` any `packages/*/src` path not under `src/test/`, `to` `packages/studio/src/test/headlessAuthor/`, severity `error` (FR-016); confirm `pnpm lint` runs it. (ID appended so existing IDs stay stable.)
- [X] T079 [P] Implement `HA/boundary.test.ts` (default vitest config, so it runs in the ordinary unit-test step on every PR regardless of the `headless-author` job's path gate) per FR-014/FR-016: scan every `HA/**/*.ts` source; fail on (a) an import of studio source outside `src/test/`, `@keyboard-studio/engine` or `@keyboard-studio/contracts` that is not in `HA/driftGuard.ts`'s inventory with a production caller (spec 106 replay modules in `src/test/` allowed by name); (b) `vi.mock`/`vi.doMock`/`vi.spyOn`/`vi.stubGlobal`; (c) `setState(` or assignment through `getState()`, except the single per-case reset function allow-listed by file and name; (d) an inventory entry that no `HA/` driver imports (two-sided inventory: a proposal pasted in place of its import fails even when verbatim); and scan `packages/*/src` outside `src/test/` for `KS_AUTHOR` or an import of `headlessAuthor`. Each failure names the file, line and the rule (FR-013) it breaks. Starts with an empty inventory; T040 and T066 grow it. (ID appended so existing IDs stay stable.)

- [X] T005 [P] Implement `loadCases(path = HA/cases/harness-cases.json)` and `loadPrSet()` in `HA/loadCases.ts`: accept the harness shape unchanged (including `profile`, `lang`, `overwriteChar`/`overwriteKey`) plus optional `group`/`track`/`script`, reject unknown fields, look up `group` from the corpus when absent; `loadPrSet()` resolves each `caseId` against the canonical file and fails on an unknown id or an entry with both `caseId` and `case`
- [X] T006 [P] Unit-test `HA/loadCases.ts` in `HA/loadCases.test.ts` against a 3-row fixture in the harness shape and a malformed row
- [X] T007 [P] Implement the walk policy in `HA/walkPolicy.ts`: `override` > `top-suggestion` > `default` > `placeholder`, returning a `PolicyStep`; no proposal logic of its own (it receives the product's suggestions and default as arguments). It returns which offered option to take; it never builds a decision value (except the placeholder) and never writes one. The driver applies the choice through the function the UI control's handler calls (FR-015)
- [X] T008 [P] Implement `placeholderFor(char, startIr)` in `HA/placeholder.ts`: `zzq` + lowercase hex code points, indicator `j`; detect a clash with an existing sequence in the copied keyboard and return a `placeholder-clash` failure
- [X] T009 [P] Unit-test `HA/walkPolicy.ts` and `HA/placeholder.ts` in `HA/walkPolicy.test.ts` (precedence order, placeholder text for a multi-code-point character, clash)
- [X] T010 [P] Implement `RunReport` accumulation in `HA/runReport.ts` (placeholders, displacements, skipped steps, known gaps, `fallbackPolicy`, `timingMs`) and the ASCII console line format from [contracts/case-and-report.md](contracts/case-and-report.md)
- [X] T011 [P] Implement `eligibility(base, slice)` in `HA/eligibility.ts` per research R6 (amended 2026-10-30, option A): present under the corpus root; the codec parses it without error per `docs/import-corpus.json` (round-trip divergence and the I1 heuristic do not exclude); not routed to the CJK/Ethiopic stub by the product's three-group routing; inside the slice. No try/catch around `parse()` or the scaffold. **Amended 2026-10-31 (owner ruling)**: in the sweep tiers only (`latin`, `eligible`), a keyboard with more than `MAX_SWEEP_RULE_COUNT` (2,000) rules is skipped as `too-large` (`ruleCountOf` dep, `sizeCap` option); explicit harness, PR-set and `KS_AUTHOR_CASE` runs are never capped (research R6)
- [X] T012 [P] Unit-test `HA/eligibility.ts` in `HA/eligibility.test.ts` with one id per skip reason
- [X] T013 Implement the routing loop in `HA/runAuthorCase.ts`: instantiate the working copy for the case's copied keyboard and track exactly as `buildDecisionPointFixture` does (`packages/studio/src/test/decisionPointFixture.ts:171`), then visit steps in the order the product's routing yields (`advance`, `packages/studio/src/steps/advance.ts:200`; `applyDecisionEffects`, `steps/reducer.ts:460`; `resolveNext`/`advanceThrough`, `survey/SurveyRunner.tsx:98`/`:201`, as `test/journey-runner.ts` drives them), dispatching each step to a driver in `HA/stepDrivers/`; no hard-coded step list (FR-002)
- [X] T014 Implement the replay hand-off in `HA/runAuthorCase.ts`: after the last step call `rebuildWorkingCopyFromStores` (`decisions/rebuildWorkingCopy.ts:319`), `buildOutputBundle` (`lib/buildOutputBundle.ts:80`), compile, and `checkConsistencyGates` (`test/consistencyGates.ts:336`) through the same code path `decisionPointFixture.ts` uses, extracting a shared helper inside `packages/studio/src/test/decisionPointFixture.ts` if needed rather than copying it (FR-005); reset every studio store before and after the case (contract guarantee 4)
- [X] T015 Implement `HA/recordWriter.ts`: produce the 053 decision record through the UI's recording path (the store's record, not a hand-built JSON) and assert it passes `parseDecisionRecord` (`packages/engine/src/decision-audit/record.ts:251`) and folds with `recordToDecisionSet` (`test/recordToDecisionSet.ts:69`)
- [X] T016 Create one stub driver per step in `HA/stepDrivers/` (`identity.ts`, `windowsLayout.ts`, `track.ts`, `inventory.ts`, `marks.ts`, `outputForm.ts`, `tolerance.ts`, `convenience.ts`, `carve.ts`, `mechanism.ts`, `displacement.ts`, `caps.ts`, `touchSeed.ts`) that takes the step's store default via the step's own store action
- [X] T017 Smoke test in `HA/authorCase.corpus.test.ts`: `basic_kbdus` walks every step with stub drivers, replay compiles to `.kmx` and `.js`, gates are reported per gate

**Checkpoint**: the loop walks a real keyboard end to end with defaults only.

---

## Phase 3: User Story 1 - One case, headless, from a case description (P1) MVP

**Goal**: `p1-whole-bafut-kbdus` runs headless with the full walk policy and is deterministic.

**Independent Test**: `KS_AUTHOR_CASE=p1-whole-bafut-kbdus npx vitest run --config vitest.corpus.config.ts src/test/headlessAuthor/authorCase` (quickstart 1).

### Lifts US1 cannot walk without (FR-040; labelled US1, audited in Phase 8)

Each lift: move the rule to an exported pure function next to its component, make the component call
it, add a unit test for the function, and leave the component's existing tests unchanged (FR-041).

- [X] T018 [P] [US1] Lift carve "marked until Continue" (`isMarkedRow` :909, `applySuggestion` :941, `handleSkip` :1214 in `packages/studio/src/editors/carve/CarveGalleryV2.tsx`) into `continueCarve`/`skipCarve` in `packages/studio/src/survey/carve/carveContinue.ts`, keeping the provenance rule of `packages/studio/src/editors/adapters/carveAdapter.tsx:45`; unit test in `packages/studio/src/survey/carve/carveContinue.test.ts`
- [X] T019 [P] [US1] Lift the mechanism chip order and spec 106 pre-selection (`orderedVisibleSuggestions`, `packages/studio/src/editors/assignLoop/MechanismGallery.tsx:2551`) into `orderVisibleSuggestions` in `packages/studio/src/editors/assignLoop/suggestionOrder.ts`; unit test beside it
- [X] T020 [P] [US1] Move `resolveS02DeadkeyIdentity` (`MechanismGallery.tsx:530`) into `packages/studio/src/editors/assignLoop/deadkeyPurpose.ts` beside `proposeS02TriggerKey`, re-exported from its old location only if a test imports it there; unit test in `deadkeyPurpose.test.ts`
- [X] T021 [P] [US1] Lift the displacement banner action order (confirm move, else keep both, else leave) from `packages/studio/src/editors/assignLoop/DisplacementProposalBanner.tsx` and `MechanismGallery.tsx` into `displacementActions` in `packages/studio/src/survey/slotOccupancy.ts`; unit test in `slotOccupancy.test.ts`
- [X] T022 [P] [US1] Lift case-pair companion acceptance out of the `useCasePairCompanion` hook (`packages/studio/src/editors/assignLoop/casePairCompanion.ts:206`) into a pure `acceptCasePairCompanion` in the same file, the hook calling it; unit test in `casePairCompanion.test.ts`
- [X] T023 [P] [US1] Lift marks-series assembly from station answers (`packages/studio/src/survey/marks/MarksSeriesStep.tsx`, `OutputFormStation.tsx`) into `assembleMarksSeries` in `packages/studio/src/survey/marks/marksSeriesValue.ts`; unit test beside it
- [X] T024 [P] [US1] Lift the text-sample proposal and confirm from `packages/studio/src/survey/MarksTextSamplePrompt.tsx` into `proposeTextSample`/`confirmTextSample` in `packages/studio/src/survey/marksTextSample.ts`; unit test beside it
- [X] T025 [US1] Run the existing tests of every touched component (`npx vitest run src/editors/carve src/editors/assignLoop src/survey/marks src/survey/MarksTextSamplePrompt`) unchanged and green; record the command and result in the phase commit message

### Step drivers (each calls only the functions research R2 lists for its step)

Every driver is glue only: read what the product offers, let the walk policy pick, apply the pick
through the UI handler's function (FR-015). A driver that needs an `if` the UI does not have is
reporting a missing lift. Stop and lift (FR-040) or list it (FR-042); never write the branch
(FR-017).

- [X] T026 [P] [US1] Identity driver in `HA/stepDrivers/identity.ts`: `defaultsFor` (`lib/langtagsDefaults.ts:130`), `deriveScriptPrefill` (`lib/scriptAxes.ts:110`); case fields are overrides
- [X] T027 [P] [US1] Windows-layout and track drivers in `HA/stepDrivers/windowsLayout.ts` and `HA/stepDrivers/track.ts`: `proposeWindowsLayout` (`lib/windowsLayouts.ts:134`); `proposeTrack` (`lib/proposeTrack.ts:78`) recorded for comparison when the case names the track
- [X] T028 [P] [US1] Inventory driver in `HA/stepDrivers/inventory.ts`: the build-list path through `survey/charactersStepRules.ts` and `proposeTextSampleInventory`/`confirmTextSample` (`survey/marksTextSample.ts`), with exemplars from `survey/sourcedExemplarsLookup.ts` over the pinned data; `derivePlacementInventory`/`deriveTreatmentFilteredChars` (`lib/placementInventory.ts:79`/`:189`); a proposal needing the network fails with `network-required` **As built**: `characters` drives the build-list path the IntroChooser pre-selects (the record shows sldr+text provenance), not the manual flow; the case's `sampleText` goes through `proposeTextSampleInventory`/`confirmTextSample`. `suggestMissingChars` has no production caller, so it cannot be inventoried (FR-014); `derivePlacementInventory` is driven by the mechanism driver. Lifts: `survey/charactersStepRules.ts`, `survey/punctuation/punctuationStepRules.ts`, `survey/invisibles/invisiblesStepRules.ts`, `survey/sourcedExemplarsLookup.ts`.
- [X] T029 [P] [US1] Marks and output-form drivers in `HA/stepDrivers/marks.ts` and `HA/stepDrivers/outputForm.ts`: `proposeAttachments`, `computeMarkTreatmentPrefills`, `resolveOutputFormProposal`, `resolveBackspaceProposal` (engine `marks/`), assembled with T023's `assembleMarksSeries` and T024's text-sample functions; the case's `inputOrder`/`outputForm`/`backspace`/`backspaceOnDiagonal` are overrides
- [X] T030 [P] [US1] Tolerance driver in `HA/stepDrivers/tolerance.ts`: `analyseContextTolerance` (`lib/contextToleranceAnalysis.ts:64`), `applyContextToleranceDecision` (`lib/contextToleranceApply.ts:62`); a throw fails the case at this step (no default substituted)
- [X] T031 [P] [US1] Convenience and carve drivers in `HA/stepDrivers/convenience.ts` and `HA/stepDrivers/carve.ts`: `computeConvenienceGate`, `deriveCarveNeededSet`, `recommendedRemovalChars`, `suggestionFingerprintOf`, `isUntouchedSuggestion`, then T018's `continueCarve`
- [X] T032 [US1] Mechanism and displacement drivers in `HA/stepDrivers/mechanism.ts` and `HA/stepDrivers/displacement.ts`: `buildPlacementSeeds`, `getRankedSuggestionsForChar`, T019's order (top suggestion = first chip), `proposeS02TriggerKey`/T020, `orthographyTier`/`displacedFor` with T021's action order, T022's companion acceptance; overrides (`overwriteChar`/`overwriteKey`) applied as "Assign to a key"
- [X] T033 [P] [US1] Phase F/help driver in `HA/stepDrivers/caps.ts` (the file keeps its name). No `caps-handling` step exists in this build, so the module default applies. The driver covers the phase-F metadata questions (`proposeProjectUrl`, `proposeProvenanceBasis` in `lib/phaseFSeeds.ts:59`/`:71`; `proposeTroubleshooting` in `lib/troubleshootingProposal.ts:115`) through their registry questions **As built**: no `caps-handling` step exists in this build, so the module default applies; the phase-F metadata proposals reach the walk through live extraction, which records them as decisions the policy takes as prefilled values.
- [X] T034 [US1] Report `fallbackPolicy` (store default) in every run report and write it nowhere else (FR-060)

### Tests for US1

- [X] T035 [US1] In `HA/authorCase.corpus.test.ts`: `p1-whole-bafut-kbdus` completes, compiles, reports G1-G8 per gate with spec 106 `KNOWN_GAPS` owners as expected failures (acceptance 1)
- [X] T036 [US1] Same file: override case (`ŋ` onto `K_X`) applies "Assign to a key" and resolves displacement in harness order (acceptance 2)
- [X] T037 [US1] Same file: a step with no suggestion and no default uses the placeholder and counts it (acceptance 3)
- [X] T038 [US1] Same file: run the case twice; record minus timestamps, DecisionSet and bundle bytes are identical (acceptance 4, FR-007)
- [X] T039 [US1] Same file: missing keyboard and a keyboard with parse errors (an injected eligibility dep, since the corpus has none) skip with named reasons; a product proposal that throws fails the case at that step; the camazerty tolerance analysis publishes `failed` and the walk continues (G2 expected) (acceptance 5, edge cases) **As built**: the camazerty tolerance analysis does not throw in the product: it publishes `status: failed`, the driver reports `skippedSteps: marks.context_tolerance`, and the run continues (FR-013, mirror the UI). The test asserts that, with the resulting G2 failure owned by spec 106 KNOWN_GAPS (#2363).
- [X] T040 [US1] Implement the drift guard in `HA/driftGuard.ts` (the research R2 inventory: function, module, production caller file) and `HA/driftGuard.test.ts`: each function still exported, each caller file (a component or store, the seam the UI calls) still imports it (checked by `HA/boundary.test.ts` rule (d), not the drift guard), and no `HA/` file outside `stepDrivers/` imports a proposal module (FR-011, SC-004). This inventory is the allow-list T079's boundary test reads: a product function with no production caller cannot be inventoried, so the author can call only what the UI calls (FR-014)

**Checkpoint**: US1 green; SC-001 timing recorded from the run report's `timingMs`.

---

## Phase 4: User Story 2 - The author matches the UI (parity) (P1)

**Goal**: 0 unexplained differences against the 4 committed records.

**Independent Test**: quickstart 2.

- [X] T041 [P] [US2] Implement `compareParity` in `HA/parity.ts` per [contracts/author-api.md](contracts/author-api.md), with the named normalisation rules of research R8 (timestamps dropped, `zzq<hex>` reduced to `zzq`, carve fingerprint recomputed with `suggestionFingerprintOf`) **As built**: plus a fourth R8 rule, tester-typed (a decision where the author's own PolicyStep is `placeholder` is compared on presence). Both sides are folded from their records with `recordToDecisionSet`, since a decision is recorded when its step completes and later steps keep seeding the live draft.
- [X] T042 [P] [US2] Create `HA/parityAllowList.ts` (empty array, typed) with a header stating entries need decision id, reason and explaining change, and records are never edited
- [X] T043 [US2] `HA/parity.corpus.test.ts`: for each record in `packages/studio/src/lib/__fixtures__/decision-points/records/` (`kbdus.json`, `kbdfr.json`, `camqwerty.json`, `camazerty.json`), run the matching case and compare per decision id and value; fail on unexplained differences
- [X] T044 [US2] Same file: compare the record's 053 agency against the author's per the provenance mapping in [data-model.md](data-model.md#provenance-mapping-088--053)
- [X] T045 [US2] Same file: report stale allow-list entries (FR-022) as a failing assertion listing them
- [X] T046 [US2] Same file: when `KS_PARITY_RECORDS` names a directory, also compare every `*.json` record in it (on-demand records, never committed)
- [X] T047 [US2] Triage every difference on the 4 records per FR-017. Where the author diverges from the product, fix it **only** by making the author call the product as the UI does, lifting the rule (FR-040), or listing it Playwright-only (FR-042). Never add a conditional, constant or computed value to the author to close a difference. Otherwise add an allow-list entry naming the product change or record age (camqwerty/camazerty predate S-02, per `records/PROVENANCE.md`) **As built**: 3 entries, all `record-age` on the round-3 Cameroon records: `carved-layout` on camqwerty and camazerty (records predate marked-until-Continue), `marks-treatment` contextTolerance on camqwerty (Continue pressed before the analysis arrived). An entry also explains its decision's agency (T044). The remaining differences were product defects, fixed on this branch.

**Checkpoint**: SC-003 holds on the committed records.

---

## Phase 5: User Story 4a - Curated PR set in PR CI (P2, required on every PR)

**Goal**: the six-keyboard PR set runs on every PR without extending the critical path.

**Independent Test**: quickstart 3; on a PR run the `headless-author` job runs beside `fast` -> `build`, finishes inside the cap T051 set (at most 5 minutes), and the whole run's wall time does not grow.

- [X] T048 [P] [US4] `HA/prSet.corpus.test.ts`: run every `prSet.json` entry in one vitest invocation; report gates, placeholders, displacements; expected failures only from spec 106 `KNOWN_GAPS` **As built**: 6/6 green locally in one invocation (about 50 s). Getting there found five product defects, fixed on this branch; the one left (bj_cree_woods G1, a dead rule after carving a whole any() store) is a KNOWN_GAPS row owned by its issue.
- [X] T049 [P] [US4] `HA/prSetManifest.test.ts`: every FR-031 shape covered; every `regression-guard` entry has `guards`; at most 6 entries (research R1)
- [X] T050 [US4] Add a new job `headless-author` to `.github/workflows/ci.yml` per research R3: `needs: changes` only (do not add it to `build`'s `needs:`); `if: ${{ needs.changes.outputs.e2e == 'true' }}` (same gate as `e2e-desktop`); `timeout-minutes: 5` (the ceiling, provisional until T051); steps: checkout, the pinned corpus checkout copied from `build` (same pin), pnpm/Node setup, install, the cached SLDR/langtags fetches, `pnpm --filter "@keyboard-studio/studio^..." build`, then `pnpm --filter @keyboard-studio/studio exec vitest run --config vitest.corpus.config.ts src/test/headlessAuthor/prSet src/test/headlessAuthor/parity src/test/headlessAuthor/driftGuard`. The job id and `name:` are both `headless-author` and must stay stable once required (T077) **As built**: a second step runs `driftGuard`/`boundary` under the default config, because the corpus config only discovers `*.corpus.test.ts`; `codegen-charnames` added, as the studio build needs it.
- [X] T051 [US4] Measure the `headless-author` job on CI (total job time, plus the author's per-case cost from the PR set's `timingMs`, replacing research R1's 5 s budget); set the job's `timeout-minutes` in `.github/workflows/ci.yml` to the measured job time plus about 50% headroom, rounded up to a whole minute, at most 5; record the measurement and the cap in research.md R1/R3 and SC-002's figures in spec.md. The CI timing is restated in several places, and every restatement must be updated in the same change: spec Clarifications, SC-002 and Dependencies; plan Summary and Complexity Tracking; research R1 and R3. Local T071 figures (PR set plus parity 55-60 s; drift guard plus boundary 32-35 s) are the starting point, not the CI measurement **As built**: 132 s, 84 s and 123 s on PR #2410's three CI runs, 100 s on `main`; cap 132 s + 50% rounded up = `timeout-minutes: 4`. Per case about 2.4-4.2 s, derived from the PR set file's duration (14.1-25.3 s / 6): CI hides `timingMs` for passing tests. All runs were warm-cache; a cold cache is unmeasured (research R3).
- [X] T052 [US4] Check 3 PR runs: `headless-author` finishes inside the cap T051 set, finishes no later than the `fast` -> `build` chain (so PR wall time does not grow), and the whole run stays under 10 minutes; record job times and run totals in research.md R3. Cut the PR set only if the job would exceed 5 minutes (weakest shape first, keeping both regression guards), updating spec FR-031's table in the same change; otherwise keep all six. If a run exceeds the cap while still under 5 minutes, re-measure and re-set the cap by T051's rule **As built**: all three PR runs inside the 4-minute cap; `headless-author` ended 2.9-3.7 min before `build`; whole runs 6.0, 5.4 and 5.1 min. All six cases kept. Table in research R3.
- [X] T053 [US4] SC-005: locally revert `sameGroupName` use in `packages/engine/src/codec/groupName.ts` callers, rebuild the engine, run the PR set; confirm the `bj_cree_woods` case fails with the duplicate-group compile error in under 60 s; restore; record the evidence in the phase commit message **As built**: `sameGroupName` reverted to a case-sensitive match: `pr-whole-cree-woods` fails with "A group with the name 'main' has already been defined" in 1.5 s (whole invocation 53 s); restored, 6/6.
- [ ] T077 [US4] **Owner action (admin), after T050-T052 and after `headless-author` has run green on `main` at least once**: add `headless-author` to the required status checks of the `main: CI + integrity` ruleset (`gh api repos/{owner}/{repo}/rulesets` to find it; edit in the repository settings or via the API). A required check that has never reported blocks every PR, so this must not happen earlier. Record the date in the PR or a follow-up comment; from then on the job name must not change without updating the ruleset in the same change. (ID appended so existing IDs stay stable.)

**Checkpoint**: T051 and T052 closed: the lane is green in CI within SC-002 (research R3). T077 (owner) remains; its precondition, a green `headless-author` on `main`, is met (run 41220294641).

---

## Phase 6: User Story 3 - The 32 harness cases run headless (P2, on demand)

**Goal**: spec 106 T063/T064 can close on this suite's report.

**Independent Test**: quickstart 4.

- [X] T054 [US3] `HA/harnessCases.corpus.test.ts`: when `KS_AUTHOR_HARNESS=1`, run every case in the canonical `HA/cases/harness-cases.json` in one invocation (a different same-shape file may be named with `KS_AUTHOR_CASES_FILE`); when unset, skip the file with a `[WARN]` naming the variable (never a silent pass)
- [X] T055 [US3] Per-case output names case, gate and decision point plus the one-line reproduce command (`KS_AUTHOR_CASE=<id> ...`) for any failure (acceptance 2)
- [X] T056 [US3] Known gaps reported as expected with their spec 106 owner, without masking new failures (acceptance 3)
- [X] T057 [US3] Run the 32 cases from the canonical `HA/cases/harness-cases.json`; record wall time (SC-008) and the per-case report summary in the phase commit message, for spec 106 T063/T064 **As built**: 32/32 completed, 0 unexpected failures; about 140-200 s wall locally. kbdus and kbdfr 8/8 gates on all 8 profiles; camqwerty and camazerty 6/8, each failure expected: G2 (US6 / #2363) and G8-start (#2361). **Update**: the harness now reports gates out of 9, including G6. G6 on camqwerty and camazerty is a `walkOnly` known gap, reported as expected. Re-run for the current per-case counts. Run with `--silent=false --reporter=verbose` to see the summary.

---

## Phase 7: User Story 4b - Wide sweep and scheduled workflow (P2, never on PRs)

**Goal**: the scheduled larger-corpus scan, with failures filed as issues.

**Independent Test**: a `workflow_dispatch` run of `tier=latin, shards=1` completes and uploads its report; a seeded failure files one issue and a rerun comments instead of duplicating.

- [X] T058 [P] [US4] `HA/sweep.corpus.test.ts`: `KS_AUTHOR_SWEEP` (`latin` | `eligible`) and `KS_AUTHOR_SHARD` (`k/n`) select the slice via `HA/eligibility.ts`; write `headless-report-<tier>-<shard>.json` per [contracts/case-and-report.md](contracts/case-and-report.md); summary grouped by gate, first failing step and skip reason (US4 acceptance 1-3) **As built**: the shard report is rewritten before each case (`in-progress`, gate `hung`, last step reached) and after it, so a killed shard still names its case; `KS_AUTHOR_CASE_TIMEOUT_MS` sets the per-case timeout. Verified on a real `latin 1/300` shard: 8 failures recorded (compile-failed x4, G1 x2, hung x2).
- [X] T059 [P] [US4] `scripts/file-sweep-issues.mjs`: read the merged report, key failures as `[headless-sweep] <keyboard> <profile> <gate> @ <decision point>`, search open `headless-sweep` issues with `gh`, comment on a match, else file `bug(<area>): ...` with the reproduce command; skip `KNOWN_GAPS`-owned failures (contracts/scheduled-sweep.md)
- [X] T060 [P] [US4] Unit-test the keying and dedupe logic of `scripts/file-sweep-issues.mjs` with a stubbed `gh` in `scripts/file-sweep-issues.test.mjs`
- [X] T061 [US4] Create `.github/workflows/headless-sweep.yml` per [contracts/scheduled-sweep.md](contracts/scheduled-sweep.md): nightly `23 5 * * *` (`cases` tier: 32 cases + PR set x 8 profile variants), weekly `41 3 * * 0` (`latin`, 4 shards), `workflow_dispatch` (`tier`, `shards`); pinned corpus; the `cases` tier reads the committed `HA/cases/harness-cases.json` (no other branch fetched); artifacts with 90-day retention; a `summarise` job; `permissions: contents: read, issues: write`; no `pull_request` trigger **As built**: not yet run on Actions (that is T062).
- [X] T062 [US4] Dispatch the workflow once with `tier=latin, shards=1` and once with a seeded failing case; confirm artifact upload, one issue filed, and a rerun commenting on it (SC-009); delete the seeded issue's test label afterwards **As built** (2026-10-31): owner ruling: dispatch `tier=cases` instead of `latin`, because a single-shard Latin run with `--file-issues` could file dozens of real issues and the weekly schedule covers Latin. `cases` on `main` (run 41222967278): 80/80 completed, 0 failed, sweep 9.3 min, shard and merged reports uploaded, nothing to file. Seeded failure: a throwaway branch reverted `sameGroupName` to case-sensitive and narrowed the plan to `pr-whole-cree-woods`. Run 41223096377 filed exactly one issue, #2412 (`compile-failed @ output`), and the rerun 41223335008 commented on it with no duplicate. #2412 was unlabelled and closed, and the branch deleted. This found a defect, fixed in its own commit: the `headless-sweep` label did not exist, and `gh issue create --label` rejects a missing label, so `summarise` now creates it (`gh label create --force`) before filing.
- [X] T063 [US4] Document in the phase commit that adding a keyboard to `prSet.json` is part of fixing a keyboard-specific bug (US4 acceptance 4), and add the same rule as a comment at the top of `HA/prSet.json`'s loader in `HA/loadCases.ts`

---

## Phase 8: User Story 5 - Lift audit and Playwright-only list (P2)

**Goal**: every FR-040 rule is lifted or listed; no copied proposal logic.

**Independent Test**: the audit table is complete and SC-006 evidence is recorded.

- [X] T064 [US5] Audit every driver in `HA/stepDrivers/` for logic reached through a component or hook rather than a lifted function, and for any branch, constant or computed value the UI does not have (FR-013, FR-017); lift any found (same rules as T018-T024) **As built**: 3 more lifts: `languageResultsFor` (survey/resolveTypedLanguage.ts, QuestionField's 3 sites), `baseCoverageOf` (punctuationStepRules.ts), `displacementOutcomeFor` (mechanismPlacement.ts, MechanismGallery's displacement handlers). The mechanism placement sequence (companion -> record -> displacement -> companion) is lifted too, as `placementSequence` in mechanismPlacement.ts, called by MechanismGallery's suggestion-accept and apply paths and by the driver. One residual stays in the driver: which proposal wins (a later accepted proposal replaces an earlier one, a null leaves the slot), which the gallery gets from React state setters, so a lifted copy would have no production caller (FR-014).
- [X] T065 [US5] Add a "Playwright-only" table (rule, component, reason) to the header comment of `HA/runAuthorCase.ts` for any rule that cannot be lifted without a behaviour change, and mark those decisions as not covered in the run report (FR-042); empty table if none **As built**: 15 rules, as data in `HA/playwrightOnly.ts`; the run report's `notCovered` lists them (FR-042); a test keeps the header table and the data in step.
- [X] T066 [US5] Extend `HA/driftGuard.ts` with every lifted function and its component caller (T018-T024, T064) **As built**: every lift is inventoried with a production caller; `analyseWorkingCopyContextTolerance` is reached through the inventoried `runContextToleranceAnalysis` (no author file imports it, so the two-sided rule cannot list it).
- [X] T067 [US5] SC-006: run the golden walk in verify mode (`npx playwright test e2e/golden-walk.spec.ts`) and the touched components' tests; 0 re-baselines; record the result in the phase commit message **As built**: touched components' tests 1971/1971 unchanged; golden walk `--project=desktop` passes byte-for-byte (1.5 min), 0 re-baselines.

---

## Phase 9: User Story 6 - Touch default layers checked headlessly (P3)

**Goal**: G6 evaluated on the headless bundle.

**Independent Test**: G6 reported for `sil_cameroon_qwerty`/`sil_cameroon_azerty`, not applicable for `bj_cree_woods`.

- [X] T068 [US6] Touch-seed driver in `HA/stepDrivers/touchSeed.ts`: `deriveSeedLayout` (`lib/buildTouchLayoutJson.ts:169`) and the seed-source step's default (FR-050) **As built**: landed with Phase 3: the Phase F coverage gate reads the touch layout, so US1 needs a real touch step.
- [X] T069 [US6] Report G6 as `not-applicable` (not passed) when the copied keyboard has no touch layout, in `HA/runAuthorCase.ts` **As built**: keyed on whether the copied keyboard ships a usable touch layout (`startShipsUsableTouch` in survey/touchSeedSource/touchSeedSourceContinue.ts, the read the seed-source default makes; reached through stepDrivers/touchSeed.ts); the replay now installs the walk's touch layout, so G6 is evaluated at all.
- [X] T070 [US6] Tests in `HA/authorCase.corpus.test.ts`: G6 evaluated on a touch-layout keyboard; `not-applicable` on `bj_cree_woods` **As built**: G6 applicable on chechen_latin, not-applicable on bj_cree_woods. Evaluating G6 found it failing on every touch-bearing keyboard (default-layer labels only, no starting-content split): a walk-only KNOWN_GAPS row owned by its issue, which the decision-point replay (no touch step) does not apply.

---

## Phase 10: Polish and cross-cutting

- [X] T071 [P] SC-002 flake check: run the PR lane 5 times locally (`for i in 1 2 3 4 5; do ...; done`); 0 non-gate failures; record in the commit message **As built**: 5 runs, 0 non-gate failures: PR set + parity 55-60 s, drift guard + boundary 32-35 s per run.
- [X] T072 [P] Add a "Headless author" section to `docs/tooling.md` (how to run each tier, the env variables, the PR set rule) linking [quickstart.md](specs/107-headless-scripted-author/quickstart.md)
- [X] T073 [P] Owns FR-033 and SC-007: note in the PR body (not in spec 106 files) that spec 106 T063/T064 can close on the T057 report, per this spec's "Relationship to spec 106". FR-033 and SC-007 are met when that note is in the PR body and T057's report exists **As built**: PR #2410's body, section "Spec 106 follow-up (T073)".
- [X] T074 Run `pnpm lint` (includes `test-antipattern-lint` and `spec-number-lint`) and `pnpm --filter @keyboard-studio/studio typecheck`; fix findings **As built**: `pnpm lint` 0 errors (full chain), studio and engine typecheck clean.
- [X] T075 Run `/speckit-analyze` over spec, plan and tasks before `/speckit-implement`'s final pass; resolve findings **As built**: no constitution issue; 5 HIGH / ~10 MEDIUM / ~9 LOW drift findings, all resolved: the docs in their own commit, the one code finding by lifting `placementSequence`.
- [X] T080 SC-010 mutation check, one local run per mutation, each reverted afterwards: (1) replace a driver's import of a proposal function (e.g. `proposeWindowsLayout`) with a verbatim copy of it; (2) add a `vi.mock` of a product module to an `HA/` file; (3) add a direct `setState` on a decision store in a driver; (4) import an `HA/` module from a product file. Confirm T079's boundary test fails on (1) (rule d), (2) (rule b) and (3) (rule c), and T078's depcruise rule fails on (4). Record the four failures in the phase commit message. (ID appended so existing IDs stay stable.) **As built**: rule (d) caught a local `proposeWindowsLayout`; rule (b) a `vi.mock`; rule (c) a `useDecisionStore.setState`; depcruise `product-not-to-headless-author` caught a product import of `HA/walkPolicy.ts`.

---

## Dependencies and order

- Phase 1 → Phase 2 → Phase 3 (US1, MVP).
- Phase 4 (US2) needs Phase 3.
- Phase 5 (PR set + CI) needs Phase 4 (parity runs in the PR lane). Its last task, T077, is an owner action taken only after the job has run green on `main`.
- Phase 6 (US3) needs Phase 3 only; can run alongside Phases 4-5.
- Phase 7 (wide sweep + schedule) needs Phase 6 (the `cases` tier) and Phase 5 (the PR set).
- Phase 8 (US5 audit) needs Phase 3; can run alongside Phases 4-7.
- Phase 9 (US6) needs Phase 3.
- Phase 10 last.

No phase depends on code outside `main` (the spec 106 stack is merged).

## Parallel opportunities

- Phase 1: T002, T003, T076.
- Phase 2: T078 and T079 first (in parallel); then T005-T012 are separate files; T013-T017 are sequential.
- Phase 3: the lifts T018-T024 are separate components; drivers T026-T031 and T033 are separate files once the lifts they use exist (T031 needs T018; T029 needs T023-T024; T032 needs T019-T022).
- Phase 4: T041, T042.
- Phase 5: T048, T049.
- Phase 7: T058, T059, T060.
- Phases 6, 8 and 9 can proceed in parallel after Phase 3.

## Implementation strategy

1. **MVP**: Phases 1-3. One case headless, deterministic, drift-guarded. Stop and validate with
   quickstart 1.
2. **Trust**: Phase 4 (parity). Without it a green run proves nothing about the product.
3. **Guard PRs**: Phase 5. Only now does the work reach required CI.
4. **Breadth**: Phases 6-7 (32 cases on demand and nightly; weekly sweep filing issues).
5. **Close out**: Phases 8-10.

Each phase is one commit, pushed when its gates are green.
