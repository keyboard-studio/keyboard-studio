# Tasks: Test-and-revise loop before publishing

**Input**: Design documents from `specs/094-test-and-revise/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/interfaces.md](contracts/interfaces.md),
[quickstart.md](quickstart.md)

**Tests**: These are included. The spec's success criteria (SC-002, SC-004, SC-004a, SC-005)
are measured by automated tests, per research R8.

**Path shorthand**: `engine/` = `packages/engine/src/`, `studio/` = `packages/studio/src/`,
`studio-tests/` = `packages/studio/tests/`, `e2e/` = `packages/studio/e2e/`.

**Commands**:

- `pnpm --filter @keyboard-studio/engine test`
- `pnpm --filter @keyboard-studio/studio test`
- `pnpm lint`
- Never run bare `vitest` at the repo root.

**Phase cadence**: one conversation per user-story phase (constitution, "One conversation per
phase"). Setup and Foundational ride with US1; Polish rides with US4. Each phase gets one commit
and push to `094-test-and-revise` when its gates are green.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4 from spec.md

---

## Phase 1: Setup

**Purpose**: Confirm the baseline so later byte-identity checks are meaningful.

- [ ] T001 Run `pnpm --filter @keyboard-studio/engine test` and `pnpm --filter @keyboard-studio/studio test` on the branch before any edit. Record pre-existing failures, if any, in the US1 phase commit message (Setup and Foundational ride with it) so they aren't attributed to this feature.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: The version resolver, the blocker helper, and the testing store with its
persistence. Every user story depends on these.

**[!] No user-story work begins until this phase is complete.**

### Version resolver (C1, research R1)

- [ ] T002 [P] Write the table test `engine/output/output-version.test.ts` covering every row of the R1 table:
  - Track 2 with V of 1/2/3 parts, with and without test builds;
  - Track 1 with P major ≥ 1, P = 0.b, and P = 0.0[.x] (`versionUnsupported`);
  - a non-integer V (`1.0a`, unsupported);
  - a V with more than three parts (unsupported);
  - for each track/shape: 1000 consecutive builds strictly increasing under segment-wise numeric
    comparison, all matching `^(0|[1-9]\d*)(\.(0|[1-9]\d*)){0,2}$`, each > V and < the publish
    version with `hasTestBuilds: true`;
  - `resolvePublishVersion({ hasTestBuilds: false })` equals today's behaviour (`bumpKeyboardVersion` for adapt, pass-through for copy) for a sample of corpus-shaped versions.
- [ ] T003 Implement `resolvePublishVersion` and `resolveTestBuildVersion` in the new `engine/output/output-version.ts`, per contracts C1. Delegate the existing bump to `bumpKeyboardVersion` in `engine/output/adapt-staging.ts`. Export both from `engine/index.ts`. T002 must pass.
- [ ] T004 Migrate the three "bump only on adapt" sites to `resolvePublishVersion`, passing `hasTestBuilds: false` for now (T009 wires the real value):
  - `studio/lib/serializeWorkingCopy.ts` (~:313-317)
  - `studio/hooks/useDocumentationFindings.ts` (~:58-59)
  - `deriveHistoryVersion` in `studio/editors/adapters/flowStepOptions.tsx` (~:400-403)

  Existing `serializeWorkingCopy*.test.ts`, `useDocumentationFindings` and `flowStepOptions` tests must stay green unchanged.

### Output blockers (C6, research R5)

- [ ] T005 [P] Write `studio/lib/outputBlockers.test.ts`. It asserts:
  - the priority order touchStale > coverage > license > attribution > notReady;
  - the `stepId` each blocker names (touch → `touch`, attribution → the language/identity step, coverage → none, because it keeps `backToUnfinishedGallery`);
  - `blocked === false` only when all inputs are clear;
  - the optional `versionUnsupported` blocker, which has no `stepId` and blocks only the test build.
- [ ] T006 Implement the pure `outputBlockers()` in the new `studio/lib/outputBlockers.ts`, per contracts C6. Message ids reuse the existing `output.status.*` and download aria-label ids.
- [ ] T007 Refactor `studio/components/OutputScreen.tsx` so the `downloadAriaLabel` ternary (~:233-279), the `kmpActionable`/`zipActionable` flags (~:283-284) and the `outputBlocked`/`outputBlockedReason` passed to `ManagedPRSubmitPanel` (~:762-776) all derive from `outputBlockers()`. Today, when attribution or license is the blocker, the PR panel reason falls through to "compile not complete". Fix that in `studio/components/ManagedPRSubmitPanel.tsx` (~:511-531) by passing the first blocker's reason. Extend `studio/components/ManagedPRSubmitPanel.test.tsx` with the attribution-blocked case. All existing `OutputScreen*.test.tsx` must stay green.

### Testing store and persistence (C4, research R6, data-model)

- [ ] T008 [P] Write `studio/stores/testingStore.test.ts`, covering:
  - `recordBuild` advances `nextBuildNumber` only on call (a failed build never calls it, FR-011);
  - `identicalTo` is set when the fingerprint matches the previous build;
  - `addReport` rejects an unknown `foundInBuild`;
  - the status transitions in data-model.md (markFixed, reopen clears `markedFixedAt`/`fixedInBuild`);
  - `recordBuild` stamps `fixedInBuild` on reports marked fixed since the previous build (FR-014);
  - `mergeRemote` unions by `buildId`/`reportId`, takes the maximum `nextBuildNumber`, and flags two builds that share a number with different ids;
  - `reset`;
  - every mutator is a no-op while frozen.
- [ ] T009 Implement the new `studio/stores/testingStore.ts` per contracts C4 and data-model.md. Use random ids from `crypto.getRandomValues`, 16 hex. Add a selector `useHasTestBuilds()`. Replace T004's hard-coded `hasTestBuilds: false` at all three sites with the store value:
  - `serializeWorkingCopy.ts` and `deriveHistoryVersion` (a plain `getState()` function, not a hook) read it non-reactively with `useTestingStore.getState()`;
  - `useDocumentationFindings` reads it through `useHasTestBuilds()` and adds it to its `useMemo` deps.

  A Phase F HISTORY proposal stamped before the first build keeps its old version in `historyEntryState`. That is harmless for output, because `renderHistoryMd` re-derives the heading from `opts.version` (`engine/shared/renderHistoryMd.ts:121`). T024(c) asserts it: a confirmed entry stamped at 1.2.4 renders a `1.3.0` heading once a build exists.
- [ ] T010 Add `TestingRecord`, `TestBuild` and `TesterReport` types and the optional `testing?: TestingRecord` field to `DurableDraft` in `studio/lib/draftTypes.ts`. It is additive, so do **not** bump `DRAFT_VERSION`. Add a comment following the existing additive-field notes (~:126-141).
- [ ] T011 Wire persistence in `studio/lib/draftPersistence.ts`:
  - `saveDraft` writes `testingStore.snapshot()`;
  - the local paths (`loadDraft`, `resumeProject` → `loadDraft`, and the pending slot) call `hydrate` with the envelope's record;
  - `applyRemoteDraft` (the cloud-restore banner's only path, `StudioShell.tsx:1348`) merges instead of replacing (R6). Merge the remote record with the **local record stored under `envelope.projectKey`** (read from `localStorage`), never with the live store. When the banner fires, the live store may hold a different project, and merging with it would leak that project's builds into this one. Then `hydrate` the merged result;
  - `installDraftAutosave` subscribes to `testingStore` on the existing 500 ms timer, with no new timer (D3 does not apply, but don't add one anyway).
- [ ] T012 Extend `studio/lib/draftPersistence.test.ts`:
  - a testing record round-trips through save, load and reload (SC-005);
  - a draft without `testing` loads unchanged;
  - `applyRemoteDraft` merges with the local stored record for the same project key rather than replacing it;
  - `applyRemoteDraft` for project B while the live store holds project A's builds yields only B's local and remote builds;
  - a frozen project writes nothing.
- [ ] T013 Reset `testingStore` in `handleStartOver` in `studio/StudioShell.tsx` (~:1237-1299), alongside the other store resets.

**Checkpoint**:

- The engine and studio suites are green.
- `pnpm lint` is green.
- No user-visible change yet, apart from the corrected PR-panel reason.

---

## Phase 3: User Story 1 - Revise a section and come straight back (Priority: P1) MVP

**Goal**: From Output, open any completed section, edit or abandon, and return to Output in one
action, including from full-layout steps.

**Independent Test**: Starting on Output with a finished keyboard, open any section from the
section list, change something, choose "Back to testing", and land on Output with the change in
the next download, without passing through any other step.

### Tests for User Story 1

- [ ] T014 [P] [US1] Add the describe "revise-from-Output loop (spec 094)" to `studio-tests/steps/stepHost.goldenWalk.test.tsx`. For both the copy and adapt fixtures, after reaching Output:
  - revise one pane step (e.g. `punctuation`) and one full-layout step (`rules`) via `jumpToLocation(..., { returnTo: { route: "output" } })`;
  - assert `surveySessionStore.activeStepId` only ever equals the targeted step between leaving and returning, so zero unchanged steps are visited (SC-002);
  - assert the edit persists in the working copy;
  - assert Discard restores the arrival snapshot and appends no decision-record entry. For the pane step, also assert that the survey answer edited before Discard is back to its arrival value. For `rules` and `touch`, assert that the working copy's IR and `touchLayoutJson` equal their arrival values.
- [ ] T015 [P] [US1] Extend `studio/components/StepHost.test.tsx`:
  - for an output-origin arrival on a full-layout step, the footer nav publishes "Back to testing" and "Discard changes and go back" through `stepNavStore`;
  - for a trail-origin arrival on a full-layout step, it does not (unchanged behaviour);
  - the pane-step banner copy depends on the origin.
- [ ] T016 [P] [US1] Write the new `studio/components/OutputSectionList.test.tsx`:
  - it lists only the steps whose `buildProgressDots` kind is `completed`, in registry order;
  - it shows a one-line summary per step (editor dimensions for carve/mechanisms/touch, answer count for survey steps, the generic line for deadkeys/rules);
  - activating a row calls `jumpToLocation` with `returnTo: { route: "output" }`;
  - it is keyboard-operable with programmatic labels (FR-019).

### Implementation for User Story 1

- [ ] T017 [P] [US1] Add `deadkeys` and `rules` entries to `STAGE_LABEL_MESSAGE` in `studio/decisions/progressDots.ts` (~:169-185), with the matching en/fr catalog entries.
- [ ] T018 [US1] Implement the new `studio/components/OutputSectionList.tsx` (FR-001):
  - sections from `buildProgressDots`, filtered to completed;
  - summaries from `buildStageGroups` roll-ups (`studio/decisions/stageGroups.ts`) and `stageActionLabel` (`studio/decisions/stageText.ts`);
  - rendered as a disclosure plus a list of buttons, following the ARIA APG disclosure pattern (docs/accessibility.md);
  - new ids under `output.sections.*`.
- [ ] T019 [US1] In `studio/components/StepHost.tsx`:
  1. When `deepLinkArrival.returnTo` is present, take a **revision snapshot** into component state at arrival. A pane step writes survey answers and the decision record as well as the working copy, so a working-copy-only snapshot would leave those behind. The snapshot covers every store `applyEnvelopeToStores` (`studio/lib/draftPersistence.ts:1060`) restores, **except traversal**: the working copy (`snapshotWorkingCopyData`, which already carries the guard-intent store), `snapshotPhaseBDraft()`, `getSurveyAnswerSnapshot()` and `snapshotDecisionRecord()`. Add an exported `captureRevisionSnapshot()` / `restoreRevisionSnapshot(s)` pair to `draftPersistence.ts` that reuses the same prepare-then-commit appliers, so the restore is atomic in the same way. Full-layout editors' component-local state unmounts on the jump back, so it needs nothing extra.
  2. Make the 5b banner copy depend on the origin: `step.revision.backToTesting` for `route === "output"`; the trail copy stays as is.
  3. Add "Discard changes and go back" to the pane banner: call `restoreRevisionSnapshot`, skip the decision recorder, and call `jumpToLocation(returnTo)`.
  4. Lift the `layout !== "full"` exclusion (~:412) **only for the output origin**: publish "Back to testing" (run the step's normal completion, then `jumpToLocation(returnTo)`) and "Discard changes and go back" through `usePublishStepNav`, so `StepNavCluster` renders them outside the full-screen chrome div.
  5. Keep the one-shot arrival semantics.
- [ ] T020 [US1] If T019 needs extra action slots, extend `studio/stores/stepNavStore.ts` and `studio/components/StepNavCluster.tsx` to render them. They must be keyboard-operable and labelled, and announced through the footer's existing `role="status"` span rather than a new live region (FR-019). Extend `studio/stores/stepNavStore.test.ts`.
- [ ] T021 [US1] Mount `OutputSectionList` in `studio/components/OutputScreen.tsx`, in the right pane above the download buttons, under the existing `baseKeyboard !== null` guard.
- [ ] T022 [US1] FR-004: give each `outputBlockers()` blocker that has a `stepId` an "Open <section>" button in `studio/components/OutputScreen.tsx`, calling `jumpToLocation(stepLocation, { returnTo: { route: "output" } })`. In particular:
  - the touch-stale banner (~:512-526) gets an "Open Touch layout" button;
  - the attribution banner (~:655-668) gets an "Open language step" button;
  - the coverage banner keeps its `backToUnfinishedGallery` behaviour.

  Extend `studio/components/OutputScreen.test.tsx` for both new buttons.
- [ ] T023 [US1] Add the en and fr catalog entries for every new `output.sections.*` and `step.revision.*` id in `studio/locales/en/messages.json` and `studio/locales/fr/messages.json`. Run `pnpm --filter @keyboard-studio/studio messages:extract` and `messages:compile`. Never hand-edit the compiled `messages.js`.

**Checkpoint**: T014–T016 pass, the full studio suite is green, and `pnpm lint` is green.
Commit `feat(studio): revise a section from Output and return (spec 094 T001-T023)` and push.

---

## Phase 4: User Story 2 - Make an identifiable test build (Priority: P1)

**Goal**: "Make a test build" produces a labelled `.kmp` with its own test version from the same
working copy. Builds are numbered, listed and persisted, and publishing stays clean.

**Independent Test**: Make a test build, edit a section, and make another. The two downloads are
labelled build 1 and build 2, and installing each shows its label to the person using it.

### Tests for User Story 2

- [ ] T024 [P] [US2] Write the new `studio/lib/serializeWorkingCopy.testBuild.test.ts`.
  - **(a) Default projection unchanged.** With no `testBuild` and no test builds, the projection is byte-identical to a snapshot taken from the current code. Cover a copy fixture and an adapt fixture (FR-010, SC-004).
  - **(b) Test-build overrides.** With `testBuild: { number: 2, version: "2.3.2" }` on an adapt fixture at 2.3:
    - `.kmn` `&KEYBOARDVERSION` is `2.3.2`;
    - the `.kps` `<Version>` is `2.3.2`;
    - the top HISTORY heading is `2.3.2`;
    - the `.kps` `<Info><Name>` ends with "(Test build 2)" and `<Description>` is prefixed;
    - `welcome.htm` contains the notice;
    - `.kmn` `&NAME` is unchanged.
  - **(b2) Stable mode.** `stableForFingerprint: true` differs from the default projection only
    in the publish version (forced `hasTestBuilds: true`) and the HISTORY fallback date.
  - **(c) Three-part publish rule.** For a three-part adapt base 1.2.3 with `hasTestBuilds: true`, the default projection (the publish path) uses `1.3.0` in the `.kmn`, `.kps` and HISTORY. With `hasTestBuilds: false` it uses `1.2.4` (SC-004a). A confirmed HISTORY entry stamped at `1.2.4` before the first build renders a `1.3.0` heading once a build exists.
- [ ] T025 [P] [US2] Write the new `studio/lib/workingCopyFingerprint.test.ts`:
  - identical working copies give identical fingerprints;
  - a one-character `.kmn` edit changes the fingerprint;
  - path ordering does not matter;
  - **three-part adapt base:** the fingerprint taken with no test builds equals the one taken
    after `recordBuild` (the publish version moves 1.2.4 → 1.3.0, stable mode hides it, R7);
  - **date:** with no confirmed HISTORY entry, fingerprints taken on two different (faked)
    dates are equal.
- [ ] T026 [P] [US2] Write the new `studio/components/TestBuildPanel.test.tsx`:
  - the button is enabled exactly when the normal `.kmp` download is, except that a `versionUnsupported` resolution disables only the test-build button (FR-006);
  - when disabled, its accessible name gives the first blocker;
  - a failed build records nothing (FR-011);
  - a successful build appends to the list with its number, version, time and changed sections;
  - a second build with no edit shows "Same as build N", including on a three-part adapt base
    (where the publish version moved after build 1) and with no `"source"` entry in its
    changed sections;
  - the panel is read-only when the project is submitted.

### Implementation for User Story 2

- [ ] T027 [US2] Add the `testBuild?: { number; version }` option to `ProjectForOutputOptions` in `studio/lib/serializeWorkingCopy.ts` (contracts C2). When it is set, `testBuild.version` replaces the resolved publish version in all four places:
  - the identity overlay passed to `projectWorkingCopyVfs` (`.kmn`);
  - the adapt `.kps` `<Version>` regex patch (~:343-361);
  - the `version` passed to a generated descriptor;
  - `historyVersion` (~:550-561).

  Then post-patch the `.kps` `<Info><Name>` and `<Description>`, and insert a localized notice block at the top of the rendered `welcome.htm` body (~:526-531). Resolve the label strings through the Lingui `i18n` instance, not hard-coded. T024 must pass.
- [ ] T028 [US2] Implement the new `studio/lib/workingCopyFingerprint.ts`. It runs `computeSha256Hex` (from `@keyboard-studio/engine`; codec hash) over the `path\0content` lines of `projectWorkingCopyForOutput({ stableForFingerprint: true })`, sorted by path. Add the `stableForFingerprint` option to `ProjectForOutputOptions` in `studio/lib/serializeWorkingCopy.ts` (contracts C2): it forces `hasTestBuilds: true` into `resolvePublishVersion` and pins the HISTORY fallback `dateIso` to a constant (research R7). Encode binary entries as Base64 the same way as `persistWorkingCopy.serializeEntry`. T025 must pass.
- [ ] T029 [US2] Add `buildTestBuildKmp(testBuild)` to `studio/lib/buildOutputBundle.ts` (contracts C3). Give `buildOutputBundle(opts?)` an optional options parameter that is forwarded to `projectWorkingCopyForOutput`. The filename is `${keyboardId}-test-build-${N}.kmp`. Leave `buildKmpForDownload` and `buildSourceZipForDownload` calling without options.
- [ ] T030 [US2] Add a `handleMakeTestBuild` action to `studio/hooks/usePreviewArtifact.ts`, mirroring `handleDownloadKmp` (~:419-459). In order:
  1. Compute N = `nextBuildNumber`.
  2. Call `resolveTestBuildVersion`; on `versionUnsupported`, surface the blocker.
  3. Call `buildTestBuildKmp`.
  4. **Only on success**: compute the fingerprint, derive `changedSections` from decision-record entries after the previous build's `decisionCursor`, add `"source"` when the fingerprint changed but no entries were recorded (R7), call `testingStore.recordBuild`, then trigger the browser download.
  5. On failure, show the existing download error path and record nothing.
- [ ] T031 [US2] Pass `testVersion` resolution into `outputBlockers()` so `versionUnsupported` (Track 1 P = 0.0.x, non-integer or 4+ part versions) disables only the test-build button and says why. It carries **no** `stepId` and gets no "Open" button: the version comes from the starting point, and no step edits it. Extend `studio/lib/outputBlockers.test.ts`.
- [ ] T032 [US2] Implement the new `studio/components/TestBuildPanel.tsx` (FR-006 to FR-009):
  - the "Make a test build" button, using `canDownload`, `touchStale` and the blockers exactly as the `.kmp` button does;
  - a build list showing number, version, local date and time, changed-section labels via `stageLabel`, "Same as build N", and a two-device collision flag;
  - announcements through the existing Output `role="status"` region;
  - read-only when the project is frozen (`isProjectFrozen`).

  T026 must pass.
- [ ] T033 [US2] Mount `TestBuildPanel` in `studio/components/OutputScreen.tsx`, between the `.kmp`/`.zip` buttons and the banners. Add the en and fr catalog entries for all `output.testing.*` ids used in T027 and T032. Run extract and compile.
- [ ] T034 [US2] Check that the source zip and managed-PR paths never pass `testBuild`. Add an assertion to `studio/components/ManagedPRSubmitPanel.test.tsx` that the submitted VFS contains no "Test build" string and no test version, after two test builds exist (FR-010, SC-004).

**Checkpoint**: T024–T026 pass, the full studio and engine suites are green, and `pnpm lint` is
green. Run the quickstart manual steps 1, 3, 8 and 9 against `pnpm --filter
@keyboard-studio/studio dev`. Commit `feat(output): numbered test builds from the working copy
(spec 094 T024-T034)` and push.

---

## Phase 5: User Story 3 - Keep track of what testers reported (Priority: P2)

**Goal**: The author records reports against builds, links them to sections, marks them fixed,
and sees which build fixed them.

**Independent Test**: Record two reports against build 1, mark one fixed, and make build 2. The
open report is still listed, and the fixed one shows which build fixed it.

### Tests for User Story 3

- [ ] T035 [P] [US3] Write the new `studio/components/TesterReports.test.tsx`:
  - adding a report requires text and a build, and the section is optional;
  - the section link calls `jumpToLocation` with `returnTo: { route: "output" }` (FR-013);
  - marking fixed and then making a build shows "Fixed in build N" (FR-014);
  - reopening clears it;
  - the list is read-only when frozen;
  - the form is labelled and keyboard-operable (FR-019).

### Implementation for User Story 3

- [ ] T036 [US3] Implement the new `studio/components/TesterReports.tsx` (FR-012 to FR-014):
  - an add-report form with a text area (1-2000 characters), a build select (existing build numbers) and an optional section select (completed sections from `buildProgressDots`);
  - a report list with status toggle, a section link and the "Found in build N / Fixed in build M" text;
  - store calls go through `testingStore`.

  T035 must pass.
- [ ] T037 [US3] Mount `TesterReports` inside `TestBuildPanel` in `studio/components/TestBuildPanel.tsx`, shown once at least one build exists. Add the en and fr catalog entries for `output.testing.reports.*`. Run extract and compile.

**Checkpoint**: T035 passes, the full studio suite is green, `pnpm lint` is green, and quickstart
step 5 passes. Commit `feat(studio): record tester reports against test builds (spec 094
T035-T037)` and push.

---

## Phase 6: User Story 4 - Move from testing to publishing (Priority: P2)

**Goal**: Choosing to publish after test builds shows whether anything changed since the last
build and lists open reports, before offering the existing submission.

**Independent Test**: With two test builds and one open report, choose "Testing done, publish".
The screen states whether the keyboard has changed since the last test build and lists the open
report before submission is offered.

### Tests for User Story 4

- [ ] T038 [P] [US4] Write the new `studio/components/PublishHandover.test.tsx`:
  - with no test builds, the existing submit panel renders exactly as today;
  - with builds, a "Testing done, publish" step appears first;
  - it shows "No changes since test build N" when the fingerprint matches, and otherwise lists the changed sections;
  - it lists open reports, and a confirm action reveals `ManagedPRSubmitPanel`;
  - open reports do not block (FR-016).

### Implementation for User Story 4

- [ ] T039 [US4] Implement the new `studio/components/PublishHandover.tsx` (FR-016, FR-017):
  - on open, compute the fingerprint (T028) and compare it with the last build;
  - derive the changed sections as in T030;
  - list reports with `status === "open"`;
  - require one confirm before rendering its `children` (the existing submit panel).

  T038 must pass.
- [ ] T040 [US4] Wrap `ManagedPRSubmitPanel` in `PublishHandover` in `studio/components/OutputScreen.tsx` (~:761-778). Leave the panel's props and behaviour unchanged. Add the en and fr catalog entries for `output.publishHandover.*`. Run extract and compile.

**Checkpoint**: T038 passes, the full studio suite is green, and `pnpm lint` is green.
Polish rides with this phase (constitution phase cadence).

---

## Phase 7: Polish & cross-cutting concerns

- [ ] T041 [P] Move the start-over confirmation copy in `studio/components/SurveyResetButton.tsx` (~:97-133) into the catalog (`nav.reset.*`, en and fr). The prompt must state that the draft, its test builds and tester reports, and the cloud copy are deleted (spec edge case "Start over"). Update `studio/components/SurveyResetButton.test.tsx`.
- [ ] T042 [P] Extend `e2e/copy-edit.spec.ts`:
  1. make test build 1 and assert the download name `<id>-test-build-1.kmp`;
  2. open Rules from the section list, edit, choose Back to testing, and assert the URL hash returns to `#output`;
  3. make test build 2 and assert its name;
  4. reload and assert two builds are listed.

  This job is non-blocking in CI.
