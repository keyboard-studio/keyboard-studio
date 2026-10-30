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
Budget: **under 5 s per case** until task T051 measures it. With replay at under 1 s, a case is
budgeted at 6 s.

**Sizing the PR set (SC-002)**: 25 s fixed + 6 cases x up to 6 s = about 31-61 s of test time,
about 30 s if the author is as cheap as replay. The PR lane is a step inside `build` (R3) whose cap is
T051's measurement plus about 50%, rounded up to a whole minute, at most 5 minutes (owner follow-up).
At the estimate that is a 2-minute cap. The whole PR run (about 5.1 min today without the step) stays
under 10 minutes and ideally around 6. All six cases stay unless they would push the step past
5 minutes or the run past 10; a seventh shape replaces a weaker one (FR-031).

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

**Decision** (owner, 2026-10-30): **one step inside the existing `build` job** of
`.github/workflows/ci.yml`, on `pull_request` events, placed after "Build workspace dependencies (PR
path)" so the corpus checkout, install and `dist` it needs are already there. The step runs one vitest
invocation and carries a `timeout-minutes` cap (set as below):
`pnpm --filter @keyboard-studio/studio exec vitest run --config vitest.corpus.config.ts src/test/headlessAuthor/prSet src/test/headlessAuthor/parity src/test/headlessAuthor/driftGuard`.
(`driftGuard.test.ts` is not a corpus file; the step names it explicitly, or a second short invocation
under the default config runs it inside the same capped step.)

**Rationale**: the `build` job already has the pinned corpus at `../keyboards`, the installed
workspace and the built `contracts`/`engine` `dist`, so the step pays only vitest's module load (about
25 s, R1) plus the cases. It is covered by the required `build` check, so no ruleset change. The PR
critical path (`fast` then `build`, about 5.1 min measured on #2368's run) grows by at most the cap,
never more than 5 min; the target is a whole PR run around 6 min, always under 10. The
`timeout-minutes` cap makes an overrun fail the run loudly rather than grow it quietly.

**Setting the cap** (owner follow-up, 2026-10-30: "5 minutes is fine if needed"): T050 lands the
step with the ceiling, `timeout-minutes: 5`. T051 then measures the step on CI (module load plus the
six cases) and sets the cap to that time plus about 50% headroom, rounded up to a whole minute, never
above 5. At R1's estimate (about 30-60 s) that is 2 minutes. T052 checks three PR runs against that cap
and against the 10-minute total.

**When to cut the set**: only if keeping all six cases would push the step past 5 minutes or the whole
PR run past 10 minutes. Otherwise all six stay. Cutting order: weakest shape first, both regression
guards (`bj_cree_woods`, `basic_kbdfr`) kept.

**Alternatives considered**: (a) a separate `headless-author` job that `build` needs: rejected by the
owner, it repeats `pnpm install` and the build (about a minute) and puts max(headless, `fast`) + `build`
on the critical path. (b) Adding the files to `scripts/test-pr.mjs` `CURATED_CORE`: rejected, the
default studio config excludes `*.corpus.test.ts`, the PR set needs the corpus config, and the cap
would be shared with unrelated suites. (c) Path-gating the PR lane: rejected, the ruling makes the
curated set required on every PR.

## R4. Scheduled workflow (FR-034)

**Decision**: `.github/workflows/headless-sweep.yml`, separate from `ci.yml`:

- `schedule`: nightly at 05:23 UTC for the 32-case suite plus the PR set crossed with all 8 profile
  variants (about 5 min); weekly (Sunday 03:41 UTC) for the wide sweep over the Latin codec-clean
  slice, sharded 4 ways (`strategy.matrix.shard`). `workflow_dispatch` with inputs `tier`
  (`cases` | `latin` | `eligible`) and `shards`.
- The 32-case suite reads the committed canonical case file
  `packages/studio/src/test/headlessAuthor/cases/harness-cases.json` (FR-035) from the checkout. No
  other branch is fetched.
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

**Decision**: the repo commits `prSet.json` (case ids or descriptions, and reasons),
`parityAllowList.ts`, and the canonical harness case file `cases/harness-cases.json` with its
`cases/PROVENANCE.md` (FR-035; copied byte for byte from `km/2302-walk-zips` commit `a4bd8591`,
`tools/testing-profiles-2302/harness/cases.json`; the Playwright harness should read or sync from it). No walk zip and no new walk record is committed (owner ruling). Parity reads
extra records from `KS_PARITY_RECORDS` (a directory) when a maintainer supplies one.
