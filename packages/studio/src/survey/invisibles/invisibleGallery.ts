// invisibleGallery — the data behind the Invisible characters step's
// right-pane gallery (#1794, option (b)).
//
// The full format-character (Cf) inventory of the four blocks the issue
// names — Latin-1 Supplement, Arabic, General Punctuation, Arabic
// Presentation Forms-B — each entry's name verified against the pinned
// Unicode table (@keyboard-studio/contracts/unicode). Deliberately
// excluded: U+2065 (unassigned) and U+206A..U+206F (deprecated since
// Unicode 3.0 — offering dead characters would be a bug, not a feature).
//
// Static: the inventory does not depend on the language, the base
// keyboard, or the draft — the gallery pane builds its groups without
// the characterMapGroups fetch the alphabet/punctuation scopes need.
// Carried-over characters inside these four blocks are already in the
// inventory; a carried-over character OUTSIDE them (e.g. U+034F, reached
// by code point) stays visible in the in-step list only (FR-017).

import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import { toUPlusNotation } from "@keyboard-studio/contracts";
import { invisibleCharLabel } from "../../lib/irToCarveNodes.ts";
import {
  BIDI_CONTROL_CODE_POINTS,
  FIXED_INVISIBLE_CODE_POINTS,
  NEED_STATEMENTS,
} from "./invisibleCandidates.ts";
import { matchesQuery, type SearchFilters } from "../characterSearch.ts";

export type InvisibleGalleryBlock =
  | "Latin-1 Supplement"
  | "Arabic"
  | "General Punctuation"
  | "Arabic Presentation Forms-B";

/** One row of the pinned inventory: code point, block, and standard abbreviation (if any). */
interface InventoryRow {
  cp: number;
  block: InvisibleGalleryBlock;
  /** Unicode's standard abbreviation (ZWJ, RLM, …), or null where none exists. */
  abbr: string | null;
}

/**
 * The 29 offered code points, in code-point order. Abbreviations follow
 * Unicode's NamesList conventions; the seven Arabic entries with no
 * standard abbreviation (0600–0605, 06DD) render their 4-hex instead of
 * an invented code.
 */
export const INVISIBLE_GALLERY_INVENTORY: ReadonlyArray<InventoryRow> =
  Object.freeze([
    { cp: 0x00ad, block: "Latin-1 Supplement", abbr: "SHY" },
    { cp: 0x0600, block: "Arabic", abbr: null },
    { cp: 0x0601, block: "Arabic", abbr: null },
    { cp: 0x0602, block: "Arabic", abbr: null },
    { cp: 0x0603, block: "Arabic", abbr: null },
    { cp: 0x0604, block: "Arabic", abbr: null },
    { cp: 0x0605, block: "Arabic", abbr: null },
    { cp: 0x061c, block: "Arabic", abbr: "ALM" },
    { cp: 0x06dd, block: "Arabic", abbr: null },
    { cp: 0x200b, block: "General Punctuation", abbr: "ZWSP" },
    { cp: 0x200c, block: "General Punctuation", abbr: "ZWNJ" },
    { cp: 0x200d, block: "General Punctuation", abbr: "ZWJ" },
    { cp: 0x200e, block: "General Punctuation", abbr: "LRM" },
    { cp: 0x200f, block: "General Punctuation", abbr: "RLM" },
    { cp: 0x202a, block: "General Punctuation", abbr: "LRE" },
    { cp: 0x202b, block: "General Punctuation", abbr: "RLE" },
    { cp: 0x202c, block: "General Punctuation", abbr: "PDF" },
    { cp: 0x202d, block: "General Punctuation", abbr: "LRO" },
    { cp: 0x202e, block: "General Punctuation", abbr: "RLO" },
    { cp: 0x2060, block: "General Punctuation", abbr: "WJ" },
    { cp: 0x2061, block: "General Punctuation", abbr: "FA" },
    { cp: 0x2062, block: "General Punctuation", abbr: "IT" },
    { cp: 0x2063, block: "General Punctuation", abbr: "IS" },
    { cp: 0x2064, block: "General Punctuation", abbr: "IP" },
    { cp: 0x2066, block: "General Punctuation", abbr: "LRI" },
    { cp: 0x2067, block: "General Punctuation", abbr: "RLI" },
    { cp: 0x2068, block: "General Punctuation", abbr: "FSI" },
    { cp: 0x2069, block: "General Punctuation", abbr: "PDI" },
    { cp: 0xfeff, block: "Arabic Presentation Forms-B", abbr: "ZWNBSP" },
  ]);

/**
 * Fallback "you need this if…" statement for the eleven inventory
 * characters with no authored NEED_STATEMENTS entry (the Arabic number
 * signs U+0600–U+0605 and U+06DD, and the invisible math operators
 * U+2061–U+2064). Deliberately NOT the carried-over fallback: that one
 * says the author added the character by code point, which is false for
 * a character they are meeting here for the first time.
 */
