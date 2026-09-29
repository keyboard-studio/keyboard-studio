/**
 * describeCharacter — per-character Unicode facts for the character map's
 * hover/focus info popover (keyboard-studio#1783).
 *
 * Answers, for one NFC grapheme: its Unicode name(s), every code point, the
 * General_Category of each code point, whether the grapheme combines with the
 * preceding character, its Unicode Script and Script_Extensions, and each
 * code point's canonical combining class.
 *
 * Performance contract (the issue's hard requirement — groups render up to
 * 3000 cells, so NOTHING here may cost anything per cell):
 * - This module is pure and dependency-free: the ~1.5 MB pinned Unicode table
 *   is NOT imported. Callers inject the three lookups they need
 *   (`UnicodeCharacterLookups`); in production the studio resolves the real
 *   `@keyboard-studio/contracts/unicode` module behind a dynamic import, so
 *   this helper itself never introduces a static dependency on the table —
 *   and adds zero new bytes to the initial bundle (on the current base the
 *   pinned module is already statically included by spec-082 engine code,
 *   so the dynamic import dedupes to the already-loaded module).
 * - Script detection uses the runtime's own ICU data via `\p{Script=…}`
 *   property escapes — no new data shipped, no new bundle weight. The probe
 *   regexes are compiled ONCE at module load; each describe call then costs
 *   one short probe loop per code point of the NFC grapheme (a few hundred
 *   single-character property tests at most, and only ever for the single
 *   hovered/focused cell — never the grid). Script_Extensions rides the
 *   same probes (`\p{Script_Extensions=…}`) — collected per code point so
 *   the UI can show them "where they add something".
 * - Callers compute this lazily for the single hovered/focused cell, never
 *   for the grid.
 *
 * ICU skew note: the probe list is validated at module load — a Script value
 * this runtime's ICU does not know (newer than the ICU's Unicode version, or
 * a name spelled differently there) is SKIPPED, never thrown. A character in
 * such a script simply reports `script: undefined` rather than crashing the
 * popover; the pinned name/category/ccc table is unaffected (it is
 * version-pinned independently of ICU).
 */

/** The Unicode data lookups describeCharacter needs, injected by the caller. */
export interface UnicodeCharacterLookups {
  /** Unicode character name, or undefined (controls, surrogates, PUA, unassigned). */
  getName(cp: number): string | undefined;
  /** General_Category code ("Lu", "Mn", …), or undefined when unassigned. */
  getCategory(cp: number): string | undefined;
  /** Canonical combining class (0–255), or undefined when unassigned. */
  getCCC(cp: number): number | undefined;
}

/** One code point of the described grapheme, with its own Unicode facts. */
export interface DescribedCodePoint {
  /** The code point scalar value. */
  codePoint: number;
  /** Unicode name, or undefined where UnicodeData has no real name. */
  name: string | undefined;
  /** General_Category code ("Lu", "Mn", …), or undefined when unassigned. */
  category: string | undefined;
  /** Canonical combining class (0–255), or undefined when unassigned. */
  ccc: number | undefined;
  /** Unicode Script property value ("Latin", "Common", …), or undefined when
   * no probe matched (ICU skew — see module note). */
  script: string | undefined;
  /**
   * Every Script_Extensions value for this code point (display form), in
   * probe order. Note this does NOT always contain `script`: for
   * Inherited-script marks (U+0301 etc.) the set lists the scripts the mark
   * is used with — "Inherited" itself is not among them. The UI shows these
   * only "where they add something", i.e. when the set holds values beyond
   * the primary Script.
   */
  scriptExtensions: string[];
}

/** Everything the info popover shows for one character-map cell. */
export interface CharacterDescription {
  /** The input grapheme, NFC-normalized. */
  char: string;
  /** Every code point of the NFC form, in order, each with its own name —
   * a multi-codepoint NFC grapheme lists all of them, not just the first. */
  codePoints: DescribedCodePoint[];
  /**
   * True when the grapheme COMBINES with the preceding character rather than
   * standing alone — i.e. its first code point is a combining mark
   * (General_Category Mn or Me). Stated in plain words by the UI
   * ("combines with the preceding character" / "stands alone").
   */
  isCombining: boolean;
}

