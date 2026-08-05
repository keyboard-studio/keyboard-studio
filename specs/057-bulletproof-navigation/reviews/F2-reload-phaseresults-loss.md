# F2 — a reload at the track step cleared `phaseResults`

**Date:** 2026-08-04
**Found by:** the T073 full-E2E run (the first run in which this test actually executed).
**Status:** ROOT-CAUSED and FIXED. **Not** a spec 057 regression — a pre-existing
defect on `main` that this branch merely stopped concealing.
**Test:** `packages/studio/e2e/switch-base-rebase.spec.ts:227`
— *"F2: refresh at the track step — no popup, phaseResults preserved"*

> **Supersedes `F2-reload-phaseresults-regression.md`.** That file recorded the
> first-pass reading — that this branch *introduced* the loss — on the strength
> of a controlled `packages/studio/src` swap in which main passed and this
> branch failed. The swap result was real; the inference from it was wrong. The
> instrumented runs below show main losing the same data under the same
> conditions. The old file is retained for the audit trail; this one is
> authoritative.

## Two defects were stacked, and they masked each other

Every earlier reading of this failure treated the symptom (`Expected: 2
Received: 1`) as one bug. It is two, and the confusing evidence — *"waiting out
the autosave debounce before reloading makes it worse, `2 → 0` instead of
`2 → 1`"* — is exactly what you get when you fix the first and thereby expose
the second.

### Defect A — the test reloaded before the draft was written

`AUTOSAVE_DEBOUNCE_MS` is ~500 ms (`lib/draftPersistence.ts`). The test walked
the track step and reloaded immediately after, so the only save that had ever
run for the real project key was `installDraftAutosave`'s synchronous
install-time one. Instrumented trace, branch tree, no settle wait:

```
saveDraft {"projectKey":"bj_cree_woods","phaseResults":1,"activeStepId":"track"}
installDraftAutosave bj_cree_woods
schedule<session> changed=selectedTrack   armed=true
schedule<wc>      changed=phaseResults    armed=true
schedule<session> changed=activeStepId    armed=true
BEFORE {"phaseResultsCount":2}
---- RELOAD ----          <- debounce still armed; nothing more was ever written
loadDraft {"phaseResults":1,"selectedTrack":null,"activeStepId":"track"}
```

So the restored draft was the state as of the base confirm — one phase result,
no track choice — while the live store held two. `2 → 1` was a stale-read
artefact, not data loss.

This is the autosave contract behaving as designed. "A refresh preserves the
working copy" is only a meaningful claim about a working copy that has actually
been written, so the fix is in the test: wait out the debounce before reloading,
the same wait `copy-edit.spec.ts`'s T028 already makes for the same reason.

### Defect B — the restoring boot re-ran a COMMIT, and the commit was a switch

With the settle wait added, the draft restores faithfully — and the real defect
fires:

```
loadDraft {"phaseResults":2,"selectedTrack":"adapt","activeStepId":"characters"}
doCommit  {"selectedTrack":"adapt","wcMode":"new-from-base","wcPhaseResults":2}
resolveInstantiationCase {"currentBaseId":"bj_cree_woods","currentMode":"new-from-base",
                          "incomingId":"bj_cree_woods","incomingMode":"adapt-existing"}
AFTER {"phaseResultsCount":0}
```

The chain, every link observed rather than inferred:

1. On a restoring boot `instantiatedForBaseIdRef` was not seeded, so `doCommit`
   fired again once the re-compiled pipeline settled.
2. `doCommit` re-derives the track from
   `useSurveySessionStore.getState().selectedTrack` — but **that value has
   advanced since the original commit**. The base is confirmed at `choose_base`,
   which is *before* the track step exists to answer. At first commit the track
   is `null` → `instantiateFromBase` → mode `new-from-base`. On the reload the
   restored track is `"adapt"` → `instantiateFromExisting` → mode
   `adapt-existing`.
3. `resolveInstantiationCase` (`stores/workingCopyStore.ts`) sees the same base
   id with a *different* mode. That is its documented same-id-track-switch case:
   `isGenuineSwitch = true`, `preservedPhaseResults = []`.
4. The survey is discarded.

Note what else that re-commit does on a path that should be a pure restore:
`setTouchSeedSource(null)` (spec 035 R12 — discards the recorded seed fork),
`pinActiveProject`, and the rebase draft-key migration. None of them belong to
restoring a copy that is already committed.

## Why the earlier "this branch introduced it" conclusion was wrong

The controlled swap was sound in method and its result reproduces. What it did
not control for is that `before.phaseResultsCount` **differs between the two
trees** at the point the test observes it:

| Studio source | `before` | `after` (2 s settle + reload) | Test verdict |
|---|---|---|---|
| `main` | **1** | **0** | passed pre-fix — see below |
| this branch | **2** | **0** | failed |

Main loses the working copy on a settled reload exactly as this branch does —
`0`, from a starting point of `1`. It passed only because, *without* the settle
wait, Defect A restored a stale draft that happened to hold the same count (`1`)
the live store held, so `expect(after).toBe(before)` was `1 === 1`. The
assertion was satisfied by a coincidence between two bugs.

This branch records one more phase result by the time the test looks (`before`
is `2`), which breaks the coincidence and surfaces both defects at once. Spec
057 changed what the test could see, not what the app does.

Supporting evidence that the loss mechanism is main's code, not this branch's:
`git diff main...HEAD` is **empty** for `stores/workingCopyStore.ts`
(`resolveInstantiationCase`), `steps/reducer.ts` and `steps/advance.ts`, and
`StudioShell.tsx`'s `doCommit` gained only the rebase-key migration block.

## The fix

`StudioShell.tsx`, the mount-time autosave effect. It previously returned early
whenever a real project key was already derivable at mount, deferring the
real-project subscription to `doCommit` on the theory that doCommit always
re-fires on such a boot. It does — and that is the bug. The effect now handles
the restoring boot itself:

- **Pre-seed `instantiatedForBaseIdRef`** with the restored base id, so
  `doCommit`'s own guard early-returns. This is what `handleResumeDraft` has
  always done for the résumé path; a refresh and a route remount are the same
  situation and now take the same route. A genuine base switch is unaffected —
  a *different* id still passes the guard (F1).
- **Install the real-project autosave here**, rather than waiting for a
  `doCommit` that no longer runs. This also closes a second gap the trace
  exposed: nothing was persisting between mount and the compile settle.

## Verification

- `e2e/switch-base-rebase.spec.ts` — 3/3 pass, including F2.
- `pnpm typecheck` — green, all 7 packages.
- `pnpm --filter @keyboard-studio/studio test` — 361 files, 5269 tests, green.
- Full serial E2E — see [`../evidence/e2e-green.md`](../evidence/e2e-green.md).

## What this means for SC-002 / SC-003

Both are now met on the reload path, and are established by a probe that
actually exercises it (write → refresh → re-read) rather than by remount-only
unit evidence. The gap those criteria were originally argued across —
"survives a remount" vs "survives a reload" — is what hid this, and closing it
is what FR-081's named full-stack run bought.

One honest scope limit remains, and it is a product contract rather than a
defect: an edit made within `AUTOSAVE_DEBOUNCE_MS` (~500 ms) of a refresh is not
yet on disk and does not survive. That is Defect A, it predates this feature,
and no criterion here claims otherwise.
