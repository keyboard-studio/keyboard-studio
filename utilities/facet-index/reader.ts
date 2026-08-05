/**
 * Consumer-facing read surface over a built `FacetIndex` (spec 036 T019).
 * The offline lookup any downstream consumer (base-browser, gallery, the
 * glottolog bridge) uses instead of scanning the corpus live.
 */

import type { Categorization, FacetIndex, KeyboardRecord } from "./types.js";

/** Look up one keyboard's full record. Throws explicitly when the id is absent. */
export function getKeyboard(index: FacetIndex, keyboardId: string): KeyboardRecord {
  const record = index.keyboards[keyboardId];
  if (!record) {
    throw new Error(`unknown keyboard: ${keyboardId}`);
  }
  return record;
}

/**
 * Read one keyboard's categorization for one facet. Throws explicitly on an
 * unknown keyboard id or an unknown facet id (US1 acceptance 3).
 */
export function readFacet(index: FacetIndex, keyboardId: string, facetId: string): Categorization {
  const record = getKeyboard(index, keyboardId);
  if (!index.manifest.facetIds.includes(facetId)) {
    throw new Error(`unknown facet id: ${facetId}`);
  }
  const categorization = record.facets[facetId];
  if (!categorization) {
    // A facet id valid at the manifest level but missing from this keyboard's
    // record is a build-time invariant violation (X3), not a normal lookup
    // miss — distinct message from the "unknown facet id" case above so a
    // caller (and a human reading the error) can tell "you asked for a facet
    // that doesn't exist" apart from "the build shipped a broken record".
    throw new Error(`facet-index invariant violation (X3): keyboard "${keyboardId}" has no record for facet "${facetId}"`);
  }
  return categorization;
}
