# Success Criteria validation — spec 057

Each criterion is named against the test or run that establishes it. A
criterion with no named evidence is marked **not established** rather than
assumed; a criterion established only in part says so and says which part.

Commands whose output this file rests on:

- `pnpm typecheck` — green (all seven packages)
- `pnpm -r test` — green (8568 tests, 0 failures)
- `pnpm lint` — green (0 eslint errors; depcruise clean over 938 modules;
  `i18n-catalog-lint`, `content-i18n-lint`, the collapse guard and
  `test-antipattern-lint` all `[OK]`)
- `npx playwright test` — **66 passed, 0 failed, 3 skipped**; raw output in
  [`e2e-green.raw.txt`](e2e-green.raw.txt), analysis in
  [`e2e-green.md`](e2e-green.md). **Green** — see the E2E note at the bottom of
  this file for what reaching green required. (Superseded runs:
  [`e2e-postfix.raw.txt`](e2e-postfix.raw.txt), the 65/1/3 run whose one failure
  was `touch-derivation-us2`'s stale testids; [`e2e-t073.raw.txt`](e2e-t073.raw.txt),
  the pre-F2-fix run; [`e2e-full.raw.txt`](e2e-full.raw.txt), the parallel
  attempt that died on worker heap corruption.)
- Red→green gating runs — [`gating-red.md`](gating-red.md)

---

