/**
 * suggestMissing — deterministic, CLDR-grounded character-gap helper.
 *
 * Given a target BCP47 tag and a base keyboard's KeyboardIR, returns the
 * characters the language needs that the base does NOT already produce, split
 * into main (core alphabet) and auxiliary (loanword) tiers.
 *
 * Null vs. empty-arrays contract
 * --------------------------------
 * - null   => we are NOT very sure about the locale data; the UI should show a
 *             neutral "no verified data" state. We never emit guesses.
 * - non-null (possibly with empty arrays) => we are confident; the keyboard
 *   may simply cover all CLDR characters already.
 *
 * The confidence gate suppresses results (returns null) when:
 *   1. The BCP47 language subtag is "und" or the tag is script-only (no lang).
 *   2. The primary language subtag is in the ISO 639-3 private-use range
 *      (qaa-qtz), matched by /^q[a-t][a-z]$/.
 *   3. The tag is an un-narrowed macrolanguage (bare "ms", "zh", "ar", "fa"
 *      with no region or script suffix). A macrolanguage + region/script
 *      passes the gate. Note: "sw" (Swahili) is NOT gated — its members share
 *      the same Latin orthography/inventory, so CLDR "sw" exemplars are
 *      representative across member languages.
 *   4. loadExemplarsFromFull returns null (no CLDR locale match). We never fall
 *      back to SCRIPT_BLOCKS — that broad fallback is for the picker, not here.
 *   5. After letter-filtering, the main exemplar set is empty.
 *
 * Turkic case-folding caveat
 * ---------------------------
 * JS toUpperCase/toLowerCase mishandles the Turkic dotted-I system (i/I/ı/İ).
 * Case-fold suppression (exact-NFC-only matching) applies ONLY when the
 * effective script is Latin. Effective script = the explicit script subtag if
 * the tag carries one, otherwise the locale's default script. Default scripts:
 *   tr → Latn (suppressed), az → Latn (suppressed), kk → Cyrl (NOT suppressed).
 * For example, bare "kk" defaults to Cyrillic and uses normal JS case-fold;
 * "kk-Latn" is Latin-script Kazakh and suppresses case-fold.
 */

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { buildProducedSet } from "@keyboard-studio/contracts";
import type { CldrFullLoader } from "./cldr.js";
import { loadExemplarsFromFull } from "./cldr.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MissingCharSuggestions {
  bcp47: string;
  languageName?: string;
  /** CLDR main exemplar letters not produced by the base keyboard, NFC, ordered by codepoint. */
  main: string[];
  /** CLDR auxiliary (loanword) exemplar letters not produced by the base keyboard, NFC. */
  auxiliary: string[];
}

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

/**
 * Well-known macrolanguage primary subtags that are too broad to give confident
 * character suggestions when used without a region or script narrower.
 * Add entries here only for tags that have substantially different orthographies
 * across their member languages (i.e. where a single exemplar set would mislead).
 *
 * Note: "sw" (Swahili) is deliberately excluded from this set. Its member
 * languages (swh, swc, etc.) share the same Latin orthography and inventory,
 * so CLDR "sw" exemplars are representative — gating bare "sw" provides no
 * benefit and blocks valid character suggestions.
 */
const MACROLANGUAGE_SUBTAGS = new Set(["ms", "zh", "ar", "fa"]);

/**
 * Turkic locales for which JS case folding may be incorrect (dotted-I hazard).
 * The suppression only applies when the effective script is Latin — see
 * `effectiveScriptIsLatin()`. Default scripts: tr → Latn, az → Latn, kk → Cyrl.
 */
const TURKIC_LOCALES = new Set(["tr", "az", "kk"]);

/**
 * Default scripts for primaries in TURKIC_LOCALES.
 * Only consulted when the BCP47 tag carries no explicit script subtag.
 */
