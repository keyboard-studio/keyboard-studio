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
 * Map a confirmed language code to its canonical BCP47 primary language
 * subtag. RFC 5646 registers the shortest ISO 639 code, so a language with a
 * 2-letter code is tagged `ha`, never `hau`; langtags records carry that
 * canonical bare subtag as `.code`.
 *
 * Reads the ALREADY-RESOLVED module synchronously (see `getLoadedLangtags`).
 * A code with no langtags record (free text, or langtags not yet loaded) passes
 * through unchanged, as does a language whose canonical subtag is 3-letter.
 */
export function canonicalLanguageSubtag(code: string): string {
  const canonical = getLoadedLangtags()?.getLanguageDefaults(code)?.code;
  return canonical !== undefined && canonical !== "" ? canonical : code;
}

/**
 * Build the BCP47 target tag from an ISO 639 language subtag and a raw
 * `il_target_script` value, naming only what is not a default: the composition
 * is `minimalTag`'s (spec 115 R2), measured against the pinned langtags.
 *
 * Rules (language + script -> BCP47):
 * - `lang` + plain script subtag -> `lang-Script`, EXCEPT when that script is the
 *   language's default, which the language subtag already implies.
 *   e.g. "ewo" + "Arab" -> "ewo-Arab", but "ewo" + "Latn" -> "ewo"
 * - `lang` + "romanization-Latn" -> the Latn script part (dropped when it is the default)
 * - `lang` + "fonipa" -> the `fonipa` variant; no script part
 * - empty `lang` -> "" (no BCP47; caller degrades to script-match ranking)
 *
 * An optional `region` (from il_language_region) is folded in and dropped when it
 * is the default region of the tagset. Malformed free text is dropped (see
 * {@link normalizeRegionSubtag}). An optional `dialectSubtag` (a registered
 * variant, or `x-...` private use; empty until the dialect question) joins as a
 * variant or private-use part.
 *
 * Reads the ALREADY-RESOLVED langtags module synchronously (see
 * `getLoadedLangtags`); when it has not loaded this session (FR-011 keeps it
 * lazy) the parts are joined as given, with no default omitted.
 *
 * @param languageSubtag  ISO 639 subtag from `il_language_code`, may be "".
 * @param targetScriptRaw Raw `il_target_script` value from the survey.
 * @param region          Optional region subtag from il_language_region, may be "".
 * @param dialectSubtag   Optional dialect subtag, may be "".
 */
export function buildTargetBcp47(
  languageSubtag: string,
  targetScriptRaw: string,
  region = "",
  dialectSubtag = "",
): string {
  const rawLang = languageSubtag.trim();
  if (rawLang === "") return "";
  // Q3 confirms the 3-letter code; the assembled tag carries the canonical form.
  const lang = canonicalLanguageSubtag(rawLang);
  const reg = normalizeRegionSubtag(region);
  let script = "";
  const variants: string[] = [];
  const privateUse: string[] = [];
  if (targetScriptRaw === "fonipa") {
    variants.push("fonipa");
  } else if (targetScriptRaw === "romanization-Latn") {
    script = "Latn";
  } else {
    const { script: s } = normalizeTargetScript(targetScriptRaw);
    // "other" and empty string are not valid ISO-15924 subtags; omit the script
    // rather than emit the malformed "lang-other".
    script = s === "other" ? "" : s;
  }
  const dialect = dialectSubtag.trim();
  if (dialect !== "") {
    const parts = dialect.split("-");
    if (parts[0]?.toLowerCase() === "x") privateUse.push(...parts.slice(1));
    else variants.push(...parts);
  }
  const loaded = getLoadedLangtags();
  if (loaded === null || !/^[A-Za-z]{2,8}$/.test(lang)) {
    // Not yet loaded (or free text that is not a language subtag): join as given.
    const joined = [lang, script, reg, ...variants, ...(privateUse.length > 0 ? ["x", ...privateUse] : [])];
    return joined.filter((p) => p !== "").join("-");
  }
  return loaded.minimalTag({
    language: lang,
    ...(script !== "" ? { script } : {}),
    ...(reg !== "" ? { region: reg } : {}),
    variants,
    privateUse,
  });
}
