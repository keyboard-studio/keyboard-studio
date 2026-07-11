# Repo-wide `/simplify` via Hermes local tooling (Ollama inference, 32k)

**Architecture:** NousResearch hermes-agent (Docker) handles orchestration only (cron/gateway). Inference goes direct to Ollama at `POST http://localhost:11434/api/generate`. Three models:
- **qwen3:30b-a3b-instruct-2507-q4_K_M** (default reasoning model) — Phase 2 Step 1 (free-form findings, best recall/precision on this box; fits @32k now that whisperX idle-unloads). 14B is the fallback.
- **hermes-simplify-14b** (FROM qwen2.5-coder:14b, `options.temperature 0.1`) — Phase 2 Step 2 (structuring pass, prose → JSON schema) and find/fix passes.
- **hermes-simplify-7b** (FROM qwen2.5:7b, `options.temperature 0.1`) — cheap/cheap passes.

Also reachable via LiteLLM as `oll-hermes-simplify-14b:latest` / `oll-hermes-simplify-7b:latest`.

> **32k ceiling — why it is 32768 and not 65536:** the Modelfile requests `num_ctx 65536`, but Qwen2.5 has no YaRN rope-scaling (native trained context is 32 768 tokens). The Ollama runner silently clamps `options.num_ctx` to 32768. A true 64k context would require a YaRN re-quant of the base weights and would not fit the 24 GB GPU alongside other tenants. This is out of scope; plan accordingly.

## The core problem
Two of the three things we want — **code reuse** and **cross-linking** — are inherently *cross-file*. A 32k model that sees one file at a time can't notice "this helper already exists in `contracts`." And the whole repo (~64.5k hand-written LOC) won't fit in 32k tokens. So the plan is built on two ideas:

1. **Precompute a compact "repo map" once, then feed it into every per-shard pass.** The map is the model's memory of the rest of the codebase — it's what makes reuse/cross-link detection possible without holding every file.
2. **A 14B model is not reliable enough to edit code freely.** So we split *find* from *fix*: the model emits **structured JSON findings**, a deterministic harness collects them into a report artifact, and a human (or stronger agent) decides what to apply. Anything non-mechanical is tagged `needs-human` in the report — same discipline as the built-in `/simplify` when it escalates instead of rewriting.

