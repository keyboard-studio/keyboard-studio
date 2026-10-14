// TTF/OTF name-table family extraction (spec 084 Batch 3, criterion
// 8.7) — a small self-contained reader, no new dependency.
//
// The 8.7 check ("all fonts used are listed in the .kps <Files>")
// needs the FAMILY NAME of each font file the package bundles, and
// the family lives only inside the font binary's `name` table:
// name ID 16 (typographic family) preferred, else name ID 1 (family).
// Windows (platform 3) and Unicode (platform 0) records are UTF-16BE;
// Macintosh (platform 1) records are MacRoman — decoded here as
// Latin-1, which is exact for the ASCII range family names live in
// and never throws.
//
// The reader is deliberately forgiving: any structural surprise
// (truncated table, unknown sfnt flavour, CFF 'OTTO' wrapper — the
// name table is located by directory either way) yields undefined,
// and the caller treats an unreadable font as contributing no family
// (the 8.7 check then judges on what could be read).

interface NameRecord {
  platformId: number;
  nameId: number;
  value: string;
}

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

function decodeNameString(
  bytes: Uint8Array,
  platformId: number,
): string | undefined {
  if (bytes.length === 0) return undefined;
  if (platformId === 3 || platformId === 0) {
    // UTF-16BE.
    let out = "";
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      out += String.fromCharCode(((bytes[i] ?? 0) << 8) | (bytes[i + 1] ?? 0));
    }
    return out;
  }
  if (platformId === 1) {
    // MacRoman ≈ Latin-1 for ASCII; family names are ASCII in practice.
    let out = "";
    for (const b of bytes) out += String.fromCharCode(b);
    return out;
  }
  return undefined;
}

/** All decodable family-name records (IDs 16 and 1) of one font binary. */
function familyRecords(bytes: Uint8Array): NameRecord[] {
  if (bytes.length < 12) return [];
  const numTables = u16(bytes, 4);
  let nameOffset = -1;
  let nameLength = 0;
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    if (rec + 16 > bytes.length) break;
    const tag = String.fromCharCode(
      bytes[rec] ?? 0,
      bytes[rec + 1] ?? 0,
      bytes[rec + 2] ?? 0,
      bytes[rec + 3] ?? 0,
    );
    if (tag === "name") {
      nameOffset = u32(bytes, rec + 8);
      nameLength = u32(bytes, rec + 12);
      break;
    }
  }
  if (nameOffset < 0 || nameOffset + 6 > bytes.length) return [];
  const tableEnd = Math.min(bytes.length, nameOffset + nameLength);
  const count = u16(bytes, nameOffset + 2);
  const stringOffset = u16(bytes, nameOffset + 4);
  const records: NameRecord[] = [];
  for (let i = 0; i < count; i++) {
    const rec = nameOffset + 6 + i * 12;
    if (rec + 12 > tableEnd) break;
    const platformId = u16(bytes, rec);
    const nameId = u16(bytes, rec + 6);
    if (nameId !== 16 && nameId !== 1) continue;
    const length = u16(bytes, rec + 8);
    const offset = u16(bytes, rec + 10);
    const start = nameOffset + stringOffset + offset;
    if (start + length > tableEnd || length === 0) continue;
    const value = decodeNameString(bytes.subarray(start, start + length), platformId);
    const trimmed = value?.replace(/\0+$/u, "").trim();
    if (trimmed !== undefined && trimmed !== "") {
      records.push({ platformId, nameId, value: trimmed });
    }
  }
  return records;
}

/**
 * The family name of one TTF/OTF binary: name ID 16 (typographic
 * family) when present, else name ID 1; Windows-platform records win
 * over Macintosh ones at the same ID. Undefined when the binary has
 * no readable family record.
 */
export function fontFamilyName(bytes: Uint8Array): string | undefined {
  const records = familyRecords(bytes);
  for (const nameId of [16, 1]) {
    const atId = records.filter((r) => r.nameId === nameId);
    const win = atId.find((r) => r.platformId === 3 || r.platformId === 0);
    const chosen = win ?? atId[0];
    if (chosen !== undefined) return chosen.value;
  }
  return undefined;
}
