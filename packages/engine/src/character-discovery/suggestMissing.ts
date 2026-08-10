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
 * JS toUpperCase/toLowerCase mishandles the Turkic dotted-I system: on a
 * Latin-script Turkic locale, 'i'.toUpperCase() should be 'İ' (dotted capital
 * I) and 'I'.toLowerCase() should be 'ı' (dotless i), but JS always folds
 * i <-> I and ı <-> I instead. The hazard is confined to exactly those four
 * characters — i (U+0069), I (U+0049), ı (U+0131), İ (U+0130) — so the
 * exact-NFC-only exception applies ONLY to that hazard set, not to every
 * character in the locale. Any other letter (e.g. "Ç"/"ç", "Ş"/"ş") still
 * case-folds normally on a Turkic locale; only i/I/ı/İ require an exact match.
 * The exception applies ONLY when the effective script is Latin. Effective
 * script = the explicit script subtag if the tag carries one, otherwise the
 * locale's default script. Default scripts:
 *   tr → Latn (suppressed), az → Latn (suppressed), kk → Cyrl (NOT suppressed).
 * For example, bare "kk" defaults to Cyrillic and uses normal JS case-fold;
 * "kk-Latn" is Latin-script Kazakh and suppresses case-fold for i/I/ı/İ only.
 */

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { buildProducedSet, scriptSubtagOf } from "@keyboard-studio/contracts";
import type { CldrFullLoader, ExemplarResult } from "./cldr.js";
import { loadExemplarsFromFull, parseUnicodeSet } from "./cldr.js";
import {
  inventoryToExemplarResult,
  isGatedTag,
  loadExemplarSource,
  neededCharsFromInventory,
  sourceExemplars,
} from "./exemplarSource.js";

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
 * Turkic locales for which JS case folding may be incorrect (dotted-I hazard).
 * The suppression only applies when the effective script is Latin — see
 * `effectiveScriptIsLatin()`. Default scripts: tr → Latn, az → Latn, kk → Cyrl.
 */
const TURKIC_LOCALES = new Set(["tr", "az", "kk"]);

/**
 * The dotted-I hazard set: the only four characters where JS's
 * toUpperCase/toLowerCase disagrees with Latin-script Turkic case pairing.
 * i (U+0069) and I (U+0049) are the ASCII pair; ı (U+0131, dotless i) and
 * İ (U+0130, dotted capital I) are the Turkic-specific pair. JS folds
 * i <-> I and ı <-> I, but Turkish pairs i <-> İ and ı <-> I — so within this
 * set, a JS fold is never trustworthy and only an exact (post-normalization)
 * match may declare coverage. Every other character folds normally even on
 * a Latin-script Turkic locale (see `isCovered`).
 */
const DOTTED_I_HAZARD = new Set(["i", "I", "ı", "İ"]);

/** Greek sigma forms: JS's 'Σ'.toLowerCase() yields only the medial form (σ),
 * never the final form (ς), even though both fold up to Σ. See `isCovered`.
 */
const GREEK_CAPITAL_SIGMA = "Σ"; // Σ
const GREEK_FINAL_SIGMA = "ς"; // ς (word-final lowercase)

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
 *   1. Look for an explicit script subtag via the shared scriptSubtagOf()
 *      helper (@keyboard-studio/contracts). Compare case-insensitively to
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
  const explicit = scriptSubtagOf(bcp47);
  if (explicit !== undefined) {
    return explicit.toLowerCase() === "latn";
  }
  // No explicit script subtag — use the locale default.
  // Unreachable in practice: every TURKIC_LOCALES primary has a TURKIC_DEFAULT_SCRIPT entry;
  // the ?? "Latn" is a defensive default only.
  const defaultScript = TURKIC_DEFAULT_SCRIPT[primary] ?? "Latn";
  return defaultScript.toLowerCase() === "latn";
}

