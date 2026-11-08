import { describe, it, expect } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { packagedFontBinaries } from "./packagedFontBinaries.js";

const FONT_BYTES = new Uint8Array([0, 1, 0, 0]);

describe("packagedFontBinaries", () => {
  it("returns the listed font files present in the VFS, matched by basename", () => {
    const vfs = createVirtualFS([
      {
        path: "shared/fonts/sil/andika/AndikaAfr-R.ttf",
        content: FONT_BYTES,
        isBinary: true,
      },
      { path: "source/demo.kmn", content: "store(&NAME) 'Demo'", isBinary: false },
    ]);
    const refs = ["..\\..\\..\\shared\\fonts\\sil\\andika\\AndikaAfr-R.ttf"];
    expect(packagedFontBinaries(vfs, refs)).toEqual([
      { path: "shared/fonts/sil/andika/AndikaAfr-R.ttf", bytes: FONT_BYTES },
    ]);
  });

  it("omits listed fonts absent from the VFS", () => {
    const vfs = createVirtualFS([
      { path: "source/demo.kmn", content: "store(&NAME) 'Demo'", isBinary: false },
    ]);
    expect(
      packagedFontBinaries(vfs, ["..\\..\\..\\shared\\fonts\\x\\Missing.ttf"]),
    ).toEqual([]);
  });

  it("returns [] with no refs, and skips text entries sharing a basename", () => {
    const vfs = createVirtualFS([
      { path: "source/Font.ttf", content: "not a font", isBinary: false },
    ]);
    expect(packagedFontBinaries(vfs, [])).toEqual([]);
    expect(packagedFontBinaries(vfs, ["Font.ttf"])).toEqual([]);
  });

  it("deduplicates by basename, first VFS entry wins", () => {
    const first = new Uint8Array([1]);
    const second = new Uint8Array([2]);
    const vfs = createVirtualFS([
      { path: "source/fonts/A.ttf", content: first, isBinary: true },
      { path: "shared/fonts/A.ttf", content: second, isBinary: true },
    ]);
    expect(packagedFontBinaries(vfs, ["A.ttf"])).toEqual([
      { path: "source/fonts/A.ttf", bytes: first },
    ]);
  });
});
