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
 * Search languages by code, English name, or autonym (case-insensitive
 * substring / prefix matching).
 *
 * Ordering:
 *   1. Exact code match
 *   2. English name prefix match
 *   3. Autonym prefix match
 *   4. Substring match (code, English name, or autonym)
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

  const exactCode: LanguageSummary[] = [];
  const englishPrefix: LanguageSummary[] = [];
  const autonymPrefix: LanguageSummary[] = [];
  const substring: LanguageSummary[] = [];

  for (const lang of languagesRaw) {
    const code = lang.code.toLowerCase();
    const english = (lang.englishName ?? "").toLowerCase();
    const autonym = (lang.autonym ?? "").toLowerCase();

    if (code === q) {
      exactCode.push(lang);
      continue;
    }

    const engPre = english.startsWith(q);
    const autPre = autonym.length > 0 && autonym.startsWith(q);
    const sub =
      code.includes(q) ||
      english.includes(q) ||
      (autonym.length > 0 && autonym.includes(q));

    if (engPre) {
      englishPrefix.push(lang);
    } else if (autPre) {
      autonymPrefix.push(lang);
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
    ...substring.sort(byEnglish),
  ];
}
