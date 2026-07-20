/**
 * buildCharacterMap — browsable/tiered candidate builder for the "Keyman
 * character map" UI (Phase B right pane).
 *
 * Unlike pickerCandidates() (a flat list scoped to CLDR-or-single-script-block),
 * this returns the FULL candidate set an author can browse — CLDR main
 * exemplars, then CLDR auxiliary (loanword) exemplars, then every other
 * character belonging to the resolved script's Unicode Script_Extensions
 * property, split into a "block" tier (letters + combining marks), a "digits"
 * tier (\p{Nd}/\p{No}), and a "punctuation" tier (\p{P}/\p{S}) — grouped by
 * human-readable Unicode block name where one is curated, or a generic
 * per-tier label otherwise. Script coverage is universal (any script
 * resolveScript() can name), not limited to a hardcoded list. It reuses the
 * same CLDR loading/parsing path as pickerCandidates (loadExemplarsFromFull /
 * parseUnicodeSet in cldr.ts) rather than re-implementing CLDR loading, and
 * never mutates SCRIPT_BLOCKS or scriptBlockChars — those stay picker-scoped
 * and calibrated-test-stable.
 *
 * Deduplication is GLOBAL across the whole return value (not per-tier, and
 * NOT against any user inventory — the UI itself marks already-selected
 * cells): each NFC grapheme appears in exactly one cell, in the first tier
 * that introduces it (main > auxiliary > block > digits > punctuation).
 */

import type { KeyboardIR } from "@keyboard-studio/contracts";
import type { CldrFullLoader } from "./cldr.js";
import { createFetchCldrFullLoader, loadExemplarsFromFull } from "./cldr.js";
import { isBidiControlCodePoint } from "./CharacterDiscoveryServiceImpl.js";
import { getLanguageDefaults } from "../langtags/index.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type CharacterMapTier = "main" | "auxiliary" | "block" | "digits" | "punctuation";

export interface CharacterMapCell {
  /** NFC grapheme the user can add to their alphabet. */
  char: string;
  /** True → the UI renders it over U+25CC dotted circle. */
  isCombiningMark: boolean;
}

