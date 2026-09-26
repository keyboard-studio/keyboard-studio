---

description: "Task list for spec 081: survey progress buttons live in the footer"
---

# Tasks: Survey progress buttons live in the footer

**Input**: Design documents from [specs/081-footer-step-nav/](.) ([plan.md](plan.md),
[spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md),
[contracts/step-nav-contract.md](contracts/step-nav-contract.md), [quickstart.md](quickstart.md))

**Tests**: Requested by the spec (FR-050 to FR-054, SC-002, SC-005, SC-009), so test tasks are
included. Per research R-11, a row's existing unit tests are the parity baseline: they move to
`withStepNav` with **unchanged assertions**.

**Organization**: The plan's delivery phases are one phase per conversation (constitution).
US1, US2 and US3 ship together because migrating a row delivers all three at once. The
migration tasks carry `[US1]`, and the parity and transition tests carry `[US2]` / `[US3]`.

All source paths are relative to `packages/studio/` unless they start with `specs/`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 to US7 from [spec.md](spec.md)

## Per-row migration recipe (applies to every T020 to T036 task)

For each Appendix A row, in the file named by the task:

1. Call `usePublishStepNav(spec)` **once, at the top level of the walk-owning component, before
   any early `return`** (contract §2 rule 2).
2. Build `spec` from the current render state. `back.onClick` is the local walk handler, which
   falls through to `onBack` (FR-011). Omit `back` when there is nowhere to go (FR-015). Keep
   the gating, labels and `aria-label` from Appendix A exactly (FR-010). Pass `ariaDescribedBy`
   only while the referenced hint is mounted (R-09).
3. Delete the in-body button(s) in the same change (FR-001). Leave warnings, hints and in-page
   decision buttons in the body (FR-005, FR-016).
4. Use the Existing test handle and add the New one from Appendix A (FR-040, FR-041).
5. Switch that row's unit tests to `render(ui, { withStepNav: true })`, leaving the assertions
   unchanged (FR-051, R-11). Run them green.

---

## Phase 1: Setup

**Purpose**: Confirm a clean baseline before touching anything.

- [X] T001 Run `pnpm build` from the repo root, then `pnpm --filter @keyboard-studio/studio exec vitest run` and `pnpm --filter @keyboard-studio/studio exec tsc --noEmit`, and record the pre-change pass/fail counts in the Phase 2 commit message (studio typecheck needs the engine built)
- [X] T002 Confirm the branch is `km/footer-step-nav` and that its upstream is not `origin/main` (`git rev-parse --abbrev-ref --symbolic-full-name '@{u}'`), then commit or discard the stray change to `specs/079-survey-answer-persistence/.spec-context.json` in its own commit

---

## Phase 2: Foundational (blocks every user story)

**Purpose**: The channel, the footer outlet, the compact Button, the frame and the harness. No
step migrates yet, so the footer shows no cluster.

### Tests first

- [X] T003 [P] Write `src/stores/stepNavStore.test.ts`: publish inserts; same owner with an equal spec is a no-op and notifies no subscriber; a changed spec replaces; a different owner on a live entry keeps the first and calls `console.error` in DEV; `clear` by the owner deletes and by a non-owner does nothing; `reset` empties (FR-050, data-model transitions)
- [X] T004 [P] Write `src/hooks/usePublishStepNav.test.tsx`: publishes under the `StepNavContext` id; publishes under `STANDALONE_STEP_ID` with no provider; clears on unmount; a handler that changes between renders is called in its latest form through the stable wrapper while the store is not rewritten; a spec published under step A is not rendered by `StepNavCluster stepId="B"` (FR-012, FR-050)
- [X] T005 [P] Extend `src/components/StudioFooter.a11y.test.tsx` for the cluster: `role="group"` named by `footer.nav.groupLabel`; DOM order back, secondary, forward, then project label, then `progress-dot-row`; absent slots render nothing and an empty spec renders no group; disabled state and `aria-describedby` pass through; Tab reaches the nav before the dots; still exactly one `role="status"` and no second live region (FR-002, FR-030, FR-034, FR-052)

### Implementation

