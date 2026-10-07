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

## PARTIAL — T024 grep gates

While the held items stand, `staleSteps`/`repropagate` references in
packages/studio/src are non-zero by design (the machinery is live).
The saved-`workingCopy`-slice reference likewise remains until US2
unblocks. Counts recorded in spec.md's duplication ledger at T027.
