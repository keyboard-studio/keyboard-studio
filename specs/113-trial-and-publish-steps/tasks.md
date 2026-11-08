# Tasks: Trial and Publish steps (split of the Output screen)

**Input**: [spec.md](spec.md), ruling `~/workspace/keyboard-studio-notes/2540-ruling.md`

Task line format: `- [ ] **T###** [P?] Description · file`. `[P]` marks a task independent of the others in its wave.

## Phase 1: Spine — decision modules + manifest + phases + advance

**Wave 1 — independent (different files):**

- [x] **T001** [P] Gallery decision modules `trial` (`provides: ["trial"]`, `requires: ["icon"]`) and `publish` (`provides: ["publish"]`, `requires: ["trial"]`), icon-module shape (notice, no-op apply, null renderer) · packages/studio/src/survey/questions/gallery/trial.ts, packages/studio/src/survey/questions/gallery/publish.ts
- [x] **T002** [P] Register both modules; add `"trial"` / `"publish"` decision ids · packages/studio/src/survey/questions/registry.ts, packages/studio/src/decisions/decisionTypes.ts
- [x] **T003** [P] `trialStep` / `publishStep` (`layout:"full"`, `persistence: "working-copy"`, specRef specs/113-trial-and-publish-steps) · packages/studio/src/steps/registerEditorSteps.ts
- [x] **T004** [P] `FULL_LAYOUT_IDS` gains `trial`, `publish` · packages/studio/src/steps/manifest.ts
- [x] **T005** [P] `StepId` mirror + PHASES G "Trial" / H "Publish" + letters A–H · packages/studio/src/steps/phases.ts
- [x] **T006** [P] `ActiveStepId` mirror; `icon → trial`, `trial → publish`, `publish → done` (no navigate) · packages/studio/src/steps/advance.ts
- [x] **T007** [P] `ActiveStepId` mirror · packages/studio/src/stores/surveySessionStore.ts

**Checkpoint**: `pnpm --filter @keyboard-studio/studio exec vitest run src/steps/manifest.test.ts src/steps/phases.test.ts` fails only on the pinned expectations the next phase updates (not on load errors).

## Phase 2: Step hosts — Trial + Publish + shared banners

- [x] **T010** [P] Shared `OutputGateBanners` (coverage / attribution / licence / touch-stale banners + "Open" controls + jump status), extracted from OutputScreen · packages/studio/src/components/OutputGateBanners.tsx
- [x] **T011** Trial host: nudge, `OutputSectionList`, `TestBuildPanel`, banners; footer nav via `usePublishStepNav`, Continue disabled while the coverage gate is blocked; records the `trial` notice decision via `onComplete` · packages/studio/src/editors/assignLoop/TrialStep.tsx
- [x] **T012** Publish host: `.kmp` / `.zip` / LDML downloads, banners, findings + checklist, criteria card, `PublishHandover` + `ManagedPRSubmitPanel`, `SignUpPanel`, keyboard-details section, `ReformatConsentDialog`; footer nav; records the `publish` notice decision · packages/studio/src/editors/assignLoop/PublishStep.tsx
- [x] **T013** `returnTo` `{ route: "survey", step: "trial" }` in Trial's revise paths · packages/studio/src/components/OutputSectionList.tsx, packages/studio/src/components/TesterReports.tsx

**Checkpoint**: both steps render in the stepHost render-smoke harness with the existing panel tests still green.

## Phase 3: Retire the Output screen, rewire the tail

- [x] **T020** `#output` redirect component (no project → `#start`; `done` → Publish; else Trial via the store forward primitive) · packages/studio/src/components/OutputRedirect.tsx, packages/studio/src/StudioShell.tsx (`case "output"`)
- [x] **T021** Delete `OutputScreen.tsx` and its screen-level tests · packages/studio/src/components/OutputScreen.tsx, packages/studio/src/components/OutputScreen.*.test.tsx
- [x] **T022** `done` terminal panel copy points at Publish, with a "Review the Publish step" control · packages/studio/src/components/StepHost.tsx
- [x] **T023** Revise-and-return machinery recognises a return to the tail (`trial` / `publish`) as well as the legacy `{ route: "output" }` · packages/studio/src/components/StepHost.tsx

**Checkpoint**: `pnpm -r build` passes; no remaining import of OutputScreen.

## Phase 4: Test-surface updates (icon-step precedent)

- [x] **T030** [P] Frozen spine order / edges / membership · packages/studio/src/steps/stepOrder.parity.test.ts
- [x] **T031** [P] Pinned expectations (`FULL_LAYOUT_IDS`, phase letters, tail sequences incl. Open override) · packages/studio/src/steps/manifest.test.ts, packages/studio/src/steps/phases.test.ts, packages/studio/src/steps/advance.test.ts, packages/studio/src/steps/advance.open.test.ts
- [x] **T032** [P] Coverage / derive-screens / question-modules snapshot · packages/studio/src/decisions/galleryModules.coverage.test.ts, packages/studio/src/decisions/deriveScreens.test.ts, packages/studio/src/survey/questions/__snapshots__/questionModules.test.ts.snap, packages/studio/src/decisions/decisionIRConsistency.test.ts
- [x] **T033** [P] Headless-author step drivers `trial` / `publish` (+ tests), journey-runner cases · packages/studio/src/test/headlessAuthor/stepDrivers/trial.ts, packages/studio/src/test/headlessAuthor/stepDrivers/publish.ts, packages/studio/src/test/headlessAuthor/runAuthorCase.ts, packages/studio/src/test/journey-runner.ts
- [x] **T034** [P] Golden-walk fixtures + oracle tail entries · packages/studio/tests/steps/__fixtures__/goldenWalk/copy.json, packages/studio/tests/steps/__fixtures__/goldenWalk/adapt.json, packages/studio/tests/steps/stepHost.goldenWalk.test.tsx
- [x] **T035** [P] Lingui catalogs for the new message ids · packages/studio/src/locales/en/messages.json, packages/studio/src/locales/fr/messages.json (via `lingui extract`)
- [x] **T036** [P] Spec trace · docs/spec-trace.json, packages/studio/src/steps/manifest.specref.json

