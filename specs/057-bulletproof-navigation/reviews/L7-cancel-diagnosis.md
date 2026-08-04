# switch-base-exploration.spec.ts:448 — L7-carve-deleted x switch-base (Cancel)

## Symptom (evidence/e2e-serial.raw.txt, failure #13)

`previewBase(page, BASE_B, h)` (`packages/studio/e2e/switch-base-exploration.spec.ts:231`)
times out after 120s waiting for `getByTestId("base-confirm")` to become
enabled. The button never reaches "enabled" — it flaps between two disabled
renders, 237 times over the poll window:

- `<button disabled ...>Choose this keyboard</button>` (BasePreviewStatus
  `idle` or `error` — the button's label only branches on `loading`, so these
  two render identically)
- `<button disabled ...>Preparing preview...</button>` (`loading`)

`backToBasePicker` (line 244) already succeeded — the failure is INSIDE
`previewBase`, after the search-and-select for `basic_kbdfr` (`BASE_B`), not
in the walk back to the picker. Sibling matrix cells (L2..L6 x
switch-base(Cancel/OK), L7 x refresh, L7 x refresh(OK), L7 x browser-back) all
pass in the same run. L7 x switch-base(OK) never ran (serial mode, skipped
after this failure). The one variable that changes at L7 and nowhere else in
the matrix: the COMMITTED base (`bj_cree_woods`, `BASE_A`) carries a non-empty
carve deletion (`deletedNodeIds = ["rule#93"]`) at the moment `BASE_B` is
previewed.

## What I ruled out, with evidence

