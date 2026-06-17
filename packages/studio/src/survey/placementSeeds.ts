// Adapter: PlacementMap -> getSeedValue seeds for Phase B (spec §8 step 4).
//
// SCOPE — what this adapter seeds and what it does NOT seed:
//
//   SEEDED: pb_special_letters_list
//     The PlacementMap's codepoints are "special letters" the seeder already
//     knows the language uses (that is why it proposed placements for them).
//     We convert each codepoint above the confidence threshold to its Unicode
//     character and join them with spaces — exactly the format pb_special_letters_list
//     expects ("ŋ Ŋ ɛ Ɛ ɔ Ɔ").
//
//   NOT SEEDED: placement data (vkey, modifiers per codepoint)
//     Phase B has NO question that asks "which key should character X go on."
//     The placement half of the PlacementMap has no landing slot in Phase B.
//     The YAML questions ask about character *inventory* (which characters exist),
//     not character *placement* (which key+modifier to use).  The vkey+modifiers
//     data belongs to a future Phase C / post-survey placement confirmation step
//     that is out of scope for v1.  Wiring placement into Phase B would require
//     a new question (a contract/spec change) — do not force it here.
//
// CONFIDENCE THRESHOLD: 0.5
//   Candidates with confidence < 0.5 are dropped from the seed.
//   0.5 is chosen as a conservative midpoint: it accepts anchor-backed candidates
//   (unicode-decomp / phonetic typically score ≥ 0.6 per the fixture) while
//   rejecting speculative or low-evidence entries.  The full candidate list is
//   always available to the user if they browse the character picker.
//
// STRATEGY ATTRIBUTION:
//   Each seeded entry is tagged with a strategyId (S-01 or S-08 via
//   strategyForCandidate).  This tag is render/attribution metadata ONLY.
//   It is NOT forwarded into the §7.2 StrategyRecommendation code path (D3).
//   SurveyRunner.getSeedValue returns a plain string; the strategyId is held
//   in PlacementSeedEntry (this module) and is surfaced to the UI as
//   attribution on the pre-fill chip.  It never flows into SurveyPhaseResult
//   or the strategy-selector input axes.
//
// CODEPOINT FORMAT:
//   PlacementEntry.codepoint is "U+XXXX" (uppercase hex).
//   We convert to the actual character via String.fromCodePoint.

import type { PlacementMap, PlacementEntry, PlacementCandidate } from "@keyboard-studio/contracts";
import { topCandidate, strategyForCandidate, parseUPlusNotation, toUPlusNotation } from "@keyboard-studio/contracts";
import type { StrategyId } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Confidence threshold
// ---------------------------------------------------------------------------

/**
 * Minimum confidence score for a candidate to be included in the Phase B seed.
 *
 * Candidates below this threshold are dropped from the seed entirely.
 * The threshold is applied per-codepoint: if the top candidate for a codepoint
 * falls below the threshold, that codepoint is not included in any seed.
 *
 * Value: 0.5 — accepts anchor-backed candidates (unicode-decomp / phonetic
 * typically ≥ 0.6 in the v1 fixture) while dropping speculative entries.
 */
export const PLACEMENT_SEED_CONFIDENCE_THRESHOLD = 0.5;

// ---------------------------------------------------------------------------
// Per-entry seed shape (attribution metadata, never forwarded to strategy)
// ---------------------------------------------------------------------------

/**
 * One seeded character with its attribution metadata.
 *
 * The strategyId is render-only attribution ("proposed by S-01 / S-08 seeder").
 * It is NOT an input to the §7.2 decision tree.  Consumers that surface it to
 * the user must not forward it into the StrategyRecommendation path (D3).
 */
