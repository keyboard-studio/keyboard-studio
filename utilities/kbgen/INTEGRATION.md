# kbgen — status and integration path

**Status (2026-06-03): prototype, homed in `utilities/` while it matures.**
Authored as a standalone Node CLI (its own README still refers to `tools/kbgen/...`).
Moved here out of `packages/*` so it does not break `pnpm -r build` / `typecheck`
(it has no tsconfig, no build/test wired to the workspace runner, and is CommonJS, not ESM TS).

**Intended end state: a real engine deliverable** — a *placement seeder* that runs ahead of
the survey to propose data-driven character placements the user then confirms, rather than
entering them by hand. See spec [§7 Strategy selection](../../spec.md) and [§8 Data flow](../../spec.md).

## How it maps onto the spec

| kbgen concept | Spec home |
|---|---|
| Anchor cascade (NFD / NAME / CONFUSABLE / VISUAL / PHONETIC → key) | Automates the placement half of **§8 Phase B** (character coverage + axes) |
| "anchor occupied → RALT layer; anchor free → direct remap + restore" | Roughly **S-01 (substitution) + S-08 (RALT layer)** of the §7.3 catalog |
| Completeness check (every base char still typeable) | The "you still need a literal `v` for URLs" invariant — a hard placement constraint |
| `placement-map.json` | An *engine-internal* artifact; **not** yet the locked `Pattern` type (spec §5) |
| `corpus-diff.js` vs `release/` keyboards | Diagnostic, aligns with the corpus work in [content/scan_report.md](../../content/scan_report.md) |
| Vendored, SHA256-pinned Unicode 16 / CLDR 46.1 | Matches the repo's pinned external-data policy |

## Conformance gaps to close before it joins `packages/`

1. **Toolchain.** Port CommonJS → ESM TypeScript; add `tsconfig.json`, `build`/`typecheck`/`test`
   scripts; migrate `node test/anchors.test.js` → vitest. Match the shape of
   [packages/engine/package.json](../../packages/engine/package.json).
2. **Contract conformance.** The ad-hoc `placement-map.json` shape must either map to, or be
   formally added to, [packages/contracts](../../packages/contracts). Per CLAUDE.md the `Pattern`
   schema (§5) is a Day-1 contract — adding a placement type is a contracts change, **not** an
   informal one. Needs a joint engine+content decision (the §13 Day-1 model).
3. **Strategy coverage.** kbgen currently implements only S-01/S-08. The survey/gallery flow
   (§7.2 decision tree) also reaches S-02 (deadkeys), S-05 (mnemonic spelling), S-07 (cycling),
   S-09 (clusters). Decide whether the seeder stays scoped to substitution-class strategies
   (Milestone 1: Latin-extended on QWERTY) or grows to emit other strategies' skeletons.
4. **Ownership boundary (§13).** Placement + source emission is engine-team territory; but the
   *anchor heuristics* (supplement.json look-alikes, phonetic hints) overlap content-team's
   pattern-library curation. Settle who owns `data/supplement.json` before productizing.
5. **No-compile boundary holds.** kbgen emits source only (`--emit-source`) and must keep
   delegating compilation to the WASM `kmcmplib` compiler service (§13) — do not add a compile
   step here.

## Recommended next step

Bring items 2–4 to a joint engine+content session (the §13 Day-1 contract model) before any
TS port, so the placement type and strategy scope are agreed before code conforms to them.

---

## Decision note (2026-06-15)

Unblocks: #132 (TS port), #133 (PlacementMap implementation), #134 (extraction pipeline).

KM-crew ratification cycle 2026-06-15 (km-validator, km-keyman, km-strategy, km-domain — all HOLD PRIOR). Priors from #131 + the 2026-06-11 placement-intelligence review held under crew review.

**D-INT-1 — Placement contract type (item 2):** A new sibling type `PlacementMap` lands in `packages/contracts/src/placementMap.ts` as an additive, non-breaking addition. It is NOT a `Pattern` (§5) extension — the v1.1.1 amendment (2026-06-11) already foreclosed that path ("No §5 change"). Contracts bumps MINOR: 0.7.0 → 0.8.0. The type carries per-character ranked candidate lists (not single answers); provenance fields `priorSource: 'corpus'|'unicode-decomp'|'confusable'|'phonetic'|'manual'` and `priorCount: number`; and (codepoint → key, modifier set, mechanism, BCP47 context, base-layout family) tuples. The `mechanism` field is a discriminated enum (`'direct'|'deadkey'|'store-index'|'opaque'`); the v1 seeder emits `'direct'` for S-01/S-08. The map is an upstream seeder artifact the survey consumes as Phase B proposals — it never round-trips through `Pattern.kmnFragment`. (Verified: km-validator contracts-shape, km-keyman .kmn-fidelity.)

**D-INT-2 — Corpus extraction architecture (item 2, addendum):** Corpus extraction is a `KeyboardIR` codec post-pass `emitPlacementMap(ir)`, batch-driven by the supportability scanner over `keymanapp/keyboards/release/`. It is NOT a second parser inside kbgen. Respects the §13 no-compile boundary. Output is a versioned, pinned `placement-priors.json` shipped as data, never computed in the SPA. Implementation tracked in #296. (Verified: km-keyman.)

**D-INT-3 — Strategy scope (item 3):** The v1 seeder stays scoped to S-01 (substitution) + S-08 (RALT layer) only. The NFD/NAME/CONFUSABLE/VISUAL/PHONETIC anchor cascade cannot produce the diacritic-trigger tables (S-02), romanization schemes (S-05), cycle-key orderings (S-07), or cluster grammars (S-09) those strategies require. Deferred to #135 (post-v1). No §7.2/§7.5 inconsistency is introduced — the seeder proposes placements; it does not run the decision tree. (Verified: km-strategy.)

**D-INT-4 — Ownership boundary (item 4):** CONTENT team owns `data/supplement.json` (44 hand-curated codepoint entries with name/visual/ipa judgment calls — same kind as `criteria.json`) and the §7.6 weighting inputs (standards-body bonus list, fork-copy collapse policy, anti-pattern blocklist). ENGINE team owns `analyze.js`, `place.js`, `emitPlacementMap`, the extraction pipeline, and the `PlacementMap` type itself. The `PlacementMap` TYPE has no content sign-off dependency — content sign-off applies only when weighting-policy inputs are defined or revised. (Verified: km-domain.)

**Scope guard for #133:** #133 implements ONLY the §7.6 `PlacementMap` (seeder output). It does NOT include the §7.7 assignment-map (`SurveyPhaseResult.assignments?`, full form deferred to joint session #5b) nor the §7.5.1 `StrategyDivergence` type (corpus-eval tooling, separate issue). These are distinct pipeline-phase artifacts and must not be merged into the same PR.
