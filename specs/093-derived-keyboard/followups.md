# Spec 093 — follow-ups and held items

Recorded by the implementing agent (2026-10-07 run). Items here are HELD,
not abandoned: each names the predecessor state that unblocks it.

## HELD — T010/T011 (US1 completion): repropagate/staleSteps retirement

FR-005's deletion cannot land truthfully on the current tree:

- The touch surface is not decision-derived yet. The registry's
  touch-layout module (`survey/questions/gallery/touchLayout.ts`) is a
  provider shell — `apply: () => ({})`, header: "the real renderer/apply
  fill in with T042 (US4)" — and spec 090's US4 has not landed on this
  stack. The live touch derivation still runs through
  `touchSuggest` + `steps/repropagate.ts` + the touch step's
  `buildTouchLayoutJson` build, none of which the general rule can
  reproduce today.
- `staleSteps` has live readers/writers the general rule does not
  replace for touch: MechanismGallery's unlock path marks "touch"
  stale directly; `survey/journey-runner.ts` marks the revisited step
  on deep-link revision; OutputScreen gates downloads on
  `staleSteps.has("touch")`; the reducer's mechanisms-completion case
  triggers `repropagate()` off the slice; `lib/persistWorkingCopy.ts`
  serializes the slice into the draft's workingCopy snapshot.
- Deleting now would remove the automatic touch re-derivation
  (spec 014 R1–R6 behaviour), the unreviewed-touch download gate, and
  the revisit marking, with no replacement — a behaviour regression,
  not a retirement.