/**
 * The two normalization forms the carve-comparison seam chooses between,
 * driven by the marks series' whole-keyboard output-form decision (see
 * `marks/output-form-policy.ts`'s `normalizationFormForOutputForm`).
 * Deliberately narrower than the full `NFC | NFD | NFKC | NFKD` union
 * `String.prototype.normalize` accepts — compatibility (K) forms are never
 * an authoring output-form choice here.
 */
export type CharNormalizationForm = "NFC" | "NFD";

/**
 * Returns true if the candidate character is considered "covered" by the
 * keyboard's produced set.
 *
 * Covered if the exact form (per `form`) OR its case-folded counterpart
 * (toUpperCase / toLowerCase) is present in the produced set — EXCEPT for the
 * dotted-I hazard set (i / I / ı / İ, see `DOTTED_I_HAZARD`) on a Latin-script
 * Turkic locale (tr, az, kk-Latn, etc.), where JS's fold disagrees with
 * Turkic case pairing: those four characters require an exact match only,
 * and do NOT fold into each other. Every other character on a Turkic locale
 * (e.g. "Ç"/"ç") still folds normally — the exception is narrow, not a
 * blanket suppression for the whole locale. Cyrillic-script Turkic (bare kk,
 * kk-Cyrl, az-Cyrl) is not Latin-script, so `isTurkic` is false for it and
 * normal case-fold applies throughout, including to its "i" letter.
 *
 * Also treats Greek's two lowercase sigma forms — σ (medial, U+03C3) and ς
 * (final, U+03C2) — as mutually covering Σ: both uppercase to Σ, but JS's
 * 'Σ'.toLowerCase() yields only σ, so an author who entered only the final
 * form ς would otherwise see Σ reported as uncovered.
 *
 * `ch` is normalized to `form` before every comparison (idempotent if the
 * caller already normalized it). `produced` is NOT re-normalized here — the
 * caller is responsible for having built it in the SAME `form` (this is the
 * "apples to apples" contract the carve gallery comparison depends on; see
 * `isCharCoveredForLocale`'s doc). Case-folding (G5, the narrowed Turkic-aware
 * exception, and the Greek sigma equivalence) always runs IN ADDITION to
 * normalization, never instead of it.
 */
function isCovered(ch: string, produced: Set<string>, isTurkic: boolean, form: CharNormalizationForm = "NFC"): boolean {
  const normalized = ch.normalize(form);
  if (produced.has(normalized)) return true;
  // Dotted-I hazard: within this set only, a JS case-fold is untrustworthy on
  // a Latin-script Turkic locale, so only the exact-match check above counts.
  if (isTurkic && DOTTED_I_HAZARD.has(normalized)) return false;
  // Case-fold check: uppercase or lowercase counterpart covers the candidate
  const upper = normalized.toUpperCase();
  if (upper !== normalized && produced.has(upper)) return true;
  const lower = normalized.toLowerCase();
  if (lower !== normalized && produced.has(lower)) return true;
  // Greek sigma equivalence: Σ is covered by EITHER lowercase form (σ or ς);
  // the `lower` check above already covers Σ via σ (JS's default fold), so
  // this only needs to add the final form ς that JS's fold misses.
  if (normalized === GREEK_CAPITAL_SIGMA && produced.has(GREEK_FINAL_SIGMA)) {
    return true;
  }
  return false;
}

/**
 * Returns true when `bcp47` is a Latin-script Turkic locale, i.e. when
 * `isCovered`'s narrow dotted-I hazard exception (i/I/ı/İ require an exact
 * match; every other character still case-folds normally — see the module
 * docstring) applies. Exposed so callers outside this module (e.g. the
 * studio's surplus-recommendation pass, #525 items 2/4) can reuse the exact
 * same exception-aware fold that `isCovered`/`suggestMissingCharacters`
 * already use, rather than re-deriving a naive `toLowerCase()` comparison
 * that would mis-handle Turkic i/İ/ı/I.
 */
