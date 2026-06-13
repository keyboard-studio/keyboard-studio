# @keyboard-studio/contracts

Shared TypeScript type definitions for keyboard-studio. This package is the
Day-1 contract between the engine and content teams.

## What lives here

Types only. No runtime validators, no zod, no I/O. The package is intended to
be importable from anywhere (browser, Node, WASM glue, test code) without
pulling in heavy dependencies.

Contents map to [spec.md](../../spec.md):

- `src/pattern.ts` - the `Pattern` schema (spec section 5)
- `src/strategy.ts` - strategy IDs S-01..S-12 and the selector output (spec section 7.3)
- `src/axes.ts` - the seven discovery axes plus sub-axes A2a and A7a (spec section 7.1)
- `src/virtualFS.ts` - the in-memory filesystem interface (spec section 12, glossary)
- `src/lintFinding.ts` - the validator/lint diagnostic shape, Layers A/B/C (spec section 10)
- `src/surveyPhaseResult.ts` - per-phase survey output (spec section 8)
- `src/patternMatch.ts` - gallery match record (spec section 8, phase C)
- `src/compileResult.ts` - WASM compiler service result (spec section 4)
- `src/criteria.ts` - criteria.md band classification (spec sections 11 and 14, decision 4)
- `src/simulation.ts` - contract types for the headless `simulate()` pipeline: `SimKeyInput`, `DeadkeySnapshot`, `SimulationStep`, `SimulationResult`, `TestVectorResult`, `PatternTestResult` (spec §5 test vectors)

## Revision policy

Per [spec.md](../../spec.md) section 18, the `Pattern` interface is the
Day-1 contract. Field renames, type changes, or removals require a major
version bump of this package and a joint engine + content session.
Additive optional fields (such as the `strategyId` and `combinesWith`
fields landed for the strategy framework) are non-breaking but still
go through the issue #5 sign-off.

## Build

```
pnpm --filter @keyboard-studio/contracts build
pnpm --filter @keyboard-studio/contracts typecheck
pnpm --filter @keyboard-studio/contracts test
```
