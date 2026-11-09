// dialectSearch — the dialect-aware layer over EthnoLib's language search
// (spec 115, contracts/dialect-search-and-question.md).
//
// EthnoLib finds a language by its own names (and by a few langtags names). It
// does not know Glottolog dialects, and for langtags dialect tagsets it finds
// the parent without saying which tagset matched. This module adds both:
//
//   makeDialectSearcher     an EthnoLib `LanguageSearcher` over Glottolog dialect
//                           rows and the langtags variant / `-x-` tagsets;
//   dialectResultModifier   merges its hits into the chooser's result list (the
//                           contract's merge rule) and attaches a `match` to each
//                           parent row, so a card can say "why it matched".
//
// The merge rule uses only the query and each result's names: EthnoLib's
// `searchResultModifier` receives a flat list with no tier information. The
// function is pure on its input; the chooser runs it over the accumulated
// results, so re-running it as more tiers stream in is idempotent.

import {
  LanguageSearcher,
  LanguageType,
  defaultSearchResultModifier,
  getLanguageBySubtag,
  stripDemarcation,
  type ILanguage,
} from "@ethnolib/find-language";
import type { DialectTagset, SearchMatch } from "@keyboard-studio/contracts";
import type { GlottologDialectRow } from "@keyboard-studio/glottolog/dialects";

/**
 * A Glottolog language or dialect with no ISO 639-3 code (spec 115 FR-043). It is
 * a chooser row of its own: there is no parent language to resolve.
 */
export interface UncodedInfo {
  kind: "uncoded-language" | "uncoded-dialect";
  /** Glottolog's name for the row (the language, or the dialect). */
  name: string;
  glottocode: string;
  countries: string[];
  /** "uncoded-dialect": the language (which has no ISO code) and its code. */
  parentName?: string;
  parentGlottocode?: string;
}

/** The chooser result type with the optional dialect match attached. */
export type ChooserLanguage = ILanguage & { match?: SearchMatch; uncoded?: UncodedInfo };

/** One searchable dialect name (either source), pointing at its parent language. */
export interface DialectRow {
  /** Unique id: the searcher de-duplicates on it. */
  id: string;
  /** The display name of the dialect, e.g. "Gascon". */
  name: string;
  /** NFD, marks dropped, lowercased: the field that is searched. */
  folded: string;
  /** ISO 639-3 (Glottolog) or langtags language subtag of the parent. */
  parent: string;
  /** Glottolog language name of the parent when known; used by the fallback row only. */
  parentName?: string;
  match: SearchMatch;
  /** Set for a Glottolog row with no ISO code: the row stands for itself, with no parent. */
  uncoded?: UncodedInfo;
  /** Folded dialect words a query must contain for this row to count (a "<language> <dialect>" row). */
  requires?: string;
}

/** Fold for comparison: NFD, combining marks dropped, lowercase. */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

/** ISO 639-3 macrolanguage representatives the chooser lists under their two-letter tag. */
export const MACROLANGUAGE_PARENT: Readonly<Record<string, string>> = { cmn: "zh", arb: "ar" };

