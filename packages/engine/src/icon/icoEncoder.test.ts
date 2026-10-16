import { describe, it, expect } from "vitest";
import { encodeIco, encodeIconSet, scaleRgba, ICO_SIZES, type RgbaImage } from "./icoEncoder.js";

function solidImage(size: number, r: number, g: number, b: number, a = 255): RgbaImage {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  return { width: size, height: size, data };
}

describe("encodeIco", () => {
  it("writes a valid ICONDIR header", () => {
    const ico = encodeIco([solidImage(16, 255, 0, 0)]);
    const view = new DataView(ico.buffer);
    expect(view.getUint16(0, true)).toBe(0); // reserved
    expect(view.getUint16(2, true)).toBe(1); // type = .ico
    expect(view.getUint16(4, true)).toBe(1); // count
  });

  it("encodes the issue #1550 minimum sizes (16/32/48)", () => {
    const ico = encodeIconSet(solidImage(64, 0, 128, 255));
    const view = new DataView(ico.buffer);
    expect(view.getUint16(4, true)).toBe(3);
    const widths = [0, 1, 2].map((i) => {
      const w = ico[6 + i * 16]!;
      return w === 0 ? 256 : w;
    });
    expect(widths).toEqual([16, 32, 48]);
  });

  it("stores BGRA pixels bottom-up", () => {
    // 2x2: top-left red, rest blue. Bottom-up DIB row 0 = image bottom row.
    const data = new Uint8Array([
      255, 0, 0, 255, 0, 0, 255, 255,
      0, 0, 255, 255, 0, 0, 255, 255,
    ]);
    const ico = encodeIco([{ width: 2, height: 2, data }]);
    const view = new DataView(ico.buffer);
    const dibOffset = view.getUint32(6 + 12, true);
    // DIB row 0 (image bottom): blue, blue -> BGRA (255,0,0,255)
    expect(ico[dibOffset + 40]).toBe(255);
    expect(ico[dibOffset + 41]).toBe(0);
    expect(ico[dibOffset + 42]).toBe(0);
    // DIB row 1 (image top): red, blue
    const row1 = dibOffset + 40 + 8;
    expect(ico[row1]).toBe(0); // B of red
    expect(ico[row1 + 2]).toBe(255); // R of red
  });

  it("derives the AND mask from the alpha channel", () => {
    // Fully transparent 8x8: AND mask bits set for each pixel.
    // 8px wide -> 4 bytes per AND row (1 data byte + 3 padding), 8 rows.
    const ico = encodeIco([solidImage(8, 0, 0, 0, 0)]);
    const view = new DataView(ico.buffer);
    const dibOffset = view.getUint32(6 + 12, true);
    const andOffset = dibOffset + 40 + 8 * 8 * 4;
    for (let row = 0; row < 8; row++) {
      // First byte of each row: all 8 pixels transparent -> 0xFF.
      expect(ico[andOffset + row * 4]).toBe(0xff);
      // Padding bytes are zero.
      expect(ico[andOffset + row * 4 + 1]).toBe(0);
      expect(ico[andOffset + row * 4 + 2]).toBe(0);
      expect(ico[andOffset + row * 4 + 3]).toBe(0);
    }
  });

  it("rejects non-square and mismatched inputs", () => {
    expect(() => encodeIco([])).toThrow();
    expect(() =>
      encodeIco([{ width: 16, height: 8, data: new Uint8Array(16 * 8 * 4) }]),
    ).toThrow();
    expect(() => encodeIco([{ width: 16, height: 16, data: new Uint8Array(10) }])).toThrow();
  });
});

describe("scaleRgba", () => {
  it("resamples to the target size", () => {
    const src = solidImage(64, 10, 20, 30);
    for (const size of ICO_SIZES) {
      const scaled = scaleRgba(src, size);
      expect(scaled.width).toBe(size);
      expect(scaled.height).toBe(size);
      expect(scaled.data.length).toBe(size * size * 4);
      // Solid color survives resampling.
      expect(scaled.data[0]).toBe(10);
      expect(scaled.data[1]).toBe(20);
      expect(scaled.data[2]).toBe(30);
    }
  });

  it("returns the input unchanged when sizes match", () => {
    const src = solidImage(32, 1, 2, 3);
    expect(scaleRgba(src, 32)).toBe(src);
  });
});