export interface CharacterMapGroup {
  /** Human-readable Unicode block name, e.g. "Latin Extended-A". */
  block: string;
  tier: CharacterMapTier;
  cells: CharacterMapCell[];
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
 * SEPARATE from cldr.ts's SCRIPT_BLOCKS (which stays a single coarse range
 * per script, calibrated for pickerCandidates()). This table is a NAME
 * OVERLAY for the character-map "browse everything in the script" tiers: it
 * does not gate which characters are candidates (categorizeScriptChars()
 * enumerates the full script via Script_Extensions for that), it only
 * supplies real human-readable section headers for the codepoint ranges it
 * covers. Scripts/codepoints with no entry here still get full coverage —
 * they fall back to a generic per-tier label (see TIER_FALLBACK_LABEL).
 *
 * Ranges + names pinned against the Unicode block chart
 * (https://www.unicode.org/charts/, cross-checked against
 * https://www.unicode.org/Public/16.0.0/ucd/Blocks.txt). Entries are listed
 * in ascending start-codepoint order per script so the resulting groups come
 * out in a stable, human-sensible order.
 */
export const CHARACTER_MAP_BLOCKS: Record<string, BlockDef[]> = {
  Latn: [
    { name: "Basic Latin", start: 0x0020, end: 0x007e },
    { name: "Latin-1 Supplement", start: 0x00a0, end: 0x00ff },
    { name: "Latin Extended-A", start: 0x0100, end: 0x017f },
    { name: "Latin Extended-B", start: 0x0180, end: 0x024f },
    { name: "IPA Extensions", start: 0x0250, end: 0x02af },
    { name: "Spacing Modifier Letters", start: 0x02b0, end: 0x02ff },
    { name: "Combining Diacritical Marks", start: 0x0300, end: 0x036f },
    { name: "Latin Extended Additional", start: 0x1e00, end: 0x1eff },
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
};

// ---------------------------------------------------------------------------
// Guardrails (exclude from ALL tiers)
// ---------------------------------------------------------------------------

function isControlCodePoint(cp: number): boolean {
  return (cp >= 0x0000 && cp <= 0x001f) || (cp >= 0x007f && cp <= 0x009f);
}

function isPrivateUseCodePoint(cp: number): boolean {
  return (
    (cp >= 0xe000 && cp <= 0xf8ff) || // BMP Private Use Area
    (cp >= 0xf0000 && cp <= 0xffffd) || // Supplementary PUA-A (plane 15)
    (cp >= 0x100000 && cp <= 0x10fffd) // Supplementary PUA-B (plane 16)
  );
}

function isNoncharacterCodePoint(cp: number): boolean {
  if (cp >= 0xfdd0 && cp <= 0xfdef) return true;
  // The last two codepoints of every plane (…FFFE, …FFFF) are noncharacters.
  return (cp & 0xfffe) === 0xfffe;
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
 * Approximates General_Category Mn/Mc (combining marks). No full UCD property
 * table is available, but JS's native \p{Mn}/\p{Mc} Unicode property escapes
 * cover this cheaply and precisely — no hardcoded range table needed beyond
 * what the browsing-block table already carries (e.g. Combining Diacritical
 * Marks, U+0300–036F).
 */
function isCombiningMarkChar(ch: string): boolean {
  return /^[\p{Mn}\p{Mc}]$/u.test(ch);
}

// ---------------------------------------------------------------------------
// Script resolution
// ---------------------------------------------------------------------------

/**
 * Explicit ISO 15924 script subtag embedded in a BCP47 tag (e.g. the "Latn"
 * in "az-Latn"), if present. BCP47 script subtags are exactly 4 alpha chars,
 * appearing after the primary language subtag.
 */
function explicitScriptSubtag(bcp47: string): string | undefined {
  const parts = bcp47.split("-");
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (part !== undefined && /^[A-Za-z]{4}$/.test(part)) {
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    }
  }
  return undefined;
}

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
  return explicitScriptSubtag(bcp47) ?? getLanguageDefaults(primarySubtagOf(bcp47))?.defaultScript;
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
 */
const TIER_FALLBACK_LABEL: Record<CharacterMapTier, string> = {
  main: "Other",
  auxiliary: "Other",
  block: "Letters",
  digits: "Digits",
  punctuation: "Punctuation",
};

/**
 * Human-readable block name for a codepoint, given the resolved script and
 * the tier it was found in. Prefers a curated CHARACTER_MAP_BLOCKS section
 * name; falls back to TIER_FALLBACK_LABEL otherwise.
 */
function blockNameFor(script: string | undefined, cp: number, tier: CharacterMapTier): string {
  if (script !== undefined) {
    const defs = CHARACTER_MAP_BLOCKS[script];
    if (defs !== undefined) {
      for (const def of defs) {
        if (cp >= def.start && cp <= def.end) return def.name;
      }
    }
  }
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
 * enter any bucket. Digits use \p{Nd}, \p{No}, OR \p{Nl} — Ethiopic numerals
 * (U+1369-137C) are General_Category No, not Nd, and letter-numbers (e.g.
 * Roman numerals, Aegean/Cuneiform numerals) are Nl — either would otherwise
 * be silently dropped from the digits tier. `script` is mapped through
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
    } else if (/[\p{Nd}\p{No}\p{Nl}]/u.test(nfc)) {
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
 * Codepoint ranges scanned for the Common-scoped punctuation/symbol tier:
 * Basic Latin, Latin-1 Supplement, General Punctuation, and Currency Symbols.
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
 * Returns a defensive copy — never the live array cached inside
 * scriptCategorizedCache — since buildCharacterMap() sorts its result
 * in place.
 */
function blockTierCandidates(script: string | undefined): string[] {
  return script === undefined ? [] : [...categorizeScriptChars(script).letters];
}

/**
 * Script-specific digits (a defensive copy, see blockTierCandidates) plus the
 * Common-scoped ASCII digits, appended after — deduped globally downstream in
 * buildCharacterMap().
 */
function digitsTierCandidates(script: string | undefined): string[] {
  const scriptDigits = script === undefined ? [] : categorizeScriptChars(script).digits;
  return [...scriptDigits, ...COMMON_DIGIT_CHARS];
}

/**
 * Script-specific punctuation (a defensive copy, see blockTierCandidates)
 * plus the Common-scoped punctuation, appended after — deduped globally
 * downstream in buildCharacterMap().
 */
function punctuationTierCandidates(script: string | undefined): string[] {
  const scriptPunctuation = script === undefined ? [] : categorizeScriptChars(script).punctuation;
  return [...scriptPunctuation, ...COMMON_PUNCTUATION_CHARS];
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

/**
 * Groups already-deduped, already-sorted (ascending codepoint) chars for one
 * tier into CharacterMapGroup entries, keyed by Unicode block name. Group
 * order follows first-encounter order of each block name, which — because
 * input is codepoint-sorted — comes out block-ascending for single-script
 * candidate sets.
 */
function groupByBlock(
  chars: string[],
  tier: CharacterMapTier,
  script: string | undefined,
): CharacterMapGroup[] {
  const groups = new Map<string, CharacterMapCell[]>();
  for (const ch of chars) {
    const cp = ch.codePointAt(0) ?? 0;
    const blockName = blockNameFor(script, cp, tier);
    const cell: CharacterMapCell = { char: ch, isCombiningMark: isCombiningMarkChar(ch) };
    const existing = groups.get(blockName);
    if (existing !== undefined) {
      existing.push(cell);
    } else {
      groups.set(blockName, [cell]);
    }
  }
  return [...groups.entries()].map(([block, cells]) => ({ block, tier, cells }));
}

function byCodepointAscending(a: string, b: string): number {
  return (a.codePointAt(0) ?? 0) - (b.codePointAt(0) ?? 0);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds the tiered, browsable character-map candidate set for the character
 * map UI: CLDR main exemplars, then CLDR auxiliary exemplars, then the
 * resolved script's remaining letters (+ combining marks), then its digits,
 * then its punctuation/symbols — grouped by Unicode block name, deduplicated
 * globally (first tier to introduce a char wins).
 *
 * @param baseIr      Parsed KeyboardIR of the working-copy base. When `bcp47`
 *                    is omitted, its first header.bcp47 tag is used to resolve
 *                    CLDR exemplars and the browsing script. May be null when
 *                    no base is available yet — the function then degrades to
 *                    whatever `bcp47` alone can resolve.
 * @param bcp47       Target BCP47 tag. Drives both CLDR exemplar lookup and
 *                    (via an explicit script subtag or the langtags default
 *                    script) the "block" tier's script.
 * @param languageName Unused by candidate generation; accepted for interface
 *                    parity with the LLM-backed character-discovery calls
 *                    (synthesizeInventory) the studio's services layer also wires up.
 * @param loader      CldrFullLoader; defaults to the network-backed
 *                    createFetchCldrFullLoader() instance. Exposed as an
 *                    optional trailing parameter (not part of the reviewed
 *                    3-arg shape) purely for test injection — every existing
 *                    3-argument call site is unaffected.
 */
export async function buildCharacterMap(
  baseIr: KeyboardIR | null,
  bcp47?: string,
  languageName?: string,
  loader: CldrFullLoader = createFetchCldrFullLoader(),
): Promise<CharacterMapGroup[]> {
  void languageName;

  const effectiveBcp47 = bcp47 ?? baseIr?.header.bcp47[0];
  const script = resolveScript(effectiveBcp47);

  let mainRaw: string[] = [];
  let auxRaw: string[] = [];
  if (effectiveBcp47 !== undefined) {
    const exemplars = await loadExemplarsFromFull(effectiveBcp47, loader);
    if (exemplars !== null) {
      mainRaw = [...exemplars.used].filter((ch) => !isGuardrailExcluded(ch));
      auxRaw = exemplars.auxiliary.filter((ch) => !isGuardrailExcluded(ch));
    }
  }
  const blockRaw = blockTierCandidates(script);
  const digitsRaw = digitsTierCandidates(script);
  const punctuationRaw = punctuationTierCandidates(script);

  mainRaw.sort(byCodepointAscending);
  auxRaw.sort(byCodepointAscending);
  blockRaw.sort(byCodepointAscending);
  digitsRaw.sort(byCodepointAscending);
  punctuationRaw.sort(byCodepointAscending);

  // Global dedupe: first tier to introduce a char wins
  // (main > auxiliary > block > digits > punctuation).
  const seen = new Set<string>();
  const dedupe = (chars: string[]): string[] => {
    const out: string[] = [];
    for (const ch of chars) {
      if (seen.has(ch)) continue;
      seen.add(ch);
      out.push(ch);
    }
    return out;
  };

  const mainChars = dedupe(mainRaw);
  const auxChars = dedupe(auxRaw);
  const blockChars = dedupe(blockRaw);
  const digitsChars = dedupe(digitsRaw);
  const punctuationChars = dedupe(punctuationRaw);

  return [
    ...groupByBlock(mainChars, "main", script),
    ...groupByBlock(auxChars, "auxiliary", script),
    ...groupByBlock(blockChars, "block", script),
    ...groupByBlock(digitsChars, "digits", script),
    ...groupByBlock(punctuationChars, "punctuation", script),
  ];
}