export function isTurkicCaseFoldSuppressed(bcp47: string): boolean {
  const primary = primarySubtag(bcp47);
  return TURKIC_LOCALES.has(primary) && effectiveScriptIsLatin(bcp47, primary);
}

/**
 * Returns true when `ch` is covered by `coveringSet` under the same
 * exception-aware case fold `isCovered` uses internally — exact match (in
 * `form`), or its uppercase/lowercase counterpart (Greek sigma's final form
 * ς included), except for the narrow Turkic dotted-I hazard set (i/I/ı/İ on
 * a Latin-script Turkic locale), which requires an exact match only.
 *
 * Exported for the studio's language-driven surplus signal (#525 items 2/4):
 * a keyboard-produced character should count as "needed" if it case-folds
 * to a CLDR exemplar, even though CLDR exemplars are lowercase-only (e.g.
 * French keyboard produces "É"; CLDR needed-set has "é"). Reuses `isCovered`
 * directly rather than re-deriving the fold, so the Turkic exception stays
 * in exactly one place.
 *
 * `form` (default "NFC", preserving pre-existing behavior) selects the
 * normalization form `ch` is compared under — additive, so 3-argument call
 * sites are unaffected. **Contract:** `coveringSet` must already be
 * normalized to the SAME `form` by the caller; this function normalizes
 * `ch` but does not re-normalize `coveringSet` per lookup (it can be a large
 * set checked many times — the carve gallery normalizes it once at
 * construction, not on every membership test). Passing a `coveringSet` in a
 * different form than `form` silently breaks the "apples to apples"
 * comparison this parameter exists to guarantee — see the carve-gallery
 * callers (`packages/studio/src/lib/irToCarveNodes.ts`) for the intended
 * usage. Normalization is applied IN ADDITION to the Turkic-aware case fold
 * below (G5), never instead of it.
 */
export function isCharCoveredForLocale(
  ch: string,
  coveringSet: ReadonlySet<string>,
  bcp47: string,
  form: CharNormalizationForm = "NFC",
): boolean {
  return isCovered(ch, coveringSet as Set<string>, isTurkicCaseFoldSuppressed(bcp47), form);
}

// ---------------------------------------------------------------------------
// Sourcing seam
// ---------------------------------------------------------------------------

/**
 * Resolves a locale's exemplars through the SINGLE sourcing path (FR-015).
 *
 * With no `loader`, this reads the committed offline index — CLDR *and* SLDR,
 * no network. Passing a `loader` selects the legacy live-CLDR path, which is
 * now a test-injection seam and an opt-in live-refresh route rather than the
 * authoring path; every existing caller and test keeps working unchanged.
 *
 * Both paths run the SAME gate — `exemplarSource.ts`'s `isGatedTag` — but with
 * different sources, and that is where the one deliberate divergence lives: the
 * live path asks it as `"cldr"`, while the offline path defers to
 * `sourceExemplars`, which asks per-source and so lets an SLDR-backed
 * `qaa`-`qtz` tag through (research R7). Gating those would discard exactly the
 * minority-language coverage this feature exists to deliver.
 */
