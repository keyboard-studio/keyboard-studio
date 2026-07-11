# Prompt templates — local model (Hermes / Ollama, 32k)

**Inference endpoint:** `POST http://localhost:11434/api/generate`,
`options.temperature 0.1`, `options.num_ctx 32768`.
Models: `qwen3:30b-a3b-instruct-2507-q4_K_M` (Step 1 reasoning, default; 14B fallback) ·
`hermes-simplify-14b` (Step 2 structuring + find/fix passes) · `hermes-simplify-7b` (cheap passes).
Also reachable via LiteLLM as `oll-hermes-simplify-14b:latest` / `oll-hermes-simplify-7b:latest`.

> **32k ceiling note:** `options.num_ctx 32768` is the effective limit. The Modelfile requests
> 65536, but Qwen2.5 has no YaRN rope-scaling; the Ollama runner silently clamps to 32768.
> A true 64k would need a YaRN re-quant and would not fit the 24 GB GPU. Out of scope.

Three paste-ready prompts plus harness notes. Phase 2 is a two-step call: Step 1 (A1) reasons
free-form for recall; Step 2 (A2) structures that prose into the JSON schema. The model never
edits code, it only reports findings.

---

## (A1) Per-shard reasoning prompt (Step 1 — REASON, no `format:json`)

Use model: `qwen3:30b-a3b-instruct-2507-q4_K_M` (default; 14B fallback). Do **not** set `format:json` on this call — free-form output is intentional. Input cap: ≤ ~18k tokens to leave ~14k headroom for reasoning output inside the 32k window.

```
SYSTEM:
You are a code-simplification reviewer. You do NOT edit code. You do NOT output JSON.
Write a free-form list of every simplification opportunity you find in the shard files below.
Be thorough — list as many concrete findings as you can. For every finding include the file path
and line range, a short description of what is redundant or improvable, and a concrete suggestion.

RUBRIC (quality only — this is NOT bug-hunting):
- reuse       : this code re-implements something that already exists elsewhere (use the repo map
                to point at the existing symbol). Cross-file → needs human review.
- quality     : local readability/structure — dead branch, redundant variable, one-use inline,
                over-nested conditional, duplicated block WITHIN this file.
- efficiency  : a demonstrably cheaper equivalent — needless re-computation in a loop, an O(n^2)
                pass that has an O(n) form, repeated array scans that can be a single pass.
- altitude    : code doing work at the wrong layer (a helper inlined that belongs in a shared
                module). Almost always cross-file → needs human review.
Report ONLY behavior-preserving simplifications. A change must not alter output, timing, error
type, return type, or public shape. If it would, skip it.

REFUSE LIST (never propose changes to these; note them as "REFUSE — needs human" and move on):
- packages/contracts/src/pattern.ts, strategy.ts, validator.ts, lintEngine.ts
- the 300ms debounce (decision D3)
- the WASM-oracle bridge (kmcmplib)
- the VirtualFS (spec §11)
- §7 wiring
- NEVER rename a public API, change a signature / return shape / exception type, or relocate a module.

REPO MAP (your memory of the rest of the codebase — export inventory, import graph, boundary
rules; use it to detect reuse targets and to check a suggestion is a legal edge, but you may NOT
report findings against files not present in SHARD FILES):
{{REPO_MAP_SLICE}}

SHARD FILES (the only files you may report findings against):
{{SHARD_FILES}}

List your findings now. Be specific: include file path, line range, what is wrong, and what to do
instead. Do not hold back — if you see something, say it.
```

---

## (A2) Per-shard structuring prompt (Step 2 — STRUCTURE, with `format:json`)

Use model: `hermes-simplify-14b`. Set `format:json`. Feed Step 1's prose output as the user turn. Input is Step 1's output (≤ ~14k) plus the schema below (~0.5k). Step 2 must not invent new findings — it only converts what Step 1 produced into the schema.

```
SYSTEM:
You convert a free-form code-review list into a structured JSON object. You do NOT invent new
findings. You do NOT edit code. Emit exactly one JSON object matching the schema below and nothing
else.

SEVERITY RULE (apply when assigning severity to each finding):
- safe-auto  : mechanical, behavior-preserving, SINGLE-FILE, touches NO exported symbol, NOT on
               the REFUSE list. (Human triage hint: likely safe to apply.)
- needs-human: anything cross-file, anything touching a barrel/public/exported symbol, anything on
               the REFUSE list, anything where behavior preservation is uncertain.

REFUSE LIST (any finding mentioning these must be severity needs-human):
- packages/contracts/src/pattern.ts, strategy.ts, validator.ts, lintEngine.ts
- the 300ms debounce (decision D3)
- the WASM-oracle bridge (kmcmplib)
- the VirtualFS (spec §11)
- §7 wiring
- any public API rename, signature change, return-shape change, exception-type change, or module
  relocation.

USER TURN: the free-form findings list produced by the reasoning step.

Emit exactly one JSON object of this shape:
{
  "findings": [
    {
      "id": "shard-<n>-<seq>",
      "type": "reuse | quality | efficiency | crosslink",
      "file": "<path>",
      "lines": "<start>-<end>",
      "severity": "safe-auto | needs-human",
      "summary": "<one line: what and why>",
      "suggestion": "<concrete change>",
      "reuse_target": "<path:symbol or null>"
    }
  ]
}
If the input contained no findings, emit {"findings": []}.
```