export interface PlacementSeedEntry {
  /** The actual Unicode character (e.g. "ŋ"). */
  character: string;
  /** The codepoint in "U+XXXX" notation, for display / screen-reader use. */
  codepoint: string;
  /**
   * Attribution: which §7.3 strategy card the top candidate implies.
   * Render as a chip label ("S-01 proposal" / "S-08 proposal") to inform
   * the user why this character is being suggested.
   *
   * MUST NOT flow into StrategyRecommendation inputs (D3 scope guard).
   */
  strategyId: StrategyId;
  /**
   * The top candidate from the PlacementEntry — carried for display purposes
   * (e.g. showing the proposed key in an advisory chip), NOT for strategy input.
   */
  topCandidate: PlacementCandidate;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/**
 * Build a map from Phase B question id → seed value, derived from a
 * PlacementMap.  Only pb_special_letters_list is seeded in v1 — it receives
 * the space-joined characters for all PlacementMap entries whose top candidate
 * meets the confidence threshold.
 *
 * The return value is intended for use in a getSeedValue callback:
 *
 *   const seeds = buildPlacementSeeds(placementMap);
 *   const getSeedValue = (questionId: string) => seeds.get(questionId);
 *
 * @param placementMap  The seeder output from kbgen / the survey pipeline.
 * @param threshold     Confidence threshold below which candidates are dropped.
 *                      Defaults to PLACEMENT_SEED_CONFIDENCE_THRESHOLD (0.5).
 * @returns A Map from question id to seed string (only pb_special_letters_list
 *          in v1 when there are qualifying entries; empty Map otherwise).
 */
export function buildPlacementSeeds(
  placementMap: PlacementMap,
  threshold: number = PLACEMENT_SEED_CONFIDENCE_THRESHOLD,
): Map<string, string> {
  const seedEntries = extractSeedEntries(placementMap, threshold);

  const seeds = new Map<string, string>();

  if (seedEntries.length > 0) {
    const joined = seedEntries.map((e) => e.character).join(" ");
    seeds.set("pb_special_letters_list", joined);
  }

  return seeds;
}

/**
 * Return the full set of PlacementSeedEntry objects for entries that meet the
 * confidence threshold — one per qualifying codepoint.
 *
 * Useful for rendering attribution chips alongside the seeded pre-fill.
 *
 * @param placementMap  The seeder output.
 * @param threshold     Confidence threshold (default: 0.5).
 */
export function extractSeedEntries(
  placementMap: PlacementMap,
  threshold: number = PLACEMENT_SEED_CONFIDENCE_THRESHOLD,
): PlacementSeedEntry[] {
  const result: PlacementSeedEntry[] = [];

  for (const entry of placementMap.entries) {
    if (!qualifiesForSeed(entry, threshold)) continue;

    const top = topCandidate(entry);
    if (top === undefined) continue;

    const character = parseUPlusNotation(entry.codepoint);
    if (character === null) continue;

    result.push({
      character,
      codepoint: entry.codepoint,
      strategyId: strategyForCandidate(top),
      topCandidate: top,
    });
  }

  return result;
}

/**
 * Whether a PlacementEntry's top candidate meets the confidence threshold.
 * Entries with no candidates never qualify.
 */
function qualifiesForSeed(entry: PlacementEntry, threshold: number): boolean {
  const top = topCandidate(entry);
  return top !== undefined && top.confidence >= threshold;
}

// ---------------------------------------------------------------------------
// Single-character lookup
// ---------------------------------------------------------------------------

/**
 * Return the {@link PlacementSeedEntry} for a single character if the
 * PlacementMap contains a qualifying entry for it, or `null` otherwise.
 *
 * Use this when a UI component needs to check whether one specific character
 * already has a suggested placement (e.g. to decide whether to render a
 * pre-fill chip next to a character-picker item).
 *
 * @param char          The Unicode character to look up (must be a single
 *                      code point; callers are responsible for grapheme
 *                      segmentation).
 * @param placementMap  The seeder output from kbgen / the survey pipeline.
 * @param threshold     Confidence threshold below which the top candidate is
 *                      treated as absent.  Defaults to
 *                      {@link PLACEMENT_SEED_CONFIDENCE_THRESHOLD} (0.5).
 * @returns A {@link PlacementSeedEntry} if a qualifying entry exists, or
 *          `null` if the character is not in the map or its top candidate
 *          falls below the threshold.
 */
export function getSuggestionForChar(
  char: string,
  placementMap: PlacementMap,
  threshold = PLACEMENT_SEED_CONFIDENCE_THRESHOLD,
): PlacementSeedEntry | null {
  if (char.length === 0) return null;

  const codepoint = toUPlusNotation(char);

  const entry = placementMap.entries.find((e) => e.codepoint === codepoint);
  if (entry === undefined) return null;

  const candidate = topCandidate(entry);
  if (candidate === undefined || candidate.confidence < threshold) return null;

  return {
    character: char,
    codepoint,
    strategyId: strategyForCandidate(candidate),
    topCandidate: candidate,
  };
}