- [X] T006 [P] Create `src/stores/stepNavStore.ts`: a zustand `create` modelled on `src/stores/stepWalkStore.ts`, exporting `useStepNavStore` (`entries`, `publish(stepId, owner, spec)`, `clear(stepId, owner)`, `reset()`), the types `NavAction` and `StepNavSpec`, `STANDALONE_STEP_ID`, and a `sameSpec` guard over slot presence, `label`, `disabled`, `testId`, `ariaLabel` and `ariaDescribedBy`. Use the object form of `set({ ... })` (see the `startOverStore` note)
- [X] T007 Create `src/hooks/usePublishStepNav.ts`: export `StepNavContext` (default `null`) and `usePublishStepNav(spec)`, which takes the step id from context (or `STANDALONE_STEP_ID`) and the owner from `useId()`, keeps the latest spec in a ref, publishes stable `onClick` wrappers from `useLayoutEffect`, and clears by owner on unmount (contract §3; depends on T006)
- [X] T008 [P] Add `size?: "default" | "compact"` to `src/ui/Button.tsx`: `compact` sets padding `4px 12px`, font size 13, `whiteSpace: nowrap` and `flexShrink: 0`, drops the `back` variant's `marginTop: 20`, and keeps `ks-focus-ring ks-hit-target` and all three variants (R-05, FR-023)
- [X] T009 [P] Add `.ks-studio-footer { height: 40px }` and `@media (pointer: coarse) { .ks-studio-footer { height: 52px } }` to `src/index.css` (R-06, FR-020, FR-020a)
- [X] T010 Create `src/components/StepNavCluster.tsx`: `StepNavCluster({ stepId })` reads `entries[stepId]` and renders nothing when there are no slots; otherwise it renders `<div role="group" aria-label={t footer.nav.groupLabel} data-testid="step-nav">` containing `Button size="compact"` for each present slot (`back` → `"back"`, `secondary` → `"secondary"`, `forward` → `"primary"`), with stable keys `back` / `secondary` / `forward` and passing through `data-testid`, `disabled`, `aria-label` and `aria-describedby`. The group is `flexShrink: 0` (FR-022, FR-034, R-10; depends on T006, T008)
- [X] T011 Edit `src/components/StudioFooter.tsx`: move `height` to the `ks-studio-footer` class; render `<StepNavCluster key={activeStepId} stepId={activeStepId} />` first; make the project label `flexShrink: 1` with an ellipsis that hides at narrow widths; give the dot row `data-testid="progress-dot-row"` and `marginLeft: auto`; keep the single status span; add the FR-021 visibility disjunct (the active entry has at least one slot) to the existing gate (contract §5; depends on T009, T010)
- [X] T012 Edit `src/components/StepHost.tsx`: wrap the step component in `<StepNavContext.Provider value={resolvedStep.id}>` next to the existing `QuestionRecorderContext` / `JumpContext` providers, with no new DOM node, so the direct-parent contract in `tests/steps/stepHost.renderSmoke.test.tsx` still holds (R-01; depends on T007)
- [X] T013 [P] Add the `withStepNav?: boolean` option to `src/test/renderWithI18n.tsx`, which renders `ui` followed by `<StepNavCluster stepId={STANDALONE_STEP_ID} />` inside the same i18n wrapper (contract §6, FR-051; depends on T010)
- [X] T014 [P] Add `afterEach(() => useStepNavStore.getState().reset())` to `src/test-setup.ts` (R-07; depends on T006)
- [X] T015 Wire `useStepNavStore.getState().reset()` into the existing start-over and new-project reset paths wherever `stepWalkStore` is reset today (data-model `reset()` row; grep for the `stepWalkStore` reset call)
- [X] T016 Add the catalog id `footer.nav.groupLabel` ("Step navigation"), then run `pnpm run i18n-catalog-sort` and `pnpm run i18n-catalog-lint` over `src/locales/en/messages.json` and `src/locales/fr/messages.json` (FR-034, FR-045)
- [X] T017 Run T003 to T005 green, then `tsc --noEmit` and `tests/steps/stepHost.renderSmoke.test.tsx`. Commit `feat(studio): step nav channel and footer nav cluster (spec 081 T001-T017)` and push to `km/footer-step-nav`

**Checkpoint**: The channel works end to end in the tests. The production footer is unchanged
visually because nothing publishes yet.

---

## Phase 3: US1, US2 and US3, P1 (MVP)

**Goal**: Every Appendix A row 1 to 17 renders its Back / secondary / forward in the footer
(US1), behaves exactly as before (US2), and never leaves stale or duplicate buttons (US3).

**Independent test**: A golden-path walk of both tracks shows no progress button in any page
body; each row's pre-existing unit tests pass unchanged through `withStepNav`; the transition
test shows 0 prior-step buttons and at most one Back after each hop.

