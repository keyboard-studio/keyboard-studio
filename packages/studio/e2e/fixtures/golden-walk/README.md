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
- The HISTORY proposal carries the capture date: a re-capture on a
  different day legitimately differs in the HISTORY entry alone. Record
  the capture date here on every capture so that diff is attributable.
- Verify mode fails loudly on a missing baseline rather than passing
  vacuously — do not soften that, and do not commit a fabricated
  baseline.
- **Re-capture: 2026-10-28 (America/Chicago), from main `4caeda5a`
  (merge of PR #2355, dev promotion).** The 2026-10-20 baseline predated
  #2304 ("copy track never ships the starting keyboard's welcome/help
  prose", spec 102 FR-032), so main's golden lane failed on exactly
  `source/help/test.php` and `source/welcome/welcome.htm`: the walk now
  emits a fresh "Start Using Test Autonym" page with no French Basic
  prose, while every other emitted file (including the keyboard, .kps,
  and generated typing-guide sections) is byte-identical to the old
  baseline. This capture was taken locally (Playwright desktop, pinned
  corpus `435f82d6`, same tree as `4caeda5a` plus the test-only
  `releasePathToVfsKey` rename that fixed the build lane) and verify
  mode passes against it locally, including after the
  workingCopyStore fresh-instance-tail fix that landed in the same
  push; the HISTORY entry carries the
  2026-10-28 capture date, which verify normalises.
- **Re-capture: 2026-10-30 (America/Chicago), from `km/106-carve-claimed`
  at `502fb061`.** Taken locally (Playwright desktop, Windows). Spec 106
  US4 changed what the walk emits, so the old baseline differed in
  `HISTORY.md`, `build/*`, and `source/test.{kmn,keyman-touch-layout,kvks}`:
  the carve step now applies marked suggested discards on Continue (the
  composed forms of the dead-key stores and the micro sign key are gone,
  with `dk(..) X > context` guards for the discarded composed forms), and
  carve drops starting rules that assignments claimed (the K_COLON and
  K_RBRKT starting rules, shadowed by dk(3000) and dk(3001)). HISTORY
  gains a "Removed 15 keys." bullet and carries the 2026-10-30 capture
  date, which verify normalises. Verify mode passes against it locally.
- **Re-capture: 2026-10-31 (America/Chicago), from PR #2415
  (`km/review-version-bump-verdict`) at `0745fe90`.** Taken locally
  (Playwright desktop, pinned corpus `435f82d6`, vite dev server).
  The criteria-audit batches changed what the walk emits; the old
  baseline (2026-10-30, `502fb061`) differed in exactly five entries,
  each mapped to its criterion: `README.md` gains the keyman.com
  keyboards link (5.5b, batch 3); `source/test.kmn` and
  `source/test.kps` lose their copyright years (4.6b, batch 3), and the
  `.kps` additionally emits `<LicenseFile>` (10.7b, batch 1);
  `source/help/test.php` carries its styles in the PHP header's
  `$pagestyle` (11.3b, batch 3); `build/test.kmx` is recompiled from
  the changed `.kmn`. `HISTORY.md` carries the 2026-10-31 capture date
  (verify normalises it) and `.studio/decision-record.json` its
  wall-clock timestamps (presence-checked only). Every other entry is
  byte-identical. Verify mode passes against it locally.
- **Re-capture: 2026-11-01 (America/Chicago), from PR #2425
  (`km/ci-copyright-fidelity`).** Taken in-sandbox (Playwright desktop,
  pinned corpus `435f82d6`, vite dev server). The copyright-carry fix
  changed what the walk emits: the walk now carries the source keyboard's
  `&COPYRIGHT` instead of year-stripping it. The old baseline (2026-10-31,
  from PR #2415) differed in exactly two entries: `source/test.kmn` line
  15 (`store(&COPYRIGHT) '(c) SIL International'` →
  `store(&COPYRIGHT) '(c) 2009-2019 SIL International'` — basic_kbdfr's
  own notice, carried byte-identical) and the recompiled `build/test.kmx`
  (+20 bytes, the carried notice in UTF-16LE). `HISTORY.md` carries the
  2026-11-01 capture date (verify normalises it) and
  `.studio/decision-record.json` its wall-clock timestamps
  (presence-checked only). Every other entry is byte-identical. Verify
  mode passes against it locally.
- **Re-capture: 2026-11-02 (UTC), from main `7488502e`.** Taken locally
  (Playwright desktop, keyboards corpus at pinned `435f82d6`, vite dev server).
  PR #2440 merge did not change the walk; `711c145c` (welcome layout SVG
  charts for copy keyboards with welcome images) added nine
  `source/welcome/ks-layout-*.svg` entries and updated `welcome.htm` img refs.
  Verify mode passes against it locally.

## 2026-11-03 — README.md / source/readme.htm refreshed (spec 110)

Spec 110 changed what README.md and readme.htm say (a characters and
keystrokes summary, design notes, a brief install-time readme.htm). CI on
PR #2448 reported exactly those two entries differing from the baseline.
They were re-captured with the capture command above against corpus
`435f82d6` (the CI pin) and spliced into this zip; every other entry is
byte-identical to the previous baseline. A whole local capture is not
committed because a Windows checkout with `core.autocrlf=true` gives
`test.kvks` / `test.kpj` CRLF line endings that CI never produces.

## 2026-11-05 — `&CasedKeys` lists only cased keys (spec 112, PR #2513)

PR #2513 changed the Copy walk's `&CasedKeys` store from every key
(`[K_0] .. [K_9] [K_A] .. [K_Z]` plus punctuation and `K_SPACE`) to only the
keys with an upper/lowercase pair. The golden lane could not show this: since
the html editor joined the survey tail (`cfb2feaf`), `driveHelpPhase` walks
through the html step to `#output`, and the walk's separate
`driveHtmlEditorStep` call then timed out waiting for a step already passed.
That call (and the now-unused helper) is removed. Captured locally from main
`ba3bdaa3` (Playwright desktop, Windows, corpus `435f82d6`); the differing
entries were `source/test.kmn` (the `&CasedKeys` line only) and the
recompiled `build/test.js` / `build/test.kmx`, spliced into this zip.
`test.kvks` / `test.kpj` differed only by CRLF (the autocrlf note above) and
`HISTORY.md` / `.studio/decision-record.json` only by dates, so they were not
replaced. Locally, verify then differs only in the CRLF-only `test.kvks` /
`test.kpj`; CI's LF checkout is the gate.

## 2026-11-06 — Re-capture for PR #2523 (Ewondo test-run fixes)

**Re-capture: 2026-11-06 (America/Chicago), from PR #2523
(`km/ewondo-test-fixes`) at `3f0c193e` merged with main `321b39ca`.**
Taken locally (Playwright desktop, pinned corpus `435f82d6`, vite dev
server); verify mode passes against it locally.

Why a merge tree: CI verifies the walk on the pull-request merge tree,
and this branch predates main's #2513 (`&CasedKeys` derived in the
projection) and #2518 (golden-walk spec fix — the dead
`driveHtmlEditorStep` call, which would hang a capture on the branch
head alone). The capture ran on a throwaway local merge
(`tmp/2523-merge-test`, `dda91e81`); its single conflict, in
`packages/studio/src/lib/serializeWorkingCopy.ts`, was resolved by
keeping the PR-side projected-charts re-render — main's side only
restructured the same lines with the `if (!isOpen)` guard. The branch
itself is NOT rebased or merged by this commit: only the baseline zip
and this record change here. If the eventual merge resolves that
conflict differently, re-capture.

