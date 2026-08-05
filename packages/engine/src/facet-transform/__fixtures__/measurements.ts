// facet-transform test fixtures — SourceFacetMeasurement builder (spec 039).
//
// D4 FIXTURE-ONLY GUARD: the cause-tagged `source.*` exception-site schema (and
// `orth.display-difficulty`) are spec-037 outputs NOT yet landed. The engine is
// built and tested against these fixtures ONLY — do NOT wire it to live
// `docs/keyboard-facet-index.json` measurements until 037 ships the cause-tag
// schema (research D4, tasks T003 guard).

import type {
  ConfidenceClass,
  ExceptionSite,
  SourceFacetMeasurement,
} from "../types.js";

export interface MeasurementOverrides {
  facetId?: string;
  dominantValue?: string;
  confidenceClass?: ConfidenceClass;
  consistency?: number;
  exceptionSites?: ExceptionSite[];
  evidenceSize?: number;
}

/**
 * Build a `SourceFacetMeasurement` fixture (Entity 0 shape). Sensible defaults;
 * every field is overridable so a test can pin exactly the measurement it needs.
 */
export function makeMeasurement(
  overrides: MeasurementOverrides = {},
): SourceFacetMeasurement {
  return {
    facetId: overrides.facetId ?? "source.encoding.output-spelling",
    dominantValue: overrides.dominantValue ?? "quoted-literal",
    confidenceClass: overrides.confidenceClass ?? "confident",
    consistency: overrides.consistency ?? 1,
    exceptionSites: overrides.exceptionSites ?? [],
    evidenceSize: overrides.evidenceSize ?? 20,
  };
}

/** Build an `ExceptionSite` fixture. */
export function makeExceptionSite(
  siteId: string,
  causeTag: ExceptionSite["causeTag"],
  overrides: Partial<Omit<ExceptionSite, "siteId" | "causeTag">> = {},
): ExceptionSite {
  return {
    siteId,
    causeTag,
    siteValue: overrides.siteValue ?? "other",
    ...(overrides.predicateId !== undefined ? { predicateId: overrides.predicateId } : {}),
  };
}
