// iconTools — initials generator tests (#1550).
//
// The pure helpers (deriveInitials, initialsTextColor, initialsFontSize)
// run anywhere. generateInitialsIcon's text raster goes through the DOM
// canvas (drawText), which jsdom does not implement — so the raster test
// stubs HTMLCanvasElement.getContext with a fake 2d context, and a second
// test pins the no-canvas degradation (flat background, no crash).

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  deriveInitials,
  generateInitialsIcon,
  getPixel,
  initialsFontSize,
  initialsTextColor,
  type Rgba,
} from "./iconTools.ts";

const BLUE: Rgba = [37, 99, 235, 255];
const WHITE: Rgba = [255, 255, 255, 255];
const BLACK: Rgba = [0, 0, 0, 255];

describe("deriveInitials", () => {
  it("takes the first letters of the first two words", () => {
    expect(deriveInitials("Ewondo Keyboard")).toBe("EK");
    expect(deriveInitials("Ibono")).toBe("IB");
    expect(deriveInitials("a b c")).toBe("AB");
  });

  it("takes two letters of a single word", () => {
    expect(deriveInitials("Ewondo")).toBe("EW");
    expect(deriveInitials("Q")).toBe("Q");
  });

  it("skips digits and punctuation, and yields empty for no letters", () => {
    expect(deriveInitials("123 456")).toBe("");
    expect(deriveInitials("")).toBe("");
    expect(deriveInitials("K-12 Keyboard")).toBe("KK");
  });
});

describe("initialsTextColor", () => {
  it("is white on dark backgrounds, black on light ones", () => {
    expect(initialsTextColor(BLUE)).toEqual(WHITE);
    expect(initialsTextColor(BLACK)).toEqual(WHITE);
    expect(initialsTextColor(WHITE)).toEqual(BLACK);
    expect(initialsTextColor([250, 204, 21, 255])).toEqual(BLACK); // yellow
  });
});

describe("initialsFontSize", () => {
  it("shrinks as the initials grow so every length fits 48px", () => {
    expect(initialsFontSize("E")).toBe(28);
    expect(initialsFontSize("EK")).toBe(20);
    expect(initialsFontSize("EKB")).toBe(14);
  });
});

describe("generateInitialsIcon", () => {
  it("fills the flat background with no initials", () => {
    const px = generateInitialsIcon("", BLUE);
    expect(getPixel(px, 0, 0)).toEqual(BLUE);
    expect(getPixel(px, 47, 47)).toEqual(BLUE);
    expect(getPixel(px, 24, 24)).toEqual(BLUE);
  });

  it("degrades to the flat background when the canvas API is absent (jsdom)", () => {
    // drawText no-ops without a 2d context; the generator must not crash
    // and must still produce the background.
    const px = generateInitialsIcon("EK", BLUE);
    for (const [x, y] of [[0, 0], [47, 47], [24, 24]] as const) {
      expect(getPixel(px, x, y)).toEqual(BLUE);
    }
  });

  it("draws the initials centred in the contrasting colour (stubbed canvas)", () => {
    // Fake 2d context: every measured text is 20px wide; every read-back
    // pixel is fully opaque, so drawText copies the whole text block.
    const fakeCtx = {
      font: "",
      fillStyle: "",
      textBaseline: "",
      imageSmoothingEnabled: false,
      measureText: () => ({ width: 20 }),
      fillText: () => {},
      getImageData: (_x: number, _y: number, w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4).fill(255),
        width: w,
        height: h,
      }),
    };
    const spy = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(fakeCtx as unknown as CanvasRenderingContext2D);
    try {
      const px = generateInitialsIcon("EK", BLUE);
      // 20px-wide text on a 48px canvas centres at x = 14; size 20 centres
      // at y = (48-20)/2 - 4 = 10 (the -4 compensates drawText's +4 offset).
      expect(getPixel(px, 14, 10)).toEqual(WHITE);
      expect(getPixel(px, 33, 37)).toEqual(WHITE);
      // Outside the text block the flat background shows through.
      expect(getPixel(px, 13, 10)).toEqual(BLUE);
      expect(getPixel(px, 0, 0)).toEqual(BLUE);
      expect(getPixel(px, 47, 47)).toEqual(BLUE);
    } finally {
      spy.mockRestore();
    }
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
