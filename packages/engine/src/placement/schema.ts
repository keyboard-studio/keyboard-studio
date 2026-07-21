/**
 * Runtime (zod) mirror of {@link PlacementPriorsJSON} (model.ts).
 *
 * `placement-priors.json` is a checked-in data file (packages/engine/data/)
 * consumed by the studio via a dynamic import (see
 * packages/studio/src/hooks/usePlacementPriors.ts). Per the data-boundary
 * convention used elsewhere (e.g. @keyboard-studio/contracts/criteria's
 * criteria.json), the raw JSON is parsed through this schema before it is
 * trusted — a malformed corpus snapshot fails loudly at load rather than
 * surfacing as a silently-wrong placement suggestion downstream.
 *
 * PlacementPriorsJSON/PlacementCandidate are NOT the locked Pattern/Criterion
 * contracts (spec §18) — see docs/spec-amendment-2026-06-11-placement-priors.md
 * ("the two provenance fields land on the placement-map type, which is not
 * yet locked"). This schema is a straightforward structural mirror, not the
 * heavier compile-time drift-guard machinery in
 * packages/contracts/src/schemas.ts, which exists for the locked types.
 *
 * @see spec.md §7.6 (corpus-derived placement priors)
 */

import { z } from "zod";
import type { PlacementPriorsJSON } from "./model.js";

const PlacementMechanismSchema = z.enum([
  "direct",
  "deadkey",
  "store-index",
  "opaque",
]);

const PriorSourceSchema = z.enum([
  "corpus",
  "unicode-decomp",
  "confusable",
  "phonetic",
  "manual",
]);

const PlacementCandidateSchema = z.object({
  vkey: z.string(),
  modifiers: z.array(z.string()),
  mechanism: PlacementMechanismSchema,
  priorSource: PriorSourceSchema,
  priorCount: z.number(),
  confidence: z.number(),
});

const AggregatedEntrySchema = z.object({
  codepoint: z.string(),
  placements: z.array(PlacementCandidateSchema),
  bcp47Context: z.array(z.string()),
  baseLayoutFamily: z.string(),
});

export const PlacementPriorsJSONSchema = z.object({
  version: z.string(),
  generatedFrom: z.string(),
  priorCount: z.number(),
  entries: z.record(z.string(), AggregatedEntrySchema),
});

/**
 * Parse + validate a raw `placement-priors.json` payload.
 * Throws on the first structural mismatch (schema drift, corrupted
 * snapshot) rather than letting a malformed prior silently degrade
 * §8 Phase B placement suggestions.
 */
export function parsePlacementPriorsJSON(raw: unknown): PlacementPriorsJSON {
  return PlacementPriorsJSONSchema.parse(raw) as PlacementPriorsJSON;
}
