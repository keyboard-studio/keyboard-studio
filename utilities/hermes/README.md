# Hermes — repo-wide /simplify shard runner

Phases 0–4 of the repo-wide simplify pass described in [PLAN.md](PLAN.md).

## Report-only guarantee

`hermes-run.mjs` (Phase 2 + 4) **never edits source files, never runs git, never calls
gh/GitHub.** It reads code and a local Ollama model, and writes two report artifacts under
`utilities/hermes/reports/`. Both artifacts are gitignored. The word "REPORT ONLY" appears in
the first line of every generated `report.md`.

## Two-step decoding design

Each shard (or sub-batch) is processed in two model calls:

**Step 1 — REASON** (`REASON_MODEL`, default `qwen3:30b-a3b-instruct-2507-q4_K_M`)
Calls the model WITHOUT `format:json`. The prompt encourages high recall: it lists every class of simplification to look for (dead vars, per-call allocations, duplicated blocks, etc.) and tells the model "Finding many is good." The REFUSE list and behavior-preservation constraint are preserved — the suppressive "emit JSON only" framing is removed. Input is capped at ~18 k tokens so that input + verbose reasoning output fit within the 32 k context window (~14 k reserved for Step 1 output). Transient network/connection errors and timeouts are retried up to 3 times with increasing backoff (2 s / 5 s / 10 s). A per-call timeout (`MODEL_TIMEOUT_MS`, 300 s) prevents indefinite stalls on verbose reasoning runs.

**Step 2 — STRUCTURE** (`STRUCTURE_MODEL`, default: same as resolved `REASON_MODEL` — see no-swap note below)
Feeds Step 1's prose into a second call WITH `format:json` to convert it to the findings schema. This step only structures what Step 1 found — it does not add or invent findings. If Step 1 returned effectively nothing (< 20 chars), Step 2 is skipped and 0 findings are recorded. The same `MODEL_TIMEOUT_MS` timeout is applied. SyntaxError (malformed JSON) is retried once.

**Phase 4 reconciliation** stays as a single structured call (STRUCTURE_MODEL with `format:json`).

**No-swap default:** `STRUCTURE_MODEL` defaults to the resolved `REASON_MODEL`. On a single 24 GB GPU the 30B reason model (~20 GB) and a separate 14B structure model (~14 GB) cannot co-reside, causing swap-thrash on every call. With the default, only one model is loaded for the entire run. Pass `--structure-model <name>` to override for split-model setups (e.g. two GPUs, or a smaller reason model that leaves room).

## Prerequisites

- Node >= 20 (global `fetch` required)
- Ollama running locally: `ollama serve`
- Models pulled:
  - `ollama pull qwen3:30b-a3b-instruct-2507-q4_K_M` (reason model — ~20 GB; fits when whisperX is idle)
  - `ollama pull hermes-simplify-14b` (structure model — only needed if you pass `--structure-model hermes-simplify-14b`; not required for the default no-swap run)
- Repo deps installed: `pnpm install` (needed for `build-repo-map.mjs` to invoke `pnpm depcruise`)

## Running the harness

All commands run from the **repo root**.

### Phase 0: build repo map (once, no LLM)

```
node utilities/hermes/build-repo-map.mjs
node utilities/hermes/build-repo-map.mjs --package llm
```

Writes `repo-map.json` (full) or `repo-map.<pkg>.json` (per-package slice). Both are gitignored.

### Phase 2 + 4: shard runner

```
# Dry run on one shard — proves prompt assembly + input token estimate (no model call)
node utilities/hermes/hermes-run.mjs --shard S17 --dry-run

# Run one shard live
node utilities/hermes/hermes-run.mjs --shard S17

# Run first N shards
node utilities/hermes/hermes-run.mjs --limit 5

# Run all 39 shards
node utilities/hermes/hermes-run.mjs

# Override the reason model (Step 1)
node utilities/hermes/hermes-run.mjs --model hermes-simplify-14b

# Override the structure model (Step 2 + Phase 4)
node utilities/hermes/hermes-run.mjs --structure-model hermes-simplify-7b

# Custom output directory
node utilities/hermes/hermes-run.mjs --out /tmp/hermes-out

# All flags (split-model example — omit --structure-model for the no-swap default)
node utilities/hermes/hermes-run.mjs \
  --shard S07 \
  --model qwen3:30b-a3b-instruct-2507-q4_K_M \
  --structure-model hermes-simplify-14b \
  --endpoint http://localhost:11434/api/generate \
  --out utilities/hermes/reports \
  --dry-run
```

### CLI flags (all optional)

| Flag | Default | Description |
|------|---------|-------------|
| `--shard <id>` | (all) | Run a single shard by id (e.g. `S17`) |
| `--limit <n>` | (all) | Run first N shards in manifest order |
| `--model <name>` | `qwen3:30b-a3b-instruct-2507-q4_K_M` | Step 1 REASON model (Ollama tag) |
| `--structure-model <n>` | same as `--model` (no-swap) | Step 2 STRUCTURE + Phase 4 model; override for split-model setups |
| `--endpoint <url>` | `http://localhost:11434/api/generate` | Ollama generate endpoint |
| `--out <dir>` | `utilities/hermes/reports` | Directory for output artifacts |
| `--dry-run` | off | Assemble prompts + print input token estimates; do NOT call the model |

## Output artifacts

Both written to `--out` dir (default `utilities/hermes/reports/`):

- **`findings.json`** — machine-readable: per-shard metadata (shardId, package, model, files,
  tokenEstimate, droppedCount, timestamp, findings array) plus reconciliation clusters from Phase 4.
- **`report.md`** — human-readable: header with "REPORT ONLY" guarantee; per-shard sections
  grouping findings by severity (`safe-auto` vs `needs-human`); ranked reconciliation clusters.

## Shard LOC cross-check

After resolving each shard's file list, the runner sums `wc -l`-equivalent line counts and
compares against the manifest's stated LOC. If the delta exceeds 10%, it logs a `[WARN]` in
the report. A shard resolving to 0 files is a hard `[ERROR]` (the shard is recorded as errored
but the run continues to the next shard).

## Sequencing

Run shards S01 -> S39 (manifest order: contracts -> engine -> keyboard-lint -> llm -> studio ->
api -> oauth-backend). Deps-first means reuse targets in `contracts` are confirmed before
downstream shards reference them.

Phase 3 (apply + verify) is NOT part of this harness — it requires `git` and test gates. See
[PLAN.md](PLAN.md) Phase 3.
