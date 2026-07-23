/**
 * buildCharacterMap — browsable/tiered, MULTI-SCRIPT candidate builder for the
 * "Keyman character map" UI (Phase B right pane).
 *
 * Unlike pickerCandidates() (a flat list scoped to CLDR-or-single-script-block),
 * this returns the FULL candidate set an author can browse — CLDR main
 * exemplars, then CLDR auxiliary (loanword) exemplars, then every other
 * character belonging to an ENUMERATED SET of scripts' Unicode
 * Script_Extensions property (the resolved target script, any caller-supplied
 * base scripts, and a curated list of major living scripts — see
 * CURATED_SCRIPTS), split into a "block" tier (letters + combining marks), a
 * "digits" tier (\p{Nd}/\p{No}), and a "punctuation" tier (\p{P}/\p{S}) —
 * grouped by human-readable Unicode block name where one is curated, or a
 * generic per-tier label otherwise. It reuses the same CLDR loading/parsing
 * path as pickerCandidates (loadExemplarsFromFull / parseUnicodeSet in
 * cldr.ts) rather than re-implementing CLDR loading, and never mutates
 * SCRIPT_BLOCKS or scriptBlockChars — those stay picker-scoped and
 * calibrated-test-stable.
 *
 * Every returned group is tagged with its `script` — for the block/digits/
 * punctuation tiers, the ISO 15924 code of the script WHOSE Script_Extensions
 * enumeration surfaced the character (see categorizeScriptChars() /
 * blockTierCandidates() and friends), so the studio's "show only my
 * keyboard's scripts" filter hides foreign-script punctuation and combining
 * marks along with their script — a shared char (e.g. a combining mark or
 * punctuation mark used by several scripts) is attributed to the FIRST script
 * in enumeration order (target, then base, then CURATED_SCRIPTS) that gathers
 * it. The curated, genuinely script-neutral folds (COMMON_DIGIT_CHARS,
 * COMMON_PUNCTUATION_CHARS, COMMON_MODIFIER_LETTER_CHARS) are tagged with the
 * "Common" sentinel instead, which the studio always shows regardless of
 * which script the author is browsing. The main/auxiliary (CLDR exemplar)
 * tiers are tagged with the resolved target script.
 *
 * Deduplication is GLOBAL across the whole return value (not per-tier, and
 * NOT against any user inventory — the UI itself marks already-selected
 * cells): each NFC grapheme appears in exactly one cell, in the first tier
 * that introduces it (main > auxiliary > block > digits > punctuation).
 *
 * Each cell also carries its Unicode NAME (see `loadCharNames` below), so the
 * studio can search the character map by name as well as by glyph.
 */

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { isNoncharacterCodePoint, scriptSubtagOf } from "@keyboard-studio/contracts";
import type { CldrFullLoader } from "./cldr.js";
import { createFetchCldrFullLoader, loadExemplarsFromFull } from "./cldr.js";
import { isBidiControlCodePoint } from "./CharacterDiscoveryServiceImpl.js";
import { getLanguageDefaults } from "../langtags/index.js";
import { loadCharNames } from "./charNames.js";
import { producedGlyphs } from "../inventory/producedGlyphs.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type CharacterMapTier = "main" | "auxiliary" | "block" | "digits" | "punctuation";

export interface CharacterMapCell {
  /** NFC grapheme the user can add to their alphabet. */
  char: string;
  /** True → the UI renders it over U+25CC dotted circle. */
  isCombiningMark: boolean;
  /**
   * Unicode NAME of the cell's first codepoint (see loadCharNames), e.g.
   * "LATIN SMALL LETTER A" — undefined when the codepoint has no name in the
   * lookup table (outside its scope, or an algorithmic/range-marker entry).
   * Lets the studio search the character map by name, not just by glyph.
   */
  name?: string;
}

export interface CharacterMapGroup {
  /** Human-readable Unicode block name, e.g. "Latin Extended-A". */
  block: string;
  tier: CharacterMapTier;
  cells: CharacterMapCell[];
  /**
   * The script that contributes the character — an ISO 15924 code
   * identifying the target/base/curated script whose enumeration surfaced
   * it (block/digits/punctuation tiers) or the resolved target language
   * script (main/auxiliary tiers) — or the "Common" sentinel for the
   * curated, universal script-neutral folds (ASCII digits, ordinary
   * punctuation/currency, Common spacing modifier letters). Lets the studio
   * filter/jump the character map by script.
   */
  script: string;
  /**
   * true when this group's block contains at least one character the base
   * keyboard actually produces (via producedGlyphs); the studio's "blocks my
   * keyboard uses" filter shows only usedByBase groups.
   */
  usedByBase: boolean;
}

// ---------------------------------------------------------------------------
// Browsing-block table
// ---------------------------------------------------------------------------

interface BlockDef {
  name: string;
  start: number;
  end: number;
}

/**
 * Codepoint ranges reused by TWO consumers: the Common-scoped
 * punctuation/symbol tier scan below (COMMON_PUNCTUATION_CHARS) and the
 * "Common" entry in CHARACTER_MAP_BLOCKS just below — a single source of
 * truth so the ranges a "Common"-tagged char is actually scanned against and
 * the block name it is labelled with never diverge. Basic Latin,
 * Latin-1 Supplement, General Punctuation, and Currency Symbols.
 * Deliberately NOT the full Script=Common set (which also covers dingbats/emoji/
 * technical symbols) — that long tail stays reachable only via the UI's U+XXXX
 * escape hatch. These are the ranges where ordinary punctuation (`.` `,` `?`
 * `!` `(` `)` `"` `'` `-` `:` `;` etc.) and currency signs (`€` `₦` `₵` `₹` — all
 * `Script=Common`, so no script's Script_Extensions enumeration would surface
 * them) actually live; currency signs are ordinary orthographic characters for
 * many target languages, not exotic symbols.
 */