function titleCase(words: string): string {
  return words.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

/** Rows for one langtags variant or `-x-` tagset: its dialect-specific names. */
export function rowsForTagset(t: DialectTagset): DialectRow[] {
  const subtagWords = t.dialectSubtag.replace(/^x-/, "").replace(/-/g, " ");
  const subtagFolded = fold(subtagWords);
  const relation: SearchMatch["relation"] = t.dialectSubtag.startsWith("x-") ? "dialect" : "variety";
  const base = (name: string): DialectRow => ({
    id: `lt:${t.tag}:${name}`,
    name,
    folded: fold(name),
    parent: t.language,
    match: { name, relation, source: "langtags", dialectTag: t.tag },
  });
  const rows: DialectRow[] = [base(titleCase(subtagWords))];
  // Names that carry the dialect's own word ("Achi - Rabinal", "Valencian"), not
  // the plain language names every tagset of the language repeats.
  for (const n of t.names) {
    const f = fold(n);
    if (f === subtagFolded) continue;
    if (subtagFolded.length >= 3 && f.includes(subtagFolded)) rows.push(base(n));
  }
  // A dialect word that is too generic to find the tagset by itself ("Central",
  // "East") is also indexed with the language's first name: "Kaqchikel Central".
  if (rows.length === 1 && t.names[0] !== undefined) {
    // Without `requires`, the plain language name ("Kaqchikel") would match this row.
    rows.push({ ...base(`${t.names[0]} ${titleCase(subtagWords)}`), requires: subtagFolded });
  }
  return rows;
}

function rowForGlottolog(r: GlottologDialectRow): DialectRow | null {
  if (r.kind !== "dialect") {
    return {
      id: `gl:${r.glottocode}`,
      name: r.name,
      folded: r.folded,
      parent: "",
      match: { name: r.name, relation: "dialect", source: "glottolog", glottocode: r.glottocode, countries: r.countries },
      uncoded: {
        kind: r.kind,
        name: r.name,
        glottocode: r.glottocode,
        countries: r.countries,
        ...(r.parentName !== undefined ? { parentName: r.parentName } : {}),
        ...(r.parentGlottocode !== undefined ? { parentGlottocode: r.parentGlottocode } : {}),
      },
    };
  }
  if (r.parentIso === undefined) return null;
  return {
    id: `gl:${r.glottocode}`,
    name: r.name,
    folded: r.folded,
    parent: r.parentIso,
    match: { name: r.name, relation: "dialect", source: "glottolog", glottocode: r.glottocode, countries: r.countries },
  };
}

/**
 * An EthnoLib searcher over Glottolog dialects and langtags variant / `-x-`
 * tagsets. `glottologRows` is null until the lazy Glottolog chunk loads; until
 * then only the langtags rows are searched.
 */
export function makeDialectSearcher(
  glottologRows: readonly GlottologDialectRow[] | null,
  langtagsDialects: readonly DialectTagset[],
): LanguageSearcher {
  const rows: DialectRow[] = [];
  for (const t of langtagsDialects) rows.push(...rowsForTagset(t));
  if (glottologRows !== null) {
    for (const g of glottologRows) {
      const row = rowForGlottolog(g);
      if (row !== null) rows.push(row);
    }
  }
  return new LanguageSearcher(
    rows,
    (r: DialectRow) => r.id,
    ["folded"],
    ["folded"],
    {},
    (r: DialectRow) => ({ ...r, folded: ` ${r.folded} ` }),
  );
}

// --- merge rule --------------------------------------------------------------

const PLAIN = (s: string | undefined): string => fold(stripDemarcation(s) ?? "");

/** Every searchable name of a chooser result, folded and with match markers removed. */
function namesOf(l: ILanguage): string[] {
  return [l.exonym, l.autonym, ...l.names, ...l.regionNamesForSearch]
    .map(PLAIN)
    .filter((n) => n !== "");
}

/** Own names only (no region names): what a dialect name is compared to for FR-003. */
function ownNamesOf(l: ILanguage): string[] {
  return [l.exonym, l.autonym, ...l.names].map(PLAIN).filter((n) => n !== "");
}

const squash = (s: string): string => s.replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** True when `q` starts a word (or a run of words) of the folded name. */
function hasWordPrefix(foldedName: string, q: string): boolean {
  const qq = squash(q);
  return qq !== "" && ` ${squash(foldedName)}`.includes(` ${qq}`);
}

/** True when `q` (folded) is a prefix of a word in the result's names, or equals its code. */
export function isClose(l: ILanguage, q: string): boolean {
  if (PLAIN(l.languageSubtag) === q || PLAIN(l.iso639_3_code) === q) return true;
  return namesOf(l).some((n) => hasWordPrefix(n, q));
}

function codesOf(l: ILanguage): string[] {
  return [l.languageSubtag, l.iso639_3_code].map((c) => PLAIN(c));
}

/** A row for a parent language the chooser's data cannot resolve: Glottolog's name and the code. */
function fallbackRow(code: string, name: string): ChooserLanguage {
  return {
    iso639_3_code: code,
    languageSubtag: code,
    exonym: name,
    regionNamesForDisplay: "",
    regionNamesForSearch: [],
    names: [],
    scripts: [],
    alternativeTags: [],
    isMacrolanguage: false,
    languageType: LanguageType.Living,
  };
}

/** The parent language for an ISO code, through EthnoLib's own modifier so `cmn` is the `zh` card. */
export function defaultParentFor(iso: string): ILanguage | undefined {
  return getLanguageBySubtag(MACROLANGUAGE_PARENT[iso] ?? iso, defaultSearchResultModifier);
}

/** The chooser row for a Glottolog language with no ISO code. It has no code of its own. */
function uncodedRow(info: UncodedInfo): ChooserLanguage {
  return { ...fallbackRow("", info.name), regionNamesForDisplay: info.countries.join(", "), uncoded: info };
}

const MAX_DIALECT_HITS = 60;

/**
 * Merge dialect hits into the chooser's result list (contract § merge rule).
 *
 * Output order: close chooser results, close dialect hits, fuzzy chooser
 * results, fuzzy dialect hits. A dialect hit whose parent is already listed
 * attaches its `match` to that row instead of adding a second one, unless the
 * dialect name is the row's own name (a language with its own code ranks above
 * a dialect of the same name).
 */
export function dialectResultModifier(
  searcher: LanguageSearcher,
  parentFor: (iso: string) => ILanguage | undefined,
): (results: ILanguage[], searchString: string) => ChooserLanguage[] {
  return (results, searchString) => {
    const q = fold(searchString);
    // Cloned: attaching a match must not mutate rows the chooser holds in state.
    const base = (defaultSearchResultModifier(results, searchString) as ChooserLanguage[]).map((r) => ({ ...r }));
    if (q.length < 2) return base;

    const closeChooser: ChooserLanguage[] = [];
    const fuzzyChooser: ChooserLanguage[] = [];
    for (const r of base) (isClose(r, q) ? closeChooser : fuzzyChooser).push(r);

    const hits = (searcher.searchForLanguage(q) as DialectRow[]).slice(0, MAX_DIALECT_HITS);
    const closeDialect: ChooserLanguage[] = [];
    const fuzzyDialect: ChooserLanguage[] = [];

    const findListed = (code: string): ChooserLanguage | undefined => {
      const c = fold(code);
      for (const list of [closeChooser, closeDialect, fuzzyChooser, fuzzyDialect]) {
        const found = list.find((l) => codesOf(l).includes(c));
        if (found !== undefined) return found;
      }
      return undefined;
    };

    for (const hit of hits) {
      if (hit.uncoded !== undefined) {
        // No ISO code, so no parent to attach to: the row is its own result.
        const close = hasWordPrefix(hit.folded, q);
        (close ? closeDialect : fuzzyDialect).push(uncodedRow(hit.uncoded));
        continue;
      }
      if (hit.requires !== undefined && !q.includes(hit.requires)) continue;
      const target = MACROLANGUAGE_PARENT[hit.parent] ?? hit.parent;
      const close = hasWordPrefix(hit.folded, q);
      const listed = findListed(target) ?? findListed(hit.parent);
      if (listed !== undefined) {
        // The row already stands for this language: a dialect name that is the
        // row's own name is a direct hit and needs no match line.
        // A langtags tagset is always a dialect or variety of the language, even
        // when the language lists the same words among its own names ("Achi - Rabinal").
        const isOwnName = hit.match.source === "glottolog" && ownNamesOf(listed).includes(hit.folded);
        if (listed.match === undefined && !isOwnName) {
          listed.match = hit.match;
        }
        // Several langtags tagsets of one language can share a name ("Urama-Kope"):
        // each is its own result, so each tagset can be picked (SC-002).
        const tag = hit.match.dialectTag;
        if (close && hit.match.source === "langtags" && tag !== undefined && listed.match?.dialectTag !== tag) {
          const alreadyListed = [closeChooser, closeDialect, fuzzyChooser, fuzzyDialect]
            .flat()
            .some((l) => l.match?.dialectTag === tag);
          if (!alreadyListed) closeDialect.push({ ...listed, match: hit.match });
        }
        // A fuzzy chooser row that a close dialect name points at moves up.
        if (close) {
          const at = fuzzyChooser.indexOf(listed);
          if (at >= 0) {
            fuzzyChooser.splice(at, 1);
            closeChooser.push(listed);
          }
        }
        continue;
      }
      const parent = parentFor(target) ?? fallbackRow(hit.parent, hit.parentName ?? hit.parent);
      const row: ChooserLanguage = { ...parent, match: hit.match };
      (close ? closeDialect : fuzzyDialect).push(row);
    }
    // Fuzzy dialect hits wait until the chooser has listed something: results
    // stream in tier by tier, and a fuzzy dialect row would otherwise flash at the
    // top of an empty list before the close chooser rows arrive.
    return [...closeChooser, ...closeDialect, ...fuzzyChooser, ...(base.length > 0 ? fuzzyDialect : [])];
  };
}
