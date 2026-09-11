// Adapter over the engine's canonical exemplar sourcing (spec 044 FR-015: ONE
// exemplar path repo-wide). kbgen's former local copies of parseUnicodeSet /
// exemplarString / loadExemplars are retired -- they predated spec 044 and
// still carried the escape-handling and set-operation defects the engine's
// parser fixed (see INTEGRATION.md "Retirement note"). Exemplars now come from
// the engine's pinned CLDR+SLDR index: deterministic, offline, no per-locale
// data/cldr/*.json snapshots to fetch.
//
// Uppercase augmentation of specials is the engine's own consumer-side
// derivation (inventoryToExemplarResult); SourcedInventory itself stays a
// faithful record of what the source attested.

import {
  loadExemplarSource,
  sourceExemplars,
  inventoryToExemplarResult,
} from '../../../packages/engine/src/character-discovery/exemplarSource.ts';
import { loadExemplarIndex } from '../../../packages/engine/src/character-discovery/exemplarIndex.ts';
import type { ExemplarResult } from '../../../packages/engine/src/character-discovery/cldr.ts';

export type { ExemplarResult };

/** Provenance of the pinned exemplar index: the CLDR release and SLDR commit it was baked from. */
export interface ExemplarIndexVersion {
  cldr: string;
  sldrCommit: string;
}

/**
 * Version pins of the engine's exemplar index, for placement-map provenance.
 * Replaces the CLDR pin kbgen used to record in data/SOURCES.json when it
 * fetched per-locale snapshots itself.
 */
export async function exemplarIndexVersion(): Promise<ExemplarIndexVersion> {
  const { version } = await loadExemplarIndex();
  return { cldr: version.cldr, sldrCommit: version.sldrCommit };
}

/**
 * Exemplars for a BCP47 tag, from the engine's pinned CLDR+SLDR index, adapted
 * to the ExemplarResult shape (used / digraphs / specials) the CLI consumes.
 * Returns null when neither source covers the tag or its confidence gate fires
 * -- the caller falls back to --chars/--used.
 */
export async function loadExemplars(locale: string): Promise<ExemplarResult | null> {
  await loadExemplarSource();
  const inv = sourceExemplars(locale);
  if (inv === null) return null;
  return inventoryToExemplarResult(inv);
}
