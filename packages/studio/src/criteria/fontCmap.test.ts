import { describe, it, expect } from "vitest";
import { fontCoveredRanges } from "./fontCmap.js";

// ---------------------------------------------------------------------------
// Synthetic sfnt builders — enough of the format for the reader, shaped
// like a real font's directory + cmap table (cf. fontFamilyNames.test.ts).
// ---------------------------------------------------------------------------

function u16(n: number): number[] {
  return [(n >> 8) & 0xff, n & 0xff];
}

function u32(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

interface Segment {
  start: number;
  end: number;
  /** idDelta; default 0 (glyph id = codepoint). */
  delta?: number;
  /** Explicit glyph ids; when given, the segment resolves via glyphIdArray. */
  glyphs?: number[];
}

/** A format-4 subtable for the given segments (sentinel appended). */
function format4(segments: Segment[]): number[] {
  const segs: Segment[] = [...segments, { start: 0xffff, end: 0xffff, delta: 1 }];
  const segCount = segs.length;
  const segCountX2 = segCount * 2;
  const log2 = Math.floor(Math.log2(segCount));
  const searchRange = 2 * 2 ** log2;
  const entrySelector = log2;
  const rangeShift = segCountX2 - searchRange;

  const glyphArray: number[] = [];
  // Byte offset of the first glyph entry, relative to the subtable start.
  const glyphBase = 14 + segCount * 2 * 4 + 2;
  const rangeOffsets = segs.map((s) => {
    if (s.glyphs === undefined) return 0;
    const entryAddr = glyphBase + glyphArray.length * 2;
    const thisEntry = 14 + segCount * 2 * 3 + 2 + segs.indexOf(s) * 2;
    for (const g of s.glyphs) glyphArray.push(...u16(g));
    return entryAddr - thisEntry;
  });

  const body: number[] = [
    ...u16(4),
    0, 0, // length (patched below)
    ...u16(0), // language
    ...u16(segCountX2),
    ...u16(searchRange),
    ...u16(entrySelector),
    ...u16(rangeShift),
    ...segs.flatMap((s) => u16(s.end)),
    ...u16(0), // reservedPad
    ...segs.flatMap((s) => u16(s.start)),
    ...segs.flatMap((s) => u16((s.delta ?? 0) & 0xffff)),
    ...rangeOffsets.flatMap((r) => u16(r)),
    ...glyphArray,
  ];
  body[2] = (body.length >> 8) & 0xff;
  body[3] = body.length & 0xff;
  return body;
}

/** A format-12 subtable for the given groups. */
function format12(groups: Array<{ start: number; end: number; glyph: number }>): number[] {
  const body: number[] = [
    ...u16(12),
    ...u16(0), // reserved
    0, 0, 0, 0, // length (patched below)
    ...u32(0), // language
    ...u32(groups.length),
    ...groups.flatMap((g) => [...u32(g.start), ...u32(g.end), ...u32(g.glyph)]),
  ];
  const len = body.length;
  body[4] = (len >>> 24) & 0xff;
  body[5] = (len >>> 16) & 0xff;
  body[6] = (len >>> 8) & 0xff;
  body[7] = len & 0xff;
  return body;
}

function buildFont(
  subtables: Array<{ platform: number; encoding: number; data: number[] }>,
): Uint8Array {
  const headerSize = 4 + subtables.length * 8;
  const cmap: number[] = [0, 0, ...u16(subtables.length)];
  let offset = headerSize;
  const blobs: number[][] = [];
  for (const s of subtables) {
    cmap.push(...u16(s.platform), ...u16(s.encoding), ...u32(offset));
    blobs.push(s.data);
    offset += s.data.length;
  }
  for (const b of blobs) cmap.push(...b);

  const cmapOffset = 12 + 16; // offset table + one directory record
  const bytes: number[] = [
    0x00, 0x01, 0x00, 0x00, // sfnt version 1.0
    0, 1, // numTables
    0, 0, 0, 0, 0, 0, // search params (ignored)
    ..."cmap".split("").map((c) => c.charCodeAt(0)),
    0, 0, 0, 0, // checksum
    ...u32(cmapOffset),
    ...u32(cmap.length),
    ...cmap,
  ];
  return new Uint8Array(bytes);
}

describe("fontCoveredRanges", () => {
  it("reads a format-4 cmap (BMP segments, delta mapping)", () => {
    const font = buildFont([
      {
        platform: 3,
        encoding: 1,
        data: format4([
          { start: 0x41, end: 0x5a },
          { start: 0x61, end: 0x7a },
        ]),
      },
    ]);
    expect(fontCoveredRanges(font)).toEqual([
      { start: 0x41, end: 0x5a },
      { start: 0x61, end: 0x7a },
    ]);
  });

  it("does not count the 0xFFFF sentinel segment as covered", () => {
    const font = buildFont([
      { platform: 3, encoding: 1, data: format4([{ start: 0x41, end: 0x41 }]) },
    ]);
    const ranges = fontCoveredRanges(font);
    expect(ranges).toEqual([{ start: 0x41, end: 0x41 }]);
    expect(ranges?.some((r) => 0xffff >= r.start && 0xffff <= r.end)).toBe(false);
  });

  it("resolves glyphIdArray entries, and a 0 glyph means uncovered", () => {
    const font = buildFont([
      {
        platform: 3,
        encoding: 1,
        data: format4([{ start: 0x41, end: 0x43, glyphs: [1, 0, 3] }]),
      },
    ]);
    expect(fontCoveredRanges(font)).toEqual([
      { start: 0x41, end: 0x41 },
      { start: 0x43, end: 0x43 },
    ]);
  });

  it("reads a format-12 cmap, including astral planes", () => {
    const font = buildFont([
      {
        platform: 3,
        encoding: 10,
        data: format12([
          { start: 0x41, end: 0x5a, glyph: 1 },
          { start: 0x1d400, end: 0x1d419, glyph: 100 },
          { start: 0x25b, end: 0x25b, glyph: 0 },
        ]),
      },
    ]);
    expect(fontCoveredRanges(font)).toEqual([
      { start: 0x41, end: 0x5a },
      { start: 0x1d400, end: 0x1d419 },
    ]);
  });

  it("prefers format 12 over format 4 when both are present", () => {
    const font = buildFont([
      { platform: 3, encoding: 1, data: format4([{ start: 0x41, end: 0x5a }]) },
      { platform: 0, encoding: 4, data: format12([{ start: 0x61, end: 0x7a, glyph: 1 }]) },
    ]);
    expect(fontCoveredRanges(font)).toEqual([{ start: 0x61, end: 0x7a }]);
  });

  it("merges adjacent groups into one range", () => {
    const font = buildFont([
      {
        platform: 3,
        encoding: 10,
        data: format12([
          { start: 0x41, end: 0x42, glyph: 1 },
          { start: 0x43, end: 0x44, glyph: 5 },
        ]),
      },
    ]);
    expect(fontCoveredRanges(font)).toEqual([{ start: 0x41, end: 0x44 }]);
  });

  it("returns undefined for non-fonts, TTC, missing/truncated cmaps, and unsupported formats", () => {
    expect(fontCoveredRanges(new Uint8Array([1, 2, 3]))).toBeUndefined();
    expect(fontCoveredRanges(new TextEncoder().encode("not a font at all........"))).toBeUndefined();
    // TTC magic.
    const ttc = buildFont([
      { platform: 3, encoding: 1, data: format4([{ start: 0x41, end: 0x5a }]) },
    ]);
    ttc[0] = 0x74;
    ttc[1] = 0x74;
    ttc[2] = 0x63;
    ttc[3] = 0x66;
    expect(fontCoveredRanges(ttc)).toBeUndefined();
    // Truncated cmap.
    const truncated = buildFont([
      { platform: 3, encoding: 1, data: format4([{ start: 0x41, end: 0x5a }]) },
    ]).subarray(0, 24);
    expect(fontCoveredRanges(truncated)).toBeUndefined();
    // Format 6 only (unsupported in v1).
    const fmt6 = buildFont([
      { platform: 3, encoding: 1, data: [0, 6, 0, 20, 0, 0, 0, 65, 0, 1, 0, 1, 0, 2, 0, 3] },
    ]);
    expect(fontCoveredRanges(fmt6)).toBeUndefined();
  });
});
