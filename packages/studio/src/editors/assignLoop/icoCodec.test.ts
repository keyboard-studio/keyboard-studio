import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  base64ToIco,
  decodeIco,
  encodeIco,
  icoToBase64,
} from "./icoCodec.ts";
import { ICON_SIZE, type Rgba } from "./iconTools.ts";

const here = dirname(fileURLToPath(import.meta.url));

function solidPixels(
  r: number,
  g: number,
  b: number,
  a = 255,
): Uint8ClampedArray<ArrayBuffer> {
  const px = new Uint8ClampedArray(ICON_SIZE * ICON_SIZE * 4);
  for (let i = 0; i < px.length; i += 4) {
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = a;
  }
  return px;
}

function readU16LE(bytes: Uint8Array, o: number): number {
  return bytes[o] | (bytes[o + 1] << 8);
}

function readU32LE(bytes: Uint8Array, o: number): number {
  return (bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24)) >>> 0;
}

describe("encodeIco", () => {
  it("writes a valid ICONDIR header", () => {
    const ico = encodeIco(
      { width: ICON_SIZE, height: ICON_SIZE, pixels: solidPixels(255, 0, 0) },
      [16],
    );
    expect(readU16LE(ico, 0)).toBe(0); // reserved
    expect(readU16LE(ico, 2)).toBe(1); // type = ICO
    expect(readU16LE(ico, 4)).toBe(1); // one image
  });

  it("writes one ICONDIRENTRY per requested size", () => {
    const ico = encodeIco(
      { width: ICON_SIZE, height: ICON_SIZE, pixels: solidPixels(0, 255, 0) },
      [16, 32, 48],
    );
    expect(readU16LE(ico, 4)).toBe(3);
    // Entry sizes recorded in the directory.
    expect(ico[6]).toBe(16);
    expect(ico[6 + 16]).toBe(32);
    expect(ico[6 + 32]).toBe(48);
    // bytesInRes / imageOffset point inside the file.
    for (let i = 0; i < 3; i++) {
      const o = 6 + i * 16;
      const size = readU32LE(ico, o + 8);
      const offset = readU32LE(ico, o + 12);
      expect(size).toBeGreaterThan(0);
      expect(offset + size).toBeLessThanOrEqual(ico.length);
    }
  });

  it("encodes 256px entries with a zero width byte", () => {
    const ico = encodeIco(
      { width: ICON_SIZE, height: ICON_SIZE, pixels: solidPixels(0, 0, 255) },
      [256],
    );
    expect(ico[6]).toBe(0); // 0 means 256 in ICONDIRENTRY
    expect(ico[7]).toBe(0);
  });

  it("round-trips base64 without loss", () => {
    const ico = encodeIco(
      { width: ICON_SIZE, height: ICON_SIZE, pixels: solidPixels(10, 20, 30) },
      [16, 32],
    );
    const back = base64ToIco(icoToBase64(ico));
    expect(back.length).toBe(ico.length);
    expect(Array.from(back)).toEqual(Array.from(ico));
  });
});

describe("decodeIco", () => {
  it("round-trips a solid color through BMP entries", async () => {
    const px = solidPixels(200, 100, 50);
    const ico = encodeIco(
      { width: ICON_SIZE, height: ICON_SIZE, pixels: px },
      [16],
    );
    const decoded = await decodeIco(ico);
    expect(decoded.width).toBe(16);
    expect(decoded.height).toBe(16);
    // Center pixel should be close to the source color (resample may
    // blur edges, but a solid fill stays solid).
    const i = (8 * 16 + 8) * 4;
    expect(decoded.pixels[i]).toBeGreaterThan(190);
    expect(decoded.pixels[i + 1]).toBeGreaterThan(90);
    expect(decoded.pixels[i + 2]).toBeGreaterThan(40);
    expect(decoded.pixels[i + 3]).toBe(255);
  });

  it("preserves 1-bit transparency via the AND mask", async () => {
    const px = solidPixels(255, 255, 255, 0); // fully transparent
    // Opaque red square in the middle (bounds relative to ICON_SIZE so
    // the test stays meaningful at any working resolution).
    const red: Rgba = [255, 0, 0, 255];
    const lo = Math.floor(ICON_SIZE / 4);
    const hi = Math.floor((ICON_SIZE * 3) / 4);
    for (let y = lo; y < hi; y++) {
      for (let x = lo; x < hi; x++) {
        const i = (y * ICON_SIZE + x) * 4;
        px[i] = red[0];
        px[i + 1] = red[1];
        px[i + 2] = red[2];
        px[i + 3] = red[3];
      }
    }
    const ico = encodeIco(
      { width: ICON_SIZE, height: ICON_SIZE, pixels: px },
      [48],
    );
    const decoded = await decodeIco(ico);
    // Corner should be transparent (AND mask applied).
    expect(decoded.pixels[3]).toBe(0);
    // Center of the red square should be opaque red.
    const c = (24 * 48 + 24) * 4;
    expect(decoded.pixels[c]).toBeGreaterThan(200);
    expect(decoded.pixels[c + 3]).toBe(255);
  });

  it("rejects non-ICO input", async () => {
    await expect(decodeIco(new Uint8Array([1, 2, 3]))).rejects.toThrow();
    await expect(
      decodeIco(new Uint8Array([0, 0, 2, 0, 1, 0])),
    ).rejects.toThrow(); // type 2 = CUR, not ICO
  });

  it("picks the largest entry", async () => {
    const ico = encodeIco(
      { width: ICON_SIZE, height: ICON_SIZE, pixels: solidPixels(1, 2, 3) },
      [16, 48, 32],
    );
    const decoded = await decodeIco(ico);
    expect(decoded.width).toBe(48);
  });
});

