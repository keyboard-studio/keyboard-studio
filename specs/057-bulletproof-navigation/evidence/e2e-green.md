# T073 — the full E2E run (FR-081, SC-013)

**Date:** 2026-08-04
**Verdict: GREEN — 66 passed, 0 failed, 3 skipped.**

T073 makes a green run "a named prerequisite for closing this feature, not an
assumption". That prerequisite is now met. Two failures were root-caused and
fixed to get here, and **neither was a spec 057 regression** — both are recorded
below rather than folded away, because in both cases the originally recorded
diagnosis was wrong.

Raw output, verbatim: [`e2e-green.raw.txt`](e2e-green.raw.txt) (this run),
[`e2e-postfix.raw.txt`](e2e-postfix.raw.txt) (the 65/1/3 run it supersedes) and
[`e2e-t073.raw.txt`](e2e-t073.raw.txt) (the earlier run before that).

## How it was run

```
cd packages/studio && npx playwright test --workers=1 --reporter=list
```

Serial (`--workers=1`) deliberately. The prior recorded parallel attempt
([`e2e-full.raw.txt`](e2e-full.raw.txt)) died with
`worker process exited unexpectedly (code=3221225794)` — `STATUS_HEAP_CORRUPTION`
— on 17 specs with 38 never running, so a serial run is the one that produces a
readable record.

**This run was executed in four foreground chunks**, each a separate invocation
of the command above over a subset of specs (the same approach the previous run
used: two attempts at a single whole-suite background run were killed by the
host part-way through, at tests 17 and 13, no failures in either). The chunking
changes nothing about what ran: all 15 spec files, all 69 tests, one worker,
same config, same dev server. The chunk boundaries are recorded in
[`e2e-green.raw.txt`](e2e-green.raw.txt):

| chunk | specs | result |
|---|---|---|
| 1 | boot-smoke, browser-back, carve, compare-isolation | 10 passed |
| 2 | copy-edit, decision-deeplink, exemplar-prefill, footer-progress | 15 passed |
| 3 | import-improve, locale-switch, switch-base-exploration | 34 passed, 3 skipped |
| 4 | switch-base-rebase, tab-roundtrip, touch-derivation-us1, touch-derivation-us2 | 7 passed |

## Gates re-run first

- `pnpm typecheck` — green, all 7 packages.
- `pnpm --filter @keyboard-studio/studio test` — green, 361 files / 5269 tests.
- `pnpm lint` — green, re-run after the us2 fixes (all sub-linters `[OK]`; 447
  test files scanned by `test-antipattern-lint`).

The us2 fixes touch only `e2e/**`, which is excluded from both the vitest and
the tsc lanes (see [`packages/studio/playwright.config.ts`](../../../packages/studio/playwright.config.ts)'s
header) — so those two gates are unaffected by them by construction, and the
E2E run itself is the only lane that exercises the change.

An earlier red in `pnpm -r test` is documented in the superseded section below.

## Progress against the prior record

| Run | Failed | Passed |
|---|---|---|
| [`e2e-serial.raw.txt`](e2e-serial.raw.txt) (pre-Class-B-fix) | 17 | 46 |
| first T073 run (Class B fixes in tree) | 3 | 63 |
| second T073 run (+ two spec fixes) | 2 | 64 |
| fourth run (+ the F2 fix) | 1 | 65 |
| **this run** (+ the us2 fixes) | **0** | **66** |

## The F2 failure — ROOT-CAUSED and FIXED

`switch-base-rebase.spec.ts:227` was the P0 that blocked the previous run. It was
**two defects stacked**, and the earlier reading of it — that this branch
introduced the loss — was wrong.

- **Defect A:** the test reloaded inside the ~500 ms autosave debounce, so
  `loadDraft` restored the install-time save and the assertion compared a live
  count against a stale one. `2 → 1` was a stale read, not data loss. Fixed in
  the test, by waiting the debounce out before reloading.
- **Defect B (the real one):** on a restoring boot `doCommit` re-fired and
  re-derived the instantiation mode from `selectedTrack` — a value that has
  *advanced* since the original commit, because the base is confirmed at
  `choose_base`, before the track step exists to answer. `new-from-base`
  re-committed as `adapt-existing`; `resolveInstantiationCase` read same-id/
  different-mode as a genuine base switch and cleared `phaseResults`.

Fixed in `StudioShell.tsx`'s mount-time autosave effect: a restoring boot now
pre-seeds `instantiatedForBaseIdRef` (so `doCommit` early-returns, as the résumé
path has always done) and installs the real-project autosave directly.

**It was never a spec 057 regression.** The same probe against main's
`packages/studio/src` loses the working copy identically (`1 → 0`); the test
passed on main only because Defect A restored a stale draft that happened to
hold the same count the live store held. Full analysis, traces and the
main-vs-branch table:
[`../reviews/F2-reload-phaseresults-loss.md`](../reviews/F2-reload-phaseresults-loss.md).

### The fix also repaired an unshipped SC-001/SC-002 hole

