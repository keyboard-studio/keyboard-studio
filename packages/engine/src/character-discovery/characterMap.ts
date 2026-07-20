/**
 * buildCharacterMap — browsable/tiered candidate builder for the "Keyman
 * character map" UI (Phase B right pane).
 *
 * Unlike pickerCandidates() (a flat list scoped to CLDR-or-single-script-block),
 * this returns the FULL candidate set an author can browse — CLDR main
 * exemplars, then CLDR auxiliary (loanword) exemplars, then the remaining
 * codepoints of the script's Unicode block(s) — grouped by human-readable
 * Unicode block name. It reuses the same CLDR loading/parsing path as
 * pickerCandidates (loadExemplarsFromFull / parseUnicodeSet in cldr.ts) rather
 * than re-implementing CLDR loading, and never mutates SCRIPT_BLOCKS or
 * scriptBlockChars — those stay picker-scoped and calibrated-test-stable.
 *
 * Deduplication is GLOBAL across the whole return value (not per-tier, and
 * NOT against any user inventory — the UI itself marks already-selected
 * cells): each NFC grapheme appears in exactly one cell, in the first tier
 * that introduces it (main > auxiliary > block).
 */

import type { KeyboardIR } from "@keyboard-studio/contracts";
import type { CldrFullLoader } from "./cldr.js";
import { createFetchCldrFullLoader, loadExemplarsFromFull, scriptBlockChars } from "./cldr.js";
import { isBidiControlCodePoint } from "./CharacterDiscoveryServiceImpl.js";
import { getLanguageDefaults } from "../langtags/index.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type CharacterMapTier = "main" | "auxiliary" | "block";

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
 * per script, calibrated for pickerCandidates()). This table is for the
 * character-map "browse everything in the script" tier and carries multiple
 * named sub-blocks per script so the UI can show real section headers.
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
 * Human-readable block name for a codepoint, given the resolved script. Falls
 * back to "Other" when the script has no CHARACTER_MAP_BLOCKS entry covering
 * the codepoint (including scripts absent from the table entirely).
 */
function blockNameFor(script: string | undefined, cp: number): string {
  if (script !== undefined) {
    const defs = CHARACTER_MAP_BLOCKS[script];
    if (defs !== undefined) {
      for (const def of defs) {
        if (cp >= def.start && cp <= def.end) return def.name;
      }
    }
  }
  return "Other";
}

/**
 * Candidate codepoints for the "block" tier, ascending by codepoint. Uses the
 * multi-block CHARACTER_MAP_BLOCKS table when the script has an entry;
 * otherwise degrades gracefully to the existing single-range
 * scriptBlockChars() (cldr.ts) so unlisted scripts still produce something.
 * Restricted to letters (\p{L}) and combining marks (\p{Mn}/\p{Mc}) — a
 * character map is for building an alphabet, not for browsing digits/punctuation
 * incidentally present in a block's numeric range.
 */
function blockTierCandidates(script: string | undefined): string[] {
  if (script === undefined) return [];

  const defs = CHARACTER_MAP_BLOCKS[script];
  if (defs === undefined) {
    return scriptBlockChars(script).filter((ch) => !isGuardrailExcluded(ch));
  }

  const chars: string[] = [];
  for (const def of defs) {
    for (let cp = def.start; cp <= def.end; cp++) {
      const ch = String.fromCodePoint(cp).normalize("NFC");
      if (isGuardrailExcluded(ch)) continue;
      if (!(/\p{L}/u.test(ch) || isCombiningMarkChar(ch))) continue;
      chars.push(ch);
    }
  }
  return chars;
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
    const blockName = blockNameFor(script, cp);
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
 * remaining codepoints of the script's browsing block(s) — grouped by Unicode
 * block name, deduplicated globally (first tier to introduce a char wins).
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

  mainRaw.sort(byCodepointAscending);
  auxRaw.sort(byCodepointAscending);
  blockRaw.sort(byCodepointAscending);

  // Global dedupe: first tier to introduce a char wins (main > auxiliary > block).
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

  return [
    ...groupByBlock(mainChars, "main", script),
    ...groupByBlock(auxChars, "auxiliary", script),
    ...groupByBlock(blockChars, "block", script),
  ];
}
