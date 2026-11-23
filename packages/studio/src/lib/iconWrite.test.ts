// iconWrite (#2927): where an edited icon lands in a VFS — the file
// `&BITMAP` names, else the single `.ico` already there, else the
// canonical `source/<id>.ico` — and the `&BITMAP` line that names it.

import { describe, expect, it } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { base64ToIco, encodeIco, icoToBase64 } from "../editors/assignLoop/icoCodec.ts";
import { createBlankIcon } from "../editors/assignLoop/iconTools.ts";
import { applyIconToVfs, bitmapIconPath, existingIconPaths, resolveIconPath } from "./iconWrite.ts";

const ID = "tiny";

function redIco(): { bytes: Uint8Array; base64: string } {
  const pixels = new Uint8ClampedArray(48 * 48 * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 200;
    pixels[i + 3] = 255;
  }
  const bytes = encodeIco({ width: 48, height: 48, pixels }, [48]);
  return { bytes, base64: icoToBase64(bytes) };
}

function kmn(bitmap?: string): string {
  return [
    "c test",
    "store(&NAME) 'Tiny'",
    ...(bitmap !== undefined ? [`store(&BITMAP) '${bitmap}'`] : []),
    "store(&VERSION) '10.0'",
    "",
    "begin Unicode > use(main)",
    "",
    "group(main) using keys",
    "+ [K_A] > 'a'",
    "",
  ].join("\n");
}

function vfsWith(kmnText: string | undefined, ico?: { path: string; bytes: Uint8Array }): ReturnType<typeof createVirtualFS> {
  const vfs = createVirtualFS();
  if (kmnText !== undefined) vfs.set(`source/${ID}.kmn`, kmnText, false);
  if (ico !== undefined) vfs.set(ico.path, ico.bytes, true);
  return vfs;
}

describe("bitmapIconPath", () => {
  it("reads the &BITMAP filename as a source/ path", () => {
    expect(bitmapIconPath(kmn("Cameroon.ico"))).toBe("source/Cameroon.ico");
  });

  it("is null when the .kmn has no &BITMAP line", () => {
    expect(bitmapIconPath(kmn())).toBe(null);
  });
});

describe("resolveIconPath", () => {
  it("prefers the &BITMAP file", () => {
    const vfs = vfsWith(kmn("Cameroon.ico"));
    expect(resolveIconPath(vfs, kmn("Cameroon.ico"), ID)).toBe("source/Cameroon.ico");
  });

  it("keeps the single existing .ico when there is no &BITMAP line", () => {
    const vfs = vfsWith(kmn(), { path: "source/Cameroon.ico", bytes: new Uint8Array([1]) });
    expect(resolveIconPath(vfs, kmn(), ID)).toBe("source/Cameroon.ico");
  });

  it("falls back to source/<id>.ico with no &BITMAP line and no .ico", () => {
    const vfs = vfsWith(kmn());
    expect(resolveIconPath(vfs, kmn(), ID)).toBe(`source/${ID}.ico`);
  });

  it("falls back to source/<id>.ico with several .ico files and no &BITMAP line", () => {
    const vfs = vfsWith(kmn(), { path: "source/a.ico", bytes: new Uint8Array([1]) });
    vfs.set("source/b.ico", new Uint8Array([2]), true);
    expect(resolveIconPath(vfs, kmn(), ID)).toBe(`source/${ID}.ico`);
  });
});

describe("applyIconToVfs", () => {
  it("writes a new icon at source/<id>.ico and adds the &BITMAP line", () => {
    const { bytes, base64 } = redIco();
    const vfs = vfsWith(kmn());
    const result = applyIconToVfs(vfs, ID, base64);
    expect(result).toEqual({ iconPath: `source/${ID}.ico`, bitmapAdded: true });
    const entry = vfs.get(`source/${ID}.ico`);
    expect(entry?.content).toEqual(bytes);
    expect(entry?.isBinary).toBe(true);
    const text = vfs.get(`source/${ID}.kmn`)?.content as string;
    expect(text).toMatch(/store\(&BITMAP\) 'tiny\.ico'/);
  });

  it("writes into the &BITMAP file and leaves the line alone", () => {
    const { bytes, base64 } = redIco();
    const vfs = vfsWith(kmn("Cameroon.ico"), { path: "source/Cameroon.ico", bytes: new Uint8Array([9]) });
    const result = applyIconToVfs(vfs, ID, base64);
    expect(result).toEqual({ iconPath: "source/Cameroon.ico", bitmapAdded: false });
    expect(vfs.get("source/Cameroon.ico")?.content).toEqual(bytes);
    expect(vfs.get(`source/${ID}.ico`)).toBeUndefined();
    const text = vfs.get(`source/${ID}.kmn`)?.content as string;
    expect(text).toMatch(/store\(&BITMAP\) 'Cameroon\.ico'/);
  });

  it("keeps the single existing .ico name when there is no &BITMAP line", () => {
    const { base64 } = redIco();
    const vfs = vfsWith(kmn(), { path: "source/Cameroon.ico", bytes: new Uint8Array([9]) });
    const result = applyIconToVfs(vfs, ID, base64);
    expect(result?.iconPath).toBe("source/Cameroon.ico");
    const text = vfs.get(`source/${ID}.kmn`)?.content as string;
    expect(text).toMatch(/store\(&BITMAP\) 'Cameroon\.ico'/);
  });

  it("Keep is idempotent: identical bytes are not rewritten", () => {
    const { bytes, base64 } = redIco();
    const vfs = vfsWith(kmn(`${ID}.ico`), { path: `source/${ID}.ico`, bytes });
    const before = vfs.get(`source/${ID}.ico`)?.content;
    const result = applyIconToVfs(vfs, ID, base64);
    expect(result).toEqual({ iconPath: `source/${ID}.ico`, bitmapAdded: false });
    expect(vfs.get(`source/${ID}.ico`)?.content).toBe(before);
  });

  it("returns null and writes nothing for a null, empty or undecodable value", () => {
    const vfs = vfsWith(kmn());
    expect(applyIconToVfs(vfs, ID, null)).toBe(null);
    expect(applyIconToVfs(vfs, ID, "")).toBe(null);
    expect(applyIconToVfs(vfs, ID, "!!!not-base64!!!")).toBe(null);
    expect(vfs.get(`source/${ID}.ico`)).toBeUndefined();
    expect(vfs.get(`source/${ID}.kmn`)?.content).toBe(kmn());
  });

  it("writes without a .kmn (no store line to ensure)", () => {
    const { bytes, base64 } = redIco();
    const vfs = vfsWith(undefined);
    const result = applyIconToVfs(vfs, ID, base64);
    expect(result).toEqual({ iconPath: `source/${ID}.ico`, bitmapAdded: false });
    expect(vfs.get(`source/${ID}.ico`)?.content).toEqual(bytes);
  });

  it("existingIconPaths lists only .ico files", () => {
    const vfs = vfsWith(kmn(), { path: "source/a.ico", bytes: new Uint8Array([1]) });
    vfs.set("source/b.kmn", "c x", false);
    expect(existingIconPaths(vfs)).toEqual(["source/a.ico"]);
  });

  it("round-trips through base64ToIco (the value the editor stores)", () => {
    const blank = createBlankIcon();
    const bytes = encodeIco({ width: 48, height: 48, pixels: blank }, [16, 32, 48]);
    expect(base64ToIco(icoToBase64(bytes))).toEqual(bytes);
  });
});
