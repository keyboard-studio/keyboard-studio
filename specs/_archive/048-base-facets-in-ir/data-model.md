# Phase 1 Data Model: Bake base-keyboard facets into the working-copy IR

## Entity: `FacetSet` (NEW)

**File**: `packages/contracts/src/facets.ts`

```ts
/** A facet's effective value plus where it came from. */
export interface FacetValue<T = string> {
  value: T | "undetermined";
  provenance: "derived" | "overridden" | "undetermined";
}

/**
 * The facet values baked into a working copy at instantiation. Additive,
 * optional -- a working copy with no facets baked in behaves exactly as
 * before this feature (FR-009).
 *
 * First increment: `casing` only (issue #1347). Additional facets
 * (directionality, script, script-family, diacritic mechanism) slot in
 * incrementally as consumers need them (spec Assumptions) -- this shape
 * does not need to change to add one, just a new key.
 */
export interface FacetSet {
  casing?: FacetValue<"cased" | "caseless">;
  // Future increments add keys here (directionality, script, script-family, ...)
  // as consumers need them -- no redesign required.
}
```

## Entity: `KeyboardIR.facets` (EDIT, additive)

**File**: `packages/contracts/src/keyboard-ir.ts`

```ts
export interface KeyboardIR {
  origin: ...;
  header: ...;
  stores: ...;
  groups: ...;
  comments: ...;
  raw: ...;
  touchLayout?: ...;
  visualKeyboard?: ...;
  recognizedPatterns: ...;
  facets?: FacetSet;   // NEW, optional, additive (FR-009)
}
```

## Entity: accessor + override functions (NEW)

**File**: `packages/contracts/src/facets.ts`

```ts
/** FR-005: the effective value -- override when present, else derived. */
export function getFacet<K extends keyof FacetSet>(
  ir: KeyboardIR,
  facet: K,
): FacetSet[K] | undefined {
  return ir.facets?.[facet];
}

/** FR-004: set an override; takes precedence over the derived value. */
export function setFacetOverride<K extends keyof FacetSet>(
  ir: KeyboardIR,
  facet: K,
  value: NonNullable<FacetSet[K]>["value"],
): KeyboardIR {
  return {
    ...ir,
    facets: {
      ...ir.facets,
      [facet]: { value, provenance: "overridden" },
    },
  };
}

/** FR-006: clear an override, restoring the derived value. Re-derives rather
 *  than caching the pre-override value, so it always reflects the current
 *  base -- consistent with facets being base-derived metadata. */
export function clearFacetOverride<K extends keyof FacetSet>(
  ir: KeyboardIR,
  facet: K,
  rederive: (ir: KeyboardIR) => FacetSet[K],
): KeyboardIR {
  return {
    ...ir,
    facets: { ...ir.facets, [facet]: rederive(ir) },
  };
}
```

Pure functions over `KeyboardIR` — consistent with Article II (no store-coupled mutation logic in `packages/contracts`). The studio's `workingCopyStore.ts` calls these and sets the resulting IR, exactly as it already does for other IR edits.

## Entity: the hoisted shared casing derivation (NEW)

**File**: `packages/engine/src/facets/casing.ts` (or a `packages/contracts`-side location if engine would create a circular import — confirm at implementation time)

```ts
/** The shared casing determination both the offline facet-index tool and
 *  the studio runtime call. Narrow, single-purpose -- utilities/facet-index's
 *  own classifyCasing() wraps this for its richer offline report shape. */
export function deriveCasing(ir: KeyboardIR): { value: "cased" | "caseless"; determined: boolean } {
  // Extracted from utilities/facet-index/casing-classifier.ts's core logic.
}
```

## Entity: `Categorization` (existing, UNCHANGED)

**File**: `utilities/facet-index/casing-classifier.ts`

Unchanged shape (`value`, `confidence`, `confidenceClass`, `provenanceTier`, `evidenceSize`, `analyzedCoverage`, `analysisOutcome`). `classifyCasing` is edited to call `deriveCasing` for its core value determination, then builds the rest of `Categorization` around that result as it does today — no change to its own output shape or the offline report format.

## State transition: override lifecycle

```
instantiate ---derive---> FacetValue{value: X, provenance: "derived"}
                              |
                    setFacetOverride(Y)
                              v
                          FacetValue{value: Y, provenance: "overridden"}
                              |
                    clearFacetOverride()
                              v
                  FacetValue{value: X, provenance: "derived"}   (re-derived, not cached)
```

A facet the derivation could not determine starts as `FacetValue{value: "undetermined", provenance: "undetermined"}` (SC-004) — never absent.
