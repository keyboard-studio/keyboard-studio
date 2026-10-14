import { describe, it, expect } from "vitest";
import { fontFamilyName } from "./fontFamilyNames.js";

/**
 * Build a minimal sfnt binary carrying one `name` table with the
 * given records — enough of the format for the reader (and shaped
 * exactly like a real font's directory + name table).
 */
function buildFont(
  records: Array<{ platformId: number; nameId: number; value: string }>,
): Uint8Array {
  const encode = (platformId: number, value: string): number[] => {
    if (platformId === 1) return [...value].map((c) => c.charCodeAt(0));
    const out: number[] = [];
    for (const c of value) out.push(0, c.charCodeAt(0));
    return out;
  };
  const strings: number[][] = records.map((r) => encode(r.platformId, r.value));
  const stringBytes = strings.flat();
  const headerSize = 6 + records.length * 12;
  const nameTable: number[] = [
    0, 0, // format 0
    (records.length >> 8) & 0xff, records.length & 0xff,
    (headerSize >> 8) & 0xff, headerSize & 0xff,
  ];
  let offset = 0;
  records.forEach((r, i) => {
    const len = strings[i]!.length;
    nameTable.push(
      (r.platformId >> 8) & 0xff, r.platformId & 0xff,
      0, r.platformId === 1 ? 0 : 9, // encoding (mac roman / win lang follows)
      0, 0x09, // language (en-US-ish; reader ignores it)
      (r.nameId >> 8) & 0xff, r.nameId & 0xff,
      (len >> 8) & 0xff, len & 0xff,
      (offset >> 8) & 0xff, offset & 0xff,
    );
    offset += len;
  });
  nameTable.push(...stringBytes);

  const nameOffset = 12 + 16; // offset table + one directory record
  const bytes: number[] = [
    0x00, 0x01, 0x00, 0x00, // sfnt version 1.0
    0, 1, // numTables
    0, 0, 0, 0, 0, 0, // search params (ignored)
    ..."name".split("").map((c) => c.charCodeAt(0)),
    0, 0, 0, 0, // checksum
    (nameOffset >> 24) & 0xff, (nameOffset >> 16) & 0xff, (nameOffset >> 8) & 0xff, nameOffset & 0xff,
    (nameTable.length >> 24) & 0xff, (nameTable.length >> 16) & 0xff, (nameTable.length >> 8) & 0xff, nameTable.length & 0xff,
    ...nameTable,
  ];
  return new Uint8Array(bytes);
}

describe("fontFamilyName", () => {
  it("reads a Windows-platform family (name ID 1, UTF-16BE)", () => {
    const font = buildFont([{ platformId: 3, nameId: 1, value: "Andika Afr" }]);
    expect(fontFamilyName(font)).toBe("Andika Afr");
  });

  it("prefers the typographic family (name ID 16) over ID 1", () => {
    const font = buildFont([
      { platformId: 3, nameId: 1, value: "Charis SIL" },
      { platformId: 3, nameId: 16, value: "Charis SIL Typo" },
    ]);
    expect(fontFamilyName(font)).toBe("Charis SIL Typo");
  });

  it("reads a Macintosh-platform record (name ID 1)", () => {
    const font = buildFont([{ platformId: 1, nameId: 1, value: "Gentium" }]);
    expect(fontFamilyName(font)).toBe("Gentium");
  });

  it("ignores non-family records (copyright, full name, version)", () => {
    const font = buildFont([
      { platformId: 3, nameId: 0, value: "Copyright nobody" },
      { platformId: 3, nameId: 4, value: "Andika Afr Regular" },
      { platformId: 3, nameId: 1, value: "Andika Afr" },
    ]);
    expect(fontFamilyName(font)).toBe("Andika Afr");
  });

  it("returns undefined for non-fonts, truncated fonts, and family-less fonts", () => {
    expect(fontFamilyName(new Uint8Array([1, 2, 3]))).toBeUndefined();
    expect(fontFamilyName(new TextEncoder().encode("not a font at all........"))).toBeUndefined();
    const familyLess = buildFont([{ platformId: 3, nameId: 4, value: "Only A Full Name" }]);
    expect(fontFamilyName(familyLess)).toBeUndefined();
    const truncated = buildFont([{ platformId: 3, nameId: 1, value: "Andika" }]).subarray(0, 20);
    expect(fontFamilyName(truncated)).toBeUndefined();
  });
});
