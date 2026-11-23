// Icon writes on Open (spec 111 FR-041, #2927): the edited `.ico` is
// written to its file when applied, through the `files` seam, with an undo
// record — and the seam's `files` change and its undo handle binary
// content. Real engine; no mocks.

import { beforeEach, describe, expect, it } from "vitest";
import { createVirtualFS, type StartKeyboard } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useOpenUndoStore } from "../../stores/openUndoStore.ts";
import { encodeIco, icoToBase64 } from "../../editors/assignLoop/icoCodec.ts";
import { applyOpenChange, undoLastOpenApply } from "../openApply.ts";
import { buildIconChange } from "./icon.ts";
import { readVfsText } from "../vfsText.ts";

const ID = "tiny";
const KMN_PATH = `source/${ID}.kmn`;
const ICO_PATH = `source/${ID}.ico`;

function kmnText(bitmap?: string): string {
  return [
    "c a hand-written comment",
    "store(&NAME) 'Tiny'",
    ...(bitmap !== undefined ? [`store(&BITMAP) '${bitmap}'`] : []),
    "store(&VERSION) '10.0'",
    "",
    "begin Unicode > use(main)",
    "",
    "group(main) using keys",
    "c the vowels",
    "+ [K_A] > 'a'",
    "+ [K_B] > 'b'",
    "",
  ].join("\r\n");
}

const KB: StartKeyboard = {
  id: ID,
  path: `release/t/${ID}`,
  script: "Latn",
  targets: ["desktop"],
  displayName: "Tiny",
  version: "1.0",
  languages: ["en"],
} as StartKeyboard;

function redIco(seed: number): { bytes: Uint8Array; base64: string } {
  const pixels = new Uint8ClampedArray(48 * 48 * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = seed;
    pixels[i + 3] = 255;
  }
  const bytes = encodeIco({ width: 48, height: 48, pixels }, [48]);
  return { bytes, base64: icoToBase64(bytes) };
}

function open(opts: { bitmap?: string; icoBytes?: Uint8Array; icoPath?: string } = {}): void {
  useOpenUndoStore.getState().clear();
  const text = kmnText(opts.bitmap);
  const files: { path: string; content: string | Uint8Array; isBinary: boolean }[] = [
    { path: KMN_PATH, content: text, isBinary: false },
    // Live Open (spec 111) needs the keyboard's own descriptor in the
    // working copy — `isLiveOpen` is false without it, and the seam
    // refuses every apply.
    { path: `source/${ID}.kps`, content: "<Package/>", isBinary: false },
  ];
  if (opts.icoBytes !== undefined) {
    files.push({ path: opts.icoPath ?? ICO_PATH, content: opts.icoBytes, isBinary: true });
  }
  const vfs = createVirtualFS(files);
  const wc = useWorkingCopyStore.getState();
  wc.reset();
  wc.instantiateFromExisting(KB, { vfs, ir: parseKmn(text, ID).ir });
}

const startVfs = () => useWorkingCopyStore.getState().startVfs!;
const icoEntry = (path = ICO_PATH) => startVfs().get(path);
const kmnAfter = (): string => readVfsText(startVfs(), KMN_PATH)!;

describe("buildIconChange", () => {
  beforeEach(() => open());

  it("returns null with no edited icon", () => {
    expect(buildIconChange(null)).toBe(null);
    expect(buildIconChange("")).toBe(null);
    expect(buildIconChange(undefined)).toBe(null);
  });

  it("writes a new icon at source/<id>.ico and adds the &BITMAP line", () => {
    const { base64 } = redIco(200);
    const built = buildIconChange(base64);
    expect(built).not.toBe(null);
    expect(built!.change.kind).toBe("files");
    expect(built!.change.label).toBe("Keyboard icon");
    if (built!.change.kind !== "files") throw new Error("expected a files change");
    expect(built!.change.files[ICO_PATH]).toBeInstanceOf(Uint8Array);
    expect(built!.change.files[KMN_PATH]).toMatch(/store\(&BITMAP\) 'tiny\.ico'/);
  });

  it("writes into the &BITMAP file when the .kmn already names one", () => {
    const old = redIco(10);
    open({ bitmap: "Cameroon.ico", icoBytes: old.bytes, icoPath: "source/Cameroon.ico" });
    const next = redIco(200);
    const built = buildIconChange(next.base64);
    expect(built).not.toBe(null);
    if (built!.change.kind !== "files") throw new Error("expected a files change");
    expect(built!.change.files["source/Cameroon.ico"]).toBeInstanceOf(Uint8Array);
    expect(built!.change.files[ICO_PATH]).toBeUndefined();
    // The .kmn already names the file: no .kmn entry in the change.
    expect(built!.change.files[KMN_PATH]).toBeUndefined();
  });
});

