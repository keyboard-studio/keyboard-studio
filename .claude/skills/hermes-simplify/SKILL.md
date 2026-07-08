---
name: "hermes-simplify"
description: "Run the local-model (Qwen2.5-Coder-14B, 32k) repo-wide simplify pass via the Hermes shard runner. Report-only: never edits files, never commits, never writes to GitHub."
argument-hint: "[--shard <id>] [--limit N] [--pr <n>] [--commit <sha>] [--since <ref>] [--model hermes-simplify-7b] [--dry-run]"
compatibility: "Requires Ollama running locally with hermes-simplify-14b or hermes-simplify-7b pulled; run from repo root"
metadata:
  author: "keyboard-studio"
  source: "utilities/hermes/PLAN.md"
user-invocable: true
disable-model-invocation: false
---

## What this skill does

`/hermes-simplify` is the **local-model counterpart to the built-in `/simplify` command**. Where `/simplify` runs Claude directly and may apply changes, `/hermes-simplify` drives Qwen2.5-Coder-14B (14B parameters, 32k effective context) via Ollama, collects structured JSON findings, and writes a human-readable report. **It is report-only: it never edits source files, never makes git commits, and never writes to GitHub in any form.** In `--commit`/`--since`/`--pr` scoping modes it makes read-only git and GitHub reads (`git show`/`git diff --name-only`, `gh pr view`/`gh pr diff`) solely to derive which files changed; it never writes. The human decides what — if anything — to act on.

The underlying harness is [utilities/hermes/hermes-run.mjs](../../utilities/hermes/hermes-run.mjs). The architecture (shard plan, repo-map precomputation, JSON finding schema, REFUSE list) is documented in [utilities/hermes/PLAN.md](../../utilities/hermes/PLAN.md).

---

## Report-only guarantee

This skill calls `node utilities/hermes/hermes-run.mjs`. That harness:
- Reads source files and the local Ollama model only.
- Writes two artifacts under `utilities/hermes/reports/` (`findings.json`, `report.md`) — both gitignored.
- Never edits any source file.
- Never performs git or GitHub WRITES (no commits, pushes, PR comments, labels, or review checks). Read-only git reads — `git show` / `git diff --name-only`, `gh pr view` / `gh pr diff` — are used in `--commit` / `--since` / `--pr` scoping mode purely to derive the set of files that changed together; file CONTENT is always read from the current working tree.
- Never calls any remote service other than the local Ollama endpoint (`http://localhost:11434/api/generate`) and, in scoping modes, the read-only GitHub API via `gh`.

The first line of every generated `report.md` reads `REPORT ONLY`.

---

## Prerequisites

Before invoking, ensure:

1. Ollama is running: `ollama serve`
2. Model is pulled: `ollama pull hermes-simplify-14b` (or `hermes-simplify-7b` for the cheaper variant)
3. Repo deps are installed: `pnpm install` (needed for `build-repo-map.mjs` to invoke `pnpm depcruise`)
4. Repo map is built (once, no LLM): `node utilities/hermes/build-repo-map.mjs` from repo root

---

## Invocation modes

All commands are run from the **repo root**.

### Full repo pass (all ~39 shards, deps-first order)

```
node utilities/hermes/hermes-run.mjs
```

Runs shards S01 through S39 in manifest order (contracts -> engine -> keyboard-lint -> llm -> studio -> api -> oauth-backend). Reuse targets in `contracts` are confirmed before downstream shards reference them.

### Single shard

```
node utilities/hermes/hermes-run.mjs --shard S17
```

Useful for iterating on a specific package or subsystem.

### First N shards

```
node utilities/hermes/hermes-run.mjs --limit 5
```

### PR-scoped pass (files changed in a PR review together)

```
node utilities/hermes/hermes-run.mjs --pr 1042
```

Files that change together in a PR are reviewed together. The harness derives the relevant shard(s) from the PR's changed file list.

### Commit-scoped pass

```
node utilities/hermes/hermes-run.mjs --commit a8bf78b
```

### Since-ref pass (all files changed since a ref)

```
node utilities/hermes/hermes-run.mjs --since main
```

### Dry run (prompt assembly + token estimates, no model call)

```
node utilities/hermes/hermes-run.mjs --shard S07 --dry-run
```

Proves prompt assembly and token budget fit without spending inference time. Use this to sanity-check a shard before running it live.

