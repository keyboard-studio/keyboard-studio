# Contract: engine normalization-step API

**Owner:** Engine. **Consumers:** the studio (`lib/contextToleranceAnalysis.ts`, `lib/contextToleranceApply.ts`) and the corpus harness (`utilities/nfd-tolerance-corpus`). The studio imports it through the browser subpath `@keyboard-studio/engine/context-tolerance`; the harness imports it by relative path.

## Exports

```ts
// packages/contracts/src/ir/outputRepertoire.ts  (pure, browser-safe)
export function buildOutputRepertoire(ir: KeyboardIR): OutputRepertoire;

// packages/contracts/src/ir/usBaseLayout.ts
export const US_BASE_LAYOUT: ReadonlyMap<string /* "K_A" | "S+K_A" */, string>;

// packages/engine/src/pattern-apply/normalization-step/index.ts
export const NORMALIZATION_STEP_GENERATOR_VERSION: string;      // bump on any output-affecting change
export const NORMALIZATION_GROUP = "generated_context_normalize";
export function proposeNormalizationStep(ir: KeyboardIR, opts?: { budgetMs?: number }): Promise<NormalizationStepResult>;
export function applyNormalizationStep(ir: KeyboardIR, step: NormalizationStep): KeyboardIR;   // returns new IR
export function removeNormalizationStep(ir: KeyboardIR): KeyboardIR;                           // no-op if absent
export function normalizationStepCacheKey(ir: KeyboardIR): Promise<string>;
```

The types are defined in [data-model.md](../data-model.md). They are exported from `packages/contracts/src/toleranceReport.ts` next to `ContextVariant`, and the addition is additive.

## Guarantees

| # | Guarantee | Requirement |
|---|---|---|
| G1 | `proposeNormalizationStep` performs no compile and no simulation | FR-017 |
| G2 | Same IR and generator version give a byte-identical step when emitted | FR-015 |
| G3 | `removeNormalizationStep(applyNormalizationStep(ir, s))` emits byte-identical to `ir` | FR-011 |
| G4 | `applyNormalizationStep` on an IR that already holds a step replaces it, never stacks | FR-011 |
| G5 | The only IR changes are: one appended non-keys group, its `generated_cn_*` stores, and `header.entryPoints.main` | FR-007 |
| G6 | Refusal returns `{kind:"refused"}` and the IR is untouched; there is no partial step | FR-012 |
| G7 | The default budget is 5000 ms; exceeding it returns `refused: "time-bound"` | SC-005 |

## Entry-point rule

The original entry is `ir.header.entryPoints.main`. If that is absent, it is the first non-readonly group, mirroring `emit.ts:709-714`. **Do not** use `entryGroupOf` (`ir-insert.ts:24`), which may return a different group.

Refusal cases:
- The `begin` encoding is not Unicode: `no-unicode-entry`.
- The entry group is an opaque fragment: `opaque-entry`.

## Errors

None are thrown for keyboard content. Every content problem is a refusal reason. Programming errors (an invalid IR shape) throw.
