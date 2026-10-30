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
- for `cases`: `cases.json` (case descriptions only, no zips) by sparse checkout of that one file from
  `km/2302-walk-zips` (`tools/testing-profiles-2302/harness/cases.json`), exposed as `KS_AUTHOR_CASES`. Absent → `[WARN]`, run the PR set only.

## Outputs

- per shard: artifact `headless-report-<tier>-<shard>.json` (retention 90 days);
- a `summarise` job merging shards into `headless-report-<tier>.json` and writing a job summary
  table (by gate, by first failing step, skips by reason).

## Issue filing (`scripts/file-sweep-issues.mjs`)

- Key: `[headless-sweep] <keyboard> <profile> <gate> @ <decision point>`.
- Search open issues labelled `headless-sweep` for the key. Match → comment with the run URL and the
  date. No match → open an issue titled `bug(<area>): <key-derived summary>` with the reproduce command
  (`KS_AUTHOR_CASE=<id> pnpm --filter @keyboard-studio/studio exec vitest run --config vitest.corpus.config.ts src/test/headlessAuthor/authorCase`),
  the failing gate's detail, and the label `headless-sweep`.
- Failures matching spec 106 `KNOWN_GAPS` are summarised, not filed.
- Permissions: `contents: read`, `issues: write`. Uses `GITHUB_TOKEN`.

## Status

The run goes red on any new failure (visible on the Actions tab); nothing gates on it.
