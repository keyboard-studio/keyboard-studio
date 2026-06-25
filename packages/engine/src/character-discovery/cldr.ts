const CLDR_BASE =
  "https://raw.githubusercontent.com/unicode-org/cldr-json/46.1.0/cldr-json/cldr-misc-full/main";

export type CldrLoader = (locale: string) => Promise<string | null>;

/**
 * A loader that returns both the main and auxiliary exemplar raw strings for a
 * locale in a single fetch. Returning null means the locale was not found or
 * the fetch failed. When auxiliary is absent in the CLDR data, the field is null.
 *
 * Use createFetchCldrFullLoader() to obtain a network-backed instance.
 * Pass this type to loadExemplarsFromFull() and suggestMissingCharacters().
 */
export type CldrFullLoader = (
  locale: string,
) => Promise<{ main: string; auxiliary: string | null } | null>;

/**
 * Builds a CldrLoader that fetches from the CLDR 46.1.0 CDN.
 * On non-200 or network error, returns null so callers can fall back gracefully.
 *
 * Returns only the main exemplar string. For auxiliary exemplar support, use
 * createFetchCldrFullLoader() instead.
 */
export function createFetchCldrLoader(fetchImpl?: typeof fetch): CldrLoader {
  const full = createFetchCldrFullLoader(fetchImpl);
  return async (locale: string): Promise<string | null> => {
    const pair = await full(locale);
    return pair !== null ? pair.main : null;
  };
}

/**
 * Builds a CldrFullLoader that fetches both the main and auxiliary exemplar sets
 * from the CLDR 46.1.0 CDN in a single HTTP request.
 * On non-200 or network error, returns null so callers can fall back gracefully.
 */
export function createFetchCldrFullLoader(fetchImpl?: typeof fetch): CldrFullLoader {
  const doFetch = fetchImpl ?? globalThis.fetch.bind(globalThis);
  return async (locale: string): Promise<{ main: string; auxiliary: string | null } | null> => {
    const url = `${CLDR_BASE}/${locale}/characters.json`;
    let r: Response;
    try {
      r = await doFetch(url);
    } catch {
      return null;
    }
    if (!r.ok) return null;
    let j: unknown;
    try {
      j = await r.json();
    } catch {
      return null;
    }
    return extractExemplarPair(j, locale);
  };
}

function extractExemplarPair(j: unknown, locale: string): { main: string; auxiliary: string | null } | null {
  if (typeof j !== "object" || j === null) return null;
  const root = j as Record<string, unknown>;
  const main = root["main"];
  if (typeof main !== "object" || main === null) return null;
  const localeData = (main as Record<string, unknown>)[locale];
  if (typeof localeData !== "object" || localeData === null) return null;
  const characters = (localeData as Record<string, unknown>)["characters"];
  if (typeof characters !== "object" || characters === null) return null;
  const charMap = characters as Record<string, unknown>;
  const exemplar = charMap["exemplarCharacters"];
  if (typeof exemplar !== "string") return null;
  // Auxiliary exemplar set: CLDR JSON key is "exemplarCharacters-type-auxiliary"
  const auxExemplar = charMap["exemplarCharacters-type-auxiliary"];
  return {
    main: exemplar,
    auxiliary: typeof auxExemplar === "string" ? auxExemplar : null,
  };
}

export interface ParsedUnicodeSet {
  used: Set<string>;
  digraphs: string[];
  specials: string[];
}

export function parseUnicodeSet(str: string): ParsedUnicodeSet {
  const used = new Set<string>();
  const digraphs: string[] = [];

  let s = str.trim();
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);

  const chars = [...s];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i] as string;
    if (c === " ") continue;

    if (c === "\\") {
      i += 1;
      const n = chars[i];
      // NFC-normalize escaped chars so the set carries composed forms
      if (n !== undefined) used.add(n.normalize("NFC"));
      continue;
    }

    if (c === "{") {
      let g = "";
      while (i + 1 < chars.length && chars[i + 1] !== "}") g += chars[++i];
      i++;
      // NFC-normalize the digraph cluster before recording it
      const gNfc = g.normalize("NFC");
      digraphs.push(gNfc);
      for (const gc of gNfc) used.add(gc);
      continue;
    }

    if (chars[i + 1] === "-" && chars[i + 2] !== undefined && chars[i + 2] !== " ") {
      const start = c.codePointAt(0);
      const end = (chars[i + 2] as string).codePointAt(0);
      if (start !== undefined && end !== undefined) {
        for (let cp = start; cp <= end; cp++) {
          // Range-expanded chars: NFC-normalize each (range chars are typically already NFC)
          used.add(String.fromCodePoint(cp).normalize("NFC"));
        }
      }
      i += 2;
      continue;
    }

    // NFC-normalize every character so ExemplarResult carries composed forms.
    // This prevents false positives when CLDR stores e.g. U+0065 U+0301 (NFD "e + combining acute")
    // but the keyboard produces U+00E9 (NFC "e-acute"). Without NFC normalization here,
    // a character present in both CLDR and the keyboard's produced set would appear "missing".
    used.add(c.normalize("NFC"));
  }

  const specials = [...used].filter(
    (ch) => (ch.codePointAt(0) ?? 0) > 0x7f && /\p{L}/u.test(ch),
  );
  return { used, digraphs, specials };
}

