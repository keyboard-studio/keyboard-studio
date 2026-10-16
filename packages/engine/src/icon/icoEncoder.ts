// Multi-size Windows .ico encoder (#1550).
//
// Encodes RGBA pixel data into a real Windows .ico file with 16/32/48px
// entries (the minimum the issue requires). Each entry is a 32-bit BGRA
// DIB with an AND mask derived from the alpha channel.
//
// The .ico format:
//   ICONDIR (6 bytes): reserved=0, type=1, count
//   ICONDIRENTRY (16 bytes each): width, height, colors=0, reserved=0,
//     planes=1, bitCount=32, bytesInRes, imageOffset
//   Per image: BITMAPINFOHEADER (40 bytes) + XOR mask (BGRA, bottom-up
//     rows) + AND mask (1-bit, bottom-up, row-padded to 32 bits)

export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  /** Row-major RGBA, top-down, 4 bytes per pixel. */
  readonly data: Uint8Array;
}

/** The icon sizes every encoded .ico carries (issue #1550 minimum). */
export const ICO_SIZES = [16, 32, 48] as const;

/**
 * Encode RGBA images into a Windows .ico file.
 *
 * Each input image is used at its native size; callers typically pass
 * 16/32/48px variants (see `scaleRgba` for resampling). Images must be
 * square. Returns the .ico file bytes.
 */
export function encodeIco(images: RgbaImage[]): Uint8Array {
  if (images.length === 0) {
    throw new Error("encodeIco: at least one image is required");
  }
  for (const img of images) {
    if (img.width !== img.height) {
      throw new Error(`encodeIco: image must be square, got ${img.width}x${img.height}`);
    }
    if (img.data.length !== img.width * img.height * 4) {
      throw new Error(
        `encodeIco: data length ${img.data.length} does not match ${img.width}x${img.height} RGBA`,
      );
    }
    if (img.width > 256 || img.width < 1) {
      throw new Error(`encodeIco: width must be 1-256, got ${img.width}`);
    }
  }

  // Encode each image's DIB first so we know the offsets.
  const dibs = images.map(encodeDib);
  const count = images.length;
  const headerSize = 6 + count * 16;
  let offset = headerSize;
  const totalSize = headerSize + dibs.reduce((n, d) => n + d.length, 0);
  const out = new Uint8Array(totalSize);
  const view = new DataView(out.buffer);

  // ICONDIR
  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type: .ico
  view.setUint16(4, count, true);

  // ICONDIRENTRY array
  images.forEach((img, i) => {
    const entryOffset = 6 + i * 16;
    const dib = dibs[i]!;
    out[entryOffset] = img.width === 256 ? 0 : img.width;
    out[entryOffset + 1] = img.height === 256 ? 0 : img.height;
    out[entryOffset + 2] = 0; // color count
    out[entryOffset + 3] = 0; // reserved
    view.setUint16(entryOffset + 4, 1, true); // planes
    view.setUint16(entryOffset + 6, 32, true); // bit count
    view.setUint32(entryOffset + 8, dib.length, true); // bytes in resource
    view.setUint32(entryOffset + 12, offset, true); // image offset
    out.set(dib, offset);
    offset += dib.length;
  });

  return out;
}

/**
 * Encode one RGBA image as a 32-bit DIB: BITMAPINFOHEADER + XOR mask
 * (BGRA, bottom-up) + AND mask (1-bit transparency, bottom-up,
 * rows padded to 32-bit boundaries).
 */
function encodeDib(img: RgbaImage): Uint8Array {
  const { width, height } = img;
  const xorSize = width * height * 4;
  const andRowBytes = Math.ceil(width / 32) * 4;
  const andSize = andRowBytes * height;
  const dib = new Uint8Array(40 + xorSize + andSize);
  const view = new DataView(dib.buffer);

  // BITMAPINFOHEADER
  view.setUint32(0, 40, true); // header size
  view.setInt32(4, width, true);
  view.setInt32(8, height * 2, true); // height x2: XOR + AND masks
  view.setUint16(12, 1, true); // planes
  view.setUint16(14, 32, true); // bit count
  view.setUint32(16, 0, true); // compression: BI_RGB
  view.setUint32(20, xorSize + andSize, true); // image size
  view.setInt32(24, 0, true); // x pixels per meter
  view.setInt32(28, 0, true); // y pixels per meter
  view.setUint32(32, 0, true); // colors used
  view.setUint32(36, 0, true); // important colors

  // XOR mask: BGRA, bottom-up rows.
  const xorOffset = 40;
  for (let y = 0; y < height; y++) {
    const srcRow = (height - 1 - y) * width * 4;
    const dstRow = xorOffset + y * width * 4;
    for (let x = 0; x < width; x++) {
      const s = srcRow + x * 4;
      const d = dstRow + x * 4;
      dib[d] = img.data[s + 2]!; // B
      dib[d + 1] = img.data[s + 1]!; // G
      dib[d + 2] = img.data[s]!; // R
      dib[d + 3] = img.data[s + 3]!; // A
    }
  }

  // AND mask: 1 = transparent, from alpha < 128. Bottom-up, 32-bit padded rows.
  const andOffset = xorOffset + xorSize;
  for (let y = 0; y < height; y++) {
    const srcRow = (height - 1 - y) * width * 4;
    for (let x = 0; x < width; x++) {
      const alpha = img.data[srcRow + x * 4 + 3]!;
      if (alpha < 128) {
        const byteIndex = andOffset + y * andRowBytes + Math.floor(x / 8);
        dib[byteIndex] = dib[byteIndex]! | (0x80 >> (x % 8));
      }
    }
  }

  return dib;
}

/**
 * Nearest-neighbor resample of RGBA pixel data to a square size.
 * Used to derive the 16/32/48px icon variants from a single source image.
 */
export function scaleRgba(src: RgbaImage, size: number): RgbaImage {
  if (src.width === size && src.height === size) {
    return src;
  }
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const srcY = Math.min(src.height - 1, Math.floor((y * src.height) / size));
    for (let x = 0; x < size; x++) {
      const srcX = Math.min(src.width - 1, Math.floor((x * src.width) / size));
      const s = (srcY * src.width + srcX) * 4;
      const d = (y * size + x) * 4;
      data[d] = src.data[s]!;
      data[d + 1] = src.data[s + 1]!;
      data[d + 2] = src.data[s + 2]!;
      data[d + 3] = src.data[s + 3]!;
    }
  }
  return { width: size, height: size, data };
}

/**
 * Encode a single source image into a multi-size .ico with the
 * standard 16/32/48px entries (issue #1550 minimum).
 */
export function encodeIconSet(src: RgbaImage): Uint8Array {
  return encodeIco(ICO_SIZES.map((size) => scaleRgba(src, size)));
}
