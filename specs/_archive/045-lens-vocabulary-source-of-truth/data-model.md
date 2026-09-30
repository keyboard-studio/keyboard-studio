# Phase 1 Data Model: Lens-Vocabulary Single Source of Truth

This feature introduces no new runtime types — it re-homes two existing local types onto aliases of already-canonical contracts types, and adds two compile-time guards plus one runtime test. "Entities" below are the two type aliases and their guards.

## Entity: `A1Band` (EDIT — becomes an alias)

**File**: `utilities/facet-index/added-char-count-classifier.ts`

**Before**: `export type A1Band = "tiny" | "small" | "medium" | "large" | "massive";` (a hand-written literal union, structurally identical to but not derived from `Scale`).

**After**:
```ts
import type { Scale } from "@keyboard-studio/contracts";
export type A1Band = Scale;
type _A1BandGuard = Expect<AssignableTo<A1Band, Scale>>;
```

No change to `a1Band(count: number): A1Band`'s banding logic (FR-007 byte-identical output).

## Entity: A4's classification value (EDIT — string widened to an alias)

**File**: `utilities/facet-index/diacritic-mechanism-classifier.ts`

**Before**: `let value: string;` inside `classifyDiacriticMechanism`, assigned one of the four `DiacriticBehavior` literals as bare strings.

**After**:
```ts
import type { DiacriticBehavior } from "@keyboard-studio/contracts";
type A4Value = DiacriticBehavior;
// ...
let value: A4Value;
type _A4ValueGuard = Expect<AssignableTo<A4Value, DiacriticBehavior>>;
```

No change to `siteKindOf`/add-replace-site counting logic (FR-007 byte-identical output).

## Entity: `Expect<AssignableTo<...>>` compile-time guards (NEW instances, existing idiom)

Two new guard type aliases, one per classifier (see above), mirroring `packages/contracts/src/schemas.ts`'s existing `_ScaleGuard`/`_ScriptClassGuard` pattern (same `Expect<AssignableTo<A, B>>` utility, different pairing — a classifier's local type against a contracts type, not a zod schema against a TS type). Declared locally in each classifier file (not in `schemas.ts`) since `utilities/facet-index` is a standalone tool per CLAUDE.md and the guard only needs to be visible to `tsc` at that file's own compile unit.

## Entity: `lens-vocabulary-lockstep.test.ts` (NEW)

**File**: `utilities/facet-index/lens-vocabulary-lockstep.test.ts`

Asserts, per FR-006/FR-009's core+extension model:
- `content/keyboard-facets/added-char-count.yaml`'s `limits.values` array, parsed, equals the exhaustive member list of `Scale` (all 5: tiny/small/medium/large/massive) — exact match, no extension expected for A1.
- `content/keyboard-facets/diacritic-mechanism.yaml`'s `limits.values` array, parsed, equals the exhaustive member list of `DiacriticBehavior` (all 4: none/stacking-combining/replacing-cycling/multi-family) — exact match, no extension expected for A4.
- Fails loudly (a clear assertion message naming the missing/extra value) on any divergence, per FR-006.

Not touched: `spare-key-budget.yaml`/`spare-key-budget-classifier.ts` — already correct (research R1); a lockstep test for A7 would need to assert against `KeyBudgetBand`, a different check already implicitly covered by `keyBudget.test.ts`'s own suite, out of this feature's real scope.

## No entities diverge from the spec's proposed model — data-model.md exists here to pin the exact before/after type shapes for the task-generation step, not to propose anything new.
