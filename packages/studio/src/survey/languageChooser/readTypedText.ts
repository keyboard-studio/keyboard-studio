// readTypedText — multi-word language-field text read as a language plus a
// dialect, a place, or a remainder the author must classify (spec 115 R14,
// FR-039 to FR-042). Authors answer "what language?" with "Swiss French" or
// "Gascon Occitan"; the shared search scores the whole string and finds nothing.
//
// Pure: the language search, the dialect lists and the country table are passed
// in. Nothing typed is dropped silently: an unresolved remainder keeps its exact
// text (with its hyphens) and is sent to the remainder chooser.

import type { ILanguage, IRegion } from "@ethnolib/find-language";
import type { SearchMatch } from "@keyboard-studio/contracts";
import { fold } from "./dialectSearch.ts";
import { plainText } from "./LanguageCard.tsx";

export interface TypedReading {
  /** The close language match for the language part. */
  language: ILanguage;
  /** The text read as the language, as typed. */
  languagePart: string;
  /** FR-040 step 1. */
  dialect?: SearchMatch;
  /** FR-040 step 2. */
  region?: { code: string; name: string };
  /** FR-040 step 3: the remainder, as typed, sent to the remainder chooser. */
  unresolved?: string;
  /** English fallback of the reading's label; the chooser renders it from message ids. */
  label: string;
}

export interface DialectOf {
  name: string;
  match: SearchMatch;
}

interface Token {
  text: string;
  start: number;
  end: number;
}

