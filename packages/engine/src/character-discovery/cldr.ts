const CLDR_BASE =
  "https://raw.githubusercontent.com/unicode-org/cldr-json/46.1.0/cldr-json/cldr-misc-full/main";

export type CldrLoader = (locale: string) => Promise<string | null>;

/**
 * Normalizes a BCP47 tag to CLDR/SLDR subtag casing (`ewo-latn` -> `ewo-Latn`,
 * `pt_br` -> `pt-BR`) and returns the locale-directory candidates to try, most
 * specific first.
 *
 * Both exemplar sources are keyed by *minimal* locale ids: a directory/file
 * exists for `ewo`, not `ewo-Latn`, because Latn is Ewondo's default script.
 * Some locales genuinely need a subtag (`sr-Latn`, `zh-Hant`, `pt-BR`), so we
 * cannot simply strip subtags — we probe from most specific to language-only
 * and take the first hit:
 *
 *   ewo-Latn   -> ["ewo-Latn", "ewo"]
 *   sr-Latn    -> ["sr-Latn", "sr"]        (first candidate hits)
 *   pt-BR      -> ["pt-BR", "pt"]
 *   ha-Latn-NG -> ["ha-Latn-NG", "ha-Latn", "ha-NG", "ha"]
 *
 * Shared by the live CLDR fetch loader below and the offline sourcing path
 * (`exemplarSource.ts`), which re-exports it — one candidate ladder, not two.
 */
export function exemplarLocaleCandidates(tag: string): string[] {
  const parts = tag
    .trim()
    .replace(/_/g, "-")
    .split("-")
    .filter((p) => p.length > 0);
  if (parts.length === 0) return [];
  const language = (parts[0] as string).toLowerCase();
  let script: string | undefined;
  let region: string | undefined;
  for (const part of parts.slice(1)) {
    if (script === undefined && /^[A-Za-z]{4}$/.test(part)) {
      script = (part[0] as string).toUpperCase() + part.slice(1).toLowerCase();
    } else if (region === undefined && /^([A-Za-z]{2}|\d{3})$/.test(part)) {
      region = part.toUpperCase();
    }
    // Variants/extensions are dropped — neither source has such directories.
  }
  const candidates = [
    [language, script, region],
    [language, script],
    [language, region],
    [language],
  ].map((subtags) => subtags.filter((s): s is string => s !== undefined).join("-"));
  return [...new Set(candidates)];
}

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
) => Promise<{
  main: string;
  auxiliary: string | null;
  punctuation: string | null;
  numbers: string | null;
} | null>;

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
  return async (locale: string) => {
    // Probe the candidate ladder most-specific-first: CLDR's main/ directories
    // are keyed by minimal locale ids, so "ewo-Latn" only resolves via "ewo".
    for (const candidate of exemplarLocaleCandidates(locale)) {
      const url = `${CLDR_BASE}/${candidate}/characters.json`;
      let r: Response;
      try {
        r = await doFetch(url);
      } catch {
        return null;
      }
      if (!r.ok) continue;
      let j: unknown;
      try {
        j = await r.json();
      } catch {
        return null;
      }
      return extractExemplarPair(j, candidate);
    }
    return null;
  };
}

function extractExemplarPair(
  j: unknown,
  locale: string,
): { main: string; auxiliary: string | null; punctuation: string | null; numbers: string | null } | null {
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
  // Non-main exemplar tiers. cldr-json flattens LDML's
  // <exemplarCharacters type="auxiliary"> to a bare "auxiliary" key — NOT
  // "exemplarCharacters-type-auxiliary", which no CLDR release has ever
  // emitted. Reading the latter silently returned null for three of the four
  // tiers on every locale (spec 044 research R0): the auxiliary loanword tier,
  // locale punctuation (French "« »"), and locale digits (Persian
  // Eastern-Arabic-Indic "۰۱۲…") were all invisible to surplus detection and
  // to the character map.
  const auxExemplar = charMap["auxiliary"];
  const punctuationExemplar = charMap["punctuation"];
  const numbersExemplar = charMap["numbers"];
  return {
    main: exemplar,
    auxiliary: typeof auxExemplar === "string" ? auxExemplar : null,
    punctuation: typeof punctuationExemplar === "string" ? punctuationExemplar : null,
    numbers: typeof numbersExemplar === "string" ? numbersExemplar : null,
  };
}

