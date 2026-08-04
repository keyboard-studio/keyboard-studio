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

import type { PlacementMap, PlacementCandidate } from "@keyboard-studio/contracts";
import { topCandidate, strategyForCandidate, parseUPlusNotation, toUPlusNotation } from "@keyboard-studio/contracts";
import type { StrategyId } from "@keyboard-studio/contracts";
import { caseCounterpart } from "@keyboard-studio/engine";
import { isOrthographicallyUnicameral } from "../lib/casePairSuppression.ts";

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
    const top = topCandidate(entry);
    if (top === undefined || !(top.confidence >= threshold)) continue;

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

// ---------------------------------------------------------------------------
// Case-pair fallback: uppercase -> lowercase sibling's S-08 RALT candidate
// ---------------------------------------------------------------------------

/**
 * Like {@link getSuggestionForChar}, but when `char` has no qualifying
 * placement-map entry of its own AND `char` is the UPPERCASE half of a case
 * pair whose LOWERCASE sibling has a direct-mechanism RALT (S-08) candidate,
 * synthesizes an S-08 suggestion for `char` on the SAME vkey — the shifted
 * counterpart of the lowercase's RAlt layer (RAlt+Shift).
 *
 * Without this fallback, `getSuggestionForChar` returns `null` for the
 * uppercase sibling because the kbgen placement map only carries an entry
 * for the codepoint it was seeded for (typically the lowercase form) — the
 * uppercase codepoint simply has no map entry to look up.
 *
 * **No second casing path (spec 051 FR-002).** The only call to
 * `caseCounterpart` here derives the lowercase sibling to look up in the
 * map; the synthesized entry's `modifiers` are the sibling's `modifiers`
 * with `"SHIFT"` added — never a freshly-computed case mapping of anything
 * else. Every other required {@link PlacementCandidate} field (`vkey`,
 * `mechanism`, `priorSource`, `priorCount`, `confidence`) is carried over
 * unchanged from the lowercase sibling's top candidate: there is no
 * `PriorSource` value that describes "derived from a sibling's placement",
 * and adding one would be a locked-contract change (`packages/contracts`),
 * so this reuses the sibling's attribution as the closest honest fit.
 *
 * **Orthographic-unicameral suppression.** Skips the fallback (returns
 * `null`) for scripts where Unicode's formal case-pair mapping does not
 * correspond to a Shift-layer relationship in ordinary orthographic
 * practice (currently Georgian) — reuses the ONE predicate
 * `isOrthographicallyUnicameral` from `../lib/casePairSuppression.ts` (shared
 * with `casePairCompanion.ts`) rather than a second copy of the script test.
 *
 * @param char          The character to look up (typically the currently
 *                       displayed gallery character).
 * @param placementMap  The seeder output from kbgen / the survey pipeline.
 * @param threshold     Confidence threshold below which a candidate is
 *                       treated as absent. Defaults to
 *                       {@link PLACEMENT_SEED_CONFIDENCE_THRESHOLD} (0.5).
 * @param bcp47         Optional BCP47 tag for locale-sensitive case mapping,
 *                       forwarded to `caseCounterpart` unchanged. Pass
 *                       `undefined` for "no locale" (never `""` — callers
 *                       normalize an empty working-copy tag to `undefined`
 *                       the same way `useCasePairCompanion` does).
 * @returns A {@link PlacementSeedEntry} for `char`'s own qualifying entry if
 *          one exists; otherwise a synthesized S-08 entry derived from the
 *          lowercase sibling's S-08 RALT candidate if one exists; otherwise
 *          `null`.
 * @see spec.md §7.3 (S-08 RALT-layer extension)
 * @see casePairCompanion.ts (the shared case-pair proposal this mirrors on
 *      the physical-key path)
 */
// ---------------------------------------------------------------------------
// Ranked suggestions — up to 2 distinct-strategy candidates for a codepoint
// ---------------------------------------------------------------------------

/**
 * A character is a combining mark (`\p{M}`) — deadkey/store-index (S-02)
 * suggestions are suppressed for these codepoints (see
 * {@link getRankedSuggestionsForChar}): a combining mark is itself the
 * accent a deadkey composes onto a base letter, so proposing "deadkey to
 * produce this combining mark" is circular, not a placement suggestion.
 */
function isCombiningMark(char: string): boolean {
  return /^\p{M}$/u.test(char);
}

