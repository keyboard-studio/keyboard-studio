# Contract: FacetSet accessor/override API

## Shape (packages/contracts/src/facets.ts)

```ts
interface FacetValue<T = string> {
  value: T | "undetermined";
  provenance: "derived" | "overridden" | "undetermined";
}

interface FacetSet {
  casing?: FacetValue<"cased" | "caseless">;
}
```

`KeyboardIR.facets?: FacetSet` — additive, optional. A `KeyboardIR` with no `facets` key behaves exactly as before this feature (FR-009); round-trip (parse → emit) of a base with no facets is unaffected (SC-005).

## API

| Function | Contract |
|---|---|
| `getFacet(ir, "casing")` | Returns the effective value — override if present, else derived (FR-005). |
| `setFacetOverride(ir, "casing", value)` | Returns a new `KeyboardIR` with the override set, provenance `"overridden"` (FR-004). |
| `clearFacetOverride(ir, "casing", rederive)` | Returns a new `KeyboardIR` with the facet re-derived, provenance `"derived"` (FR-006). |

All three are pure functions over `KeyboardIR` — no side effects, no store coupling (Article II).

## Derivation contract

`deriveCasing(ir: KeyboardIR): { value: "cased" | "caseless"; determined: boolean }` is called at working-copy instantiation (both Track 1 and Track 2, `workingCopyStore.ts`) and:

- MUST be browser-safe: no network access, no offline-artifact (`docs/keyboard-facet-index.json`) load (FR-007).
- MUST produce the same `value` as `utilities/facet-index/casing-classifier.ts`'s offline classifier for the same input, because both call the same hoisted function (FR-008, structural — not a convention).
- MUST report `determined: false` (→ `provenance: "undetermined"`) rather than guessing when the base's casing cannot be established (SC-004).

## Non-goals (explicit, per spec.md Out of scope)

- No facet metadata is emitted into the produced `.kmn`/`.kps` artifact.
- No runtime load of the full `docs/keyboard-facet-index.json` (that is `AdaptationEvidenceProvider`'s separate, heavier mechanism — spec 038, not touched).
- No UI for surfacing/editing overrides — this contract is the data model + accessors a consuming feature's UI (e.g. the casing gate, issue #1347) builds on top of.
- No change to `utilities/facet-index/casing-classifier.ts`'s own output shape (`Categorization`) or the offline report format.