**Checkpoint**: targeted vitest suites green (`steps/`, `decisions/`, `tests/steps/`, headless-author, journey-runner, affected component tests); full `pnpm -r build` green; e2e golden-walk spec updated if it pins the tail.

## Phase 5: Verification + PR

- [x] **T040** Fresh-main repro check: the pre-change tail (`icon → done → #output`) is the behaviour this PR replaces — verified by the updated tail tests, not by hand-waving · (this file)
- [x] **T041** Local verification: `pnpm -r build`, eslint on touched files, targeted vitest single-worker (`--pool=forks --maxWorkers=1`, `NODE_OPTIONS=--max-old-space-size=5120`) · (this file)
- [x] **T042** Full non-draft PR on `km/2540-trial-publish-steps` with diagnosis + resolution in a GitHub comment, ready for review; "Over and out!" on #2540 when feature-complete. NEVER merge · (this file) — PR #2614, comment https://github.com/keyboard-studio/keyboard-studio/pull/2614#issuecomment-6714854058; "Over and out!" https://github.com/keyboard-studio/keyboard-studio/issues/2540#issuecomment-6714854414

## Verification findings (2026-11-07, found while verifying, fixed in this PR)

- **Engine `.kmp` realm fix** (`packages/engine/src/output/kmp.ts` `encode` +
  `packages/engine/src/output/kmp.test.ts` foreign-realm test): the corpus
  headless-author walk failed at the trial driver — kmc-package's JSZip
  rejected jsdom-realm Uint8Arrays ("Can't read the data of 'readme.htm'").
  `encode` now hands JSZip Node `Buffer`s (`Buffer.from`, which allocates in
  the Node realm JSZip runs in); a plain `new Uint8Array` copy does NOT fix
  it, because the engine executes in the caller's realm under vitest. The
  trial driver test's `@vitest-environment node` pin was removed — it now
  runs under jsdom and guards the fix.
- **StepHost same-route arrival** (`packages/studio/src/components/StepHost.tsx`
  + `StepHost.revision.test.tsx` same-route test + mock `clearPendingJump`
  now honors the real contract): T042 e2e failed — revising Rules from Trial
  landed as an ordinary step with a plain Continue. The deep-link arrival was
  captured only in a mount-time initializer, which assumed arrivals always
  come from another route; Trial lives on `#survey`, so no remount happens.
  A step-change effect now captures pending jumps when the active step changes.
- **i18n catalog gate** (found by the full `pnpm lint` run, which had not
  been run before the first push attempt): `i18n-catalog-lint` errored —
  the 17 `output.*` / `picker.*` ids the deleted OutputScreen / PickerPane
  owned were still in both catalogs (extract never removes obsolete ids;
  removed by hand, key order preserved — a first pass with `sort_keys=True`
  re-sorted the whole file and had to be redone without sorting), and the
  21 new ids were empty in `fr` (the lint errors on empty values; Crowdin
  does NOT backfill a PR). The 21 now carry real French translations,
  reusing the established phrasing where the English text is identical to
  a removed id (`publish.intro` = old `output.intro` fr;
  `publish.changeStarting.label` = old `output.changeStarting.label` fr;
  the `trial.continueBlocked.hint` quotes the existing
  `output.status.coverageBlocked.goto` fr). Full `pnpm lint` re-ran green
  (exit 0, all 13 lints). The remaining `[WARN]` (English changed under
  existing ids) is pre-existing drift from main, non-blocking.
- **Depcruise circular-dependency fix** (`packages/studio/src/steps/derivedViews.ts`
  new + `steps/manifest.ts` re-export + `lib/jumpToLocation.ts` +
  `lib/resolveLocation.ts` + `decisions/stageGroups.ts` +
  `components/OutputSectionList.tsx`): the pre-push hook blocked the push —
  `pnpm run depcruise` exited 9 with 9 `no-circular` violations, all one shape:
  `manifest → registerEditorSteps → {TrialStep|PublishStep} → Output-screen
  family → {jumpToLocation|stageGroups|OutputSectionList} → manifest`. The
  three back-edges needed only manifest *data*, never the step hosts, so the
  derived views (`derivedScreens`, `screenGates`, `screenTrails`) moved into
  `steps/derivedViews.ts`, a module below the manifest that never imports the
  step pool, plus a `manifestStepIds` list (derived ids + terminal
  `"package"` — the same set/order as `manifest` itself). `manifest.ts`
  re-exports all four, so existing importers are untouched.
  `ResolveContext.manifest` narrowed from `readonly Step[]` to ids only
  (`readonly { readonly id: string }[]` — the resolver uses it for
  membership alone); `liveResolveContext` builds it from `manifestStepIds`.
  `OutputSectionList`'s lazy `manifestStepIds()` (which read the manifest
  inside the hook to dodge the runtime cycle) is now a plain module-top set
  from `derivedViews`. Depcruise re-ran green: 0 violations, 2065 modules.
  No behaviour change — the id set is identical by construction
  (`buildManifest` arranges the pool by exactly this list).
