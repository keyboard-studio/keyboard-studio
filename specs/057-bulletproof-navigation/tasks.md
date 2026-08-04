# Tasks: Bulletproof navigation

**Feature**: 057-bulletproof-navigation · **Branch**: `057-bulletproof-navigation`
**Inputs**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/location-grammar.md](contracts/location-grammar.md), [contracts/ui-contract.md](contracts/ui-contract.md)

**Size**: `normal` (no `size` recorded in `.spec-context.json`) — full phased list.

All paths are repo-relative. Every task names the concrete file it creates or edits.

**Format**: `- [ ] **T###** [P] [US#] Description · path`
`[P]` = independent of the other tasks in its wave (different file, no incomplete dependency), so it can be built in any order or in parallel. A wave of one carries no `[P]`.

**Ordering constraint that shapes Phase 1**: FR-080 requires the two gating E2E specs to be *written and demonstrated red against the pre-fix tree* before the fix lands. That is why they are authored in Setup, not inside their stories.

---

## Phase 1: Setup & gating baseline

Establishes the shared E2E step and captures the red evidence FR-080 demands. Nothing here changes product behaviour.

**Wave 1 — one task (blocks both gating specs):**

- [x] **T001** [US1] Add a `switchTab(page, route)` step driver (the one shared tab-switch helper — no inline hash assignment in any spec, FR-082). **Select tabs by `nav a[href="#${route}"]`, never by visible label text**: the route token stays `preview` (contract §1) while the label flips to Compare in T032, so a text-based selector would break this shared helper across the red/green boundary · `packages/studio/e2e/helpers/surveyFlow.ts`

**⟶ Wait for T001, then — independent (different files):**

- [x] **T002** [P] Ensure Chromium binaries are present for this Playwright version (`npx playwright install chromium` from `packages/studio`); record the version used. Gates **T005 only** — the specs can be authored without it · no file change — note the result in the evidence file created by T005
- [x] **T003** [P] [US1] Write the gating spec: drive the walk to a mid-flow step, round-trip through each of the other four tabs via `switchTab`, and after each return assert same step on screen, in-app Back still reaches the prior step, and (for the characters case) the built alphabet intact; call `expectNoSeriousAxeViolations` on each screen visited · `packages/studio/e2e/tab-roundtrip.spec.ts`
- [x] **T004** [P] [US2] Write the gating spec: establish a working copy, snapshot observable project state through the app's own surfaces, run an adversarial Compare session, return, and assert the project is unchanged with no rebase-confirm dialog raised.

  **Red-reason discipline — this is why the task is worded at this level of detail.** FR-080 requires the spec to fail *for the right reason*, and the spec.md guidance "model the adversarial shape on `switch-base-exploration.spec.ts` / `switch-base-rebase.spec.ts`" points at the wrong component: those drive `editors/panels/BaseResolution.tsx` (which has `base-card-*` and `base-confirm` test ids). This tab's picker is `components/BaseKeyboardPicker.tsx` — a plain combobox with **zero `data-testid`** and **no confirm button**, where selecting an option calls `commit()` and fires `onChange` immediately. Reuse only those specs' **option-selection idiom** (`[id$="-opt-${id}"]`); a literal port of their confirm-button idiom dies on selector-not-found, which is a worthless red.

  The spec MUST contain: (a) an **identity-control-absence** assertion — `TrackOneIdentityPanel` is mounted live in the pane today (`TrackOneIdentityPanel.tsx:80,94`) and is removed by T033, so this is the deterministic anchor that goes red for an unambiguously right reason, independent of dialog timing; (b) a `page.on('dialog')` harness that **counts** dialogs regardless of action; (c) two branches — one that **dismisses** and one that **accepts**, the accept branch asserting real post-state (baseId, phaseResultsCount) through the `window.__ksE2E__` hook. A dismiss-only test is a non-signal both pre- and post-fix, and FR-025's adversarial requirement needs the accept branch. The write path under test is `usePreviewArtifact.ts:97` → async compile settle → `onInstantiate` at `usePreviewArtifact.ts:172-176` → `confirmRebase.ts:126-142`, which calls `window.confirm` **asynchronously off the decoupled pipeline**, not synchronously on the click · `packages/studio/e2e/compare-isolation.spec.ts`

**⟶ Wait for T002, T003 and T004, then:**

- [x] **T005** Run both gating specs against the current (pre-fix) tree and record the red output verbatim, **including which assertion failed in each** — an E2E spec that has never been seen red is not evidence, and a spec that went red on a missing selector is not evidence either (FR-080, SC-013). **Restart `pnpm dev` before the run**: `reuseExistingServer: true` means an already-running dev server is used as-is, so an un-restarted one can silently retest a stale build · `specs/057-bulletproof-navigation/evidence/gating-red.md`

**Checkpoint**: both gating specs exist, neither is `.skip`-ped (FR-083), and both are on record as failing.

---

## Phase 2: Foundational

The single location vocabulary (FR-001, FR-006, FR-010…FR-014), the session-scoped view-state store, and the one project-label derivation. **Blocks every story below.**

