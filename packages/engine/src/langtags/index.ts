/**
 * Language-defaults lookup API for keyboard-studio.
 *
 * Provides synchronous, O(1) lookups over the checked-in slim index derived
 * from silnrsi/langtags.  No I/O, no network access, no host-disk writes.
 *
 * Generated index: packages/engine/src/langtags/generated/index.ts
 * Data model: specs/023-langtags-defaults/data-model.md
 * Contract:   specs/023-langtags-defaults/contracts/engine-langtags-api.md
 */

import type { LanguageDefaults, LanguageSummary } from "@keyboard-studio/contracts";
import { defaultsIndex, languages as languagesRaw } from "./generated/index.js";

/**
 * Look up the default orthography for a language subtag (2- or 3-letter,
 * case-insensitive).
 *
 * Returns `null` when the subtag is not in the dataset — callers must
 * handle the null case and never block user input on its absence (FR-009).
 *
 * @param subtag - BCP47 language subtag, e.g. `"ha"`, `"hau"`, `"HA"`.
 * @returns LanguageDefaults or null.
 */
export function getLanguageDefaults(subtag: string): LanguageDefaults | null {
  const key = subtag.toLowerCase();
  return (defaultsIndex as Record<string, LanguageDefaults>)[key] ?? null;
}

/**
 * Return all languages in the dataset as lightweight summaries.
 *
 * The list is sorted by `code` for determinism.  It is suitable for
 * the autocomplete language picker (FR-003).  Loaded lazily by the studio
 * as a separate chunk (FR-011); do not call at startup in the SPA.
 */
export function listLanguages(): readonly LanguageSummary[] {
  return languagesRaw;
}

/**
 * Search languages by code, English name (including alternate names), or
 * autonym (case-insensitive substring / prefix matching).
 *
 * "English name" covers EVERY recorded name — the primary `name` plus the
 * alternate `names[]` langtags records — so an author who knows their language
 * by an alternate name (e.g. "Abkhazian" for `ab`, whose primary is "Abkhaz")
 * still finds it. The slim summary carries only the primary name for display,
 * so the alternates are read from the full `defaultsIndex` record per language.
 *
 * Ordering:
 *   1. Exact code match
 *   2. Primary English name prefix match
 *   3. Autonym prefix match
 *   4. Alternate English name prefix match
 *   5. Substring match (code, any English name, or autonym)
 *
 * Ties within a tier are broken alphabetically by `englishName`.
 *
 * Returns `[]` for an empty query (never returns all languages —
 * use `listLanguages()` for that).
 *
 * @param query - Search string (case-insensitive). Empty string returns [].
 */
export function lookupByName(query: string): readonly LanguageSummary[] {
  if (!query) return [];

  const q = query.toLowerCase();
  const idx = defaultsIndex as Record<string, LanguageDefaults>;

  const exactCode: LanguageSummary[] = [];
  const englishPrefix: LanguageSummary[] = [];
  const autonymPrefix: LanguageSummary[] = [];
  const altPrefix: LanguageSummary[] = [];
  const substring: LanguageSummary[] = [];

  for (const lang of languagesRaw) {
    const code = lang.code.toLowerCase();
    const english = (lang.englishName ?? "").toLowerCase();
    const autonym = (lang.autonym ?? "").toLowerCase();
    // Alternate English names (langtags `names[]`) live on the full record, not
    // the slim summary. englishNames[0] is the primary, already covered above;
    // the rest are what makes an alternate-name search resolve.
    const altNames = (idx[code]?.englishNames ?? []).map((n) => n.toLowerCase());

    if (code === q) {
      exactCode.push(lang);
      continue;
    }

    const engPre = english.startsWith(q);
    const autPre = autonym.length > 0 && autonym.startsWith(q);
    const altPre = altNames.some((a) => a.startsWith(q));
    const sub =
      code.includes(q) ||
      english.includes(q) ||
      (autonym.length > 0 && autonym.includes(q)) ||
      altNames.some((a) => a.includes(q));

    if (engPre) {
      englishPrefix.push(lang);
    } else if (autPre) {
      autonymPrefix.push(lang);
    } else if (altPre) {
      altPrefix.push(lang);
    } else if (sub) {
      substring.push(lang);
    }
  }

  const byEnglish = (a: LanguageSummary, b: LanguageSummary) =>
    (a.englishName ?? "").localeCompare(b.englishName ?? "");

  return [
    ...exactCode.sort(byEnglish),
    ...englishPrefix.sort(byEnglish),
    ...autonymPrefix.sort(byEnglish),
    ...altPrefix.sort(byEnglish),
    ...substring.sort(byEnglish),
  ];
}
