// The icon step driver (spec 107 T016): mirrors the UI's three options.
// Default is Keep when the template carries a usable .ico — the source
// bytes pass through unchanged; with no source icon it is Create — the
// blank white 48×48 canvas re-encoded as [16, 32, 48].

import { unzlibSync } from "fflate";
import { beforeEach, describe, expect, it } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { decodeIco, encodeIco, base64ToIco, icoToBase64 } from "../../../editors/assignLoop/icoCodec.ts";
import { useDecisionStore } from "../../../stores/decisionStore.ts";
import { useSurveySessionStore } from "../../../stores/surveySessionStore.ts";
import { bindManifest, useWorkingCopyStore } from "../../../stores/workingCopyStore.ts";
import { manifest } from "../../../steps/manifest.ts";
import type { Case } from "../caseTypes.ts";
import { createRunReport } from "../runReport.ts";
import { encodePngDataUrl, iconDrivers } from "./icon.ts";

function seedStart(icoBytes?: Uint8Array): void {
  const files: { path: string; content: string | Uint8Array; isBinary: boolean }[] = [
    { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
  ];
  if (icoBytes !== undefined) {
    files.push({ path: "source/basic_kbdus.ico", content: icoBytes, isBinary: true });
  }
  useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, {
    vfs: createVirtualFS(files),
    ir: makeTestIR([]),
  });
}

function ctx() {
  const report = createRunReport("icon-driver");
  return { case: {} as Case, startIr: makeTestIR([]), report };
}

beforeEach(() => {
  bindManifest(manifest);
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
  useDecisionStore.getState().reset();
});

/** Split a PNG's chunks: [type, data] pairs, in order. */
function pngChunks(png: Uint8Array): [string, Uint8Array][] {
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const out: [string, Uint8Array][] = [];
  let o = 8;
  while (o < png.length) {
    const view = new DataView(png.buffer, png.byteOffset + o);
    const len = view.getUint32(0);
    const type = String.fromCharCode(...png.subarray(o + 4, o + 8));
    out.push([type, png.subarray(o + 8, o + 8 + len)]);
    o += 12 + len;
  }
  return out;
}

describe("encodePngDataUrl", () => {
  it("encodes RGBA pixels as a decodable 2x2 PNG", () => {
    const pixels = new Uint8ClampedArray([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
    ]);
    const url = encodePngDataUrl(pixels, 2, 2);
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
    const png = Uint8Array.from(atob(url.slice("data:image/png;base64,".length)), (c) =>
      c.charCodeAt(0),
    );
    const chunks = pngChunks(png);
    expect(chunks.map(([t]) => t)).toEqual(["IHDR", "IDAT", "IEND"]);
    const ihdr = chunks[0]![1]!;
    const view = new DataView(ihdr.buffer, ihdr.byteOffset);
    expect(view.getUint32(0)).toBe(2);
    expect(view.getUint32(4)).toBe(2);
    expect(ihdr[8]).toBe(8); // bit depth
    expect(ihdr[9]).toBe(6); // color type RGBA
    // The IDAT zlib stream inflates to filter-0 scanlines holding the pixels.
    const raw = unzlibSync(chunks[1]![1]!);
    expect([...raw]).toEqual([
      0, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255, 255,
    ]);
  });
});

describe("icon driver", () => {
  it("with no source icon: creates a blank white canvas (16/32/48 + 48px PNG)", async () => {
    seedStart();
    const result = (await iconDrivers["icon"]!(ctx())) as {
      iconIcoBase64: string;
      iconPngDataUrl: string;
    };
    const icoBytes = base64ToIco(result.iconIcoBase64);
    // Exactly three entries: 16, 32, 48 — no 256px entry.
    expect(new DataView(icoBytes.buffer, icoBytes.byteOffset).getUint16(4, true)).toBe(3);
    const decoded = await decodeIco(icoBytes);
    expect(decoded.width).toBe(48);
    expect(decoded.height).toBe(48);
    expect([...decoded.pixels.subarray(0, 4)]).toEqual([255, 255, 255, 255]); // white
    const png = Uint8Array.from(
      atob(result.iconPngDataUrl.slice("data:image/png;base64,".length)),
      (c) => c.charCodeAt(0),
    );
    const chunks = pngChunks(png);
    const ihdr = chunks[0]![1]!;
    const view = new DataView(ihdr.buffer, ihdr.byteOffset);
    expect(view.getUint32(0)).toBe(48);
    expect(view.getUint32(4)).toBe(48);
  });

  it("with a source icon: keeps the template's .ico byte-for-byte (default Keep)", async () => {
    const red = new Uint8ClampedArray(48 * 48 * 4);
    for (let i = 0; i < red.length; i += 4) {
      red[i] = 200;
      red[i + 3] = 255;
    }
    const seed = encodeIco({ width: 48, height: 48, pixels: red }, [48]);
    seedStart(seed);
    const result = (await iconDrivers["icon"]!(ctx())) as {
      iconIcoBase64: string;
      iconPngDataUrl: string;
    };
    // The .ico passes through unchanged — not re-encoded.
    expect(result.iconIcoBase64).toBe(icoToBase64(seed));
    // The PNG is the source icon at 48px (red, not white).
    const png = Uint8Array.from(
      atob(result.iconPngDataUrl.slice("data:image/png;base64,".length)),
      (c) => c.charCodeAt(0),
    );
    const chunks = pngChunks(png);
    const ihdr = chunks[0]![1]!;
    const view = new DataView(ihdr.buffer, ihdr.byteOffset);
    expect(view.getUint32(0)).toBe(48);
    expect(view.getUint32(4)).toBe(48);
    const raw = unzlibSync(chunks[1]![1]!);
    expect([...raw.subarray(0, 5)]).toEqual([0, 200, 0, 0, 255]);
  });

  it("with an undecodable .ico: falls back to the blank white canvas", async () => {
    seedStart(new Uint8Array([1, 2, 3, 4]));
    const result = (await iconDrivers["icon"]!(ctx())) as {
      iconIcoBase64: string;
      iconPngDataUrl: string;
    };
    const decoded = await decodeIco(base64ToIco(result.iconIcoBase64));
    expect(decoded.width).toBe(48);
    expect(decoded.pixels[0]).toBe(255); // white, not the base bytes
    expect(decoded.pixels[3]).toBe(255);
  });
});