> **T006 (the D-1 deletion) is NOT in this phase.** It was here in the first draft on the reading that every later story depends on a wizard that remembers its position. That reading did not survive review: US2 and US5 do not depend on it at all, and US4 only depends on it for the dot click-through, so it fails the "blocks all stories" test that defines this phase. Worse, landing the deletion here would put it *before* T020–T022 rewrite the three existing suites that encode the old reset contract, opening an unplanned red window on unrelated tests. T006 now lands in Phase 3 beside T023. See the note there.

**Wave 1 — independent (different files):**

- [x] **T007** [P] Create the hash grammar: `Location` interface, `parseLocation(hash)` (returns `null` on a parse failure — trailing slash, empty segment, `question` without `step`, or a segment outside `[a-z0-9_]`), `formatLocation(loc)` including the leading `#` · `packages/studio/src/lib/location.ts`
- [x] **T008** [P] [US5] Create the session-scoped view-state store: slots `flowMapSection`, `trailCollapsedSteps`, `trailShowSuperseded`, `paneSplitPct`, `oskMode`, `scrollTop`, `compareSelection`, plus `reset()`. Module-level zustand singleton, no storage layer (FR-051, FR-053, Q9) · `packages/studio/src/stores/viewStateStore.ts`
- [x] **T009** [P] [US4] Extract the one project-label precedence — `deriveProjectLabel(input)`: **scaffold spec display name → working-copy identity-patch display name → base keyboard display name → `null`**. This is FR-041's stated order, and it is already shipped verbatim in `draftPersistence.ts:477-481` (the engine behind the "My keyboards" cards). Research D-8 concluded the opposite by examining `draftAutosave.deriveLabel` instead — see the correction in [research.md](research.md) D-8 · `packages/studio/src/lib/projectLabel.ts`

**⟶ Wait for Wave 1 to finish, then:**

- [x] **T010** [P] Unit-test the grammar: `parseLocation(formatLocation(loc))` deep-equals `loc` for every valid shape, plus the full parse-failure matrix from the contract · `packages/studio/src/lib/location.test.ts`
- [x] **T011** [P] Create the pure resolver: `resolveLocation(loc, ctx): LocationResolution` over the closed `UnreachableReason` set (`step-not-in-build`, `question-not-in-build`, `skipped-by-track`, `beyond-gate`, `no-project`); a `degraded` result's `to` must itself resolve `reachable`, found by dropping `question`, then `step`, then falling back to the route (FR-012, FR-013, FR-014) · `packages/studio/src/lib/resolveLocation.ts`
- [x] **T012** [P] Widen `navigateTo` with a `Location` overload, keeping the `RouteId` signature so every current call site compiles unchanged; the module stays the only writer of `window.location.hash` (FR-006) · `packages/studio/src/lib/navigate.ts`
- [x] **T013** [P] [US5] Unit-test the store: every slot's initial value, `paneSplitPct` clamping on read, `scrollTop` keyed by stable pane id, and `reset()` clearing every slot · `packages/studio/src/stores/viewStateStore.test.ts`
- [x] **T014** [P] [US4] Unit-test the project-label precedence across all four tiers including blank-string skips, plus the case that currently distinguishes the two engines — `identityResult` present and disagreeing with `scaffoldSpec` — which has zero existing coverage (spec Test surface) · `packages/studio/src/lib/projectLabel.test.ts`
- [x] **T015** [P] [US4] Converge **both** shipped draft engines on `deriveProjectLabel` so the footer is not a fourth derivation (FR-041): `draftPersistence.saveDraft`'s inline `displayName` computation (lines 477-481, already this order — a pure substitution) **and** `draftAutosave.deriveLabel` (lines 180-187, currently identity-english-first — a real behaviour change). The `deriveLabel` change is visible only in `ResumeDraftBanner.tsx:90`'s quoted name, and only when `identityResult` disagrees with `scaffoldSpec`; "My keyboards" card labels are unaffected because they already run through `draftPersistence` · `packages/studio/src/lib/draftAutosave.ts`, `packages/studio/src/lib/draftPersistence.ts`

**⟶ Wait for T011 and T012, then:**

- [x] **T016** [P] Unit-test the resolution matrix: one case per `UnreachableReason`, each `degraded` case asserting its `to` resolves `reachable` against the same `ctx`, and referential transparency (spec Test surface) · `packages/studio/src/lib/resolveLocation.test.ts`
- [x] **T017** [P] Create the ONE jump primitive: `jumpToLocation(loc, opts?)` → `arrived` | `refused` | `degraded`; resolves, then either sets the traversal target and navigates or surfaces the refusal — never partially arrives (FR-012). Carries `opts.returnTo` for FR-034 · `packages/studio/src/lib/jumpToLocation.ts`

**⟶ Wait for T017, then:**

- [x] **T018** [P] Unit-test the jump primitive: arrival sets the traversal target *and* navigates; a refusal does neither; a degrade lands on the ancestor and reports the reason; `returnTo` is retained for the caller · `packages/studio/src/lib/jumpToLocation.test.ts`
- [x] **T019** [P] Teach `hashToRoute` to parse a full `Location` via `parseLocation`, falling back to `defaultLandingRoute()` on an unknown route token exactly as today, and route on the parsed location (FR-010, FR-011) · `packages/studio/src/StudioShell.tsx`