### Survey rows 1 to 8 (one commit)

- [X] T018 [US1] Row 1: migrate `src/survey/SurveyRunner.tsx` (lines ~1082-1110) as the sole publisher for every question flow. Back is present when `cursor>0 || onBack`, with `handleBack`; forward is Next / Finish from `isLastQuestion`, disabled on `!canAdvance`, `ariaDescribedBy={progressDescId}` with that description kept mounted (FR-033). Keep handles `survey-back` / `survey-advance`. Confirm that `src/survey/FlowStepHost.tsx`, IdentityLite, `src/survey/PhaseA.tsx`, CharactersStep and the PhaseB manual path do **not** call the hook (FR-013). Enter-to-advance and `requestAdvance` stay unchanged (FR-014)
- [X] T019 [US1] Move the SurveyRunner, CharactersStep, PhaseA, IdentityLite and FlowStepHost unit tests that query `survey-back` / `survey-advance` to `withStepNav`, with unchanged assertions
- [X] T020 [P] [US1] Row 2: migrate `src/survey/Prefill.tsx` (Back `prefill-back`; Confirm and continue `prefill-confirm`; Enter path unchanged) and its tests
- [X] T021 [US1] Rows 3 and 4: migrate `src/survey/PhaseB.tsx`. The intro chooser publishes Back (new `phase-b-intro-back`) and Continue (`phase-b-intro-next`). The build list publishes Back (new `phase-b-back`, `setDiscoveryMethod(null)`) and Done (`phase-b-done`, plural label, disabled `chars.length===0 || nextGate.blocked`), with the flag cues staying in the body. Move `PhaseBExemplarPrefill` and the other PhaseB tests to `withStepNav`
- [X] T022 [P] [US1] Row 5: migrate `src/survey/punctuation/PunctuationStep.tsx` (`punctuation-back`; `punctuation-done` with the `doneButtonNone` / plural label, disabled `nextGate.blocked`, `completedRef` guard kept) and its tests
- [X] T023 [P] [US1] Row 6: migrate `src/survey/invisibles/InvisiblesStep.tsx` (`invisibles-back`; `invisibles-continue` with the count label) and its tests
- [X] T024 [P] [US1] Row 7: migrate `src/survey/convenience/ConvenienceCharsStep.tsx`: forward `convenience-continue` with its three label variants; Back (new `convenience-back`) for now mirrors today's rendering, and the A-3 fix lands in T046. "Keep all / Keep none" and auto-complete / auto-back stay in the body. Update its tests
- [X] T025 [P] [US1] Row 8: migrate `src/survey/marks/MarksSeriesStep.tsx`: Back (new `marks-back`) calls `handleStationBack`; Continue `marks-continue` is disabled on `nextGate.blocked`, with `ariaDescribedBy` set to the blocked hint's id only while the hint is mounted. `ContextToleranceStation` decisions stay in the body. Move its tests to `withStepNav`
- [X] T026 [US1] Run `vitest run src/survey`, then commit `feat(studio): survey steps publish their nav to the footer (spec 081 T018-T026)` and push

### Editor rows 9 to 17 (one commit)

