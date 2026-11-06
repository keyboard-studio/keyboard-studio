// Icon step: keep the template icon, as the UI's Continue with no edits does.
//
// Mirrors IconEditor's load + Continue path with the DOM-free pieces: the
// base .ico is read from the start VFS, decoded (BMP entries), resampled to
// 256px and re-encoded; a base with no decodable .ico falls back to the
// generated default, as the component does. The PNG data URL is the same
// pixels encoded as a PNG — the component gets it from canvas.toDataURL,
// which has no DOM-free equivalent, so the driver encodes it by hand
// (zlib via fflate; see encodePngDataUrl).

import { zlibSync } from "fflate";
import {
  decodeIco,
  encodeIco,
  icoToBase64,
  resample,
} from "../../../editors/assignLoop/icoCodec.ts";
import {
  ICON_SIZE,
  generateDefaultIcon,
  type PixelBuffer,
} from "../../../editors/assignLoop/iconTools.ts";
import { useWorkingCopyStore } from "../../../stores/workingCopyStore.ts";
import type { StepDrivers } from "./types.ts";

// --- Minimal PNG encoder (filter-0 scanlines, color type 6 RGBA) -----------

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crcInput = new Uint8Array(4 + data.length);
  crcInput.set(out.subarray(4, 8 + data.length));
  view.setUint32(8 + data.length, crc32(crcInput));
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(s);
}

/** RGBA pixels as a `data:image/png;base64,…` URL (the component's canvas.toDataURL). */
export function encodePngDataUrl(
  pixels: PixelBuffer,
  width: number,
  height: number,
): string {
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    raw.set(
      pixels.subarray(y * width * 4, (y + 1) * width * 4),
      y * (width * 4 + 1) + 1,
    );
  }
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const chunks = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlibSync(raw, { level: 6 })),
    pngChunk("IEND", new Uint8Array(0)),
  ];
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const png = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    png.set(c, offset);
    offset += c.length;
  }
  return `data:image/png;base64,${bytesToBase64(png)}`;
}

export const iconDrivers: StepDrivers = {
  icon: async () => {
    const wc = useWorkingCopyStore.getState();
    // -- Load the base keyboard's icon as the starting point ---------------
    let pixels: PixelBuffer | null = null;
    const vfs = wc.startVfs;
    if (vfs !== null) {
      for (const p of vfs.list().filter((x) => x.toLowerCase().endsWith(".ico"))) {
        const entry = vfs.get(p);
        if (!entry || typeof entry.content === "string") continue;
        try {
          const decoded = await decodeIco(entry.content);
          pixels =
            decoded.width === ICON_SIZE && decoded.height === ICON_SIZE
              ? decoded.pixels
              : resample(decoded, ICON_SIZE, ICON_SIZE);
          break;
        } catch {
          // Try the next .ico file.
        }
      }
    }
    // -- Fallback: generated default from the keyboard name ----------------
    if (pixels === null) {
      const label =
        wc.identity?.displayName ??
        wc.identity?.languageName ??
        wc.startKeyboard?.displayName ??
        wc.startKeyboard?.id ??
        "K";
      pixels = generateDefaultIcon(label);
    }
    // -- Continue: the payload IconEditor hands to onComplete --------------
    const ico = encodeIco(
      { width: ICON_SIZE, height: ICON_SIZE, pixels },
      [16, 32, 48, 256],
    );
    return {
      iconIcoBase64: icoToBase64(ico),
      iconPngDataUrl: encodePngDataUrl(pixels, ICON_SIZE, ICON_SIZE),
    };
  },
};
