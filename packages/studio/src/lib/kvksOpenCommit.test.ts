// The on-screen keyboard on a keyboard opened for update (spec 111 "live files", FR-041/FR-045):
// a Visual edit changes only that key's element, Code Apply writes the author's text, both through
// the seam with an undo record; a declined apply leaves the file; the code view, the preview and
// the download agree (SC-010); Copy is untouched.

import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { createVirtualFS, type StartKeyboard } from "@keyboard-studio/contracts";
import { parseKmn, parseKvks } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useWorkingCopyTransform } from "../hooks/useWorkingCopyTransform.ts";
import { projectWorkingCopyForOutput } from "./serializeWorkingCopy.ts";
import { applyOpenChange, undoLastOpenApply } from "./openApply.ts";
import { buildOskCodeChange, buildOskVisualChange, commitKvksOnOpen } from "./kvksOpenCommit.ts";
import { patchKvksLabels } from "./openApply/kvks.ts";
import { clearOpenSession, useOpenUndoStore } from "../stores/openUndoStore.ts";
import { readVfsText } from "./vfsText.ts";

vi.mock("./services.ts", () => ({
  getToZip: vi.fn(async () => vi.fn(async () => new Uint8Array())),
  getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
}));

const ID = "tiny";
const KMN_PATH = `source/${ID}.kmn`;
const KVKS_PATH = `source/${ID}.kvks`;
const KMN = "store(&NAME) 'Tiny'\nbegin Unicode > use(main)\ngroup(main) using keys\n+ [K_A] > 'a'\n";
// Hand-written layout: odd spacing, comment, an unmodelled encoding attribute.
const KVKS =
  '<?xml version="1.0" encoding="UTF-8"?>\r\n<visualkeyboard>\r\n<header><version>10.0</version><kbdname>tiny</kbdname></header>\r\n' +
  '<encoding name="unicode" fontname="Arial" fontsize="10">\r\n<!-- keep me -->\r\n' +
  '<layer shift=""><key vkey="K_A">a</key>   <key vkey="K_B" chars="b">b</key></layer>\r\n' +
  '<layer shift="S"><key vkey="K_A">A</key></layer>\r\n</encoding>\r\n</visualkeyboard>\r\n';

function open(kvks: string = KVKS): void {
  const entries = [
    { path: KMN_PATH, content: KMN, isBinary: false },
    { path: `source/${ID}.kps`, content: "<Package/>", isBinary: false },
    { path: KVKS_PATH, content: kvks, isBinary: false },
  ];
  const kb = { id: ID, path: "release/t/tiny", script: "Latn", targets: ["desktop"], displayName: "Tiny", version: "1.0", languages: ["en"] } as StartKeyboard;
  clearOpenSession();
  const wc = useWorkingCopyStore.getState();
  wc.reset();
  wc.instantiateFromExisting(kb, { vfs: createVirtualFS(entries), ir: parseKmn(KMN, ID).ir });
  wc.setAttribution({ authorName: "T", copyrightHolder: "T" });
  wc.setFallbackPolicy("pass-through");
}
const apply = (c: Parameters<typeof applyOpenChange>[0]) => Promise.resolve(applyOpenChange(c));
const text = (path: string): string | undefined => readVfsText(useWorkingCopyStore.getState().startVfs!, path);

function relabelled(vkey: string, shift: string, label: string) {
  const ir = parseKvks(KVKS);
  return {
    ...ir,
    layers: ir.layers.map((l) => (l.shift !== shift ? l : { ...l, keys: l.keys.map((k) => (k.vkey === vkey ? { ...k, label } : k)) })),
  };
}

