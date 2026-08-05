# P0 — spec 057 regression: a reload at the track step clears `phaseResults`

> **SUPERSEDED — this file's central conclusion is wrong.** Instrumented runs
> against both trees showed `main` losing the same data under the same
> conditions: the loss is a pre-existing defect this branch stopped concealing,
> not one it introduced. The controlled swap recorded below reproduces, but the
> inference drawn from it does not hold — `before.phaseResultsCount` differs
> between the two trees, so the two runs were not comparing what they appeared
> to be. Read
> [`F2-reload-phaseresults-loss.md`](F2-reload-phaseresults-loss.md) instead;
> it carries the root cause, the two stacked defects, the fix and its
> verification. Retained unedited below for the audit trail.

**Date:** 2026-08-04
**Found by:** the T073 full-E2E run (the first run in which this test actually executed).
**Status:** OPEN. Reproduced deterministically; **root cause narrowed, not fixed.**
**Failing test:** `packages/studio/e2e/switch-base-rebase.spec.ts:227`
— *"F2: refresh at the track step — no popup, phaseResults preserved"*

## Why this is a spec 057 blocker and not someone else's bug

The test is **main's**, not this branch's:

- `switch-base-rebase.spec.ts` is unmodified by this branch
  (`git diff --stat main...HEAD -- packages/studio/e2e/switch-base-rebase.spec.ts`
  is empty).
- Its originating commit `94746a45` is **on `main`** (`git branch --contains`).

But the code path it exercises — `StudioShell`'s commit seam — **is** changed by
this branch (241 changed lines in `StudioShell.tsx`).

### The controlled experiment

Only `packages/studio/src` was swapped; the E2E spec and helpers were held
constant across both runs, so the sole variable is application code.

| Application code under test | Result |
|---|---|
| `git checkout main -- packages/studio/src` | **1 passed** (27.3s) |
| this branch's `packages/studio/src` | **1 failed** (`Expected: 2  Received: 1`) |

The branch tree was then restored (`git checkout HEAD -- packages/studio/src`,
uncommitted `serializeWorkingCopy.ts` patch re-applied) and the three
`PreviewScreen`/`PreviewShell*` files main carries — deleted on this branch by
the Preview→Compare rename — were removed again, so the experiment left no
residue.

**Conclusion: this branch introduced the regression.** It is not pre-existing
debt, and it is not E2E driver drift (the Class B class of failure that
accounted for the other 14 failures in the first run).

## What actually happens

`hookState` reads `useWorkingCopyStore.getState().phaseResults.length` through
the `__ksE2E__` hook. At the track step, before the reload, it is `2`. After
`page.reload()` it is `1`.

A second observation makes the "it's just a persistence race" reading
untenable. Waiting out the ~500 ms autosave debounce
(`AUTOSAVE_DEBOUNCE_MS`, `lib/draftPersistence.ts`) **before** reloading — the
same wait `copy-edit.spec.ts`'s T028 makes for exactly this reason — does not
fix it and makes it strictly worse:

| Pre-reload wait | `phaseResultsCount` after reload |
|---|---|
| none (the test as written) | `1` |
| `waitForTimeout(1_500)` | **`0`** |

Persisting *more* state before the reload leaves *less* of it afterwards. That
is the signature of something clearing the store after restore, not of a write
that never landed. That speculative test edit was **reverted**; the spec is
untouched.

## Where it comes from — narrowed, not proven

On a plain reload of an L3+ draft, `main.tsx`'s `loadDraft` restores the stores
pre-mount, and then:

- `instantiatedForBaseIdRef` (`StudioShell.tsx:670`) is **not** pre-seeded.
  Only `handleResumeDraft` pre-seeds it (`:1236`, `:1252`) — a *résumé click*,
  which a browser refresh is not. The mount-time autosave effect (`:726-733`)
  early-returns on a derivable project key but seeds nothing.
- So `doCommit` (`:911`) does fire on a reload, and dispatches
  `applyStepCompletion("choose_base", …)` → `instantiateFromBase…`.

`doCommit`'s own header comment states this branch's restructuring plainly: it
"is now invoked from the single-instantiation effect below (gated on
`baseConfirmed`) rather than directly from the compile-pipeline callback"
(`:896-898`). That relocation is the seam that changed, and it is the prime
suspect: it alters *when* — and against what settled state — `doCommit` runs on
a restoring boot.

The F2 test's own comment asserts the invariant that is now violated:

> …because the restored working copy's base id always matches the artifact the
> re-compiled pipeline settles for — `instantiateFromBase`'s own
> same-id/same-mode no-op (`resolveInstantiationCase`) preserves `phaseResults`
> regardless.

Getting `0` is what `resolveInstantiationCase` does on a **genuine switch**
(`isGenuineSwitch` → `preservedPhaseResults = []`, `workingCopyStore.ts:717`).
So the reload is being classified as a genuine switch rather than a no-op. The
fixture drives the **adapt** track, so a base-id/`instantiationMode` mismatch
between the restored copy and what `doCommit` re-commits is the specific
hypothesis to test next. **This was not confirmed against source** — flagged
rather than guessed, because the fix depends on which half mismatches.

Note the draft-key deletion at `:1002-1003` is *not* implicated: it is guarded
by `rebasedFromProjectKey !== projectKeyAfterCommit`, and a refresh re-commit
derives the same key.

## Why it matters for this feature's own claims

This is authoring state lost across a plain browser refresh, which is what
spec 057 exists to prevent:

- **SC-002** — "no authoring content lost by navigation". `phaseResults` is
  authoring content; a refresh drops it.
- **SC-003** — "the durable draft written after a round trip records the same
  position". The 1.5 s-wait variant shows the draft can hold two results and
  the post-restore store still ends at zero.

Both are recorded in [`../evidence/success-criteria.md`](../evidence/success-criteria.md)
as established on unit-level evidence (`StudioShell.test.tsx`,
`wizardEntryPoints.test.tsx`, `CompareShell.test.tsx`). Those unit tests
assert survival across a **remount**; none of them boots through
`main.tsx`'s pre-mount `loadDraft` and then lets the commit seam run. The gap
between "survives a remount" and "survives a reload" is exactly where this
regression lives — which is why a full-stack E2E run was made a named
prerequisite (FR-081) instead of an assumption.

## Recommended next step

Instrument `resolveInstantiationCase` (or log `baseKeyboard.id` +
`instantiationMode` on both sides of the reload) to establish which half of the
same-id/same-mode comparison fails on a restoring boot, then decide between
pre-seeding `instantiatedForBaseIdRef` on a restored draft (making a refresh
match the résumé path it already resembles) and correcting the mode the
re-commit passes. Do not close spec 057 on the strength of the unit-level
SC-002/SC-003 evidence until this is resolved.
