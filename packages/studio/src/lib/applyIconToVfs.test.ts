// applyIconToVfs tests (#1550): the projection step that writes the
// author's icon bytes into the projected VFS.

import { describe, it, expect } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { applyIconToVfs, base64ToBytes } from "./applyIconToVfs.ts";
import { icoToBase64 } from "../editors/assignLoop/icoCodec.ts";

const KMN_NO_BITMAP = "store(&NAME) 'T'\n\nbegin Unicode > use(main)\ngroup(main) using keys\n";
const KMN_WITH_BITMAP =
  "store(&NAME) 'T'\nstore(&BITMAP) 'old.ico'\n\nbegin Unicode > use(main)\ngroup(main) using keys\n";

const BYTES = new Uint8Array([0, 0, 1, 0, 1, 0, 16, 16, 0, 0, 1, 0, 32, 0, 0, 0, 0, 0, 22, 0, 0, 0, 9, 9, 9, 9]);
const B64 = icoToBase64(BYTES);

function vfsOf(files: Record<string, string>) {
  const vfs = createVirtualFS();
  for (const [path, text] of Object.entries(files)) vfs.set(path, text, false);
  return vfs;
}

describe("base64ToBytes", () => {
  it("round-trips through icoToBase64", () => {
    expect(base64ToBytes(B64)).toEqual(BYTES);
  });
});

describe("applyIconToVfs", () => {
  it("changes nothing for an untouched (null) icon", () => {
    const vfs = vfsOf({ "source/t.kmn": KMN_NO_BITMAP });
    expect(applyIconToVfs(vfs, "t", null)).toEqual([]);
    expect(vfs.get("source/t.ico")).toBeUndefined();
    expect(vfs.get("source/t.kmn")?.content).toBe(KMN_NO_BITMAP);
  });

  it("writes the bytes unre-encoded and adds the BITMAP store ahead of `begin`", () => {
    const vfs = vfsOf({ "source/t.kmn": KMN_NO_BITMAP });
    expect(applyIconToVfs(vfs, "t", B64)).toEqual([]);
    const ico = vfs.get("source/t.ico");
    expect(ico).toBeDefined();
    expect(ico!.isBinary).toBe(true);
    expect(ico!.content).toEqual(BYTES);
    const kmn = vfs.get("source/t.kmn")?.content as string;
    expect(kmn).toContain("store(&BITMAP) 't.ico'");
    expect(kmn.indexOf("&BITMAP")).toBeLessThan(kmn.indexOf("begin Unicode"));
  });

  it("rewrites an existing BITMAP store line instead of duplicating", () => {
    const vfs = vfsOf({ "source/t.kmn": KMN_WITH_BITMAP });
    applyIconToVfs(vfs, "t", B64);
    const kmn = vfs.get("source/t.kmn")?.content as string;
    expect(kmn).not.toContain("old.ico");
    expect(kmn.match(/store\(&BITMAP\)/g)).toHaveLength(1);
  });

  it("warns and writes nothing for corrupt base64", () => {
    const vfs = vfsOf({ "source/t.kmn": KMN_NO_BITMAP });
    const warnings = applyIconToVfs(vfs, "t", "!!!not-base64!!!");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("could not be decoded");
    expect(vfs.get("source/t.ico")).toBeUndefined();
    expect(vfs.get("source/t.kmn")?.content).toBe(KMN_NO_BITMAP);
  });

  it("warns and writes nothing for empty bytes", () => {
    const vfs = vfsOf({ "source/t.kmn": KMN_NO_BITMAP });
    const warnings = applyIconToVfs(vfs, "t", "");
    expect(warnings).toHaveLength(1);
    expect(vfs.get("source/t.ico")).toBeUndefined();
  });

  it("warns and writes nothing when the .kmn is missing", () => {
    const vfs = vfsOf({});
    const warnings = applyIconToVfs(vfs, "t", B64);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("is missing");
    expect(vfs.get("source/t.ico")).toBeUndefined();
  });
});
