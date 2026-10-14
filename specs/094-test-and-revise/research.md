# Research: Test-and-revise loop before publishing

Phase 0 for [plan.md](plan.md). Every decision below names the code it builds on. Paths are
relative to the repo root; `studio/` means `packages/studio/src/`, `engine/` means
`packages/engine/src/`.

## R1. Test-build version scheme

**Constraints found**

- kmc-package's `isValidVersionNumber` is `^(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*)){0,2}$`: at most
  three parts, no leading zeros. A failing version fails the package build (KM04027).
- kmc-package takes the package version from the compiled `.kmx` `&KEYBOARDVERSION` under
  `<FollowKeyboardVersion/>` and ignores the `.kps` `<Keyboard><Version>`. The `.kmn` value is
  the one that counts, and it is what Keyman shows the tester.
- Today's publish version (P) is decided in `studio/lib/serializeWorkingCopy.ts:313-371`:
  - Track 2 (`adapt-existing`): `bumpKeyboardVersion(raw)` (`engine/output/adapt-staging.ts:49`),
    which adds one to the last segment.
  - Track 1 (copy): the copied keyboard's own version (`baseIr.header.version`, falling back to
    "1.0"). The spec's earlier "a new keyboard ships as 1.0" was wrong and has been corrected.
- About 500 of the roughly 940 `release/` keyboards in the corpus use three-part versions.

**Decision** (the three-part case was confirmed with the user and recorded in the spec's
Clarifications). Let V be the version replaced (Track 2 only), P the publish version, and N the
build number (1, 2, 3, ...):

| Case | Test version T(N) | Publish version |
|---|---|---|
| Track 2, V has 1 or 2 parts (e.g. 2.3) | `V.N` (2.3.1, 2.3.2, ...) | as today (2.4) |
| Track 2, V has 3 parts (a.b.c) | `a.b.(c+N)` (1.2.4, 1.2.5, ...) | **`a.(b+1).0` once any test build exists**; as today (a.b.(c+1)) otherwise |
| Track 1, first segment of P ≥ 1 | `0.N` | as today |
| Track 1, P = 0.b[.c] with b ≥ 1 | `0.(b-1).N` | as today |
| Track 1, P = 0.0[.x] | test build not offered; Output says why | as today |

Each row is strictly increasing in N, never wraps or overflows (segments are unbounded
integers), and satisfies V < T(N) < P under segment-wise numeric comparison (the same order as
`compareVersions` in `keyboard-lint`).

**Two kinds of base version are passed through unchanged:**