/**
 * Real-world .ico files (Keyman/TIKE and most Windows icon writers) store
 * 0 in the 32-bit BMP alpha byte for EVERY pixel and carry transparency
 * only in the 1-bit AND mask (0 = opaque, 1 = transparent). The decoder
 * must treat mask-0 + alpha-0 as OPAQUE, not transparent.
 *
 * `buildBmpIco` lays out bytes exactly like those files: ICONDIR + one
 * BITMAPINFOHEADER entry, bottom-up BGRA rows, AND mask bottom-up,
 * MSB-first, rows padded to 32 bits.
 */
function buildBmpIco(opts: {
  width: number;
  height: number;
  bitCount: 32 | 24;
  /** Top-down RGBA pixels (alpha byte as stored in the file). */
  rgba: Uint8ClampedArray<ArrayBuffer>;
  /** Top-down mask bits: true = transparent. Defaults to all opaque. */
  mask?: boolean[];
}): Uint8Array {
  const { width, height, bitCount, rgba, mask } = opts;
  const bpp = bitCount / 8;
  const pxStride = Math.ceil((width * bpp) / 4) * 4;
  const maskStride = Math.ceil(width / 32) * 4;
  const pxBytes = pxStride * height;
  const maskBytes = maskStride * height;
  const data = new Uint8Array(40 + pxBytes + maskBytes);
  const w32 = (o: number, v: number): void => {
    data[o] = v & 0xff;
    data[o + 1] = (v >> 8) & 0xff;
    data[o + 2] = (v >> 16) & 0xff;
    data[o + 3] = (v >> 24) & 0xff;
  };
  const w16 = (o: number, v: number): void => {
    data[o] = v & 0xff;
    data[o + 1] = (v >> 8) & 0xff;
  };
  w32(0, 40); // BITMAPINFOHEADER size
  w32(4, width);
  w32(8, height * 2); // ICO doubles the height (XOR + AND)
  w16(12, 1); // planes
  w16(14, bitCount);
  w32(16, 0); // BI_RGB

  // Pixels: BGRA, bottom-up.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4;
      const d = 40 + ((height - 1 - y) * pxStride + x * bpp);
      data[d] = rgba[s + 2]!;
      data[d + 1] = rgba[s + 1]!;
      data[d + 2] = rgba[s]!;
      if (bitCount === 32) data[d + 3] = rgba[s + 3]!;
    }
  }

  // AND mask: 1 = transparent, bottom-up, MSB first.
  if (mask) {
    const maskBase = 40 + pxBytes;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (mask[y * width + x]) {
          const d =
            maskBase + (height - 1 - y) * maskStride + (x >> 3);
          data[d] = (data[d] ?? 0) | (0x80 >> (x & 7));
        }
      }
    }
  }

  const out = new Uint8Array(6 + 16 + data.length);
  out[2] = 1; // type = ICO
  out[4] = 1; // one image
  out[6] = width;
  out[7] = height;
  out[6 + 4] = 1; // planes
  out[6 + 6] = bitCount;
  const size = data.length;
  out[6 + 8] = size & 0xff;
  out[6 + 9] = (size >> 8) & 0xff;
  out[6 + 10] = (size >> 16) & 0xff;
  out[6 + 11] = (size >> 24) & 0xff;
  const offset = 6 + 16;
  out[6 + 12] = offset & 0xff;
  out[6 + 13] = (offset >> 8) & 0xff;
  out[6 + 14] = (offset >> 16) & 0xff;
  out[6 + 15] = (offset >> 24) & 0xff;
  out.set(data, offset);
  return out;
}

/** 8x8 pixels with distinct RGB per pixel and a stored alpha byte of 0. */
function alphaZeroPixels(): Uint8ClampedArray<ArrayBuffer> {
  const px = new Uint8ClampedArray(8 * 8 * 4);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const i = (y * 8 + x) * 4;
      px[i] = 20 + x * 25;
      px[i + 1] = 30 + y * 25;
      px[i + 2] = 40;
      px[i + 3] = 0; // alpha byte 0, as real-world .ico files store it
    }
  }
  return px;
}

function alphaOf(decoded: { pixels: Uint8ClampedArray<ArrayBuffer> }): number[] {
  const out: number[] = [];
  for (let i = 3; i < decoded.pixels.length; i += 4) out.push(decoded.pixels[i]!);
  return out;
}