const TURKIC_DEFAULT_SCRIPT: Record<string, string> = {
  tr: "Latn",
  az: "Latn",
  kk: "Cyrl",
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract the primary language subtag from a BCP47 tag (everything before the
 * first hyphen, lowercased). Returns the whole tag if there is no hyphen.
 */
function primarySubtag(bcp47: string): string {
  const idx = bcp47.indexOf("-");
  return idx === -1 ? bcp47.toLowerCase() : bcp47.slice(0, idx).toLowerCase();
}

/**
 * Returns true when the BCP47 tag contains at least one subtag beyond the
 * primary language subtag (e.g. "zh-Hant", "ms-MY", "ar-MA").
 */
function hasSubtagNarrower(bcp47: string): boolean {
  return bcp47.indexOf("-") !== -1;
}

/**
 * Returns true when the primary language subtag matches the ISO 639-3
 * private-use range: qaa through qtz.
 */
function isPrivateUseSubtag(primary: string): boolean {
  return /^q[a-t][a-z]$/.test(primary);
}

/**
 * Returns true for the confidence gate: we refuse to produce suggestions and
 * return null instead, because the tag does not identify a specific language
 * with a reliable CLDR exemplar set.
 */
function failsConfidenceGate(bcp47: string): boolean {
  const primary = primarySubtag(bcp47);

  // "und" language subtag — explicitly undefined language
  if (primary === "und") return true;

  // Script-only tags such as "Latn" or "Arab" (no language subtag).
  // A script subtag is 4 characters with initial uppercase; if primary is
  // 4 chars and matches a script-subtag pattern, the tag is script-only.
  // In BCP47, primary language subtags are 2-3 alpha chars (ISO 639).
  // Any primary subtag longer than 3 chars that is not "und" is unusual;
  // we treat a 4-char initial-uppercase primary as a script subtag.
  if (/^[A-Z][a-z]{3}$/.test(bcp47.slice(0, 4)) && primary.length === 4) return true;

  // Private-use range (ISO 639-3 reservation: qaa-qtz)
  if (isPrivateUseSubtag(primary)) return true;

  // Un-narrowed macrolanguage (bare primary with no region/script suffix)
  if (MACROLANGUAGE_SUBTAGS.has(primary) && !hasSubtagNarrower(bcp47)) return true;

  return false;
}

/**
 * Filter an array of characters to those that are "letters" relevant for the
 * suggestion: non-ASCII (codepoint > U+007F) Unicode letters only.
 *
 * Rationale: CLDR exemplar specials already filter out ASCII a-z/A-Z (the
 * specials field in ExemplarResult contains only codepoint > 0x7F letters).
 * We mirror that filter here so we don't suggest plain ASCII letters which are
 * already universally available. Combining marks that stand alone (no base char
 * in the exemplar), whitespace, and punctuation are excluded by the \p{L} test.
 *
 * The anchored /^\p{L}$/u pattern intentionally rejects multi-codepoint strings.
 * CLDR main exemplar sets may contain bracketed digraph clusters such as {gb} or
 * {sh}; parseUnicodeSet records those in the `specials` array via the unanchored
 * /\p{L}/u test.  Digraphs are NOT single-character key suggestions, so the
 * anchored test here correctly excludes them from suggestMissingCharacters output.
 * Do NOT relax the anchor without also auditing every consumer of this function.
 */
function letterFilter(chars: string[]): string[] {
  return chars.filter(
    (ch) => (ch.codePointAt(0) ?? 0) > 0x7f && /^\p{L}$/u.test(ch),
  );
}

/**
 * Returns true when the BCP47 tag's effective script is Latin.
 *
 * Intended to be called only for primaries already in TURKIC_LOCALES — the
 * default-script fallback (step 2) only covers those primaries.
 *
 * Detection order:
 *   1. Look for an explicit 4-letter alpha script subtag in any position after
 *      the primary subtag (BCP47: variant subtags are >=5 chars or digit-led;
 *      a 4-alpha subtag here is a script code). Compare case-insensitively to
 *      "latn".
 *   2. If no explicit script subtag is present, fall back to TURKIC_DEFAULT_SCRIPT
 *      for the primary. This map is only consulted for primaries already in
 *      TURKIC_LOCALES, so every entry is covered.
 *
 * Pure function; no external state.
 *
 * @param bcp47   Full BCP47 tag as supplied by the caller.
 * @param primary Must equal primarySubtag(bcp47); only consulted for the
 *                default-script fallback — pass it rather than re-deriving.
 */
function effectiveScriptIsLatin(bcp47: string, primary: string): boolean {
  const parts = bcp47.split("-");
  // Skip the primary subtag (index 0) and look for a 4-letter alpha script subtag.
  // BCP47: variant subtags are >=5 chars or digit-led; a 4-alpha subtag is a script code.
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i]!;
    if (/^[A-Za-z]{4}$/.test(part)) {
      // Found an explicit script subtag.
      return part.toLowerCase() === "latn";
    }
  }
  // No explicit script subtag — use the locale default.
  // Unreachable in practice: every TURKIC_LOCALES primary has a TURKIC_DEFAULT_SCRIPT entry;
  // the ?? "Latn" is a defensive default only.
  const defaultScript = TURKIC_DEFAULT_SCRIPT[primary] ?? "Latn";
  return defaultScript.toLowerCase() === "latn";
}

