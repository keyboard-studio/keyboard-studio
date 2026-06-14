import { describe, it, expect } from "vitest";
import { parseKpsFonts } from "./parseKpsFonts.js";

// Representative snippet of the real sil_cameroon_azerty.kps, inlined so the test
// is hermetic: CI checks out only keyboard-studio, not the sibling keymanapp/keyboards
// repo, so reading an absolute path into ../keyboards fails (ENOENT) in CI.
const kpsText = `<?xml version="1.0" encoding="utf-8"?>
<Package>
  <Options>
    <OSKFont>fonts\\AndikaAfr-R.ttf</OSKFont>
  </Options>
  <Files>
    <File>
      <Name>fonts\\AndikaAfr-R.ttf</Name>
      <FileType>.ttf</FileType>
    </File>
  </Files>
</Package>`;

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
      expect(parseKpsFonts("")).toEqual({ oskFonts: [], fileFonts: [], stylesheets: [] });
    });

    it("returns empty arrays for whitespace-only input", () => {
      expect(parseKpsFonts("   \n  ")).toEqual({
        oskFonts: [],
        fileFonts: [],
        stylesheets: [],
      });
    });
  });

  describe("<File> filtering", () => {
    it("excludes a <File> whose <FileType> is not .ttf, .otf, or .css", () => {
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
      const { fileFonts, stylesheets } = parseKpsFonts(xml);
      expect(fileFonts).toEqual([]);
      expect(stylesheets).toEqual([]);
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

  describe("stylesheets", () => {
    it("includes a <File> with <FileType>.css</FileType>", () => {
      const xml = `
        <Files>
          <File>
            <Name>sil_cameroon_qwerty.css</Name>
            <FileType>.css</FileType>
          </File>
        </Files>`;
      const { stylesheets } = parseKpsFonts(xml);
      expect(stylesheets).toEqual(["sil_cameroon_qwerty.css"]);
    });

    it("deduplicates repeated .css entries", () => {
      const xml = `
        <Files>
          <File>
            <Name>kb.css</Name>
            <FileType>.css</FileType>
          </File>
          <File>
            <Name>kb.css</Name>
            <FileType>.css</FileType>
          </File>
        </Files>`;
      const { stylesheets } = parseKpsFonts(xml);
      expect(stylesheets).toEqual(["kb.css"]);
    });

    it("separates fonts and stylesheets when both are present", () => {
      const xml = `
        <Files>
          <File>
            <Name>MyFont.ttf</Name>
            <FileType>.ttf</FileType>
          </File>
          <File>
            <Name>kb.css</Name>
            <FileType>.css</FileType>
          </File>
        </Files>`;
      const { fileFonts, stylesheets } = parseKpsFonts(xml);
      expect(fileFonts).toEqual(["MyFont.ttf"]);
      expect(stylesheets).toEqual(["kb.css"]);
    });
  });
});