/**
 * Whether `candidate` qualifies to appear in a ranked-suggestions list for
 * `char`, at the given confidence `threshold`.
 *
 * An S-02 (deadkey/store-index) candidate additionally requires:
 *   - `char` is not itself a combining mark, and
 *   - the candidate carries a corpus-attested `baseLetter`.
 *
 * This is the ONLY gate a deadkey suggestion passes through — there is no
 * fallback that synthesizes a baseLetter from NFD decomposition or
 * script-level statistics.  A `"deadkey"`/`"store-index"` candidate with no
 * `baseLetter` is dropped, full stop.
 */
function qualifiesForRanking(
  char: string,
  candidate: PlacementCandidate,
  threshold: number,
): boolean {
  if (!(candidate.confidence >= threshold)) return false;
  const strategyId = strategyForCandidate(candidate);
  if (strategyId === "S-02") {
    if (isCombiningMark(char)) return false;
    if (candidate.baseLetter === undefined || candidate.baseLetter.length === 0) {
      return false;
    }
  }
  return true;
}

/**
 * Walk `candidates` (already best-first per the {@link PlacementEntry}
 * ordering invariant — see `topCandidate`) and collect up to 2 entries with
 * DISTINCT `strategyId`s, in candidate order.  This deliberately does NOT
 * re-sort by confidence — same rationale as `topCandidate`: ordering is the
 * producer's responsibility.
 */
function rankedEntriesFromCandidates(
  character: string,
  codepoint: string,
  candidates: PlacementCandidate[],
  threshold: number,
): PlacementSeedEntry[] {
  const result: PlacementSeedEntry[] = [];
  const seenStrategies = new Set<StrategyId>();

  for (const candidate of candidates) {
    if (result.length >= 2) break;
    if (!qualifiesForRanking(character, candidate, threshold)) continue;
    const strategyId = strategyForCandidate(candidate);
    if (seenStrategies.has(strategyId)) continue;
    seenStrategies.add(strategyId);
    result.push({ character, codepoint, strategyId, topCandidate: candidate });
  }

  return result;
}

/**
 * Ranked entries for `char`'s OWN placement-map entry (no case-pair
 * inheritance) — up to 2, distinct strategyIds, best-first.
 */
function rankedOwnEntries(
  char: string,
  placementMap: PlacementMap,
  threshold: number,
): PlacementSeedEntry[] {
  if (char.length === 0) return [];
  const codepoint = toUPlusNotation(char);
  const entry = placementMap.entries.find((e) => e.codepoint === codepoint);
  if (entry === undefined) return [];
  return rankedEntriesFromCandidates(char, codepoint, entry.candidates, threshold);
}

/**
 * Shift a LOWERCASE sibling's ranked entry into the UPPERCASE `char`'s own
 * suggestion, per mechanism:
 *
 *   - S-08 (RALT-layer) → add `"SHIFT"` to modifiers (existing behavior,
 *     same as {@link getSuggestionForCharWithCasePair}).
 *   - S-01 (key substitution) → add `"SHIFT"`, same vkey (the natural
 *     Shift-plane assignment of the same physical key).
 *   - S-02 (deadkey) → same mechanism/vkey/modifiers; `baseLetter` is
 *     replaced by its own case counterpart. Returns `null` if
 *     `caseCounterpart` cannot find one (the entry is skipped, not
 *     substituted with anything else).
 *
 * Every other {@link PlacementCandidate} field is carried over unchanged
 * from the lowercase sibling — same reasoning as
 * {@link getSuggestionForCharWithCasePair}: there is no `PriorSource` value
 * for "derived from a sibling's placement".
 */
function shiftEntryForUppercase(
  char: string,
  lowerEntry: PlacementSeedEntry,
  bcp47: string | undefined,
): PlacementSeedEntry | null {
  const lowerCandidate = lowerEntry.topCandidate;

  if (lowerEntry.strategyId === "S-08" || lowerEntry.strategyId === "S-01") {
    const modifiers = lowerCandidate.modifiers.includes("SHIFT")
      ? [...lowerCandidate.modifiers]
      : ["SHIFT", ...lowerCandidate.modifiers];
    const synthesized: PlacementCandidate = { ...lowerCandidate, modifiers };
    return {
      character: char,
      codepoint: toUPlusNotation(char),
      strategyId: strategyForCandidate(synthesized),
      topCandidate: synthesized,
    };
  }

  if (lowerEntry.strategyId === "S-02") {
    if (lowerCandidate.baseLetter === undefined) return null;
    const upperBase = caseCounterpart(lowerCandidate.baseLetter, bcp47);
    if (upperBase === null) return null;
    const synthesized: PlacementCandidate = {
      ...lowerCandidate,
      baseLetter: upperBase.counterpart,
    };
    return {
      character: char,
      codepoint: toUPlusNotation(char),
      strategyId: strategyForCandidate(synthesized),
      topCandidate: synthesized,
    };
  }

  return null;
}