const COMMON_PUNCTUATION_RANGES: readonly BlockDef[] = [
  { name: "Basic Latin", start: 0x0020, end: 0x007e },
  { name: "Latin-1 Supplement", start: 0x00a0, end: 0x00ff },
  { name: "General Punctuation", start: 0x2000, end: 0x206f },
  { name: "Currency Symbols", start: 0x20a0, end: 0x20cf },
];

/**
 * SEPARATE from cldr.ts's SCRIPT_BLOCKS (which stays a single coarse range
 * per script, calibrated for pickerCandidates()). This table is a NAME
 * OVERLAY for the character-map "browse everything in the script" tiers: it
 * does not gate which characters are candidates (categorizeScriptChars()
 * enumerates the full script via Script_Extensions for that), it only
 * supplies real human-readable section headers for the codepoint ranges it
 * covers. Scripts/codepoints with no entry here still get full coverage —
 * they fall back to a generic per-tier label (see TIER_FALLBACK_LABEL), and
 * for the block tier a combining mark falls back further to "Combining
 * marks" before "Letters" (see blockNameFor).
 *
 * Ranges + names pinned against the Unicode block chart
 * (https://www.unicode.org/charts/, cross-checked against
 * https://www.unicode.org/Public/16.0.0/ucd/Blocks.txt, the pinned copy of
 * which lives at lib/ucd/Blocks.txt). Entries are listed in ascending
 * start-codepoint order per script so the resulting groups come out in a
 * stable, human-sensible order.
 *
 * "Common" and the 23 single-block script entries below (Grek..Yiii) close
 * the gap where an entire uncurated script collapsed to the generic
 * per-tier label — each gets its ONE primary Unicode block (not every
 * extension block a script may touch) so its browse groups get a real
 * section header. "Common" reuses COMMON_PUNCTUATION_RANGES (rather than
 * re-listing the same four ranges a second time) plus the Spacing Modifier
 * Letters block that COMMON_MODIFIER_LETTER_CHARS scans — this is the
 * "Common" sentinel script tag that blockNameFor("Common", cp, tier)
 * actually receives (see blockTierCandidates/digitsTierCandidates/
 * punctuationTierCandidates, which tag every Common-scoped fold with the
 * literal string "Common").
 */