// ---------------------------------------------------------------------------
// Script probing
// ---------------------------------------------------------------------------

/**
 * Script property values probed in order. Hot scripts first (probe loop
 * breaks at the first match, so the common cases cost one regex test);
 * "Inherited" and "Unknown" last as the two catch-all sentinels.
 *
 * Validated at module load (see SCRIPT_PROBES): entries this runtime's ICU
 * does not recognise are dropped there, so this list may name scripts newer
 * than the ICU's Unicode version without breaking older runtimes.
 */
const SCRIPT_NAMES: readonly string[] = [
  // Hot path — scripts that dominate real character maps.
  "Latin",
  "Common",
  "Cyrillic",
  "Arabic",
  "Greek",
  "Devanagari",
  "Han",
  "Hiragana",
  "Katakana",
  "Hangul",
  "Hebrew",
  "Armenian",
  "Georgian",
  "Thai",
  "Ethiopic",
  "Bengali",
  "Tamil",
  "Telugu",
  "Kannada",
  "Malayalam",
  "Gujarati",
  "Gurmukhi",
  "Oriya",
  "Sinhala",
  "Myanmar",
  "Khmer",
  "Lao",
  "Tibetan",
  // The long tail, alphabetical.
  "Adlam",
  "Avestan",
  "Balinese",
  "Bamum",
  "Bassa_Vah",
  "Batak",
  "Beria_Erfe",
  "Bhaiksuki",
  "Brahmi",
  "Buginese",
  "Buhid",
  "Canadian_Aboriginal",
  "Carian",
  "Caucasian_Albanian",
  "Chakma",
  "Cham",
  "Cherokee",
  "Chorasmian",
  "Coptic",
  "Cuneiform",
  "Cypriot",
  "Cypro_Minoan",
  "Deseret",
  "Dives_Akuru",
  "Dogra",
  "Duployan",
  "Egyptian_Hieroglyphs",
  "Elbasan",
  "Elymaic",
  "Garay",
  "Glagolitic",
  "Gothic",
  "Grantha",
  "Gunjala_Gondi",
  "Hanifi_Rohingya",
  "Hanunoo",
  "Hatran",
  "Inscriptional_Pahlavi",
  "Inscriptional_Parthian",
  "Javanese",
  "Kaithi",
  "Kawi",
  "Kharoshthi",
  "Khitan_Small_Script",
  "Khojki",
  "Kirat_Rai",
  "Lepcha",
  "Limbu",
  "Lisu",
  "Lycian",
  "Lydian",
  "Mahajani",
  "Makasar",
  "Mandaic",
  "Manichaean",
  "Marchen",
  "Masaram_Gondi",
  "Medefaidrin",
  "Meetei_Mayek",
  "Mende_Kikakui",
  "Meroitic_Cursive",
  "Meroitic_Hieroglyphs",
  "Miao",
  "Modi",
  "Mongolian",
  "Mro",
  "Multani",
  "Nabataean",
  "Nag_Mundari",
  "Nandinagari",
  "New_Tai_Lue",
  "Newa",
  "Nko",
  "Nushu",
  "Ogham",
  "Ol_Chiki",
  "Ol_Onal",
  "Old_Hungarian",
  "Old_Italic",
  "Old_North_Arabian",
  "Old_Permic",
  "Old_Persian",
  "Old_Sogdian",
  "Old_South_Arabian",
  "Old_Turkic",
  "Old_Uyghur",
  "Osage",
  "Osmanya",
  "Pahawh_Hmong",
  "Palmyrene",
  "Pau_Cin_Hau",
  "Phags_Pa",
  "Phoenician",
  "Psalter_Pahlavi",
  "Rejang",
  "Runic",
  "Samaritan",
  "Saurashtra",
  "Sharada",
  "Shavian",
  "Siddham",
  "Sidetic",
  "SignWriting",
  "Sogdian",
  "Sora_Sompeng",
  "Soyombo",
  "Sundanese",
  "Sunuwar",
  "Syloti_Nagri",
  "Syriac",
  "Tagalog",
  "Tagbanwa",
  "Tai_Le",
  "Tai_Tham",
  "Tai_Viet",
  "Tai_Yo",
  "Takri",
  "Tangsa",
  "Tangut",
  "Thaana",
  "Tifinagh",
  "Tirhuta",
  "Todhri",
  "Toto",
  "Tulu_Tigalari",
  "Ugaritic",
  "Vai",
  "Vithkuqi",
  "Wancho",
  "Warang_Citi",
  "Yezidi",
  "Yi",
  "Zanabazar_Square",
  // Catch-alls last.
  "Inherited",
  "Unknown",
];

