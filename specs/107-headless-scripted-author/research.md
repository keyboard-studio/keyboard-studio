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
about 30 s if the author is as cheap as replay. The PR lane is the parallel job `headless-author` (R3),
which also pays its own checkout, corpus checkout, install and `contracts`/`engine` build (estimated
1.5-2 min), so its total is about 2-3 min. That is inside the `fast` + `build` chain (about 5.1 min),
so PR wall time does not grow. Its cap is T051's measurement plus about 50%, rounded up to a whole
minute, at most 5 minutes. All six cases stay unless the job would exceed 5 minutes; a seventh shape
replaces a weaker one (FR-031).

**32-case suite (SC-008)**: 25 s + 32 x 6 s = about 3.6 min, under the 10-minute bound.

**Wide sweep (FR-034)**: about 608 parseable keyboards (`docs/import-corpus.json`: 496 `clean`, 112
`clean-with-opaque`; under the amended R6 every keyboard without parse errors is eligible, 921 in all) x 2 profiles x 6 s is
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

**Decision** (owner ruling, 2026-10-30, superseding "step inside `build`" from earlier the same
day): a new job **`headless-author`** in `.github/workflows/ci.yml`:

- `needs: changes` only. `build` does **not** need it, and no other job does.
- `if: ${{ needs.changes.outputs.e2e == 'true' }}`, the same gate as `e2e-desktop`. The `e2e` output
  is true for any non-Markdown change under `packages/studio/`, anything that sets `golden` (`packages/
  engine/`, `packages/contracts/`, `ci.yml`, `package.json`, `pnpm-lock.yaml`), the `run-all-gates`
  label, every non-PR event, and when the diff is unavailable (fail open). That is exactly the code the
  author exercises, so no narrower output is needed. A job skipped by its `if:` reports as skipped, which
  a required check accepts, so docs-only PRs are not blocked.
- Its own steps: checkout, the pinned corpus checkout (same step and pin as `build`), pnpm/Node setup,
  install from cache, the cached SLDR/langtags fetches, `pnpm --filter "@keyboard-studio/studio^..."
  build`, then one vitest invocation:
  `pnpm --filter @keyboard-studio/studio exec vitest run --config vitest.corpus.config.ts src/test/headlessAuthor/prSet src/test/headlessAuthor/parity src/test/headlessAuthor/driftGuard`.
- `timeout-minutes` on the job, set by T051 (below).
- It gates merges once the owner adds `headless-author` to the required status checks of the
  `main: CI + integrity` ruleset (T077), after it has run green on `main` at least once: a required check
  that never reports blocks every PR. The job name must stay stable from then on.

**Rationale**: GitHub runs jobs concurrently unless `needs:` chains them. On `main`, `ci.yml` is
`changes` -> {`fast` -> `build` (`needs: [changes, fast]`), `e2e-desktop`, `e2e-mobile`, `e2e-golden`},
so PR wall time is the longest chain: `fast` (about 2.1 min) + `build` (about 2.9 min), about 5.0-5.1
min on #2368's run. A job that needs only `changes` runs beside that chain and adds no wall time while
its own total stays within about 5 minutes. Its extra install and build cost runner minutes, not wall
time.

**Setting the cap** (owner follow-up, 2026-10-30: "5 minutes is fine if needed"): T050 lands the job
with the ceiling, `timeout-minutes: 5`. T051 measures the job on CI and sets the cap to that time plus
about 50% headroom, rounded up to a whole minute, never above 5. At R1's estimate (about 2-3 min) that
is 4-5 minutes. T052 checks three PR runs against the cap and against the 10-minute whole-run total.

**When to cut the set**: only if the job would exceed 5 minutes. Otherwise all six stay. Cutting order:
weakest shape first, both regression guards (`bj_cree_woods`, `basic_kbdfr`) kept.

**Alternatives considered**: (a) a step inside `build` (the earlier ruling): reuses `build`'s install,
but lengthens the longest chain on every PR. (b) A job that `build` needs: puts max(headless, `fast`) +
`build` on the chain. (c) Adding the files to `scripts/test-pr.mjs` `CURATED_CORE`: the default studio
config excludes `*.corpus.test.ts`, the PR set needs the corpus config, and it would run inside
`build`. (d) No path gate: wasted runner minutes on docs-only PRs, with no coverage gain.

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
the codec parses it without error (`docs/import-corpus.json`: no `parseErrors`); script not routed to the CJK or Ethiopic stub (from the product's own
three-group routing); inside the requested slice. A keyboard that passes eligibility and then fails to
scaffold is a **failure**, not a skip.

**Amended 2026-10-30 (owner ruling, option A).** The first version also required import status `clean`
or `clean-with-opaque`. That excluded every `round-trip-divergence` keyboard, including three of the
six PR-set keyboards (`basic_kbdfr`, `sil_cameroon_qwerty`, `sil_cameroon_azerty`) that spec 106's
replay already compiles. Round-trip divergence means parse-then-emit gives a structurally different
`.kmn`; byte-identical round-trip is out of scope for v1, and Art. II's concern is a starting point the
codec cannot parse. "Codec-clean" in this spec therefore means **parses without error**. Layer A' I1
(`i1ParseComplete`) is not used: it is a token-count heuristic with documented false positives, and it
flags `chechen_latin` (a PR-set keyboard whose readonly groups the codec keeps as fidelity-only
groups). On the 2026-10-30 `import-corpus.json` no keyboard has parse errors, so all 921 are eligible
on this criterion; a keyboard that then fails to scaffold is reported as a failure, never a skip.

**Added 2026-10-31 (owner ruling): `too-large`, sweep tiers only.** A walk's cost is superlinear in
`ruleCount` (docs/import-corpus.json). One walk each (profile 1, backspace whole): 108 rules (the
corpus median) 3.6 s, 351 (p95) 5.2 s, 1,802 9.8 s, 2,285 37 s, 3,790 32 s, 4,144 49 s, 25,474 over
440 s (killed), and `vietnamese_telex_legacy` (58,026 rules in one group; issue #2406) about 900 s,
against the 180 s default case timeout. The `latin` and `eligible` tiers therefore skip a keyboard
with more than `MAX_SWEEP_RULE_COUNT` (2,000) rules as `too-large`: 9 of the 921 keyboards
(`vietnamese_telex`, `hakka`, `vietnamese_telex_legacy`, `vietnamese_vni`, `taigi_viet_telex`,
`foochow`, `tibetan_ewts`, `hieroglyphic`, `taigi_telex`). The cap sits just above the largest
keyboard measured under 10 s, leaving margin for a slower CI runner. It is reported like any other
skip and never filed as an issue. The explicit harness, the PR set and `KS_AUTHOR_CASE` runs name
their keyboards on purpose and are not capped. Lowering the cost of a large walk is a separate
product question tracked in that issue; the cap only keeps the sweep honest in the meantime.

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
`suggestionFingerprintOf` on both sides); tester-typed values (where the author run's own `PolicyStep`
for a decision has rule `placeholder`, the record's value is compared on presence, not value; keyed off
the PolicyStep rule, never a decision id). Rationale for the last: the harness typed a fixed "Walk
Author" where the author types the placeholder; both are tester-supplied text where a guest session
proposes nothing. Compared exactly: everything else, including generated ids. Both sides are read from their decision records through `recordToDecisionSet`:
a decision is recorded when its step completes, and later steps (punctuation) keep seeding the live
draft, so the author's live store is not comparable with a record.

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
