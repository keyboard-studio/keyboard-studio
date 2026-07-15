/**
 * Test-only mirror of the eventual `content/keyboard-facets/script.yaml`
 * (spec 036 T014, content-owned). NOT the shipped content — this fixture
 * exists purely so US1 tests (T011-T013) have a well-formed `FacetDefinition`
 * to pass into `classifyScript` / `deriveScriptFallback` / `buildIndex`
 * without depending on T014 landing first. Shape matches the sample in
 * specs/036-keyboard-facet-index/data-model.md exactly.
 */

import type { FacetDefinition } from "../types.js";

export const SCRIPT_FACET_DEF: FacetDefinition = {
  id: "script",
  title: "Output script",
  description:
    "The script(s) the keyboard actually produces, as an ISO 15924 distribution " +
    "over concretely-scripted output characters. Common/Inherited characters are neutral.",
  valueType: "histogram",
  limits: {
    // Closed ISO-15924 set; deliberately small (real content/keyboard-facets/script.yaml
    // carries the full set) but covers every script these fixtures exercise.
    values: ["Arab", "Cyrl", "Deva", "Latn", "Grek", "Hebr", "Thai", "Ethi"],
    open: false,
  },
  likelihoodSemantics: "share of concretely-scripted produced characters attributed to each script",
  derivation: {
    archetype: "character-content",
    classifierId: "script-classifier",
    fallbackChain: ["content-derived", "declared-metadata", "default-fallback", "undetermined"],
  },
  feedsSessionFacets: ["community.multi-orthography"],
  subProfiles: { latin: ["plain", "extended", "ipa"] },
  schemaVersion: 1,
};