export interface ParsedUnicodeSet {
  used: Set<string>;
  digraphs: string[];
  specials: string[];
}

/**
 * Thrown when an exemplar set uses UnicodeSet syntax this parser deliberately
 * does not implement (set difference/intersection/complement, i.e. a nested
 * `[...]`, a bare `&`, or a leading `^`).
 *
 * Failing loudly is the point (spec 044 FR: a malformed or unsupported set must
 * never yield a *partial* inventory). The previous lenient behaviour turned
 * `[[a-z]-[aeiou]]` into the literal characters `[`, `]` and the whole a-z
 * range — silently seeding an author's alphabet with brackets and the very
 * vowels the set subtracted.
 */
export class UnsupportedUnicodeSetError extends Error {
  constructor(reason: string, source: string) {
    super(`Unsupported UnicodeSet syntax (${reason}): ${source}`);
    this.name = "UnsupportedUnicodeSetError";
  }
}

/** One lexical unit of a UnicodeSet body. */
type SetToken =
  | { kind: "char"; value: string; escaped: boolean; spacedBefore: boolean }
  | { kind: "digraph"; value: string }
  | { kind: "dash"; spacedBefore: boolean; spacedAfter: boolean };

const HEX4 = /^[0-9a-fA-F]{4}$/;

function isHighSurrogate(cp: number): boolean {
  return cp >= 0xd800 && cp <= 0xdbff;
}
function isLowSurrogate(cp: number): boolean {
  return cp >= 0xdc00 && cp <= 0xdfff;
}

/**
 * Decodes the escape sequence starting at `chars[i]` (which is the backslash).
 * Returns the decoded string plus the index of the last consumed unit.
 *
 * Handles `\uXXXX` (including a surrogate pair written as two consecutive
 * `\uXXXX` escapes), `\x{...}`, `\\`, and `\<any>` (the literal character).
 * A trailing lone backslash decodes to the empty string rather than throwing —
 * the pre-existing lenient behaviour for truncated input.
 *
 * SLDR exemplar sets use `‌`/`‍` (ZWNJ/ZWJ) and CLDR uses `\uXXXX`
 * in 147 of its 3064 exemplar sets, so without this the parser injected the
 * stray ASCII characters `u`, `2`, `0`, `C` into authors' alphabets.
 */
function decodeEscape(chars: readonly string[], i: number): { value: string; next: number } {
  const n = chars[i + 1];
  if (n === undefined) return { value: "", next: i + 1 };

  if (n === "u") {
    const hex = chars.slice(i + 2, i + 6).join("");
    if (HEX4.test(hex)) {
      const unit = parseInt(hex, 16);
      const consumedTo = i + 5;
      // A supplementary-plane codepoint written as a surrogate pair — two
      // consecutive \uXXXX escapes that must combine, not stand alone.
      if (isHighSurrogate(unit) && chars[i + 6] === "\\" && chars[i + 7] === "u") {
        const loHex = chars.slice(i + 8, i + 12).join("");
        if (HEX4.test(loHex)) {
          const lo = parseInt(loHex, 16);
          if (isLowSurrogate(lo)) {
            return {
              value: String.fromCharCode(unit, lo),
              next: i + 11,
            };
          }
        }
      }
      return { value: String.fromCharCode(unit), next: consumedTo };
    }
  }

  if (n === "x" && chars[i + 2] === "{") {
    let j = i + 3;
    let hex = "";
    while (j < chars.length && chars[j] !== "}") hex += chars[j++];
    if (chars[j] === "}" && /^[0-9a-fA-F]{1,6}$/.test(hex)) {
      const cp = parseInt(hex, 16);
      if (cp <= 0x10ffff) return { value: String.fromCodePoint(cp), next: j };
    }
  }

  // `\\` -> literal backslash; `\<any>` -> that literal character.
  return { value: n, next: i + 1 };
}

/**
 * Lexes a UnicodeSet body into tokens, rejecting the syntax we do not support.
 *
 * Unescaped `[` (a nested set — the left operand of a difference/intersection),
 * unescaped `&` (intersection), and a leading `^` (complement) all throw
 * `UnsupportedUnicodeSetError`. An unescaped `]` inside the body is treated as
 * a literal, matching the pre-existing lenient handling of truncated input.
 */
