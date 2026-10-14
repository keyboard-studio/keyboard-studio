// Tests for invisibleGallery.ts — the Invisible characters step's
// right-pane gallery data (#1794, option (b): the full format-character
// inventory of the four named blocks).
//
// The SC-005-style guarantee: every cell carries a non-empty name, its
// U+XXXX notation, an abbreviation (or hex fallback), and a need
// statement — a bare cell says nothing for a glyph-less character.

import { describe, it, expect } from "vitest";
import {
  INVISIBLE_GALLERY_INVENTORY,
  UNLISTED_NEED_STATEMENT,
  galleryNeedStatementFor,
  invisibleGalleryCellFor,
  invisibleGalleryGroups,
  matchesInvisibleQuery,
} from "./invisibleGallery.ts";
import {
  BIDI_CONTROL_CODE_POINTS,
  FIXED_INVISIBLE_CODE_POINTS,
  NEED_STATEMENTS,
} from "./invisibleCandidates.ts";
import { ALL_FILTERS } from "../characterSearch.ts";

describe("invisibleGallery inventory", () => {
  it("offers the full Cf inventory of the four named blocks: 29 code points, ordered, no duplicates", () => {
    const cps = INVISIBLE_GALLERY_INVENTORY.map((r) => r.cp);
    expect(cps).toHaveLength(29);
    expect(new Set(cps).size).toBe(29);
    expect([...cps].sort((a, b) => a - b)).toEqual(cps);
  });

  it("covers exactly the four blocks the issue names", () => {
    const blocks = new Set(INVISIBLE_GALLERY_INVENTORY.map((r) => r.block));
    expect(blocks).toEqual(
      new Set([
        "Latin-1 Supplement",
        "Arabic",
        "General Punctuation",
        "Arabic Presentation Forms-B",
      ]),
    );
  });

  it("excludes the unassigned U+2065 and the deprecated U+206A..U+206F", () => {
    const cps = new Set(INVISIBLE_GALLERY_INVENTORY.map((r) => r.cp));
    expect(cps.has(0x2065)).toBe(false);
    for (let cp = 0x206a; cp <= 0x206f; cp++) expect(cps.has(cp)).toBe(false);
  });

  it("every code point is a format character", () => {
    for (const { cp } of INVISIBLE_GALLERY_INVENTORY) {
      expect(/^\p{Cf}$/u.test(String.fromCodePoint(cp))).toBe(true);
    }
  });

  it("every cell has a non-empty name, notation, abbreviation-or-hex, and need statement", () => {
    for (const row of INVISIBLE_GALLERY_INVENTORY) {
      const cell = invisibleGalleryCellFor(row);
      expect(cell.name.length).toBeGreaterThan(0);
      expect(cell.notation).toMatch(/^U\+[0-9A-F]{4,6}$/);
      const standIn = cell.abbreviation ?? row.cp.toString(16).toUpperCase();
      expect(standIn.length).toBeGreaterThan(0);
      expect(cell.need.id.length).toBeGreaterThan(0);
    }
  });

  it("abbreviations are unique where present", () => {
    const abbrs = INVISIBLE_GALLERY_INVENTORY.map((r) => r.abbr).filter(
      (a): a is string => a !== null,
    );
    expect(new Set(abbrs).size).toBe(abbrs.length);
  });
});

describe("galleryNeedStatementFor", () => {
  it("returns the authored statement where one exists", () => {
    for (const cp of Object.keys(NEED_STATEMENTS).map(Number)) {
      expect(galleryNeedStatementFor(cp).id).toBe(NEED_STATEMENTS[cp]!.id);
    }
  });

  it("falls back to the unlisted statement — not the carried-over one — for the rest", () => {
    for (const cp of [0x0600, 0x0601, 0x0602, 0x0603, 0x0604, 0x0605, 0x06dd, 0x2061, 0x2062, 0x2063, 0x2064]) {
      const stmt = galleryNeedStatementFor(cp);
      expect(stmt.id).toBe(UNLISTED_NEED_STATEMENT.id);
      expect(stmt.id).not.toBe("survey.invisibles.need.carriedOver");
    }
  });
});

describe("invisibleGalleryGroups", () => {
  it("builds one section per block plus Direction controls, with no cell in two sections", () => {
    const groups = invisibleGalleryGroups();
    // Arabic Presentation Forms-B has no standalone section: its sole
    // character (U+FEFF) is a direction control, so it lives in the
    // Direction controls section instead of an empty block section.
    expect(groups.map((g) => g.id)).toEqual([
      "invisible-gallery:Latin-1 Supplement",
      "invisible-gallery:Arabic",
      "invisible-gallery:General Punctuation",
      "invisible-gallery:direction",
    ]);
    const seen = new Set<string>();
    for (const g of groups) {
      for (const cell of g.cells) {
        expect(seen.has(cell.notation)).toBe(false);
        seen.add(cell.notation);
      }
    }
    expect(seen.size).toBe(29);
  });

  it("every section's cells are in code-point order", () => {
    for (const g of invisibleGalleryGroups()) {
      const cps = g.cells.map((c) => c.codePoint);
      expect([...cps].sort((a, b) => a - b)).toEqual(cps);
    }
  });

  it("the Direction controls section holds the bidi allowlist minus the fixed five, which stay in their blocks", () => {
    const groups = invisibleGalleryGroups();
    const direction = groups.find((g) => g.isDirectionSection)!;
    const expected = BIDI_CONTROL_CODE_POINTS.filter(
      (cp) => !FIXED_INVISIBLE_CODE_POINTS.includes(cp),
    );
    expect(direction.cells.map((c) => c.codePoint).sort((a, b) => a - b)).toEqual(
      [...expected].sort((a, b) => a - b),
    );
    const general = groups.find((g) => g.id === "invisible-gallery:General Punctuation")!;
    for (const cp of [0x200b, 0x200c, 0x200d, 0x2060]) {
      expect(general.cells.some((c) => c.codePoint === cp)).toBe(true);
    }
  });
});

describe("matchesInvisibleQuery", () => {
  const zwj = invisibleGalleryCellFor({ cp: 0x200d, block: "General Punctuation", abbr: "ZWJ" });

  it("matches the abbreviation, the name, and the notation", () => {
    expect(matchesInvisibleQuery(zwj, "zwj", ALL_FILTERS)).toBe(true);
    expect(matchesInvisibleQuery(zwj, "joiner", ALL_FILTERS)).toBe(true);
    expect(matchesInvisibleQuery(zwj, "U+200D", ALL_FILTERS)).toBe(true);
    expect(matchesInvisibleQuery(zwj, "200d", ALL_FILTERS)).toBe(true);
  });

  it("does not match unrelated queries", () => {
    expect(matchesInvisibleQuery(zwj, "arabic", ALL_FILTERS)).toBe(false);
    expect(matchesInvisibleQuery(zwj, "   ", ALL_FILTERS)).toBe(false);
  });

  it("honors the name filter for abbreviations", () => {
    expect(
      matchesInvisibleQuery(zwj, "zwj", { ...ALL_FILTERS, name: false }),
    ).toBe(false);
  });
});
