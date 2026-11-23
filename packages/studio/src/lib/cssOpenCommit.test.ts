// The stylesheet on a keyboard opened for update (spec 111 "live files", T089a): Apply writes the
// file and the `&KMW_EMBEDCSS` line into the files; the code view, the preview and the download
// agree (SC-010); undo is exact; Copy is untouched.

import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { createVirtualFS, type StartKeyboard } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useWorkingCopyTransform } from "../hooks/useWorkingCopyTransform.ts";
import { projectWorkingCopyForOutput } from "./serializeWorkingCopy.ts";
import { applyOpenChange, undoLastOpenApply } from "./openApply.ts";
import { commitImageWidthFixOnOpen, commitStylesheetOnOpen } from "./cssOpenCommit.ts";
import { clearOpenSession, useOpenUndoStore } from "../stores/openUndoStore.ts";
import { readVfsText } from "./vfsText.ts";

vi.mock("./services.ts", () => ({
  getToZip: vi.fn(async () => vi.fn(async () => new Uint8Array())),
  getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
}));

const ID = "tiny";
const KMN_PATH = `source/${ID}.kmn`;
const CSS_PATH = `source/${ID}.css`;
const BOM = "﻿";
const body = (eol: string, store: string): string =>
  [
    "c a comment",
    "store(&NAME) 'Tiny'",
    "store(&VERSION) '10.0'",
    ...(store === "" ? [] : [store]),
    "",
    "begin Unicode > use(main)",
    "",
    "group(main) using keys",
    "+ [K_A] > 'a'   c spacing",
    "",
  ].join(eol);

function open(kmn: string, files: Record<string, string> = {}): void {
  const entries = [
    { path: KMN_PATH, content: kmn, isBinary: false },
    { path: `source/${ID}.kps`, content: "<Package/>", isBinary: false },
    ...Object.entries(files).map(([path, content]) => ({ path, content, isBinary: false })),
  ];
  const kb = { id: ID, path: "release/t/tiny", script: "Latn", targets: ["desktop"], displayName: "Tiny", version: "1.0", languages: ["en"] } as StartKeyboard;
  clearOpenSession();
  const wc = useWorkingCopyStore.getState();
  wc.reset();
  wc.instantiateFromExisting(kb, { vfs: createVirtualFS(entries), ir: parseKmn(kmn, ID).ir });
  wc.setAttribution({ authorName: "T", copyrightHolder: "T" });
  wc.setFallbackPolicy("pass-through");
}

const apply = (c: Parameters<typeof applyOpenChange>[0]) => Promise.resolve(applyOpenChange(c));
const css = (t: string) => commitStylesheetOnOpen(t, apply);
const fix = () => commitImageWidthFixOnOpen(apply);

const text = (path: string): string | undefined => {
  const vfs = useWorkingCopyStore.getState().startVfs!;
  return readVfsText(vfs, path);
};

