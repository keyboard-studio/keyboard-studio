const CLDR_BASE =
  "https://raw.githubusercontent.com/unicode-org/cldr-json/46.1.0/cldr-json/cldr-misc-full/main";

export type CldrLoader = (locale: string) => Promise<string | null>;

/**
 * Builds a CldrLoader that fetches from the CLDR 46.1.0 CDN.
 * On non-200 or network error, returns null so callers can fall back gracefully.
 */
export function createFetchCldrLoader(fetchImpl?: typeof fetch): CldrLoader {
  const doFetch = fetchImpl ?? globalThis.fetch.bind(globalThis);
  return async (locale: string): Promise<string | null> => {
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
    return extractExemplar(j, locale);
  };
}

function extractExemplar(j: unknown, locale: string): string | null {
  if (typeof j !== "object" || j === null) return null;
  const root = j as Record<string, unknown>;
  const main = root["main"];
  if (typeof main !== "object" || main === null) return null;
  const localeData = (main as Record<string, unknown>)[locale];
  if (typeof localeData !== "object" || localeData === null) return null;
  const characters = (localeData as Record<string, unknown>)["characters"];
  if (typeof characters !== "object" || characters === null) return null;
  const exemplar = (characters as Record<string, unknown>)["exemplarCharacters"];
  return typeof exemplar === "string" ? exemplar : null;
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
      if (n !== undefined) used.add(n);
      continue;
    }

    if (c === "{") {
      let g = "";
      while (i + 1 < chars.length && chars[i + 1] !== "}") g += chars[++i];
      i++;
      digraphs.push(g);
      for (const gc of g) used.add(gc);
      continue;
    }

    if (chars[i + 1] === "-" && chars[i + 2] !== undefined && chars[i + 2] !== " ") {
      const start = c.codePointAt(0);
      const end = (chars[i + 2] as string).codePointAt(0);
      if (start !== undefined && end !== undefined) {
        for (let cp = start; cp <= end; cp++) used.add(String.fromCodePoint(cp));
      }
      i += 2;
      continue;
    }

    used.add(c);
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
}

/**
 * Async entry point: fetches exemplar data via loader, parses, and adds
 * uppercase variants of specials (matching kbgen behaviour).
 */
export async function loadExemplars(
  locale: string,
  loader: CldrLoader,
): Promise<ExemplarResult | null> {
  const raw = await loader(locale);
  if (raw === null) return null;

  const parsed = parseUnicodeSet(raw);
  const specials = new Set(parsed.specials);

  for (const ch of parsed.specials) {
    const up = ch.toUpperCase();
    // Only add single-codepoint uppercase forms to avoid polluting with multi-char titles
    if (up !== ch && [...up].length === 1) specials.add(up);
  }

  return { raw, used: parsed.used, digraphs: parsed.digraphs, specials: [...specials] };
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