describe("decodeIco — real-world alpha-byte-0 icons", () => {
  it("treats alpha-0 + mask-opaque as opaque with correct RGB", async () => {
    const ico = buildBmpIco({
      width: 8,
      height: 8,
      bitCount: 32,
      rgba: alphaZeroPixels(),
      mask: new Array(64).fill(false),
    });
    const decoded = await decodeIco(ico);
    expect(decoded.width).toBe(8);
    expect(decoded.height).toBe(8);
    // Every pixel opaque…
    expect(alphaOf(decoded).every((a) => a === 255)).toBe(true);
    // …with its stored RGB intact (spot-check two corners, top-down).
    expect(Array.from(decoded.pixels.subarray(0, 3))).toEqual([20, 30, 40]);
    const last = (7 * 8 + 7) * 4;
    expect(Array.from(decoded.pixels.subarray(last, last + 3))).toEqual([
      20 + 7 * 25,
      30 + 7 * 25,
      40,
    ]);
  });

  it("honours the AND mask: mask-1 pixels stay transparent (Cameroon shape)", async () => {
    // Cameroon.ico: 16x16, alpha 0 on all 256 pixels, 36 mask-1
    // (transparent) / 220 mask-0 (opaque). Mirror the shape at 8x8.
    const mask = new Array(64).fill(false);
    for (let i = 0; i < 9; i++) mask[i] = true; // top row + 1 transparent
    mask[63] = true;
    const ico = buildBmpIco({
      width: 8,
      height: 8,
      bitCount: 32,
      rgba: alphaZeroPixels(),
      mask,
    });
    const decoded = await decodeIco(ico);
    const alphas = alphaOf(decoded);
    expect(alphas.filter((a) => a === 0).length).toBe(10);
    expect(alphas.filter((a) => a === 255).length).toBe(54);
    expect(decoded.pixels[3]).toBe(0); // top-left: mask-1
    const last = (7 * 8 + 7) * 4;
    expect(decoded.pixels[last + 3]).toBe(0); // bottom-right: mask-1
    const mid = (4 * 8 + 4) * 4;
    expect(decoded.pixels[mid + 3]).toBe(255); // middle: mask-0
  });

  it("preserves mid-alpha strokes where the mask agrees (yidgha shape)", async () => {
    // yidgha 16x16: 68 mid-alpha stroke pixels (mask 0), 188 alpha-0
    // pixels (mask 1). Strokes must survive; background stays transparent.
    const px = new Uint8ClampedArray(8 * 8 * 4);
    const mask = new Array(64).fill(true);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const i = (y * 8 + x) * 4;
        const stroke = x === y; // diagonal stroke
        px[i] = 10;
        px[i + 1] = 20;
        px[i + 2] = 30;
        px[i + 3] = stroke ? 128 : 0;
        mask[y * 8 + x] = !stroke;
      }
    }
    const ico = buildBmpIco({
      width: 8,
      height: 8,
      bitCount: 32,
      rgba: px,
      mask,
    });
    const decoded = await decodeIco(ico);
    const alphas = alphaOf(decoded);
    expect(alphas.filter((a) => a === 128).length).toBe(8);
    expect(alphas.filter((a) => a === 0).length).toBe(56);
    const diag = (3 * 8 + 3) * 4;
    expect(decoded.pixels[diag + 3]).toBe(128);
    expect(decoded.pixels[7]).toBe(0); // (x=1, y=0): off-diagonal background
  });

  it("decodes the real basic_kbdus.ico fixture: all pixels opaque", async () => {
    const bytes = new Uint8Array(
      readFileSync(
        resolve(
          here,
          "../../../tests/fixtures/walkBases/release/basic/basic_kbdus/source/basic_kbdus.ico",
        ),
      ),
    );
    const decoded = await decodeIco(bytes);
    expect(decoded.width).toBe(16);
    expect(decoded.height).toBe(16);
    // The fixture stores alpha 0 on all 256 pixels with an all-0 AND
    // mask (fully opaque). Before the fix this decoded to 0 visible px.
    expect(alphaOf(decoded).every((a) => a === 255)).toBe(true);
    // Background colour, top-left corner (stored RGB 198,194,192).
    expect(Array.from(decoded.pixels.subarray(0, 4))).toEqual([
      198, 194, 192, 255,
    ]);
    // The "K" letterform has dark stroke pixels.
    expect(decoded.pixels.some((v, i) => i % 4 === 0 && v < 100)).toBe(true);
  });

  it("still applies the AND mask to 24-bit entries", async () => {
    const px = new Uint8ClampedArray(8 * 8 * 4);
    for (let i = 0; i < px.length; i += 4) {
      px[i] = 200;
      px[i + 1] = 100;
      px[i + 2] = 50;
      px[i + 3] = 255;
    }
    const mask = new Array(64).fill(false);
    mask[0] = true;
    const ico = buildBmpIco({
      width: 8,
      height: 8,
      bitCount: 24,
      rgba: px,
      mask,
    });
    const decoded = await decodeIco(ico);
    expect(decoded.pixels[3]).toBe(0);
    expect(decoded.pixels[(1 * 8 + 1) * 4 + 3]).toBe(255);
  });
});
