# Repo-wide `/simplify` on a 64k local model (Hermes Gemma4 21B)

## The core problem
Two of the three things we want — **code reuse** and **cross-linking** — are inherently *cross-file*. A 64k model that sees one file at a time can't notice "this helper already exists in `contracts`." And the whole repo (~64.5k hand-written LOC) won't fit in 64k tokens. So the plan is built on two ideas:

1. **Precompute a compact "repo map" once, then feed it into every per-shard pass.** The map is the model's memory of the rest of the codebase — it's what makes reuse/cross-link detection possible without holding every file.
2. **A 21B model is not reliable enough to edit code freely.** So we split *find* from *fix*: the model emits **structured JSON findings**, a deterministic harness applies only the mechanical/safe ones, and `typecheck + tests + dependency-cruiser` is the safety net that catches anything it gets wrong. Anything non-mechanical is *logged*, never auto-applied — the same discipline the built-in `/simplify` uses when it escalates instead of rewriting.

## What to exclude (don't waste passes)
- `packages/engine/src/langtags/generated/index.ts` (16,153 LOC, generated)
- `packages/engine/src/simulator/vendor/**` (9,597 LOC, vendored Keyman)
- `packages/engine/src/recognizer/rules/generated/**` (1,036 LOC, generated)
- `packages/compiler` (empty)
- everything eslint/depcruise already ignore; out-of-workspace `utilities/*` except `oauth-backend`
- co-located `*.test.*` files (they're the *verifier*, not the subject — see Phase 3)

That drops 91.3k → ~64.5k simplifiable LOC.

## Never-touch (hard stop — bake into every prompt as a REFUSE list)
From `.claude/agents/km-simplify.md`: `packages/contracts/src/pattern.ts`, `strategy.ts`, `validator.ts`, `lintEngine.ts`; the 300ms debounce (decision D3); the WASM-oracle bridge (`kmcmplib`); the VirtualFS (spec §11); §7 wiring. The model must **never** rename public APIs, change signatures / return shapes / exception types, or relocate modules.

## Phase 0 — Build the repo map (once, on your machine, no LLM)
Produce one compact artifact (target < 8k tokens) the small model can hold alongside a shard. Three parts:
1. **Export inventory** — every module's exported symbols + one-line signature. Lets the model spot "a helper for X already exists." Cheap to generate by grepping `export` declarations; richer via ts-morph if you want signatures.
2. **Import graph** — from dependency-cruiser JSON (`pnpm depcruise --output-type json`), collapsed to module level. Lets the model reason about where a shared util *should* live and whether a cross-link is legal.
3. **Boundary rules** — the 10 forbidden-dependency rules from `.dependency-cruiser.cjs` in plain English (contracts is the dependency root; engine can't import studio; ui is a leaf; question modules can't bypass the mutate seam; etc.). Keeps the model's reuse suggestions from proposing illegal edges.
Ship it as a regenerable script (`build-repo-map.mjs`, provided). Generate both a **full map** and **per-shard slices** (map filtered to the shard's package + transitive deps) so each pass carries only relevant context.

## Phase 1 — Shard the tree
Shard along package/subdir seams (~25–35 shards; most land under a ~2,500-LOC/pass budget). Rules:
- A shard never crosses a package boundary.
- Split oversized dirs (studio/editors, studio/survey, studio/lib, studio/components) into sub-shards.
- Files that alone exceed budget — `MechanismGallery.tsx` (1,738), `TouchGallery.tsx` (1,675), `irToCarveNodes.ts` (1,146), `codec/parse.ts` (1,001) — get their **own** shard. Reuse detection still runs whole-file; if a within-file cleanup is too big to emit safely, log it.
- The concrete manifest is in `shard-manifest.md`.

## Phase 2 — Per-shard pass (the LLM loop)
For each shard, one prompt = rubric + REFUSE list + per-shard repo-map slice + the shard's file contents. The model returns **JSON findings only** — no prose, no freeform diffs (schema in `prompt-templates.md`). Each finding is tagged:
- `safe-auto` = mechanical, behavior-preserving, single-file (dedupe within file, dead branch, inline a one-use var, tighten a loop). Eligible for auto-apply.
- `needs-human` = anything cross-file, anything touching a barrel/public symbol, anything on the REFUSE list. Logged, never auto-applied.
Use constrained JSON decoding to keep a 21B model on-format (llama.cpp GBNF grammar, or Ollama `format=json`).

## Phase 3 — Apply + verify (deterministic — the safety net)
This is where a weak model is made safe:
1. Apply only `safe-auto` findings, **one shard at a time**, as a git commit per shard.
2. After each shard: `pnpm --filter <pkg> typecheck && pnpm --filter <pkg> test` (co-located tests run automatically), then `pnpm depcruise` + `pnpm lint`.
3. Green → keep the commit. Red → revert that shard's edits and downgrade its findings to `needs-human`. The tests are the oracle; no edit is trusted without them.
This is why tests never enter the model's context (which would roughly double the volume): they run *outside* the model as the verifier.

## Phase 4 — Cross-link / reuse reconciliation
Collect every `reuse`/`crosslink` finding across all shards into one list (small — fits one 64k pass). One reconciliation pass (or a human) clusters them: "these 4 modules each roll their own debounce → candidate for a shared util in `contracts` or `engine/shared`." Output = a ranked dedup report. Do **not** auto-apply cross-file dedup — those are the redesigns `/simplify` escalates rather than performs; they become issues/PRs for a stronger agent (or Claude) to pick up.

## Sequencing & cost
- Phase 0 + 1: your machine, minutes, no tokens.
- Phase 2: ~25–35 small-model passes, **dependency-order** (contracts → engine → keyboard-lint/llm → studio → api/oauth). Deps-first means reuse targets in `contracts` are confirmed before downstream shards point at them.
- Phase 3: interleaved with Phase 2 — verify each shard before starting the next.
- Phase 4: one pass at the end.

## Why this survives a 21B / 64k model
- Small, uniform tasks (one shard, fixed rubric, JSON out).
- The hard cross-file reasoning is pre-chewed into the repo map, not asked of the model cold.
- No edit is trusted: `typecheck + tests + depcruise` gate every shard.
- Ambiguity is *logged* (`needs-human`), never guessed — same discipline as the real `/simplify`.
