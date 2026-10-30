# Spec 107 handoff (2026-10-30)

For the agent continuing `/speckit-implement 107`. Read this, then `tasks.md` (checkboxes are
accurate), then the spec's "Governing rule" (spec.md, Context). Everything below is pushed.

## Where things are

- Worktree `D:/Github/_Projects/_KM/ks-107-resume`, branch `107-headless-scripted-author` (tracks
  `origin/107-headless-scripted-author`). Deps installed and built; `../keyboards` is the corpus.
  The worktree is `git worktree lock`ed with reason "spec 107 resume (main session)".
- Commits, oldest first: `1d8b74e2` Phase 1; `27c22501` Phase 2; `3980e7f8` + `d3bc2492`
  eligibility ruling; `732c78af` Phase 3 checkpoint; `b5bd6377` Phase 4 started.

| Phase | State |
|---|---|
| 1 Setup | done |
| 2 Foundational | done |
| 3 US1 | **partial**: lifts T018-T024, drivers T026/T027/T029-T032, T034, drift guard T040 done. **Open: T028, T033, T035-T039** |
| 4 US2 parity | started: `parity.ts`, `parityAllowList.ts` written, untested; T041/T042 unchecked |
| 5-10 | not started |

## Next steps, in order

1. **T028 characters driver** (`HA/stepDrivers/inventory.ts`, steps `characters`, `punctuation`,
   `invisibles`). This is the most important open item: until it lands, a real walk reaches marks,
   carve and mechanisms with an empty inventory, so those drivers run on nothing. The authorCase
   corpus passes for all four record cases, but that proves the loop and plumbing, not parity.
   `characters` is the `phase_b_characters` flow inside `CharactersStep.tsx`. Reuse
   `HA/stepDrivers/flowStep.ts` (`completeFlowStep` / `completeFlow`). The text-sample rules are
   already lifted to `survey/marksTextSample.ts`, and `CharactersStep`/`TextSampleAffordance` call
   them. Case `sampleText` feeds `proposeTextSampleInventory` -> `confirmTextSample`.
2. **T033 Phase F / caps driver** (`HA/stepDrivers/caps.ts`, step `help`). It is a
   `makeFlowStepComponent` flow behind `PhaseFGate`. Use `completeFlowStep` and pass
   `findingsByQuestionId` yourself. The `help` step only advances when the coverage gate
   (`deriveInventoryCoverageGate`) passes; otherwise the loop fails with `step-blocked`.
3. **Loop fixes in `HA/runAuthorCase.ts`** (found by the flow-driver work):
   - Instantiation timing: the loop instantiates before `identity`. The UI has no start keyboard
     during identity, so live extraction writes `target-script` as `extracted` and drops the
     record's `langtags` source. Move instantiation to after `track` (choose_base), or have the
     choose_base driver do it through `confirmStartKeyboard`.
   - `kpsInfo().displayName` gives `..\build\basic_kbdus.kmx` / `Cameroon.ico`. Use the product's
     catalog name ("US Basic", "Cameroon QWERTY"), and give the `StartKeyboard` its `languages`;
     `proposeTrack` and the track step read them.
   - `commitStartKeyboard` (exported from `stepDrivers/track.ts`) is called at the start of the
     attribution driver; it belongs right after `completeStep("track")`.
   - Author name: the record's `il_author_name` is "Walk Author", typed by the harness. A guest
     session proposes nothing, so the driver types the `zzq` placeholder. Decide whether `Case` gets
     an author field (a case-shape change: update `caseTypes.ts`/`loadCases.ts`/data-model).
4. **T035-T039** in `HA/authorCase.corpus.test.ts` (it is still the Phase 2 smoke test). T039 now
   uses an injected eligibility dep for the "parse errors" skip, since no corpus keyboard has parse
   errors.
5. Then Phase 4: `parity.corpus.test.ts` (T043-T046) and triage (T047). The expected differences
   listed below each need an allow-list entry with a product change or `record-age:` reason.

## Decisions made this session

- **Eligibility (owner ruling, option A, narrowed):** "codec-clean" means *no parse errors* in
  `docs/import-corpus.json`. Round-trip divergence does not exclude a keyboard, and neither does the
  Layer A' I1 heuristic, which flags `chechen_latin`. All 921 keyboards are eligible today.
  Spec FR-032, a clarification, research R6/R1, plan and T011/T039 are updated.
- **FR-040 lifts beyond the spec's known list**, all behaviour-preserving with the component calling
  the lifted function:
  - StepHost completion -> `lib/completeStep.ts`;
  - StudioShell reducer deps -> `lib/studioReducerDeps.ts`;
  - inventory diff/coverage gate -> `lib/inventoryDiff.ts`;
  - SurveyRunner value/walk rules -> `survey/flowWalk.ts`;
  - and more, listed in the `732c78af` commit message.
- **Inventory `provenBy`:** a composite no production file calls by name (because a hook memoizes its
  pieces) may be inventoried with a test proving it equals the hook. Examples:
  `deriveInventoryCoverageGate`, `marksStationDefaults`, `resolveCarveNeededSet`.
