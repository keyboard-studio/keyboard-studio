# Quickstart / Validation: Langtags-driven identity autocomplete

Runnable scenarios that prove the feature works end-to-end. See [data-model.md](data-model.md) and [contracts/](contracts/) for details; this file is the validation guide, not the implementation.

## Prerequisites

```bash
pnpm install
pnpm build            # runs prebuild → fetch-langtags (pinned 99b856b) → codegen-langtags
pnpm --filter @keyboard-studio/engine build   # ensure studio typechecks against fresh engine dist
```

## Scenario A — Engine: extended langtags lookup (FR-002, R1/R2/R3)

```bash
pnpm --filter @keyboard-studio/engine test src/langtags
```

Expected:
- A single-region language (e.g. Swahili) → `regionVariants` length 1; `localNames` non-empty and includes the primary autonym.
- A multi-region / same-English-name language → `regionVariants` length > 1, each with a distinct `regionName`; `lookupByName` marks `hasRegionVariants=true`.
- Existing primary-field tests (`autonym`/`englishName`/`script`/`region`) still pass (back-compat).

## Scenario B — Unambiguous language, happy path (US1, US2, US4)

Drive the live IdentityLite survey (studio) and:
1. On Q1, type an English name and pick an unambiguous suggested language.
2. **Expect**: no region question appears; Q2 shows that language's local name(s) as choices; Q3 shows the resolved language code pre-filled for confirmation.
3. Confirm through to script.

**Expect (SC-001/SC-002)**: reached the end without hand-typing a code; local name + code were pre-filled from the Q1 pick.

## Scenario C — Ambiguous English name → region disambiguation (US3, FR-014)

1. On Q1, enter/pick an English name that maps to >1 region variant.
2. **Expect**: exactly one extra question (region) appears, listing candidate country names.
3. Pick a region.
4. **Expect (SC-004)**: Q2's local-name choices correspond to that region's variant; the assembled BCP47 tag carries the chosen region.
5. Repeat, skipping the region question → **Expect**: falls back to the primary variant, flow completes (never blocks).

## Scenario D — Language not in langtags (US1 free-text, FR-003, SC-003)

1. On Q1, type an English name that matches nothing.
2. **Expect**: entry accepted; no region step; Q2 is a single free-text field; Q3 allows a typed code or blank; every step completable — no dead end.

## Scenario E — Author override survives re-resolution (SC-005, back-edit edge case)

1. Complete Q1→Q2 picking a suggested local name, then edit it to a custom spelling.
2. Go Back to Q1, change to a different language, return forward.
3. **Expect**: downstream re-seeds from the new language, but a value the author explicitly customized is not silently overwritten per the seed-on-first-arrival rule.

## Scenario F — Flow order + both flows (FR-009, FR-015)

```bash
pnpm --filter @keyboard-studio/studio test src/survey        # flow-parity, loadModularFlow, question fixtures
pnpm --filter @keyboard-studio/studio test src/dashboard/buildStepGraph.test.ts
pnpm --filter @keyboard-studio/studio test src/__tests__/stepHost.goldenWalk.test.tsx
```

Expected:
- Live IdentityLite order = English → (region, conditional) → autonym → code → script; membership list and `next` chain agree.
- Proposed Phase A flow mirrors the same order (per FR-015).
- Updated snapshots reflect the new order + conditional region node.

## Full gate before PR

```bash
pnpm typecheck && pnpm -r test && pnpm lint && pnpm depcruise
```

All green (modulo the known Node-26-local jsdom/crypto env failures that pass on CI Node 22).
