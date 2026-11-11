/**
 * icoCodec — hand-rolled ICO encode/decode (no dependencies).
 *
 * ICO file layout:
 *   ICONDIR (6 bytes): reserved=0, type=1, count
 *   ICONDIRENTRY (16 bytes each): width, height, colors, reserved,
 *     planes, bitCount, bytesInRes, imageOffset
 *   Image data per entry: BMP (BITMAPINFOHEADER + pixels + AND mask)
 *     or PNG (Vista+; decoded via createImageBitmap in the browser)
 *
 * Encoding always writes 32-bit BGRA BMP entries with a real AND mask
 * derived from the alpha channel (1-bit transparency, like TIKE).
 * Decoding handles 32-bit and 24-bit BMP entries plus PNG entries.
 */

export interface DecodedIconImage {
  width: number;
  height: number;
  /** RGBA pixels, top-down row order. */
  pixels: Uint8ClampedArray<ArrayBuffer>;
}

function readU16LE(b: Uint8Array, o: number): number {
  return b[o]! | (b[o + 1]! << 8);
}

function readU32LE(b: Uint8Array, o: number): number {
  return (
    b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)
  ) >>> 0;
}

function writeU16LE(b: Uint8Array, o: number, v: number): void {
  b[o] = v & 0xff;
  b[o + 1] = (v >> 8) & 0xff;
}