**Checkpoint**: the location vocabulary exists, is unit-proven, and the traversal reset is gone. No surface consumes it yet.

---

## Phase 3: User Story 1 — Leave a tab and come back to exactly where you were (P1)

**Goal**: the wizard's step, history, characters substage and Phase B alphabet survive every tab round trip, and all four entry points land where they say they land.

**Independent Test**: drive the wizard past the first step, navigate to each of the other four tabs in turn and back, asserting `activeStepId`, `history`, the characters substage and the Phase B alphabet unchanged each time, and that the durable draft written after the round trip still records the same position.

### Tests

Written to encode the *new* contract — these files currently encode the old one and are rewritten, not deleted (FR-072).

**Wave 1 — independent (different files):**

- [x] **T020** [P] [US1] Rewrite the route/landing tests to assert traversal is preserved across a simulated route change, and that a reset occurs only on an explicit start-over (FR-002, FR-003) · `packages/studio/src/StudioShell.test.tsx`
- [x] **T021** [P] [US1] Rewrite the substage test: re-entering the characters step at its build-list substage must not clear the Phase B draft alphabet; clearing stays tied to a genuine prefill → build-list transition (FR-007, D-4) · `packages/studio/src/survey/CharactersStep.test.tsx`
- [x] **T022** [P] [US1] Extend for the preserved-position case: mount-time entry tagging now agrees with a preserved store, `expectedBackTarget` computed from preserved history matches the pre-departure entries, and a `state === null` tab-switch entry is treated as foreign and no-ops (FR-017, D-9) · `packages/studio/src/hooks/useSurveyBrowserHistorySync.test.ts`

### Implementation

> **T006 and T023 must land in the same wave — they are one change split across two files.** T006 removes `resetOrRestoreSettledRef`, which is the *antecedent* of the DEV ordering guard in `useSurveyBrowserHistorySync.ts` (~lines 118-130); T023 re-points that guard. If they land apart, the guard does not crash — it goes **silently inert** (its optional parameter becomes `undefined`, so the check never runs), which is precisely the unprotected-reordering risk research D-9 warns about. Silent inertness is worse than a failure, because nothing surfaces it.

**⟶ Wait for the tests above, then — independent (different files), T006 and T023 landing together:**

