# Quickstart — validating surveySessionStore (Stage 3)

How to prove the refactor is correct. All commands run from the repo root.

## Prerequisites

- `pnpm install` done; on branch `km/qu-026-survey-session-store`.
- Baseline of **pre-existing** failures to ignore (NOT introduced by this work): exactly 4 —
  3× `src/lib/projectWorkingCopyVfs.flagParity.test.ts` (CRLF golden) + 1×
  `tests/dashboard/articleIVProbe.test.ts` (async-word scan).

## Gate commands (all must be green)

```bash
pnpm --filter @keyboard-studio/studio typecheck
pnpm --filter @keyboard-studio/studio test
pnpm depcruise
```

## The parity proof (the load-bearing check)

These three tests MUST pass **without any modification to their source**:

```bash
pnpm --filter @keyboard-studio/studio test src/StudioShell.test.tsx
pnpm --filter @keyboard-studio/studio test src/dashboard/trackRouting.test.ts
pnpm --filter @keyboard-studio/studio test src/dashboard/prefillRouting.test.ts
```

If any of these needed an edit to pass, the refactor changed behavior → **fail the stage**.
(Trivial exceptions like an import path only if a shared type physically moved — but the
plan keeps `ActiveStepId` exported from the store and `StudioShell` re-imports it, so these
tests should not even need that.)

## New store test

```bash
pnpm --filter @keyboard-studio/studio test src/stores/surveySessionStore.test.ts
```

Must cover (spec SC-001):

1. **Copy-track back-walk** — `advance` through `identity→choose_base→track→project_name→
   characters`, then `popHistory()` lands on `project_name`.
2. **Adapt-track back-walk** — `advance` through `identity→choose_base→track→characters`
   (no project_name), then `popHistory()` lands on `track`.
3. **Start-over** — after several `advance` calls, `reset()` returns every slot to initial
   (activeStepId `"identity"`, empty `history`, all value slots `null`/`{}`).
4. **Double-advance idempotence** — `advance(x)` twice does not corrupt the stack;
   `popHistory` still returns to the prior distinct step (research D-R4).
5. **Empty-history back is a no-op** — `popHistory()` on a fresh store leaves
   `activeStepId === "identity"`.

## Manual smoke (optional)

`pnpm dev`, run a copy-track and an adapt-track walk, use Back at each step, and Start Over.
Behavior must be indistinguishable from `main`.

## Definition of done

- [ ] Three parity oracles green, unmodified.
- [ ] New store test green, covering the five cases above.
- [ ] `typecheck`, studio `test` (only the 4 baseline failures), `depcruise` green.
- [ ] `selectedTrackRef` and its sync effect deleted from `StudioShell.tsx`.
- [ ] `handleStartOver` delegates to `session.reset()` then resets `instantiatedRef`.