async function resolveExemplars(
  bcp47: string,
  loader: CldrFullLoader | undefined,
): Promise<ExemplarResult | null> {
  if (loader !== undefined) {
    if (isGatedTag(bcp47, "cldr")) return null;
    return loadExemplarsFromFull(bcp47, loader);
  }
  await loadExemplarSource();
  const inv = sourceExemplars(bcp47);
  return inv === null ? null : inventoryToExemplarResult(inv);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the characters a target language needs that the given base keyboard
 * does not already produce, split into main (core alphabet) and auxiliary
 * (loanword) tiers.
 *
 * Returns null when the gate conditions above are not met (no verified data).
 * Returns a result with empty arrays when the keyboard already covers all CLDR
 * characters for the locale.
 *
 * @param args.bcp47        - BCP47 tag of the target language (e.g. "yo", "fr-CM").
 * @param args.baseIr       - Parsed KeyboardIR of the base keyboard being adapted.
 * @param args.loader       - Optional. Omit for the offline index (the authoring
 *                            path); pass a CldrFullLoader for live CLDR refresh
 *                            or test injection.
 * @param args.languageName - Optional human-readable name echoed into the result.
 */
export async function suggestMissingCharacters(args: {
  bcp47: string;
  baseIr: KeyboardIR;
  loader?: CldrFullLoader;
  languageName?: string;
}): Promise<MissingCharSuggestions | null> {
  const { bcp47, baseIr, loader, languageName } = args;

  const exemplars = await resolveExemplars(bcp47, loader);
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

/**
 * Returns the full set of characters a target language needs, per CLDR —
 * i.e. the exemplar characters themselves (main + auxiliary tiers), not the
 * subset missing from any particular keyboard. This is the "needed" signal
 * for language-driven surplus detection (issue #525 items 2/4): a keyboard
 * character NOT in this set (and not otherwise confirmed by the author) is a
 * candidate for removal.
 *
 * Reuses cldr.ts's existing fetch/parse (loadExemplarsFromFull) rather than
 * re-deriving CLDR access — sibling to suggestMissingCharacters, which reuses
 * the same loader for the complementary "what's missing" question.
 *
 * Unlike suggestMissingCharacters's `main`/`auxiliary` fields (which are
 * filtered to non-ASCII \p{L} "specials" — the letter-suggestion audience),
 * this returns the RAW exemplar sets (ExemplarResult.used + .auxiliary),
 * which for most scripts already include the ASCII range (e.g. Latin
 * "a-z") — the full inventory a language actually needs, not just the
 * gap-filling suggestions.
 *
 * Returns null on the same confidence-gate conditions suggestMissingCharacters
 * uses for its first four gates — und/script-only tag, ISO 639-3 private-use
 * primary (qaa-qtz), un-narrowed macrolanguage (bare "ms"/"zh"/"ar"/"fa"), or
 * no CLDR locale match for the tag. (The fifth gate — empty main exemplar set
 * after \p{L}-filtering — is specific to the letter-suggestion audience and
 * does not apply here: the raw exemplar set legitimately covers ASCII-only
 * scripts.) All characters are NFC-normalized, matching the rest of this module.
 */
export async function neededCharsForLanguage(args: {
  bcp47: string;
  loader?: CldrFullLoader;
}): Promise<Set<string> | null> {
  const { bcp47, loader } = args;

  // Offline path (the authoring path): the sourced inventory already carries
  // all four tiers, so the union is just its character list.
  if (loader === undefined) {
    await loadExemplarSource();
    const inv = sourceExemplars(bcp47);
    return inv === null ? null : neededCharsFromInventory(inv);
  }

  // Live-CLDR path, so the gate is asked as "cldr" — see `resolveExemplars`.
  if (isGatedTag(bcp47, "cldr")) return null;

  // Fetch the raw pair directly (rather than going through
  // loadExemplarsFromFull, which only parses main+auxiliary) so the
  // punctuation/numbers tiers below don't require a second network round
  // trip for the same locale.
  const pair = await loader(bcp47);
  if (pair === null) return null;

  const needed = new Set(parseUnicodeSet(pair.main).used);
  if (pair.auxiliary !== null) {
    for (const ch of parseUnicodeSet(pair.auxiliary).used) needed.add(ch);
  }
  // Punctuation + numbers exemplar tiers (#525 fix — over-removal): locale
  // punctuation (French "« »") and locale digits (Persian Eastern-Arabic-Indic
  // "۰۱۲…") are needed characters too, not just the letter tiers, so they
  // must be protected from the language-driven surplus signal.
  if (pair.punctuation !== null) {
    for (const ch of parseUnicodeSet(pair.punctuation).used) needed.add(ch);
  }
  if (pair.numbers !== null) {
    for (const ch of parseUnicodeSet(pair.numbers).used) needed.add(ch);
  }

  return needed;
}