**1. The F4 preview-before-commit gate itself — not the cause, and not
touched by 057.** `useWorkingCopyTransform.ts`'s `previewedBaseId` gate
(`StudioShell.tsx:1063-1066`, `useWorkingCopyTransform.ts:222-229`) exists
specifically to stop a candidate base's compile from being poisoned by the
COMMITTED base's carve/assignment/identity layers when the two bases differ.
`git diff main..HEAD -- packages/studio/src/hooks/useWorkingCopyTransform.ts`
is **empty** — byte-identical to `main`. `useWorkingCopyTransform.test.ts`
already unit-tests this EXACT shape (non-empty `deletedNodeIds` + a mismatched
`previewedBaseId`) at lines 354-367 ("returns null when previewedBaseId
differs from the store's instantiated base") and asserts
`useWorkingCopyStore.getState().deletedNodeIds.size > 0` as a precondition.
The gate correctly returns `null` in this scenario; no cross-base projection
happens.

**2. The "stale baseConfirmed" auto-commit theory — ruled out.**
`BaseResolutionAdapter.onPreview` (`panelAdapters.tsx:187-192`) calls
`setBaseConfirmed(false)` synchronously on every preview click, BEFORE
`setLocalBase`. `StudioShell.tsx`'s single-instantiation effect
(`:1100-1114`, gated on `baseConfirmed`) therefore cannot fire `doCommit` for
a base the author has only previewed, not confirmed — confirmed by
`panelAdapters.test.tsx:201-207`'s call-order assertion. This section of
`StudioShell.tsx` is also unchanged by 057 (see the `git diff` below).

**3. `git diff main..HEAD` for every file in the compile-pipeline chain
touched by this scenario:**

```
useKeyboardArtifact.ts        — 1-line comment fix only (PreviewShell -> OutputScreen)
useWorkingCopyTransform.ts    — no diff at all
```

`StudioShell.tsx`'s diff (152 lines) touches: the route/hash grammar
(`parseLocation`), the nav label ("Preview" -> "Compare"), the mount-time
session-reset removal (D-1), the pane-split/OSK-mode migration to
`viewStateStore`, and mounting `<StudioFooter />`. None of the diff hunks
touch the `localBase` / `previewedBaseId` / `onInstantiate` / `doCommit` /
`baseConfirmed` region (lines ~636-1114) — confirmed by re-reading that whole
block against the diff; every line in it is context, not a `+`/`-`.

**4. D-1 (mount-time reset removal) does not apply here.** `backToBasePicker`
walks back through in-app "Back" affordances (`survey-back`,
`role-back` -> CarveGallery's `<Trans id="editor.carve.backButton">`) — the
whole walk happens within ONE `SurveyView` mount; `choose_base` is a step
inside the survey wizard, not a route change. `SurveyView` never unmounts
during this test, so the mount-time-reset-that-used-to-exist was never
relevant to this code path either before or after its removal.

**5. Playwright serial-mode ordering rules out the "main's E2E is broken at
the helper level" caveat for THIS spec file specifically.** 60 prior tests in
this same `describe.serial` block (L1..L7 x refresh/browser-back, L3..L7 x
refresh(OK), L2..L6 x switch-base(Cancel/OK)) all passed in this run,
including several that preview `BASE_B` via the identical
search-scope-all -> fill -> click-option path used at L7. Serial mode skips
everything after a failure (confirmed: test 62, `L7 x switch-base(OK)`, is
marked skipped, `-`, immediately after 61's failure) — so this file's helpers
are known-good up to and including the L7 setup. Since the app code on this
path is byte-identical to `main`, whatever fails at L7 would fail identically
if this same spec file were run against `main`.

## What I could NOT establish from static reading alone

I traced the full render sequence for the `localBase: A -> B` transition
(the `vfsTransform`-sync effect at `useKeyboardArtifact.ts:327-332` firing
before the base-restart effect at `:675-690` in the same commit, the
`transformVersion` bump-then-reset-to-0 that produces, and the reapply effect
at `:700-748` no-op'ing on `transformVersion === 0`) and found no defect in
it — by this trace, L7 should behave identically to L3-L6. I could not
identify, from the diff or from reading the hooks/stores, a concrete write
path that would flip `artifactStage`/`previewStatus` back and forth for two
full minutes; every state-writing path I found (onPreview, the two
`useKeyboardArtifact` internal effects, `doCommit`) is single-fire and
idempotent as currently written.

I also inspected the one genuinely NEW always-mounted component in this
render tree, `StudioFooter.tsx` (spec 057 US4/US6, mounted unconditionally in
`StudioShell.tsx` now). L7 is the first level in the matrix with a decision
log entry to render (the carve removal), so it is the one component whose
input data differs at L7 vs L2-L6. Its `dots`/`ctx` memos look correctly
deps-scoped and it does not read or write anything in the
`basePreviewStatusStore`/`useKeyboardArtifact` chain — I found no mechanism by
which it could produce the observed flapping, but it is the one piece of
code that is (a) new and (b) exercised differently at L7, so it is the first
thing I would rule out with a live capture rather than by further static
reading.

## Verdict

**Most likely PRE-EXISTING on `main`, not a 057 regression.** Every file in
the actual gating mechanism (`useWorkingCopyTransform.ts`, the
`previewedBaseId`/`baseConfirmed`/`doCommit` region of `StudioShell.tsx`,
`panelAdapters.tsx`'s preview/confirm split) is either byte-identical to
`main` or unit-tested at exactly this scenario's shape. 057's touches near
this code are additive (new `StudioFooter`, new routing grammar, D-1's reset
removal) and none of them intersect a path this test exercises. I cannot
rule out a subtler interaction with `StudioFooter` with confidence, but I have
no positive evidence for it either — it is a hypothesis to eliminate, not a
finding.

I am not implementing a fix: I could not reproduce or pin the exact write
that keeps `artifactStage`/`previewStatus` from settling, and guessing at a
patch here risks touching the locked F4 gate or the compile-pipeline dedup
logic (`instantiatedForBaseIdRef`, `transformVersion`) without evidence.

## What to capture on the next live run (do this before touching code)

Re-run only this one matrix case (dev server already up):

```bash
cd packages/studio
npx playwright test switch-base-exploration -g "L7-carve-deleted . switch-base \(Cancel\)" --workers=1
```

While it runs / from the trace, capture:

1. **`window.__ksE2E__` extension** (temporary, `e2eHook.ts` is flag-gated
   already): add a `getBasePreviewStatus()` reading
   `useBasePreviewStatusStore.getState().status`, and log it plus
   `Date.now()` on every change (a `subscribe()` in the hook's init, not a
   render-path change) to `console.log` with a distinctive prefix. This
   directly answers whether `artifactStage`/`previewStatus` is truly
   oscillating (my working assumption from the button-text evidence) or
   whether it's stuck constant and the flapping is a Playwright-visible
   re-render of the SAME status (e.g. two different components racing to
   paint, or `localBase` itself flapping while status stays constant).
2. **`localBase.id` and `workingCopyStore.baseKeyboard.id` on every change**,
   same subscribe-based logging — confirms or kills the "F4 gate flips back
   and forth because one of its two comparison ids is unstable" line I could
   not close out above.
3. **Any `[error]`/`devLog.error` console output** during the window —
   `runCompile`'s catch block (`useKeyboardArtifact.ts:457-462`) logs nothing
   itself today (it only calls `setStage`), so also temporarily add a
   `devLog.error` there with the caught error's message; if B's compile is
   genuinely erroring and something (not yet located) retries it, this is the
   fastest way to see the real kmcmplib/parse failure text.
4. **A DOM/frame check for a leftover carve dialog**: dump
   `document.querySelectorAll('[role="dialog"], .ks-modal-backdrop')`
   (adjust selector to whatever `RemovalBanner`/the raw-removal confirm
   modal actually uses) right after the `previewed-different-base` state in
   the spec's own `h.dump` — rules out "the click never actually reached the
   search option because a carve-flow overlay is still capturing pointer
   events" cheaply, without needing the above instrumentation.

Once (1)+(2) show whether `previewStatus`/`localBase.id` genuinely cycle, the
next step is a single targeted regression test at whichever layer is
implicated (`useKeyboardArtifact.test.ts` if it's the compile pipeline,
`StudioFooter`-adjacent if it's the footer) rather than a spec-level E2E fix.