- **Shared store hooks** (`useSurveyAnswerStore`, `useDecisionStore`) belong in the base
  `INVENTORY` in `driftGuard.ts`, never in `inventory/*.ts`. Proposal entries may only be imported
  from `stepDrivers/`, and `resetStores.ts` imports these.

## Findings to carry

- **camqwerty tolerance cannot replay.** The marks driver accepts the station's pre-accepted
  normalization-step proposal. The record has `contextTolerance: null` because the human pressed
  Continue before the analysis arrived. Replaying the accept throws `tolerance: recorded decision did
  not apply (stale)`: the fingerprint is taken at marks time, and `installToleranceOverlay` in
  `test/decisionPointFixture.ts` re-analyses the final keyboard, without the verification and lineage
  options the UI passes. Once T028 makes the walk real, expect `compile-failed` on camqwerty. Options:
  - fix the spec 106 replay helper (a spec 106 code change, so ask the owner);
  - have the author take the station default the human did;
  - accept it as an expected failure.
- **camazerty tolerance analysis fails**: `simulate: unknown virtual key "T_0300"`. This is the
  KNOWN_GAPS `#2363` defect. The preview pipeline publishes it as failed and the series continues, so
  the driver reports `skippedSteps: marks.context_tolerance` and continues. Spec T030 said a throw
  fails the case; the product never throws here, so decide whether to hard-fail on
  `analysis.status === "failed"`.
- **Expected parity differences** (each will need an allow-list entry):
  - camqwerty and camazerty carve: the product now proposes 571 and 642 removals. The records have
    `removals: []` and legacy `dispositions`, because they predate marked-until-Continue
    (`record-age`).
  - Ŋ on kbdus and kbdfr: the author accepts the case-pair companion (`[SHIFT K_X]`). The harness
    never clicked that banner and typed `zzq14a`.
  - kbdus `’` `“` `”`: the author confirms the move to RAlt. The record predates the ruling that
    punctuation is never core (`record-age`).
  - `il_target_script` source and `base-keyboard` name: these are the loop bugs in step 3.
  - `il_author_name`: see step 3.
- **`backspaceOnDiagonal`** has no product surface: the marks series has no question for it, and the
  records carry none. It is applied nowhere.
- **Research R2 is stale for `defaultsFor`.** The identity UI path uses `loadLangtags()` /
  `getLanguageDefaults`; `defaultsFor` is called only inside `langtagsDefaults.ts`.
  `buildPlacementSeeds` is used only by `PhaseB.tsx`; the mechanism step uses
  `getRankedSuggestionsForChar` through `placementOffer`.
- **Playwright-only candidates (FR-042)** reported by the driver work, to collect in T065:
  - mechanism step: escape-banner toggles, Mark for later review, manual S-08 layer-token and
    custom-character key pickers, deadkey card prefill after `prefill-deadkey`, Back/Next/unlock,
    existing-method removal, the touch case-pair proposal;
  - flow steps: the connected-profile author seed (OAuth), the `window.confirm` rebase prompt,
    Back/resume, the `il_language_region` pick, the debug pin chip;
  - convenience: the `lastNavigation === "pop"` branch (the author never goes Back).

## Gotchas

- **Never weaken the boundary.** `HA/boundary.test.ts` (default config, in `test-pr.mjs`
  CURATED_CORE) and `driftGuard.test.ts` are the FR-013-FR-016 enforcement. A failure means "lift it
  or inventory it", never "relax the rule".
- **Windows shell:** inline `node -e '...'` breaks on any apostrophe in the code (for example
  "store's"), and the rm-safety check can refuse complex inline scripts. Write edit scripts to the
  scratchpad and run them.
- **`pnpm build` rewrites** `packages/studio/src/lib/generated/{baseLayouts,windowsLayouts}.generated.json`
  with a one-line change. `git checkout --` them; never commit them (PR #2370 fixes this).
- **Flaky under load, pre-existing:**
  - `hooks/useKeyboardArtifact.contextTolerance.test.ts` times out on unmodified HEAD too;
  - the `PhaseFGate*` tests hit their 30 s timeout when several suites run at once;
  - `driftGuard.test.ts` "still exported" imports every inventoried module, so it needs a long
    timeout on a loaded machine.
- **Lint false positives already hit:**
  - token-lint reads `"#2361"` as a hex colour, which is why the KNOWN_GAPS module is
    `decisionPointKnownGaps.fixture.ts`;
  - test-antipattern-lint flags any inline `.map(...)).toEqual([...])` under `survey/`.
- **CRLF:** some agent-written files were CRLF. `.gitattributes` normalises them on commit, so
  ignore the warnings.
- **Commit cadence:** one commit per phase, pushed explicitly with
  `git push -u origin 107-headless-scripted-author`, tasks checked only when green.
- **Needs CI or the owner:**
  - T051/T052 need real CI runs to measure;
  - T077 (making `headless-author` a required check) is the owner's action, and only after the job
    has run green on `main`.
