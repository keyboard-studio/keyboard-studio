// chooserSearch — the language chooser's search environment (spec 115).
//
// Builds the dialect searcher from the engine's langtags dialect tagsets (loaded
// with the langtags chunk) and, once a query of 3 or more characters has been
// typed, the Glottolog dialect rows (a separate lazy chunk, FR-037). Until the
// Glottolog rows load, only the langtags dialect names are searched.
//
// `summaryFor` maps a chooser result onto the langtags summary the identity
// resolution consumes (its code, region-variant flag, names): the contract's
// "map the ILanguage to the existing LanguageDefaults after macrolanguage
// mapping" step.

import type { ILanguage } from "@ethnolib/find-language";
import type { LanguageSummary } from "@keyboard-studio/contracts";
import type { GlottologDialectRow } from "@keyboard-studio/glottolog/dialects";
import { loadLangtags } from "../../lib/langtagsDefaults.ts";
import { languageResultsFor, resolveTypedLanguage } from "../resolveTypedLanguage.ts";
import { MACROLANGUAGE_PARENT, defaultParentFor, dialectResultModifier, makeDialectSearcher, type ChooserLanguage } from "./dialectSearch.ts";

export type ChooserModifier = (results: ILanguage[], searchString: string) => ChooserLanguage[];

/** Hard cap on the rows the chooser lists: the full language index is ~8,000 entries. */
export const MAX_CHOOSER_ROWS = 50;

/** The query length at which the Glottolog dialect chunk starts to load. */
export const GLOTTOLOG_LOAD_MIN_CHARS = 3;

type LangtagsMod = Awaited<ReturnType<typeof loadLangtags>>;

let glottologRows: readonly GlottologDialectRow[] | null = null;
let glottologLoading: Promise<void> | null = null;
let modifierCache: { mod: LangtagsMod; rows: readonly GlottologDialectRow[] | null; fn: ChooserModifier } | null = null;
const subscribers = new Set<() => void>();
let summaries: { mod: LangtagsMod; byCode: Map<string, LanguageSummary> } | null = null;

/** Called when the Glottolog rows land, so a mounted chooser re-merges its results. */
export function onDialectRowsLoaded(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

/** True once the Glottolog dialect rows are in memory. */
export function glottologLoaded(): boolean {
  return glottologRows !== null;
}

/**
 * Load the Glottolog dialect rows (idempotent). A literal dynamic import so the
 * bundler splits them into their own chunk.
 */
export function loadGlottologDialects(): Promise<void> {
  if (glottologLoading === null) {
    glottologLoading = import("@keyboard-studio/glottolog/dialects")
      .then((m) => {
        glottologRows = m.dialectRows;
        for (const cb of [...subscribers]) cb();
      })
      .catch((err: unknown) => {
        glottologLoading = null;
        throw err;
      });
  }
  return glottologLoading;
}

/** Start the Glottolog load when the query is long enough; a failed load degrades to the langtags dialect names. */
export function maybeLoadGlottolog(query: string): void {
  if (glottologRows === null && query.trim().length >= GLOTTOLOG_LOAD_MIN_CHARS) {
    loadGlottologDialects().catch(() => {});
  }
}

/** The merge modifier over the currently loaded dialect data. */
export function chooserModifier(mod: LangtagsMod): ChooserModifier {
  if (modifierCache === null || modifierCache.mod !== mod || modifierCache.rows !== glottologRows) {
    modifierCache = {
      mod,
      rows: glottologRows,
      fn: dialectResultModifier(makeDialectSearcher(glottologRows, mod.allDialectTagsets), defaultParentFor),
    };
  }
  return modifierCache.fn;
}

/** Load langtags (and, when asked, the Glottolog rows) and return the modifier: the headless path. */
export async function loadChooserModifier(options: { glottolog?: boolean } = {}): Promise<ChooserModifier> {
  const mod = await loadLangtags();
  if (options.glottolog === true) await loadGlottologDialects();
  return chooserModifier(mod);
}

/**
 * Resolve typed text to one langtags summary (or null), by the chooser's own rule:
 * EthnoLib's search with the dialect modifier merged in, then `resolveTypedLanguage`.
 * Synchronous search, so it costs a fraction of a second; the chooser uses it for a
 * value restored before the streamed results arrive, and the headless author uses it
 * as the product's resolution of a typed name.
 */
export async function resolveTypedEntry(text: string, options: { glottolog?: boolean } = {}): Promise<LanguageSummary | null> {
  const modifier = await loadChooserModifier(options);
  const mod = await loadLangtags();
  const hit = resolveTypedLanguage(text, languageResultsFor(text, modifier));
  return hit === null ? null : summaryFor(hit, mod);
}

/**
 * The langtags summary row for a chooser result, or null when langtags does not
 * know the language (identity resolution then clears its seeds, as for free text).
 * The summary carries the result's dialect `match`.
 */
export function summaryFor(lang: ILanguage, mod: LangtagsMod): LanguageSummary | null {
  if (summaries === null || summaries.mod !== mod) {
    summaries = { mod, byCode: new Map(mod.listLanguages().map((s) => [s.code, s])) };
  }
  const match = (lang as ChooserLanguage).match;
  // The chooser lists an individual language (`arb`, `cmn`) that langtags indexes
  // under its macrolanguage tag (`ar`, `zh`): try the code itself, then that tag.
  const candidates = [lang.languageSubtag, lang.iso639_3_code].flatMap((c) => {
    const lower = c.toLowerCase();
    const macro = MACROLANGUAGE_PARENT[lower];
    return macro !== undefined ? [lower, macro] : [lower];
  });
  for (const code of candidates) {
    const row = summaries.byCode.get(code);
    if (row !== undefined) return match !== undefined ? { ...row, match } : row;
    const defaults = mod.getLanguageDefaults(code);
    if (defaults !== null) {
      return {
        code: defaults.code,
        englishName: defaults.englishName ?? lang.exonym,
        ...(defaults.autonym !== undefined ? { autonym: defaults.autonym } : {}),
        ...(defaults.defaultScript !== undefined ? { defaultScript: defaults.defaultScript } : {}),
        ...(match !== undefined ? { match } : {}),
      };
    }
  }
  return null;
}
