import { describe, it, expect } from "vitest";
import type { VirtualFS, VirtualFSEntry } from "@keyboard-studio/contracts";
import { setKeyboardIcon, removeKeyboardIcon, ensureBitmapStore } from "./setKeyboardIcon.js";

function makeVfs(files: Record<string, string>): VirtualFS {
  const entries = new Map<string, VirtualFSEntry>();
  for (const [path, content] of Object.entries(files)) {
    entries.set(path, { path, content, isBinary: false });
  }
  return {
    get: (p) => entries.get(p),
    set: (p, content, isBinary = false) => {
      const prev = entries.get(p);
      entries.set(p, { path: p, content, isBinary });
      return prev;
    },
    delete: (p) => entries.delete(p),
    list: (prefix = "") => [...entries.keys()].filter((k) => k.startsWith(prefix)),
    snapshots: (prefix = "") =>
      [...entries.values()].filter((e) => e.path.startsWith(prefix)),
  } as VirtualFS;
}

const KMN = `c Test Keyboard
store(&VERSION) '10.0'
store(&NAME) 'Test'

begin Unicode > use(Main)
`;

function solidImage(): { width: number; height: number; data: Uint8Array } {
  const data = new Uint8Array(32 * 32 * 4).fill(128);
  return { width: 32, height: 32, data };
}

describe("setKeyboardIcon", () => {
  it("writes a binary .ico to the VFS and adds the BITMAP store", () => {
    const vfs = makeVfs({ "source/test.kmn": KMN });
    const updated = setKeyboardIcon(vfs, "source/test.kmn", "test", solidImage());

    const ico = vfs.get("source/test.ico");
    expect(ico).toBeDefined();
    expect(ico!.isBinary).toBe(true);
    expect(ico!.content).toBeInstanceOf(Uint8Array);
    // Valid .ico header: reserved=0, type=1, count=3.
    const bytes = ico!.content as Uint8Array;
    expect(bytes[0]).toBe(0);
    expect(bytes[1]).toBe(0);
    expect(bytes[2]).toBe(1);
    expect(bytes[3]).toBe(0);
    expect(bytes[4]).toBe(3);

    expect(updated).toContain("store(&BITMAP) 'test.ico'");
    expect(vfs.get("source/test.kmn")!.content).toContain("store(&BITMAP) 'test.ico'");
  });

  it("rewrites an existing BITMAP store line instead of duplicating", () => {
    const vfs = makeVfs({
      "source/test.kmn": KMN.replace(
        "store(&NAME)",
        "store(&BITMAP) 'old.ico'\nstore(&NAME)",
      ),
    });
    const updated = setKeyboardIcon(vfs, "source/test.kmn", "test", solidImage());
    expect(updated).not.toContain("old.ico");
    expect(updated.match(/store\(&BITMAP\)/g)).toHaveLength(1);
  });
});

describe("removeKeyboardIcon", () => {
  it("deletes the .ico and drops the BITMAP store line", () => {
    const vfs = makeVfs({ "source/test.kmn": KMN });
    setKeyboardIcon(vfs, "source/test.kmn", "test", solidImage());
    expect(vfs.get("source/test.ico")).toBeDefined();

    const updated = removeKeyboardIcon(vfs, "source/test.kmn", "test");
    expect(vfs.get("source/test.ico")).toBeUndefined();
    expect(updated).not.toContain("&BITMAP");
  });
});

describe("ensureBitmapStore", () => {
  it("inserts after the last store line", () => {
    const updated = ensureBitmapStore(KMN, "test.ico");
    const lines = updated.split("\n");
    const bitmapIdx = lines.findIndex((l) => l.includes("&BITMAP"));
    const nameIdx = lines.findIndex((l) => l.includes("&NAME"));
    const beginIdx = lines.findIndex((l) => /^begin/i.test(l.trim()));
    expect(bitmapIdx).toBeGreaterThan(nameIdx);
    expect(bitmapIdx).toBeLessThan(beginIdx);
  });

  it("is idempotent on rewrite", () => {
    const once = ensureBitmapStore(KMN, "a.ico");
    const twice = ensureBitmapStore(once, "b.ico");
    expect(twice.match(/store\(&BITMAP\)/g)).toHaveLength(1);
    expect(twice).toContain("store(&BITMAP) 'b.ico'");
  });
});