/** Words of the text with their positions: split on spaces, hyphens, commas and parentheses. */
function tokenize(text: string): Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(/[^\s,()\-–—]+/gu)) {
    out.push({ text: m[0], start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }
  return out;
}

const wordsOf = (s: string): string[] => fold(s).split(/[^\p{L}\p{N}]+/u).filter((w) => w !== "");

/** The folded words of every name the language answers to. */
function languageWords(l: ILanguage): Set<string> {
  const names = [l.exonym, l.autonym, ...l.names].map((n) => plainText(n));
  return new Set(names.flatMap(wordsOf));
}

function stripWords(text: string, drop: ReadonlySet<string>): string {
  return wordsOf(text).filter((w) => !drop.has(w)).join(" ");
}

function spanText(text: string, tokens: readonly Token[]): string {
  return text.slice(tokens[0]!.start, tokens[tokens.length - 1]!.end);
}

/** The same dialect from two sources: the one with a ready tag leads, and keeps the other's Glottolog code and countries. */
function mergeMatches(a: SearchMatch, b: SearchMatch): SearchMatch {
  const [lead, other] = a.dialectTag === undefined && b.dialectTag !== undefined ? [b, a] : [a, b];
  return {
    ...lead,
    ...(lead.glottocode === undefined && other.glottocode !== undefined ? { glottocode: other.glottocode } : {}),
    ...(lead.countries === undefined && other.countries !== undefined ? { countries: other.countries } : {}),
  };
}

function labelFor(r: Omit<TypedReading, "label">): string {
  const name = plainText(r.language.exonym);
  const typed = fold(r.languagePart) === fold(name) ? "" : ` (${r.languagePart})`;
  if (r.dialect !== undefined) return `${name}${typed}, dialect: ${r.dialect.name}`;
  if (r.region !== undefined) return `${name}${typed}, region: ${r.region.name}`;
  return `${name}${typed}, plus “${r.unresolved ?? ""}”: choose what it is`;
}

/**
 * Read typed text. `closeLanguages` is the chooser's search keeping only close
 * results (merge rule); `dialectsOf` lists the dialects of one language by ISO
 * code; `countries` resolves an English country name or ISO 3166-1 code.
 */
export function readTypedText(
  text: string,
  closeLanguages: (part: string) => ILanguage[],
  dialectsOf: (iso: string) => readonly DialectOf[],
  countries: (part: string) => { code: string; name: string } | undefined,
): TypedReading[] {
  const tokens = tokenize(text);
  if (tokens.length < 2) return [];

  const readings: { reading: TypedReading; words: number; exact: boolean }[] = [];
  const byKey = new Map<string, { reading: TypedReading; words: number; exact: boolean }>();

  const add = (words: number, base: Omit<TypedReading, "label">): void => {
    const typedLanguage = fold(base.languagePart);
    const exact = [base.language.exonym, base.language.autonym, ...base.language.names].some((n) => fold(plainText(n)) === typedLanguage);
    // One reading per (language, dialect name or place or remainder): the same dialect listed by
    // the registry, langtags and Glottolog is one reading carrying what each of them knows.
    const key = [
      base.language.iso639_3_code,
      base.dialect !== undefined ? fold(base.dialect.name) : "",
      base.region?.code ?? "",
      base.unresolved !== undefined ? fold(base.unresolved) : "",
    ].join("|");
    const known = byKey.get(key);
    if (known !== undefined) {
      if (known.reading.dialect !== undefined && base.dialect !== undefined) {
        known.reading.dialect = mergeMatches(known.reading.dialect, base.dialect);
      }
      return;
    }
    const entry = { reading: { ...base, label: labelFor(base) }, words, exact };
    byKey.set(key, entry);
    readings.push(entry);
  };

  for (let k = 1; k < tokens.length; k++) {
    // The language part at the start (k words) or at the end (k words).
    const splits: { lang: Token[]; rest: Token[] }[] = [
      { lang: tokens.slice(0, k), rest: tokens.slice(k) },
      { lang: tokens.slice(tokens.length - k), rest: tokens.slice(0, tokens.length - k) },
    ];
    for (const { lang, rest } of splits) {
      if (rest.length === 0) continue;
      const languagePart = spanText(text, lang);
      const remainder = spanText(text, rest);
      const foldedRemainder = wordsOf(remainder).join(" ");
      for (const language of closeLanguages(languagePart)) {
        const drop = languageWords(language);
        // Words that are only the language's own name say nothing more about it.
        const ownName = new Set([language.exonym, language.autonym].flatMap((n) => wordsOf(plainText(n))));
        if (stripWords(remainder, ownName) === "") continue;
        const iso = language.iso639_3_code;
        const dialects = dialectsOf(iso).filter((d) => {
          const f = wordsOf(d.name).join(" ");
          return f === foldedRemainder || stripWords(d.name, drop) === foldedRemainder;
        });
        if (dialects.length > 0) {
          for (const d of dialects) add(lang.length, { language, languagePart, dialect: d.match });
          continue;
        }
        const country = countries(remainder);
        if (country !== undefined) {
          add(lang.length, { language, languagePart, region: country });
          continue;
        }
        add(lang.length, { language, languagePart, unresolved: remainder });
      }
    }
  }
  // A longer language part wins, then one that is a whole name of its language ("French", not
  // "Swiss" as the start of "Swiss German"); the sort is stable, so search order is kept otherwise.
  return readings.sort((a, b) => b.words - a.words || Number(b.exact) - Number(a.exact)).map((r) => r.reading);
}

/** An English country name or ISO 3166-1 alpha-2 code from the chooser's region table. */
export function findCountry(part: string, regions: readonly IRegion[]): { code: string; name: string } | undefined {
  const f = fold(part);
  if (f === "") return undefined;
  const hit = regions.find((r) => fold(r.name) === f) ?? regions.find((r) => r.code.toLowerCase() === f);
  return hit === undefined ? undefined : { code: hit.code, name: hit.name };
}

function sharedPrefix(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
}

/**
 * Countries whose name has a word sharing at least 3 leading letters with `word`,
 * longest shared prefix first (so "Swiss" finds Switzerland without demonym data).
 */
export function rankPlacesFor(word: string, regions: readonly IRegion[]): IRegion[] {
  const typed = wordsOf(word);
  const scored: { region: IRegion; score: number; order: number }[] = [];
  regions.forEach((region, order) => {
    const score = Math.max(0, ...wordsOf(region.name).flatMap((rw) => typed.map((w) => sharedPrefix(rw, w))));
    if (score >= 3) scored.push({ region, score, order });
  });
  return scored.sort((a, b) => b.score - a.score || a.order - b.order).map((s) => s.region);
}