- [X] T027 [P] [US1] Row 9: migrate `src/editors/panels/BaseResolution.tsx`. Back is `base-back`; Confirm is `base-confirm`, disabled `previewedBase===null || previewStatus!=="ready"`, and the `confirmRebaseTo` cancel path in `src/editors/adapters/panelAdapters.tsx` is unchanged. Call the hook before the loading / error / empty early returns (Back in those states lands in T044). Rewrite the placement assertion in `BaseResolution.test.tsx` (~lines 139-149) to assert that Back is in the footer, and move the rest to `withStepNav`
- [X] T028 [P] [US1] Row 10: migrate `src/editors/carve/CarveGalleryV2.tsx`: Back (new `carve-back`), secondary Skip (new `carve-skip`, `keepAll(); onComplete()`) and forward `carve-continue`. Keep today's literal labels for now; localisation lands in T047. Call the hook before the loading return. Update its tests
- [X] T029 [P] [US1] Row 11: migrate `src/editors/assignLoop/MechanismGallery.tsx`. Back (new `mechanisms-back`) is present when `onBack || currentIdx>0` and uses `handleBack` from `usePositionalCharNav.ts`. Map the existing forward spec (4 branches plus hidden) onto `forward`: `mechanisms-continue`, or new `mechanisms-next-char` on the Next-character branch. The blocked hint stays in the body and is referenced. Update its tests
- [X] T030 [US1] Rows 12 and 13: migrate `src/editors/assignLoop/TouchGallery.tsx` for the no-new-chars panel (Back new `touch-back`, Done `touch-continue`) and the per-character view (Back only when the current character is in `touchLettersToAdd`, the position-dependent `ariaLabel`, `completionGateNotice` referenced while mounted, press-twice `handleContinue` unchanged). Delete the stale comment at ~6018-6024
- [X] T031 [US1] Row 14: migrate the key-mode view in `src/editors/assignLoop/TouchGallery.tsx` (`touch-key-mode-back`; `touch-key-mode-continue` disabled on `unaccountedTouchChars.length>0`), ensuring TouchGallery calls the hook once across all three views (depends on T030)
- [X] T032 [P] [US1] Row 15: migrate `src/editors/assignLoop/IntroSplash.tsx`: Back (new `gallery-intro-back`) and forward "Get started" (new `gallery-intro-start`) (FR-006)
- [X] T033 [P] [US1] Row 16: migrate `src/editors/assignLoop/parts/GalleryEmptyState.tsx` to Back only (new `gallery-empty-back`), with no forward slot
- [X] T034 [US1] Resolve publisher ownership between the galleries and their IntroSplash / GalleryEmptyState children: exactly one hook call is live per rendered screen (the gallery must not publish while the splash or the empty state is shown). Add a test that renders each gallery in its splash state and asserts a single Back (FR-013; depends on T029 to T033)
- [X] T035 [P] [US1] Row 17: migrate `src/editors/touchSeedSource/TouchSeedSourcePanel.tsx` (`seed-source-back`; `seed-source-confirm` labelled from `showDraftWarning`; the draft warning stays in the body) and its tests
- [X] T036 [US1] Update `src/test/studioShellMocks/{BaseResolution,CarveGalleryV2,MechanismGallery,TouchGallery,TouchSeedSourcePanel,FlowStepHost}.tsx` to publish through `usePublishStepNav` with the real handles, replacing any invented ones (FR-041), and make `StudioShell.test.tsx` pass
- [X] T037 [US1] Run `vitest run src/editors src/components`, then commit `feat(studio): editor steps publish their nav to the footer (spec 081 T027-T037)` and push

### Cross-step tests and e2e (one commit)

- [X] T038 [US2] Update `tests/steps/stepHost.goldenWalk.test.tsx` to mount the real `StudioFooter` (or `StepNavCluster` keyed on `activeStepId`) beside StepHost, so its per-step handle clicks resolve in the footer. Leave `tests/steps/stepHost.renderSmoke.test.tsx` passing unchanged
- [X] T039 [US2] Add parity assertions for US2 scenarios 1 to 7 (question cursor Back, marks station Back, gallery character Back, PhaseB empty Done disabled, Next description "question N of M", Enter-to-advance, touch press-twice) wherever a row's existing tests don't already cover them, in the row test files touched above (SC-002)
- [X] T040 [US3] Create `tests/steps/stepHost.navTransition.test.tsx`: drive StepHost plus the footer across every adjacent pair of manifest steps, forward, back and by dot jump. After each hop, assert that the footer buttons (excluding `progress-dot-row`) are only the new step's handles, that `getAllByRole("button", { name: /^(← )?Back$/ })` has at most 1 element, and that the step-to-output hop leaves no cluster (US3 scenarios 1 to 3, SC-005)
- [X] T041 [US1] Scope the e2e selectors from Appendix B: in `e2e/journey-strip-badges.spec.ts` (~168), use `footer.getByTestId("progress-dot-row").locator('[role="button"], button').first()`. Check that `e2e/footer-progress.spec.ts`, `e2e/copy-edit.spec.ts`, `e2e/exemplar-prefill.spec.ts`, `e2e/switch-base-exploration.spec.ts` and `e2e/switch-base-rebase.spec.ts` still pass, and edit them only for scoping or footer placement (FR-053)
- [X] T042 [US1] Run the full studio unit suite and `pnpm --filter @keyboard-studio/studio exec playwright test`, then commit `test(studio): nav transition test and e2e footer scoping (spec 081 T038-T042)` and push

**Checkpoint**: MVP. All 17 live rows are in the footer, behaviour is unchanged, and no
button is stale or duplicated. Stop here and validate (quickstart §1 to §4).

---

## Phase 4: US4 and US5, P2