export const CHARACTER_MAP_BLOCKS: Record<string, BlockDef[]> = {
  // Latin is named comprehensively across every Latin-associated Unicode
  // block (not just the core ranges) so the "blocks my keyboard uses" filter
  // is precise: each real sub-block appears only when the keyboard actually
  // uses a character in THAT block, instead of a coarse "Letters" catch-all
  // lumping the expanded ranges (Phonetic Extensions, Latin Extended-C/D/E/F/G,
  // Fullwidth, etc.) together so one stray char surfaces all of them. Ranges
  // pinned against lib/ucd/Blocks.txt; ascending start-codepoint order.
  Latn: [
    { name: "Basic Latin", start: 0x0020, end: 0x007e },
    { name: "Latin-1 Supplement", start: 0x00a0, end: 0x00ff },
    { name: "Latin Extended-A", start: 0x0100, end: 0x017f },
    { name: "Latin Extended-B", start: 0x0180, end: 0x024f },
    { name: "IPA Extensions", start: 0x0250, end: 0x02af },
    { name: "Spacing Modifier Letters", start: 0x02b0, end: 0x02ff },
    { name: "Combining Diacritical Marks", start: 0x0300, end: 0x036f },
    { name: "Combining Diacritical Marks Extended", start: 0x1ab0, end: 0x1aff },
    { name: "Phonetic Extensions", start: 0x1d00, end: 0x1d7f },
    { name: "Phonetic Extensions Supplement", start: 0x1d80, end: 0x1dbf },
    { name: "Combining Diacritical Marks Supplement", start: 0x1dc0, end: 0x1dff },
    { name: "Latin Extended Additional", start: 0x1e00, end: 0x1eff },
    { name: "Superscripts and Subscripts", start: 0x2070, end: 0x209f },
    { name: "Letterlike Symbols", start: 0x2100, end: 0x214f },
    { name: "Latin Extended-C", start: 0x2c60, end: 0x2c7f },
    { name: "Modifier Tone Letters", start: 0xa700, end: 0xa71f },
    { name: "Latin Extended-D", start: 0xa720, end: 0xa7ff },
    { name: "Latin Extended-E", start: 0xab30, end: 0xab6f },
    { name: "Alphabetic Presentation Forms", start: 0xfb00, end: 0xfb4f },
    { name: "Combining Half Marks", start: 0xfe20, end: 0xfe2f },
    { name: "Halfwidth and Fullwidth Forms", start: 0xff00, end: 0xffef },
    { name: "Latin Extended-F", start: 0x10780, end: 0x107bf },
    { name: "Latin Extended-G", start: 0x1df00, end: 0x1dfff },
  ],
  Cyrl: [
    { name: "Combining Diacritical Marks", start: 0x0300, end: 0x036f },
    { name: "Cyrillic", start: 0x0400, end: 0x04ff },
    { name: "Cyrillic Supplement", start: 0x0500, end: 0x052f },
    { name: "Cyrillic Extended-A", start: 0x2de0, end: 0x2dff },
    { name: "Cyrillic Extended-B", start: 0xa640, end: 0xa69f },
  ],
  Arab: [
    { name: "Arabic", start: 0x0600, end: 0x06ff },
    { name: "Arabic Supplement", start: 0x0750, end: 0x077f },
    { name: "Arabic Extended-A", start: 0x08a0, end: 0x08ff },
  ],
  Deva: [
    { name: "Devanagari", start: 0x0900, end: 0x097f },
    { name: "Devanagari Extended", start: 0xa8e0, end: 0xa8ff },
  ],
  // Single primary block per script — closes the "zero curated entries"
  // gap for these CURATED_SCRIPTS members (order follows CURATED_SCRIPTS).
  Grek: [{ name: "Greek and Coptic", start: 0x0370, end: 0x03ff }],
  Armn: [{ name: "Armenian", start: 0x0530, end: 0x058f }],
  Geor: [{ name: "Georgian", start: 0x10a0, end: 0x10ff }],
  Hebr: [{ name: "Hebrew", start: 0x0590, end: 0x05ff }],
  Thaa: [{ name: "Thaana", start: 0x0780, end: 0x07bf }],
  Nkoo: [{ name: "NKo", start: 0x07c0, end: 0x07ff }],
  Adlm: [{ name: "Adlam", start: 0x1e900, end: 0x1e95f }],
  Cher: [{ name: "Cherokee", start: 0x13a0, end: 0x13ff }],
  Beng: [{ name: "Bengali", start: 0x0980, end: 0x09ff }],
  Taml: [{ name: "Tamil", start: 0x0b80, end: 0x0bff }],
  Telu: [{ name: "Telugu", start: 0x0c00, end: 0x0c7f }],
  Knda: [{ name: "Kannada", start: 0x0c80, end: 0x0cff }],
  Mlym: [{ name: "Malayalam", start: 0x0d00, end: 0x0d7f }],
  Sinh: [{ name: "Sinhala", start: 0x0d80, end: 0x0dff }],
  Thai: [{ name: "Thai", start: 0x0e00, end: 0x0e7f }],
  Laoo: [{ name: "Lao", start: 0x0e80, end: 0x0eff }],
  Mymr: [{ name: "Myanmar", start: 0x1000, end: 0x109f }],
  Khmr: [{ name: "Khmer", start: 0x1780, end: 0x17ff }],
  Tibt: [{ name: "Tibetan", start: 0x0f00, end: 0x0fff }],
  Ethi: [{ name: "Ethiopic", start: 0x1200, end: 0x137f }],
  Hira: [{ name: "Hiragana", start: 0x3040, end: 0x309f }],
  Kana: [{ name: "Katakana", start: 0x30a0, end: 0x30ff }],
  Yiii: [{ name: "Yi Syllables", start: 0xa000, end: 0xa48f }],
  // "Common" sentinel: reuses COMMON_PUNCTUATION_RANGES (single source of
  // truth with the punctuation-tier scan below) plus the Spacing Modifier
  // Letters block that COMMON_MODIFIER_LETTER_CHARS scans, so the
  // already-correct names those folds carry are actually consulted at
  // label time instead of falling through to the generic per-tier label.
  Common: [
    ...COMMON_PUNCTUATION_RANGES,
    { name: "Spacing Modifier Letters", start: 0x02b0, end: 0x02ff },
  ],
};

// ---------------------------------------------------------------------------
// Guardrails (exclude from ALL tiers)
// ---------------------------------------------------------------------------

function isControlCodePoint(cp: number): boolean {
  return (cp >= 0x0000 && cp <= 0x001f) || (cp >= 0x007f && cp <= 0x009f);
}

export function isPrivateUseCodePoint(cp: number): boolean {
  return (
    (cp >= 0xe000 && cp <= 0xf8ff) || // BMP Private Use Area
    (cp >= 0xf0000 && cp <= 0xffffd) || // Supplementary PUA-A (plane 15)
    (cp >= 0x100000 && cp <= 0x10fffd) // Supplementary PUA-B (plane 16)
  );
}

/**
 * Guardrail exclusion shared by every tier: control chars, PUA, noncharacters,
 * unassigned codepoints (\p{Cn}), and format chars (\p{Cf}) EXCEPT the
 * bidi-control allowlist the codebase already carries for direction-control
 * chars (isBidiControlCodePoint, CharacterDiscoveryServiceImpl.ts).
 *
 * The control/PUA/noncharacter range checks iterate EVERY codepoint of `ch`,
 * not just the first — a multi-codepoint grapheme is excluded if ANY of its
 * codepoints falls in one of those ranges. This mirrors the \p{Cn}/\p{Cf}
 * regex checks immediately below, which already scan the whole string; only
 * `parseUnicodeSet` (cldr.ts) happening to emit single-codepoint entries
 * today made the previous first-codepoint-only check safe in practice.
 */
function isGuardrailExcluded(ch: string): boolean {
  if (ch.length === 0) return true;
  for (const grapheme of ch) {
    const cp = grapheme.codePointAt(0);
    if (cp === undefined) return true;
    if (isControlCodePoint(cp)) return true;
    if (isPrivateUseCodePoint(cp)) return true;
    if (isNoncharacterCodePoint(cp)) return true;
  }
  if (/\p{Cn}/u.test(ch)) return true;
  const firstCp = ch.codePointAt(0);
  if (/\p{Cf}/u.test(ch) && (firstCp === undefined || !isBidiControlCodePoint(firstCp))) return true;
  return false;
}

