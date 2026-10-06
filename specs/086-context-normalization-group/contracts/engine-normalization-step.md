# Contract: engine normalization-step API

**Owner:** Engine. **Consumers:** the studio (`lib/contextToleranceAnalysis.ts`, `lib/contextToleranceApply.ts`) and the corpus harness (`utilities/nfd-tolerance-corpus`). The studio imports it through the browser subpath `@keyboard-studio/engine/context-tolerance`; the harness imports it by relative path.

## Exports

```ts
// packages/contracts/src/ir/outputRepertoire.ts  (pure, browser-safe)
export interface BuildOutputRepertoireOptions {
  /** Polled during the closure (every 512 queue steps); when it returns true the closure stops early. */
  shouldStop?: () => boolean;
}
export function buildOutputRepertoire(ir: KeyboardIR, options?: BuildOutputRepertoireOptions): OutputRepertoire;

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

`buildOutputRepertoire` is the only contracts-side function. A stop request returns the clusters found so far, so the repertoire is a partial set; the generator uses `shouldStop` to honour its time budget (G7).

### Overlay and migration surface

Also exported from the `context-tolerance` barrel ([index.ts](../../../packages/engine/src/context-tolerance/index.ts)), implemented in `pattern-apply/context-tolerance-overlay.ts` and `facet-transform/migrations/normalization-step.ts`:

```ts
export const NORMALIZATION_STEP_SITE_ID = "normalization-step";
export function buildNormalizationStepOverlay(step: NormalizationStep): ContextToleranceOverlay;  // clones the step; never aliases the cache
export function isNormalizationStepBatch(b: ContextToleranceOverlayBatch): b is NormalizationStepBatch;  // b.kind === "normalization-step"
export function overlayHasNormalizationStep(overlay: ContextToleranceOverlay | null): boolean;
export function createNormalizationStepMigrationRule(step: NormalizationStep): MigrationRule;
```

| Export | Role |
|---|---|
| `NORMALIZATION_STEP_SITE_ID` | The single site id: `acceptedSiteIds` is `["normalization-step"]` or `[]` |
| `buildNormalizationStepOverlay` | Records an accepted step as one overlay batch of `kind: "normalization-step"` |
| `isNormalizationStepBatch` / `overlayHasNormalizationStep` | Distinguish a step batch from a 062 `rules` batch (batches persisted before this kind existed have no `kind`) |
| `createNormalizationStepMigrationRule` | Facet-transform rule for the step; no companion rewrites, no derived parameters. `apply` returns a candidate IR with the step appended (for the opaque-integrity and compile-regression gates) and a one-entry ledger, `applied` or `skipped`. The studio does not commit that candidate to the working IR (see [Design note](#design-note-where-the-step-lives)) |

The barrel also re-exports the engine's `NormalizationMap`, `NormalizationRefusalReason`, `NormalizationStep`, and `NormalizationStepResult` types.

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

## Design note: where the step lives

The step lives only in the projection replay. The accepted step is stored as a `kind: "normalization-step"` batch in `contextToleranceOverlay`, and `projectWorkingCopyVfs` replays it into the preview and the download. It also moves `header.entryPoints.main`, which is outside the paths the mutate seam declares as writes, so `contextTolerancePatch` ([contextToleranceApply.ts](../../../packages/studio/src/lib/contextToleranceApply.ts)) keeps the working IR step-free: it has nothing to strip or add for a step batch.

Consequence: the debounced TS Layer A pass runs on the working IR and never sees the step. Only the compile and the WASM `kmcmplib` oracle, which read the projected keyboard, see it. This stays inside the single 300 ms cycle (decision D3); no timer is added. A diagnostic that depends on the step's group (an entry-point or group-reference check, say) cannot come from the TS pass; the harness compares compile diagnostics with and without the step for that reason (FR-010).

## Release precondition

Do not make the normalization step the default over the spec 062 per-rule proposal until both of these are verified:

1. **Desktop engines.** The step is verified on Keyman for Windows, macOS and Linux. Only KeymanWeb (headless) has run it so far. This is not yet verified.
2. **The paste premise.** Paste does not run keyboard rules. The rewrite happens on the next keystroke, when the engine's context buffer contains the pasted text. Each desktop engine must be shown to expose pasted text in the context buffer at that keystroke. This is not yet verified.

Until both are recorded as verified (with the engine versions used), the step ships behind the fallback arrangement in [062 retirement criteria](#062-per-rule-path-retirement-criteria) and the spec 086 open questions stay open.

## 062 per-rule path: retirement criteria

The spec 062 per-rule generator (`proposeContextVariants`, FR-019) is a fallback only. It is retired from the studio authoring path when all of these hold:

| # | Exit criterion |
|---|---|
| E1 | The [release precondition](#release-precondition) is met: desktop engines and the paste premise are verified. |
| E2 | In the committed verification record ([docs/context-normalization-verification.json](../../../docs/context-normalization-verification.json)), no corpus keyboard is `regressed`. The supplementary-plane clusters listed in the spec's open questions are fixed, so the studio no longer needs `verification-regressed` to withhold the step. |
| E3 | The remaining refusal reasons (`no-unicode-entry`, `opaque-entry`, `opaque-output-store`, `time-bound`) are accepted as "leave the keyboard as it is" for the keyboards they hit, or each has its own fix. `no-alternates` already needs no fallback. |
| E4 | The Track 1 copied-keyboard gap is closed: the regressed lookup matches a copy that was given a new keyboard id. |

When E1-E4 hold, remove the `proposeContextVariants` call from `lib/contextToleranceAnalysis.ts`, the per-rule `rules` overlay batch writer, and the 062 branch of the station, in one change. Keep the `rules` batch reader for as long as persisted drafts may hold one. Until then, the 062 path must keep working and keep its tests.

## Errors

None are thrown for keyboard content. Every content problem is a refusal reason. Programming errors (an invalid IR shape) throw.