describe("on-screen keyboard on Open", () => {
  it("a Visual edit changes only that key's element; undo is byte-identical", async () => {
    open();
    const r = await commitKvksOnOpen(() => buildOskVisualChange(KVKS_PATH, KVKS, relabelled("K_B", "", "β")), apply);
    expect(r.outcome).toBe("written");
    expect(text(KVKS_PATH)).toBe(KVKS.replace(">b</key>", ">β</key>"));
    const rec = useOpenUndoStore.getState().records.at(-1)!;
    expect(rec.labelKey).toBe("osk");
    expect(undoLastOpenApply().ok).toBe(true);
    expect(text(KVKS_PATH)).toBe(KVKS);
  });

  it("an edit to the shifted layer leaves the unshifted key of the same name alone", async () => {
    open();
    await commitKvksOnOpen(() => buildOskVisualChange(KVKS_PATH, KVKS, relabelled("K_A", "S", "Æ")), apply);
    expect(text(KVKS_PATH)).toBe(KVKS.replace(">A</key>", ">Æ</key>"));
  });

  it("an element that cannot be placed precisely asks first; declined leaves the file, agreed re-emits", async () => {
    const dupKey = KVKS.replace('<key vkey="K_B" chars="b">b</key>', '<key vkey="K_B" chars="b">b</key><key vkey="K_B" chars="b">c</key>');
    open(dupKey);
    // Two elements for the one key: which one is meant cannot be told, so it is asked.
    const sc = parseKvks(dupKey);
    const next = { ...sc, layers: sc.layers.map((l) => ({ ...l, keys: l.keys.map((k) => (k.vkey === "K_B" && l.shift === "" ? { ...k, label: "x" } : k)) })) };
    expect(patchKvksLabels(dupKey, next)).toBeNull();
    const change = buildOskVisualChange(KVKS_PATH, dupKey, next);
    expect(change.kind === "files" && change.askReformat).toBe(true);
    const asked = applyOpenChange(change);
    expect(asked.status).toBe("needs-consent");
    expect(text(KVKS_PATH)).toBe(dupKey);
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
    // Declined by the host: nothing written, text unchanged.
    const declined = await commitKvksOnOpen(() => change, async () => ({ status: "declined" }));
    expect(declined.outcome).toBe("not-applied");
    expect(text(KVKS_PATH)).toBe(dupKey);
    expect(applyOpenChange(change, { consentedReemit: true }).status).toBe("applied");
    expect(parseKvks(text(KVKS_PATH)!).layers[0]!.keys.find((k) => k.vkey === "K_B")!.label).toBe("x");
  });

  it("Code Apply writes the author's text as typed; undo restores the file", async () => {
    open();
    const typed = KVKS.replace("<!-- keep me -->", "<!-- changed -->  ");
    const r = await commitKvksOnOpen(() => buildOskCodeChange(KVKS_PATH, typed), apply);
    expect(r.outcome).toBe("written");
    expect(text(KVKS_PATH)).toBe(typed);
    expect(useOpenUndoStore.getState().records.at(-1)!.labelKey).toBe("osk");
    expect(undoLastOpenApply().ok).toBe(true);
    expect(text(KVKS_PATH)).toBe(KVKS);
  });

  it("a failed or declined apply leaves the file unchanged", async () => {
    open();
    const typed = KVKS.replace("keep me", "x");
    for (const status of ["declined", "failed"] as const) {
      const r = await commitKvksOnOpen(
        () => buildOskCodeChange(KVKS_PATH, typed),
        async () => (status === "declined" ? { status } : { status, reason: "no" }),
      );
      expect(r.outcome).toBe("not-applied");
    }
    expect(text(KVKS_PATH)).toBe(KVKS);
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
  });

  it("the code view, the preview and the download hold the same .kvks (SC-010)", async () => {
    open();
    await commitKvksOnOpen(() => buildOskVisualChange(KVKS_PATH, KVKS, relabelled("K_B", "", "β")), apply);
    const { result } = renderHook(() => useWorkingCopyTransform({ previewedStartId: ID }));
    const fetched = createVirtualFS([
      { path: KMN_PATH, content: KMN, isBinary: false },
      { path: `source/${ID}.kps`, content: "<Package/>", isBinary: false },
      { path: KVKS_PATH, content: KVKS, isBinary: false },
    ]);
    result.current!(fetched, ID);
    const projected = await projectWorkingCopyForOutput();
    expect(readVfsText(fetched, KVKS_PATH), "preview").toBe(text(KVKS_PATH));
    expect(projected?.vfs.get(KVKS_PATH)?.content, "download").toBe(text(KVKS_PATH));
  });

  it("XML-special labels are escaped in place and read back", async () => {
    open();
    await commitKvksOnOpen(() => buildOskVisualChange(KVKS_PATH, KVKS, relabelled("K_B", "", "<&>")), apply);
    expect(text(KVKS_PATH)).toBe(KVKS.replace(">b</key>", ">&lt;&amp;&gt;</key>"));
    expect(parseKvks(text(KVKS_PATH)!).layers[0]!.keys[1]!.label).toBe("<&>");
  });

  it("a BOM is kept; blanking a key empties only its element", async () => {
    open("\uFEFF" + KVKS);
    const before = text(KVKS_PATH)!;
    await commitKvksOnOpen(() => buildOskVisualChange(KVKS_PATH, before, relabelled("K_B", "", "")), apply);
    expect(text(KVKS_PATH)).toBe(before.replace(">b</key>", "></key>"));
    expect(text(KVKS_PATH)!.startsWith("\uFEFF")).toBe(true);
  });

  it("three layers: only the named layer's key changes", async () => {
    const three = KVKS.replace("</encoding>", '<layer shift="C"><key vkey="K_A">c</key></layer>\r\n</encoding>');
    open(three);
    const ir = parseKvks(three);
    const next = { ...ir, layers: ir.layers.map((l) => (l.shift !== "C" ? l : { ...l, keys: l.keys.map((k) => ({ ...k, label: "Z" })) })) };
    await commitKvksOnOpen(() => buildOskVisualChange(KVKS_PATH, three, next), apply);
    expect(text(KVKS_PATH)).toBe(three.replace(">c</key>", ">Z</key>"));
  });

  it("markup inside a key, a duplicated layer and a layer in a comment each ask first", () => {
    const cases = [
      KVKS.replace(">b</key>", "><![CDATA[b]]></key>"),
      KVKS.replace("</encoding>", '<layer shift=""><key vkey="K_B">q</key></layer></encoding>'),
      KVKS.replace("<!-- keep me -->", '<!-- <layer shift=""><key vkey="K_B">q</key></layer> -->'),
    ];
    for (const src of cases) {
      const ir = parseKvks(src);
      const next = { ...ir, layers: ir.layers.map((l, i) => (i !== 0 ? l : { ...l, keys: l.keys.map((k) => (k.vkey === "K_B" ? { ...k, label: "x" } : k)) })) };
      const change = buildOskVisualChange(KVKS_PATH, src, next);
      expect(change.kind === "files" && change.askReformat, src).toBe(true);
    }
  });

  it("a header flag on, off and with no flags element: placed in place, read back", async () => {
    open();
    const ir = parseKvks(KVKS);
    const on = await commitKvksOnOpen(() => buildOskVisualChange(KVKS_PATH, KVKS, { ...ir, key102: true, displayUnderlying: true }), apply);
    expect(on.outcome).toBe("written");
    const withFlags = KVKS.replace("</header>", "<flags><key102/><displayunderlying/></flags>\r\n</header>");
    expect(text(KVKS_PATH)).toBe(withFlags);
    const off = patchKvksLabels(withFlags, ir);
    expect(off).toBe(KVKS.replace("</header>", "<flags></flags>\r\n</header>"));
  });

  it("a flag added to a multi-line flags block gets its own line at the siblings' indent; a self-closing flags asks", () => {
    const multi = '<visualkeyboard>\r\n  <header>\r\n    <flags>\r\n      <usealtgr/>\r\n    </flags>\r\n  </header>\r\n  <encoding name="unicode"><layer shift=""><key vkey="K_A">a</key></layer></encoding>\r\n</visualkeyboard>\r\n';
    const ir = parseKvks(multi);
    expect(patchKvksLabels(multi, { ...ir, key102: true })).toBe(multi.replace("    </flags>", "      <key102/>\r\n    </flags>"));
    const selfClosing = multi.replace(/<flags>[\s\S]*<\/flags>/, "<flags/>");
    const sc = parseKvks(selfClosing);
    expect(patchKvksLabels(selfClosing, { ...sc, key102: true })).toBeNull();
    const change = buildOskVisualChange(KVKS_PATH, selfClosing, { ...sc, key102: true });
    expect(change.kind === "files" && change.askReformat).toBe(true);
  });

  it("a header field the editor does not write cannot be placed: it asks", () => {
    const ir = parseKvks(KVKS);
    const change = buildOskVisualChange(KVKS_PATH, KVKS, { ...ir, kbdname: "other" });
    expect(change.kind === "files" && change.askReformat).toBe(true);
  });

  it("Copy is unchanged: the commit is refused off Open", async () => {
    useWorkingCopyStore.getState().reset();
    const r = await commitKvksOnOpen(() => buildOskCodeChange(KVKS_PATH, "x"), apply);
    expect(r.outcome).toBe("off-open");
  });
});