function tokenizeUnicodeSet(body: string, source: string): SetToken[] {
  const chars = [...body];
  const tokens: SetToken[] = [];
  let pendingSpace = false;

  for (let i = 0; i < chars.length; i++) {
    const c = chars[i] as string;

    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      pendingSpace = true;
      continue;
    }

    if (c === "\\") {
      const { value, next } = decodeEscape(chars, i);
      i = next;
      if (value !== "") {
        tokens.push({ kind: "char", value, escaped: true, spacedBefore: pendingSpace });
      }
      pendingSpace = false;
      continue;
    }

    if (c === "[") throw new UnsupportedUnicodeSetError("nested set / set difference", source);
    if (c === "&") throw new UnsupportedUnicodeSetError("set intersection", source);
    if (c === "^" && tokens.length === 0) {
      throw new UnsupportedUnicodeSetError("set complement", source);
    }

    if (c === "{") {
      let g = "";
      while (i + 1 < chars.length && chars[i + 1] !== "}") g += chars[++i];
      i++;
      tokens.push({ kind: "digraph", value: g });
      pendingSpace = false;
      continue;
    }

    if (c === "-") {
      const after = chars[i + 1];
      tokens.push({
        kind: "dash",
        spacedBefore: pendingSpace,
        spacedAfter: after === undefined || after === " ",
      });
      pendingSpace = false;
      continue;
    }

    tokens.push({ kind: "char", value: c, escaped: false, spacedBefore: pendingSpace });
    pendingSpace = false;
  }

  return tokens;
}

/**
 * Parses a CLDR/SLDR UnicodeSet exemplar string into its character inventory.
 *
 * Every emitted character (and every digraph cluster) is NFC-normalized: CLDR
 * may store e.g. U+0065 U+0301 (NFD "e + combining acute") where a keyboard
 * produces U+00E9 (NFC "e-acute"), and without normalization the same
 * character would read as "missing" on one side of a comparison.
 *
 * Supported: literal characters, `a-z` ranges, `{..}` digraph clusters,
 * `\uXXXX` / `\x{...}` / `\\` / `\<any>` escapes.
 * Rejected (throws `UnsupportedUnicodeSetError`): set difference, intersection,
 * and complement — see that class's doc for why silence was the wrong answer.
 *
 * A `-` only forms a range when it is written tight against both neighbours
 * (`a-z`, never `a - z`) and is not itself escaped (`\-` is the literal hyphen
 * CLDR punctuation sets are full of).
 */
export function parseUnicodeSet(str: string): ParsedUnicodeSet {
  const used = new Set<string>();
  const digraphs: string[] = [];

  let s = str.trim();
  // Strip the outer brackets independently rather than as a pair, so a
  // truncated set (`[a\`) still parses its content instead of treating the
  // opening bracket as a nested-set marker.
  if (s.startsWith("[")) s = s.slice(1);
  if (s.endsWith("]")) s = s.slice(0, -1);

  const tokens = tokenizeUnicodeSet(s, str);

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i] as SetToken;

    if (tok.kind === "digraph") {
      const gNfc = tok.value.normalize("NFC");
      digraphs.push(gNfc);
      for (const gc of gNfc) used.add(gc);
      continue;
    }

    if (tok.kind === "dash") {
      // A dash with no usable operand on one side is a literal hyphen.
      used.add("-");
      continue;
    }

    const next = tokens[i + 1];
    const after = tokens[i + 2];
    if (
      next !== undefined &&
      next.kind === "dash" &&
      !next.spacedBefore &&
      !next.spacedAfter &&
      after !== undefined &&
      after.kind === "char"
    ) {
      const start = tok.value.codePointAt(0);
      const end = after.value.codePointAt(0);
      if (start !== undefined && end !== undefined && end >= start) {
        for (let cp = start; cp <= end; cp++) {
          used.add(String.fromCodePoint(cp).normalize("NFC"));
        }
      } else {
        used.add(tok.value.normalize("NFC"));
        used.add(after.value.normalize("NFC"));
      }
      i += 2;
      continue;
    }

    used.add(tok.value.normalize("NFC"));
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
