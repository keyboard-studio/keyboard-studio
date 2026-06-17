// Adapter: KbgenOutputMap → PlacementMap (contracts §7.6 contract shape).
//
// This module is a pure conversion function; it has no side effects and no
// runtime dependency on the @keyboard-studio/contracts package.  kbgen is
// deliberately kept outside the pnpm workspace glob (see INTEGRATION.md
// D-INT-1) so we cannot import from "@keyboard-studio/contracts" without
// adding a workspace dependency, which would pull contracts' build into kbgen's
// build boundary.  Instead we structurally conform: the local alias types below
// mirror the PlacementMap/PlacementEntry/PlacementCandidate/PlacementMechanism/
// PriorSource shapes from packages/contracts/src/placementMap.ts (v0.9.0).
// If the contract types change, update both.

import type { KbgenOutputMap } from './map.ts';

// ---------------------------------------------------------------------------
// Local structural mirrors of packages/contracts/src/placementMap.ts (v0.9.0)
// ---------------------------------------------------------------------------

/** @see packages/contracts/src/placementMap.ts PlacementMechanism */
type PlacementMechanism = 'direct' | 'deadkey' | 'store-index' | 'opaque';

/** @see packages/contracts/src/placementMap.ts PriorSource */
type PriorSource = 'corpus' | 'unicode-decomp' | 'confusable' | 'phonetic' | 'manual';

/** @see packages/contracts/src/placementMap.ts PlacementCandidate */
export interface PlacementCandidate {
  vkey: string;
  modifiers: string[];
  mechanism: PlacementMechanism;
  priorSource: PriorSource;
  priorCount: number;
  confidence: number;
}

/** @see packages/contracts/src/placementMap.ts PlacementEntry */
export interface PlacementEntry {
  codepoint: string;
  candidates: PlacementCandidate[];
}

/** @see packages/contracts/src/placementMap.ts PlacementMap */
export interface PlacementMap {
  entries: PlacementEntry[];
  bcp47Context?: string;
  baseLayoutFamily?: string;
  pinnedPriorsVersion?: string;
}

// ---------------------------------------------------------------------------
// Pinned constants
// ---------------------------------------------------------------------------

/**
 * Version tag embedded in every map produced by this adapter.
 * Lets the Phase B survey warn when proposals came from a stale seeder build.
 */
const PINNED_PRIORS_VERSION = 'kbgen-v1';

/**
 * Max weight emitted by analyze.ts (DECOMPOSITION = 100).
 * Used to normalise anchor.weight → confidence ∈ [0, 1].
 * @see utilities/kbgen/analyze.ts WEIGHT constant
 */
const MAX_WEIGHT = 100;

// ---------------------------------------------------------------------------
// Base-layout family derivation
// ---------------------------------------------------------------------------

/**
 * Map known base-layout IDs to their QWERTY/AZERTY/QWERTZ family name.
 * Unknown IDs are passed through verbatim so downstream can see the raw id
 * rather than receiving undefined; this is documented and intentional.
 */
const BASE_FAMILY: Record<string, string> = {
  us: 'QWERTY',
  uk: 'QWERTY',
  au: 'QWERTY',
  ca: 'QWERTY',
  fr: 'AZERTY',
  be: 'AZERTY',
  de: 'QWERTZ',
  ch: 'QWERTZ',
  at: 'QWERTZ',
};

function deriveBaseLayoutFamily(baseId: string): string {
  // Look up by lowercase id. Unknown ids are passed through so the survey
  // can surface them for manual review rather than silently dropping context.
  return BASE_FAMILY[baseId.toLowerCase()] ?? baseId;
}

// ---------------------------------------------------------------------------
// via → PriorSource mapping
// ---------------------------------------------------------------------------

/**
 * Map kbgen AnchorInfo.via values to the PlacementMap PriorSource union.
 *
 * Mapping table (per spec §7.6 "anchor cascade: NFD → name → confusable →
 * visual → phonetic"):
 *   DECOMPOSITION → 'unicode-decomp'  (NFD anchor: char decomposes to base+mark)
 *   NAME          → 'unicode-decomp'  (Unicode name parse also derives from UCD data)
 *   CONFUSABLE    → 'confusable'      (Unicode confusables dataset)
 *   VISUAL        → 'confusable'      (supplement.json look-alike; treated as visual
 *                                      confusable — closest contract member available;
 *                                      there is no 'visual' member in PriorSource v1)
 *   PHONETIC      → 'phonetic'        (supplement.json IPA / transliteration hint)
 *
 * 'corpus' and 'manual' do not appear in v1 kbgen output.
 */
