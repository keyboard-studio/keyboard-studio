# Feature Specification: Trial and Publish steps (split of the Output screen)

**Feature Branch**: `km/2540-trial-publish-steps`

**Created**: 2026-11-07

**Status**: Draft (as-built)

**Owner**: Studio team

**Issue**: #2540

**Ruling**: `~/workspace/keyboard-studio-notes/2540-ruling.md` (crew ruling,
2026-11-07 — all eight open questions resolved there; this spec carries
them as requirements)

## Purpose

The authoring flow ends at Finalize (`help`, `html`, `icon`) and drops the
author onto a single Output screen doing two jobs: trying the keyboard out
(numbered test builds, tester reports, revise-and-return, spec 094) and
releasing it (criteria summary, findings and blockers, `.kmp` / source `.zip`
/ LDML downloads, managed GitHub PR). Because both jobs share one page, the
phase stepper never shows testing or publishing as stages of the work.

This spec splits the tail into two real manifest steps after the icon step:

1. **Trial** — try the keyboard and get it to testers (the spec 094 parts
   of Output, unchanged).
2. **Publish** — get the finished keyboard out (release checks, final
   downloads, GitHub fork+PR delivery).

Both are real stages in the phase stepper (phases G and H), so the author
can see them coming and jump back to them like any other stage.

## Placement

The `trial` and `publish` steps sit on the manifest spine after the icon
step and before Package. Advance: `icon → trial → publish → done`. The
`publish` step completes to `done` with **no** `navigate` — the author rests
on the `done` terminal panel, whose copy now points back at Publish. The
gallery decision modules are `trial` (`provides: ["trial"]`,
`requires: ["icon"]`, `screen: "trial"`) and `publish`
(`provides: ["publish"]`, `requires: ["trial"]`, `screen: "publish"`);
both are "notice" modules in the icon shape (no-op `apply`,
`renderer: () => null`); recording is step-side via `onComplete` on
Continue. `package` stays the ruled terminal stub after Publish.

Phases: G "Trial" (`trial`), H "Publish" (`publish`); letters are A–H.
`UNPHASED_STEP_IDS` stays `["package"]`.

## Decisions (crew ruling 2026-11-07, see the ruling file)

- **Manifest steps, not route-level screens.** Steps reuse `advance()`,
  `StepHost`, footer nav, the decision trail, the golden walk, headless
  author, journey replay, and revise-and-return. Route-level screens would
  need a parallel step-like navigation contract.
- **Trial is optional, nudged, never blocked.** Continue from Trial to
  Publish is always available; with no test builds Trial shows a nudge but
  never blocks.
- **No re-gating.** Trial gates on the test-build gate
  (`outputBlockers.testBuildBlocked`); Publish gates on the release gate
  (`outputBlockers.blocked`). Criteria, documentation findings, unmapped
  findings, unapplied repairs and the documentation checklist stay
  informational only. The Open ratchet keeps gating the update PR.
- **Trial covers spec 094 as shipped only.** Test builds, tester reports,
  revise-and-return. In-browser try-it pane, on-device install help
  (QR/link), and a tester checklist are deferred follow-ups, not this PR.
  Hosting stays out of scope (spec 094 §16).
- **Versioning unchanged.** Test builds keep numbered versions from
  `resolveTestBuildVersion`; release downloads are cut from the working
  copy's own version. No automatic HISTORY.md bump.
- **Publish is every final output.** `.kmp`, source `.zip`, LDML export,
  and the managed PR. The "just download it" author ends up in Publish and
  never touches the PR panel. *Revised 2026-11-08 (owner walk-through):*
  Trial also offers the source `.zip` and LDML export (shared
  `SourceDownloads` component, release gate), so a tester can take them with
  a numbered test build. The released `.kmp` stays Publish-only.
- **Publish leads with GitHub submission** (*2026-11-08*). Gate banners,
  then the submit panel and sign-in, then the downloads. Submitting requires
  a sign-in the server checks (GitHub token, or the session token Google
  sign-in issues). A GitHub user may open the PR from their own account
  instead of the studio's. Every route targets the testing copy
  `keyboard-studio/keyboards`, and the panel says so, with a note that
  submission to keymanapp/keyboards is coming soon. Status and setup:
  [docs/github_flow.md](../../docs/github_flow.md).
- **Track 2: same split.** On adapt, Publish means an update PR. The
  `advance()` Open override is preserved (`done` → `criteria` Review).
- **Persistence unchanged.** `testingStore` keeps its shape (additive draft
  field, no migration). The only new persisted state is the `trial` /
  `publish` notice decisions.
- **`#output` becomes a redirect into the tail.** Route token, nav tab and
  label are kept (tokens are stable per spec 057). No project → `#start`;
  walk finished (`done`) → Publish step; otherwise → Trial step. The
  redirect uses the store's forward primitive (`advance(target)`), not
  `jumpToLocation` — `resolveLocation` refuses jumps to unvisited steps,
  and the Output tab is reachable mid-walk by design. `CriteriaScreen`'s
  "Continue to Output" footer is untouched (it navigates to `#output`).

## Scope

### Trial step (`TrialStep`, `layout:"full"`)

- Nudge when no test builds exist yet (informational, never a gate).
- `OutputSectionList` — revise any completed section and come back
  (spec 094 FR-001); `returnTo` is now `{ route: "survey", step: "trial" }`.
- `TestBuildPanel` (incl. `TesterReports` once builds exist) behind the
  test-build gate — the same gate as today.
- Source `.zip` and LDML export (`SourceDownloads`) behind the release gate.
- Shared gate banners (coverage / attribution / licence / touch-stale)
  from the new `OutputGateBanners` component; each names the step that
  fixes it with an "Open" control returning to Trial.