**Goal**: Keyboard and screen-reader users get a fast, understandable path (US4). Every step
reached by moving forward has a Back, and every nav label is localised (US5).

**Independent test**: The rule 12 walk completes every row mouse-free; axe is clean in the
enabled, disabled and blocked states; the base resolution and Carve loading, error and empty
states each offer a working Back; French Carve shows `← Retour` / `Passer` / `Continuer →`.

### US4: keyboard and screen reader

- [ ] T043 [P] [US4] Add focus tests to `src/components/StudioFooter.a11y.test.tsx` and the SurveyRunner tests: pressing footer Next keeps focus on the same `<button>` across a question change, including the Next → Finish relabel and the case where Back disappears on question 1 (R-10); a step change remounts the cluster so focus does not carry over (FR-032); a disabled forward button's `aria-describedby` resolves to the in-body hint text for marks, mechanisms and touch (FR-033, US4 scenario 2)

### US5: back everywhere, localised

- [ ] T044 [US5] Give the loading, error and empty states of `src/editors/panels/BaseResolution.tsx` a published Back that behaves like the loaded state's Back, and add a test for each state (FR-015, A-4)
- [ ] T045 [US5] Give the loading state of `src/editors/carve/CarveGalleryV2.tsx` a published Back, and add a test (FR-015, A-4)
- [ ] T046 [US5] In `src/survey/convenience/ConvenienceCharsStep.tsx`, publish `back` only when `onBack` is defined, and add a test that no `convenience-back` is rendered without it (FR-015, A-3)
- [ ] T047 [US5] Localise Carve in `src/editors/carve/CarveGalleryV2.tsx` with the `t` macro under the restored ids `editor.carve.backButton` (`← Back`), `editor.carve.skipButton` (`Skip`), `editor.carve.continueButton` (`Continue →`) and `editor.carve.loadingKeyboard` (`Loading keyboard…`). Restore the fr values from `git show 1dbb5266^:packages/studio/src/locales/fr/messages.json` (`← Retour`, `Passer`, `Continuer →`, `Chargement du clavier…`). Then run `i18n-catalog-sort` and `i18n-catalog-lint` over `src/locales/{en,fr}/messages.json` (FR-043 to FR-045; the loading-id refinement in plan.md is awaiting reviewer sign-off). Add a French-locale Carve test (US5 scenario 4)
- [ ] T048 [US4] Run the rule 12 keyboard walk ([docs/accessibility.md](../../docs/accessibility.md)) on both tracks' golden paths using the Playwright CLI, recording whether the in-body "why blocked" hint is noticeable from the footer (FR-042, FR-054)
- [ ] T049 [US4] Record dated evidence in `specs/056-ada-accessibility/wcag-2.2-aa-tracker.md` for rows 2.4.3, 2.4.11, 2.5.8, 3.2.3 and 3.2.4 (naming the T005, T040, T043 tests and the T048 walk), and annotate rows 1.4.10 and 2.4.1. Flip a row to `pass` only with named evidence (FR-035)
- [ ] T050 Run the studio unit suite, e2e and `pnpm lint`, then commit `feat(studio): footer nav a11y, back in every state, Carve i18n (spec 081 T043-T050)` and push

**Checkpoint**: US4 and US5 verified. SC-008 and SC-009 are met.

---

## Phase 5: US6 and US7, P3

**Goal**: The footer fits at every width and pointer type (US6), and the dormant
inheritance-posture step follows the convention (US7).

**Independent test**: quickstart §5 measurements pass; `InheritancePostureStep.test.tsx`
finds its buttons in the footer.

### US6: fit

- [ ] T051 [US6] Script quickstart §5 with the Playwright CLI: open the touch per-character gallery at widths 1600, 1024, 768, 530 and 375 under fine and coarse pointers, and assert height `=== 40` (fine) and `<= 52` (coarse), no nav button with `scrollWidth > clientWidth`, the current dot inside the row viewport, and at 375 px a hidden project label and no page horizontal scroll. Record the results in the commit message. If a check fails, fix the degrade order in `src/components/StudioFooter.tsx` (FR-020 to FR-024, SC-006, SC-007)
- [ ] T052 [P] [US6] Add an amendment note to §6 of `specs/079-survey-answer-persistence/contracts/journey-strip-contract.md`: a fixed 40 px under a fine pointer and up to 52 px under a coarse pointer, citing spec 081 FR-020a

### US7: inheritance posture

