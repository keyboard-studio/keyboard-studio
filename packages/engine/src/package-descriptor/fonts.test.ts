// The produced package re-declares the fonts its starting keyboard
// packaged — every font file and its licence companions in `<Files>`, and the
// OSK/display selections on `<Keyboard>` (criteria 8, 9, 10). Both paths: GENERATE
// (adapt track, and the copy track's scaffolded descriptor) and PATCH (a
// descriptor that predates the fix).

import { describe, it, expect } from "vitest";
import { createVirtualFS, type PackageFontSet } from "@keyboard-studio/contracts";
import { buildKpsContent, packageFontKpsRef } from "./build.js";
import { applyIdentityToKps } from "./patch.js";
import { parseKpsFiles, parseKpsFontRefs } from "../start-browser/kps-parser.js";
import { resolveFilename } from "../output/kmpPaths.js";

const KMN = ["store(&TARGETS) 'any'", "begin Unicode > use(main)", "group(main) using keys", ""].join("\n");
const FONT = "shared/fonts/sil/andika_subsets/AndikaAfr-R.ttf";
const OFL = "shared/fonts/sil/andika_subsets/OFL.txt";
const FONTS: PackageFontSet = { files: [FONT, OFL], oskFont: FONT, displayFont: FONT };
const FONT_REF = "..\\..\\..\\shared\\fonts\\sil\\andika_subsets\\AndikaAfr-R.ttf";
const OFL_REF = "..\\..\\..\\shared\\fonts\\sil\\andika_subsets\\OFL.txt";
const IDENTITY = { displayName: "Ewondo", languageTag: "ewo" };

function textAt(vfs: ReturnType<typeof createVirtualFS>, path: string): string {
  const entry = vfs.get(path);
  if (entry === undefined || typeof entry.content !== "string") throw new Error(`no text entry at ${path}`);
  return entry.content;
}

function count(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

describe("packageFontKpsRef", () => {
  it("writes the keymanapp/keyboards reference from release/<group>/<id>/source/", () => {
    expect(packageFontKpsRef(FONT)).toBe(FONT_REF);
  });

  it("resolves, in the .kmp build, to the VFS key the font was written to", () => {
    expect(resolveFilename("source/ewondo.kps", packageFontKpsRef(FONT))).toBe(FONT);
    expect(resolveFilename("source/ewondo.kps", packageFontKpsRef(OFL))).toBe(OFL);
  });

  it("references a keyboard-local font beside the .kps", () => {
    expect(packageFontKpsRef("source/MyFont.ttf")).toBe("MyFont.ttf");
    expect(packageFontKpsRef("source/fonts/MyFont.ttf")).toBe("fonts\\MyFont.ttf");
    expect(resolveFilename("source/ewondo.kps", packageFontKpsRef("source/fonts/MyFont.ttf"))).toBe(
      "source/fonts/MyFont.ttf",
    );
  });
});

describe("buildKpsContent — packaged fonts (generate)", () => {
  it("lists every font file in <Files> with its file type", () => {
    const kps = buildKpsContent("ewondo", IDENTITY, KMN, "1.0", [], FONTS);
    const files = parseKpsFiles(kps);
    expect(files).toContainEqual({ name: FONT_REF, fileType: ".ttf" });
    expect(files).toContainEqual({ name: OFL_REF, fileType: ".txt" });
  });

  it("selects the OSK and display fonts on <Keyboard>, after <Version>", () => {
    const kps = buildKpsContent("ewondo", IDENTITY, KMN, "1.0", [], FONTS);
    expect(parseKpsFontRefs(kps)).toMatchObject({ oskFont: FONT_REF, displayFont: FONT_REF });
    expect(kps.indexOf("<OSKFont>")).toBeGreaterThan(kps.indexOf("<Version>"));
    expect(kps.indexOf("<DisplayFont>")).toBeLessThan(kps.indexOf("<Languages>"));
  });

  it("emits no font entries or selections when there are no fonts", () => {
    const kps = buildKpsContent("ewondo", IDENTITY, KMN, "1.0", []);
    expect(kps).not.toContain("shared\\fonts");
    expect(kps).not.toContain("<OSKFont>");
    expect(kps).not.toContain("<DisplayFont>");
  });
});

describe("applyIdentityToKps — packaged fonts", () => {
  it("generates a descriptor that declares the fonts (the adapt track)", () => {
    const vfs = createVirtualFS();
    const result = applyIdentityToKps(vfs, "ewondo", IDENTITY, KMN, "1.0", [], "ewondo", FONTS);
    const kps = textAt(vfs, "source/ewondo.kps");
    expect(result.generated).toBe(true);
    expect(count(kps, FONT_REF)).toBe(3); // <File>, <OSKFont>, <DisplayFont>
    expect(count(kps, OFL_REF)).toBe(1);
  });

  it("adds the fonts to a descriptor that lacks them, reporting each addition", () => {
    const vfs = createVirtualFS();
    vfs.set("source/ewondo.kps", buildKpsContent("ewondo", IDENTITY, KMN, "1.0", []), false);
    const result = applyIdentityToKps(vfs, "ewondo", IDENTITY, KMN, "1.0", [], "ewondo", FONTS);
    const kps = textAt(vfs, "source/ewondo.kps");

    expect(parseKpsFiles(kps).map((f) => f.name)).toEqual(expect.arrayContaining([FONT_REF, OFL_REF]));
    expect(parseKpsFontRefs(kps)).toMatchObject({ oskFont: FONT_REF, displayFont: FONT_REF });
    expect(result.warnings.filter((w) => w.includes("declared font"))).toHaveLength(4);
  });

  it("is a no-op on a descriptor that already declares them", () => {
    const vfs = createVirtualFS();
    vfs.set("source/ewondo.kps", buildKpsContent("ewondo", IDENTITY, KMN, "1.0", [], FONTS), false);
    const before = textAt(vfs, "source/ewondo.kps");
    const result = applyIdentityToKps(vfs, "ewondo", IDENTITY, KMN, "1.0", [], "ewondo", FONTS);
    expect(textAt(vfs, "source/ewondo.kps")).toBe(before);
    expect(result.warnings).toEqual([]);
  });

  it("keeps a selection the descriptor already makes", () => {
    const other = "..\\..\\..\\shared\\fonts\\other\\Other.ttf";
    const vfs = createVirtualFS();
    const start = buildKpsContent("ewondo", IDENTITY, KMN, "1.0", []).replace(
      "</Version>\n",
      `</Version>\n      <OSKFont>${other}</OSKFont>\n`,
    );
    vfs.set("source/ewondo.kps", start, false);
    applyIdentityToKps(vfs, "ewondo", IDENTITY, KMN, "1.0", [], "ewondo", FONTS);
    const kps = textAt(vfs, "source/ewondo.kps");
    expect(parseKpsFontRefs(kps)).toMatchObject({ oskFont: other, displayFont: FONT_REF });
    expect(count(kps, "<OSKFont>")).toBe(1);
  });
});