describe("icon apply on Open", () => {
  it("writes the edited icon and the store line, with one undo record", () => {
    open();
    const before = kmnAfter();
    const { bytes, base64 } = redIco(200);
    const built = buildIconChange(base64);
    expect(built).not.toBe(null);
    const result = applyOpenChange(built!.change);
    expect(result.status).toBe("applied");
    expect(icoEntry()?.content).toEqual(bytes);
    expect(icoEntry()?.isBinary).toBe(true);
    expect(kmnAfter()).toMatch(/store\(&BITMAP\) 'tiny\.ico'/);
    // CRLF kept: the insert adds one line and no other line changes.
    const after = kmnAfter();
    expect(after).not.toMatch(/(?<!\r)\n/);
    expect(after.split("\r\n").filter((l) => !l.includes("&BITMAP"))).toEqual(
      before.split("\r\n"),
    );
    const records = useOpenUndoStore.getState().records;
    expect(records).toHaveLength(1);
    expect(records[0]!.labelKey).toBe("icon");
    expect(records[0]!.files[ICO_PATH]).toEqual({ before: null, after: bytes });
  });

  it("Keep is unchanged: identical bytes write nothing", () => {
    const { bytes, base64 } = redIco(200);
    open({ bitmap: `${ID}.ico`, icoBytes: bytes });
    const built = buildIconChange(base64);
    expect(built).not.toBe(null);
    expect(applyOpenChange(built!.change).status).toBe("unchanged");
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
  });

  it("undo restores the previous icon bytes (not a deletion)", () => {
    const old = redIco(10);
    open({ bitmap: `${ID}.ico`, icoBytes: old.bytes });
    const next = redIco(200);
    const built = buildIconChange(next.base64);
    expect(applyOpenChange(built!.change).status).toBe("applied");
    expect(icoEntry()?.content).toEqual(next.bytes);
    const undone = undoLastOpenApply();
    expect(undone.ok).toBe(true);
    expect(icoEntry()?.content).toEqual(old.bytes);
    expect(kmnAfter()).toMatch(/store\(&BITMAP\) 'tiny\.ico'/);
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
  });

  it("undo restores the missing .kmn line when the icon was new", () => {
    open();
    const { base64 } = redIco(200);
    const built = buildIconChange(base64);
    expect(applyOpenChange(built!.change).status).toBe("applied");
    expect(kmnAfter()).toMatch(/store\(&BITMAP\) 'tiny\.ico'/);
    expect(undoLastOpenApply().ok).toBe(true);
    expect(icoEntry()).toBeUndefined();
    expect(kmnAfter()).not.toMatch(/&BITMAP/);
  });

  it("a second apply over changed bytes is refused by undo's changed-since guard, not silently overwritten", () => {
    const old = redIco(10);
    open({ bitmap: `${ID}.ico`, icoBytes: old.bytes });
    const next = redIco(200);
    expect(applyOpenChange(buildIconChange(next.base64)!.change).status).toBe("applied");
    // The file changed out from under the undo record: undo must refuse.
    const st = useWorkingCopyStore.getState();
    st.replaceStartingPointFiles({ [ICO_PATH]: redIco(99).bytes });
    const undone = undoLastOpenApply();
    expect(undone.ok).toBe(false);
    expect(undone.code).toBe("changed-since");
  });
});
