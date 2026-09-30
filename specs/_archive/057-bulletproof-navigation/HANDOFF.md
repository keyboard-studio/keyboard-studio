# Handoff — spec 057 bulletproof-navigation, T073 blocked RED

**Status: the feature CANNOT be closed.** T001–T072 are complete and checked off.
T073 (full E2E green) and T074 (SC validation) are **not** done, and `--mark-complete`
must not be run.

Branch: `057-bulletproof-navigation`. Working tree at handoff: only evidence files
added/modified (no source edits pending), plus an untracked
`SECURITY-REVIEW-2026-08-02.md` that predates this work and is unrelated.

---

## 1. What T073 actually measured

Dev server restarted clean (`pnpm dev`; engine `tsc -b` 0 errors, Vite on 5273),
then the full suite twice:

| Run | Passed | Failed | Skipped | Did not run | Wall |
|---|---|---|---|---|---|
| `npx playwright test --workers=3` | 46 | **17** | 3 | 3 | 22.2m |
| `npx playwright test --workers=1` | 46 | **17** | 3 | 3 | 36.1m |

**The failure set is identical at both concurrencies.** These are deterministic
defects, not flake and not resource contention.

Raw output (verbatim, committed alongside this doc):
- [`evidence/e2e-serial.raw.txt`](evidence/e2e-serial.raw.txt) — the authoritative run
- [`evidence/e2e-parallel.raw.txt`](evidence/e2e-parallel.raw.txt)
- [`evidence/e2e-full.raw.txt`](evidence/e2e-full.raw.txt) — an **earlier, invalid** run;
  17 failures all `worker process exited unexpectedly (code=3221225794)` =
  Windows `STATUS_DLL_INIT_FAILED` from 8 default workers. Discard it as a
  measurement artefact; it is kept only so it is not mistaken for a result.

Note: the version of `e2e-full.raw.txt` committed at `2df3f487` was an **empty
placeholder**. This branch has never had a recorded green full E2E run. T071
(`pnpm lint`) and T072 (`pnpm typecheck`, `pnpm -r test`) greens are real and
were re-confirmed as still recorded; only the E2E claim was never made.

---

## 2. All 17 failures, classified

| # | Spec | Failure | Class |
|---|---|---|---|
| 1 | `browser-back.spec.ts:51` | `track-adapt` not visible after `goBack()` | **D** — 057 T066 |
| 2 | `carve.spec.ts:95` | axe contrast, carve gallery | **A** — pre-existing |
| 3 | `copy-edit.spec.ts:171` | axe contrast, "phase B complete" | **A** |
| 4 | `copy-edit.spec.ts:211` | Output tab gated, 240s timeout | **B** — 057 T067 |
| 5 | `copy-edit.spec.ts:244` | Output tab gated, 240s timeout | **B** |
| 6 | `copy-edit.spec.ts:345` Latn | Output tab gated, 240s timeout | **B** |
| 7 | `copy-edit.spec.ts:345` Geor | Output tab gated, 240s timeout | **B** |
| 8 | `copy-edit.spec.ts:361` | Output tab gated, 240s timeout | **B** |
| 9 | `copy-edit.spec.ts:428` | `carve-gallery` never visible, 20s | **B?** unconfirmed |
| 10 | `decision-deeplink.spec.ts:83` | no `decision-entry` "Authoring approach" | **C** — 057 US3 |
| 11 | `exemplar-prefill.spec.ts:55` | axe contrast | **A** |
| 12 | `footer-progress.spec.ts:55` | axe contrast, survey+footer | **A** |
| 13 | `switch-base-exploration.spec.ts:448` L7 × switch-base (Cancel) | `base-confirm` stuck disabled ("Preparing preview…") 120s | **E** unexplained |
| 14 | `switch-base-rebase.spec.ts:143` | stray draft key in localStorage | **E** — likely 057 regression |
| 15 | `touch-derivation-us1.spec.ts:234` | axe contrast, Phase B build list | **A** |
| 16 | `touch-derivation-us2.spec.ts:367` | axe contrast, Phase B build list | **A** |
| 17 | `touch-derivation-us2.spec.ts:463` | 240s locator timeout | cascade of 16 |

