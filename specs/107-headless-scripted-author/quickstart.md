# Quickstart: Headless scripted author (spec 107)

How to run each tier and what green looks like. Contracts:
[author-api.md](contracts/author-api.md), [case-and-report.md](contracts/case-and-report.md),
[scheduled-sweep.md](contracts/scheduled-sweep.md).

## Prerequisites

- Node >= 22.19.0, pnpm 9; `pnpm install` then `pnpm build` (prebuild fetches pinned data and needs
  `../keyboards`).
- `../keyboards` points at the keyboard-studio fork's `master`. In a git worktree under
  `.claude/worktrees/<name>`, `../keyboards` resolves to `.claude/worktrees/keyboards`; point it at the
  real corpus (a junction or symlink) or every corpus test skips (locally) or fails (CI).

All commands below run from `packages/studio`.

## 1. One case (US1, SC-001)

```sh
KS_AUTHOR_CASE=p1-whole-bafut-kbdus npx vitest run --config vitest.corpus.config.ts src/test/headlessAuthor/authorCase
```

Expect: `[OK] p1-whole-bafut-kbdus gates=...`, the case runs twice and the determinism assertion
passes; wall time under 60 s from cold.

## 2. Parity (US2, SC-003)

```sh
npx vitest run --config vitest.corpus.config.ts src/test/headlessAuthor/parity
# plus on-demand records (not committed):
KS_PARITY_RECORDS=/path/to/records npx vitest run --config vitest.corpus.config.ts src/test/headlessAuthor/parity
```

Expect: 0 unexplained differences across the 4 committed records; stale allow-list entries listed.

## 3. PR lane (what CI runs on every PR, SC-002)

The same two steps the parallel `headless-author` job runs (`timeout-minutes` set by T051, at most 5):

```sh
# 1. corpus config: the PR set and parity
npx vitest run --config vitest.corpus.config.ts src/test/headlessAuthor/prSet src/test/headlessAuthor/parity
# 2. default config: the drift guard and the boundary test
npx vitest run src/test/headlessAuthor/driftGuard src/test/headlessAuthor/boundary
```

Local figures (T071): step 1 takes 55-60 s; step 2 takes 32-35 s. Expect: 6 PR-set cases report every gate (expected failures named with their owner); wall time (including
vitest's module load, about 25 s) well inside the job's cap. SC-005 check: revert `sameGroupName` in
`packages/engine/src/codec/groupName.ts` locally, rebuild the engine, rerun; the `bj_cree_woods`
case fails with a duplicate-group compile error.

## 4. The 32 harness cases (US3, SC-008; on demand)

The cases come from the committed canonical file
`src/test/headlessAuthor/cases/harness-cases.json` (FR-035); nothing is fetched from another branch.

```sh
KS_AUTHOR_HARNESS=1 npx vitest run --config vitest.corpus.config.ts src/test/headlessAuthor/harnessCases
```

Expect: 32 lines, each with gates, placeholder count and displacement actions; under 10 min.

## 5. Wide sweep (US4; scheduled, or on demand)

```sh
KS_AUTHOR_SWEEP=latin KS_AUTHOR_SHARD=1/4 npx vitest run --config vitest.corpus.config.ts src/test/headlessAuthor/sweep
```

Or dispatch the `Headless sweep` workflow with `tier=latin`. Expect a summary grouped by gate and first
failing step; skips grouped by reason (a keyboard over 2,000 rules is `too-large`). In CI, new failures
are filed as `headless-sweep` issues.

Two variables help when a case hangs:

- `KS_AUTHOR_CASE_TIMEOUT_MS`: the per-case timeout (the default is 180 s).
- `KS_AUTHOR_TRACE=1`: prints `[TRACE] <case> step <id> start|end <ms>` on stderr. A `start` with no
  `end` names the hung step.

A shard that is killed still reports its case as `hung`.

## 6. Lifted rules (US5, SC-006)

```sh
npx vitest run src/editors/carve src/editors/assignLoop src/survey src/lib src/editors/adapters
npx playwright test e2e/golden-walk.spec.ts   # verify mode; no re-baseline
```

Expect: the components' existing tests pass unchanged and the golden walk needs no re-capture.
