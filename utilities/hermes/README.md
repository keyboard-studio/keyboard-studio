# Hermes — repo-wide /simplify shard runner

Phases 0–4 of the repo-wide simplify pass described in [PLAN.md](PLAN.md).

## Report-only guarantee

`hermes-run.mjs` (Phase 2 + 4) **never edits source files, never runs git, never calls
gh/GitHub.** It reads code and a local Ollama model, and writes two report artifacts under
`utilities/hermes/reports/`. Both artifacts are gitignored. The word "REPORT ONLY" appears in
the first line of every generated `report.md`.

## Three-lens multi-pass design

Instead of a single "find every simplification" prompt, each shard (or sub-batch) runs
**three focused reasoning passes** — one per lens — then merges the results by location with
cross-lens convergence scoring. These are Claude's official `/simplify` reviewer lenses,
adapted for whole-file review (not diff-scoped).

### Why three lenses?

A monolithic "find everything" prompt both under-generates (the model loses focus across
too many categories) and over-generates mush (weak findings padded out). Diverse specialised
passes improve recall because each lens only hunts its narrow class. Agreement **across**
lenses is a genuine confidence signal — unlike repeating the same prompt, which is trivially
deterministic. Local compute is the cheap resource, so spending ~3 passes per shard is the
intended trade-off.

### The three lenses

| Lens | Hunts | types emitted |
|------|-------|---------------|
| **reuse** | Code that re-implements something already in the codebase; uses adjacent-exports injection (hook A) to name existing helpers | `reuse`, `crosslink` |
| **simplification** | Unnecessary complexity: redundant/derivable state, copy-paste variation, deep nesting, defensive branches, dead code (verified by caller-grep, hook B) | `quality`, `altitude` |
| **efficiency** | Wasted work: per-call allocations (RegExp/Set/array rebuilt every call), hoistable computation, repeated scans, string re-parsing | `efficiency` |

Each lens shares the same precision guardrail ("behavior-preserving only") and REFUSE list.

### Harness verification hooks

Two deterministic hooks run before/after the model calls per shard:

**Hook A — Adjacent exports (REUSE lens only).** Before calling the reuse lens, the harness
computes the exported symbols of modules adjacent to the shard's files (same package, from
the repo-map `exportInventory`), and injects them as an `ADJACENT EXPORTS` block into the
prompt. This gives the model a concrete list of existing helpers to reference, approximating
the official prompt's "grep adjacent files for existing helpers." Capped at 120 entries.

**Hook B — Caller-grep (SIMPLIFICATION lens only).** The harness runs a pre-pass that greps
the repo (`packages/`, `utilities/`, `api/`) for external callers of every top-level symbol
in the shard's files. Symbols with no references outside their own file become the
`CONFIRMED-UNUSED` list, which is injected into the simplification lens prompt. After
structuring, a post-filter drops any finding whose text claims a symbol is dead/unused but
that symbol is NOT in the confirmed-unused set, logging `[verify] dropped unverified
dead-code claim: <symbol> (still has callers)`. Uses `rg` if available, else `grep -r`;
skips gracefully with `[WARN]` if neither is installed.

### Cross-lens convergence

After all three lenses run, findings are **merged by location**: two findings converge if they
are in the same file AND their line ranges overlap or are within 3 lines. Merged findings carry:
- `lenses`: the set of distinct lenses that flagged the location
- `convergence`: count of distinct lenses (1–3)
- `confidence_pre_boost`: original confidence from the best single-lens finding
- `confidence`: boosted confidence (+0.15 per extra lens, capped at 1.0)

A finding flagged by 2+ lenses is a strong signal — the boost feeds directly into the
ACT/REVIEW/NOISE bucketing threshold, so converging findings are more likely to survive
to the escalation set. The report shows the convergence distribution (1-lens / 2-lens / 3-lens)
for each shard and globally.

### Step 2 — STRUCTURE

Each per-lens prose output is fed into a second call WITH `format:json` to convert it to the
findings schema. This step only structures what the lens found — it does not add or invent
findings. If a lens Step 1 returned effectively nothing (< 20 chars), Step 2 is skipped for
that lens.

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
| `--self-test` | off | Run the deterministic hook-B post-filter test and exit (no model, no shard) |
| `--samples <n>` | `1` | Self-consistency sample count: run the reason→structure step N times per file/shard, union the findings, and boost confidence by agreement. Default 1 = current single-pass behaviour. Prompt + repo-map assembly happens **once**; only model calls repeat. |

### Multi-sample self-consistency (`--samples N`)

The free-form reason step (Step 1) is high-variance: the same file can produce 4, 3, or 1
findings across three independent runs, and may miss the single real gold finding on a bad draw.
Running N samples and unioning recovers those misses and provides a **self-consistency confidence
signal**.

- **Prompt assembly is ONCE.** The repo-map slice, adjacent-exports block (hook A), and
  confirmed-unused block (hook B) are all computed once per file/shard. Only the `callModelReason`
  + `callModelStructure` pair repeats N times. This keeps the cost proportional to N model calls,
  not N full setup passes.
- **Union by location.** Findings from all N samples are merged using the same union-find as lens
  convergence: two findings converge if same file AND line ranges overlap or are within 5 lines.
- **`samples_hit`** records how many of the N samples produced each merged finding.
- **Confidence boost:** `confidence = min(1.0, base + 0.1 * (samples_hit - 1))`. A finding in
  4/5 samples is more trustworthy than 1/5. `confidence_pre_sample_boost` records the pre-boost
  value for auditability.
- **Composition with lens convergence:** In lenses mode, each lens is sampled N times and its
  sample-union output feeds into the existing lens-convergence merge. The two boosts are applied
  sequentially (sample boost first, then lens boost), both capped at 1.0. They are independent
  signals — sample agreement within a lens, cross-lens agreement across lenses — so composing
  them is sound. The cap prevents double-counting from inflating past 1.0.
- **Log line per file:** `[samples] <shard>[<lens>]: N runs -> <count> merged (samples_hit dist: 1x=.. 2x=.. ..)`

The `vet.mjs` scorecard uses `SAMPLES=5` (a constant near the top, easily tuned) for all
Scorecard A per-file runs.

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