interface ScriptProbe {
  /** Display form ("Canadian Aboriginal" — underscores become spaces). */
  display: string;
  scriptRegex: RegExp;
  scxRegex: RegExp;
}

/**
 * Compiled once at module load. Entries whose Script name this runtime's
 * ICU rejects are dropped (ICU/newer-Unicode skew — see module note), so a
 * newer script never breaks an older runtime; it just reports undefined.
 * The Script_Extensions probe rides the same entry: one compiled pair per
 * script, no new data shipped.
 */
const SCRIPT_PROBES: readonly ScriptProbe[] = (() => {
  const probes: ScriptProbe[] = [];
  for (const name of SCRIPT_NAMES) {
    let scriptRegex: RegExp;
    let scxRegex: RegExp;
    try {
      scriptRegex = new RegExp(`\\p{Script=${name}}`, "u");
      scxRegex = new RegExp(`\\p{Script_Extensions=${name}}`, "u");
    } catch {
      continue; // ICU skew — skip, don't throw.
    }
    probes.push({ display: name.replace(/_/g, " "), scriptRegex, scxRegex });
  }
  return probes;
})();

/** Unicode Script of one code point via the runtime's ICU, or undefined. */
function scriptOf(cp: number): string | undefined {
  const ch = String.fromCodePoint(cp);
  for (const probe of SCRIPT_PROBES) {
    if (probe.scriptRegex.test(ch)) return probe.display;
  }
  return undefined;
}

/**
 * Every Script_Extensions value for one code point (display form), in probe
 * order. Unlike scriptOf this cannot break early — extensions are a set.
 * Still cheap: ~170 single-character property tests, and only ever run for
 * the single hovered/focused cell.
 */
function scriptExtensionsOf(cp: number): string[] {
  const ch = String.fromCodePoint(cp);
  const out: string[] = [];
  for (const probe of SCRIPT_PROBES) {
    if (probe.scxRegex.test(ch)) out.push(probe.display);
  }
  return out;
}

// ---------------------------------------------------------------------------
// describeCharacter
// ---------------------------------------------------------------------------

/**
 * Describe one character-map cell's grapheme: Unicode name(s), every code
 * point, General_Category, combining-vs-standalone, Script and
 * Script_Extensions, and canonical combining class — from the injected
 * `unicode` lookups (the pinned in-repo table in production) plus the
 * runtime's ICU for Script/Script_Extensions.
 *
 * The input is NFC-normalized first so a multi-codepoint grapheme is listed
 * in its canonical composed form; each code point then gets its OWN name
 * (the issue's acceptance criterion — not just the first code point's).
 * Unassigned code points, controls, surrogates, and private-use characters
 * degrade honestly: name/category/ccc come back undefined rather than
 * invented.
 */
export function describeCharacter(
  char: string,
  unicode: UnicodeCharacterLookups,
): CharacterDescription {
  const nfc = char.normalize("NFC");
  const codePoints: DescribedCodePoint[] = [];
  for (const ch of nfc) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    codePoints.push({
      codePoint: cp,
      name: unicode.getName(cp),
      category: unicode.getCategory(cp),
      ccc: unicode.getCCC(cp),
      script: scriptOf(cp),
      scriptExtensions: scriptExtensionsOf(cp),
    });
  }
  const firstCategory = codePoints[0]?.category;
  return {
    char: nfc,
    codePoints,
    // Mn/Me attach to the preceding character; everything else — including
    // Mc (spacing marks) and Cf (format controls) — stands alone.
    isCombining: firstCategory === "Mn" || firstCategory === "Me",
  };
}
