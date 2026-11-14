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

import { getAllRegions, type ILanguage } from "@ethnolib/find-language";
import type { LanguageSummary } from "@keyboard-studio/contracts";
import type { GlottologDialectRow } from "@keyboard-studio/glottolog/dialects";
import { loadLangtags } from "../../lib/langtagsDefaults.ts";
import { languageResultsFor, resolveTypedLanguage } from "../resolveTypedLanguage.ts";
import { MACROLANGUAGE_PARENT, defaultParentFor, dialectResultModifier, fold, isClose, makeDialectSearcher, rowsForTagset, type ChooserLanguage } from "./dialectSearch.ts";
import type { ChosenSummary } from "../chosenLanguage.ts";
import { plainText as plainTextOf } from "./LanguageCard.tsx";
import { findCountry, readTypedText, type DialectOf, type TypedReading } from "./readTypedText.ts";

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
  const results = languageResultsFor(text, modifier);
  const hit = resolveTypedLanguage(text, results);
  if (hit !== null) return summaryFor(hit, mod);
  return autoResolveBeyondName(text, results, readingsFor(text, modifier, mod), mod);
}

/**
 * The language, dialect and place readings of multi-word text (FR-039): the
 * chooser's close search for each language part, matched against that language's
 * dialects and the country table.
 */
export function readingsFor(text: string, modifier: ChooserModifier, mod: LangtagsMod): TypedReading[] {
  const regions = getAllRegions();
  const seen = new Map<string, ILanguage>();
  return readTypedText(
    text,
    (part) => {
      const q = fold(part);
      const close = languageResultsFor(part, modifier).filter((l) => l.uncoded === undefined && isClose(l, q));
      // A language the text names in full ("Achi") is kept ahead of those it only starts ("Achinese").
      const named = (l: ILanguage): boolean => [l.exonym, l.autonym, ...l.names].some((n) => fold(plainTextOf(n)) === q);
      const found = [...close.filter(named), ...close.filter((l) => !named(l))].slice(0, 3);
      for (const l of found) seen.set(l.iso639_3_code, l);
      return found;
    },
    (iso) => {
      const language = seen.get(iso);
      return language === undefined ? [] : dialectsOfLanguage(language, mod);
    },
    (part) => findCountry(part, regions),
  );
}

/** The summary a resolved reading stands for: its language with the dialect or region attached. */
export function readingSummary(reading: TypedReading, mod: LangtagsMod): ChosenSummary | null {
  const base = summaryFor(reading.language, mod);
  if (base === null) return null;
  const withMatch: ChosenSummary = reading.dialect !== undefined ? { ...base, match: reading.dialect } : base;
  return reading.region !== undefined
    ? { ...withMatch, extras: { region: { code: reading.region.code, source: "what you typed" } } }
    : withMatch;
}

/**
 * Resolve without a click (FR-042) beyond a language's own name: text that names
 * exactly one dialect, or has exactly one reading and that reading is resolved. An
 * unresolved reading never resolves by itself.
 */
export function autoResolveBeyondName(
  text: string,
  results: readonly ChooserLanguage[],
  readings: readonly TypedReading[],
  mod: LangtagsMod,
): LanguageSummary | null {
  const q = fold(text);
  const byDialect = results.filter((r) => r.uncoded === undefined && r.match !== undefined && fold(r.match.name) === q);
  if (byDialect.length === 1) return summaryFor(byDialect[0]!, mod);
  if (readings.length === 1 && readings[0]!.unresolved === undefined) return readingSummary(readings[0]!, mod);
  return null;
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

let glottologByIso: { rows: readonly GlottologDialectRow[]; map: Map<string, GlottologDialectRow[]> } | null = null;

/**
 * Every dialect the data knows for one language: its Glottolog dialects, its IANA
 * registered variants (by prefix) and its langtags variant and `-x-` tagsets. The
 * list the reading layer matches a typed remainder against, and the remainder
 * chooser's "one of these dialects".
 */
export function dialectsOfLanguage(language: ILanguage, mod: LangtagsMod): DialectOf[] {
  const subtag = (MACROLANGUAGE_PARENT[language.iso639_3_code.toLowerCase()] ?? language.languageSubtag).toLowerCase();
  const iso = language.iso639_3_code.toLowerCase();
  const out: DialectOf[] = [];
  if (glottologRows !== null) {
    if (glottologByIso === null || glottologByIso.rows !== glottologRows) {
      const map = new Map<string, GlottologDialectRow[]>();
      for (const r of glottologRows) {
        if (r.kind !== "dialect" || r.parentIso === undefined) continue;
        const list = map.get(r.parentIso) ?? [];
        list.push(r);
        map.set(r.parentIso, list);
      }
      glottologByIso = { rows: glottologRows, map };
    }
    for (const r of glottologByIso.map.get(iso) ?? []) {
      out.push({ name: r.name, match: { name: r.name, relation: "dialect", source: "glottolog", glottocode: r.glottocode, countries: r.countries } });
    }
  }
  for (const v of mod.allRegisteredVariants) {
    if (v.deprecated || !v.prefixes.includes(subtag)) continue;
    for (const d of v.descriptions) {
      out.push({ name: d, match: { name: d, relation: "variety", source: "iana", dialectTag: `${subtag}-${v.subtag}` } });
    }
  }
  for (const t of mod.allDialectTagsets) {
    if (t.language !== subtag && t.language !== iso) continue;
    for (const row of rowsForTagset(t)) {
      if (row.requires === undefined) out.push({ name: row.name, match: row.match });
    }
  }
  return out;
}