/**
 * General_Category M — Mn (non-spacing), Mc (spacing combining), and Me
 * (enclosing) marks, exactly the set that must render on a dotted circle
 * when shown standalone (km-domain guidance). JS's native \p{Mn}/\p{Mc}/\p{Me}
 * Unicode property escapes cover this cheaply and precisely — no hardcoded
 * range table needed beyond what the browsing-block table already carries
 * (e.g. Combining Diacritical Marks, U+0300-036F). Deliberately does NOT use
 * canonical combining class (ccc): several Mc marks (e.g. Devanagari vowel
 * signs) have ccc=0 and would be missed by a ccc-based test. Also
 * deliberately excludes \p{Sk} modifier symbols (U+00B4 ACUTE ACCENT,
 * U+02DC SMALL TILDE, etc.) — those are free-standing, not marks that attach
 * to a base. (U+02CA MODIFIER LETTER ACUTE ACCENT is General_Category Lm, not
 * Sk, but is excluded from \p{M} for the same reason: it's a free-standing
 * letter, not an attaching mark.)
 */
export function isCombiningMarkChar(ch: string): boolean {
  return /^\p{M}$/u.test(ch);
}

// ---------------------------------------------------------------------------
// Script resolution
// ---------------------------------------------------------------------------

function primarySubtagOf(bcp47: string): string {
  const idx = bcp47.indexOf("-");
  return idx === -1 ? bcp47 : bcp47.slice(0, idx);
}

/**
 * Resolves the ISO 15924 script code driving the "block" tier: an explicit
 * script subtag on the tag wins; otherwise falls back to the langtags default
 * script for the primary language subtag. Returns undefined when no script
 * can be determined (main/auxiliary tiers can still populate from CLDR in
 * that case — only the block tier needs a script).
 */
function resolveScript(bcp47: string | undefined): string | undefined {
  if (bcp47 === undefined) return undefined;
  return scriptSubtagOf(bcp47) ?? getLanguageDefaults(primarySubtagOf(bcp47))?.defaultScript;
}

// ---------------------------------------------------------------------------
// Multi-script enumeration set
// ---------------------------------------------------------------------------

/**
 * Major living writing systems always enumerated alongside the resolved
 * target/base scripts, so the character map lets an author browse scripts
 * unrelated to their target language (e.g. checking a borrowed Greek letter).
 * Excludes the stubbed-out CJK scripts (Han/Hangul/Jpan/Kore/Hans/Hant — the
 * "not yet supported" Three-group routing stub, spec §9) since full-script
 * enumeration for those is neither useful nor cheap. Yiii (~1,200 codepoints)
 * and Ethi (~500 codepoints) are the largest scans in this list.
 */
const CURATED_SCRIPTS: readonly string[] = [
  "Latn",
  "Cyrl",
  "Grek",
  "Armn",
  "Geor",
  "Hebr",
  "Arab",
  "Syrc",
  "Thaa",
  "Nkoo",
  "Adlm",
  "Cher",
  "Deva",
  "Beng",
  "Taml",
  "Telu",
  "Knda",
  "Mlym",
  "Sinh",
  "Thai",
  "Laoo",
  "Mymr",
  "Khmr",
  "Tibt",
  "Ethi",
  "Hira",
  "Kana",
  "Yiii",
];

/**
 * De-duplicated union, preserving first-occurrence order — used both to build
 * the enumeration set (target script, then caller-supplied base scripts, then
 * CURATED_SCRIPTS) and, unchanged, as the script-group ordering priority
 * (§4 below): the author's own scripts lead, curated scripts follow.
 */
