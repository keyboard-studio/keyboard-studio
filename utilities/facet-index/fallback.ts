/**
 * Script fallback chain (spec 036 T017; FR-004) — used when content analysis
 * is unavailable: `classifyScript` returned null (no concretely-scripted
 * output) or `parse()` threw entirely.
 *
 * Walks: declared-metadata (an explicit script subtag already present in a
 * declared BCP47 language tag) -> default-fallback (langtags' default script
 * for the declared language) -> undetermined (no signal at all).
 *
 * `analysisOutcome` is always `'fallback-only'` here — by construction this
 * module runs only when a keyboard's facet record has no content evidence,
 * regardless of the keyboard's overall parse/opaque status. `provenanceTier`
 * is always `'declared-metadata'` or `'default-fallback'`, never
 * `'content-derived'` (enforces cross-check X4: fallback-only outcome implies
 * a non-content-derived tier).
 */

import { getLanguageDefaults } from "../../packages/engine/src/langtags/index.js";
import type { Categorization, ConfidenceClass, FacetDefinition, ProvenanceTier } from "./types.js";

export interface DeclaredMetadata {
  /** Declared BCP47 language tags, e.g. from a keyboard's .kps `<Language ID="...">` entries. */
  bcp47Tags: string[];
  /**
   * An explicit script subtag already found in a declared tag (e.g. "Deva"
   * from "hi-Deva"), or null/absent when none of the declared tags carry one.
   * The caller (build-index.ts) is responsible for extracting this from the
   * scanned .kps — see script-facet build-index notes for which helper it
   * reused.
   */
  declaredScript?: string | null;
}

const UNDETERMINED = "undetermined";

function bareLanguageSubtag(tag: string): string {
  return (tag.split("-")[0] ?? tag).toLowerCase();
}

function buildCategorization(value: string, tier: ProvenanceTier, confidenceClass: ConfidenceClass): Categorization {
  return {
    value,
    distribution: { [value]: 1 },
    confidence: null, // the (single-value) distribution carries the likelihood
    confidenceClass,
    provenanceTier: tier,
    evidenceSize: 0, // no character evidence at this tier
    analyzedCoverage: 0, // no content was analyzable to reach this tier's value
    analysisOutcome: "fallback-only",
  };
}

export function deriveScriptFallback(meta: DeclaredMetadata, def: FacetDefinition): Categorization {
  void def; // limits enforcement is deferred to build-index validation, Phase 4 (T025) — not yet wired

  // Tier 1: declared-metadata.
  if (meta.declaredScript) {
    return buildCategorization(meta.declaredScript, "declared-metadata", "confident");
  }

  // Tier 2: default-fallback (langtags default script for the declared language).
  for (const tag of meta.bcp47Tags) {
    const defaults = getLanguageDefaults(bareLanguageSubtag(tag));
    if (defaults?.defaultScript) {
      return buildCategorization(defaults.defaultScript, "default-fallback", "mixed");
    }
  }

  // Tier 3: undetermined — no declared script and no resolvable language default.
  return buildCategorization(UNDETERMINED, "default-fallback", "undetermined");
}
