# Hermes — repo-wide /simplify shard runner

## 1. Overview

Hermes is a **report-only** local-model tool for running a repo-wide `/simplify` pass (and PR/commit-scoped triage) over the keyboard-studio TypeScript monorepo. It produces structured findings for human or Claude review; it never applies any change.

**Hard guarantees:**

- `hermes-run.mjs` never edits source files, never commits, never calls `gh pr comment / gh pr edit / gh pr review / gh label / git commit / git push`.
- The only read-only git/gh operations allowed are file-name derivation for scoping modes (`gh pr view/diff`, `git show`, `git diff`). File content is always read from the current working tree, not from git history.
- Inference goes direct to Ollama at `POST http://localhost:11434/api/generate`. The NousResearch hermes-agent (Docker) handles orchestration only (cron/gateway); it does not see or relay source code.
- Every generated `report.md` begins with the phrase "REPORT ONLY".

The vetting harness ([vet.mjs](vet.mjs)) runs `hermes-run.mjs` as a subprocess; it also never edits source files or commits.

---

## 2. Serving / models

**Endpoint:** `POST http://localhost:11434/api/generate`

| Model | Role | Base | Temperature |
|---|---|---|---|
| `qwen3:30b-a3b-instruct-2507-q4_K_M` | Default REASON model (Step 1) | Qwen3 30B MoE | 0.3 |
| `hermes-simplify-14b` | Optional STRUCTURE/judge override | `FROM qwen2.5-coder:14b` | 0.1 |
| `hermes-simplify-7b` | Light/cheap option | `FROM qwen2.5:7b` | 0.1 |

The default reason model is a **mixture-of-experts** (MoE) with approximately 3B parameters active per token. In practice it runs at roughly 248 tok/s on this machine — faster than the dense 14B (~89 tok/s) and even the 7B (~160 tok/s). Do not downsize to the 14B or 7B for speed; the 30B MoE is already the fast option.

**Real context ceiling is 32k (32768 tokens).** The Modelfiles request `num_ctx 65536`, but Qwen2.5 has no YaRN rope-scaling (native trained context is 32768 tokens). The Ollama runner silently clamps `options.num_ctx` to 32768. A true 64k context would require a YaRN re-quant of the base weights and would not fit on the 24 GB GPU alongside other tenants. Plan accordingly.

**No-swap default.** `STRUCTURE_MODEL` defaults to the resolved `REASON_MODEL`. The 30B reason model (~20 GB) and a separate 14B structure model (~14 GB) cannot co-reside on a 24 GB GPU, causing swap-thrash on every inter-step transition. With the default, only one model loads for the entire run. Pass `--structure-model <name>` to override for split-model setups (two GPUs, or a smaller reason model that leaves room).

**Prerequisites:**

- Node >= 20 (global `fetch` required)
- `ollama serve` running locally
- `ollama pull qwen3:30b-a3b-instruct-2507-q4_K_M` (reason model, ~20 GB; fits when whisperX is idle)
- `pnpm install` at repo root (needed by `build-repo-map.mjs`, which calls `pnpm depcruise`)

---

## 3. Pipeline / process

The pipeline is per-file (or per-shard). Each file's prompt, repo-map slice, and hooks are assembled once; only model calls repeat per sample.

### (a) Per-file review, not per-shard-batch

The vetting harness (`vet.mjs`) runs `--file <path>` for each file individually (fan-out). Grouping multiple files into a single model pass dilutes findings approximately 3x. The gold set went from 12 findings (whole-set) to 30 (per-file) after this change.

### (b) Two-step decoding

One-shot constrained-JSON decoding with `format:json` plus a strict rubric produced near-zero recall (0 findings on most shards). Two-step decoding recovers it:

**Step 1 — REASON:** call `REASON_MODEL` without `format:json`. Ask for free-form findings prose. No format suppression. The input is capped at ~14k tokens (TOKEN_BUDGET), leaving ~18k for verbose reasoning output within the 32k window. Transient network failures and timeouts are retried up to 3 times with backoff (2s / 5s / 10s). If Step 1 returns fewer than 20 characters, Step 2 is skipped and 0 findings are recorded.