3 skipped = `import-improve.spec.ts` (deliberate, see its file header).
3 did not run = downstream of a failed sibling in the same file.

---

## 3. Class A — axe contrast. **NOT 057's. Do not "fix" it inside 057.**

Six failures are `serious` colour-contrast (WCAG 1.4.3) violations on the carve
and Phase B screens. Offending nodes include
`button[aria-label="Hide info panel"]`, `button[data-testid="carve-continue"]`,
`button[aria-label="Dismiss removal recommendation"]`,
`button[data-testid="phase-b-intro-next"]`, pattern-card spans, and the OSK
iframe's `.kmw-spacebar-caption`.

**Evidence it is pre-existing on `main`** (all verified with `git diff main..HEAD`):

- `carve.spec.ts`, `exemplar-prefill.spec.ts`, `switch-base-rebase.spec.ts`,
  `e2e/helpers/axe.ts` — **byte-identical to main**
- `CarveGallery.tsx`, `RemovalBanner.tsx`, `PhaseB.tsx` — **untouched**
- `packages/studio/src/ui/` (incl. `theme.ts`) — **untouched**
- **zero** `*.css` / `*.scss` changes anywhere on the branch

This is spec 056's open 1.4.3 debt, already documented as pre-existing in
[`evidence/gating-red.md`](evidence/gating-red.md) §"Two corrections made to
reach a *valid* red".

**What to do:** file against spec 056. For 057 to go green it needs the same
call-site scan scoping 057 already applies elsewhere — `exclude` selectors with
the criterion and reason named inline (the mechanism `e2e/helpers/axe.ts`
documents). **Do not** weaken `expectNoSeriousAxeViolations` itself, and do not
add blanket disables — FR-003 forbids both.

---

## 4. Class D — `browser-back` T066. Diagnosed, fix known, small.

**This is a test bug, not an app defect.** `useSurveyBrowserHistorySync.ts`'s
own module docstring says so:

> **3. THE TAB-SWITCH ENTRY ITSELF.** A hash-route change pushes a browser entry
> carrying no `ksStep` of ours (`state === null`), and the listener already
> returns early on that — so popping back across a tab switch is **a no-op by
> construction**. No new rule was needed.

`switchTab` (`e2e/helpers/surveyFlow.ts:532`) clicks a real `nav a[href="#…"]`,
so T066's round trip pushes **two** untagged entries. The test then calls
`goBack()` once and expects the wizard to step back — but that pop lands on the
`#preview` entry, which is a designed no-op, and the URL is no longer on the
survey tab at all.

**Fix** in `e2e/browser-back.spec.ts`, after the existing round trip and before
the first `page.goBack()`:

```ts
// Unwind the two untagged entries the round trip pushed. Both are no-ops in
// the bridge by construction (state === null), so this restores the browser
// pointer to the pre-round-trip entry WITHOUT mutating the store — which is
// exactly the precondition FR-017 wants the native Back sequence run against.
await page.goBack();
await page.goBack();
await expect(page.getByTestId("prefill-confirm")).toBeVisible({ timeout: 20_000 });
```

Leave the three original assertions and the FR-016 browser-Forward-is-a-no-op
assertion untouched. This still proves what SC-014 is about: the store's
`history` survived the round trip, so the wizard's own entries are still on the
stack and `expectedBackTarget` still names them.

**Verify with:** `npx playwright test e2e/browser-back.spec.ts --workers=1`

---

## 5. Class B — `copy-edit` T067. Cause NOT proven. Start here.

T067 inserted into `walkToOutput` (`e2e/copy-edit.spec.ts`, after
`confirmPrefill`, before `completePhaseB`):

```ts
await switchTab(page, "preview");
await switchTab(page, "survey");
```

Five walks then die at `navigateToOutput`, on:

```
locator resolved to <a href="#output" aria-disabled="true"
  title="Finish every inventory character before you can access Output">Output</a>
```

So the walk gets past Phase B but leaves the **inventory/assign loop**
unfinished. #9 (`copy-edit.spec.ts:428`) is likely the same root cause showing
up earlier — `carve-gallery` never appears.

**The decisive experiment, not yet run:** temporarily remove **only** the two
`switchTab` lines and re-run `copy-edit.spec.ts --workers=1`.

