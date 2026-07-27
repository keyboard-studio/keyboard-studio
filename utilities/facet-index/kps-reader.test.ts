/**
 * Shared `.kps` package reader unit tests (spec 043 T005; FR-004, Edge Cases).
 *
 * Covers the corpus `.kps` dialect (verified against `bambara.kps` — no
 * `<Targets>` element, `<Files>` carries the build outputs + welcome/license)
 * and the missing/malformed-`.kps` fallback path (never throws; returns the
 * empty package info).
 */

import { describe, it, expect } from "vitest";

import { readKpsPackage } from "./kps-reader.js";
import type { ScannedKeyboard, ScannedSource } from "./scan.js";

const KPS_PATH = "release/t/test/source/test.kps";

function makeKb(kpsXml: string | null): ScannedKeyboard {
  const sources: ScannedSource[] = [];
  if (kpsXml !== null) sources.push({ path: KPS_PATH, bytes: Buffer.from(kpsXml, "utf8") });
  return { id: "test", kpsPath: KPS_PATH, kmnPath: null, kmnText: null, sources };
}

/** The real bambara.kps shape: build outputs + welcome/license, one language, no <Targets>. */
const BAMBARA_LIKE = `<?xml version="1.0" encoding="utf-8"?>
<Package>
  <Options>
    <LicenseFile>..\\LICENSE.md</LicenseFile>
    <WelcomeFile>welcome.htm</WelcomeFile>
  </Options>
  <Files>
    <File><Name>..\\build\\test.kmx</Name><FileType>.kmx</FileType></File>
    <File><Name>..\\build\\test.js</Name><FileType>.js</FileType></File>
    <File><Name>..\\build\\test.kvk</Name><FileType>.kvk</FileType></File>
    <File><Name>welcome.htm</Name><FileType>.htm</FileType></File>
    <File><Name>..\\LICENSE.md</Name><FileType>.md</FileType></File>
  </Files>
  <Keyboards><Keyboard><ID>test</ID>
    <Languages><Language ID="bm">Bambara</Language></Languages>
  </Keyboard></Keyboards>
</Package>`;

describe("readKpsPackage", () => {
  it("reads the bambara-like corpus dialect: file extensions, language tag, license, welcome", () => {
    const info = readKpsPackage(makeKb(BAMBARA_LIKE));
    expect(info.present).toBe(true);
    expect([...info.fileExtensions].sort()).toEqual([".htm", ".js", ".kmx", ".kvk", ".md"]);
    expect(info.languageTags).toEqual(["bm"]);
    expect(info.hasLicenseFile).toBe(true);
    expect(info.licenseFilePath).toMatch(/LICENSE\.md/i);
    expect(info.hasWelcome).toBe(true);
    expect(info.hasOsk).toBe(true); // .kvk
    expect(info.hasModel).toBe(false);
    expect(info.hasIcon).toBe(false);
  });

  it("detects bundled fonts and OSK/display font references", () => {
    const xml = `<?xml version="1.0"?><Package><Files>
      <File><Name>fonts\\MyFont.ttf</Name><FileType>.ttf</FileType></File>
    </Files>
    <Keyboards><Keyboard><OSKFont>MyFont.ttf</OSKFont></Keyboard></Keyboards></Package>`;
    const info = readKpsPackage(makeKb(xml));
    expect(info.fontFiles.length).toBeGreaterThan(0);
    expect(info.oskFonts).toContain("MyFont.ttf");
    expect(info.fileExtensions.has(".ttf")).toBe(true);
  });

  it("detects a predictive model and an icon by extension", () => {
    const xml = `<?xml version="1.0"?><Package><Files>
      <File><Name>test.model.ts</Name><FileType>.ts</FileType></File>
      <File><Name>test.ico</Name><FileType>.ico</FileType></File>
    </Files></Package>`;
    const info = readKpsPackage(makeKb(xml));
    expect(info.hasModel).toBe(true);
    expect(info.hasIcon).toBe(true);
  });

  it("returns the empty package info for a missing .kps (never throws)", () => {
    const info = readKpsPackage(makeKb(null));
    expect(info.present).toBe(false);
    expect(info.fileExtensions.size).toBe(0);
    expect(info.languageTags).toEqual([]);
    expect(info.hasLicenseFile).toBe(false);
  });

  it("returns the empty package info for malformed XML (never throws)", () => {
    const info = readKpsPackage(makeKb("<Package><Files><File><Name>oops"));
    expect(info.present).toBe(true); // non-empty text is 'present'
    // A truncated <File> block yields no complete <Name></Name> match → no extensions.
    expect(info.fileExtensions.size).toBe(0);
    expect(info.languageTags).toEqual([]);
  });
});
