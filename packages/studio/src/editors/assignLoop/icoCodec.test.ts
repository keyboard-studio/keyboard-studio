import { describe, expect, it } from "vitest";
import {
  base64ToIco,
  decodeIco,
  encodeIco,
  icoToBase64,
} from "./icoCodec.ts";
import { ICON_SIZE, type Rgba } from "./iconTools.ts";

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
