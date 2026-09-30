# Quickstart / Validation: Generic StepHost — Stage 5

How to prove Stage 5 works end-to-end. Run from repo root.

## Prerequisites

- On branch `km/qu-028-generic-step-host` (forked from `main` with Stage 4 / spec 027 merged).
- `pnpm install` done; `pnpm build` prebuild artifacts present.

## Order of operations (parity-first)

1. **Record the golden-walk fixtures on the pre-refactor tree.** Before touching `StepHost`,
   add the golden-walk harness + fixtures and confirm the test is GREEN against current code.
   Commit this alone (`test(studio): golden-walk parity fixtures for survey traversal (spec 028)`).
   This is the auditable "recorded on main" oracle.
2. **Land the refactor** (advance policy → StepHost → adapters → shell shrink), keeping the
   golden-walk test unmodified. It must stay GREEN (SC-001, zero diff).

## Validation commands

```bash
# Advance-policy unit tests (fork, joinTarget, terminals)
pnpm --filter @keyboard-studio/studio test src/steps/advance.test.ts

# Golden-walk parity (THE gate) — copy + adapt fork, zero diff vs recorded fixtures
pnpm --filter @keyboard-studio/studio test stepHost.goldenWalk

# Per-step render smoke — each step mounts the right component in the right chrome
pnpm --filter @keyboard-studio/studio test stepHost.renderSmoke

# Existing survey/routing suites — only mount plumbing may change
pnpm --filter @keyboard-studio/studio test StudioShell
pnpm --filter @keyboard-studio/studio test trackRouting
pnpm --filter @keyboard-studio/studio test prefillRouting
pnpm --filter @keyboard-studio/studio test CharactersStep

# Whole studio package
pnpm --filter @keyboard-studio/studio test

# Gates
pnpm typecheck
pnpm depcruise      # steps/advance.ts must import no stores/lib/components
```

## Expected outcomes (maps to Success Criteria)

- **SC-001**: `stepHost.goldenWalk` passes with zero diff for both forks.
- **SC-002**: all existing suites pass; no behavioural test deleted/weakened.
- **SC-003**: `stepHost.renderSmoke` shows each manifest step id → correct component + chrome
  (full-screen for carve/mechanisms/touch; two-pane otherwise), no step-specific host code.
- **SC-004**: `StudioShell.tsx` `SurveyView` has no `renderQuestionsPane` switch, no
  full-screen early returns, no per-step `handle*Complete`/`handle*Back` handlers. (grep check.)
- **SC-005**: manifest declares real components for `identity`/`help`; declared == mounted for all.
- **SC-006**: `pnpm typecheck`, studio `test`, `pnpm depcruise` all green; drift guardrail
  unchanged.

## Manual smoke (optional)

```bash
pnpm dev
```

Walk both forks in the browser:
- **Copy**: identity → choose base → track (copy) → project name → characters (prefill→PhaseB)
  → carve (full-screen) → mechanisms (full-screen) → touch (full-screen) → help → Output.
- **Adapt**: identity → choose base → track (adapt) → characters → … → Output (project name
  skipped).
- Back from carve re-enters characters at PhaseB. Back at identity is disabled. Start over
  resets cleanly.