export const UNLISTED_NEED_STATEMENT: MessageDescriptor = msg({
  id: "survey.invisibles.need.unlisted",
  message:
    "This invisible character has no usage note yet — keep it selected if your keyboard should produce it.",
});

/** The statement for a gallery cell — its authored entry, or the unlisted fallback. */
export function galleryNeedStatementFor(codePoint: number): MessageDescriptor {
  return NEED_STATEMENTS[codePoint] ?? UNLISTED_NEED_STATEMENT;
}

export interface InvisibleGalleryCell {
  codePoint: number;
  char: string;
  /** `"U+200C"` — the key `invisibleDecisions` is indexed by. */
  notation: string;
  /** Official Unicode name — never empty (SC-005-style guarantee, tested). */
  name: string;
  /** Standard abbreviation, or null — the cell renders the 4-hex instead. */
  abbreviation: string | null;
  need: MessageDescriptor;
}

export interface InvisibleGalleryGroup {
  /** Stable key, e.g. `"invisible-gallery:General Punctuation"`. */
  id: string;
  /** Block name (untranslated proper noun, like the other galleries), or the direction-controls descriptor. */
  heading: string | MessageDescriptor;
  cells: InvisibleGalleryCell[];
  /** True for the Direction controls section — the pane collapses it for non-RTL authors. */
  isDirectionSection: boolean;
}

/** `"ZERO WIDTH JOINER"` — the label the step itself would show for this cell. */
export function invisibleGalleryCellFor(row: InventoryRow): InvisibleGalleryCell {
  const char = String.fromCodePoint(row.cp);
  const notation = toUPlusNotation(char);
  return {
    codePoint: row.cp,
    char,
    notation,
    name: invisibleCharLabel(char) ?? `FORMAT CHARACTER (${notation})`,
    abbreviation: row.abbr,
    need: galleryNeedStatementFor(row.cp),
  };
}

// The bidi allowlist, minus the fixed five the step offers to every author
// (ZWJ, ZWNJ, ZWSP, SOFT HYPHEN, WORD JOINER): the step dedupes those into
// its "always" group, so the gallery files them under their blocks too —
// the two surfaces must agree on where a character lives.
const DIRECTION_CODE_POINTS: ReadonlySet<number> = new Set(
  BIDI_CONTROL_CODE_POINTS.filter(
    (cp) => !FIXED_INVISIBLE_CODE_POINTS.includes(cp),
  ),
);

const BLOCK_ORDER: ReadonlyArray<InvisibleGalleryBlock> = [
  "Latin-1 Supplement",
  "Arabic",
  "General Punctuation",
  "Arabic Presentation Forms-B",
];

const DIRECTION_HEADING: MessageDescriptor = msg({
  id: "survey.invisibles.bidiGroup.heading",
  message: "Direction controls",
});

/**
 * The gallery's sections: one per block in code-point order (blocks whose
 * every character is a direction control — Arabic Presentation Forms-B,
 * whose sole character is U+FEFF — contribute no standalone section),
 * then the Direction controls section. A character appears in exactly one
 * section (no duplicates); every cell carries its name, notation,
 * abbreviation and need statement — the SC-005-style test pins all four
 * non-empty.
 */
export function invisibleGalleryGroups(): InvisibleGalleryGroup[] {
  const byBlock = new Map<InvisibleGalleryBlock, InvisibleGalleryCell[]>();
  const direction: InvisibleGalleryCell[] = [];
  for (const row of INVISIBLE_GALLERY_INVENTORY) {
    const cell = invisibleGalleryCellFor(row);
    if (DIRECTION_CODE_POINTS.has(row.cp)) direction.push(cell);
    else {
      const list = byBlock.get(row.block) ?? [];
      list.push(cell);
      byBlock.set(row.block, list);
    }
  }
  const groups: InvisibleGalleryGroup[] = BLOCK_ORDER.filter((b) =>
    byBlock.has(b),
  ).map((block) => ({
    id: `invisible-gallery:${block}`,
    heading: block,
    cells: byBlock.get(block)!,
    isDirectionSection: false,
  }));
  if (direction.length > 0) {
    groups.push({
      id: "invisible-gallery:direction",
      heading: DIRECTION_HEADING,
      cells: direction,
      isDirectionSection: true,
    });
  }
  return groups;
}

/**
 * Search predicate for gallery cells — the pane's name/codepoint modes
 * via the shared matcher (cells carry the official name), plus the
 * abbreviation under the name filter (so "zwj" finds ZERO WIDTH
 * JOINER). The glyph/base-letter modes never match an invisible
 * character, honestly.
 */
export function matchesInvisibleQuery(
  cell: InvisibleGalleryCell,
  query: string,
  filters: SearchFilters,
): boolean {
  if (matchesQuery({ char: cell.char, name: cell.name }, query, filters)) {
    return true;
  }
  const q = query.trim().toLowerCase();
  return (
    q !== "" &&
    filters.name &&
    (cell.abbreviation?.toLowerCase().includes(q) ?? false)
  );
}
