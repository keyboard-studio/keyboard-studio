import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseKpsFonts } from "./parseKpsFonts.js";

// Real .kps content from the sil_cameroon_azerty keyboard.
const kpsText = readFileSync(
  "/home/user/keyboards/release/sil/sil_cameroon_azerty/source/sil_cameroon_azerty.kps",
  "utf8",
);

describe("parseKpsFonts", () => {
  describe("real sil_cameroon_azerty.kps", () => {
    it("AndikaAfr-R.ttf appears in oskFonts", () => {
      const { oskFonts } = parseKpsFonts(kpsText);
      expect(oskFonts.some((p) => p.includes("AndikaAfr-R.ttf"))).toBe(true);
    });

    it("AndikaAfr-R.ttf appears in fileFonts", () => {
      const { fileFonts } = parseKpsFonts(kpsText);
      expect(fileFonts.some((p) => p.includes("AndikaAfr-R.ttf"))).toBe(true);
    });

    it("oskFonts paths are raw (backslashes intact from the .kps)", () => {
      const { oskFonts } = parseKpsFonts(kpsText);
      // The .kps uses Windows-style paths; they must be returned raw so the
      // loader can normalize them with resolveKpsFontPath.
      expect(oskFonts[0]).toMatch(/\\/);
    });
  });

  describe("empty input", () => {
    it("returns empty arrays for empty string", () => {
      expect(parseKpsFonts("")).toEqual({ oskFonts: [], fileFonts: [] });
    });

    it("returns empty arrays for whitespace-only input", () => {
      expect(parseKpsFonts("   \n  ")).toEqual({
        oskFonts: [],
        fileFonts: [],
      });
    });
  });

  describe("<File> filtering", () => {
    it("excludes a <File> whose <FileType> is not .ttf or .otf", () => {
      const xml = `
        <Files>
          <File>
            <Name>splash.bmp</Name>
            <FileType>.bmp</FileType>
          </File>
          <File>
            <Name>readme.htm</Name>
            <FileType>.htm</FileType>
          </File>
        </Files>`;
      const { fileFonts } = parseKpsFonts(xml);
      expect(fileFonts).toEqual([]);
    });

    it("includes a <File> with <FileType>.ttf</FileType>", () => {
      const xml = `
        <Files>
          <File>
            <Name>MyFont.ttf</Name>
            <FileType>.ttf</FileType>
          </File>
        </Files>`;
      const { fileFonts } = parseKpsFonts(xml);
      expect(fileFonts).toEqual(["MyFont.ttf"]);
    });

    it("includes a <File> with <FileType>.otf</FileType>", () => {
      const xml = `
        <Files>
          <File>
            <Name>MyFont.otf</Name>
            <FileType>.otf</FileType>
          </File>
        </Files>`;
      const { fileFonts } = parseKpsFonts(xml);
      expect(fileFonts).toEqual(["MyFont.otf"]);
    });
  });

  describe("deduplication", () => {
    it("deduplicates repeated oskFont entries", () => {
      const xml = `
        <OSKFont>path/to/font.ttf</OSKFont>
        <OSKFont>path/to/font.ttf</OSKFont>`;
      const { oskFonts } = parseKpsFonts(xml);
      expect(oskFonts).toEqual(["path/to/font.ttf"]);
    });
  });
});