The same re-commit fired on a **route remount**, not just a reload. Measured
directly on the adapt track, across `switchTab(preview) → switchTab(survey)`:

| Studio source | `phaseResults` before → after |
|---|---|
| this branch, pre-fix | **2 → 0** |
| this branch, post-fix | **2 → 2** |

So a tab round trip was discarding the working copy on the adapt track — exactly
what SC-001/SC-002 claim it does not — while `tab-roundtrip.spec.ts` passed,
because that spec's walk keeps the modes in agreement and the re-commit no-ops.
This was found only because the F2 investigation went past the failing
assertion.

That repair is what surfaced the one new axe node this run: with the working
copy preserved, `RemovalBanner` now renders on the Phase B build list in the US1
walk, and its "Dismiss" button carries the same open 1.4.3 debt as every other
excluded node on that screen (`RemovalBanner.tsx` is byte-identical to `main`).
Added to `touch-derivation-us1.spec.ts`'s `KNOWN_CONTRAST_DEBT` with the
reasoning inline. The scan is seeing more of the screen, not a new violation.

## The last failure — `touch-derivation-us2.spec.ts` — FIXED

`confirmReseedDefault` timed out on `seed-source-preview`. The previous run
recorded this as spec 035's reseed step being broken. It was not: Playwright's
own `error-context.md` page snapshot showed the seed-source panel fully
rendered, on the right step, with **Reseed from desktop [pressed]** and its
preview card visible. The step worked; the **testid was stale**.

Upstream commit `8709ff54` (2026-07-29) split the panel's preview column into
two mutually exclusive cards keyed on the selection — so on the reseed path
`seed-source-preview` cannot exist (it is the import-adapt card;
`seed-source-reseed-preview` is the reseed one) — and separately added the
**tablet** reseed skeleton, so the emitted platform id moved from `phone` to
`tablet`.

That second change had been silently disarming assertions for a week: both
tests read `touchJson.phone`, so every `for (const layer of
touchJson.phone?.layer ?? [])` loop iterated an empty array and asserted
nothing. Test 2 was reported "passing" on that basis. A fourth defect, found
alongside, was a negative assertion checking for copy that appears in no branch
of the component — it could never have failed.

All four are fixed, with the row-width invariant **removed rather than
repointed** (it was a compact-*phone* invariant the tablet skeleton genuinely
does not satisfy) and replaced by a platform-key-set assertion that is strictly
stronger for the AS4 case. Full analysis:
[`../reviews/us2-stale-assertions.md`](../reviews/us2-stale-assertions.md).

**Not a spec 057 regression:** `TouchSeedSourcePanel.tsx`,
`buildTouchLayoutJson.ts` and `scaffoldTouchLayout.ts` are all byte-identical to
`main`. The Class B diagnosis had flagged the touch gallery as a related risk it
declined to fix blind ([`../reviews/classB-diagnosis.md`](../reviews/classB-diagnosis.md));
that instinct was right, but the actual cause lay outside spec 057 entirely.

## Skipped / not run

3 skipped — `import-improve.spec.ts` (Track 2, `.skip`-ped for its own reasons,
recipe at the top of that file). Nothing "did not run".

## Superseded record: the `pnpm -r test` red

The first T073 run found `pnpm -r test` red with 3 failures, all in the
then-untracked `packages/studio/src/lib/serializeWorkingCopy.stubCompletion.test.ts`:
`TypeError: ir.groups is not iterable`. Its three `makeTestIR()` calls passed no
arguments, but `makeTestIR(groups, …)`
(`packages/contracts/src/fixtures/keyboard-ir.ts:11`) takes `groups` as a
required first parameter. Fixed to `makeTestIR([])`.

Worth naming: T072 had recorded that gate as green, and this file was added
afterwards. It slipped through `pnpm typecheck` because
`packages/studio/tsconfig.json` does not cover test files — so a type error in a
`.test.ts` is invisible to the typecheck lane. Not changed here (out of T073's
scope), but it is why a broken test could sit in the tree looking green.

## Bottom line for SC-013

SC-013's "a browser walk that switches tabs mid-flow completes to a downloadable
artifact" **is** established: `copy-edit.spec.ts` carries the mid-walk tab round
trip (T067) and reaches a real download, and every one of its walks passed here.
The gating-spec half is on record in [`gating-red.md`](gating-red.md).

T073's own clean-suite prerequisite is also met: **0 failures.**

One caveat worth carrying into review rather than burying. Reaching green
required fixing two recorded failures whose original diagnoses were both wrong,
and in the course of that, three assertions were found that had been reporting
green while **not executing** (two empty-collection loops, one negative
assertion against non-existent copy) plus one gating spec that passed while the
property it gated was broken (the tab-remount hole in
[`../reviews/F2-reload-phaseresults-loss.md`](../reviews/F2-reload-phaseresults-loss.md)).
A green suite is the prerequisite T073 names, and it is now satisfied honestly —
but this run is a reminder that green is evidence about the assertions that ran,
not about the properties they were written to protect.
