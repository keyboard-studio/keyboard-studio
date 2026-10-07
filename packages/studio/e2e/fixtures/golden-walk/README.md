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
- **Live capture: PENDING — runs in CI.** The implementation sandbox's
  Chromium refuses every localhost navigation with
  `net::ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS` (the same block spec
  088 hit for SC-001), so no live capture exists yet and no baseline zip
  is committed. The CI e2e lane (`.github/workflows/ci.yml`, landed with
  the restack) captures the baseline from the PR's base ref while no zip
  is committed, uploads it as the `golden-walk-baseline` artifact, and
  verifies against the committed baseline thereafter. Whoever commits
  the captured zip records here: the base commit it was captured on, the
  capture date, and the CI run id.
  - Note for the next workflow patch: the CI capture step still passes
    `VITE_KM_MUTATE_SEAM=1`. Since T021 that variable is inert (nothing
    reads it; the seam is unconditional), so captures taken with it are
    valid — but the pin should be dropped for accuracy.
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
- The HISTORY proposal carries the capture date: a re-capture on a
  different day legitimately differs in the HISTORY entry alone. Record
  the capture date here on every capture so that diff is attributable.
- Verify mode fails loudly on a missing baseline rather than passing
  vacuously — do not soften that, and do not commit a fabricated
  baseline.
