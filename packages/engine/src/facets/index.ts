// Base-keyboard facets baked into the working-copy IR (spec 048).
export { deriveCasingFacet } from "./casing.js";
export type { CasingValue } from "./casing.js";
// Script-identity lookup (spec 079 T059): re-exported so callers outside the
// engine package (the characters step's script-fit check for a carried-over
// author addition) never reach past the barrel into ./generated/scriptLookup.js.
export { scriptOf, scriptExtensionsOf } from "./generated/scriptLookup.js";
export {
  CASING_FACET_ID,
  deriveFacets,
  getEffectiveFacet,
  setFacetOverride,
  clearFacetOverride,
} from "./accessors.js";