/**
 * Return up to 2 ranked {@link PlacementSeedEntry} suggestions for `char`,
 * one per DISTINCT `strategyId`, ordered by the per-codepoint corpus
 * evidence already encoded in the entry's candidate order (best-first).
 *
 * **Case-pair inheritance (generalizes {@link getSuggestionForCharWithCasePair}
 * to the ranked list).** When `char` is the UPPERCASE half of a case pair
 * (via `caseCounterpart` — the ONLY casing source, spec 051 FR-002) and has
 * no qualifying entries of its own, this inherits the LOWERCASE sibling's
 * ranked entries verbatim (never re-deriving an independent uppercase
 * ranking) — see {@link shiftEntryForUppercase} for the per-mechanism shift.
 * The Georgian `isOrthographicallyUnicameral` suppression is preserved.
 *
 * **S-02 gating.** A deadkey/store-index entry appears only when the exact
 * codepoint (or, via inheritance, its lowercase sibling) has a
 * corpus-attested `baseLetter` — see {@link qualifiesForRanking}. Combining
 * marks (`\p{M}`) never receive an S-02 suggestion.
 *
 * @param char          The character to look up.
 * @param placementMap  The seeder/corpus output.
 * @param threshold     Confidence threshold below which a candidate is
 *                       treated as absent. Defaults to
 *                       {@link PLACEMENT_SEED_CONFIDENCE_THRESHOLD} (0.5).
 * @param bcp47         Optional BCP47 tag for locale-sensitive case mapping
 *                       (e.g. Turkic dotted/dotless I), forwarded to
 *                       `caseCounterpart` unchanged.
 * @returns 0–2 entries with distinct strategyIds, best-first.
 */
export function getRankedSuggestionsForChar(
  char: string,
  placementMap: PlacementMap,
  threshold: number = PLACEMENT_SEED_CONFIDENCE_THRESHOLD,
  bcp47?: string,
): PlacementSeedEntry[] {
  const own = rankedOwnEntries(char, placementMap, threshold);
  if (own.length > 0) return own;

  if (isOrthographicallyUnicameral(char)) return [];

  const pair = caseCounterpart(char, bcp47);
  if (pair === null || pair.direction !== "toLower") return [];

  const lowerEntries = rankedOwnEntries(pair.counterpart, placementMap, threshold);
  if (lowerEntries.length === 0) return [];

  const inherited: PlacementSeedEntry[] = [];
  for (const lowerEntry of lowerEntries) {
    const shifted = shiftEntryForUppercase(char, lowerEntry, bcp47);
    if (shifted !== null) inherited.push(shifted);
  }
  return inherited;
}

// ---------------------------------------------------------------------------
// Case-pair fallback: uppercase -> lowercase sibling's S-08 RALT candidate
// ---------------------------------------------------------------------------

export function getSuggestionForCharWithCasePair(
  char: string,
  placementMap: PlacementMap,
  threshold: number = PLACEMENT_SEED_CONFIDENCE_THRESHOLD,
  bcp47?: string,
): PlacementSeedEntry | null {
  const direct = getSuggestionForChar(char, placementMap, threshold);
  if (direct !== null) return direct;

  if (isOrthographicallyUnicameral(char)) return null;

  const pair = caseCounterpart(char, bcp47);
  if (pair === null || pair.direction !== "toLower") return null;

  const lowerEntry = getSuggestionForChar(pair.counterpart, placementMap, threshold);
  if (lowerEntry === null || lowerEntry.strategyId !== "S-08") return null;

  const lowerCandidate = lowerEntry.topCandidate;
  const modifiers = lowerCandidate.modifiers.includes("SHIFT")
    ? [...lowerCandidate.modifiers]
    : ["SHIFT", ...lowerCandidate.modifiers];

  const synthesizedCandidate: PlacementCandidate = {
    ...lowerCandidate,
    modifiers,
  };

  return {
    character: char,
    codepoint: toUPlusNotation(char),
    strategyId: strategyForCandidate(synthesizedCandidate),
    topCandidate: synthesizedCandidate,
  };
}