- **Not plain dotted integers** (e.g. `1.0a`). `bumpKeyboardVersion` already yields invalid
  results for these. A test build is not offered and Output says why. There is no "Open"
  button: the version comes from the starting point, and no step edits it (the identity
  survey's fields are name, language tag, language name and website).
- **More than three parts.** These already fail kmc-package today, so nothing changes.

**Implementation shape.** One pure engine module, `engine/output/output-version.ts`:

- `resolvePublishVersion({ mode, rawVersion, hasTestBuilds })`
- `resolveTestBuildVersion({ mode, rawVersion, buildNumber })`, returning `{ ok, version }` or a
  reason

It replaces the three hand-synced "bump only on adapt" sites:

- `studio/lib/serializeWorkingCopy.ts:315`
- `studio/hooks/useDocumentationFindings.ts:58-59`
- `studio/editors/adapters/flowStepOptions.tsx:400-403` (`deriveHistoryVersion`)

**Alternatives rejected**

- Bump the middle segment for every three-part base: changes behaviour for keyboards that were
  never tested.
- Let test versions sort below the old release: a tester who has the release installed would
  see the test build as a downgrade.
- Four-part versions: rejected by kmc-package.

## R2. Where test-build overrides apply (FR-010)

**Decision.** Overrides travel only on the `.kmp` download path:

- New `buildTestBuildKmp(testBuild)` in `studio/lib/buildOutputBundle.ts`.
- `buildOutputBundle(opts?)` gains an optional parameter. `buildSourceZipForDownload` and
  `ManagedPRSubmitPanel` (which calls `projectWorkingCopyForOutput()` directly) keep calling
  without it.
- `projectWorkingCopyForOutput(opts)` already takes `identityOverride`. A new
  `testBuild: { version, label }` option makes it:
  1. use T(N) in place of the computed publish version everywhere the publish version is used:
     the `.kmn` identity overlay, the adapt `.kps` `<Version>` regex patch (`:343-361`), and
     `historyVersion`. This closes the gaps where `identityOverride.version` alone would leave
     the `.kps` and HISTORY on the publish version;
  2. post-patch the package descriptor: `<Info><Name>` gets the suffix "(Test build N)" and
     `<Description>` is prefixed;
  3. insert a test-build notice at the top of the rendered `welcome.htm` body.
- The download filename is `<id>-test-build-<N>.kmp`. Today's filename is deliberately
  unversioned (`buildOutputBundle.ts:167-169`); test builds need the label in the name (FR-008).
- The `.kmn` `&NAME` is not changed, so the keyboard's identity stays stable across the upgrade
  to the release. The tester sees the label in the package name and on the welcome page, and
  the test version in Keyman.

Isolation holds by construction: both `projectWorkingCopyForOutput` and `buildKmp` stage onto
fresh clones (`serializeWorkingCopy.ts:237`, `engine/output/kmp.ts:508-529`).

**Alternatives rejected**

- Patching the built `.kmp` afterwards: the version is inside the compiled `.kmx`.
- Overriding through the shared projection: the PR path reads that same projection.

## R3. Returning to Output after a revision (FR-001 to FR-005)

**What exists**

- `studio/lib/jumpToLocation.ts` parks a one-shot `pendingJump: { question?, returnTo? }`.
  Today `DecisionEntryRow.tsx:243` is its only caller, with `returnTo: { route: "trail" }`.
- `StepHost.tsx` reads it on mount (`deepLinkArrival`, 286-295) and honours it on confirm (step
  5b, 494-497). It offers "Continue from here instead" through a banner (573-591).
- Full-layout steps (`carve`, `deadkeys`, `rules`, `mechanisms`, `touch`,
  `touch_seed_source`; `steps/manifest.ts:354`) are excluded on purpose:
  `revisableViaDeepLink = isDeepLinkTarget && layout !== "full"` (`StepHost.tsx:412`). The
  full-screen chrome leaves no room for the banner.

**Decision**

- **Origin.** Output revisions use `jumpToLocation(loc, { returnTo: { route: "output" } })`.
  This is the same seam as the Decision trail, with no new navigation state.
- **Pane steps.** The existing step 5b already returns once `returnTo` is set. Its banner copy
  becomes origin-aware ("Back to testing" or "Back to the decision trail").
- **Full-layout steps.** The return affordance goes in the spec 081 footer `StepNavCluster`,
  which sits outside the full-screen chrome div. This lifts the deferral for the `output` origin
  without breaking the chrome contract. While a deep-link arrival with `returnTo` is active,
  StepHost publishes two extra actions through `usePublishStepNav`:
  - **"Back to testing"**: complete through the step's normal adapter, then `jumpToLocation(returnTo)`.
  - **"Discard changes and go back"**: restore the working copy to the state taken at arrival,
    record nothing, and return.
- **Abandon (Story 1 scenario 3).** At arrival, StepHost takes an in-memory snapshot of every
  store a draft restore covers except traversal: the working copy (`snapshotWorkingCopyData`,
  `studio/lib/persistWorkingCopy.ts:324`, guard intents included), the phase-B alphabet, survey
  answers and the decision record. On abandon it restores them through the same atomic
  prepare-then-commit appliers as `applyEnvelopeToStores`. A working-copy-only snapshot would
  leave a pane step's edited answers and recorded decisions behind. This rolls the same copy back; it is not a second copy (Article
  III). Pane steps get the same "Discard" action, since today they can only confirm or continue.
- The Decision-trail origin keeps today's pane-only behaviour unless the same mechanism is
  turned on for it. That is outside this spec.

**Alternatives rejected**

- A new "revision mode" store: duplicates `pendingJump`.
- Putting the button inside the full-page editors: breaks the chrome contract and touches six
  editors.

## R4. The Output section list (FR-001)

**Decision.** `OutputSectionList` is built from data the footer already computes:

- `buildProgressDots` (`studio/decisions/progressDots.ts:632-760`), filtered to `kind ===
  "completed"`, gives the list and labels.
- `buildStageGroups` roll-ups (`studio/decisions/stageGroups.ts:166`) give the one-line summary:
  - editor dimensions for carve, mechanisms and touch;
  - answer count for survey steps;
  - a generic "Completed" line for deadkeys and rules, which have no editor roll-up today.
- `STAGE_LABEL_MESSAGE` has no `deadkeys` or `rules` entries, so those fall back to the raw id.
  Both entries are added (FR-018).
- Order and section membership come from the decision registry through `buildProgressDots`, so
  there is no hand-kept list (Article IX).

## R5. Naming the out-of-date or blocking section (FR-004, FR-006)

**What exists.** Each reason is shown by its own banner in `OutputScreen.tsx` (512-703):

- touch stale: has text but no button;
- coverage: has a "Go finish them now" button;
- attribution: says "Go back to the language step" but has no button;
- license unreadable.

The PR panel's reason also falls through to "compile not complete" when attribution or license
is the actual blocker (`ManagedPRSubmitPanel.tsx:511-531`).

**Decision**

- One pure helper, `studio/lib/outputBlockers.ts`, returns
  `{ blocked, blockers: [{ kind, stepId?, messageId }] }` in today's priority order (touchStale,
  coverage, license, attribution, notReady).
