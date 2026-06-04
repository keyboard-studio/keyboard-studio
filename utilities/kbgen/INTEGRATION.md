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
