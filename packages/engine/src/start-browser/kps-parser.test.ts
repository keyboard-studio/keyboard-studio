import { describe, it, expect } from "vitest";
import { parseKps, parseKpsFontRefs } from "./kps-parser.js";

const BASIC_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Package>
  <Info>
    <Name value="US English (Basic)"/>
    <Version value="1.0"/>
    <Copyright value="SIL International"/>
  </Info>
  <Keyboards>
    <Keyboard>
      <Name>US English (Basic)</Name>
      <ID>basic_kbdus</ID>
      <Version>1.0</Version>
      <Languages>
        <Language ID="en-Latn" Name="English"/>
      </Languages>
      <Targets>windows macosx linux web</Targets>
    </Keyboard>
  </Keyboards>
</Package>`;

const DEVA_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Package>
  <Info>
    <Name value="SIL Devanagari Phonetic"/>
    <Version value="2.0"/>
  </Info>
  <Keyboards>
    <Keyboard>
      <Languages>
        <Language ID="hi-Deva" Name="Hindi"/>
        <Language ID="ne-Deva" Name="Nepali"/>
      </Languages>
      <Targets>windows macosx linux web mobile tablet</Targets>
    </Keyboard>
  </Keyboards>
</Package>`;

const NO_SCRIPT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Package>
  <Info>
    <Name value="Test Keyboard"/>
    <Version value="3.0"/>
  </Info>
  <Keyboards>
    <Keyboard>
      <Languages>
        <Language ID="en" Name="English"/>
      </Languages>
      <Targets>windows web</Targets>
    </Keyboard>
  </Keyboards>
</Package>`;

const TAG_CONTENT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Package>
  <Keyboards>
    <Keyboard>
      <Name>Legacy Keyboard</Name>
      <Version>7.0</Version>
      <Languages>
        <Language ID="ar-Arab" Name="Arabic"/>
      </Languages>
      <Targets>windows</Targets>
    </Keyboard>
  </Keyboards>
</Package>`;

describe("parseKps", () => {
  it("extracts displayName from Info/Name value attribute", () => {
    expect(parseKps(BASIC_XML).displayName).toBe("US English (Basic)");
  });

  it("extracts version from Info/Version value attribute", () => {
    expect(parseKps(BASIC_XML).version).toBe("1.0");
  });

  it("falls back to tag-content Name/Version when Info attributes absent", () => {
    const meta = parseKps(TAG_CONTENT_XML);
    expect(meta.displayName).toBe("Legacy Keyboard");
    expect(meta.version).toBe("7.0");
  });

  it("parses Latn script from en-Latn BCP47 language ID", () => {
    expect(parseKps(BASIC_XML).script).toBe("Latn");
  });

  it("parses Deva script from hi-Deva BCP47 language ID", () => {
    expect(parseKps(DEVA_XML).script).toBe("Deva");
  });

  it("parses Arab script from ar-Arab BCP47 language ID", () => {
    expect(parseKps(TAG_CONTENT_XML).script).toBe("Arab");
  });

  it("normalises script subtag to Title case", () => {
    const xml = BASIC_XML.replace('ID="en-Latn"', 'ID="en-lAtN"');
    expect(parseKps(xml).script).toBe("Latn");
  });

  it("defaults script to Latn when no four-letter subtag present", () => {
    expect(parseKps(NO_SCRIPT_XML).script).toBe("Latn");
  });

  it("parses targets as KeymanPlatformTarget array", () => {
    expect(parseKps(BASIC_XML).targets).toEqual([
      "windows",
      "macosx",
      "linux",
      "web",
    ]);
  });

  it("includes mobile and tablet in targets", () => {
    const targets = parseKps(DEVA_XML).targets;
    expect(targets).toContain("mobile");
    expect(targets).toContain("tablet");
  });

  it("filters out unknown target strings", () => {
    const xml = BASIC_XML.replace(
      "<Targets>windows macosx linux web</Targets>",
      "<Targets>windows unknown_target web</Targets>"
    );
    expect(parseKps(xml).targets).toEqual(["windows", "web"]);
  });

  it("defaults targets to ['windows'] when Targets element is empty", () => {
    const xml = BASIC_XML.replace(
      "<Targets>windows macosx linux web</Targets>",
      "<Targets></Targets>"
    );
    expect(parseKps(xml).targets).toEqual(["windows"]);
  });

  it("defaults version to 1.0 when Version element is absent", () => {
    const xml = `<Package><Info><Name value="X"/></Info><Keyboards><Keyboard><Languages><Language ID="en-Latn"/></Languages><Targets>windows</Targets></Keyboard></Keyboards></Package>`;
    expect(parseKps(xml).version).toBe("1.0");
  });

  it("uses first Language ID for script detection", () => {
    // First language is Latn; second is Deva — should pick Latn
    const xml = BASIC_XML.replace(
      '<Language ID="en-Latn" Name="English"/>',
      '<Language ID="en-Latn" Name="English"/><Language ID="hi-Deva" Name="Hindi"/>'
    );
    expect(parseKps(xml).script).toBe("Latn");
  });

  it("returns languages array with single language ID", () => {
    expect(parseKps(BASIC_XML).languages).toEqual(["en-Latn"]);
  });

  it("returns languages array with multiple language IDs", () => {
    expect(parseKps(DEVA_XML).languages).toEqual(["hi-Deva", "ne-Deva"]);
  });

  it("returns languages array for language ID without script subtag", () => {
    expect(parseKps(NO_SCRIPT_XML).languages).toEqual(["en"]);
  });

  it("returns empty languages array when no Language elements present", () => {
    const xml = `<Package><Info><Name value="X"/></Info><Keyboards><Keyboard><Targets>windows</Targets></Keyboard></Keyboards></Package>`;
    expect(parseKps(xml).languages).toEqual([]);
  });

  it("collects all languages even after script is found", () => {
    // Both languages should appear; script stays at the first detected one
    const xml = BASIC_XML.replace(
      '<Language ID="en-Latn" Name="English"/>',
      '<Language ID="en-Latn" Name="English"/><Language ID="fr-Latn" Name="French"/>'
    );
    const meta = parseKps(xml);
    expect(meta.languages).toEqual(["en-Latn", "fr-Latn"]);
    expect(meta.script).toBe("Latn");
  });
});

