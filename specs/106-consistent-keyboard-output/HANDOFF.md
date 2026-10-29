# Handoff: implementing spec 106

For the agent that implements [tasks.md](tasks.md). Planning finished on 2026-10-29. No code for
spec 106 has been written yet.

## Read first

1. [spec.md](spec.md): what must be true, and the rulings in Clarifications.
2. [research.md](research.md): every code location, plus the binding km-keyman ruling **R5**.
   Follow R5 exactly, and quote it in the US3 PR body.
3. [tasks.md](tasks.md): execute it in order. The "Review log" at the end lists the corrections
   an advisor review made. The task text already includes them, so trust it over earlier notes.
4. [contracts/](contracts/): the gate checker and the fixture harness API.

## State

| Thing | Where |
|---|---|
| Phase 0 (S-02 deadkey purpose) | PR #2358, branch `km/s02-deadkey-purpose`. Open; do not merge. |
| This spec | branch `106-consistent-keyboard-output`, stacked on `km/s02-deadkey-purpose`. Rebase if #2358 changes (T001). |
| Walk harness | worktree `../ks-2302-main`, branch `km/2302-walk-zips`, with uncommitted harness edits (see [handoff-s02.md](handoff-s02.md), section 5). |
| Source plan + evidence | [source-plan.md](source-plan.md) (the original plan note, evidence E1-E7). |

## Rules that bite

- The **`Pattern` schema is locked** (Art. I). Variants are new pattern ids, never a new field.
  If a task seems to need a schema edit, stop and ask the user.
- **Fixtures go through `buildOutputBundle()`**. Never call `projectWorkingCopyVfs` with
  hand-built options; that divergence is exactly what T004-T006 fix.
- **No silent defaults** (Art. X). Every default must be visible and changeable, and it applies on
  Continue or Accept, never on render.
- One PR per story phase and one commit per gate, pushed to that story's branch. Never merge,
  never force-push, never push to `main`. Commit titles use `prefix(area): ...`, with no issue
  numbers in code.
- Do not commit `.claude/settings.json` (the user's local allow-list) or
  `tools/testing-profiles-2302/{.playwright-cli,evidence-zips,zips}/` on code branches.
- Never run bare `vitest` at the repo root. Studio tests import the engine `dist`, so run
  `pnpm build` after engine edits.
- `pnpm lint` must stay at 0 errors with warnings at or below 389. Run `pnpm crew-lint` if you
  touch `.claude/**/km-*`.
- Known flaky test: `useKeyboardArtifact.contextTolerance.test.ts` failed 1 run in 3 before this
  work. It is not a regression signal.

## Suggested crew

Use `/km-lead`, one cycle per story phase:

- km-programmer implements;
- km-testing writes the fixture and simulator tests;
- km-keyman reviews every emitted-rule change (US2, US3, US5, US7);
- km-verification runs the gates;
- km-qc reviews before each PR;
- km-archivist commits and opens PRs.