- Green ⇒ the insertion is the cause. Then decide whether the app genuinely
  loses Phase B/inventory state across a round trip (a real D-1-adjacent defect
  worth fixing in the app) **or** the helper needs to re-sync after the round
  trip. Note `tab-roundtrip.spec.ts` **passes** and asserts the Phase B alphabet
  survives — so if this is app state loss it is a *different* slice than the one
  US1 covers, and that gap is itself the finding.
- Still red ⇒ the cause predates 057; re-baseline against `main`.

Do not delete the round trip to make it pass. FR-072 requires it.

---

## 6. Class C — `decision-deeplink` US3. Not investigated.

```
locator('[data-testid="decision-entry"]')
  .filter({ hasText: /Authoring approach/i }).first()
Expected: visible — element(s) not found
```

The decision trail renders but carries no "Authoring approach" entry. Unknown
whether the entry is never recorded, recorded under a different label, or the
trail is empty. Relevant code: `src/decisions/DecisionTrailView.tsx`,
`DecisionEntryRow.tsx`, and the decision-record snapshot path in
`draftPersistence.ts`. Unit tests `deepLinkRevision.test.tsx` and
`DecisionEntryRow.test.tsx` pass, so this is an integration-level gap.

---

## 7. Class E — two unexplained, one likely a real 057 regression

**#14 `switch-base-rebase.spec.ts:143`** — spec is byte-identical to `main`, but:

```
Expected value: not "ks.draft.bj_cree_woods.v1"
Received array: ["ks.draft.basic_kbdfr.v1", "ks.draft.bj_cree_woods.v1"]
```

After **Cancel**ling a base switch, a draft key for the *rejected* base exists.
**057 did change the persistence layer** — `src/lib/draftAutosave.ts` (+32/−?)
and `src/lib/draftPersistence.ts` (+39/−?), both rewiring label derivation onto
`lib/projectLabel.ts` (FR-041) and removing the `wasDraftRestoredThisBoot()`
dependency (FR-005, D-1). A stray draft write after Cancel is a plausible
consequence of the D-1 reset removal.

**Treat this as a suspected real regression with user-visible impact
(spurious project entries), not a test issue.** It is arguably the most
important item in this handoff.

**#13 `switch-base-exploration.spec.ts:448` L7-carve-deleted × switch-base
(Cancel)** — `base-confirm` stuck disabled at "Preparing preview…" for 120s.
Spec unchanged from `main`. Sibling matrix cases pass. Possibly related to #14
(both are Cancel paths on a base switch). Undiagnosed.

---

## 8. Suggested order of work

1. **#14 / #13** — the persistence regression. Highest user impact; touches
   shipped code, not tests.
2. **#5 Class B** — run the revert experiment; it also likely resolves #9.
3. **#4 Class D** — known fix, ~10 lines.
4. **#6 Class C** — investigate.
5. **#3 Class A** — file against 056; scope the scans at the call sites.
6. Re-run the full suite `--workers=1`, write `evidence/e2e-green.md`, then
   complete T074 in `evidence/success-criteria.md`.

`--workers=3` is fine and ~14 min faster; the default 8 workers is **not** —
it crashes workers on this Windows box.

---

## 9. Success criteria still open

[`evidence/success-criteria.md`](evidence/success-criteria.md) is drafted for
SC-001…SC-012 and already states honest scope limits. Two remain, and its
"E2E note" section is still an empty placeholder:

- **SC-013** — gating half established in `gating-red.md`; the
  "walk-to-artifact" half **fails** (Class B).
- **SC-014** — **fails** (Class D).

Neither may be marked established until the suite is green.

## 10. Commands

```bash
# dev server (restart clean; kill anything on 5273 first)
pnpm dev

# full suite — from packages/studio
npx playwright test --workers=1 --reporter=list

# one spec
npx playwright test e2e/browser-back.spec.ts --workers=1

# failure artefacts (error + page snapshot per failure)
packages/studio/test-results/<spec-slug>/error-context.md
```

Companion state: `.spec-context.json` has `currentStep: implement`,
`status: implementing`, `nextTask: T073`. Resume with
`/speckit.companion.resume specs/057-bulletproof-navigation`.