| SC | Verdict | Evidence |
|---|---|---|
| **SC-001** — every ordered tab pair preserves step, history, substage and Phase B alphabet, with no prior durable-storage read required | **established, with a stated scope limit** | `e2e/tab-roundtrip.spec.ts` (red→green on record) drives the walk to a mid-flow step and round-trips through **each of the other four tabs**, asserting the step is still on screen after each. `StudioShell.test.tsx`'s "traversal survives a route round trip" block asserts `activeStepId`, `history`, `charactersSubStage` and the recorded answers across a remount, including three consecutive round trips. The "no prior durable-storage read" half is `wizardEntryPoints.test.tsx`'s Resume case plus the retirement of `resumeProject`'s dependence on `wasDraftRestoredThisBoot()`. **Scope limit:** the E2E covers the four pairs *from* the survey tab, not all 20 ordered pairs; the unit tests cover the mechanism (a remount) that every pair shares. **Correction from the F2 work:** that shared mechanism was *not* sound for the adapt track until the `StudioShell.tsx` mount-time fix landed — a `preview`/`survey` round trip cleared the working copy's `phaseResults` (2 → 0, measured), and this spec passed anyway because its walk keeps the instantiation modes in agreement so the re-commit no-ops. "Position survives" was true; "content survives" was not, on that track. See SC-002. |
| **SC-002** — no authoring content lost by navigation | **established, and now on evidence that actually reaches the failing case** | The unit half stands: `wizardEntryPoints.test.tsx` "a mount-time reset would break every entry point above" compares a five-field traversal snapshot across a remount, and `CompareShell.test.tsx` compares a five-field working-copy snapshot across a full Compare session. The half those tests could not reach is now covered directly. `e2e/switch-base-rebase.spec.ts:227` (F2) writes, refreshes and re-reads, and **passes**. Getting there exposed two real defects — a re-commit on a restoring boot that re-derived the instantiation mode from a `selectedTrack` that had advanced since the original commit, and the same re-commit firing on a route remount, which was discarding the working copy on the adapt track (`phaseResults` 2 → 0 across a `preview`/`survey` round trip, measured directly; 2 → 2 after the fix). Both are fixed in `StudioShell.tsx`'s mount-time seam. See [`../reviews/F2-reload-phaseresults-loss.md`](../reviews/F2-reload-phaseresults-loss.md). **Scope limit:** an edit made within `AUTOSAVE_DEBOUNCE_MS` (~500 ms) of a refresh is not yet on disk and does not survive. That is the autosave contract, it predates this feature, and nothing here claims otherwise. |
| **SC-003** — the durable draft written after a round trip records the same position | **established** | The indirect argument holds for the *reset* defect (D-2): with no `reset()` there is no such write, `StudioShell.test.tsx` asserts the store is unchanged across the remount, and the `draftPersistence`/`draftAutosave` suites stay green. The caveat recorded here from the start — "**no test writes a draft, round-trips, and re-reads it**" — is now closed rather than merely noted: F2 *is* that probe (write, refresh, re-read), it is green, and instrumented traces confirm the restored draft carries the same `phaseResults`, `selectedTrack` and `activeStepId` the live store held. The earlier reading of this criterion as "not established" rested on a failure whose cause was persistence lag plus a mode mismatch, both since root-caused and fixed. |
| **SC-004** — all four wizard entry points land on their stated target | **established** | `wizardEntryPoints.test.tsx` — one describe block per entry point (coverage banner, "Back to studio", Phase F hop, Resume), each asserting the traversal target survives the remount the hash change causes. |
| **SC-005** — an adversarial Compare session leaves the project identical and raises no dialog | **established** | `e2e/compare-isolation.spec.ts`, three tests, red→green on record. The load-bearing one is the **accept branch**: the harness answers "yes" to every dialog and the project is unchanged — because no dialog is raised. `CompareShell.test.tsx` asserts the same structurally (no `onInstantiate` argument, no transform, `instantiateFromBaseIfConfirmed` never called). |
| **SC-006** — no author-facing surface calls this tab "Preview" in any locale; unrelated uses not renamed | **established** | `e2e/locale-switch.spec.ts` asserts the tab reads "Compare" in English and, in `fr`, falls back to the new id's source rather than inheriting the retired id's "Aperçu". `i18n-catalog-lint` `[OK]` confirms `nav.preview` / `preview.heading` / `preview.pane.label` are gone from both catalogs. The unrelated uses (`usePreviewArtifact`, `basePreviewStatusStore`, the Studio tab's live OSK preview, `editor.assignLoop.preview.heading`, the `preview` route token) are deliberately intact. |
| **SC-007** — every reachable trail entry offers a working jump; every unreachable one states why | **established** | `DecisionEntryRow.test.tsx` — reachable renders a real control, `beyond-gate` / `no-project` render the reason text and no dead control. Live in the app via `resolveCtx`, composed from the exported `liveResolveContext()` and passed down by `StudioShell` so a row cannot disagree with the jump it offers. `e2e/decision-deeplink.spec.ts` covers the activation end to end. |
| **SC-008** — a deep-link revision produces exactly one new linked entry and the same staleness as the ordinary walk | **established for the equivalence; the staleness half is weaker than the wording implies** | `deepLinkRevision.test.tsx` drives the *same* edit twice — once by ordinary walk, once by deep link — and asserts both produce one new entry linked to the one it replaces, and identical `staleSteps`. The honest caveat: for **survey-answer** completions the production reducer marks nothing stale today, deep-linked or not, so "the same steps stale" is currently "the same empty set". The test proves equivalence, which is what the criterion is protecting; it does not demonstrate staleness propagation, because there is none at that granularity to demonstrate. |
| **SC-009** — the footer row contains exactly the completed, current and upcoming marks, nothing off-path, stable across revisions and branch resolution | **established at unit level** | `progressDots.test.ts`, 18 tests: revision collapse (one dot per revised question), `PRE_IDENTITY_STEP_ID` exclusion, editor-action exclusion, truncated-record safety, path-scoping (adapt-track hides `project_name`; a track flip reveals it), row growth, tail re-projection, and the jump-back case where dots ahead of the landing point return. `e2e/footer-progress.spec.ts` covers composition against a scripted walk. |
| **SC-010** — the footer is fully keyboard-operable and the accessibility scan reports no new violations | **established, with a stated scope limit** | `StudioFooter.a11y.test.tsx`, 8 tests: every dot a real focusable button, Tab order, named on focus, Enter **and** Space both activate, `aria-current` on the current dot, upcoming dots announce "not yet reached", current-dot activation inert. **Scope limit:** "no new violations on any tab" is the axe half, which lives in E2E; and this feature's axe scans exclude a set of documented **pre-existing** 1.4.3 nodes and skip the dev-only Flow Map entirely (see [`gating-red.md`](gating-red.md)). "No NEW violations" holds; "no violations" was never true on `main`. |
| **SC-011** — restoring view state performs no compile and no validation run | **established** | `viewStateRestoration.test.tsx` wraps `compile` and `validateWithOracle` in call-through spies and asserts **zero calls** in an `afterEach` covering every test in the file — a structural assertion, not an inspection. |
| **SC-012** — a first-time visitor's shared deep link lands on the requested location after the welcome screen | **established** | `StudioShell.test.tsx`'s "a first-time visitor's deep link survives the welcome gate" block: step-scoped and bare-route links are held across the gate, nothing is held for a malformed hash or an absent one, and the held location is honoured on exit **through `jumpToLocation`**, so the ordinary reachability rules apply (a step-scoped link with no project degrades to the tab). |
| **SC-013** — a browser walk that switches tabs mid-flow completes to a downloadable artifact, and both gating specs are on record red and green | **established, including the clean-suite prerequisite** | Red→green for both gating specs is recorded verbatim in [`gating-red.md`](gating-red.md), including which assertion failed in each. The walk-to-artifact half is directly established: every `e2e/copy-edit.spec.ts` walk — the top describe block's three tests and all five `T011` proven-script ZIP walks — **passed** in [`e2e-green.raw.txt`](e2e-green.raw.txt), carrying the mid-walk tab round trip (T067) and ending in a real download. `compare-isolation.spec.ts` and `tab-roundtrip.spec.ts` passed too. FR-081's own prerequisite that the suite be green is now also satisfied: **0 failures**. The last failure (`touch-derivation-us2`) was stale test IDs and vacuous assertions left by upstream commit `8709ff54`, in files byte-identical to `main` — see the E2E note and [`../reviews/us2-stale-assertions.md`](../reviews/us2-stale-assertions.md). |
| **SC-014** — the native Back sequence passes with a tab round trip inserted mid-walk | **established** | `e2e/browser-back.spec.ts` inserts a `#preview` round trip before the two `page.goBack()` steps, so the bridge is exercised against a *preserved* position — the case that was silently inert before the fix. The browser-Forward-is-a-no-op assertion is untouched per FR-016. The spec **passed** in [`e2e-postfix.raw.txt`](e2e-postfix.raw.txt) (it had failed in the pre-fix [`e2e-serial.raw.txt`](e2e-serial.raw.txt) run). |

---

## E2E note

Serial full run, 2026-08-04 (post-F2-fix, post-us2-fix): **66 passed, 0 failed,
3 skipped** — raw output [`e2e-green.raw.txt`](e2e-green.raw.txt), analysis
[`e2e-green.md`](e2e-green.md). Every spec this feature owns
(`tab-roundtrip`, `compare-isolation`, `decision-deeplink`, `footer-progress`,
`browser-back`, `locale-switch`) passed, as did `switch-base-rebase` (all three,
including F2), the 31-case `switch-base-exploration` matrix, and both
`touch-derivation` walks.

### The last failure was stale tests, not broken behaviour

**`touch-derivation-us2.spec.ts`** was recorded in the previous revision as
spec 035's reseed step being broken, "recorded, not investigated". It was not
broken. Playwright's own `error-context.md` page snapshot showed the seed-source
panel fully rendered, on the correct step, with **Reseed from desktop
[pressed]** — the test was waiting on a testid that upstream commit `8709ff54`
(2026-07-29) had made unreachable on that path.

Three further assertions in the same spec were **reporting green without
running**: both tests read `touchJson.phone`, which the same commit's tablet
reseed skeleton left `undefined`, so their layer loops iterated empty arrays;
and one negative assertion checked for copy that appears in no branch of the
component. All fixed, with the compact-row invariant removed rather than
repointed (it is a phone-skeleton property the tablet skeleton genuinely does
not have) in favour of a platform-key-set assertion that is strictly stronger.
Every file involved is byte-identical to `main`. Detail:
[`../reviews/us2-stale-assertions.md`](../reviews/us2-stale-assertions.md).

**Bearing on the criteria above:** none directly — no criterion here has
`touch-derivation-us2` as its subject. Its relevance is to SC-013's clean-suite
prerequisite, which is now met, and as a second instance of the pattern the
F2 investigation surfaced: a green assertion is evidence about what ran, not
about the property it was written to protect.

### What the earlier run's "SC-002 contradicted" reading got wrong

The previous revision of this file recorded F2 as a spec 057 regression and
flipped SC-002 to contradicted / SC-003 to not-established. That reading rested
on a controlled `packages/studio/src` swap in which main passed and this branch
failed. The swap reproduces; the inference from it does not. `before` is not the
same number in the two trees, so the two runs were not comparing what they
appeared to be — main loses the same data under the same conditions, and passed
only because a stale-draft read happened to match. Both criteria are restored
above, now on evidence that reaches the reload path rather than stopping at a
remount. Detail:
[`../reviews/F2-reload-phaseresults-loss.md`](../reviews/F2-reload-phaseresults-loss.md)
(the superseded
[`F2-reload-phaseresults-regression.md`](../reviews/F2-reload-phaseresults-regression.md)
is retained for the audit trail).

### What the exercise was worth

- SC-002/SC-003's supporting unit tests (`StudioShell.test.tsx`,
  `wizardEntryPoints.test.tsx`, `CompareShell.test.tsx`) assert survival across a
  **remount**. None boots through `main.tsx`'s pre-mount `loadDraft` and then
  lets `StudioShell`'s commit seam run. "Survives a remount" and "survives a
  reload" are different claims, and two real defects lived in the gap.
- One of them was **not** reload-only: the same re-commit fired on a route
  remount and was clearing the working copy on the adapt track, which is
  SC-001/SC-002's own subject matter. `tab-roundtrip.spec.ts` passed throughout
  — its walk keeps the instantiation modes in agreement, so the re-commit
  no-ops there. A green gating spec was not sufficient evidence for the property
  it gates.
- That is precisely why FR-081 made a full-stack run a *named prerequisite*
  instead of an assumption. The mechanism worked: the run caught defects the
  unit lane could not see, and the investigation caught a third the failing
  assertion never pointed at.