export interface ExemplarResult {
  raw: string;
  used: Set<string>;
  digraphs: string[];
  specials: string[];
  /** NFC-normalized auxiliary exemplar letters (loanword tier). Empty when CLDR has no auxiliary set. */
  auxiliary: string[];
  /** Subset of auxiliary that are non-ASCII letters (> U+007F), including auto-added uppercase variants. */
  auxiliarySpecials: string[];
}

/**
 * For each character in `specials`, add its uppercase form to the set when it
 * is a single codepoint and differs from the original.
 * Matches kbgen behaviour — only adds single-codepoint uppercase forms to avoid
 * polluting the set with multi-char titlecase sequences.
 */
function augmentSpecialsWithUppercase(specials: Set<string>): void {
  for (const ch of [...specials]) {
    const up = ch.toUpperCase();
    if (up !== ch && [...up].length === 1) specials.add(up);
  }
}

/**
 * Async entry point: fetches exemplar data via loader, parses, and adds
 * uppercase variants of specials (matching kbgen behaviour).
 *
 * Produces an ExemplarResult with empty auxiliary/auxiliarySpecials fields.
 * To populate auxiliary, use loadExemplarsFromFull() with a CldrFullLoader.
 */
export async function loadExemplars(
  locale: string,
  loader: CldrLoader,
): Promise<ExemplarResult | null> {
  const raw = await loader(locale);
  if (raw === null) return null;

  const parsed = parseUnicodeSet(raw);
  const specials = new Set(parsed.specials);
  augmentSpecialsWithUppercase(specials);

  return {
    raw,
    used: parsed.used,
    digraphs: parsed.digraphs,
    specials: [...specials],
    auxiliary: [],
    auxiliarySpecials: [],
  };
}

/**
 * Like loadExemplars, but uses a CldrFullLoader to also populate the auxiliary
 * exemplar set (loanword tier) in the returned ExemplarResult.
 *
 * Returns null if the locale is not found or the fetch fails.
 * When auxiliary CLDR data exists, ExemplarResult.auxiliary and
 * ExemplarResult.auxiliarySpecials are populated with NFC-normalized chars.
 */
export async function loadExemplarsFromFull(
  locale: string,
  loader: CldrFullLoader,
): Promise<ExemplarResult | null> {
  const pair = await loader(locale);
  if (pair === null) return null;

  const parsed = parseUnicodeSet(pair.main);
  const specials = new Set(parsed.specials);
  augmentSpecialsWithUppercase(specials);

  // Parse auxiliary exemplars when present
  let auxiliary: string[] = [];
  let auxiliarySpecials: string[] = [];

  if (pair.auxiliary !== null) {
    const auxParsed = parseUnicodeSet(pair.auxiliary);
    const auxSpecials = new Set(auxParsed.specials);
    augmentSpecialsWithUppercase(auxSpecials);
    auxiliary = [...auxParsed.used];
    auxiliarySpecials = [...auxSpecials];
  }

  return {
    raw: pair.main,
    used: parsed.used,
    digraphs: parsed.digraphs,
    specials: [...specials],
    auxiliary,
    auxiliarySpecials,
  };
}

export const SCRIPT_BLOCKS: Record<string, [number, number][]> = { // https://www.unicode.org/charts/
  Latn: [
    [0x0020, 0x007e], // Basic Latin
    [0x00a0, 0x00ff], // Latin-1 Supplement
    [0x0100, 0x017f], // Latin Extended-A
    [0x0180, 0x024f], // Latin Extended-B
  ],
  Deva: [
    [0x0900, 0x097f], // Devanagari
  ],
  Arab: [
    [0x0600, 0x06ff], // Arabic
  ],
  Cyrl: [
    [0x0400, 0x04ff], // Cyrillic
  ],
};

export function scriptBlockChars(script: string): string[] {
  const ranges = SCRIPT_BLOCKS[script];
  if (ranges === undefined) return [];
  const result: string[] = [];
  for (const [start, end] of ranges) {
    for (let cp = start; cp <= end; cp++) {
      const ch = String.fromCodePoint(cp);
      if (/\p{L}/u.test(ch)) result.push(ch);
    }
  }
  return result;
}