**Step 2 — STRUCTURE:** feed Step 1 prose into `STRUCTURE_MODEL` with `format:json` to convert to the findings schema. Purely mechanical — does not add or invent findings. Retried once on JSON parse failure.

**Phase 4 reconciliation** (cross-file reuse/crosslink clustering) stays as a single structured call on `STRUCTURE_MODEL`.

### (c) --samples N: multi-sample self-consistency

The free-form reason step is high-variance: the same file can produce 0, 5, or 19 findings across independent runs. A gold finding was hit in 2/3 single runs but 4/5 with `--samples 5`.

With `--samples N`, the reason→structure pair runs N times per file/shard. Prompt and repo-map assembly happens **once**; only the model calls repeat.

Findings from all N samples are merged by location (union-find: same file + line ranges overlap or within `SAMPLE_LINE_GAP` = 5 lines). Each merged finding records:

- `samples_hit`: how many of the N samples produced it
- `confidence_pre_sample_boost`: confidence before the sample boost
- `confidence`: `min(1.0, base + SAMPLE_BOOST_PER_HIT * (samples_hit - 1))`

where `SAMPLE_BOOST_PER_HIT = 0.1`. A finding in 4/5 samples gets a +0.3 boost.

### (d) Hooks: adjacent-exports (reuse) and caller-grep dead-code filter

Two deterministic hooks run before the model calls per shard:

**Hook A — Adjacent exports (REUSE lens only).** Computes exported symbols from modules adjacent to the shard's files (same package, from repo-map `exportInventory`), capped at 120 entries. Injected as an `ADJACENT EXPORTS` block into the reuse lens prompt, giving the model a concrete list of existing helpers rather than requiring hallucination.

**Hook B — Caller-grep (SIMPLIFICATION lens only).** Pre-pass: greps `packages/`, `utilities/`, `api/` for external callers of every top-level symbol in the shard's files (using `rg` if available, else `grep -r`; skips gracefully with `[WARN]` if neither is installed). Symbols with no external references become the `CONFIRMED-UNUSED` list, injected into the simplification lens prompt. Post-filter: after structuring, drops any finding whose text claims a symbol is dead/unused but that symbol is NOT in the confirmed-unused set, logging `[verify] dropped unverified dead-code claim: <symbol> (still has callers)`.

### (e) JUDGE pass (default-on, K=1)

Each finding receives one extra model call on `STRUCTURE_MODEL` at `temperature=0.2` with `format:json`. The judge returns `{"verdict":"real"|"not-real"|"uncertain", "judge_confidence":0..1, "judge_danger":"low"|"med"|"high", "note":"<one line>"}`. Only `"real"` verdicts survive into the ACT bucket and escalation set.

The judge is effectively deterministic under an identical prompt (18/18 unanimous across 9 votes in the benchmark). K=1 is therefore sufficient; self-consistency must come from diverse prompts, lenses, models, or samples — not from repeating the same judge call.

Skip with `--no-judge` (fast, unfiltered).

### (f) Scoring: confidence / impact / danger + deterministic danger override

Each finding carries three self-rated scores from the STRUCTURE step:

- `confidence` (0..1): model's estimate that the finding is real and behavior-preserving
- `impact`: `trivial | minor | moderate | significant`
- `modelDanger`: `low | med | high`

A **deterministic heuristic** then sets `danger = max(modelDanger, heuristicDanger)`:

- HIGH: text matches `DANGER_HIGH_RE` (export, public API, signature, return type, rename, relocate, throw, exception, async, await), OR type is cross-file (reuse/crosslink/altitude), OR file is a barrel (`index.ts`/`index.tsx`)
- LOW: text matches `DANGER_LOW_RE` (dead, unused, redundant, hoist, inline, one-use, whitespace, comment, duplicate literal, constant) AND type is quality or efficiency AND not a barrel
- else MED

Both `modelDanger` and `heuristicDanger` are preserved in the output for auditability.

In lenses mode, an additional **lens-convergence boost** applies: `confidence += CONVERGENCE_BOOST_PER_LENS * (convergence - 1)`, capped at 1.0, where `CONVERGENCE_BOOST_PER_LENS = 0.15`. The lens boost and sample boost are applied sequentially, both capped at 1.0.