## What to exclude (don't waste passes)
- `packages/engine/src/langtags/generated/index.ts` (16,153 LOC, generated)
- `packages/engine/src/simulator/vendor/**` (9,597 LOC, vendored Keyman)
- `packages/engine/src/recognizer/rules/generated/**` (1,036 LOC, generated)
- `packages/compiler` (empty)
- everything eslint/depcruise already ignore; out-of-workspace `utilities/*` except `oauth-backend`
- co-located `*.test.*` files (they're the *verifier*, not the subject)

That drops 91.3k → ~64.5k simplifiable LOC.

## Never-touch (hard stop — bake into every prompt as a REFUSE list)
From `.claude/agents/km-simplify.md`: `packages/contracts/src/pattern.ts`, `strategy.ts`, `validator.ts`, `lintEngine.ts`; the 300ms debounce (decision D3); the WASM-oracle bridge (`kmcmplib`); the VirtualFS (spec §11); §7 wiring. The model must **never** rename public APIs, change signatures / return shapes / exception types, or relocate modules.

## Phase 0 — Build the repo map (once, on your machine, no LLM)
Produce one compact artifact (target < 5k tokens per per-shard slice) the small model can hold alongside a shard. Three parts:
1. **Export inventory** — every module's exported symbols + one-line signature. Lets the model spot "a helper for X already exists." Cheap to generate by grepping `export` declarations; richer via ts-morph if you want signatures.
2. **Import graph** — from dependency-cruiser JSON (`pnpm depcruise --output-type json`), collapsed to module level. Lets the model reason about where a shared util *should* live and whether a cross-link is legal.
3. **Boundary rules** — the 10 forbidden-dependency rules from `.dependency-cruiser.cjs` in plain English (contracts is the dependency root; engine can't import studio; ui is a leaf; question modules can't bypass the mutate seam; etc.). Keeps the model's reuse suggestions from proposing illegal edges.
Ship it as a regenerable script (`build-repo-map.mjs`, provided). Generate both a **full map** and **per-shard slices** (map filtered to the shard's package + transitive deps) so each pass carries only relevant context.

## Phase 1 — Shard the tree
Shard along package/subdir seams (~25–35 shards). Rules:
- A shard never crosses a package boundary.
- Split oversized dirs (studio/editors, studio/survey, studio/lib, studio/components) into sub-shards.
- Files that alone exceed the per-pass shard budget — `MechanismGallery.tsx` (1,738 LOC), `TouchGallery.tsx` (1,675), `irToCarveNodes.ts` (1,146), `codec/parse.ts` (1,001) — get their **own** shard. Reuse detection still runs whole-file; if a shard exceeds the token cap the harness trims or splits it at runtime and flags it as `[WARN] shard trimmed`. Oversized single-file shards are reported best-effort — do NOT edit `shard-manifest.md`'s boundaries.
- The concrete manifest is in `shard-manifest.md`.

## Phase 2 — Per-shard pass (the LLM loop, two steps)

**Rationale:** constrained-JSON decoding in one shot is the wrong call for this model class — the strict/silencing rubric plus `format:json` produced near-zero recall (0 findings on most shards). Free-form reasoning recovers recall; a cheap structuring pass restores the schema.

**Step 1 — REASON (recall):** call the model *without* `format:json`, using the default reasoning model (`qwen3:30b-a3b-instruct-2507-q4_K_M`; 14B fallback). Prompt = precision-guarded rubric + REFUSE list + per-shard repo-map slice + shard file contents. The model emits a **free-form findings list** (prose or light markdown). The rubric is guarded but not silencing: keep "behavior-preserving only (no change to output, timing, error type, return type, or public shape)" and the REFUSE list; drop the "emit JSON only / never report bugs / be conservative" framing that suppressed output; encourage the model to list many concrete findings with file and line references.

**Step 2 — STRUCTURE:** feed Step 1's prose output into a second call *with* `format:json` (default model `hermes-simplify-14b`) to convert it into the existing `{"findings":[...]}` schema (schema in [prompt-templates.md](prompt-templates.md)). Step 2 applies the `safe-auto` / `needs-human` severity rule. Step 2 must not invent new findings — its only job is to structure what Step 1 produced.

Each finding in the output is tagged:
- `safe-auto` = mechanical, behavior-preserving, single-file (dedupe within file, dead branch, inline a one-use var, tighten a loop). Human triage hint: likely safe to apply.
- `needs-human` = anything cross-file, anything touching a barrel/public symbol, anything on the REFUSE list. Human triage hint: review before applying.

All findings — both `safe-auto` and `needs-human` — are collected into the report artifact. The `safe-auto` / `needs-human` tag is a **human triage hint only**; the harness does not apply any finding automatically.

## Phase 3 — Collect findings into report artifact (report-only, no auto-apply)
The harness collects all JSON findings from every shard pass into one local report artifact (e.g. `hermes-simplify-report.json` / `hermes-simplify-report.md`). No findings are auto-applied. No git commits are made by the harness. No revert logic is needed.

The report groups findings by shard, retains the `safe-auto` / `needs-human` triage tag, and surfaces a summary table (shard, finding count, safe-auto count, needs-human count).

When a human (or stronger agent) chooses to apply one or more findings, the appropriate verification sequence is: `pnpm --filter <pkg> typecheck && pnpm --filter <pkg> test`, then `pnpm depcruise` + `pnpm lint`. This gate is a human/agent step after applying a chosen finding — it is not an automated in-harness loop.

## Phase 4 — Cross-link / reuse reconciliation (report section)
Collect every `reuse`/`crosslink` finding across all shards. A reconciliation pass (or a human) clusters them: "these 4 modules each roll their own debounce → candidate for a shared util in `contracts` or `engine/shared`." Output = a ranked dedup report **appended to the Phase 3 report artifact**. Do **not** auto-apply cross-file dedup — those are the redesigns `/simplify` escalates rather than performs; they become issues/PRs for a stronger agent (or Claude) to pick up.

## Sequencing & cost
- Phase 0 + 1: your machine, minutes, no tokens.
- Phase 2: ~25–35 small-model passes, **dependency-order** (contracts → engine → keyboard-lint/llm → studio → api/oauth). Deps-first means reuse targets in `contracts` are confirmed before downstream shards point at them.
- Phase 3: collect into report as each shard completes; no verify/revert loop.
- Phase 4: one reconciliation pass at the end, appended to the report.

**Per-pass token budget (32k context, `options.num_ctx 32768`):**

Step 1 (reasoning) — input cap is lower than the original one-shot budget because the reasoning model produces verbose output; ~14k of headroom must be reserved for Step 1's output inside the 32k window:

| Component | Token budget |
|---|---|
| Repo-map slice (per-shard) | ~4–5k |
| Rubric + REFUSE list | ~1k |
| Shard code | ≤ ~13k (~1,100–1,300 LOC) |
| **Total Step 1 input** | **≤ ~18k** |
| Reserved for Step 1 reasoning output | ~14k |

Step 2 (structuring) — feeds Step 1's prose output (≤ ~14k) plus the JSON schema (~0.5k) into a second call with `format:json`. The structuring model (`hermes-simplify-14b`) has a short, deterministic task so output is compact; ~4k output headroom is sufficient.

Shards whose code exceeds the ~13k Step 1 input cap (~1,100–1,300 LOC) are **sub-batched** by the harness: split into smaller sub-shards, run as separate Step 1 + Step 2 pairs, then their findings merged before Phase 3 collection. The harness flags these `[WARN] shard sub-batched` in the report. Do NOT rewrite `shard-manifest.md` boundaries to match — runtime sub-batching handles it.

## Why this survives a 14B / 32k model
- Small, uniform tasks (one shard, fixed rubric, JSON out).
- The hard cross-file reasoning is pre-chewed into the repo map, not asked of the model cold.
- No edit is auto-applied: the harness is report-only; `typecheck + tests + depcruise` is a human/agent step run after choosing to apply a finding.
- Ambiguity is *logged* (`needs-human`), never guessed — same discipline as the real `/simplify`.
