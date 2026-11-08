// TTF/OTF cmap coverage extraction (issue #2593) — a small self-contained
// reader, no new dependency. Sibling of fontFamilyNames.ts, same tolerant
// stance: any structural surprise yields undefined and the caller treats
// an unreadable font as contributing no coverage (never a false
// "missing glyph" finding).
//
// Only cmap formats 4 (BMP segment mapping — the common case) and 12
// (segmented coverage for the full Unicode range) are read in v1.
// Format 12 wins over format 4 when both are present (it covers
// everything format 4 does); within a format, a Windows (platform 3)
// subtable wins over a Unicode (platform 0) one. TTC collections,
// format 0/6/10/14 and WOFF wrappers are out of scope for v1 and yield
// undefined.
//
// The result is sorted, merged, inclusive codepoint ranges — the audit
// only ever asks membership questions, so ranges stay compact even for
// a format-12 group spanning thousands of codepoints.

import type { CodepointRange } from "@keyboard-studio/contracts";

function u16(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function u32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) * 0x1000000 +
      ((bytes[offset + 1] ?? 0) << 16) +
      ((bytes[offset + 2] ?? 0) << 8) +
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

/** Locate the `cmap` table in the SFNT directory; undefined when absent. */
function cmapTable(bytes: Uint8Array): { offset: number; length: number } | undefined {
  if (bytes.length < 12) return undefined;
  // TTC collections ('ttcf') have a different header — out of scope for v1.
  if (
    bytes[0] === 0x74 &&
    bytes[1] === 0x74 &&
    bytes[2] === 0x63 &&
    bytes[3] === 0x66
  ) {
    return undefined;
  }
  const numTables = u16(bytes, 4);
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    if (rec + 16 > bytes.length) return undefined;
    const tag = String.fromCharCode(
      bytes[rec] ?? 0,
      bytes[rec + 1] ?? 0,
      bytes[rec + 2] ?? 0,
      bytes[rec + 3] ?? 0,
    );
    if (tag === "cmap") {
      return { offset: u32(bytes, rec + 8), length: u32(bytes, rec + 12) };
    }
  }
  return undefined;
}

interface Subtable {
  format: number;
  platformId: number;
  offset: number;
}

/** Parse a format-4 subtable into covered ranges. */
function parseFormat4(
  bytes: Uint8Array,
  base: number,
  tableEnd: number,
): CodepointRange[] | undefined {
  if (base + 14 > tableEnd) return undefined;
  const length = u16(bytes, base + 2);
  const end = Math.min(tableEnd, base + length);
  const segCount = u16(bytes, base + 6) / 2;
  if (!Number.isInteger(segCount) || segCount === 0) return undefined;
  const endCodes = base + 14;
  const startCodes = endCodes + segCount * 2 + 2; // + reservedPad
  const idDeltas = startCodes + segCount * 2;
  const idRangeOffsets = idDeltas + segCount * 2;
  const glyphArray = idRangeOffsets + segCount * 2;
  if (glyphArray > end) return undefined;

  const ranges: CodepointRange[] = [];
  for (let i = 0; i < segCount; i++) {
    const endCode = u16(bytes, endCodes + i * 2);
    const startCode = u16(bytes, startCodes + i * 2);
    const delta = u16(bytes, idDeltas + i * 2);
    const rangeOffset = u16(bytes, idRangeOffsets + i * 2);
    if (startCode > endCode) return undefined;
    // A codepoint is covered iff its glyph id is non-zero. Resolve
    // per codepoint: segments are small in practice and correctness
    // beats cleverness (a glyphIdArray can hide a 0 mid-segment).
    let runStart = -1;
    for (let cp = startCode; cp <= endCode; cp++) {
      let glyph: number;
      if (rangeOffset === 0) {
        glyph = (cp + delta) & 0xffff;
      } else {
        const addr = idRangeOffsets + i * 2 + rangeOffset + (cp - startCode) * 2;
        if (addr + 2 > end) return undefined;
        glyph = u16(bytes, addr);
        if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
      }
      if (glyph !== 0) {
        if (runStart < 0) runStart = cp;
      } else if (runStart >= 0) {
        ranges.push({ start: runStart, end: cp - 1 });
        runStart = -1;
      }
    }
    if (runStart >= 0) ranges.push({ start: runStart, end: endCode });
  }
  return ranges;
}

/** Parse a format-12 subtable into covered ranges. */
function parseFormat12(
  bytes: Uint8Array,
  base: number,
  tableEnd: number,
): CodepointRange[] | undefined {
  if (base + 16 > tableEnd) return undefined;
  const length = u32(bytes, base + 4);
  const end = Math.min(tableEnd, base + length);
  const nGroups = u32(bytes, base + 12);
  const groups = base + 16;
  if (groups + nGroups * 12 > end) return undefined;
  const ranges: CodepointRange[] = [];
  for (let i = 0; i < nGroups; i++) {
    const rec = groups + i * 12;
    const start = u32(bytes, rec);
    const groupEnd = u32(bytes, rec + 4);
    const startGlyph = u32(bytes, rec + 8);
    if (start > groupEnd || groupEnd > 0x10ffff) return undefined;
    // A group whose glyphs start at 0 maps its range to the .notdef
    // glyph — those codepoints are NOT covered.
    if (startGlyph !== 0) ranges.push({ start, end: groupEnd });
  }
  return ranges;
}

/** Sort ranges and merge overlaps/adjacencies. */
function mergeRanges(ranges: CodepointRange[]): CodepointRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: CodepointRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last !== undefined && r.start <= last.end + 1) {
      if (r.end > last.end) last.end = r.end;
    } else {
      out.push({ ...r });
    }
  }
  return out;
}

/**
 * The codepoint ranges one TTF/OTF binary's cmap covers (formats 4 and
 * 12), sorted and merged. Undefined when the binary has no readable
 * cmap (not a font, truncated, TTC, WOFF, or an unsupported format).
 */
export function fontCoveredRanges(bytes: Uint8Array): CodepointRange[] | undefined {
  const table = cmapTable(bytes);
  if (table === undefined) return undefined;
  const tableEnd = Math.min(bytes.length, table.offset + table.length);
  if (table.offset + 4 > tableEnd) return undefined;
  const numTables = u16(bytes, table.offset + 2);
  const subtables: Subtable[] = [];
  for (let i = 0; i < numTables; i++) {
    const rec = table.offset + 4 + i * 8;
    if (rec + 8 > tableEnd) return undefined;
    subtables.push({
      platformId: u16(bytes, rec),
      offset: u32(bytes, rec + 4),
      format: 0, // filled in below from the subtable header
    });
  }
  // Pick the best subtable: format 12 over format 4, Windows platform
  // over Unicode, first-listed on ties.
  let best: Subtable | undefined;
  let bestScore = -1;
  for (const sub of subtables) {
    const at = table.offset + sub.offset;
    if (at + 2 > tableEnd) continue;
    const format = u16(bytes, at);
    if (format !== 4 && format !== 12) continue;
    const score = (format === 12 ? 2 : 0) + (sub.platformId === 3 ? 1 : 0);
    if (score > bestScore) {
      best = { ...sub, format };
      bestScore = score;
    }
  }
  if (best === undefined) return undefined;
  const at = table.offset + best.offset;
  const ranges =
    best.format === 12
      ? parseFormat12(bytes, at, tableEnd)
      : parseFormat4(bytes, at, tableEnd);
  if (ranges === undefined) return undefined;
  return mergeRanges(ranges);
}