### (g) ACT / REVIEW / NOISE bucketing + escalation

After scoring, findings are assigned to buckets (priority: NOISE > REVIEW > ACT):

- **NOISE:** `confidence < ACT_CONFIDENCE_MIN (0.6)`, OR `impact == "trivial"`, OR (when judge ran) `judge_verdict != "real"`
- **REVIEW:** `danger` is med or high, OR type is cross-file (reuse/crosslink/altitude) — and not NOISE
- **ACT:** everything else (confidence >= 0.6, danger == low, impact != trivial, judge = real when active)

ACT survivors are written to `escalation.md` and `escalation.json` for direct human or Claude hand-off.

`report.md` shows all three buckets plus per-shard detail. `findings.json` is the full machine-readable output.

### (h) --reason-mode monolithic | lenses

**lenses (default):** three focused passes — REUSE, SIMPLIFICATION, EFFICIENCY — run sequentially per shard. Findings from all three are merged by location (union-find: same file + line ranges within `CONVERGENCE_LINE_GAP` = 3 lines). This is the primary mode; convergence across lenses is a genuine confidence signal because each lens hunts a different category.

**monolithic:** one comprehensive pass covering all simplification kinds. Used by the vetting harness (`vet.mjs`) for Scorecard A. Both hooks (A and B) are injected. Convergence is trivially 1 for every finding (single pass). Everything downstream (danger override, judge, bucketing, escalation) is identical to lenses mode.

### (i) Scoping modes: --file / --pr / --commit / --since

git/gh are used **only** to derive file names (which files are in scope). File content is always read from the current working tree. These modes are mutually exclusive.

- `--file <path>`: single-file review (repo-relative or absolute; .ts/.tsx only)
- `--pr <n>`: files changed in PR n (`gh pr diff --name-only`, fallback to `gh pr view --json files`)
- `--commit <sha>`: files changed in a single commit (`git show --name-only`)
- `--since <ref>`: files changed since `<ref>...HEAD` (`git diff --name-only`)

---

## 4. Configuration / knobs

| Name | Value | Location | Why |
|---|---|---|---|
| `REASON_NUM_PREDICT` | 4096 | `hermes-run.mjs` constant | Caps free-form reasoning output; without it a degenerate/looping generation fills the full 32k context (~15 min pegged GPU) that client-side abort cannot stop |
| `STRUCTURE_NUM_PREDICT` | 2048 | `hermes-run.mjs` constant | JSON schema output is compact; 2048 is ample with headroom |
| `JUDGE_NUM_PREDICT` | 384 | `hermes-run.mjs` constant | Verdict JSON is tiny; tight cap keeps judge calls fast |
| `repeat_penalty` | 1.15 | all three call types | Cuts per-sample over-generation noise (~19 noisy -> ~5 findings typical); value chosen to reduce noise without inducing frequent degenerate/empty output (the `--samples` union compensates for occasional empty outputs) |
| `repeat_last_n` | 256 | all three call types | Context window for the repeat penalty; 256 tokens is enough to detect repetitive loops |
| `TOKEN_BUDGET` | 14000 tokens (56000 chars) | `hermes-run.mjs` constant | Input cap for the REASON step; reduced from 18k after the 30B showed compute-exhaustion timeouts at the original cap on large sub-batches. Leaves ~18k for verbose reasoning output within 32k window |
| `temperature` (REASON) | 0.3 | REASON call | Swept optimum (2026-07-09 temp-sweep): peak gold-recall for devstral + gpt-oss; 0.5/0.7 degrade monotonically, 0.1 collapses S10 recall. Override with `--reason-temp` |
| `temperature` (STRUCTURE/reconcile) | 0.1 | structure call | Fixed low — mechanical JSON conversion, no reason to vary |
| `temperature` (JUDGE) | 0.2 | judge call | Slightly higher for judge to avoid mechanical repetition; judge is deterministic in practice under identical prompts |
| `num_ctx` | 32768 | all model body options | Real ceiling; Qwen2.5 clamps 65536 to this silently |
| `ACT_CONFIDENCE_MIN` | 0.6 | `hermes-run.mjs` constant | Minimum confidence to be eligible for ACT bucket |
| Danger override — HIGH | DANGER_HIGH_RE matches export/API/signature/etc.; OR cross-file type; OR barrel file | deterministic heuristic | Prevents auto-ACT on anything touching public surface |
| Danger override — LOW | DANGER_LOW_RE matches dead/unused/redundant/etc. AND type quality or efficiency AND not barrel | deterministic heuristic | Allows low-risk local findings to reach ACT |
| `CONVERGENCE_BOOST_PER_LENS` | 0.15 | `hermes-run.mjs` constant | +0.15 per extra lens flagging the same location; 3-lens agreement gives +0.30 max |
| `CONVERGENCE_LINE_GAP` | 3 | `hermes-run.mjs` constant | Two findings converge if their line ranges overlap or are within 3 lines |
| `SAMPLE_BOOST_PER_HIT` | 0.1 | `hermes-run.mjs` constant | +0.1 per additional sample hit; 5 of 5 gives +0.4 |
| `SAMPLE_LINE_GAP` | 5 | `hermes-run.mjs` constant | Dedup tolerance across samples (wider than convergence gap to accommodate slight line-range drift between runs) |
| `JUDGE_CONTEXT_LINES` | 15 | `hermes-run.mjs` constant | Lines of context before/after the finding's line range fed to the judge |
| `ADJACENT_EXPORTS_MAX` | 120 | `hermes-run.mjs` constant | Symbol-name entries in the hook A adjacent-exports block; keeps within token budget |
| `SAMPLES` (vet.mjs) | 5 | `vet.mjs` constant near top | Scorecard A per-file sample count; easily tuned without touching hermes-run.mjs |
| `MODEL_TIMEOUT_MS` | 300000 ms (300 s) | `hermes-run.mjs` constant | Per-call timeout; generous for verbose 30B reasoning; timeouts are treated as transient and enter the retry path |