/**
 * Returns true if the candidate character is considered "covered" by the
 * keyboard's produced set.
 *
 * For most locales: covered if the exact NFC form OR its case-folded counterpart
 * (toUpperCase / toLowerCase) is present in the produced set.
 *
 * For Latin-script Turkic locales (tr, az, kk-Latn, etc.): covered ONLY if the
 * exact NFC form is present, because JS case folding mishandles i / I /
 * dotless-i / dotted-I. Cyrillic-script Turkic (bare kk, kk-Cyrl, az-Cyrl)
 * uses normal case-fold — the dotted-I hazard is Latin-only.
 */
function isCovered(ch: string, produced: Set<string>, isTurkic: boolean): boolean {
  if (produced.has(ch)) return true;
  if (isTurkic) return false;
  // Case-fold check: uppercase or lowercase counterpart covers the candidate
  const upper = ch.toUpperCase();
  if (upper !== ch && produced.has(upper)) return true;
  const lower = ch.toLowerCase();
  if (lower !== ch && produced.has(lower)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the characters a target language needs that the given base keyboard
 * does not already produce, split into main (core alphabet) and auxiliary
 * (loanword) tiers sourced from CLDR.
 *
 * Returns null when the gate conditions above are not met (no verified data).
 * Returns a result with empty arrays when the keyboard already covers all CLDR
 * characters for the locale.
 *
 * @param args.bcp47        - BCP47 tag of the target language (e.g. "yo", "fr-CM").
 * @param args.baseIr       - Parsed KeyboardIR of the base keyboard being adapted.
 * @param args.loader       - CldrFullLoader (use createFetchCldrFullLoader()).
 * @param args.languageName - Optional human-readable name echoed into the result.
 */
export async function suggestMissingCharacters(args: {
  bcp47: string;
  baseIr: KeyboardIR;
  loader: CldrFullLoader;
  languageName?: string;
}): Promise<MissingCharSuggestions | null> {
  const { bcp47, baseIr, loader, languageName } = args;

  // --- Confidence gate ---
  if (failsConfidenceGate(bcp47)) return null;

  // --- Fetch CLDR exemplars ---
  const exemplars = await loadExemplarsFromFull(bcp47, loader);
  if (exemplars === null) return null;

  // --- Filter to letter candidates ---
  // We use the specials field (non-ASCII \p{L}) for main and auxiliarySpecials
  // for the loanword tier. These are already NFC-normalized by parseUnicodeSet.
  const mainCandidates = letterFilter(exemplars.specials);

  // Gate: empty main exemplar set after filtering => no confident data
  if (mainCandidates.length === 0) return null;

  const auxCandidates = letterFilter(exemplars.auxiliarySpecials);

  // --- Build the keyboard's produced set (NFC, deadkey-aware) ---
  const produced = buildProducedSet(baseIr);

  // --- Determine Turkic case-fold suppression ---
  // Suppression applies ONLY for Latin-script Turkic locales.
  // Bare "kk" defaults to Cyrillic and must NOT suppress case-fold.
  const primary = primarySubtag(bcp47);
  const isTurkic =
    TURKIC_LOCALES.has(primary) && effectiveScriptIsLatin(bcp47, primary);

  // --- Compute missing main characters ---
  const missingMain = mainCandidates
    .filter((ch) => !isCovered(ch, produced, isTurkic))
    .sort((a, b) => (a.codePointAt(0) ?? 0) - (b.codePointAt(0) ?? 0));

  // --- Compute missing auxiliary characters (exclude those already in main) ---
  const mainSet = new Set(mainCandidates);
  const missingAux = auxCandidates
    .filter((ch) => !mainSet.has(ch) && !isCovered(ch, produced, isTurkic))
    .sort((a, b) => (a.codePointAt(0) ?? 0) - (b.codePointAt(0) ?? 0));

  return {
    bcp47,
    ...(languageName !== undefined ? { languageName } : {}),
    main: missingMain,
    auxiliary: missingAux,
  };
}
