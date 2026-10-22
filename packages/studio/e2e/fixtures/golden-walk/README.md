# Golden-walk baseline record (spec 089 SC-001 / T003)

**Baseline**: `basic-kbdfr-copy.zip` — the source .zip emitted by the fixed
copy-track walk in `../../golden-walk.spec.ts` (basic_kbdfr, fixed answers;
see that file's header for the exact answer set and the comparison shape —
per-entry bytes, with `.studio/decision-record.json` presence/parse-only
because it embeds wall-clock timestamps by design).

**Capture environment**: no pin remains. (Research R9 originally pinned
`VITE_KM_MUTATE_SEAM=1`; spec 089 T021 deleted that flag — OI-1 ruled
global — so the seam is unconditional and the capture environment is the
plain dev environment.)

**Capture command (one command, from `packages/studio`)**:

```
GOLDEN_WALK_CAPTURE=1 npx playwright test e2e/golden-walk.spec.ts --project=desktop
```

## Capture status

- **In-sandbox gate (accepted)**: the store-level StepHost golden walk
  (`packages/studio/tests/steps/stepHost.goldenWalk.test.tsx`, fixtures in
  `tests/steps/__fixtures__/goldenWalk/`) — byte-stable across runs on the
  final restacked tree (merge `22288cc5` onto `km/modular-decisions`
  @ `f57d2b88`, which contains 088's close at `ab034928`). Per the owner
  ruling of 2026-10-07 ("Accept store-level gates; run live captures in
  CI"), this store-level walk is the accepted in-sandbox gate for SC-001.
  It is labelled exactly that — it is not a live-app capture.
- **Bootstrap attempts**: capture-on-base could not succeed while main
  itself carried the coverage-gate bug fixed by PR #2309 (merged
  2026-10-20, merge commit `df9435c6`): the base-side walk trapped at
  the touch step for the full capture cap on every attempt (PR #2309's
  golden lane, runs `39350014613` / `39356073494`). With main fixed,
  this PR captures from base `df9435c6`; the captured zip is committed
  here with its run id recorded below.
- **Live capture: RECORDED — 2026-10-19 (America/Chicago).** The CI
  e2e lane (`.github/workflows/ci.yml`) captured the baseline from
  PR #2311's base ref — `main` at
  `df9435c60e226cff1df2a55abf6de560532be57f` (includes PR #2309, which
  fixed main's CI) — in CI run `39369408951`, and uploaded it as the
  `golden-walk-baseline` artifact. The captured `basic-kbdfr-copy.zip`
  is committed here from that artifact (verified on commit: valid zip,
  contains the keyboard package sources, incl. `source/test.kmn`).
  The lane verifies against this committed baseline thereafter.
  - The CI capture step previously passed `VITE_KM_MUTATE_SEAM=1`; the
    pin has been dropped on this branch (`a4c0db8a`). Since T021 that
    variable is inert (nothing reads it; the seam is unconditional), so
    captures taken while it was present remain valid.
- **Literal-`main` capture + cross-base diff (amended T003)**: the CI
  step above captures from the PR base ref (`km/modular-decisions`,
  the stacked base per the OI-2 ruling — the capture stands on it). A
  literal-`main` capture for the cross-base diff has not run; when it
  does, record here the two base commits, the date, and either
  "diff empty" or the name of the differing surface.

## Re-capture notes

- The final restack onto 088's close has landed on this branch
  (`22288cc5`). A re-capture after any future restack updates this
  record.
- The HISTORY proposal carries the walk's date in its top heading
  (`## 1.0 (YYYY-MM-DD)`). The verify step masks that one date on both
  sides, so the baseline holds on any day; every other byte of
  `HISTORY.md` is still compared. Still record the capture date here on
  every capture.
- Verify mode fails loudly on a missing baseline rather than passing
  vacuously — do not soften that, and do not commit a fabricated
  baseline.