Unblocks when: spec 090 US4 (touch-layout apply, its T042) and the
carve migration (090 US3; cf. spec 092's T037 pending-predecessor) land
on this branch via the cascade, making the touch surface a decision
value the recalculation rule can refresh per item. Then T010 re-points
the consumers above and T011 deletes, with the R1–R6 contract tests
re-proven against the general rule.

## HELD — T014/T015/T016/T018 (US2): decisions-only drafts at v3

The v2 envelope's `workingCopy` slice carries author work that is not
decision-derived on this tree (carve deletion overlays, touch draft,
key-edit/deadkey overlays, guard dispositions, disabled families —
see `lib/persistWorkingCopy.ts`'s WorkingCopySnapshot). Dropping the
slice at DRAFT_VERSION 3 (T015) and making resume a replay-only
rebuild (T018) would silently lose that work on reload until the
same 090 conversions above make those surfaces decision values.

- T014 (v2 fixture capture) is buildable in isolation but pointless
  until T015 can land; held with the story.
- T016's migration (rebuild-from-decisions, drop-on-match) inherits
  the same dependency: the rebuild it compares against cannot yet
  reproduce the stored slice byte-for-byte for carve/touch state.
- T017 (starting-point change = recalculation) is NOT held: its
  decision-level core lands in this run (see tasks.md).

Unblocks when: the same 090 US3/US4 conversions land. The v3 work
then proceeds exactly as tasked (fixture, envelope, boot-scan
migration with .v2/.v1 key chaining, replay resume, SC-003 walk).

## T026 — full verification record (2026-10-07, tree @ 9add4260 + docs)

Gates: `tsc --noEmit` (studio) exit 0. eslint (studio) 0 errors / 397
warnings, exit 0. depcruise (root config): 142 violations — 134
no-circular (zero through any 093-authored file; upstream stack state),
6 decisions-layer (see the dedicated section below), 2
question-modules-no-bypass (Phase F modules, upstream).

Vitest (studio, 503 files): verdicts for 502 files. Method, for the
record: two full runs stalled deterministically at file 354 (a
non-terminating file blocks the serial schedule — identified below)
and were killed; the first 353 files' accounting was reproduced
EXACTLY by both runs (6,568 tests, 52 failed, same 17 files), and the
remaining 150 files were covered in timeout-bounded batches and
singles. **68 failed tests total, every one classified; no failure is
a 093 regression** (093's own suites — decisions/*, the StepHost
rebuild suites, startingPointChange — are green):

- **47 tests — the named screenRequires item** (lead-ruled 2026-10-07:
  092's copyright `requires` edge converts from module `requires` to
  `screenRequires` at the 092 restack pass after 091 completes; not
  dropped, not 093's to fix). Every one traces to the exact throw
  `unresolved decision: "authoring-track" required by
  "il_copyright_holder"` on this intermediate stack (091 partial flow +
  092 edge): StudioShell.previewCommitGating 8, IdentityLite.attribution
  8, IdentityLite.resume 5, journey-runner 5, panelAdapters 4,
  IdentityLite.codeMismatchWarning 4, IdentityLite.provenance 3,
  IdentityLite.autoAdvance 2, viewStateRestoration 2, DashboardView 1,
  gateWalkParity 1, orderParity 1, successCriteria 1, sc002 1,
  IdentityLite.autonymDedup 1 — plus IdentityLite.test.ts failing at
  collection (0 tests) on the same throw.
- **4 tests — the standing SC-004 local-corpus budget**
  (successCriteria.sc004 2 + sc004.kmp 2; basic_kbdru / arabic_izza).
- **2 tests — goldenWalk fixture delta** (089/090-owned; see T023).
- **2 tests — renderSmoke touch_seed_source** (upstream partial state).
- **8 tests — DecisionsDemo** (retired demo surface).
- **1 test — drillDownDeclarations FR-014 anchor reachability**
  (091/092 identity-walk seam; not the throw, same restack family).
- **4 tests — registry/module drift on the intermediate stack**:
  registry inventory 128 vs the verified 114 (091's added modules) +
  flow-membership, questionModules marksTreatment definition snapshot,
  windowsLayout renderer recorded-value test (090/091 surfaces; 093
  touched none of them).

**Non-terminating files (2)** — `survey/PhaseFAdaptiveDescription.
integration.test.tsx` and `survey/PhaseFContactSeed.integration.
test.tsx` burn CPU indefinitely on this stack (killed at 90s/150s
timeouts; they are what stalls a full-suite run at file ~354). Their
drivers walk the Phase F flow, which cannot render while the identity
flow throws — same named-item family; expect termination when the
restack lands the conversion. Flagged for the lead: until then, any
full-suite run on this branch needs these two files excluded or a
timeout.

**Environment-blocked (1)** — `tests/steps/stepHost.fullStepScroll.
test.tsx`: no code verdict. Collection failed ENOSPC (the 512 MB /tmp
tmpfs under parallel crew load), then two single-file retries were
OOM-killed (137) with 090's suites running concurrently. Its sibling
mirror-coverage passed 140/140 under the same conditions. Re-run on a
quiet machine / in CI.

## T017 — core LANDED; live wire-in STOPPED (needs a lead/owner call)

Landed: `decisions/startingPointChange.ts` —
`recalculateForStartingPointChange(deps, { decisions, startingPointIR })`
is the T009 rebuild with the widest closure: empty `changed` set (the
cause sits outside the decision graph), a new `visitAll` flag on the
recalculate/rebuild requests (every record visited; gates land outside
any requires closure), a freshly seeded trail, and a full replay from
checkpoint 0 over the new starting point. Tests:
`startingPointChange.test.ts` 6/6 (re-extract names the new source;
defaults recompute; valid asked kept by reference with its old source;
invalid asked kept + re-proposed via `offered`; full-replay state +
fresh trail; visitAll gate flips + no-visitAll control).

NOT wired into StudioShell, on evidence: the only live
starting-point-change moment is `doCommit` on a genuine base switch,
and that path is a **discard-by-consent** flow — the F1 rebase gate has
the author accept "Switching base keyboards will discard your current
edits" (BaseResolutionAdapter.confirmRebaseTo) before doCommit runs,
and doCommit's own comments frame the switch as abandoning the old
project's state (autosave teardown/reinstall under the new key). A
retained-set recalculation wired in after the extraction pass would
silently change what the author consented to. Options for the lead:
(a) wire the core into a path where decisions are retained BY DESIGN
across a starting-point swap (e.g. resume/migration when the stored
starting point no longer matches the corpus base) — no such signal
exists on this tree today; (b) supersede the switch-base product
semantics by owner ruling (recalculation instead of discard) and
reword the rebase consent accordingly — not 093's call to make
unilaterally; (c) leave the core as the engine contract and wire it in
the post-091 restack pass, when the unified flow settles what a base
switch means. 093's recommendation: (a)/(c) — the semantics are
implemented and pinned; the product question is the open item.

## OWNED DELTA — carve-overlay fold (090 ruling D-090-24, relayed by the lead 2026-10-07)

090's carve module ships as value + extract + step-side recording with
a NO-OP apply: 089's patch contract has no carve-overlay channel, and
amending a PRed contract mid-flight was rejected. Consequence owned by
093: when 090 completes and restacks up to this branch, the
carved-layout decision values in the decision set must fold into a
CARVE-OVERLAY state in the I-1 overlay accumulator, so a replay
rebuild can install the overlay slice (deleted node/item/touch-key
sets, carve chars, dispositions) into the working copy. 090 has been
ruled to record values sufficient for that reconstruction (removal
items + dispositions). Deadkeys/rules need no such fold (IR-channel
applies; replay already handles them).

Seam assessment (against the landed T009 wiring, commit 4b2412a1):
no fight — the extension is additive.
- `decisions/replayKeyboard.ts`: `OverlayState` is currently
  `Omit<WorkingCopyPatch, "ir">` (closed over the patch channels);
  it gains a carve slice field. `foldPatch` spreads the prior overlay,
  so the slice survives folds it doesn't touch; checkpoints retain
  the overlay by reference, so it rides the trail free.
- The fold step itself (decision values → carve-overlay state) is
  written when 090's value shape lands here — writing it now would
  mean inventing that shape.
- `decisions/rebuildWorkingCopy.ts` `installRebuiltState` enumerates
  the overlay channels explicitly; the carve install block slots in
  beside them (writing the store's carve slice actions).
This delta unblocks together with the T010/T011 hold above (same
predecessor landing: 090 US3 carve + US4 touch).

## PARTIAL — T024 grep gates

While the held items stand, `staleSteps`/`repropagate` references in
packages/studio/src are non-zero by design (the machinery is live).
The saved-`workingCopy`-slice reference likewise remains until US2
unblocks. Counts recorded in spec.md's duplication ledger at T027.
Measured 2026-10-07 @ 9add4260 (packages/studio/src only): `staleSteps`
71 references, `repropagate` 25 references, `workingCopy` 31 references
across lib/persistWorkingCopy.ts + lib/draftPersistence.ts. The gate
stays PARTIAL (checkbox unchecked) until the held items land.

## T026 — depcruise decisions-layer items (series-level call for the lead)

Full depcruise on this tree: 142 violations = 134 no-circular (none
through any 093-authored file; upstream stack state) + 6
decisions-layer + 2 question-modules-no-bypass (Phase F modules,
upstream). The 6 decisions-layer are all the series' live-wiring
pattern — a decisions module's store-wiring half imports the stores it
wires: liveExtraction.ts ×2 (092, landed), rebuildWorkingCopy.ts ×2
(093 T009), rebuildPerf.measure.ts ×2 (093's measurement harness,
reads the stores it measures). Options: (a) exempt the named wiring
modules in .dependency-cruiser.cjs; (b) relocate the FromStores entries
out of decisions/. Not actioned at close-out — restructuring at the
end of the stack would churn every downstream branch.

## LEAD RULINGS on the close-out flags (2026-10-07)

**T017 wire-in → option (c).** The recalculation core stays as the
pinned engine contract (`startingPointChange.test.ts` 6/6); it is NOT
wired into StudioShell's `doCommit` in this pass. The discard-by-consent
semantics of the F1 rebase gate are product behaviour: option (b)
(supersede discard with retain-and-recalculate, rewording the consent)
is an OWNER call, put to Matthew explicitly by the lead — it is not
taken by the crew. Wire-in is scheduled for the post-091 restack pass,
alongside the held set, and lands then under whichever product ruling
stands: (b) if the owner supersedes, otherwise into a retention-by-
design path when one exists (option (a)'s shape). Until then no
FromStores entry is added — no dead code, as the agent left it.

**Depcruise decisions-layer → option (a).** Exempt the named
store-wiring modules in `.dependency-cruiser.cjs`
(`liveExtraction.ts`, `rebuildWorkingCopy.ts`,
`rebuildPerf.measure.ts`). Principle recorded for the series: the
decisions-layer rule guards the PURE decision core; a decisions
module's store-wiring half imports the stores it wires by definition
(the pattern 092 landed and 093 followed). Exemptions are added
deliberately per wiring half; core modules are never exempted.
Option (b) (relocate the FromStores entries out of decisions/) is
rejected: it restructures a layout three landed specs share, at the
top of the stack, for no behavioural gain. Execution: in 093's final
restack pass, against the final tree's module set.

**OWNER RULING on T017 (Matthew, 2026-10-07): option (b) STANDS.**
Base switch becomes retain + recalculate. When 093's final restack
pass wires the core into StudioShell's `doCommit`, the F1 rebase
consent is reworded in the same change: it must no longer promise
discard ("Switching base keyboards will discard your current edits")
— it states that the author's decisions are retained and recalculated
against the new base, and that answers which no longer fit are
re-proposed (the core's `offered` path), never silently dropped.
Exact strings are the implementer's, against that requirement. The
wire-in remains scheduled for the final pass (post-091 restack), not
a standalone change on this tree.

## FINAL PASS (2026-10-07) — the non-terminating flow-driver family: CAUSE FOUND AND FIXED

The three files (`survey/PhaseFAdaptiveDescription.integration.test.tsx`,
`survey/PhaseFContactSeed.integration.test.tsx`,
`editors/adapters/panelAdapters.test.tsx` IdentityLite block) hung on the
completed stack. Inspector evidence (worker paused mid-spin, twice, plus a
12s CPU profile): the stack is SurveyRunner render → callerProposal →
recordProposal → runLiveExtractionFromStores → the ordering/gating
machinery, with samples spread across orderByDependencies /
routingPredecessors / filterGated and React diffing — i.e. the extraction
pass re-running in a render loop, not a loop inside any one function.

Mechanism: spec 092's G-9 makes SurveyRunner re-run the live extraction
pass at question-push time when a question has no record. The pass's
documented idempotence was VALUE-level only: its re-seed branch rewrote
every extracted/default record with a fresh object on every pass
(proven: passes 2 and 3 over the initial stores re-seeded
`help-history-entry` + `help-more-detail` and replaced both record
objects). `recordAll` therefore churned the decisions map's identity on
every pass → IdentityLiteAdapter (subscribed to the whole map) re-rendered
→ SurveyRunner re-rendered → recordProposal re-ran the pass → forever.
On the intermediate stack the pass THREW (the authoring-track edge)
before writing, which masked the loop as ordinary failures; 092's A2
edge fix removed the throw and exposed the loop.

Fix (this branch): `runLiveExtraction` is now idempotent at the STORE
level — a re-seed or an offer that would store exactly what is already
held (deep-equal over the full record) writes nothing. Pinned in
liveExtraction.test.ts (second run returns {seeded: [], offered: []} and
record objects are identical; an already-standing offer is not
rewritten). All three files now terminate and pass: panelAdapters 10/10,
Phase F pair 9/9.