// ---------------------------------------------------------------------------
// Font and stylesheet extraction (parseKpsFontRefs)
// ---------------------------------------------------------------------------

// Representative snippet of the real sil_cameroon_azerty.kps, inlined so the
// test is hermetic: CI checks out only keyboard-studio, not the sibling
// keymanapp/keyboards repo, so reading an absolute path into ../keyboards
// fails (ENOENT) in CI.
const KPS_WITH_FONT = `<?xml version="1.0" encoding="utf-8"?>
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

describe("parseKpsFontRefs", () => {
  describe("real sil_cameroon_azerty.kps", () => {
    it("AndikaAfr-R.ttf appears in oskFonts", () => {
      const { oskFonts } = parseKpsFontRefs(KPS_WITH_FONT);
      expect(oskFonts.some((p) => p.includes("AndikaAfr-R.ttf"))).toBe(true);
    });

    it("AndikaAfr-R.ttf appears in fileFonts", () => {
      const { fileFonts } = parseKpsFontRefs(KPS_WITH_FONT);
      expect(fileFonts.some((p) => p.includes("AndikaAfr-R.ttf"))).toBe(true);
    });

    it("oskFonts paths are raw (backslashes intact from the .kps)", () => {
      const { oskFonts } = parseKpsFontRefs(KPS_WITH_FONT);
      // The .kps uses Windows-style paths; they must be returned raw so the
      // loader can normalize them with resolveKpsFontPath.
      expect(oskFonts[0]).toMatch(/\\/);
    });
  });

  describe("empty input", () => {
    it("returns empty arrays for empty string", () => {
      const { oskFonts, fileFonts, stylesheets } = parseKpsFontRefs("");
      expect(oskFonts).toEqual([]);
      expect(fileFonts).toEqual([]);
      expect(stylesheets).toEqual([]);
    });

    it("returns empty arrays for whitespace-only input", () => {
      const { oskFonts, fileFonts, stylesheets } = parseKpsFontRefs("   \n  ");
      expect(oskFonts).toEqual([]);
      expect(fileFonts).toEqual([]);
      expect(stylesheets).toEqual([]);
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
      const { fileFonts, stylesheets } = parseKpsFontRefs(xml);
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
      const { fileFonts } = parseKpsFontRefs(xml);
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
      const { fileFonts } = parseKpsFontRefs(xml);
      expect(fileFonts).toEqual(["MyFont.otf"]);
    });
  });

  describe("deduplication", () => {
    it("deduplicates repeated oskFont entries", () => {
      const xml = `
        <OSKFont>path/to/font.ttf</OSKFont>
        <OSKFont>path/to/font.ttf</OSKFont>`;
      const { oskFonts } = parseKpsFontRefs(xml);
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
      const { stylesheets } = parseKpsFontRefs(xml);
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
      const { stylesheets } = parseKpsFontRefs(xml);
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
      const { fileFonts, stylesheets } = parseKpsFontRefs(xml);
      expect(fileFonts).toEqual(["MyFont.ttf"]);
      expect(stylesheets).toEqual(["kb.css"]);
    });
  });
});
