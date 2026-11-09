// resolveTypedLanguage — which chooser entry a typed English name means, the
// rule the language field applies as the author types (lifted out of the old
// name picker, spec 107 FR-040, so the UI and the headless author resolve a
// typed name the same way). Generalised from the langtags summary to EthnoLib's
// `ILanguage` (spec 115 FR-038); the rule is unchanged:
//
//   - a UNIQUE primary-name (exonym) match resolves;
//   - several primary matches are ambiguous (null);
//   - with no primary match, a UNIQUE alternate-name match resolves, several are
//     ambiguous (null).
//
// Names compare after normalizeForCompare (NFC, lowercase) with the chooser's
// match markers removed, so NFC/NFD variants of one name are equal. Blank text
// resolves to nothing. `results` are the ranked matches the chooser listed for
// the text.

import { searchForLanguage, stripDemarcation, type ILanguage } from "@ethnolib/find-language";
import { normalizeForCompare } from "../lib/normalizeForCompare.ts";
import type { ChooserLanguage } from "./languageChooser/dialectSearch.ts";

const plain = (s: string | undefined): string => normalizeForCompare(stripDemarcation(s) ?? "");

export function resolveTypedLanguage<L extends ILanguage>(text: string, results: readonly L[]): L | null {
  const typed = normalizeForCompare(text);
  if (typed === "") return null;
  // The primary name takes precedence over aliases: a *unique* primary-name
  // match resolves even when the same text is also an alias of a different
  // entry, so alias resolution never turns a query that resolved by primary
  // name into an ambiguous null.
  const primary = results.filter((r) => plain(r.exonym) === typed);
  if (primary.length >= 1) return primary.length === 1 ? primary[0]! : null;
  const byAlias = results.filter((r) => r.names.some((n) => plain(n) === typed));
  return byAlias.length === 1 ? byAlias[0]! : null;
}

/**
 * The matches the language field lists for what is typed: EthnoLib's search,
 * with the dialect modifier merged in. Fewer than two characters list nothing,
 * as the chooser's own search does.
 */
export function languageResultsFor(
  text: string,
  modifier: (results: ILanguage[], searchString: string) => ChooserLanguage[],
): ChooserLanguage[] {
  const q = text.trim();
  if (q.length < 2) return [];
  return modifier(searchForLanguage(q), q);
}
