// Base-keyboard facets baked into the working-copy IR (spec 048).
export { deriveCasingFacet } from "./casing.js";
export type { CasingValue } from "./casing.js";
export {
  CASING_FACET_ID,
  deriveFacets,
  getEffectiveFacet,
  setFacetOverride,
  clearFacetOverride,
} from "./accessors.js";