- Banners, the aria-label ternary, the test-build button, and the PR panel's
  `outputBlockedReason` all read it, which fixes the PR fall-through.
- Each blocker that has a `stepId` gets an "Open <section>" button using R3's return. The
  coverage button keeps `backToUnfinishedGallery`.

**Known limitation, kept out of scope.** Only a mechanisms edit marks touch stale today
(`MechanismGallery.tsx:3728`). Carve, deadkeys and rules edits do not. Widening staleness would
change editor semantics beyond this spec. Output names what `staleSteps` reports.

## R6. Persisting test builds and reports (FR-009, FR-015)

**Decision**

- An optional `testing?: TestingRecord` field is added to `DurableDraft`
  (`studio/lib/draftTypes.ts:107`). This is an additive optional field with no `DRAFT_VERSION`
  bump, per the policy at draftTypes.ts:101-141. A bump would discard every draft.
- A new zustand store, `studio/stores/testingStore.ts`, holds the record.
  `installDraftAutosave` subscribes to it, using the existing 500 ms autosave timer. That is a
  persistence timer, so D3 does not apply.
- Cloud sync carries it unchanged, because the server stores an opaque blob (`z.unknown()`). No
  `/api` change is needed, so bundle safety is unaffected.
- **Start over.** `handleStartOver` (`StudioShell.tsx:1237`) resets the store. The confirmation
  in `SurveyResetButton.tsx:97-133` is currently hard-coded English and does not say what is
  deleted. It moves to the catalog and states that test builds and reports go too.
- **Frozen.** `isProjectFrozen` already blocks writes. The Testing panel renders read-only when
  the project row is `submitted`.

**Two devices.** Sync is last-write-wins on the whole envelope, with no server precondition.

- Each build carries a random `buildId`.
- `applyRemoteDraft`, which is the cloud-restore banner's only path, merges the incoming
  `testing` record with the local record stored under the same project key, not with the live
  store (which may hold another project at that moment), instead of replacing it: builds are unioned by `buildId`, reports by `reportId`, and
  `nextBuildNumber` becomes the maximum of the two.
- Two builds with the same number and different ids are kept, and the list flags both as made on
  different devices. Neither is lost and the clash is shown, which meets the edge case.
- A server-side conflict check is out of scope.

## R7. Working-copy fingerprint and "sections changed" (FR-009, FR-016)

**Decision**

- **Fingerprint.** SHA-256 over the sorted `path → content` of the publish projection
  in **stable mode** (`projectWorkingCopyForOutput({ stableForFingerprint: true })`), using the
  existing `computeSha256Hex` (`engine/codec/hash.ts:14`). It is computed when a build is made,
  and again on demand when the publish hand-over opens. It never runs inside the validation
  cycle (D3).
  - **Why stable mode.** The plain publish projection changes when nothing was edited, in two
    ways. (1) The three-part rule (R1) moves the publish version once the first build exists,
    so build 1 (hashed while `hasTestBuilds` is false, version 1.2.4) and an unedited build 2
    (1.3.0) would never match. (2) HISTORY.md's heading takes today's date unless a confirmed
    entry stores its own (`serializeWorkingCopy.ts:550`, `renderHistoryMd`), so builds made on
    different days would never match.
  - Stable mode resolves the publish version with `hasTestBuilds: true` regardless of the
    store, and pins the HISTORY fallback date to a constant. Every other byte is the normal
    publish projection. Stable mode is used only for fingerprints and never reaches a
    download or submission.
- **"Sections changed since the previous build"** is the set of distinct stage ids of decision
  record entries appended after the previous build's `decisionCursor`, which is the entry count
  stored on each build. This reuses spec 053 data and needs no per-section hashing.
  - If the fingerprint differs but no entries were recorded, the change is shown as "Source edited
    directly" (Output's `.kmn` editor).
  - An identical fingerprint is shown as "Same as build N".

## R8. Tests

- **Engine unit tests (vitest):** an `output-version` table test covering every row of R1, plus
  a 1000-build monotonicity and validity check against kmc-package's regex.
- **Studio unit tests:**
  - `outputBlockers`
  - `testingStore`, including the merge and collision cases
  - the projection test: the test-build option changes the `.kmn`, `.kps`, HISTORY and welcome
    page, and the default projection is byte-identical to today's (FR-010, SC-004)
- **Golden walks** (`tests/steps/stepHost.goldenWalk.test.tsx`, copy and adapt): a revise loop
  that starts at Output, revises one pane step and one full-layout step, and asserts no
  unchanged step is visited (SC-002).
- **E2E:** extend `e2e/copy-edit.spec.ts` with build, revise and rebuild, asserting the second
  download's name and version. This job is non-blocking in CI.
- **Not automated:** SC-006 (moderated test with first-time authors).
