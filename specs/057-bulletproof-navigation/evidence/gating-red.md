# Gating red baseline — spec 057, FR-080 / SC-013

FR-080: *"The two gating specs (`tab-roundtrip`, `compare-isolation`) MUST be
written to fail against `main` before the fix lands, and that failure MUST be
recorded — an E2E spec that has never been seen red is not evidence."*

This file records that failure, **and which assertion produced it in each
case** — a spec that went red on a missing selector is not evidence either.

## Run conditions

| | |
|---|---|
| Tree | `057-bulletproof-navigation` at the Phase 1/2 boundary — the D-1 mount reset (`SurveyView`, `StudioShell.tsx`) is **still present**, and the tab behind `#preview` is still `PreviewScreen` + `usePreviewArtifact`. None of T006, T031–T034 has landed. |
| Playwright | 1.61.1, Chromium (installed for this version — T002) |
| Dev server | Started fresh by Playwright's `webServer` (nothing was listening on 5273), after a full `pnpm build` — so the run is against a current build, not a stale one. |
| Command | `npx playwright test e2e/tab-roundtrip.spec.ts e2e/compare-isolation.spec.ts --reporter=list --workers=1` (run from `packages/studio`) |
| Result | **4 failed, 0 passed** |

Neither spec is `.skip`-ped (FR-083).

## What went red, and on which assertion

### 1. `tab-roundtrip.spec.ts` — the D-1 defect

**Failing assertion:** `expect(prefillConfirm).toBeVisible()` after the first
round trip, with the message *"returned from #preview to a different step"*.

```
Error: returned from #preview to a different step

expect(locator).toBeVisible() failed

Locator: getByTestId('prefill-confirm')
Expected: visible
Timeout: 20000ms
Error: element(s) not found
```

This is the reported symptom exactly: the walk had reached the characters
step's prefill screen; switching to `#preview` and back left the wizard
somewhere else, because `SurveyView`'s mount effect calls
`useSurveySessionStore.getState().reset()` on the remount that the route change
causes. The test never reached the in-app-Back (D-3) or Phase-B-alphabet (D-4)
assertions further down, because the first round trip already fails.

### 2. `compare-isolation.spec.ts` — the D-6 write path, three ways

All three tests failed.

**(a) Identity-control absence** — `TrackOneIdentityPanel` is live on the tab:

```
Error: an identity-editing control is reachable on the Compare tab

expect(locator).toHaveCount(expected) failed
Locator:  getByRole('region', { name: /Name your keyboard/i })
Expected: 0
Received: 1
```

This is the deterministic anchor T004 calls for: it does not depend on dialog
timing, and it goes red for an unambiguously right reason.

**(b) Dismiss branch** and **(c) accept branch** — both failed on the dialog
count, with the dialog's own text naming the write path:

```
Error: a confirm dialog was offered: Switching base keyboards will discard
your current edits (carve deletions and survey answers). Continue?

expect(received).toBe(expected)
Expected: 0
Received: 1
```

That string is `REBASE_CONFIRM_MESSAGE` from `lib/confirmRebase.ts`, reached
via `usePreviewArtifact.ts:172-176` → `instantiateFromBaseIfConfirmed`. The
accept branch is the one FR-025 requires: pre-fix it answers "yes" to a real
rebase of the author's working copy.

## Two corrections made to reach a *valid* red

Both were recorded rather than quietly fixed, because each one initially
produced a red that would have been worthless as evidence.

1. **The shared walk helper was broken before this feature.**
   `driveIdentityLite` selected the target-script option with
   `trigger.locator('xpath=..').locator('li[data-value=…]')`, but `ui/SelectMenu`
   **portals its listbox to `document.body`** (an ancestor with
   `overflow: hidden` would otherwise clip it), so the option is not a
   descendant of the trigger. Every walk spec hung there until its own timeout.
   Fixed once, in the shared helper, as `selectMenuOption(page, trigger, value)`
   (FR-082); the same latent bug in `driveTouchGallery`'s host-key picker and in
   `locale-switch.spec.ts`'s locale picker was fixed through the same driver.

2. **Pre-existing 1.4.3 contrast debt was masking the real red.**
   The first valid run failed on `expectNoSeriousAxeViolations`, not on
   position loss — the prefill summary's derived-value rows, PickerPane's
   unselected mode-toggle button, and the OSK iframe's own
   `.kmw-spacebar-caption` all fail colour contrast on `main`. 1.4.3 is an open
   `unknown` row in
   [specs/056-ada-accessibility/wcag-2.2-aa-tracker.md](../../056-ada-accessibility/wcag-2.2-aa-tracker.md);
   none of it is introduced or touched by spec 057. The two nodes are now
   excluded by selector with the criterion and reason named at the call site
   (the mechanism `e2e/helpers/axe.ts` documents), and the wizard's own step
   screens are not scanned by this spec. Everything else on every tab visited
   is still scanned.

An earlier run than either of those was discarded outright: source files were
being edited while the dev server was live, so Vite's HMR full-reload reset the
wizard mid-walk. That is a measurement artefact, not a defect, and it is noted
here only so the discarded output is not mistaken for a result.

## Raw output

[`tab-roundtrip-red.clean.txt`](tab-roundtrip-red.clean.txt) holds the verbatim
list-reporter output for run 1. The compare-isolation excerpts above are
verbatim from the combined run that immediately preceded it.

## Green counterpart

The passing runs are appended below as each story lands — `tab-roundtrip` at
T029 (US1) and `compare-isolation` at T038 (US2).

### `tab-roundtrip.spec.ts` — GREEN (T029, SC-001)

Run after the US1 implementation wave (T006 + T023–T027), against a dev server
restarted by Playwright:

```
Running 1 test using 1 worker

  ✓  1 e2e\tab-roundtrip.spec.ts:100:3 › tab round trip preserves the author's
       position (spec 057 US1) › mid-walk position, history and Phase B
       alphabet survive every tab round trip (9.4s)

  1 passed (11.3s)
```

The same spec, unchanged in what it asserts about position, now passes every
assertion the red run never reached: the walk survives a round trip through all
four other tabs, in-app Back still reaches the step the author came from, and
the Phase B alphabet is intact after leaving the build-list screen and
returning.

**One further scan-scoping change was needed between red and green**, recorded
here rather than made quietly. Two more pre-existing 1.4.3 nodes surfaced as
the test got further than it ever had before (`SignUpPanel`'s GitHub button on
Output), and the **Flow Map** turned out to carry broad contrast and
`scrollable-region-focusable` debt across most of its surface. The Flow Map is
a developer aid — it renders only in `vite dev` or behind `VITE_SHOW_FLOWMAP=1`
— so it is no longer axe-scanned by this spec at all; excluding it node by node
would have left a scan that asserted nothing. **The round trip is still driven
through `flowmap`**; only the a11y scan is scoped. Spec 056 owns the Flow Map's
own conformance.

Raw output: [`tab-roundtrip-green.raw.txt`](tab-roundtrip-green.raw.txt).

<!-- T038: append the green compare-isolation run here -->
