---
description: "Local-model PR triage — enumerate open PRs, run Hermes simplify/quality findings on each PR's changed files, aggregate into a local report. Report-only: never posts comments, labels, or review checks to GitHub."
argument-hint: "[pr-number?]   (omit to sweep all open PRs)"
---

You are running `/hermes-triage` — the **local-model, report-only counterpart to `km-triage`**. The key difference: this command has no write side effects on GitHub whatsoever. It reads PRs, runs the Hermes local-model harness against changed files, and writes a single local triage report. A human reads it and decides what to do.

User request: $ARGUMENTS

If `$ARGUMENTS` is a PR number, triage that one PR and exit. If empty, sweep all open PRs.

---

## Report-only guarantee

This command:
- Reads PR metadata and changed file lists from GitHub via `gh` (read-only calls only).
- Runs `node utilities/hermes/hermes-run.mjs --pr <n>` for each PR to get local-model findings.
- Writes one local triage report to `utilities/hermes/reports/triage-report.md` (gitignored).

It **must NOT**:
- Post PR comments (`gh pr comment` is forbidden).
- Apply or remove labels (`gh pr edit --add-label` / `--remove-label` is forbidden).
- Post the `km-triage/review` commit status or check run (forbidden).
- Approve, request changes, or dismiss any review (forbidden).
- Push commits or create branches (forbidden).
- Call any GitHub write endpoint.

This constraint is unconditional — it applies whether running interactively or headless/cron. It is safe for scheduled/headless use precisely because it has no write side effects.

---

## Prerequisites

Before running:

1. `gh auth status` — confirm GitHub CLI is authenticated (read-only scope is sufficient).
2. `ollama serve` is running locally.
3. Model is pulled: `ollama pull hermes-simplify-14b` (or `hermes-simplify-7b`).
4. Repo deps installed: `pnpm install`.
5. Repo map built: `node utilities/hermes/build-repo-map.mjs` (run once; regenerate after major restructuring).

---

## Phase 1 — Enumerate open PRs (read-only)

Run from the repo root:

```
gh pr list --json number,title,headRefName,author,createdAt,updatedAt
```

This is a read-only call. Parse the JSON array. If `$ARGUMENTS` is a PR number, filter to that one entry. Otherwise process all returned PRs.

---

## Phase 2 — Per-PR Hermes pass

For each PR, run the harness against the PR's changed files:

```
node utilities/hermes/hermes-run.mjs --pr <n> --out utilities/hermes/reports
```

The `--pr <n>` flag scopes the pass to files changed in that PR — files that change together are reviewed together. The harness writes intermediate `findings.json` for the shard(s) it runs.

If Ollama is unreachable or the model is not pulled, log `[ERROR] Ollama unavailable — skipping PR <n>` in the report and continue to the next PR. Do not abort the whole sweep.

Optional: use `--model hermes-simplify-7b` for a faster/cheaper sweep when 14B precision is not required.

---

## Phase 3 — Aggregate into one local triage report

Write `utilities/hermes/reports/triage-report.md` (overwrite on each run). Structure:

```
REPORT ONLY — no findings have been applied; no GitHub writes were made.

# Hermes Triage Report
Generated: <ISO timestamp>
Model: hermes-simplify-14b (or 7b)
PRs swept: <count>

## Summary table

| PR | Title | safe-auto | needs-human | REFUSE hits | Status |
|----|-------|-----------|-------------|-------------|--------|
| #N | ...   | 3         | 1           | 0           | [OK]   |
| ...

## Per-PR findings

### PR #N — <title> (<headRefName>)

Author: <author>   Updated: <date>

<findings grouped by severity, then by file>

safe-auto findings:
  - <file>:<lines> — <summary> [<suggestion>]
  ...

needs-human findings:
  - <file>:<lines> — <summary> [<suggestion>]  (reuse_target: <path:symbol or null>)
  ...

REFUSE hits (needs-human, marked REFUSE):
  - <file>:<lines> — <summary>
  ...

[WARN] shard trimmed: <shard-id> — coverage may be partial.
```

Repeat the per-PR section for every PR swept. Append a final section:

```
## Cross-PR reuse clusters (Phase 4 reconciliation)

<clusters from findings.json reconciliation, ranked by est_loc_saved>
```

---

## Phase 4 — Reconcile and surface the report

After writing the report, read `utilities/hermes/reports/triage-report.md` and surface a brief summary to the user:

1. Total PRs swept, total findings (safe-auto / needs-human split).
2. Any REFUSE-list hits — these require deliberate human judgment.
3. Top cross-PR reuse clusters by estimated LOC saved.
4. Any `[ERROR]` entries (skipped PRs due to Ollama unavailability).

Remind the user: **nothing has been applied; no GitHub actions were taken.** The report is at `utilities/hermes/reports/triage-report.md`. A human reads it and decides what to act on.

---

## Verification sequence (human/agent step, after choosing to apply a finding)

This command does not run verification. If a human or stronger agent chooses to apply a finding from the report, the appropriate gate is:

```
pnpm --filter <pkg> typecheck && pnpm --filter <pkg> test
pnpm depcruise
pnpm lint
```

---

## Relationship to km-triage

| | `km-triage` | `hermes-triage` (this command) |
|---|---|---|
| Model | Claude | Qwen2.5-Coder-14B via Ollama |
| GitHub writes | Yes (labels, comments, check runs) | Never |
| Safe for headless | Yes (with bot token) | Yes (no write side effects) |
| Triage output | Posted to GitHub PR | Local `triage-report.md` only |
| Purpose | Actionable PR gate | Comparative local findings |

These two commands are designed to run side-by-side for comparison: disagreements between the local model and Claude on a finding are worth a human look. This command is deliberately lean — it is not a fork of `km-triage.md` and does not reproduce its bot-auth, reachability checks, or review workflow machinery.
