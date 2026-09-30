# Quickstart / Validation Guide: KeyboardIR `mutate` seam + touch propagation

**Feature**: 014-mutate-seam-touch-propagation

> **GATE CLEARED (2026-06-28).** The dependency gate (#5b/#232) cleared with **PR #822** (`@keyboard-studio/contracts` 0.12.0; §18 sign-off recorded in [docs/spec-signoff.md](../../docs/spec-signoff.md)); this plan was re-validated against the ratified shape on 2026-06-28 ([plan.md](plan.md) gates G-I/G-II/G-VI RESOLVED). The steps below are the validation plan for the P5 implementation. They will pass **as each implementation task lands** — at present the `mutate()` reducer apply path + per-module implementations are still front-end work to be built (the ratified surface is the *type-level* signature + the `TouchKeyIR.provenance?` field), so run each check after its corresponding task completes, not before.

## Prerequisites

- Node ≥ 20, pnpm 9; repo bootstrapped (`pnpm install`).
- #5b/#232 ratified; `@keyboard-studio/contracts` MAJOR bump landed with the `TouchKeyIR` provenance field; §18 coordination note recorded.
- Branch `km/mutate-seam-touch-propagation` re-validated against the ratified contract.

## Setup / baseline

```bash
# Green baseline (record pass counts as the byte-identical-to-P4b reference, SC-008)
pnpm typecheck
pnpm --filter @keyboard-studio/studio test
pnpm --filter @keyboard-studio/contracts test
pnpm depcruise
```

## Scenario checks (map to Success Criteria)

| # | What to validate | How | SC |
|---|---|---|---|
| 1 | `mutate()` writes exactly declared `writes`, nothing else | per-question tests in `packages/studio/tests/survey/questions/<phase>/<id>.test.ts` | SC-002 |
| 2 | Out-of-`writes` patch fails fast, whole-patch rejected, IR unchanged | per-question negative test | SC-002 |
| 3 | `mutate()` idempotent (apply twice = once) | per-question test | SC-003 |
| 4 | Round-trip vs. reused IR fixtures | reuse existing IR fixtures as `mutate` inputs | SC-004 |
| 5 | Re-propagation no-clobber (100% `hand-set` byte-identical) | provenance-tagged touch-layout fixtures | SC-005 |
| 6 | Manual edit promotes `physical-suggested` → `hand-set` | promotion test | SC-006 |
| 7 | Provenance survives round-trip; editor type is a re-export | `packages/contracts` round-trip test | SC-007 |
| 8 | Flag off ⇒ byte-identical to P4b, zero `mutate()`; flag on ⇒ `mutate()` is write path | full-spine run both flag states | SC-008 |
| 9 | Real per-spine-prefix validator passes/flags prefixes; no 2nd debounce | validator + Art. IV probe | SC-009 |
| 10 | Contracts MAJOR bump + §18 note recorded | release/version check | SC-010 |
| 11 | Single write path audit (zero direct `workingCopyStore` IR writes for converted surfaces) | repo audit / depcruise | SC-001 |

## Expected outcome

All eleven checks green, with the flag-off run byte-identical to the recorded P4b baseline. See [contracts/](contracts/) for the per-guarantee obligations and [data-model.md](data-model.md) for the shapes. Implementation details belong in [tasks.md](tasks.md).
