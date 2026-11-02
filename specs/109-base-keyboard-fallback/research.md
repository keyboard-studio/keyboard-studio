# Research: Base-keyboard fallback

**Spec**: [spec.md](spec.md)

- **Decision**: Extend `BASE_KEYBOARDS` in `scripts/codegen-base-layouts.mjs` from five hosts to every catalog layout; keep the five reference host ids as aliases.
  **Rationale**: the codegen already parses `basic_kbd*`, pins the corpus commit and a SHA-256 per source over LF-normalised text, and has a drift test. FR-030 asks for exactly this.
  **Alternatives**: a second script (duplicates parsing and pinning); runtime parsing in the studio (CI has no corpus).

- **Decision**: One positional enumerator, `enumerateUnhandledPositions(ir)`, in `packages/engine/src/pattern-apply/unhandledPositions.ts`.
  **Rationale**: the leak list, the store and spec 108 need the same set (FR-040, SC-005). Characters are joined by the caller (FR-041).
  **Alternatives**: enumerate per base keyboard (positions do not depend on it); enumerate in the studio (breaks the engine/studio import rule).

- **Decision**: Per-class policy `{ letters, digits, punctuation }`, each `"swallow" | "pass-through"`, plus a studio-side `confirmed` flag outside the contract type.
  **Rationale**: FR-020 needs three values; "never confirmed" is working-copy state, not policy.
  **Alternatives**: one value plus a class filter (cannot express mixed picks); `confirmed` inside the contract type (changes a drift-guarded contract for UI state).

- **Decision**: Classify a leak by Unicode General Category using `\p{L}`, `\p{Nd}`, `\p{P}` and `\p{S}` regexes; script by `\p{Script=...}` and `\p{Script_Extensions=...}`.
  **Rationale**: FR-020 pins the classification and the platform supports it, so no dependency.
  **Alternatives**: a Unicode data package (not needed on Node 22 or modern browsers).

- **Decision**: Emit the swallow as one store of key positions plus one rule with `nul` output, owned by a new behaviour id, written through `mutate()`; recompute in the existing derive path, no new timer.
  **Rationale**: FR-010 to FR-013 and D3. `isInSwallowSet` already skips behaviour-owned and carve-covered combos.
  **Alternatives**: `nomatch > nul` (forbidden by FR-011; it swallows frame keys).
  **Open for implement**: the exact kmn form that `kmcmplib` accepts for a key-position store. The first task proves it on a fixture before anything builds on it.

- **Decision**: FR-021 is handled by migration setting `confirmed: false`; compile swallows never-defined keys only when `confirmed` is true, otherwise it keeps today's carve-only behaviour.
  **Rationale**: SC-006, no silent output change on upgrade.
  **Alternatives**: always apply (changes existing drafts).

- **Decision**: Spec 108 shares the enumerator by import. If 108's fill lands first with its own set, the first task here replaces it with the shared call.
  **Rationale**: one answer to one question (US4).
