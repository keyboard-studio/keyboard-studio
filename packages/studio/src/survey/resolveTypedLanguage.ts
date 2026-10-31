// resolveTypedLanguage — which langtags entry a typed English name means, the
// rule the name picker applies as the author types (lifted out of
// QuestionField's LangtagsComboboxField, spec 107 FR-040, so the UI and the
// headless author resolve a typed name the same way).
//
//   - a UNIQUE primary English-name match resolves;
//   - several primary matches are ambiguous (null);
//   - with no primary match, a UNIQUE alternate-name match resolves, several are
//     ambiguous (null).
//
// Names compare after normalizeForCompare, so NFC/NFD variants of one name are
// equal. Blank text resolves to nothing. `results` are the ranked matches the
// picker's lookup returned for the text.

import type { LanguageSummary } from "@keyboard-studio/contracts";
import { normalizeForCompare } from "../lib/normalizeForCompare.ts";

/**
 * @param altNamesFor Alternate English names of an entry (langtags aliases, e.g.
 *   "Otuo" for Ghotuo); they live on the entry's defaults, not on the summary row.
 */
export function resolveTypedLanguage(
  text: string,
  results: readonly LanguageSummary[],
  altNamesFor: (code: string) => readonly string[] | undefined,
): LanguageSummary | null {
  const typed = normalizeForCompare(text);
  if (typed === "") return null;
  // Match the primary English name OR any alternate English name so a
  // resolvable alias seeds downstream fields, not just the canonical name.
  const primaryMatch = (r: LanguageSummary): boolean => normalizeForCompare(r.englishName ?? "") === typed;
  const aliasMatch = (r: LanguageSummary): boolean =>
    altNamesFor(r.code)?.some((n) => normalizeForCompare(n) === typed) ?? false;

  // The primary English name takes precedence over aliases: a *unique*
  // primary-name match resolves even when the same text is also an alias of a
  // different entry. This keeps alias resolution strictly additive — it never
  // turns a query that previously auto-resolved (by primary name) into an
  // ambiguous null. Aliases decide only when no single primary name matches.
  const primary = results.filter(primaryMatch);
  if (primary.length >= 1) {
    // >1 primary match is genuinely ambiguous by canonical name alone → null.
    return primary.length === 1 ? primary[0]! : null;
  }
  // No primary-name match: fall back to aliases. An alias shared by >1 entry
  // stays ambiguous (null), same as an ambiguous primary name.
  const byAlias = results.filter(aliasMatch);
  return byAlias.length === 1 ? byAlias[0]! : null;
}

/**
 * The matches the name picker lists for what is typed: ranked name matches for
 * non-blank text, the full language list for blank text. `mod` is the loaded
 * langtags module.
 */
export function languageResultsFor<R>(
  mod: { lookupByName: (text: string) => R; listLanguages: () => R },
  text: string,
): R {
  return text.trim() ? mod.lookupByName(text) : mod.listLanguages();
}