function writeU32LE(b: Uint8Array, o: number, v: number): void {
  b[o] = v & 0xff;
  b[o + 1] = (v >> 8) & 0xff;
  b[o + 2] = (v >> 16) & 0xff;
  b[o + 3] = (v >> 24) & 0xff;
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function isPng(data: Uint8Array): boolean {
  return PNG_SIG.every((v, i) => data[i] === v);
}

/**
 * Decode the largest image in an ICO file to RGBA pixels.
 * PNG-compressed entries are decoded via the browser (async);
 * BMP entries are decoded synchronously by hand.
 */
export async function decodeIco(bytes: Uint8Array): Promise<DecodedIconImage> {
  if (bytes.length < 6) throw new Error("ico: too short for ICONDIR");
  const reserved = readU16LE(bytes, 0);
  const type = readU16LE(bytes, 2);
  const count = readU16LE(bytes, 4);
  if (reserved !== 0 || type !== 1) throw new Error("ico: not an ICO file");
  if (count === 0 || bytes.length < 6 + count * 16) {
    throw new Error("ico: truncated directory");
  }

  interface Entry {
    w: number;
    h: number;
    offset: number;
    size: number;
  }
  const entries: Entry[] = [];
  for (let i = 0; i < count; i++) {
    const o = 6 + i * 16;
    const w = bytes[o]! === 0 ? 256 : bytes[o]!;
    const h = bytes[o + 1]! === 0 ? 256 : bytes[o + 1]!;
    const size = readU32LE(bytes, o + 8);
    const offset = readU32LE(bytes, o + 12);
    if (offset + size > bytes.length) continue;
    entries.push({ w, h, offset, size });
  }
  if (entries.length === 0) throw new Error("ico: no valid entries");

  // Largest first (width, then byte size as tiebreak).
  entries.sort((a, b) => b.w - a.w || b.size - a.size);

  let lastError: unknown = null;
  for (const e of entries) {
    const data = bytes.subarray(e.offset, e.offset + e.size);
    try {
      if (isPng(data)) {
        return await decodePngEntry(data);
      }
      return decodeBmpEntry(data, e.w, e.h);
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `ico: could not decode any entry (${String(lastError)})`,
  );
}

async function decodePngEntry(data: Uint8Array): Promise<DecodedIconImage> {
  const blob = new Blob([data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer], {
    type: "image/png",
  });
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("ico: no 2d context");
  ctx.drawImage(bmp, 0, 0);
  const img = ctx.getImageData(0, 0, bmp.width, bmp.height);
  bmp.close();
  return { width: bmp.width, height: bmp.height, pixels: new Uint8ClampedArray(img.data) };
}

function decodeBmpEntry(
  data: Uint8Array,
  dirW: number,
  dirH: number,
): DecodedIconImage {
  if (data.length < 40) throw new Error("ico: BMP header truncated");
  const headerSize = readU32LE(data, 0);
  if (headerSize < 40) throw new Error("ico: unsupported BMP header");
  const w = readU32LE(data, 4);
  let h = readU32LE(data, 8);
  // Signed height would be negative for top-down; ICO uses 2x height.
  const topDown = h > 0x7fffffff;
  if (topDown) h = 0x100000000 - h;
  const height = Math.floor(h / 2) || dirH;
  const width = w || dirW;
  const planes = readU16LE(data, 12);
  const bitCount = readU16LE(data, 14);
  const compression = readU32LE(data, 16);
  if (planes !== 1) throw new Error("ico: bad planes");
  if (compression !== 0) throw new Error("ico: compressed BMP unsupported");

  const pxOffset = headerSize;
  const pixels = new Uint8ClampedArray(width * height * 4);

  if (bitCount === 32 || bitCount === 24) {
    const bpp = bitCount / 8;
    // Rows are padded to 4-byte boundaries.
    const stride = Math.ceil((width * bpp) / 4) * 4;
    for (let y = 0; y < height; y++) {
      const srcY = topDown ? y : height - 1 - y;
      for (let x = 0; x < width; x++) {
        const s = pxOffset + srcY * stride + x * bpp;
        const d = (y * width + x) * 4;
        pixels[d] = data[s + 2]!;
        pixels[d + 1] = data[s + 1]!;
        pixels[d + 2] = data[s]!;
        pixels[d + 3] = bitCount === 32 ? data[s + 3]! : 255;
      }
    }
    applyAndMask(data, pxOffset, width, height, bitCount, topDown, pixels);
  } else {
    throw new Error(`ico: ${bitCount}-bit BMP entries not supported`);
  }
  return { width, height, pixels };
}

/**
 * Apply the 1-bit AND mask (1 = transparent) over the decoded pixels.
 *
 * Real-world .ico files (Keyman/TIKE and most Windows icon writers)
 * store 0 in the 32-bit BMP alpha byte for EVERY pixel and carry
 * transparency only in the AND mask — so a mask-0 pixel whose alpha byte
 * is 0 is OPAQUE, not transparent. Per pixel: mask 1 → alpha 0; else
 * keep the stored alpha byte if it says anything (> 0), otherwise 255.
 * (The census over the keyboards corpus found zero pixels where a
 * nonzero alpha byte disagreed with the mask, so the mask wins on
 * conflict and the alpha byte is only ever a fallback for opacity.)
 * 24-bit entries already decoded to alpha 255, so this is a no-op there.
 */
function applyAndMask(
  data: Uint8Array,
  pxOffset: number,
  width: number,
  height: number,
  bitCount: number,
  topDown: boolean,
  pixels: Uint8ClampedArray<ArrayBuffer>,
): void {
  const bpp = bitCount / 8;
  const pxStride = Math.ceil((width * bpp) / 4) * 4;
  const maskStride = Math.ceil(width / 32) * 4;
  const maskOffset = pxOffset + pxStride * height;
  if (maskOffset + maskStride * height > data.length) return; // no mask present
  for (let y = 0; y < height; y++) {
    const srcY = topDown ? y : height - 1 - y;
    for (let x = 0; x < width; x++) {
      const byte = data[maskOffset + srcY * maskStride + (x >> 3)]!;
      const i = (y * width + x) * 4 + 3;
      if (byte & (0x80 >> (x & 7))) {
        pixels[i] = 0;
      } else if (pixels[i] === 0) {
        // Mask says opaque but the alpha byte is 0: the writer stored
        // no alpha — restore full opacity instead of a blank pixel.
        pixels[i] = 255;
      }
    }
  }
}

/**
 * Encode RGBA pixels (top-down) as a multi-image ICO file with 32-bit
 * BMP entries. `sizes` lists the icon sizes to include (e.g. [16, 32, 48]).
 * The source is resampled with a canvas (smoothing on — OS downscales the
 * same way when it picks an entry).
 */
export function encodeIco(
  source: { width: number; height: number; pixels: Uint8ClampedArray<ArrayBuffer> },
  sizes: number[] = [16, 32, 48, 256],
): Uint8Array {
  const entries: { size: number; data: Uint8Array }[] = [];
  for (const size of sizes) {
    const px = resample(source, size, size);
    entries.push({ size, data: encodeBmpEntry(px, size, size) });
  }

  const headerLen = 6 + entries.length * 16;
  let total = headerLen;
  for (const e of entries) total += e.data.length;
  const out = new Uint8Array(total);

  writeU16LE(out, 0, 0);
  writeU16LE(out, 2, 1);
  writeU16LE(out, 4, entries.length);

  let offset = headerLen;
  entries.forEach((e, i) => {
    const o = 6 + i * 16;
    out[o] = e.size >= 256 ? 0 : e.size;
    out[o + 1] = e.size >= 256 ? 0 : e.size;
    out[o + 2] = 0; // color count
    out[o + 3] = 0; // reserved
    writeU16LE(out, o + 4, 1); // planes
    writeU16LE(out, o + 6, 32); // bit count
    writeU32LE(out, o + 8, e.data.length);
    writeU32LE(out, o + 12, offset);
    out.set(e.data, offset);
    offset += e.data.length;
  });
  return out;
}

/** Encode one size as 32-bit BMP + AND mask (for ICO embedding). */
function encodeBmpEntry(
  pixels: Uint8ClampedArray<ArrayBuffer>,
  width: number,
  height: number,
): Uint8Array {
  const pxBytes = width * height * 4;
  const maskStride = Math.ceil(width / 32) * 4;
  const maskBytes = maskStride * height;
  const out = new Uint8Array(40 + pxBytes + maskBytes);

  writeU32LE(out, 0, 40); // header size
  writeU32LE(out, 4, width);
  writeU32LE(out, 8, height * 2); // ICO doubles the height
  writeU16LE(out, 12, 1); // planes
  writeU16LE(out, 14, 32); // bit count
  writeU32LE(out, 16, 0); // BI_RGB
  writeU32LE(out, 20, pxBytes);
  writeU32LE(out, 24, 2835); // 72 dpi
  writeU32LE(out, 28, 2835);
  writeU32LE(out, 32, 0);
  writeU32LE(out, 36, 0);

  // Pixels: BGRA, bottom-up.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4;
      const d = 40 + ((height - 1 - y) * width + x) * 4;
      out[d] = pixels[s + 2]!;
      out[d + 1] = pixels[s + 1]!;
      out[d + 2] = pixels[s]!;
      out[d + 3] = pixels[s + 3]!;
    }
  }

  // AND mask: 1 = transparent (alpha < 128), bottom-up, MSB first.
  const maskBase = 40 + pxBytes;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4;
      if (pixels[s + 3]! < 128) {
        const d = maskBase + (height - 1 - y) * maskStride + (x >> 3);
        out[d] = (out[d] ?? 0) | (0x80 >> (x & 7));
      }
    }
  }
  return out;
}