describe("stylesheet on Open", () => {
  it("a keyboard with no stylesheet gets one; the .kmn changes by exactly the store line (BOM and CRLF kept)", async () => {
    const kmn = BOM + body("\r\n", "");
    open(kmn);
    expect(await css(".kmw-key { color: red; }")).toBe("written");
    expect(text(CSS_PATH)).toBe(".kmw-key { color: red; }");
    expect(text(KMN_PATH)).toBe(kmn.replace("begin Unicode", "store(&KMW_EMBEDCSS) 'tiny.css'\r\n\r\nbegin Unicode"));
    expect(useOpenUndoStore.getState().records).toHaveLength(1);
    expect(useOpenUndoStore.getState().records[0]!.labelKey).toBe("stylesheet");
    expect(useWorkingCopyStore.getState().customCss).toBeNull();
  });

  it("clearing deletes the file and the store line, byte-identical otherwise; undo restores both exactly", async () => {
    const kmn = BOM + body("\r\n", "store(&KMW_EMBEDCSS) 'tiny.css'");
    open(kmn, { [CSS_PATH]: ".a { top: 0; }" });
    expect(await css("")).toBe("written");
    expect(text(CSS_PATH)).toBeUndefined();
    expect(text(KMN_PATH)).toBe(kmn.replace("store(&KMW_EMBEDCSS) 'tiny.css'\r\n", ""));
    expect(undoLastOpenApply().ok).toBe(true);
    expect(text(CSS_PATH)).toBe(".a { top: 0; }");
    expect(text(KMN_PATH)).toBe(kmn);
  });

  it("editing an existing stylesheet leaves the .kmn untouched and unchanged text is a no-op", async () => {
    const kmn = body("\n", "store(&KMW_EMBEDCSS) 'tiny.css'");
    open(kmn, { [CSS_PATH]: ".a { top: 0; }" });
    expect(await css(".a { top: 0; }")).toBe("unchanged");
    expect(await css(".a { top: 1px; }")).toBe("written");
    expect(text(KMN_PATH)).toBe(kmn);
    expect(text(CSS_PATH)).toBe(".a { top: 1px; }");
  });

  it("the code view, the preview and the download hold the same .css and .kmn (SC-010)", async () => {
    const kmn = body("\r\n", "");
    open(kmn);
    await css(".kmw-key { color: red; }");
    const { result } = renderHook(() => useWorkingCopyTransform({ previewedStartId: ID }));
    const fetched = createVirtualFS([
      { path: KMN_PATH, content: kmn, isBinary: false },
      { path: `source/${ID}.kps`, content: "<Package/>", isBinary: false },
    ]);
    result.current!(fetched, ID);
    const projected = await projectWorkingCopyForOutput();
    for (const path of [CSS_PATH, KMN_PATH]) {
      const download = projected?.vfs.get(path)?.content;
      expect(readVfsText(fetched, path), `preview ${path}`).toBe(text(path));
      expect(typeof download === "string" ? download.replace(/store\(&(?:KEYBOARD)?VERSION\)[^\r\n]*\r?\n/gi, "") : download, `download ${path}`)
        .toBe(text(path)!.replace(/store\(&(?:KEYBOARD)?VERSION\)[^\r\n]*\r?\n/gi, ""));
    }
  });

  it("an accepted image-width fix is written into kb.css on Open, once, and undoes", async () => {
    const kmn = body("\n", "");
    open(kmn, { "source/help/kb.css": "body { margin: 0; }" });
    expect(await fix()).toBe("written");
    expect(text("source/help/kb.css")).toBe("body { margin: 0; }\nimg { max-width: 100%; }\n");
    expect(await fix()).toBe("unchanged");
    expect(useOpenUndoStore.getState().records[0]!.labelKey).toBe("doc-image-width");
    expect(undoLastOpenApply().ok).toBe(true);
    expect(text("source/help/kb.css")).toBe("body { margin: 0; }");
  });

  it("a fetched-only kb.css (the loader's slice) is created in the files with the rule", async () => {
    open(body("\n", ""));
    useWorkingCopyStore.getState().setStartDocCssTexts([{ path: "source/welcome/kb.css", text: "h1 { x: y; }" }]);
    expect(await fix()).toBe("written");
    expect(text("source/welcome/kb.css")).toBe("h1 { x: y; }\nimg { max-width: 100%; }\n");
  });

  it("Copy is unchanged: the commit is refused off Open", async () => {
    const wc = useWorkingCopyStore.getState();
    wc.reset();
    expect(await css("a{}")).toBe("off-open");
  });

  it("a .kmn with no begin statement refuses: no .css is written without its store line", async () => {
    const kmn = "store(&NAME) 'Tiny'\nc no begin here\n";
    open(kmn);
    expect(await css(".a { top: 0; }")).toBe("no-store-line");
    expect(text(CSS_PATH)).toBeUndefined();
    expect(text(KMN_PATH)).toBe(kmn);
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
  });

  it("a stylesheet the store line names under another file name is edited in place", async () => {
    const kmn = body("\n", "store(&KMW_EMBEDCSS) 'osk.css'");
    open(kmn, { "source/osk.css": ".a { top: 0; }" });
    expect(await css(".a { top: 2px; }")).toBe("written");
    expect(text("source/osk.css")).toBe(".a { top: 2px; }");
    expect(text(CSS_PATH)).toBeUndefined();
    expect(text(KMN_PATH)).toBe(kmn);
  });

  it("a declined or busy apply is not-applied and writes nothing", async () => {
    open(body("\n", ""), { "source/help/kb.css": "p { x: y; }" });
    expect(await commitImageWidthFixOnOpen(async () => ({ status: "declined" }))).toBe("not-applied");
    expect(await css(".a{}")).toBe("written");
    expect(text("source/help/kb.css")).toBe("p { x: y; }");
  });

  it("the width fix with nothing to change reports unchanged and writes no record", async () => {
    open(body("\n", ""), { "source/help/kb.css": "img { max-width: 50%; }" });
    expect(await fix()).toBe("unchanged");
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
    open(body("\n", ""));
    expect(await fix()).toBe("unchanged");
  });
});
