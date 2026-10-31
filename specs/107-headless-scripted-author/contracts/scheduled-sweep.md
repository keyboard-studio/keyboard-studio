# Contract: scheduled sweep workflow (FR-034, SC-009)

File: `.github/workflows/headless-sweep.yml`. Never triggered by `pull_request`; never a required
check.

## Triggers

| Trigger | Tier |
|---|---|
| `schedule: '23 5 * * *'` (nightly) | `cases`: the 32 harness cases + the PR set x all 8 profile variants |
| `schedule: '41 3 * * 0'` (weekly, Sunday) | `latin`: the Latin codec-clean slice, 4 shards |
| `workflow_dispatch` (inputs `tier`: `cases` \| `latin` \| `eligible`; `shards`: 1-8) | as chosen |

## Inputs it needs

- the pinned corpus (same checkout step and pin as `ci.yml`);
- for `cases`: the committed canonical case file
  `packages/studio/src/test/headlessAuthor/cases/harness-cases.json` (FR-035), from the checkout.

## Outputs

- per shard: artifact `headless-report-<tier>-<shard>.json` (retention 90 days);
- a `summarise` job merging shards into `headless-report-<tier>.json` and writing a job summary
  table (by gate, by first failing step, skips by reason).

## Hangs

A case can loop synchronously, which no vitest timeout interrupts. So the sweep rewrites
`headless-report-<tier>-<shard>.json` before every case (that case as `status: "in-progress"`,
`gate: "hung"`, `decisionPoint` the step it last reached) and after it. A shard killed by the job
timeout leaves that file; the `Sweep` step has its own `timeout-minutes` (105) below the job's 120 so
the upload and the `summarise` job still run. The merge turns an `in-progress` entry into a `failed`
one with gate `hung`, keyed `[headless-sweep] <keyboard> <profile> hung @ <step>`; the issue body adds
the `KS_AUTHOR_TRACE=1` hint (per-step `[TRACE] <case> step <id> start|end <ms>` on stderr; a `start`
with no `end` names the hung step). A test that times out (an interruptible hang) is the same failure.

## Issue filing (`scripts/file-sweep-issues.mjs`)

- Before filing, `summarise` creates the `headless-sweep` label (`gh label create --force`,
  idempotent): `gh issue create --label` rejects a label the repository does not have.
- Key: `[headless-sweep] <keyboard> <profile> <gate> @ <decision point>`.
- Search open issues labelled `headless-sweep` for the key. Match → comment with the run URL and the
  date. No match → open an issue titled `bug(<area>): <key-derived summary>` with the reproduce command
  (`KS_AUTHOR_CASE=<id> pnpm --filter @keyboard-studio/studio exec vitest run --config vitest.corpus.config.ts src/test/headlessAuthor/authorCase`),
  the failing gate's detail, and the label `headless-sweep`.
- Failures matching spec 106 `KNOWN_GAPS` are summarised, not filed.
- Permissions: `contents: read`, `issues: write`. Uses `GITHUB_TOKEN`.

## Status

The run goes red on any new failure (visible on the Actions tab); nothing gates on it.
