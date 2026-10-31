import { describe, it, expect } from "vitest";
import type { TouchLayoutIR } from "@keyboard-studio/contracts";
import { checkTouchLayoutFontMismatch } from "./check-touch-font.js";
import {
  checkIndustryFonts,
  checkWoffInPackage,
} from "./check-package-fonts.js";
import { checkStrayScratchFiles } from "./check-scratch-files.js";
import { checkRegion001 } from "./check-bcp47.js";

const TL_PATH = "source/demo.keyman-touch-layout";
const KPS_PATH = "source/demo.kps";

function touchLayout(phoneFont?: string, tabletFont?: string): TouchLayoutIR {
  return {
    platforms: [
      { id: "phone", font: phoneFont, layers: [] },
      { id: "tablet", font: tabletFont, layers: [] },
    ],
    nodeIds: [],
  };
}

describe("checkTouchLayoutFontMismatch (7.20)", () => {
  it("passes when phone and tablet select the same font", () => {
    expect(
      checkTouchLayoutFontMismatch(
        touchLayout("Charis SIL", "Charis SIL"),
        TL_PATH,
      ).findings,
    ).toEqual([]);
  });

  it("flags differing phone and tablet fonts", () => {
    const { findings } = checkTouchLayoutFontMismatch(
      touchLayout("Charis SIL", "Gentium"),
      TL_PATH,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_TOUCH_LAYOUT_FONT_MISMATCH");
  });

  it("is silent when only one platform declares a font", () => {
    expect(
      checkTouchLayoutFontMismatch(touchLayout("Charis SIL"), TL_PATH).findings,
    ).toEqual([]);
    expect(
      checkTouchLayoutFontMismatch(touchLayout(undefined, "Gentium"), TL_PATH).findings,
    ).toEqual([]);
  });
});

describe("checkIndustryFonts (8.12)", () => {
  const base = {
    kpsFileNames: [] as string[],
    kpsFontRefs: [] as string[],
    touchFonts: [] as string[],
    kpsPath: KPS_PATH,
  };

  it("passes an openly licensed bundled font", () => {
    expect(
      checkIndustryFonts({
        ...base,
        kpsFileNames: ["..\\source\\CharisSIL.ttf"],
      }).findings,
    ).toEqual([]);
  });

  it("flags an industry font file in the .kps list", () => {
    const { findings } = checkIndustryFonts({
      ...base,
      kpsFileNames: ["..\\source\\Arial.ttf"],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_KPS_INDUSTRY_FONT");
  });

  it("flags an industry family string even when the file was renamed", () => {
    const { findings } = checkIndustryFonts({
      ...base,
      kvksFontFamily: "Times New Roman",
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("visual keyboard font");
  });

  it("flags Tahoma among the touch layout fonts", () => {
    const { findings } = checkIndustryFonts({ ...base, touchFonts: ["Tahoma"] });
    expect(findings).toHaveLength(1);
  });
});

describe("checkWoffInPackage (9.6)", () => {
  it("passes a package with only .ttf fonts", () => {
    expect(
      checkWoffInPackage(["source/CharisSIL.ttf"], ["CharisSIL.ttf"], KPS_PATH).findings,
    ).toEqual([]);
  });

  it("flags a .woff2 in the VFS inventory", () => {
    const { findings } = checkWoffInPackage(["source/font.woff2"], [], KPS_PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_WOFF_FONT_IN_PACKAGE");
  });

  it("flags a .woff named only in the .kps file list", () => {
    const { findings } = checkWoffInPackage(
      [],
      ["..\\source\\font.woff"],
      KPS_PATH,
    );
    expect(findings).toHaveLength(1);
  });
});

describe("checkStrayScratchFiles (1.13 foreign arm)", () => {
  it("passes a clean keyboard folder", () => {
    expect(
      checkStrayScratchFiles([
        "source/demo.kmn",
        "source/demo.kps",
        "HISTORY.md",
        "README.md",
      ]).findings,
    ).toEqual([]);
  });

  it("flags backup and scratch artefacts, naming them", () => {
    const { findings } = checkStrayScratchFiles([
      "source/demo.kmn",
      "source/demo.kmn.bak",
      "test.txt",
      ".DS_Store",
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_STRAY_SCRATCH_FILES");
    expect(findings[0]!.message).toContain("demo.kmn.bak");
    expect(findings[0]!.message).toContain("test.txt");
  });

  it("does not flag legitimate files merely containing 'test' in a longer name", () => {
    expect(
      checkStrayScratchFiles(
        ["source/protest_keyboard.kmn", "docs/latest.md"],
        "demo",
      ).findings,
    ).toEqual([]);
  });
});

describe("checkRegion001 (12.4)", () => {
  it("passes ordinary language-region tags", () => {
    expect(checkRegion001(["en-US", "ewo-CM", "fr"], "demo").findings).toEqual([]);
  });

  it("flags a tag with region subtag 001", () => {
    const { findings } = checkRegion001(["es-001"], "demo");
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_REGION_001_TAG");
    expect(findings[0]!.message).toContain("es-001");
  });

  it("does not flag 001 as a primary language subtag position artifact", () => {
    // "001" alone is not a tag shape parseKps/IR would produce; a
    // three-digit EXTENSION later in the tag is still region-position here.
    const { findings } = checkRegion001(["de-001"], "demo");
    expect(findings).toHaveLength(1);
  });
});
