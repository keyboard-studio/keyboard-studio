# spec.md amendment — Corpus-derived placement priors (v1.1.1 spec revision)

**Status:** APPLIED to [spec.md](../spec.md) on 2026-06-11. Logged in [docs/spec-signoff.md](spec-signoff.md) under Post-Sign-Off Amendments.

**Provenance:** KM crew placement-intelligence review cycle, 2026-06-09 (km-strategy, km-domain, km-keyman + corpus census) — full analysis in [docs/placement-intelligence-review.md](placement-intelligence-review.md). Amendment text (gaps G1–G4) approved by the project owner 2026-06-11.

---

## Summary

Prose-only amendment. Adds the empirical-placement layer to the strategy framework: the seeder's first-principles anchor cascade is complemented by priors mined from `keymanapp/keyboards/release/`, with explicit extraction filters, independence-weighted aggregation, a blending order, and a precedent-vs-first-principles precedence rule. No `Pattern` schema (§5) change; the two provenance fields (`priorSource`, `priorCount`) land on the placement-map type, which is not yet locked and is settled at the kbgen joint engine+content session.

## Section-by-section changes

- **§7.3 (G4)** — added a **Placement semantics** note to the S-02, S-05, S-06, S-07, and S-09 cards: which key choice *is* the placement decision for that strategy (deadkey trigger, mnemonic table, family-tier keys, cycle key, consonant grid) and what signal drives it.
- **§7.5.1 (G3, new)** — corpus evaluation protocol: the 13-row validation table becomes the seed fixture set; codec + recognizer + decision tree run over every importable `release/` keyboard, emitting `StrategyDivergence` records; divergence clusters surface the next tree rules.
- **§7.6 (G2, new)** — corpus-derived placement priors: `emitPlacementMap(ir)` codec post-pass driven by the supportability scanner; extraction traps (mnemonic layouts, undeclared non-US bases, CAPS/NCAPS dedup, `begin ANSI`, PUA); independence-weighted aggregation bucketed by script class and base family; blending order; precedence rule with the never-silent conflict-surfacing requirement.
- **§8 Phase B (G1)** — placement-proposal protocol: confidence-thresholded pre-fill vs. advisory chip, provenance display, collision surfacing as a resolve-one question, no auto-commit (propose → cross-check → confirm, mirroring the linguist agent).

## Review

Two-specialist review cycle on the applied text, 2026-06-11:

- **km-strategy** — APPROVE. Confirmed §7.6 stays isolated from the §7.2 decision tree, the five Placement semantics notes are consistent with their cards, §7.5 table rows are undisturbed, and the locked `Pattern` schema (§5) is unaffected. Findings applied: ≥3-threshold guard made explicit in the blending-order sentence; S-08 card now states why it has no Placement semantics note. `StrategyDivergence` (§7.5.1) is **forward-declared prose only** — the `packages/contracts` type is a prerequisite of the corpus-evaluation tooling and is tracked on that issue's acceptance criteria.
- **km-author** — CHANGES-NEEDED (8/10), all applied: TELEX cycle keys noted as vowel-context-guarded; `begin ANSI` filter scoped as rare in current `release/` (mostly `legacy/`/pre-2010, usually co-occurring with the mnemonic tag); the non-US-base deviation threshold marked tunable with AZERTY/QWERTZ calibration; "modifier plane" → "modifier layer" in the new §7.6 text (the pre-existing §7.1 A7 "modifier plane" wording is untouched — out of this amendment's scope).
