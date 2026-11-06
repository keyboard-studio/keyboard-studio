// The icon step driver (spec 107 T016): keeps the template icon — the base
// .ico re-encoded — or the generated default when the base has none.

import { unzlibSync } from "fflate";
import { beforeEach, describe, expect, it } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { decodeIco, encodeIco, base64ToIco } from "../../../editors/assignLoop/icoCodec.ts";
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
  it("keeps the base .ico: re-encodes it and pairs it with a 256px PNG", async () => {
    const red = new Uint8ClampedArray(48 * 48 * 4);
    for (let i = 0; i < red.length; i += 4) {
      red[i] = 200;
      red[i + 3] = 255;
    }
    seedStart(encodeIco({ width: 48, height: 48, pixels: red }, [48]));
    const result = (await iconDrivers["icon"]!(ctx())) as {
      iconIcoBase64: string;
      iconPngDataUrl: string;
    };
    const decoded = await decodeIco(base64ToIco(result.iconIcoBase64));
    expect(decoded.width).toBe(256);
    expect(decoded.height).toBe(256);
    expect(decoded.pixels[0]).toBe(200); // the base red survives the round trip
    expect(decoded.pixels[3]).toBe(255);
    const png = Uint8Array.from(
      atob(result.iconPngDataUrl.slice("data:image/png;base64,".length)),
      (c) => c.charCodeAt(0),
    );
    const chunks = pngChunks(png);
    const ihdr = chunks[0]![1]!;
    const view = new DataView(ihdr.buffer, ihdr.byteOffset);
    expect(view.getUint32(0)).toBe(256);
    expect(view.getUint32(4)).toBe(256);
  });

  it("falls back to the generated default when the base has no .ico", async () => {
    seedStart();
    const result = (await iconDrivers["icon"]!(ctx())) as {
      iconIcoBase64: string;
      iconPngDataUrl: string;
    };
    expect(result.iconIcoBase64.length).toBeGreaterThan(0);
    expect(result.iconPngDataUrl.startsWith("data:image/png;base64,")).toBe(true);
    const decoded = await decodeIco(base64ToIco(result.iconIcoBase64));
    expect(decoded.width).toBe(256);
  });
});