The failing run was `42248482153` (golden-walk job `127996975924`):
the walk differed from main's baseline in exactly thirteen entries,
each an intended output change of PR #2523 (`source/test.kmn` differs
only by the two added marks-guard lines — #2513's `&CasedKeys`
narrowing is already shared by the walk and the baseline):
`HISTORY.md` (model-derived added/removed lines; capture date
2026-11-06, which verify normalises); `NEXT_STEPS.md` (leave `build/`
and `shared/` out); `README.md`, `source/readme.htm`,
`source/help/test.php`, `source/welcome/welcome.htm` (docs built from
the projected keyboard, with a Marks section; `readme.htm` gains the
welcome page's HTML shell); `source/test.kmn` (marks-guard hop) and
the recompiled `build/test.js` / `build/test.kmx`; `source/test.kps`
(author's own description, `<Author>` / `<Copyright>`); three layout
charts re-rendered from the projected model (`desktop-shift` drops µ,
`tablet-default` labels the space key, `tablet-rightalt` labels `;`).
`.studio/decision-record.json` gains the OSK-step entry (main #2505)
and is presence-checked only. Every other entry is byte-identical to
main's baseline.

Note: the CI `golden-walk-baseline` artifact is NOT the walked output
— the workflow re-uploads the committed baseline file — so it cannot
be used as a capture source; this baseline is a fresh local capture.

**Branch merge (2026-11-06):** the branch was then merged with main
`02528362`. The `serializeWorkingCopy.ts` conflict was resolved with the
projected-charts re-render moved *inside* main's `if (!isOpen)` guard;
the copy walk never takes the open path, so the walked output is
unchanged. A local capture on that merge tree matched this zip in every
entry except the CRLF-only `source/test.kvks` / `test.kpj` (Windows
`autocrlf`) and `.studio/decision-record.json` timestamps, so this zip
was kept rather than re-captured.
