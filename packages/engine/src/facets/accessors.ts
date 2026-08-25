// Facet accessors (spec 048) — the pure read/override/clear surface over the
// working-copy `KeyboardIR.facets`/`facetOverrides` fields (spec 048 FR-004,
// FR-005, FR-006). All three mutators return a NEW `KeyboardIR`; none mutate
// their input, matching the immutable-update discipline `KeyboardIR` overlays
// use elsewhere (e.g. `facet-transform/migrations/*.ts`'s
// `structuredClone(ir)` + mutate pattern). A shallow top-level spread suffices
// here (rather than `structuredClone`) because these functions only ever
// replace the top-level `facets`/`facetOverrides` maps, never reach into the
// rest of the IR (stores/groups/etc.), so there is nothing else to deep-copy.

import type { FacetValue, KeyboardIR } from "@keyboard-studio/contracts";
import { buildProducedSet } from "@keyboard-studio/contracts";

import { deriveCasingFacet } from "./casing.js";

/** The one concrete facet baked in so far (spec 048 Assumption: the rest of
 * the content/keyboard-facets/ catalog can be added incrementally). */
export const CASING_FACET_ID = "casing";

/**
 * Populate `ir.facets` with every facet this module currently knows how to
 * derive (just `casing` for now), computed once from `ir`'s produced content.
 * Returns a new `KeyboardIR`; does not touch `ir.facetOverrides`.
 *
 * Called once at working-copy instantiation — both Track 1
 * (`instantiateFromBase`) and Track 2 (`instantiateFromExisting`) call this on
 * the freshly-parsed IR before it is set on the store, so both tracks derive
 * facets identically (spec 048 Edge Case).
 */
export function deriveFacets(ir: KeyboardIR): KeyboardIR {
  let hasOutput = false;
  for (const _ of buildProducedSet(ir)) {
    void _;
    hasOutput = true;
    break;
  }

  const casing: FacetValue = hasOutput
    ? { value: deriveCasingFacet(ir), provenance: "derived" }
    : { provenance: "undetermined" };

  return { ...ir, facets: { ...ir.facets, [CASING_FACET_ID]: casing } };
}

/**
 * Read a facet's EFFECTIVE value (spec 048 FR-005): the override when
 * present, otherwise the derived value, otherwise "undetermined". This is the
 * single accessor every consumer should read a facet through.
 */
export function getEffectiveFacet(ir: KeyboardIR, facetId: string): FacetValue {
  const override = ir.facetOverrides?.[facetId];
  if (override !== undefined) {
    return { value: override, provenance: "overridden" };
  }
  return ir.facets?.[facetId] ?? { provenance: "undetermined" };
}

/**
 * Set an override for a facet (spec 048 FR-004). Takes precedence over the
 * derived value on every subsequent `getEffectiveFacet` read; never modifies
 * the base keyboard or any offline artifact (FR-010) — the override lives
 * only on this working-copy `KeyboardIR`.
 */
export function setFacetOverride(ir: KeyboardIR, facetId: string, value: string): KeyboardIR {
  return { ...ir, facetOverrides: { ...ir.facetOverrides, [facetId]: value } };
}

/**
 * Clear a facet's override (spec 048 FR-006), restoring the previously
 * derived value (or "undetermined" if none was ever derived) on the next
 * `getEffectiveFacet` read. A no-op `KeyboardIR` (still a fresh object) when
 * no override was set for `facetId`.
 */
export function clearFacetOverride(ir: KeyboardIR, facetId: string): KeyboardIR {
  if (ir.facetOverrides?.[facetId] === undefined) {
    return { ...ir };
  }
  const rest = { ...ir.facetOverrides };
  delete rest[facetId];
  return { ...ir, facetOverrides: rest };
}
