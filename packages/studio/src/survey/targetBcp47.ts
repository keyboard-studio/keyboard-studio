// targetBcp47 — compose the BCP47 target tag from the identity-lite answers.
//
// Extracted from IdentityLite.tsx as a leaf, for the same reason
// identityLiteResult.ts was: the decision trail has to recompose the tag it
// attributes (spec 059 FR-010), and it must be able to do that without importing
// a survey step component. IdentityLite.tsx re-exports both functions, so every
// existing call site still names them there.

import { normalizeTargetScript } from "../lib/scriptAxes.ts";
import { getLoadedLangtags } from "../lib/langtagsDefaults.ts";

/**
 * Normalize a value from the `il_language_region` field into a shape-valid
 * BCP47 region subtag, or "" when it is not one.
 *
 * A well-formed BCP47 region subtag is either an ISO 3166-1 alpha-2 code (two
 * ASCII letters, canonically upper-case) or a UN M.49 area code (three
 * digits). The region question offers region CODES as datalist options, but
 * the field accepts free text — an author can type a region NAME ("Djibouti")
 * instead of picking the "DJ" code. Folding that verbatim into the tag would
 * produce an invalid BCP47 string ("aa-Latn-Djibouti"), so only a shape-valid
 * subtag is kept; anything else is dropped. This mirrors the script handling
 * in {@link buildTargetBcp47}, which omits a malformed subtag rather than emit
 * one.
 */
export function normalizeRegionSubtag(region: string): string {
  const reg = region.trim();
  if (/^[A-Za-z]{2}$/.test(reg)) return reg.toUpperCase();
  if (/^[0-9]{3}$/.test(reg)) return reg;
  return "";
}

/**
 * Whether `script` is the script langtags declares as `lang`'s default — the
 * suppress-script relationship BCP47 canonical form elides.
 *
 * Reads the ALREADY-RESOLVED module synchronously (see `getLoadedLangtags`):
 * this is a pure composer with no async seam, and an uncanonical tag is a better
 * failure than a composer that blocks on a fetch. Returns `false` when the
 * langtags chunk has not loaded this session (FR-011 keeps it lazy), which
 * composes the script subtag exactly as it did before this rule existed.
 */
function isSuppressedScript(lang: string, script: string): boolean {
  const defaultScript = getLoadedLangtags()?.getLanguageDefaults(lang)?.defaultScript;
  if (defaultScript === undefined || defaultScript === "") return false;
  return defaultScript.toLowerCase() === script.toLowerCase();
}

/**
 * Build the full BCP47 target tag from an ISO 639 language subtag and a raw
 * `il_target_script` value.
 *
 * Rules (language + script → BCP47):
 * - `lang` + plain script subtag (Latn/Deva/…) → `${lang}-${script}`, EXCEPT
 *   when that script is the language's default orthography in langtags, which
 *   the language subtag already implies — canonical BCP47 omits it.
 *   e.g. "ewo" + "Arab" → "ewo-Arab", but "ewo" + "Latn" → "ewo"
 * - `lang` + "romanization-Latn" → `${lang}-Latn`
 *   (Latn script implied; the fact it is a romanization is a strategy detail)
 * - `lang` + "fonipa" → `${lang}-fonipa`
 *   (Latin is implied by the variant; BCP47 omits the script subtag for fonipa)
 * - empty `lang` → "" (no BCP47; caller degrades to script-match ranking)
 *
 * An optional `region` subtag (from il_language_region, spec 030 US3) is folded
 * in at the BCP47 region position (language-script-region-variant). Empty region
 * (unambiguous or skipped) leaves the tag exactly as before. The region is
 * normalized to a shape-valid BCP47 region subtag first (see
 * {@link normalizeRegionSubtag}); malformed free text is dropped.
 *
 * @param languageSubtag  ISO 639 subtag from `il_language_code`, may be "".
 * @param targetScriptRaw Raw `il_target_script` value from the survey.
 * @param region          Optional region subtag from il_language_region, may be "".
 */
export function buildTargetBcp47(
  languageSubtag: string,
  targetScriptRaw: string,
  region = "",
): string {
  const lang = languageSubtag.trim();
  if (lang === "") return "";
  const reg = normalizeRegionSubtag(region);
  // BCP47 order: language-script-region-variant.
  if (targetScriptRaw === "fonipa") return [lang, reg, "fonipa"].filter((p) => p !== "").join("-");
  if (targetScriptRaw === "romanization-Latn") return [lang, "Latn", reg].filter((p) => p !== "").join("-");
  const { script } = normalizeTargetScript(targetScriptRaw);
  // "other" and empty string are not valid ISO-15924 subtags; omit the script
  // rather than emit the malformed "lang-other".
  const named = script === "" || script === "other" ? "" : script;
  // A named script that IS the language's default is implied by the language
  // subtag, so the canonical tag drops it: Latin is the Unicode default for
  // Ewondo, and a Latin Ewondo keyboard declares `ewo`, not `ewo-Latn`. A
  // non-default script stays explicit — `ewo-Arab` is the whole reason the
  // subtag position exists.
  const scriptPart = named !== "" && isSuppressedScript(lang, named) ? "" : named;
  return [lang, scriptPart, reg].filter((p) => p !== "").join("-");
}
