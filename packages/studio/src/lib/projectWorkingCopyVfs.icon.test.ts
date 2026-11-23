// projectWorkingCopyVfs step 4c (#2927): the icon step's edited icon is
// written into the working copy, so the preview and the download carry it
// — the `.ico` bytes at the `&BITMAP` file, plus the store line when it is
// missing. Before this step the bytes were stored only in the decision and
// the download shipped the template's icon (or none).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { base64ToIco, encodeIco, icoToBase64 } from "../editors/assignLoop/icoCodec.ts";

import { projectWorkingCopyVfs } from "./projectWorkingCopyVfs.ts";

const KBID = "icon_proj";

// Vitest runs with the package root as cwd; the fixture lives with the engine's caps code.
// Sibling-asset stores are dropped: this VFS holds the .kmn alone, so a bitmap
// or layout-file reference would fail the compile for reasons unrelated to the icon.
const UPSTREAM = readFileSync(
  resolve(process.cwd(), "../engine/src/caps/__fixtures__/upstream_basic_kbdus/basic_kbdus.kmn"),
  "utf8",
)
  .split("\n")
  .filter((l) => !/^store\(&(BITMAP|VISUALKEYBOARD|LAYOUTFILE|KMW_\w+)\)/i.test(l))
  .join("\n");

function redIcoBase64(): { bytes: Uint8Array; base64: string } {
  const pixels = new Uint8ClampedArray(48 * 48 * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 200;
    pixels[i + 3] = 255;
  }
  const bytes = encodeIco({ width: 48, height: 48, pixels }, [48]);
  return { bytes, base64: icoToBase64(bytes) };
}

function project(opts: {
  kmn?: string;
  iconIcoBase64?: string | null;
  ico?: { path: string; bytes: Uint8Array };
  targetKeyboardId?: string;
}) {
  const kmn = opts.kmn ?? UPSTREAM;
  const vfs = createVirtualFS();
  vfs.set(`source/${KBID}.kmn`, kmn, false);
  if (opts.ico !== undefined) vfs.set(opts.ico.path, opts.ico.bytes, true);
  const { warnings, effectiveKeyboardId } = projectWorkingCopyVfs({
    vfs,
    keyboardId: KBID,
    ...(opts.targetKeyboardId !== undefined ? { targetKeyboardId: opts.targetKeyboardId } : {}),
    startIr: parseKmn(kmn, KBID).ir,
    deletedNodeIds: new Set(),
    assignments: [],
    getPattern: () => undefined,
    identity: null,
    ...(opts.iconIcoBase64 !== undefined ? { iconIcoBase64: opts.iconIcoBase64 } : {}),
  });
  const entry = vfs.get(`source/${effectiveKeyboardId ?? KBID}.kmn`);
  return {
    vfs,
    kmn: typeof entry?.content === "string" ? entry.content : "",
    warnings,
    effectiveKeyboardId,
  };
}

describe("projectWorkingCopyVfs step 4c - edited icon (#2927)", () => {
  it("writes the edited icon at source/<id>.ico and adds the &BITMAP line", () => {
    const { bytes, base64 } = redIcoBase64();
    const { vfs, kmn, warnings } = project({ iconIcoBase64: base64 });
    expect(warnings.filter((w) => w.includes("icon"))).toEqual([]);
    const entry = vfs.get(`source/${KBID}.ico`);
    expect(entry?.content).toEqual(bytes);
    expect(entry?.isBinary).toBe(true);
    expect(kmn).toMatch(/store\(&BITMAP\) 'icon_proj\.ico'/);
  });

  it("writes into the &BITMAP file when the .kmn already names one", () => {
    const { bytes, base64 } = redIcoBase64();
    const withBitmap = UPSTREAM.replace(
      "store(&VERSION)",
      "store(&BITMAP) 'Cameroon.ico'\nstore(&VERSION)",
    );
    const { vfs, kmn } = project({
      kmn: withBitmap,
      iconIcoBase64: base64,
      ico: { path: "source/Cameroon.ico", bytes: new Uint8Array([9]) },
    });
    expect(vfs.get("source/Cameroon.ico")?.content).toEqual(bytes);
    expect(vfs.get(`source/${KBID}.ico`)).toBeUndefined();
    expect(kmn).toMatch(/store\(&BITMAP\) 'Cameroon\.ico'/);
  });

  it("leaves the icon alone when no icon value is recorded", () => {
    const { vfs, kmn } = project({});
    expect(vfs.get(`source/${KBID}.ico`)).toBeUndefined();
    expect(kmn).not.toMatch(/&BITMAP/);
  });

  it("Keep is byte-identical: the source bytes pass through unchanged", () => {
    const { bytes, base64 } = redIcoBase64();
    const withBitmap = UPSTREAM.replace(
      "store(&VERSION)",
      `store(&BITMAP) '${KBID}.ico'\nstore(&VERSION)`,
    );
    const { vfs, kmn } = project({
      kmn: withBitmap,
      iconIcoBase64: base64,
      ico: { path: `source/${KBID}.ico`, bytes },
    });
    expect(vfs.get(`source/${KBID}.ico`)?.content).toEqual(bytes);
    expect(kmn).toMatch(/store\(&BITMAP\) 'icon_proj\.ico'/);
  });

  it("uses the effective (post-rename) id for the icon file", () => {
    const { bytes, base64 } = redIcoBase64();
    const { vfs, kmn, effectiveKeyboardId } = project({
      iconIcoBase64: base64,
      targetKeyboardId: "renamed_kbd",
    });
    expect(effectiveKeyboardId).toBe("renamed_kbd");
    expect(vfs.get("source/renamed_kbd.ico")?.content).toEqual(bytes);
    expect(kmn).toMatch(/store\(&BITMAP\) 'renamed_kbd\.ico'/);
  });

  it("warns and ships the start icon when the value cannot be decoded", () => {
    const { vfs, kmn, warnings } = project({ iconIcoBase64: "!!!not-base64!!!" });
    expect(vfs.get(`source/${KBID}.ico`)).toBeUndefined();
    expect(kmn).not.toMatch(/&BITMAP/);
    expect(warnings.some((w) => w.includes("icon") && w.includes("could not be decoded"))).toBe(true);
  });

  it("the written .ico round-trips through the codec", () => {
    const { base64 } = redIcoBase64();
    const { vfs } = project({ iconIcoBase64: base64 });
    const entry = vfs.get(`source/${KBID}.ico`);
    expect(entry?.content instanceof Uint8Array).toBe(true);
    expect(base64ToIco(icoToBase64(entry!.content as Uint8Array))).toEqual(entry!.content);
  });
});