function viaToPriorSource(via: string): PriorSource {
  switch (via) {
    case 'DECOMPOSITION':
    case 'NAME':
      return 'unicode-decomp';
    case 'CONFUSABLE':
    case 'VISUAL':
      // VISUAL is a supplement.json curated look-alike (see analyze.ts).
      // The PriorSource union has no 'visual' member; 'confusable' is the
      // closest semantic match (both are appearance-driven anchor sources).
      return 'confusable';
    case 'PHONETIC':
      return 'phonetic';
    default:
      // Unknown via strings are treated as phonetic (weakest non-corpus source)
      // to avoid dropping a placement candidate silently.
      return 'phonetic';
  }
}

// ---------------------------------------------------------------------------
// Main adapter
// ---------------------------------------------------------------------------

/**
 * Convert a {@link KbgenOutputMap} (kbgen seeder output) to a
 * {@link PlacementMap} (contracts §7.6 shape consumed by survey Phase B).
 *
 * Mapping decisions:
 *
 * 1. **One PlacementEntry per codepoint.**  kbgen discards alternate anchors
 *    in place.ts (only the highest-weight anchor is kept as `anchor` on each
 *    placement); therefore each entry has a single-element `candidates` array
 *    in v1.  Multi-candidate ranking is a future enhancement.
 *
 * 2. **`method` → `mechanism` + `modifiers`:**
 *    - 'direct'   → mechanism 'direct', modifiers []
 *    - 'modifier' → mechanism 'direct', modifiers ['RALT']
 *    - 'restore'  → EXCLUDED (see below)
 *
 * 3. **'restore' entries are excluded.**  'restore' physical entries exist to
 *    keep the base letter reachable after a direct remap displaces it to the
 *    RALT layer (see map.ts build() restore loop, lines 112-126).  They are a
 *    completeness/losslessness invariant, NOT character placement proposals for
 *    the special inventory.  Including them would pollute the Phase B pre-fill
 *    with spurious candidates for ordinary Latin base letters (e.g. RALT+B → b).
 *
 * 4. **`anchor.weight → confidence`:** normalised by MAX_WEIGHT (100) so the
 *    result is in [0, 1].  Confirmed: analyze.ts WEIGHT max is DECOMPOSITION=100.
 *
 * 5. **`priorCount` is always 0** — no corpus data in v1 kbgen output.
 *
 * 6. **`bcp47Context`** comes from `source.locale` (may be null/undefined →
 *    field omitted from the output map to satisfy exactOptionalPropertyTypes).
 *
 * 7. **`baseLayoutFamily`** is derived from `base.id` via a known-id table.
 *    Unknown ids are passed through verbatim (see deriveBaseLayoutFamily).
 *
 * @param map  - kbgen seeder output
 * @returns    - contract-shaped PlacementMap ready for Phase B consumption
 */
export function toPlacementMap(map: KbgenOutputMap): PlacementMap {
  const entries: PlacementEntry[] = [];

  for (const entry of map.physical) {
    // Exclude 'restore' entries — they are completeness rules (displaced base
    // letters pushed to RALT), not character placement proposals for the survey.
    if (entry.method === 'restore') continue;

    if (!entry.anchor) {
      // No anchor means kbgen has no placement signal for this entry; skip it.
      // This should not happen for 'direct'/'modifier' entries in normal output,
      // but we guard defensively.
      continue;
    }

    const mechanism: PlacementMechanism = 'direct';

    // 'direct' method → plain remap, no RALT modifier.
    // 'modifier' method → RALT layer, modifiers ['RALT'].
    // kbgen 'modifier' entries in map.ts always include RALT in entry.modifiers
    // (see mods() helper); we derive from method to be explicit about contract meaning.
    const modifiers: string[] = entry.method === 'modifier' ? ['RALT'] : [];

    const priorSource = viaToPriorSource(entry.anchor.via);
    // Clamp to [0,1] and coerce NaN to 0 to protect the PlacementCandidate.confidence contract.
    const raw = entry.anchor.weight / MAX_WEIGHT;
    const confidence = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0;

    const candidate: PlacementCandidate = {
      vkey: entry.key,
      modifiers,
      mechanism,
      priorSource,
      priorCount: 0, // no corpus data in v1
      confidence,
    };

    entries.push({
      codepoint: entry.codepoint,
      candidates: [candidate],
    });
  }

  const result: PlacementMap = { entries, pinnedPriorsVersion: PINNED_PRIORS_VERSION };

  // Omit optional fields when undefined so consumers can rely on field absence.
  if (map.source.locale != null) {
    result.bcp47Context = map.source.locale;
  }

  result.baseLayoutFamily = deriveBaseLayoutFamily(map.base.id);

  return result;
}