/**
 * Resample RGBA pixels to w×h with pure-JS bilinear filtering (no DOM).
 * The codec core stays testable under jsdom/node; canvas is only used
 * for rasterizing imported SVG/PNG files (rasterizeImage, browser-only).
 */
export function resample(
  source: { width: number; height: number; pixels: Uint8ClampedArray<ArrayBuffer> },
  w: number,
  h: number,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(w * h * 4);
  const xRatio = source.width / w;
  const yRatio = source.height / h;
  const at = (x: number, y: number, c: number): number =>
    source.pixels[(y * source.width + x) * 4 + c] ?? 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = (x + 0.5) * xRatio - 0.5;
      const sy = (y + 0.5) * yRatio - 0.5;
      const x0 = Math.max(0, Math.floor(sx));
      const y0 = Math.max(0, Math.floor(sy));
      const x1 = Math.min(source.width - 1, x0 + 1);
      const y1 = Math.min(source.height - 1, y0 + 1);
      const fx = Math.min(1, Math.max(0, sx - x0));
      const fy = Math.min(1, Math.max(0, sy - y0));
      const d = (y * w + x) * 4;
      for (let ch = 0; ch < 4; ch++) {
        out[d + ch] = Math.round(
          at(x0, y0, ch) * (1 - fx) * (1 - fy) +
            at(x1, y0, ch) * fx * (1 - fy) +
            at(x0, y1, ch) * (1 - fx) * fy +
            at(x1, y1, ch) * fx * fy,
        );
      }
    }
  }
  return out;
}

/** Convert a data-URL or Blob image (PNG/SVG) to RGBA at the given size. */
export async function rasterizeImage(
  source: Blob | string,
  size: number,
): Promise<DecodedIconImage> {
  const bmp =
    typeof source === "string"
      ? await createImageBitmap(await (await fetch(source)).blob())
      : await createImageBitmap(source);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("icon: no 2d context");
  // SVG <text> rasterizes as-is per Matthew's ruling — drawImage handles it.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // Contain-fit: center the image, keep aspect.
  const scale = Math.min(size / bmp.width, size / bmp.height);
  const dw = bmp.width * scale;
  const dh = bmp.height * scale;
  ctx.drawImage(bmp, (size - dw) / 2, (size - dh) / 2, dw, dh);
  const img = ctx.getImageData(0, 0, size, size);
  bmp.close();
  return { width: size, height: size, pixels: new Uint8ClampedArray(img.data) };
}

export function icoToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(s);
}

export function base64ToIco(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