- [ ] T043 [P] Add or update rows in `specs/056-ada-accessibility/wcag-2.2-aa-tracker.md` for the section list, the footer revision actions, the test-build panel, the reports form and the publish hand-over. Only flip a row to `pass` with named test evidence (T015, T016, T026, T035, T038).
- [ ] T044 [P] Update [docs/workflow-model.md](../../docs/workflow-model.md) and [docs/architecture.md](../../docs/architecture.md) to describe the Output-origin revision loop and that test builds are a `.kmp`-only projection. Update `docs/github-integration.md` only where it says Output is terminal.
- [ ] T045 Run the full quickstart ([quickstart.md](quickstart.md) steps 1-10), `pnpm lint`, and both package suites. Record results in the phase commit. Commit `feat(studio): publish hand-over after testing, plus polish (spec 094 T038-T045)` and push.

---

## Dependencies & execution order

### Phase dependencies

- **Setup (T001)** comes first.
- **Foundational (T002–T013)** depends on Setup and blocks every story.
- **US1 (T014–T023)** depends on Foundational and is independent of US2.
- **US2 (T024–T034)** depends on Foundational. It is independent of US1 for building. The quickstart walk uses both, but neither needs the other's code.
- **US3 (T035–T037)** depends on US2 (reports attach to builds; mounts in `TestBuildPanel`). Its section links use US1's return, and the `jumpToLocation` call works without US1's footer actions.
- **US4 (T038–T040)** depends on US2 (fingerprint, builds). It reads reports only if US3 has landed; otherwise the list is empty.
- **Polish (T041–T045)** comes after the stories it touches.

### Within phases

- T002 → T003 → T004; T005 → T006 → T007; T008 → T009; T010 → T011 → T012; T013 after T009.
- US1: T017 [P] while T014–T016 are being written; T018 → T021; T019 → T020; T022 after T007; T023 last.
- US2: T027 → T029 → T030 → T032 → T033; T028 before T030; T031 after T030; T034 after T029.

### Parallel opportunities

```text
Foundational: T002, T005, T008 together (separate new test files); then T003, T006, T010 together.
US1:          T014, T015, T016, T017 together.
US2:          T024, T025, T026 together; T027 and T028 together.
Polish:       T041, T042, T043, T044 together.
```

## Implementation strategy

- **MVP = Phase 1 + Phase 2 + US1.** This fixes the dead end on its own and helps authors who
  never share builds.
- **Minimum test-and-revise loop = MVP + US2** (both P1).
- **US3, then US4,** each in its own conversation, with one commit and push per green phase to
  `094-test-and-revise`. Never merge the PR unasked.
