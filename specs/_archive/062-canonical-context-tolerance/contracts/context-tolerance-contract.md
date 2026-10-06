# Contract: Context tolerance surface

The identifiers below are what downstream code and tests will code against.
Types are additive to `packages/contracts/src`; nothing here renames or
changes an existing `Pattern` field.

## Simulator seeding (`packages/contracts/src/simulation.ts`, `packages/engine/src/simulator/index.ts`)

```ts
export interface SimulatorContextSeed {
  text?: string;
  caretPos?: number;
  pendingDeadkeys?: DeadkeySnapshot[]; // existing type, reused
}

export function simulate(
  compiled: CompileResult,
  keys: SimKeyInput[],
  initialContext?: SimulatorContextSeed,
): SimulationResult;
```

Backward-compatible: omitting the third argument reproduces today's
empty-buffer behaviour byte-for-byte (existing `runPatternTests` call sites
are unaffected).

## Tolerance report (`packages/contracts/src/toleranceReport.ts`, new file)

```ts
export type ToleranceStatus = "tolerant" | "made-tolerant" | "not-analysed";

export interface RuleToleranceFinding {
  ruleId: string;
  location: SourceLocation;
  status: ToleranceStatus;
  failingKeystrokes?: SimKeyInput[];
  precomposedOutput?: string;
  decomposedOutput?: string;
  notAnalysedReason?: string;
}

export interface ToleranceReport {
  findings: RuleToleranceFinding[];
  notAnalysedCount: number;
}
```

Producer: `packages/engine/src/validator/context-tolerance.ts` (engine-only,
uses the simulator). Consumer: the new Layer C check below — receives a
`ToleranceReport` as a precomputed input, never constructs one itself.

## Layer C check (`packages/keyboard-lint/src/checks/check-19-x-context-tolerance.ts`)

```ts
export function checkContextTolerance(
  ir: KeyboardIR,
  toleranceReport: ToleranceReport | undefined, // absent when not yet computed — check no-ops
): LintFinding[];
```

New `LintCode` entries (warning/hint severity only — Layer C ships zero
error-severity codes today and this feature does not introduce the first
one):

- `KM_WARN_CONTEXT_NOT_TOLERANT` — a rule differs across normalization forms and has not yet been made tolerant.
- `KM_HINT_CONTEXT_NOT_ANALYSED` — a rule could not be analysed (opaque construct, or unresolved store pairing).

Registration follows the existing `lintWithContext()` gating pattern
(`packages/keyboard-lint/src/lintContext.ts`): the check runs only when a
`toleranceReport` input is present, exactly as existing checks gate on
`inventory` / `touchLayout` availability.

## Context-variant generator (`packages/engine/src/pattern-apply/context-variants.ts`)

```ts
export interface ContextVariant {
  sourceRuleId: string;
  kind: "added-rule" | "added-store-members";
  generatedMarker: string;
  precedesFallbackRuleId?: string;
}

export function proposeContextVariants(
  ir: KeyboardIR,
  toleranceReport: ToleranceReport,
): TransformProposal<ContextVariant>; // TransformProposal is the existing facet-transform type
```

Pure IR→IR proposal generation — no write. Committing a proposal reuses the
existing `applyFacetTransform` / `useFacetTransform.ts` seam unchanged.

## Write-back policy (`packages/contracts/src/axes.ts`)

```ts
export interface DiscoveryAxisVector {
  // ...existing fields, unchanged...
  contextToleranceWriteBack?: "echo" | "own-form"; // default: "echo" (FR-007)
}
```

No new store, no new persistence wiring — picked up automatically by the
existing generic `WorkingCopyData` snapshot in `draftPersistence.ts`.
