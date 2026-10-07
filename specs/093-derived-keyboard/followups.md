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