### Cheaper model

```
node utilities/hermes/hermes-run.mjs --model hermes-simplify-7b
```

`hermes-simplify-7b` (Qwen2.5-7B) is faster and cheaper; prefer it for exploratory passes where 14B precision is not needed.

### Full flag reference

| Flag | Default | Description |
|------|---------|-------------|
| `--shard <id>` | (all) | Run one shard by id (e.g. `S17`) |
| `--limit <n>` | (all) | Run first N shards in manifest order |
| `--pr <n>` | — | Scope to files changed in PR number N |
| `--commit <sha>` | — | Scope to files changed in commit SHA |
| `--since <ref>` | — | Scope to files changed since git ref |
| `--model <name>` | `hermes-simplify-14b` | Ollama model tag |
| `--endpoint <url>` | `http://localhost:11434/api/generate` | Ollama generate endpoint |
| `--out <dir>` | `utilities/hermes/reports` | Directory for output artifacts |
| `--dry-run` | off | Assemble prompts + print token estimates; do NOT call the model |

---

## After the run: read and summarize the report

Once the harness completes, read `utilities/hermes/reports/report.md` and summarize for the user:

1. **Counts by severity** — total findings, `safe-auto` count, `needs-human` count, broken down per shard or per package.
2. **Top reuse / cross-link clusters** — the Phase 4 reconciliation section lists duplication clusters ranked by estimated LOC saved; surface the top 3-5 with their proposed shared home.
3. **REFUSE-list hits** — any finding tagged `needs-human` with "REFUSE" in the summary; these require deliberate human judgment before anything is touched.
4. **[WARN] shard trimmed entries** — shards that exceeded the 32k token cap and were split at runtime; flag them so the human knows coverage may be partial.

Make clear in the summary that **nothing has been applied** — the findings are observations only. The human chooses which (if any) to act on, then runs the appropriate verification sequence:

```
pnpm --filter <pkg> typecheck && pnpm --filter <pkg> test
pnpm depcruise
pnpm lint
```

---

## Context and constraints

**32k ceiling:** `options.num_ctx 32768` is the effective limit. Qwen2.5 has no YaRN rope-scaling; the Ollama runner silently clamps the Modelfile's 65536 request to 32768. Per-pass token budget: repo-map slice ~4-5k + rubric/REFUSE ~1k + shard code <=~20k (~1,800-2,000 LOC) = <=~26k assembled prompt, leaving ~6k for JSON output.

**REFUSE list (baked into every prompt — model must never propose edits to):**
- [packages/contracts/src/pattern.ts](../../packages/contracts/src/pattern.ts), `strategy.ts`, `validator.ts`, `lintEngine.ts`
- the 300ms debounce (decision D3)
- the WASM-oracle bridge (`kmcmplib`)
- the VirtualFS (spec §11)
- §7 wiring
- public API renames, signature changes, return-shape changes, exception-type changes, module relocations

**Finding severity:**
- `safe-auto` — mechanical, behavior-preserving, single-file, touches no exported symbol, not on the REFUSE list. Human triage hint: likely safe to apply.
- `needs-human` — anything cross-file, touching a barrel/public/exported symbol, on the REFUSE list, or uncertain. Human triage hint: review before applying.

Both tags are human triage hints only. The harness applies nothing automatically.

**Excluded from all passes** (the harness skips these):
- `packages/engine/src/langtags/generated/index.ts` (generated, 16k LOC)
- `packages/engine/src/simulator/vendor/**` (vendored Keyman, 9.5k LOC)
- `packages/engine/src/recognizer/rules/generated/**` (generated)
- `packages/compiler` (empty)
- `*.test.*` co-located test files

---

## Relationship to built-in `/simplify`

| | `/simplify` (built-in) | `/hermes-simplify` (this skill) |
|---|---|---|
| Model | Claude (main session) | Qwen2.5-Coder-14B via Ollama |
| Context | Full repo via tools | 32k per shard pass |
| Output | May apply changes directly | Report only — never applies |
| Cross-file reasoning | Native | Via precomputed repo map |
| Cost | Claude tokens | Local GPU only |
| Safe for headless/cron | No (may edit) | Yes (report-only) |

The two commands are designed for comparison: run both and diff the findings to see where they agree or diverge. Agreement on a `safe-auto` finding is a stronger signal for a human to act on it.