- [ ] T053 [P] [US7] Row 18: migrate `src/adaptation/InheritancePostureStep.tsx` (Back and "Confirm and continue", keeping its existing handles or adding `inheritance-back` / `inheritance-confirm`) and move `src/adaptation/InheritancePostureStep.test.tsx` to `withStepNav`

### Follow-ups

- [ ] T054 File the follow-up issues with `gh issue create`, each referencing #1778: `maint(studio): delete dead TrackStep and ProjectNameStep panels` (FR-007); `feat(studio): skip link or primary-action shortcut to the footer nav` (FR-031, tracker 2.4.1); and, only if the T048 walk found the hint not noticeable, `feat(studio): visible cue next to a disabled footer forward button` (FR-042)
- [ ] T055 Commit `feat(studio): footer fit, inheritance posture nav, 079 §6 amendment (spec 081 T051-T055)` and push

---

## Phase 6: Polish and cross-cutting

- [ ] T056 Run `node utilities/spec-trace check` and acknowledge the intended drift in `specs/081-footer-step-nav/*` and the 079 contract
- [ ] T057 Run the whole [quickstart.md](quickstart.md) (§1 to §7) as a final pass, and `pnpm lint` from the repo root
- [ ] T058 Reconcile #1778's acceptance-criteria checkboxes against the shipped diff (CLAUDE.md issue closure policy), then hand off to `km-archivist` to open the PR against `main` with `refs #1778` or `closes #1778`. Do not merge

---

## Dependencies and execution order

### Phase dependencies

- **Phase 1 (Setup)**: none.
- **Phase 2 (Foundational)**: depends on Phase 1 and blocks every story. Within it: T006 → T007 → T012; T006 + T008 → T010 → T011 / T013; T009 → T011.
- **Phase 3 (P1)**: depends on Phase 2. The survey group (T018 to T026) and the editor group (T027 to T037) are independent of each other. T038 to T042 depend on both.
- **Phase 4 (P2)**: depends on Phase 3. T044 and T045 depend on T027 and T028. T046 depends on T024. T047 depends on T028. T048 depends on T043 to T047. T049 depends on T048.
- **Phase 5 (P3)**: T051 depends on Phase 3. T052 and T053 depend only on Phase 2. T054 depends on T048.
- **Phase 6**: depends on everything else.

### User story dependencies

- **US1, US2 and US3**: delivered together by the row migrations. US2 and US3 have no work separate from US1 beyond their tests (T038 to T040).
- **US4 and US5**: need the migrated rows.
- **US6**: needs the migrated rows for realistic label widths.
- **US7**: needs only Phase 2.

### Parallel opportunities

- Phase 2: T003, T004 and T005 (tests); T006, T008 and T009 (independent files); then T013 and T014.
- Phase 3 survey: T020, T022, T023, T024 and T025 are separate files (T018 and T021 are larger and run on their own).
- Phase 3 editors: T027, T028, T029, T032, T033 and T035 are separate files; T030 → T031 share TouchGallery.
- Phase 5: T052 and T053 alongside T051.

## Parallel example: Phase 3 survey rows

```text
Task: "Row 2: migrate src/survey/Prefill.tsx and its tests"
Task: "Row 5: migrate src/survey/punctuation/PunctuationStep.tsx and its tests"
Task: "Row 6: migrate src/survey/invisibles/InvisiblesStep.tsx and its tests"
Task: "Row 7: migrate src/survey/convenience/ConvenienceCharsStep.tsx and its tests"
Task: "Row 8: migrate src/survey/marks/MarksSeriesStep.tsx and its tests"
```

## Implementation strategy

### MVP (Phases 1 to 3)

1. Build the channel and harness (Phase 2). Nothing is visible yet.
2. Migrate SurveyRunner first (T018), because row 1 covers every question-flow step and proves
   the pattern.
3. Migrate the remaining survey rows, then the editor rows, committing per group.
4. Add the transition test and e2e scoping. **Stop and validate** with quickstart §1 to §4.

### Incremental delivery

Following the plan's one-phase-per-conversation rule: Phase 2 (+1) → Phase 3 (MVP, #1778's core
ask) → Phase 4 (a11y and defect fixes) → Phase 5 (fit and dormant step) → Phase 6. Each phase
ends with a green commit pushed to `km/footer-step-nav`.

## Notes

- Never render a nav button in both the body and the footer, even between two commits (FR-001).
- A row's parity baseline is its existing test passing unchanged; if an assertion has to
  change, it is a behaviour change and needs a note in the commit.
- No issue numbers in code or comments (spec §18).