- [x] **T006** [P] [US1] Delete `SurveyView`'s mount-time `useSurveySessionStore.getState().reset()` together with its `wasDraftRestoredThisBoot()` guard and the now-antecedent-less `resetOrRestoreSettledRef`; update the "navigating away and back is a fresh wizard" comment to state the new contract (FR-002, FR-003, D-1 — this one deletion also resolves D-2, D-3 and D-4) · `packages/studio/src/StudioShell.tsx`
- [x] **T023** [P] [US1] Re-derive the history bridge: rewrite the module docstring's premise (the remount no longer re-tags a *reset* store) and re-point the DEV ordering guard at draft-restore settlement, the antecedent that genuinely remains. Both accepted degrades stay closed — browser Forward is a deliberate no-op, the first native Back after an in-app Back is absorbed (FR-016, FR-017) · `packages/studio/src/hooks/useSurveyBrowserHistorySync.ts`
- [x] **T024** [P] [US1] Verify `handleGoToGallery` (the coverage-blocked banner's "go finish them now") lands on the incomplete gallery rather than the identity question, and fix if the deletion did not fully resolve it (FR-005, FR-008, D-3) · `packages/studio/src/components/OutputScreen.tsx`
- [x] **T025** [P] [US1] Verify "← Back to studio" returns to the step the author left (FR-005, FR-008, D-3) · `packages/studio/src/components/ProfileScreen.tsx`
- [x] **T026** [P] [US1] Verify the Phase-F → `#output` hop leaves a way back into the walk that preserves position (FR-005, FR-008, D-3) · `packages/studio/src/components/StepHost.tsx`
- [x] **T027** [P] [US1] Remove `handleResume`'s dependence on `wasDraftRestoredThisBoot()` as the thing that makes resume work, and retire the apologetic docstring — a navigation primitive must not require an unrelated durable-storage read first (FR-005) · `packages/studio/src/lib/draftPersistence.ts`

**⟶ Wait for the implementation wave, then:**

- [x] **T028** [P] [US1] Integration test covering all four entry points (coverage banner, "Back to studio", "Resume", Phase F hop) landing on their stated target — written so it fails if a future mount reset reappears (FR-008, SC-004) · `packages/studio/src/components/wizardEntryPoints.test.tsx`
- [x] **T029** [P] [US1] Restart `pnpm dev`, then run `e2e/tab-roundtrip.spec.ts` green and append the passing output beside the recorded red run (SC-001, SC-013) · `specs/057-bulletproof-navigation/evidence/gating-red.md`

**Checkpoint**: US1 is independently functional and testable — a tab round trip at any point in the walk preserves position and content, and the red→green transition is on record.

---

## Phase 4: User Story 2 — Compare another keyboard without risking your own (P1)

**Goal**: the tab is labelled Compare in every locale and has **no reachable write path** into the author's project — an absence, not a guard.

**Independent Test**: instantiate a working copy, record its full state, then on Compare load a *different* keyboard, exercise every control the tab offers, and assert the working copy's base, identity, phase results, carve layer, assignments and decision record are identical, with no confirmation dialog offered.

### Tests

- [x] **T030** [US2] Rewrite the preview-screen test as a Compare test asserting the shared-store behaviour is *gone*: no `setIdentity` path, no `onInstantiate`, no rebase dialog, no `useWorkingCopyTransform` (FR-021, FR-022, FR-025, FR-072) · `packages/studio/src/components/CompareShell.test.tsx` (replaces `PreviewShell.test.tsx`)

### Implementation

**⟶ Wait for T030, then — independent (different files):**

- [x] **T031** [P] [US2] Create the read-only pipeline hook: calls `useKeyboardArtifact` with **no** `onInstantiate`, does **not** call `useWorkingCopyTransform`, and returns no setter that writes `workingCopyStore`, `surveySessionStore`, `phaseBDraftStore` or `decisionLogStore`. `usePreviewArtifact` is neither modified nor renamed (FR-023, FR-026, D-6) · `packages/studio/src/hooks/useCompareArtifact.ts`
- [x] **T032** [P] [US2] Retire `nav.preview`, `preview.heading`, `preview.pane.label` and add `nav.compare`, `compare.heading`, `compare.pane.label` in both catalogs; the retired ids must not be left claiming a translation, and the new ids start untranslated in `fr` because they are different strings about a different thing (FR-020, FR-073, D-8) · `packages/studio/src/locales/en/messages.json`, `packages/studio/src/locales/fr/messages.json`

**⟶ Wait for T031 and T032, then:**

- [x] **T033** [US2] Create the Compare screen: loads and runs a foreign keyboard and shows its source, drops `TrackOneIdentityPanel` and the scaffold-form path entirely, and exposes no editing control at all (FR-023, FR-024) · `packages/studio/src/components/CompareScreen.tsx`

**⟶ Wait for T033, then — independent (different files):**

- [x] **T034** [P] [US2] Delete `PreviewScreen.tsx` and rewire the `preview` route to render `CompareScreen`; the route **token** stays `preview` so bookmarks and hash assertions survive (contract §1) · `packages/studio/src/components/PreviewScreen.tsx` (delete), `packages/studio/src/StudioShell.tsx`
- [x] **T035** [P] [US2] Persist the loaded keyboard and OSK mode in `viewStateStore.compareSelection` so the selection survives a tab switch and dies on reload (Q5, US2 scenario 3) · `packages/studio/src/components/CompareScreen.tsx`

**⟶ Wait for T034 and T035, then — independent (different files):**

- [x] **T036** [P] [US2] Sweep the rename across every surface that names *this tab* — nav labels, aria labels, headings, message ids, unit tests, e2e specs, docs. Leave the unrelated uses untouched: `usePreviewArtifact`, `basePreviewStatusStore`, the Studio tab's live OSK preview, `editor.assignLoop.preview.heading`, and the `preview` route token (FR-026, SC-006) · `packages/studio/src/**`, `docs/**`
- [x] **T037** [P] [US2] Extend the locale spec to assert the Compare label in a non-English locale (FR-020, SC-006) · `packages/studio/e2e/locale-switch.spec.ts`

**⟶ Wait for T036 and T037, then:**

- [x] **T038** [US2] Restart `pnpm dev`, then run `e2e/compare-isolation.spec.ts` green and append the passing output beside its recorded red run — the accept-branch assertion from T004 must now pass without a dialog ever being raised (SC-005, SC-013) · `specs/057-bulletproof-navigation/evidence/gating-red.md`

**Checkpoint**: US2 is independently functional and testable — an adversarial Compare session provably cannot touch the project, and no author-facing surface calls this tab "Preview".

---

## Phase 5: User Story 3 — Jump from a recorded decision back to the decision point (P2)

**Goal**: every trail entry either offers a working jump or states why it cannot, and revising through a jump is an ordinary append-only revisit.

**Independent Test**: from a completed walk, activate the deep link on an entry from an early step; assert the wizard is on that step and question with the recorded value present; change it; assert the record gained a new entry whose `supersedes` names the old one and that downstream steps were marked stale.

### Tests

- [x] **T039** [US3] Test the row's affordance: a reachable entry renders a jump control, an unreachable one renders the reason in place of a link, and mounting the trail resolves no impact (FR-030, FR-035, FR-036) · `packages/studio/src/decisions/DecisionEntryRow.test.tsx`

### Implementation

**⟶ Wait for T039, then — independent (different files):**

- [x] **T040** [P] [US3] Add `trail.jump.label` and one `trail.jump.unreachable.*` id per `UnreachableReason`; these are shared by the trail and the footer's upcoming dots (FR-035, FR-045, FR-048) · `packages/studio/src/locales/en/messages.json`, `packages/studio/src/locales/fr/messages.json`
- [x] **T041** [P] [US3] Hold the requested `Location` in a module-level pending slot before the welcome gate's `replaceState` to `#welcome`, and consume it in `leaveWelcome` through `jumpToLocation` so reachability rules apply; keep the `replaceState` itself, which exists to avoid the same-value-hash soft-lock (FR-015, D-10) · `packages/studio/src/StudioShell.tsx`

**⟶ Wait for T040, then:**

- [x] **T042** [US3] Add the jump affordance to each trail row, built from the `stepId` and `payload.questionId` the entry already carries; call `jumpToLocation` with `returnTo` set to the trail location, and render the pre-resolved reason instead of a dead control when unreachable (FR-030, FR-031, FR-035, FR-036) · `packages/studio/src/decisions/DecisionEntryRow.tsx`

**⟶ Wait for T042, then:**

- [x] **T043** [US3] Implement revise-and-return: confirming an answer reached by deep link returns the author to the `returnTo` location with staleness re-propagated through the existing mechanism, and offers an explicit "continue from here instead" — not a prompt on every revision (FR-032, FR-033, FR-034, Q3) · `packages/studio/src/components/StepHost.tsx`

**⟶ Wait for T043, then — independent (different files):**

- [x] **T044** [P] [US3] Integration test: deep link → revise → supersede → staleness, asserting exactly one new entry linked to the one it replaces and the same steps marked stale as the ordinary walk would (SC-008) · `packages/studio/src/decisions/deepLinkRevision.test.tsx`
- [x] **T045** [P] [US3] E2E: complete a walk, open Decisions, activate the link on an early answer, assert arrival on that question with the recorded value present, change it, assert the trail shows the supersession and dependent steps went stale; call `expectNoSeriousAxeViolations` · `packages/studio/e2e/decision-deeplink.spec.ts`
- [x] **T046** [P] [US3] Test that a first-time visitor opening a shared deep link lands on the requested location after the welcome screen rather than the default landing route (SC-012) · `packages/studio/src/StudioShell.test.tsx`

**Checkpoint**: US3 is independently functional and testable — any recorded decision reaches its decision point, or a stated reason, in one activation.

---

## Phase 6: User Story 4 — See the project and its progress at all times, and click back into it (P2)

**Goal**: a narrow footer names the project and shows the whole journey — completed questions and the stages still ahead on this author's path — with every mark a real, reachable control.

**Independent Test**: complete a known number of questions; assert the row contains exactly those completed questions plus the stages still projected on this author's path, with nothing off-path present; assert question and stage dots are distinguishable by size or shape and not colour alone; assert each dot's accessible name is its label; assert activating a reached dot lands on it while an upcoming-stage dot behind a gate is refused with a reason.

This phase builds the strip with completed and upcoming marks. The current-position marker is US6, so the strip is useful before US6 lands and US6 cannot block it.

### Tests

- [x] **T047** [US4] Unit-test the row derivation against fixtures: completed dots from a record *including a revision* (exactly one dot — `effectiveEntries` collapses the chain), `PRE_IDENTITY_STEP_ID` entries producing no dot, a truncated record yielding dots only for surviving entries, look-ahead from a fixture projected path, path-scoping (nothing off-path in any class), row growth when an optional question is reached, and tail re-projection when a branch resolves without removing completed dots (FR-042, FR-049) · `packages/studio/src/decisions/progressDots.test.ts`

### Implementation

**⟶ Wait for T047, then — independent (different files):**

- [x] **T048** [P] [US4] Assemble the journey row: completed dots from `effectiveEntries(record.entries)` filtered to `payload.kind === "survey-answer"` in record order, upcoming-stage dots **read** from `dashboard/manifestProjection.ts` rather than re-derived (FR-049b), each dot carrying its `location`, its localized `label` via `createLookupQuestionLabel`, and a pre-resolved `LocationResolution` (FR-042, FR-049) · `packages/studio/src/decisions/progressDots.ts`
- [x] **T049** [P] [US4] Add `footer.ariaLabel`, `footer.project.label`, `footer.dot.completed.ariaLabel`, `footer.dot.current.ariaLabel`, `footer.dot.upcoming.ariaLabel`, `footer.overflow.label`. The upcoming name must announce "not yet reached"; the current name must read as "you are here", not as completed progress. No `breadcrumb.*` id set — the footer **is** the breadcrumb (FR-048, Q7) · `packages/studio/src/locales/en/messages.json`, `packages/studio/src/locales/fr/messages.json`

**⟶ Wait for T049, then:**

- [x] **T050** [US4] Build one mark as a real `<button type="button">` with its label as accessible name, hover revealing the same label as a shortcut rather than the mechanism, question and stage classes differing by **size or shape as well as colour**, non-text contrast ≥ 3:1 and a visible focus indicator (FR-043, FR-044, FR-046) · `packages/studio/src/components/ProgressDot.tsx`

**⟶ Wait for T048 and T050, then:**

- [x] **T051** [US4] Build the footer landmark: `<footer>` with `footer.ariaLabel`, the project name via `deriveProjectLabel`, and the dot row; activating a reached dot calls `jumpToLocation` — the same primitive as the trail's deep links, not a second one — and an upcoming dot behind a gate is refused with its `beyond-gate` reason. Styled from existing theme tokens, no new hard-coded colours (FR-040, FR-041, FR-045) · `packages/studio/src/components/StudioFooter.tsx`

**⟶ Wait for T051, then — independent (different files):**

- [x] **T052** [P] [US4] Mount the footer on every tab where a project exists; absent — not an empty shell — on Welcome and wherever there is no project to name (FR-040, Q6, US4 scenario 5) · `packages/studio/src/StudioShell.tsx`
- [x] **T053** [P] [US4] Handle overflow: when the mark count exceeds the available width the row degrades legibly with every mark still reachable, no silent truncation and no horizontal overflow of the page body (FR-047) · `packages/studio/src/components/StudioFooter.tsx`

**⟶ Wait for T052 and T053, then — independent (different files):**

- [x] **T054** [P] [US4] E2E: assert the row's full composition against a scripted walk, that question and stage dots differ by size or shape, that a revision adds no dot, that reaching an optional question appends one, that an upcoming dot behind a gate is refused with a reason, and drive the footer **keyboard-only** (Tab to a dot, assert its accessible name, activate with Enter) asserting arrival · `packages/studio/e2e/footer-progress.spec.ts`
- [x] **T055** [P] [US4] Accessibility test: every dot reachable by Tab, named on focus, activated by both Enter and Space, focus visible, and `expectNoSeriousAxeViolations` clean on every tab with the footer present (SC-010) · `packages/studio/src/components/StudioFooter.a11y.test.tsx`

**Checkpoint**: US4 is independently functional and testable — the strip shows where the author has been and what is ahead, and is fully operable by keyboard alone.

---

## Phase 7: User Story 5 — Each tab remembers its own view (P3)

**Goal**: returning to a tab restores what the author had set up there, for the session only, with no authoring side effect.

**Independent Test**: on each tab, change every restorable view control, navigate away and back, and assert each control's state is as left — and that no compile or validation ran.

### Implementation

**Wave 1 — independent (different files):**

- [x] **T056** [P] [US5] Read and write the selected section from `viewStateStore.flowMapSection` instead of component `useState` (FR-050) · `packages/studio/src/dashboard/DashboardView.tsx`
- [x] **T057** [P] [US5] Read and write the per-stage collapse set and the replaced-decisions toggle from the store (FR-050) · `packages/studio/src/decisions/DecisionTrailView.tsx`
- [x] **T058** [P] [US5] Back the pane split with `viewStateStore.paneSplitPct`, clamped to each screen's existing `minPct`/`maxPct` on read so a stale value cannot produce an unusable split (FR-050) · `packages/studio/src/hooks/useResizablePanes.ts`
- [x] **T059** [P] [US5] Back the OSK desktop/touch toggle with `viewStateStore.oskMode` on both the Studio and Compare surfaces (FR-050) · `packages/studio/src/StudioShell.tsx`, `packages/studio/src/components/CompareScreen.tsx`
- [x] **T060** [P] [US5] Restore each scrollable pane's scroll offset from `viewStateStore.scrollTop`, keyed by a stable pane identifier rather than an array index (FR-050) · `packages/studio/src/hooks/useScrollRestoration.ts`

**⟶ Wait for Wave 1 to finish, then — independent (different files):**

- [x] **T061** [P] [US5] Call `viewStateStore.reset()` from exactly the two existing start-over paths — `handleStartOver()` and WelcomeScreen's "I'm new" — so view state clears with the session it belongs to (FR-052) · `packages/studio/src/StudioShell.tsx`, `packages/studio/src/components/WelcomeScreen.tsx`
- [x] **T062** [P] [US5] Integration test: every restorable control survives a route change and is cleared by start-over, and restoring view state triggers **no** compile and **no** validation run (FR-053, SC-011) · `packages/studio/src/stores/viewStateRestoration.test.tsx`

**Checkpoint**: US5 is independently functional and testable — every tab returns to how the author left it, for this session only.

---

## Phase 8: User Story 6 — Know where you are now, in the same strip that shows how far you have come (P3)

**Goal**: the footer answers "where am I" as well as "how far along" — the orientation half of the strip US4 built. There is no separate breadcrumb bar (Q7).

**Independent Test**: at three different points in the walk, assert the footer names the correct project, that the current position is marked distinguishably in the dot row by more than colour, and that the current question is identifiable by name without hovering.

### Implementation

**Wave 1 — independent (different files):**

- [x] **T063** [P] [US6] Add the `current` dot class to the row, sourced from **traversal state** rather than the decision record so it is per-question accurate inside a step whose answers are not yet recorded; position is read from the location model, never re-derived from the rendered component tree (FR-042, FR-060, FR-062) · `packages/studio/src/decisions/progressDots.ts`

**⟶ Wait for T063, then:**

- [x] **T064** [US6] Render the current marker with a non-colour cue as well as colour, an accessible name identifying the current question, and **no** jump target to itself (FR-046, FR-060, FR-061) · `packages/studio/src/components/ProgressDot.tsx`

**⟶ Wait for T064, then:**

- [x] **T065** [US6] Test: the marker moves when the author jumps back, and the dots ahead of the landing point are still present — a jump is navigation, not a truncation of progress (FR-063, US6 scenario 3) · `packages/studio/src/decisions/progressDots.test.ts`

**Checkpoint**: US6 is independently functional and testable — the strip carries orientation and progress in one surface.

---

## Phase 9: Polish

Cross-cutting: fold a tab round trip into the long walks so position survival is proven incidentally (FR-072), then validate against the Success Criteria.

**Wave 1 — independent (different files):**

- [x] **T066** [P] Insert a tab round trip mid-walk so the native Back sequence runs against a *preserved* position; the existing browser-Forward-is-a-no-op assertion stays as-is per FR-016 (SC-014, FR-017) · `packages/studio/e2e/browser-back.spec.ts`
- [x] **T067** [P] Add one mid-walk tab round trip via `switchTab` (FR-072) · `packages/studio/e2e/copy-edit.spec.ts`
- [x] **T068** [P] Add one mid-walk tab round trip via `switchTab` (FR-072) · `packages/studio/e2e/touch-derivation-us1.spec.ts`
- [x] **T069** [P] Add one mid-walk tab round trip via `switchTab` (FR-072) · `packages/studio/e2e/touch-derivation-us2.spec.ts`
- [x] **T070** [P] Update the E2E status paragraph with the four new specs and the `switchTab` helper, and correct any prose that still calls this tab "Preview" · `CLAUDE.md`, `docs/architecture.md`

**⟶ Wait for Wave 1 to finish, then — independent (different files):**

- [x] **T071** [P] Run `pnpm lint` and confirm `i18n-catalog-lint`, `content-i18n-lint` and the collapse guard pass with the retired and added ids, with no target-locale catalog claiming a translation for a retired id (FR-073) · no file change — record in the evidence file
- [x] **T072** [P] Run `pnpm typecheck` and `pnpm -r test` green · no file change — record in the evidence file

**⟶ Wait for T071 and T072, then:**

- [x] **T073** Restart `pnpm dev`, then run the full E2E suite deliberately and report it with its output — a green run is a named prerequisite for closing this feature, not an assumption (FR-081, SC-013) · `specs/057-bulletproof-navigation/evidence/e2e-green.md`
  - **Run done and reported; the run IS GREEN.** 66 passed / 0 failed / 3 skipped (serial) — [`evidence/e2e-green.raw.txt`](evidence/e2e-green.raw.txt), [`evidence/e2e-green.md`](evidence/e2e-green.md). Down from 17 failures pre-Class-B-fix, 2 in the first reported run, and 1 in the fourth. The named prerequisite is met. `pnpm lint` re-run green afterwards; the fixes touch only `e2e/**`, which the vitest and tsc lanes exclude by construction.
  - **The F2 P0 is resolved.** `switch-base-rebase.spec.ts:227` passes. It was two stacked defects, and the earlier "spec 057 regression" verdict was **wrong** — the same probe against main's `packages/studio/src` loses the working copy identically; the test passed on main only because a stale-draft read happened to match. Root cause: on a restoring boot `doCommit` re-derived the instantiation mode from a `selectedTrack` that had advanced since the original commit, so `resolveInstantiationCase` read same-id/different-mode as a genuine base switch and cleared `phaseResults`. Fixed in `StudioShell.tsx`'s mount-time seam (pre-seed `instantiatedForBaseIdRef`, install the real-project autosave there). → [`reviews/F2-reload-phaseresults-loss.md`](reviews/F2-reload-phaseresults-loss.md)
  - **The same fix closed an unshipped SC-001/SC-002 hole:** that re-commit also fired on a *route remount*, clearing the working copy on the adapt track — `phaseResults` 2 → 0 across `switchTab(preview) → switchTab(survey)`, measured; 2 → 2 after the fix. `tab-roundtrip.spec.ts` passed throughout, because its walk keeps the instantiation modes in agreement so the re-commit no-ops. Found by going past the failing assertion, not by the assertion itself.
  - **The last failure, `touch-derivation-us2`, is resolved — and it too was not spec 057's surface.** Recorded previously as spec 035's reseed step being broken; it was not. Playwright's own page snapshot showed the seed-source panel fully rendered and correct, with Reseed pressed — the **testid was stale**. Upstream commit `8709ff54` (2026-07-29) split the panel's preview column into two selection-keyed cards (so `seed-source-preview` cannot exist on the reseed path) and moved the reseed platform from `phone` to `tablet`. `TouchSeedSourcePanel.tsx`, `buildTouchLayoutJson.ts` and `scaffoldTouchLayout.ts` are byte-identical to `main`. → [`reviews/us2-stale-assertions.md`](reviews/us2-stale-assertions.md)
  - **Three of the four defects fixed there were silent, not failing.** Both tests read `touchJson.phone`, so every `for (const layer of touchJson.phone?.layer ?? [])` iterated an empty array and asserted nothing — Test 2 was reported "passing" on that basis — and a fourth assertion checked for copy ("…tablet/desktop touch platforms") that appears in no branch of the component, so it could never fail. The `<=10 keys/row` invariant was **removed rather than repointed** (it is a compact-*phone* invariant; the tablet skeleton's digit row is 11 keys wide) and replaced by a platform-key-set assertion that is strictly stronger for the AS4 discard proof.

**⟶ Wait for T073, then:**

- [x] **T074** Validate every Success Criterion SC-001…SC-014 against the recorded evidence, naming the test or run that establishes each · `specs/057-bulletproof-navigation/evidence/success-criteria.md`
  - All 14 validated against named evidence. **SC-013 and SC-014 upgraded to established** by this run (every `copy-edit` walk reaches a real download carrying the T067 tab round trip; `browser-back` passes with the round trip inserted). **SC-002 and SC-003 are established**, and now on evidence that actually reaches the reload path (F2 writes, refreshes and re-reads, and is green) rather than stopping at a remount. An interim revision of the evidence file had flipped SC-002 to contradicted and SC-003 to not-established on the strength of the F2 failure; that verdict has been withdrawn and the reason it was wrong is recorded in place. **SC-001 carries a new correction**: its shared remount mechanism was not sound on the adapt track until the F2 fix landed.
  - Remaining scope limit, stated rather than assumed: an edit made within `AUTOSAVE_DEBOUNCE_MS` (~500 ms) of a refresh is not yet on disk and does not survive. That is the autosave contract, it predates this feature, and no criterion claims otherwise.

---

## Dependencies & Execution Order

### Phase dependencies

```
Phase 1 Setup (gating baseline, must precede the fix — FR-080)
  ↓
Phase 2 Foundational (location vocabulary + view-state store + project label; BLOCKS all stories)
  ↓
Phase 3 US1 (P1) ──┐  carries the D-1 deletion (T006), so it gates US3, US4's
  │                │  click-through, and US6
Phase 4 US2 (P1) ──┤  independent of US1 — needs only Phase 2. Could run first.
  ↓                │
Phase 5 US3 (P2) ──┤  needs Phase 2's jumpToLocation AND Phase 3's T006
Phase 6 US4 (P2) ──┤  needs Phase 2's jumpToLocation + projectLabel; the dot row
  │                │  itself does NOT need T006, but T051's click-through does
Phase 7 US5 (P3) ──┤  needs Phase 2's viewStateStore + US2's CompareScreen (oskMode).
  │                │  Does NOT need T006.
Phase 8 US6 (P3) ──┘  needs Phase 6's progressDots/ProgressDot AND Phase 3's T006
  ↓
Phase 9 Polish
```

**Dependency on the D-1 deletion (T006), verified against the code rather than assumed** — this is what moved it out of Foundational:

| Story | Needs T006? | Mechanism |
|---|---|---|
| US1 | yes — it *is* the defect | `StudioShell.tsx:452-458` |
| US2 | **no** | isolation is structural in `useCompareArtifact`; no ordering coupling |
| US3 | yes | a trail deep link lands on `#survey`, forcing a fresh `SurveyView` mount whose reset clobbers the just-set jump target back to `"identity"` — `jumpToLocation` gets undone |
| US4 | **partially** | `progressDots` reads nothing from `surveySessionStore`; only T051's dot click-through hits the US3 clobber |
| US5 | **no** | `viewStateStore` is a separate singleton with its own `reset()`; no coupling either way |
| US6 | yes | the current marker reads `activeStepId` from traversal, so a reset makes it always read `"identity"` |

**MVP slice**: Phase 1 + Phase 2 + Phase 3 + Phase 4. That delivers the reported defect fixed and the destructive tab made safe — both P1 — and both gating specs red→green on record. Because US2 does not depend on T006, Phase 4 can be built before Phase 3 if the destructive tab is the more urgent risk.

### Waves per phase

- **Phase 1** — `T001` (the shared helper) blocks W2 `T002, T003, T004`; all three block `T005` (the red run). `T002` gates only `T005`, not the authoring of the specs.
- **Phase 2** — W1 `T007–T009` (location, view store, project label) blocks W2 `T010–T015` (grammar test, resolver, navigate widen, store test, label test, engine convergence); `T011`+`T012` block W3 `T016, T017`; `T017` blocks W4 `T018, T019`.
- **Phase 3** — W1 `T020–T022` (test rewrites) blocks W2 `T006, T023–T027` (**the deletion + history bridge, landing together** + four entry points) blocks W3 `T028, T029`.
- **Phase 4** — `T030` blocks W2 `T031, T032`; both block `T033`; `T033` blocks W4 `T034, T035`; those block W5 `T036, T037`; those block `T038`.
- **Phase 5** — `T039` blocks W2 `T040, T041`; `T040` blocks `T042`; `T042` blocks `T043`; `T043` blocks W5 `T044–T046`.
- **Phase 6** — `T047` blocks W2 `T048, T049`; `T049` blocks `T050`; `T048`+`T050` block `T051`; `T051` blocks W5 `T052, T053`; those block W6 `T054, T055`.
- **Phase 7** — W1 `T056–T060` (five independent surfaces) blocks W2 `T061, T062`.
- **Phase 8** — `T063` blocks `T064` blocks `T065`.
- **Phase 9** — W1 `T066–T070` blocks W2 `T071, T072` blocks `T073` blocks `T074`.

### Notes on shared files

`packages/studio/src/StudioShell.tsx` is edited by `T006`, `T019`, `T034`, `T041`, `T052`, `T059`, `T061` — always in different waves, never within one. Same for `progressDots.ts` (`T048`, `T063`), `ProgressDot.tsx` (`T050`, `T064`), `CompareScreen.tsx` (`T033`, `T035`, `T059`), `StudioFooter.tsx` (`T051`, `T053`), and the two locale catalogs (`T032`, `T040`, `T049`).

### Note on task IDs

IDs are stable handles, not document order. `T006` was drafted into Phase 2 and moved to Phase 3 during review; its number did not change, because the requirement→task coverage map in `.spec-context.json` references it. Read the phase headings for order, not the numbers.
