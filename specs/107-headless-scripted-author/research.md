# Research: Headless scripted author (spec 107)

Phase 0 output. Each item: **Decision**, **Rationale**, **Alternatives considered**.

## R1. Measured cost of the replay half (basis for SC-001, SC-002, SC-008)

Measured 2026-10-30 in the 107 worktree after merging `origin/main` (spec 106 stack merged), on a
maintainer machine (Windows 11, Node 24.11.0), `pnpm install` + `pnpm build` done, `../keyboards` at
the fork's master. Command: `cd packages/studio && npx vitest run --config vitest.corpus.config.ts
src/test/decisionPoint...`.

**Whole suites**

| Run | Scope | Wall | vitest Duration | of which transform/import | tests |
|---|---|---|---|---|---|
| a (cold cache) | `decisionPoint.corpus` (20 fixtures + fidelity, 201 tests) | 42 s | 38.0 s | 26.6 s / 29.0 s | 6.5 s |
| b (warm) | same | 32 s | 29.2 s | 20.9 s / 22.7 s | 4.2 s |
| all | `decisionPoint` (3 files, 216 tests) | 34 s | 30.7 s | (parallel workers) | 6.2 s |
| single | one fixture (`basic_kbdus` at `tolerance`), pre-merge | 32 s | 28.5 s | 22.8 s / 25.0 s | 0.8 s |

**Per fixture** (`buildDecisionPointFixture` = seed stores, rebuild, download path, compile, gates),
timed with `performance.now()` in a throwaway test, two passes in one process (ms):

| Base | marks | carve | assignments | caps | tolerance (all decisions) |
|---|---|---|---|---|---|
| `basic_kbdus` | 651 / 41 | 58 / 46 | 222 / 67 | 68 / 62 | 71 / 70 |
| `sil_cameroon_qwerty` | 174 / 131 | 172 / 159 | 162 / 165 | 153 / 145 | 807 / 728 |
| `basic_kbdfr` | 58 / 58 | 149 / 96 | 126 / 101 | 108 / 100 | 118 / 98 |
| `sil_cameroon_azerty` | 161 / 141 | 152 / 153 | 163 / 157 | 155 / 172 | 764 / 737 |

(First value pass 1, second pass 2. The first fixture of the process carries about 0.6 s of WASM and
cache warm-up.)

**Reading**: a replay costs about **25 s once** (module transform and import of the studio graph) plus
**0.04-0.8 s per case**; the full-decision case is 0.07-0.8 s. The fixed cost dominates, so the PR set
must run as **one vitest invocation** (one module graph), not one process per case.

**Author half (not yet measurable)**: the author adds proposal calls per case (exemplar lookup,
`suggestMissingChars`, marks proposals, `analyseContextTolerance` which simulates, placement ranking).
Budget: **under 5 s per case** until task T060 measures it. With replay at under 1 s, a case is
budgeted at 6 s.

**Sizing the PR set (SC-002)**: 25 s fixed + 6 cases x 6 s = **about 61 s** of test time in the worst
case of the budget, about 30 s if the author is as cheap as replay. The post-#2368 PR critical path is
`fast` (about 3.5 min) then `build` (about 2 min), 5.6 min total. A parallel job needs about 1.5-2 min
of setup (checkout, corpus checkout ~20 s, install from cache, `contracts`/`engine` build) plus about 1
min of tests: **about 3 min, inside `fast`'s 3.5 min**, so it adds 0 s. Six cases is the ceiling that
keeps the job under `fast` with headroom; a seventh shape replaces a weaker one (FR-031).

**32-case suite (SC-008)**: 25 s + 32 x 6 s = about 3.6 min, under the 10-minute bound.

**Wide sweep (FR-034)**: about 608 parseable keyboards (`docs/import-corpus.json`: 496 `clean`, 112
`clean-with-opaque`; 313 `round-trip-divergence` are skipped as not codec-clean) x 2 profiles x 6 s is
about 2 h single-runner, about 30 min on a 4-way shard matrix. The Latin slice is smaller.

**Alternatives considered**: estimating without measuring (rejected: the ruling asks for a measured
basis); timing through `--reporter=json` assertion durations (rejected: `beforeAll` fixture builds are
not attributed to assertions, they showed 3-16 ms).

## R2. Inventory of FR-010 product functions (confirmed against `main` after the merge)

All paths under `packages/`. "Caller" is the production component or hook that renders or applies the
proposal, which the drift guard (FR-011) asserts still calls it.

| Step | Function | Defined at | Production caller(s) |
|---|---|---|---|
| Identity prefill | `defaultsFor` | studio/src/lib/langtagsDefaults.ts:130 | used inside `langtagsDefaults.ts` (identity seeding path) |
| | `deriveScriptPrefill` | studio/src/lib/scriptAxes.ts:110 | survey/IdentityLite.tsx, decisions/identitySelectors.ts |
| Windows layout | `proposeWindowsLayout` | studio/src/lib/windowsLayouts.ts:134 | survey/layout/LayoutStep.tsx, LayoutStepHost.tsx |
| Track | `proposeTrack` | studio/src/lib/proposeTrack.ts:78 | editors/adapters/flowStepOptions.tsx |
| Inventory | `suggestMissingChars` | studio/src/lib/services.ts:308 | (service entry; wraps the engine call) |
| | `suggestMissingCharacters` | engine/src/character-discovery/suggestMissing.ts:339 | studio/src/lib/services.ts |
| | `loadExemplars` | engine/src/character-discovery/cldr.ts:531 | engine CharacterDiscoveryServiceImpl.ts |
| Marks | `proposeAttachments` | engine/src/marks/attachment-proposals.ts:43 | survey/marks/MarksSeriesStep.tsx, hooks/useWorkToDo.ts |
| | `computeMarkTreatmentPrefills` | engine/src/marks/treatment-prefill.ts:116 | MarksSeriesStep.tsx, useWorkToDo.ts |
| Output form, backspace | `resolveOutputFormProposal` | engine/src/marks/output-form-policy.ts:125 | MarksSeriesStep.tsx |
| | `resolveBackspaceProposal` | engine/src/marks/output-form-policy.ts:185 | MarksSeriesStep.tsx |
| Context tolerance | `analyseContextTolerance` | studio/src/lib/contextToleranceAnalysis.ts:64 | hooks/useKeyboardArtifact.ts, StudioShell.tsx |
| | `applyContextToleranceDecision` | studio/src/lib/contextToleranceApply.ts:62 | hooks/useContextToleranceApply.ts |
| | `proposeNormalizationStep` | engine/src/pattern-apply/normalization-step/index.ts:52 | studio/src/lib/normalizationStepCache.ts |
| Convenience | `computeConvenienceGate` | studio/src/survey/convenience/convenienceGate.ts:47 | ConvenienceCharsStep.tsx, hooks/useWorkToDo.ts |
| | `deriveCarveNeededSet` | engine/src/marks/carve-needed-set.ts:138 | hooks/useCarveNeededSet.ts, useWorkToDo.ts, lib/placementInventory.ts |
| Carve | `recommendedRemovalChars` | studio/src/lib/irToCarveNodes.ts:2418 | editors/carve/CarveGalleryV2.tsx, hooks/useCarveNeededSet.ts |
| | `suggestionFingerprintOf` | studio/src/survey/carve/carveValue.ts:84 | CarveGalleryV2.tsx |
| | `isUntouchedSuggestion` | studio/src/survey/carve/carveValue.ts:152 | editors/adapters/carveAdapter.tsx:45 |
| | Continue rule (to lift) | CarveGalleryV2.tsx:909 `isMarkedRow`, :941 `applySuggestion`, :1214 `handleSkip` | the component itself |
| Mechanism placement | `buildPlacementSeeds` | studio/src/survey/placementSeeds.ts:115 | survey/PhaseB.tsx |
| | `getRankedSuggestionsForChar` | studio/src/survey/placementSeeds.ts:348 | editors/assignLoop/MechanismGallery.tsx |
| | chip order (to lift) | MechanismGallery.tsx:2551 `orderedVisibleSuggestions` (a `useMemo`) | the component itself |
| Displacement | `orthographyTier` | studio/src/survey/slotOccupancy.ts:452 | MechanismGallery.tsx, survey/placementRationale.ts |
| | `displacedFor` | studio/src/survey/slotOccupancy.ts:474 | MechanismGallery.tsx |
| S-02 trigger | `deadkeyPurposeOf` | studio/src/editors/assignLoop/deadkeyPurpose.ts:31 | deadkeyPurpose.ts (via `proposeS02TriggerKey`) |
| | `proposeS02TriggerKey` | studio/src/editors/assignLoop/deadkeyPurpose.ts:135 | MechanismGallery.tsx |
| | `resolveS02DeadkeyIdentity` | studio/src/editors/assignLoop/MechanismGallery.tsx:530 (exported from the component file) | MechanismGallery.tsx |
| Case-pair companion | `useCasePairCompanion` | studio/src/editors/assignLoop/casePairCompanion.ts:206 (a hook) | MechanismGallery.tsx, SiblingAccentProposalBanner.tsx, TouchGallery.tsx |
| Caps handling | the `caps-handling` decision | spec 106 US5 (on `main`); `recordToDecisionSet.ts` seeds the module default for records that predate it | caps step |
| Touch seed | `deriveSeedLayout` | studio/src/lib/buildTouchLayoutJson.ts:169 | TouchGallery.tsx, survey/touchSeedSource/TouchSeedSourcePanel.tsx |

**Functions the FR-010 table missed** (the plan adds them to the drift-guard inventory):

| Function | Defined at | Why the author needs it |
|---|---|---|
| `derivePlacementInventory` | studio/src/lib/placementInventory.ts:79 | which characters the mechanism step walks (via hooks/usePlacementInventory.ts) |
| `deriveTreatmentFilteredChars` | studio/src/lib/placementInventory.ts:189 | marks-treatment filter on that inventory |
| `proposeProjectUrl`, `proposeProvenanceBasis` | studio/src/lib/phaseFSeeds.ts:59, :71 | packaging-metadata questions (pf_project_url, pf_provenance_basis) |
| `proposeTroubleshooting` | studio/src/lib/troubleshootingProposal.ts:115 | troubleshooting question default, via decisions/liveExtraction.ts |
| `suggestStarts` | studio/src/lib/suggestStart.ts:121 | not called for decisions (the case names the copied keyboard); recorded for comparison only, like `proposeTrack` |

**Replay and routing entry points** the author reuses unchanged: `advance` (steps/advance.ts:200),
`applyDecisionEffects` (steps/reducer.ts:460), `resolveNext` / `advanceThrough`
(survey/SurveyRunner.tsx:98, :201), `replayJourney` (test/journey-runner.ts:509),
`rebuildWorkingCopyFromStores` (decisions/rebuildWorkingCopy.ts:319), `buildOutputBundle`
(lib/buildOutputBundle.ts:80), `checkConsistencyGates` (test/consistencyGates.ts:336),
`buildDecisionPointFixture` (test/decisionPointFixture.ts:171), `recordToDecisionSet`
(test/recordToDecisionSet.ts:69), `parseDecisionRecord` (engine/src/decision-audit/record.ts:251).
The group-name fix the `bj_cree_woods` guard protects is `sameGroupName`
(engine/src/codec/groupName.ts:6).

**Note**: the inventory, marks and output-form proposals have no caller in a `.tsx` other than
`MarksSeriesStep.tsx` and the `useWorkToDo` hook, so the drift guard asserts on those two files.

## R3. Where the PR lane runs

**Decision**: a new `headless-author` job in `.github/workflows/ci.yml`, parallel to `fast`, with
`build` declaring `needs: [changes, fast, headless-author]` so the required `build` check covers it.
It checks out the pinned corpus the same way `build` does, installs from cache, builds
`contracts`+`engine`, and runs one vitest invocation:
`pnpm --filter @keyboard-studio/studio exec vitest run --config vitest.corpus.config.ts src/test/headlessAuthor/prSet src/test/headlessAuthor/parity`,
plus `driftGuard.test.ts` under the default config.

**Rationale**: R1 puts the job at about 3 min, inside `fast`'s 3.5 min, so the critical path stays at
about 5.6 min (SC-002: 0 s added). One invocation pays the 25 s module load once.

**Alternatives considered**: (a) a step inside `build` after `test:pr`: simplest, but adds about 60-90 s
to the critical path, which already exceeds the preferred 5 min; kept as the fallback, capped at 60 s.
(b) Adding the files to `scripts/test-pr.mjs` `CURATED_CORE`: rejected, the default studio config
excludes `*.corpus.test.ts`, and the PR set needs the corpus config. (c) Path-gating the PR lane:
rejected, the ruling makes the curated set required on every PR.

## R4. Scheduled workflow (FR-034)

**Decision**: `.github/workflows/headless-sweep.yml`, separate from `ci.yml`:

- `schedule`: nightly at 05:23 UTC for the 32-case suite plus the PR set crossed with all 8 profile
  variants (about 5 min); weekly (Sunday 03:41 UTC) for the wide sweep over the Latin codec-clean
  slice, sharded 4 ways (`strategy.matrix.shard`). `workflow_dispatch` with inputs `tier`
  (`cases` | `latin` | `eligible`) and `shards`.
- The 32-case suite needs `harness/cases.json`; the workflow reads it from a path given by
  `KS_AUTHOR_CASES`. The Playwright harness repo is not in CI, so the nightly run uses a copy of the
  case descriptions only (small JSON, no zips) checked out from `km/2302-walk-zips` by sparse checkout
  of the one file, `tools/testing-profiles-2302/harness/cases.json` (the branch also holds the 32 zips,
  which the sparse checkout skips). If that branch or file is absent, the job reports `[WARN] cases.json not found` and
  runs the PR set only; it never fails silently.
- Results: each shard uploads `headless-report-<tier>-<shard>.json` as a run artifact (90-day
  retention); a final job merges them into a sweep summary grouped by gate and first failing step.
- Issue filing: `scripts/file-sweep-issues.mjs` keys each failure by
  `[headless-sweep] <keyboard> <profile> <gate> @ <decision point>`, searches open issues with the
  `headless-sweep` label for that key, comments on a match with the run link, else files a new
  `bug(engine)`/`bug(studio)` issue with the reproduce command (FR-030 scenario 2). Failures already
  owned by `KNOWN_GAPS` are listed in the summary, not filed. The job uses `permissions: issues: write`.
- The workflow never runs on `pull_request` and is not a required check.

**Rationale**: nightly keeps the 32 cases close to the code without touching PRs; weekly bounds the
cost of the 30-minute sweep; dedupe-by-key stops a standing failure filing a new issue every night.

**Alternatives considered**: folding into `ci.yml`'s existing nightly schedule (rejected: the nightly CI
run is already the full-gate backstop at about 40-70 min, and adding 30 min of sweep there delays that
verdict); filing one issue per run (rejected: duplicates); failing the scheduled run on any new failure
(kept: the run's status is red, which is visible, but nothing gates on it).

## R5. Lifts belong in the US1 phase

**Decision**: the FR-040 lifts US1 cannot walk without (carve Continue rule, mechanism chip order,
S-02 identity resolution, displacement banner order, case-pair companion acceptance, marks-series
assembly, text-sample confirm) are tasks in the US1 phase, labelled US5 for traceability. The US5
phase keeps the audit, the Playwright-only list (FR-042) and SC-006 evidence.

**Rationale**: the walk policy's "top suggestion" for carve and mechanism is defined by those rules;
without them US1 would either copy the logic (forbidden by FR-010) or diverge from the UI and fail
parity. The carve code is on `main` since #2369, so nothing waits on another branch.

**Alternatives considered**: US1 using only "default" for carve and mechanism until US5 (rejected: it
makes US1's record unlike any UI walk and pushes every parity difference into the allow-list).

## R6. Eligibility without try/catch around parse (Art. II)

**Decision**: `eligibility.ts` decides before scaffolding: keyboard present under `../keyboards`;
status in `docs/import-corpus.json` is `clean` or `clean-with-opaque`; script not routed to the CJK or
Ethiopic stub (from the product's own three-group routing); inside the requested slice. A keyboard that
passes eligibility and then fails to scaffold is a **failure**, not a skip.

**Rationale**: Art. II forbids try/catch around `parse()` in the scaffold; deciding up front keeps the
product path honest and makes "skipped" mean only "not eligible".

**Alternatives considered**: catching scaffold errors and reporting them as skips (rejected: hides real
codec regressions as skips).

## R7. Provenance (Art. III, FR-004)

**Decision**: the author writes through the UI's store actions, so the 088 provenance is whatever the
action writes; the mapping to the 053 record is in [data-model.md](data-model.md). Parity compares
values only, because `recordToDecisionSet` folds every recorded decision to `asked`
(test/recordToDecisionSet.ts:57); provenance is checked separately against the record's agency.

## R8. Parity normalisation (FR-023)

**Decision**: normalised by named rule: timestamps (dropped); `zzq<hex>` placeholders (reduced to
`zzq`, as `decisionPoint.corpus.test.ts` already does); carve `suggestionFingerprint` (recomputed with
`suggestionFingerprintOf` on both sides). Compared exactly: everything else, including generated ids.

## R9. Determinism (FR-007)

**Decision**: a run seeds no clock or random source of its own; the record writer's timestamps are the
only time-dependent field and are excluded by R8's rule. Determinism is proven by running each US1 case
twice in one process and comparing record (minus timestamps), DecisionSet and bundle bytes.

## R10. Committed inputs

**Decision**: the repo commits only `prSet.json` (case descriptions and reasons) and
`parityAllowList.ts`. No walk zip and no new walk record is committed (owner ruling). Parity reads
extra records from `KS_PARITY_RECORDS` (a directory) when a maintainer supplies one.