---

## 5. CLI reference

All commands run from the repo root. The report-only guarantee holds for every flag combination.

### Build the repo map (Phase 0, no LLM)

```
node utilities/hermes/build-repo-map.mjs
node utilities/hermes/build-repo-map.mjs --package engine
```

Writes `repo-map.json` (full) or `repo-map.<pkg>.json` (per-package slice). Both are gitignored.

### hermes-run.mjs flags

| Flag | Default | Description |
|---|---|---|
| `--file <path>` | (none) | Single-file review (.ts/.tsx, repo-relative or absolute). Mutually exclusive with `--shard`, `--pr`, `--commit`, `--since`. |
| `--shard <id>` | (all shards) | Run one shard by id, e.g. `S17`. Mutually exclusive with `--file`. |
| `--limit <n>` | (all) | Run the first N shards in manifest order. |
| `--pr <n>` | (none) | Derive changed files from PR n using `gh pr diff --name-only` (read-only). |
| `--commit <sha>` | (none) | Derive changed files from a single commit using `git show --name-only` (read-only). |
| `--since <ref>` | (none) | Derive changed files since `<ref>...HEAD` using `git diff --name-only` (read-only). |
| `--reason-mode lenses\|monolithic` | `lenses` | Reasoning pass: `lenses` = 3 focused passes (REUSE/SIMPLIFICATION/EFFICIENCY) with cross-lens convergence scoring; `monolithic` = one comprehensive pass (convergence=1 for all findings). |
| `--samples <n>` | `1` | Run reason->structure N times per file/shard, union findings, and boost confidence by agreement. Prompt + repo-map assembly happens once; only model calls repeat. |
| `--no-judge` | (judge on) | Skip the per-finding judge pass (fast, unfiltered; escalation.md uses self-scored ACT criteria only). |
| `--judge` | (no-op) | Harmless alias; judge is on by default. |
| `--judge-set <path>` | (none) | Evaluate a labeled benchmark JSON file with the judge model only; skips the normal simplify pipeline. Writes `<out>/verdicts.json`. |
| `--model <name>` | `qwen3:30b-a3b-instruct-2507-q4_K_M` | Override REASON_MODEL (Step 1). |
| `--structure-model <name>` | same as `--model` (no-swap) | Override STRUCTURE_MODEL (Step 2 + Phase 4). Pass a lighter model for split-model setups. |
| `--judge-model <name>` | same as `--structure-model` | Override the JUDGE pass model independently. Allows a different model to judge than the one used for structure/reason. Example: `--model devstral-small-2 --judge-model gemma4:26b-a4b-it-qat` runs devstral for reasoning and structuring, gemma4 for judging — this is the locked baseline pipeline (devstral simplifies, gemma4 judges). |
| `--reason-models <m1,m2,...>` | (none) | **Ensemble mode.** Comma-separated list of reason models. When present: for each file, runs the reason→structure stage once per model (using that model for both steps — gpt-oss gets its free-form fallback intact), unions all per-model finding sets by location, boosts confidence by model agreement (+0.1 per extra model, capped at 1.0), then judges the unioned set with `--judge-model`. Representative selection on overlap: LONGEST suggestion text wins (empirically favors gpt-oss's detailed descriptions); tie-break: highest confidence. Supersedes `--model` when both are given (logs `[WARN]`). Only compatible with `--reason-mode monolithic` (errors out on `--reason-mode lenses`). Compatible with `--file`, `--shard`, `--pr`, `--commit`, `--since`, and `--samples`. |
| `--endpoint <url>` | `http://localhost:11434/api/generate` | Ollama generate endpoint. |
| `--out <dir>` | `utilities/hermes/reports` | Directory for output artifacts (`findings.json`, `report.md`, `escalation.md`, `escalation.json`). |
| `--dry-run` | off | Assemble prompts and print input token estimates; do NOT call the model. Also runs hook A (adjacent-exports) and hook B (caller-grep) deterministically. |
| `--self-test` | off | Run the deterministic hook B post-filter test (3 branches) and exit; no model calls, no shard. |
| `--no-circuit-breaker` | (breaker on) | Force a full multi-shard pass even on systemic failures. By default the run aborts (exit 2) when a whole batch produces nothing — see below. |
| `--cb-consecutive <n>` | `2` | How many consecutive fully-broken shards trip the circuit breaker mid-run. The first batch trips immediately when fully broken (all-error/zero-files always; all-empty only in a multi-shard pass). |

**Circuit breaker (systemic-failure early abort).** A multi-shard pass stops after the first batch that reveals a *systemic* problem rather than churning through all 39 shards. A shard is "broken" when it produces **0 findings**; the breaker classifies why — `zero-files` (INPUT: bad `covers` cell), `error` (PIPELINE: model call/structure failed — `fetch failed`, HTTP 404/5xx, timeout), or `empty` (OUTPUT: model returned nothing structured — the `format:json` empty-output signature or a decode regression). On trip it writes the partial artifacts, prints a cause->fix hint, and exits **2** (distinct from exit 1 = completed-with-errors). **Isolated** sub-batch failures — where the shard still produced other findings — are *not* systemic: they are recorded in `retry-queue.json` (`{shard, files, reason}` per entry) for a targeted `--file` re-run later, and the pass continues.

### Example invocations

```
# Dry run on one shard — proves prompt assembly + token estimate (no model call)
node utilities/hermes/hermes-run.mjs --shard S07 --dry-run

# Run one shard live (default: lenses mode, judge on, single sample)
node utilities/hermes/hermes-run.mjs --shard S07

# Single-file review with multi-sample and monolithic mode (as used by vet.mjs Scorecard A)
node utilities/hermes/hermes-run.mjs --file packages/engine/src/codec/parse.ts \
  --reason-mode monolithic --no-judge --samples 5

# PR-scoped review (file names from PR; content from working tree)
node utilities/hermes/hermes-run.mjs --pr 1027

# Run all shards with a custom output directory
node utilities/hermes/hermes-run.mjs --out /tmp/hermes-out

# Split-model run: 30B reason, 7B structure (requires two GPUs or room for both)
node utilities/hermes/hermes-run.mjs \
  --model qwen3:30b-a3b-instruct-2507-q4_K_M \
  --structure-model hermes-simplify-7b

# Judge benchmark evaluation only
node utilities/hermes/hermes-run.mjs \
  --judge-set utilities/hermes/eval/judge-benchmark.json \
  --out utilities/hermes/reports/vet/judge-qwen3

# Locked baseline: devstral simplifies/structures, gemma4 judges (see §8 Locked baseline)
node utilities/hermes/hermes-run.mjs \
  --model devstral-small-2 \
  --judge-model gemma4:26b-a4b-it-qat \
  --file packages/engine/src/codec/parse.ts

# Locked baseline ENSEMBLE: devstral∪gpt-oss simplify, gemma4 judges (see §8)
node utilities/hermes/hermes-run.mjs \
  --reason-models devstral-small-2,gpt-oss:20b \
  --judge-model gemma4:26b-a4b-it-qat \
  --reason-mode monolithic \
  --samples 5 \
  --file packages/engine/src/codec/parse.ts
```

---

## 6. Vetting harness (vet.mjs) + eval fixtures

[vet.mjs](vet.mjs) is an unattended overnight orchestrator that runs all model work via `hermes-run.mjs` subprocesses (no Claude calls, no source writes). Models run sequentially (single GPU). One bad model never aborts the batch — each scorecard call is wrapped in try/catch and records a SKIP on failure.

### Scorecard A — Simplifier

Per-file fan-out scored against frozen gold findings.

**File lists:**

- S10: `packages/engine/src/codec/parse.ts` — gold has 8 findings ([eval/gold-s10.json](eval/gold-s10.json))
- S07: all non-test `.ts` files in `packages/engine/src/pattern-apply/` — gold has 22 findings ([eval/gold-s07.json](eval/gold-s07.json))

For each model x file: one `hermes-run --file <path> --reason-mode monolithic --no-judge --samples 5`.

**Gold-match scoring — STRICT vs LOOSE:**

A gold finding G is a STRICT HIT if some local finding L satisfies all of:
1. `L.file === G.file`
2. Line ranges overlap within ±5 lines
3. At least one shared key term (backtick-quoted identifier or camelCase/PascalCase/snake_case/ALL_CAPS identifier of length >= 4) from G's summary/suggestion appears in L's text

A gold finding G is a LOOSE HIT (old metric) if conditions 1 and 2 are met without the key-term gate.

The key-term gate exists because line-overlap alone overcounts via coincidental co-location. A finding about "rename var" at the same lines as a gold finding about `escapeRegExp` is not the same issue. STRICT is the primary metric; LOOSE is shown for comparison.

**extras** = local findings that hit no gold finding (strict gate) — a noise/bonus proxy. Raw finding count is a noise meter, not a quality meter: gold averages ~1-2 findings per file; a 19-finding output on a 1-gold file is approximately 95% noise.

**Confidence-weighted recall** = `sum(gold.confidence for hits) / sum(gold.confidence for all gold in shard)`.

### Cross-model ensemble

After all models complete, findings from all models are merged by file + overlapping/adjacent line range (gap = 5 lines) using union-find. Each merged finding records `_convergence` (count of distinct models) and `_models`. The ensemble is scored against gold (strict + loose) and its convergence distribution (1-model / 2-model / 3+-model) is reported.

### Scorecard B — Judge

Precision/recall/F1 evaluated on the frozen 22-item [eval/judge-benchmark.json](eval/judge-benchmark.json). Items are labeled `real` (behavior-preserving simplifications confirmed by Claude) or `fake` (hallucinated or behavior-changing). Label `real` = positive; `not-real` or `uncertain` = negative. Metrics: precision, recall, F1, accuracy, TP/FP/FN/TN.

### Gold standard

- [eval/gold-s10.json](eval/gold-s10.json): 8 findings for `parse.ts`, regenerated per-file, confidence-scored, precise-not-exhaustive
- [eval/gold-s07.json](eval/gold-s07.json): 22 findings for the full `pattern-apply/` directory, same methodology

Gold is regenerated per-file (not whole-shard) so it reflects what a per-file run can actually find. It is precise rather than exhaustive: only findings with clear evidence and a concrete suggestion are included.

[eval/gold-match-detail-<model>.json](eval/) (written per model run) shows per-gold-finding match records with `strictHit`, `strictHitBy`, `looseHit`, `looseHitBy`, and extracted key terms — use this for spot-checking recall misses.

### How to run vet.mjs

```
# From the repo root (nohup recommended for overnight runs):
nohup stdbuf -oL node utilities/hermes/vet.mjs > utilities/hermes/reports/vet/vet.log 2>&1 &

# Re-run only one (or a few) models — e.g. after a per-model fix — without the full ~5.5h matrix.
# --only takes comma-separated substrings matched against the roster ids.
# NOTE: a partial run overwrites scorecard.{md,json} with a scorecard for ONLY the selected
# model(s); back up the full scorecard first and merge the fresh rows back in.
nohup stdbuf -oL node utilities/hermes/vet.mjs --only gpt-oss:20b > utilities/hermes/reports/vet/gptrun.log 2>&1 &
```

`stdbuf -oL` forces line-buffered stdout so you can `tail -f vet.log` and see progress without waiting for buffer flush.

**Runtime:** approximately 20 minutes per model per file with `--samples 5`. The full 7-model roster on both S10 and S07 is an overnight run.

**"Is it stuck?" heuristic:** do NOT use GPU utilization as a liveness indicator — GPU dips between files are normal (repo-map rebuilds run between files; these are CPU-bound). Instead watch the `simp-*` directory count in `utilities/hermes/reports/vet/` rising. Each completed file creates one new `simp-<model>-<shard>-<file>/` directory. Stalls are `MODEL_TIMEOUT_MS` (300 s) + retry delay (max ~17 s) = approximately 5 minutes before the process moves on.

---

## 7. Findings / lessons learned

These are the hard-won experimental results that shaped the current design. Each is backed by the evidence cited.

- **One-shot format:json + strict rubric gave near-zero recall; two-step free-form reasoning recovered it.** This is the pivotal finding. The strict/silencing framing combined with `format:json` in one shot produced 0 findings on most shards in early testing. Removing `format:json` from Step 1 and letting the model reason freely recovered recall. The STRUCTURE step (Step 2) then does the purely mechanical schema conversion without adding findings.

- **Decoding/prompt design dominates model size for recall.** Speed comparison on this hardware: qwen3-30B-A3B (MoE, ~3B active) ~248 tok/s vs dense 14B ~89 tok/s vs dense 7B ~160 tok/s. The 30B MoE is faster than both dense alternatives because its active parameter count per token is ~3B. Do not downsize for speed; the 30B MoE is already the fast option, and it has better recall.

- **Per-file review beats per-shard-batch.** Multi-file passes dilute findings approximately 3x. The gold set grew from 12 whole-set findings to 30 per-file findings after switching to per-file fan-out. Each file gets the model's full attention rather than sharing context with unrelated code.

- **Free-form generation is high-variance per file.** The same file produced 0, 5, and 19 findings across independent single runs. A specific gold finding was hit 2/3 as single runs and 4/5 with `--samples 5`. The `--samples` union + `samples_hit` confidence boost is the fix: agreement across runs is a genuine signal; disagreement at a location means the finding is fragile.

- **num_predict output cap is mandatory.** Without it, a degenerate or looping generation ran to the full 32k context (approximately 15 minutes of pegged GPU) that a client-side AbortController could not stop once the generation was in progress. `REASON_NUM_PREDICT = 4096` provides ample room for verbose reasoning while bounding worst-case runtime.

- **repeat_penalty (1.15) cuts per-sample over-generation noise** (~19 noisy findings reduced to ~5 typical) but can occasionally produce degenerate/empty output on a single sample. The `--samples` union compensates: a finding that is genuinely real will re-appear in subsequent samples even if one sample was degenerate.

- **Raw finding count is a noise meter, not a quality meter.** Gold averages ~1-2 findings per file. A 19-finding output on a 1-gold file is approximately 95% noise. The escalation set (ACT bucket) is the actionable output, not the raw findings list.

- **Recall must be semantic (same issue), not line-overlap alone.** Pure line-overlap overcounts via coincidental co-location: a finding about "rename var" at the same lines as a gold `escapeRegExp` finding appears to be a hit under loose scoring but is not the same issue. The strict gate (line-overlap + shared key term from gold summary/suggestion) is the correct primary metric. The vet.mjs self-test (`--self-test`) proves this divergence with a synthetic case.

- **The JUDGE is deterministic under an identical prompt.** 18/18 findings gave unanimous verdicts across 9 vote calls. Self-consistency for the judge must come from diverse prompts, lenses, models, or samples — not from repeating the same judge call. K=1 is sufficient.

- **The 7B is too weak as a judge.** Precision approximately 0.55 — it waves fake findings through at an unacceptably high rate. Use the 30B (or 14B at minimum) for judge calls.

- **nemotron-3-nano:30b excluded: 24 GB weight load leaves no room for a 32k KV cache on a 24 GB card.** The full 30B dense weights + 32k context KV cache exceed GPU memory. nemotron is not in the vet.mjs MODELS roster.

- **Context7 does not help this internal-refactor track.** The eval files have zero third-party dependencies; the real reuse signal is internal — e.g. the `escapeRegExp` / `escapeForRegex` triplication found by grep across `packages/`. The hook A adjacent-exports injection is the mechanism that surfaces these internal reuse targets.

- **gpt-oss (harmony/reasoning model) returns EMPTY output under Ollama `format:json`.** Both `.response` and `.thinking` come back length-0 with `done_reason: stop`; the same prompt free-form returns a good answer. Because the STRUCTURE step (and the JUDGE call) used `format:json`, gpt-oss scored 0/30 recall and F1=0.000 — a harness bug, not model quality. Fix: `callModelStructure` and `callModelJudge` now fall back to ONE free-form call (no `format:json`) and lenient-extract the first balanced `{…}` block containing the required key (`"findings"` / `"verdict"`) from `.response` or `.thinking` (`lenientExtractObject`). The 6 models that work under `format:json` never reach the fallback. Post-fix, gpt-oss is the **2nd-best simplifier (17/30 strict, ~94% extra-precision — the cleanest signal-to-noise of any model)** and a mid-pack judge (F1=0.720).

## 8. Locked baseline (2026-07-09)

After the 7-model vet on the S10+S07 slice, the same-issue Claude pass, the gpt-oss `format:json` fix + re-run, and a third evaluation axis (description usefulness / actionability):

- **Simplifier: `devstral-small-2` UNION `gpt-oss:20b` ensemble** — recall 23/30 on the S10+S07 slice (best of both models combined; [VETTING-RESULTS.md §4b](VETTING-RESULTS.md)). On overlapping hits, prefer the gpt-oss description: GPT-oss descriptions score mean 3.20/4 on the actionability heuristic, approximately Claude-quality — naming symbols, giving module-scope specifics, and often including drop-in snippets ([VETTING-RESULTS.md §4c](VETTING-RESULTS.md)). Devstral descriptions score 2.00/4 (terse generic pointers, prompt-tunable).
- **Judge: `gemma4:26b-a4b-it-qat`** — sharpest judge, F1=0.800. Deliberately a *different* model from the simplifiers: the best generator (devstral) is a mediocre judge (F1=0.645), and gemma4 drops ~no gold (3 distinct across both models on 30 gold) ([VETTING-RESULTS.md §3](VETTING-RESULTS.md), [§5](VETTING-RESULTS.md)).
- **Baseline pipeline: devstral∪gpt-oss ensemble (simplify) → gemma4 (judge).**

**Ensemble mode is implemented** via `--reason-models`. Run the locked baseline with:

```
node utilities/hermes/hermes-run.mjs \
  --reason-models devstral-small-2,gpt-oss:20b \
  --judge-model gemma4:26b-a4b-it-qat \
  --reason-mode monolithic \
  --samples 5
```

On overlap, the finding with the LONGEST suggestion text is kept as representative (empirically favors gpt-oss's detailed descriptions without hardcoding a model). Single-model fallback (devstral alone, 20/30 recall):

```
node utilities/hermes/hermes-run.mjs \
  --model devstral-small-2 \
  --judge-model gemma4:26b-a4b-it-qat \
  --samples 5
```

Full scorecard + same-issue precision analysis: [reports/vet/scorecard.md](reports/vet/scorecard.md) (gitignored). Vetting detail: [VETTING-RESULTS.md](VETTING-RESULTS.md) §4b, §4c, §6. **Caveat: 2-shard slice only** — confirm on a wider file set before making this the repo-wide default.