**safe-auto gate (repeat to the model and enforce in the harness):** a finding may be `safe-auto`
only if it is single-file, behavior-preserving, touches no exported symbol, and is not on the
REFUSE list. Everything else is `needs-human`. The `safe-auto` / `needs-human` tag is a **human
triage hint in the report** — the harness does not auto-apply any finding.

---

## (B) Reconciliation prompt (Phase 4)

Run once, after all shards, over the collected `reuse` + `crosslink` findings.

```
SYSTEM:
You are consolidating cross-file duplication findings from a repo-wide simplify pass. You do NOT
edit code. Emit JSON only — no prose.

INPUT: a flat list of findings (type reuse | crosslink) gathered from every shard. Each has
file, lines, summary, suggestion, reuse_target.

TASK: cluster findings that describe the SAME underlying duplication (e.g. four modules each
rolling their own debounce). For each cluster, propose a single shared home and rank clusters by
payoff (member count × est. LOC removed, highest first).

BOUNDARY RULES (do NOT propose a shared home that would create a forbidden dependency edge —
these are the dependency-cruiser rules; contracts is the dependency root and imports nothing;
engine must not import studio; keyboard-lint must not import engine; ui/ is a leaf; question
modules must not bypass the mutate seam; a shared util must sit at or below every member's layer):
{{BOUNDARY_RULES}}

Emit exactly one JSON object:
{
  "clusters": [
    {
      "id": "cluster-<seq>",
      "theme": "<what is duplicated>",
      "members": ["<file:lines>", "..."],
      "proposed_home": "<path or package where the shared unit should live>",
      "rationale": "<why here; which boundary rules it respects>",
      "est_loc_saved": <integer>,
      "rank": <integer, 1 = highest payoff>
    }
  ]
}
```

Do NOT auto-apply anything from this report — clusters become issues/PRs for a stronger agent.

---

## Harness notes
- **Endpoint:** `POST http://localhost:11434/api/generate` with body fields `model`, `prompt`,
  `options: { "temperature": 0.1, "num_ctx": 32768 }`. NousResearch hermes-agent (Docker)
  orchestrates the cron/gateway; it calls Ollama directly.
- **Two-step call per shard (Phase 2):**
  - Step 1 (A1): call `qwen3:30b-a3b-instruct-2507-q4_K_M` (14B fallback) **without** `format:json`.
    Free-form reasoning output recovers recall; the silencing effect of constrained-JSON-in-one-shot
    produced near-zero findings on most shards in testing.
  - Step 2 (A2): feed Step 1's prose into a second call to `hermes-simplify-14b` **with**
    `format:json`. This structuring pass converts the prose into the `{"findings":[...]}` schema
    and applies the severity rule. No new findings are invented in Step 2.
- **Input cap — Step 1:** ≤ ~18k tokens assembled (repo-map slice ~4–5k + rubric/REFUSE ~1k +
  shard code ≤ ~13k / ~1,100–1,300 LOC). This leaves ~14k headroom for reasoning output inside
  the 32k window. Shards that exceed the code cap are **sub-batched** by the harness (split into
  smaller sub-shards, each run as a Step 1 + Step 2 pair, findings merged) and flagged
  `[WARN] shard sub-batched` in the report. Do NOT edit `shard-manifest.md` boundaries —
  runtime sub-batching handles it.
- **Temperature / num_ctx:** both calls use `options.temperature 0.1` and `options.num_ctx 32768`.
- **Deps-first order:** feed shards S01→S39 as listed in [shard-manifest.md](shard-manifest.md)
  (contracts → engine → keyboard-lint → llm → studio → api → oauth-backend), so reuse targets are
  confirmed upstream before downstream shards reference them.
- **Report-only — no auto-apply:** collect all JSON findings (from every shard's Step 2 output)
  into one local report artifact (`hermes-simplify-report.json` / `.md`). Do NOT apply findings,
  do NOT make git commits, do NOT run revert logic. The `safe-auto` / `needs-human` tag is a
  human triage hint in the report, not an auto-apply trigger.
- **After a human chooses to apply findings:** the appropriate verification sequence is
  `pnpm --filter <pkg> typecheck && pnpm --filter <pkg> test`, then `pnpm depcruise` +
  `pnpm lint`. This is a human/agent step, not an automated in-harness gate.