function dedupeScripts(scripts: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of scripts) {
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Block-tier candidate generation
// ---------------------------------------------------------------------------

/**
 * Generic label used when a codepoint falls outside every CHARACTER_MAP_BLOCKS
 * range for its script (including scripts absent from the table entirely).
 * "main"/"auxiliary" keep the pre-existing "Other" fallback; the three
 * full-script tiers fall back to their own tier name so an uncurated script
 * still gets a sensible section header instead of a meaningless "Other".
 * "Letters" is reserved for genuine leftover \p{L} in the block tier — an
 * uncurated combining mark there gets the more specific "Combining marks"
 * label instead (see blockNameFor), so it never sits under a "Letters"
 * header.
 */
const TIER_FALLBACK_LABEL: Record<CharacterMapTier, string> = {
  main: "Other",
  auxiliary: "Other",
  block: "Letters",
  digits: "Digits",
  punctuation: "Punctuation",
};

/**
 * Human-readable block name for a codepoint, given the char's attributed
 * script bucket (an ISO 15924 code, or the "Common" sentinel) and the tier it
 * was found in. Prefers a curated CHARACTER_MAP_BLOCKS section name (now
 * including a "Common" entry and a primary block for every CURATED_SCRIPTS
 * member except Syrc, so most scripts no longer fall through at all); falls
 * back to TIER_FALLBACK_LABEL otherwise. For the block tier specifically, an
 * UNCURATED combining mark (script/codepoint absent from
 * CHARACTER_MAP_BLOCKS) gets the generic "Combining marks" label rather than
 * "Letters" — deliberately NOT "Combining Diacritical Marks", which names one
 * real Unicode block (U+0300-036F); reusing it for a mark from a different
 * block (e.g. Tibetan U+0F71) would misname it. A curated range that already
 * names a real combining-marks block for a script (e.g. Cyrl's "Combining
 * Diacritical Marks" entry) still wins, since the range loop above runs
 * first. Combining marks bucket to whichever script's Script_Extensions
 * enumeration gathered them (e.g. Latn, Cyrl), so they DO pick up a curated
 * section name where that script's table carries one.
 */
function blockNameFor(script: string, cp: number, tier: CharacterMapTier): string {
  const defs = CHARACTER_MAP_BLOCKS[script];
  if (defs !== undefined) {
    for (const def of defs) {
      if (cp >= def.start && cp <= def.end) return def.name;
    }
  }
  if (tier === "block" && isCombiningMarkChar(String.fromCodePoint(cp))) return "Combining marks";
  return TIER_FALLBACK_LABEL[tier];
}

// ---------------------------------------------------------------------------
// Full-script enumeration (block / digits / punctuation tiers)
// ---------------------------------------------------------------------------

/**
 * Highest codepoint the full-script enumeration scans. Planes 0-2 (through
 * U+2FFFF) cover every modern Unicode script block, including SMP-resident
 * scripts (e.g. Adlam U+1E900, Osmanya U+10480, Bassa Vah U+16AD0) alongside
 * BMP ones — scanning through U+2FFFF instead of sweeping the full 0x10FFFF
 * range keeps a per-script enumeration to tens of milliseconds.
 */
const SCRIPT_ENUMERATION_END = 0x2ffff;

interface ScriptCategorizedChars {
  /** Letters (\p{L}) plus combining marks (Mn/Mc) — feeds the "block" tier. */
  letters: string[];
  /** Digits (\p{Nd} or \p{No}) — feeds the "digits" tier. */
  digits: string[];
  /** Punctuation/symbols (\p{P} or \p{S}) — feeds the "punctuation" tier. */
  punctuation: string[];
}

const EMPTY_CATEGORIZED: ScriptCategorizedChars = { letters: [], digits: [], punctuation: [] };

/**
 * Per-script cache: the U+20..U+2FFFF scan only needs to run once per
 * resolved script per process (this runs on language selection, not inside
 * the 300ms validator debounce cycle), not once per buildCharacterMap() call.
 */
const scriptCategorizedCache = new Map<string, ScriptCategorizedChars>();

/**
 * ISO 15924 alias/collection codes that the ECMAScript Unicode
 * Script_Extensions property does not recognize directly — `new
 * RegExp('\\p{Script_Extensions=<code>}', 'u')` throws for these — mapped to
 * the base Unicode Script value that carries their characters. Aran (Arabic,
 * Nastaliq variant) -> Arab; Latf/Latg (Fraktur/Gaelic Latin variants) ->
 * Latn; Syre/Syrj/Syrn (Estrangela/Western/Eastern Syriac) -> Syrc; the CJK
 * ideograph collections Hans/Hant/Jpan -> Hani; Kore -> Hang (Jpan/Kore are
 * routed to a "not yet supported" stub elsewhere, but must not throw here).
 */
const SCRIPT_ALIAS_MAP: Record<string, string> = {
  Aran: "Arab",
  Latf: "Latn",
  Latg: "Latn",
  Syre: "Syrc",
  Syrj: "Syrc",
  Syrn: "Syrc",
  Hans: "Hani",
  Hant: "Hani",
  Jpan: "Hani",
  Kore: "Hang",
};

/**
 * Enumerates every codepoint whose Script_Extensions includes `script` (an
 * ISO 15924 code, e.g. "Ethi", "Beng", "Latn" — exactly what resolveScript()
 * returns) across planes 0-2, split into the three category buckets used by
 * the block/digits/punctuation tiers. Guardrail-excluded codepoints (control,
 * PUA, noncharacter, unassigned, non-bidi-allowlisted format chars) never
 * enter any bucket. Digits use \p{Nd} OR \p{No} — Ethiopic numerals
 * (U+1369-137C) are General_Category No, not Nd, and would otherwise be
 * silently dropped from the digits tier. \p{Nl} (letter-numbers, e.g. Roman
 * numerals U+2160-2188) is deliberately EXCLUDED — those are Script=Latin
 * Nl codepoints that would otherwise pollute the digits tier for every
 * Latin-script language; no modern orthography types them as digits.
 * `script` is mapped through
 * SCRIPT_ALIAS_MAP before regex construction so ISO alias codes the
 * Unicode Script property doesn't recognize (Aran, Latf, Latg, Syre/Syrj/Syrn,
 * Hans/Hant/Jpan/Kore) still resolve instead of throwing; the try/catch
 * remains as a final safety net for any code neither the alias map nor the
 * Unicode property database recognizes.
 */
function categorizeScriptChars(script: string): ScriptCategorizedChars {
  const cached = scriptCategorizedCache.get(script);
  if (cached !== undefined) return cached;

  const scriptForEnumeration = SCRIPT_ALIAS_MAP[script] ?? script;
  let scriptRe: RegExp;
  try {
    scriptRe = new RegExp(`\\p{Script_Extensions=${scriptForEnumeration}}`, "u");
  } catch {
    // Not a script code the ECMAScript Unicode property database
    // recognizes — nothing to enumerate for it.
    scriptCategorizedCache.set(script, EMPTY_CATEGORIZED);
    return EMPTY_CATEGORIZED;
  }

  const letters: string[] = [];
  const digits: string[] = [];
  const punctuation: string[] = [];

  for (let cp = 0x20; cp <= SCRIPT_ENUMERATION_END; cp++) {
    const ch = String.fromCodePoint(cp);
    if (!scriptRe.test(ch)) continue;
    const nfc = ch.normalize("NFC");
    if (isGuardrailExcluded(nfc)) continue;

    if (/\p{L}/u.test(nfc) || isCombiningMarkChar(nfc)) {
      letters.push(nfc);
    } else if (/[\p{Nd}\p{No}]/u.test(nfc)) {
      digits.push(nfc);
    } else if (/[\p{P}\p{S}]/u.test(nfc)) {
      punctuation.push(nfc);
    }
  }

  const result: ScriptCategorizedChars = { letters, digits, punctuation };
  scriptCategorizedCache.set(script, result);
  return result;
}

// ---------------------------------------------------------------------------
// Common-scoped tiers (script-agnostic)
// ---------------------------------------------------------------------------

/**
 * ASCII decimal digits U+0030-0039. General_Category=Nd but Script=Common
 * with NO Script_Extensions override to any specific script, so
 * categorizeScriptChars()'s per-script \p{Script_Extensions=...} enumeration
 * never matches them — every Latin/Cyrillic/etc. language would otherwise
 * see an empty digits tier. Always folded into digitsTierCandidates()
 * regardless of the resolved script.
 */
const COMMON_DIGIT_CHARS: readonly string[] = Array.from({ length: 10 }, (_, i) =>
  String.fromCodePoint(0x30 + i),
);

/**
 * Computed once at module load (a ~350-codepoint scan, not per-call): every
 * \p{P}/\p{S} codepoint in COMMON_PUNCTUATION_RANGES, guardrail-filtered.
 * Always folded into punctuationTierCandidates() regardless of the resolved
 * script, same rationale as COMMON_DIGIT_CHARS.
 */
const COMMON_PUNCTUATION_CHARS: readonly string[] = (() => {
  const out: string[] = [];
  for (const range of COMMON_PUNCTUATION_RANGES) {
    for (let cp = range.start; cp <= range.end; cp++) {
      const ch = String.fromCodePoint(cp);
      if (isGuardrailExcluded(ch)) continue;
      if (/[\p{P}\p{S}]/u.test(ch)) out.push(ch);
    }
  }
  return out;
})();

/**
 * Codepoints U+02B0-02FF (the "Spacing Modifier Letters" block) that are
 * Script=Common with NO Script_Extensions override to any specific script —
 * so categorizeScriptChars()'s per-script \p{Script_Extensions=...}
 * enumeration never matches them, and they are not punctuation either (they
 * are \p{Lm}/\p{Sk}, not \p{P}/\p{S}), so they would otherwise appear in NO
 * tier for ANY language. The concrete casualty: U+02BB MODIFIER LETTER
 * TURNED COMMA, the Hawaiian/Polynesian ʻokina, a core orthographic letter.
 * (Codepoints in this block that DO carry a script override — e.g. U+02BC,
 * which has a Latn/Cyrl/etc. Script_Extensions override — fail the
 * `\p{Script_Extensions=Common}` test below and are excluded here so they
 * aren't double-folded; those are already surfaced by their own script's
 * enumeration.) Computed once at module load, guardrail-filtered. Always
 * folded into blockTierCandidates() regardless of the resolved script, same
 * rationale as COMMON_DIGIT_CHARS/COMMON_PUNCTUATION_CHARS.
 */
const COMMON_MODIFIER_LETTER_CHARS: readonly string[] = (() => {
  const out: string[] = [];
  for (let cp = 0x02b0; cp <= 0x02ff; cp++) {
    const ch = String.fromCodePoint(cp);
    if (isGuardrailExcluded(ch)) continue;
    if (!/\p{Script_Extensions=Common}/u.test(ch)) continue;
    if (!/[\p{Lm}\p{Sk}]/u.test(ch)) continue;
    out.push(ch);
  }
  return out;
})();

/**
 * A candidate character paired with the ISO 15924 script it is ATTRIBUTED
 * to — for the block/digits/punctuation tiers, the script whose
 * Script_Extensions enumeration gathered it (see categorizeScriptChars()),
 * not necessarily the char's own primary Unicode Script property. This is
 * what lets the studio's "show only my keyboard's scripts" filter hide a
 * foreign script's punctuation/combining marks along with the rest of that
 * script, rather than always showing them via a script-agnostic sentinel
 * bucket.
 */
interface ScriptTaggedChar {
  char: string;
  script: string;
}

/**
 * Concatenates every script's letters, each tagged with the SCRIPT THAT
 * GATHERED IT (a defensive copy of each scriptCategorizedCache entry — the
 * live cached array is never sorted in place, since buildCharacterMap()
 * sorts its own working arrays), across the whole enumeration set of
 * `scripts`. A char whose Script_Extensions matches more than one enumerated
 * script (e.g. a combining mark shared by several scripts) appears once per
 * matching script here; the global dedupe downstream in buildCharacterMap()
 * (stable sort + first-occurrence-wins) keeps only the FIRST script in
 * `scripts` order to gather it. The Common-scoped modifier-letter fold
 * (COMMON_MODIFIER_LETTER_CHARS) is appended ONCE at the end, tagged
 * "Common" — these are genuinely script-neutral, so the enumerating-script
 * attribution rule doesn't apply to them.
 */
function blockTierCandidates(scripts: readonly string[]): ScriptTaggedChar[] {
  const out: ScriptTaggedChar[] = [];
  for (const s of scripts) {
    for (const ch of categorizeScriptChars(s).letters) out.push({ char: ch, script: s });
  }
  for (const ch of COMMON_MODIFIER_LETTER_CHARS) out.push({ char: ch, script: "Common" });
  return out;
}

/**
 * Every script's digits, each tagged with the gathering script (see
 * blockTierCandidates), plus the Common-scoped ASCII digits tagged "Common",
 * appended ONCE at the end.
 */
function digitsTierCandidates(scripts: readonly string[]): ScriptTaggedChar[] {
  const out: ScriptTaggedChar[] = [];
  for (const s of scripts) {
    for (const ch of categorizeScriptChars(s).digits) out.push({ char: ch, script: s });
  }
  for (const ch of COMMON_DIGIT_CHARS) out.push({ char: ch, script: "Common" });
  return out;
}

/**
 * Every script's punctuation, each tagged with the gathering script (see
 * blockTierCandidates), plus the Common-scoped punctuation tagged "Common",
 * appended ONCE at the end.
 */
function punctuationTierCandidates(scripts: readonly string[]): ScriptTaggedChar[] {
  const out: ScriptTaggedChar[] = [];
  for (const s of scripts) {
    for (const ch of categorizeScriptChars(s).punctuation) out.push({ char: ch, script: s });
  }
  for (const ch of COMMON_PUNCTUATION_CHARS) out.push({ char: ch, script: "Common" });
  return out;
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

/**
 * Groups already-deduped, already-sorted (ascending codepoint) chars — all
 * belonging to the same script bucket `script` (an ISO 15924 code, or the
 * "Common" sentinel) — for one tier into CharacterMapGroup entries, keyed by
 * Unicode block name and tagged with `script`. Group order follows
 * first-encounter order of each block name, which — because input is
 * codepoint-sorted — comes out block-ascending for single-script candidate
 * sets.
 */
function groupByBlock(
  chars: string[],
  tier: CharacterMapTier,
  script: string,
  names: ReadonlyMap<number, string>,
  produced: ReadonlySet<string>,
): CharacterMapGroup[] {
  const groups = new Map<string, CharacterMapCell[]>();
  for (const ch of chars) {
    const cp = ch.codePointAt(0) ?? 0;
    const blockName = blockNameFor(script, cp, tier);
    const name = names.get(cp);
    const cell: CharacterMapCell =
      name === undefined
        ? { char: ch, isCombiningMark: isCombiningMarkChar(ch) }
        : { char: ch, isCombiningMark: isCombiningMarkChar(ch), name };
    const existing = groups.get(blockName);
    if (existing !== undefined) {
      existing.push(cell);
    } else {
      groups.set(blockName, [cell]);
    }
  }
  return [...groups.entries()].map(([block, cells]) => ({
    block,
    tier,
    cells,
    script,
    usedByBase: cells.some((c) => produced.has(c.char.normalize("NFC"))),
  }));
}

/**
 * Buckets already-deduped, already-sorted, already-script-tagged chars for
 * one tier by their attributed `script` tag, then groups each bucket via
 * groupByBlock(). Buckets are emitted in `scriptOrder` (the enumeration set
 * — target/base scripts first, then curated scripts — followed by
 * "Common"); any bucket not covered by `scriptOrder` (should not happen —
 * every tagged char's script is either "Common" or a script registered as
 * part of the current call's enumeration set — kept as a safety net so a
 * char is never silently dropped) is appended afterward in a deterministic
 * (sorted) order.
 */
function groupTierByScript(
  chars: readonly ScriptTaggedChar[],
  tier: CharacterMapTier,
  scriptOrder: readonly string[],
  names: ReadonlyMap<number, string>,
  produced: ReadonlySet<string>,
): CharacterMapGroup[] {
  const byScript = new Map<string, string[]>();
  for (const { char, script } of chars) {
    const bucket = byScript.get(script);
    if (bucket !== undefined) {
      bucket.push(char);
    } else {
      byScript.set(script, [char]);
    }
  }

  const out: CharacterMapGroup[] = [];
  const emitted = new Set<string>();
  for (const s of scriptOrder) {
    const bucket = byScript.get(s);
    if (bucket === undefined || emitted.has(s)) continue;
    emitted.add(s);
    out.push(...groupByBlock(bucket, tier, s, names, produced));
  }
  for (const s of [...byScript.keys()].sort()) {
    if (emitted.has(s)) continue;
    const bucket = byScript.get(s);
    if (bucket === undefined) continue;
    out.push(...groupByBlock(bucket, tier, s, names, produced));
  }
  return out;
}

function byCodepointAscending(a: string, b: string): number {
  return (a.codePointAt(0) ?? 0) - (b.codePointAt(0) ?? 0);
}

function taggedByCodepointAscending(a: ScriptTaggedChar, b: ScriptTaggedChar): number {
  return byCodepointAscending(a.char, b.char);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds the tiered, browsable, multi-script character-map candidate set for
 * the character map UI: CLDR main exemplars, then CLDR auxiliary exemplars,
 * then the enumerated scripts' remaining letters (+ combining marks), then
 * their digits, then their punctuation/symbols — grouped by (script, Unicode
 * block name), deduplicated globally (first tier to introduce a char wins).
 *
 * @param baseIr      Parsed KeyboardIR of the working-copy base. When `bcp47`
 *                    is omitted, its first header.bcp47 tag is used to resolve
 *                    CLDR exemplars and the target script. May be null when
 *                    no base is available yet — the function then degrades to
 *                    whatever `bcp47` alone can resolve.
 * @param bcp47       Target BCP47 tag. Drives both CLDR exemplar lookup and
 *                    (via an explicit script subtag or the langtags default
 *                    script) the resolved target script.
 * @param languageName Unused by candidate generation; accepted for interface
 *                    parity with the LLM-backed character-discovery calls
 *                    (synthesizeInventory) the studio's services layer also wires up.
 * @param opts.baseScripts Additional ISO 15924 script codes to enumerate
 *                    alongside the resolved target script — e.g. the base
 *                    keyboard's own script(s) when adapting into a different
 *                    target language. Included in the enumeration set (and
 *                    the group-ordering priority) right after the target
 *                    script and before CURATED_SCRIPTS.
 * @param opts.loader CldrFullLoader; defaults to the network-backed
 *                    createFetchCldrFullLoader() instance. Test-injection
 *                    hook only.
 */
export async function buildCharacterMap(
  baseIr: KeyboardIR | null,
  bcp47?: string,
  languageName?: string,
  opts?: { baseScripts?: readonly string[]; loader?: CldrFullLoader },
): Promise<CharacterMapGroup[]> {
  void languageName;
  const loader = opts?.loader ?? createFetchCldrFullLoader();
  // The Unicode name table is an OPTIONAL search enhancement (search-by-name).
  // It must never break the whole character map: if the lazily-loaded table
  // fails to load (bundler/asset issue, missing prebuild artifact, etc.),
  // degrade to no names rather than rejecting buildCharacterMap() — which would
  // surface as the pane's "Could not load the character map" error state.
  let names: ReadonlyMap<number, string>;
  try {
    names = await loadCharNames();
  } catch {
    names = new Map<number, string>();
  }

  // Static extraction of the base keyboard's own produced glyphs — drives
  // each group's `usedByBase` flag (see CharacterMapGroup), which the
  // studio's "blocks my keyboard uses" filter narrows to. Empty (not
  // computed) when there's no base to derive it from.
  const produced = new Set<string>(
    baseIr === null ? [] : producedGlyphs(baseIr).map((c) => c.normalize("NFC")),
  );

  const effectiveBcp47 = bcp47 ?? baseIr?.header.bcp47[0];
  const targetScript = resolveScript(effectiveBcp47);

  // Enumeration set: target script (if resolved), then caller-declared base
  // scripts, then the curated major-script list — de-duplicated union in
  // that priority order. Also doubles as the script-group ordering priority
  // (see groupTierByScript): the author's own scripts lead.
  const enumerationScripts = dedupeScripts([
    ...(targetScript === undefined ? [] : [targetScript]),
    ...(opts?.baseScripts ?? []),
    ...CURATED_SCRIPTS,
  ]);
  // The Common group (universal script-neutral folds) renders after the
  // related script groups.
  const scriptGroupOrder = [...enumerationScripts, "Common"];

  let mainRaw: string[] = [];
  let auxRaw: string[] = [];
  if (effectiveBcp47 !== undefined) {
    const exemplars = await loadExemplarsFromFull(effectiveBcp47, loader);
    if (exemplars !== null) {
      mainRaw = [...exemplars.used].filter((ch) => !isGuardrailExcluded(ch));
      auxRaw = exemplars.auxiliary.filter((ch) => !isGuardrailExcluded(ch));
    }
  }
  const blockRaw = blockTierCandidates(enumerationScripts);
  const digitsRaw = digitsTierCandidates(enumerationScripts);
  const punctuationRaw = punctuationTierCandidates(enumerationScripts);

  mainRaw.sort(byCodepointAscending);
  auxRaw.sort(byCodepointAscending);
  blockRaw.sort(taggedByCodepointAscending);
  digitsRaw.sort(taggedByCodepointAscending);
  punctuationRaw.sort(taggedByCodepointAscending);

  // The main/auxiliary tiers are the target language's own alphabet — every
  // char is tagged with the resolved target script (falling back to "Common"
  // in the unlikely case CLDR still yielded exemplars but no script resolved).
  const mainAuxScript = targetScript ?? "Common";
  const mainTagged: ScriptTaggedChar[] = mainRaw.map((char) => ({ char, script: mainAuxScript }));
  const auxTagged: ScriptTaggedChar[] = auxRaw.map((char) => ({ char, script: mainAuxScript }));

  // Global dedupe: first tier to introduce a char wins
  // (main > auxiliary > block > digits > punctuation). The winning
  // occurrence's script tag is the one that survives.
  const seen = new Set<string>();
  const dedupe = (chars: readonly ScriptTaggedChar[]): ScriptTaggedChar[] => {
    const out: ScriptTaggedChar[] = [];
    for (const tc of chars) {
      if (seen.has(tc.char)) continue;
      seen.add(tc.char);
      out.push(tc);
    }
    return out;
  };

  const mainChars = dedupe(mainTagged);
  const auxChars = dedupe(auxTagged);
  const blockChars = dedupe(blockRaw);
  const digitsChars = dedupe(digitsRaw);
  const punctuationChars = dedupe(punctuationRaw);

  return [
    ...groupTierByScript(mainChars, "main", scriptGroupOrder, names, produced),
    ...groupTierByScript(auxChars, "auxiliary", scriptGroupOrder, names, produced),
    ...groupTierByScript(blockChars, "block", scriptGroupOrder, names, produced),
    ...groupTierByScript(digitsChars, "digits", scriptGroupOrder, names, produced),
    ...groupTierByScript(punctuationChars, "punctuation", scriptGroupOrder, names, produced),
  ];
}
