import { describe, it, expect } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { applyCustomCssToVfs, readKeyboardCss } from "./customCss.ts";

const KMN_WITH_CSS = "store(&NAME) 'T'\nstore(&KMW_EMBEDCSS) 'kb.css'\n\nbegin Unicode > use(main)\ngroup(main) using keys\n";
const KMN_NO_CSS = "store(&NAME) 'T'\n\nbegin Unicode > use(main)\ngroup(main) using keys\n";

function vfsOf(files: Record<string, string>) {
  const vfs = createVirtualFS();
  for (const [path, text] of Object.entries(files)) vfs.set(path, text, false);
  return vfs;
}

describe("readKeyboardCss", () => {
  it("reads the file &KMW_EMBEDCSS names", () => {
    const vfs = vfsOf({ "source/t.kmn": KMN_WITH_CSS, "source/kb.css": ".kmw-key { color: red; }" });
    expect(readKeyboardCss(vfs, "t")).toEqual({ path: "source/kb.css", text: ".kmw-key { color: red; }" });
  });

  it("ignores the documentation pages' own stylesheets", () => {
    const vfs = vfsOf({ "source/t.kmn": KMN_NO_CSS, "source/welcome/kb.css": "body { margin: 0; }" });
    expect(readKeyboardCss(vfs, "t")).toBeNull();
  });

  it("falls back to an OSK stylesheet when the store is absent", () => {
    const vfs = vfsOf({ "source/t.kmn": KMN_NO_CSS, "source/t.css": ".a {}" });
    expect(readKeyboardCss(vfs, "t")?.path).toBe("source/t.css");
  });
});

describe("applyCustomCssToVfs", () => {
  it("changes nothing for an untouched (null) value", () => {
    const vfs = vfsOf({ "source/t.kmn": KMN_WITH_CSS, "source/kb.css": ".a {}" });
    expect(applyCustomCssToVfs(vfs, "t", null)).toEqual([]);
    expect(vfs.get("source/kb.css")?.content).toBe(".a {}");
  });

  it("overwrites the stylesheet the keyboard already names", () => {
    const vfs = vfsOf({ "source/t.kmn": KMN_WITH_CSS, "source/kb.css": ".a {}" });
    applyCustomCssToVfs(vfs, "t", ".b { top: 0; }");
    expect(vfs.get("source/kb.css")?.content).toBe(".b { top: 0; }");
    expect(vfs.get("source/t.kmn")?.content).toBe(KMN_WITH_CSS);
  });

  it("creates the file and adds the store ahead of `begin` when the keyboard had none", () => {
    const vfs = vfsOf({ "source/t.kmn": KMN_NO_CSS });
    expect(applyCustomCssToVfs(vfs, "t", ".b {}")).toEqual([]);
    expect(vfs.get("source/t.css")?.content).toBe(".b {}");
    const kmn = vfs.get("source/t.kmn")?.content as string;
    expect(kmn).toContain("store(&KMW_EMBEDCSS) 't.css'");
    expect(kmn.indexOf("&KMW_EMBEDCSS")).toBeLessThan(kmn.indexOf("begin Unicode"));
  });

  it("removes the file and the store line when cleared", () => {
    const vfs = vfsOf({ "source/t.kmn": KMN_WITH_CSS, "source/kb.css": ".a {}" });
    applyCustomCssToVfs(vfs, "t", "  ");
    expect(vfs.get("source/kb.css")).toBeUndefined();
    expect(vfs.get("source/t.kmn")?.content).not.toContain("KMW_EMBEDCSS");
  });

  it("relinks the start keyboard's wrapper class when the VFS already carries the new id", () => {
    const vfs = vfsOf({ "source/newkb.kmn": KMN_WITH_CSS, "source/kb.css": ".a {}" });
    applyCustomCssToVfs(vfs, "newkb", ".kmw-keyboard-t .kmw-key { color: red; } .kmw-keyboard-t-alt {}", "t");
    expect(vfs.get("source/kb.css")?.content).toBe(".kmw-keyboard-newkb .kmw-key { color: red; } .kmw-keyboard-t-alt {}");
  });
});