- Forward (Continue → Publish) is disabled while the coverage gate is
  blocked — the Phase F gate's refusal shape, applied to the tail entry:
  an author who reached Trial through the `#output` side door must not
  complete the walk with unimplemented characters. The banner's "Go finish
  them now" is the way forward. Emission stays blocked regardless.

### Publish step (`PublishStep`, `layout:"full"`)

- `.kmp` download (primary), source `.zip` download, LDML export — all
  behind the release gate, with the same aria-labels, errors and warnings
  as today. `ReformatConsentDialog` renders here (it belongs with the
  downloads).
- Shared gate banners (same component as Trial).
- Documentation findings, other (unmapped) findings, `UnappliedRepairList`,
  `DocumentationChecklist` — informational only.
- Criteria summary card (counts + "View criteria"), informational only.
- `PublishHandover` + `ManagedPRSubmitPanel` (PR submission, incl. the
  Open ratchet), `SignUpPanel`.
- Keyboard-details section: `TrackOneIdentityPanel`, "Change starting
  keyboard" (`backToChooseStart`), `AdvancedKmnEditor` when the stage is
  ready — the Output screen's left-pane tools, which had no other home.

### Retired: the Output screen

`OutputScreen.tsx` and its screen-level tests are deleted. Its panels keep
their own tests (`TestBuildPanel`, `TesterReports`,
`ManagedPRSubmitPanel`, `PublishHandover`, `OutputSectionList` all still
pass — they test components, not the screen). The `done` terminal panel
copy changes from "Head to Output…" to point at the Publish step, with a
"Review the Publish step" control.

### Spine / test-surface updates (icon-step precedent, PR #2485)

- `registerEditorSteps.ts`: `trialStep`, `publishStep`.
- `manifest.ts`: pool + `FULL_LAYOUT_IDS` gains `trial`, `publish`.
- `phases.ts`: `StepId` mirror, PHASES G/H, letters A–H.
- `advance.ts`: `ActiveStepId` mirror; `icon → trial`, `trial → publish`,
  `publish → done` (no navigate).
- `surveySessionStore.ts`: `ActiveStepId` mirror.
- Decision modules `survey/questions/gallery/trial.ts` + `publish.ts`,
  registry entries, `decisionTypes.ts` decision ids, coverage /
  derive-screens tests, question-modules snapshot.
- `stepOrder.parity.test.ts` frozen order/edges/membership;
  `manifest.test.ts`, `phases.test.ts`, `advance.test.ts`,
  `advance.open.test.ts` tail sequences.
- `StepHost.tsx`: the revise-and-return machinery keys off a return to
  the tail (`trial` / `publish` steps) as well as the legacy
  `{ route: "output" }`. Same-route arrivals are captured too: Trial lives
  on `#survey`, so a Trial→section jump changes no hash and mounts nothing
  new — StepHost's mount-time deep-link initializer never re-runs, so a
  step-change effect captures the pending jump (and its snapshot) when the
  active step changes under one. (Found by the T042 e2e, which failed with
  a plain Continue on Rules until this landed.)
- `steps/derivedViews.ts`: the derived screen views (`derivedScreens`,
  `screenGates`, `screenTrails`) plus a `manifestStepIds` list (derived
  ids + terminal `"package"`) live here, below the manifest — they are
  computed from the registry alone and never import the step pool, so
  `lib/` and `components/` can read them without cycling back through the
  Trial/Publish hosts. `manifest.ts` re-exports them. `ResolveContext.manifest`
  is ids only (the resolver uses it for membership alone). (Found by the
  pre-push hook: 9 depcruise `no-circular` violations, all through the
  Output-screen family the new hosts import.)
- Headless-author step drivers `trial` / `publish` (+ tests) and
  `journey-runner.ts` cases; golden-walk fixtures (`copy.json`,
  `adapt.json`) + `stepHost.goldenWalk.test.tsx` tail entries.
- Lingui catalogs (`lingui extract`): new message ids for the Trial /
  Publish headings, nudge, done-panel copy, and step titles. The 17
  `output.*` / `picker.*` ids the deleted OutputScreen / PickerPane owned
  are removed from both catalogs by hand (extract never removes obsolete
  ids); the 21 new ids carry real French translations in `fr` — never
  English placeholders, never empty values (the catalog lint errors on
  both). Hand edits must preserve the extractor's key order (no re-sort)
  or the freshness check fails.
- `docs/spec-trace.json`, `manifest.specref.json`.

## Out of scope

- In-browser typing practice against the compiled keyboard, QR / install
  links, tester checklist (see Decisions — deferred follow-ups).
- Automatic HISTORY.md release-note bump.
- Any change to what blocks a download, a test build, or a PR submit.
- Any change to the criteria judgments themselves.
- The `#output` cold-arrival picker (retired with the screen; Start is
  the entry point for picking a base).

## Acceptance criteria

- [ ] The phase stepper shows Trial (G) and Publish (H) as stages after
  Finalize (F).
- [ ] Making test builds, recording tester reports, and revise-and-return
  all work from Trial, and behave the same as spec 094 does today.
- [ ] Release checks, final downloads, and PR submission live in Publish.
- [ ] An author can go back and forth between Trial and Publish, and from
  either one back into any earlier stage, without losing the working copy
  or test history.
- [ ] Existing drafts (including ones with test builds in `testingStore`)
  open into the new flow with no data loss.
- [ ] `#output` (nav tab, Criteria "Continue to Output", bookmarks)
  lands in the tail: Trial normally, Publish when the walk is done,
  Start when there is no project.
- [ ] The golden walk, the spine-order tests, and the Output test suites
  are updated to the new tail.
