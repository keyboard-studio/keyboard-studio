// projectWorkingCopyVfs.icon — the icon step's bytes reach the projected
// VFS (#1550). Real pipeline, no engine mock (like flagParity): the icon
// must survive carve re-emits and the id rename, byte-identical, in both
// the .zip and the fork+PR tree (both project through this function).

import { describe, it, expect } from "vitest";
import { charStore, irGroup, makeTestIR, vkeyRule } from "@keyboard-studio/contracts/fixtures";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { icoToBase64 } from "../editors/assignLoop/icoCodec.ts";
import { projectWorkingCopyVfs } from "./projectWorkingCopyVfs.ts";
import { stubKmnVfs } from "../test/workingCopy.ts";

// A hand-built .ico (not produced by our encoder): arbitrary valid header
// + payload the projection must NOT touch — byte-identity is the assertion.
const AUTHORED_ICO = new Uint8Array([
  0, 0, 1, 0, 1, 0, 16, 16, 0, 0, 1, 0, 32, 0, 0, 0, 0, 0, 22, 0, 0, 0,
  9, 9, 9, 9,
]);
const AUTHORED_B64 = icoToBase64(AUTHORED_ICO);

/** The flagParity fixture IR: groups + a 3-item deadkey store (slot ids `store#dkt#<n>`). */
function makeFixtureIr(): KeyboardIR {
  const dkt = charStore({
    nodeId: "store#dkt",
    name: "dktX",
    items: [
      { kind: "char", value: "À" },
      { kind: "char", value: "ε" },
      { kind: "char", value: "Z" },
    ],
  });
  const main = irGroup({
    nodeId: "group#main",
    name: "main",
    rules: [
      vkeyRule({ nodeId: "rule#a", vkey: "K_A", output: "a" }),
      vkeyRule({ nodeId: "rule#b", vkey: "K_B", output: "b" }),
    ],
  });
  return makeTestIR([main], [dkt]);
}

function project(opts: {
  iconIcoBase64?: string | null;
  deletedItemIds?: readonly string[];
  deletedNodeIds?: readonly string[];
  targetKeyboardId?: string;
  seedIco?: Uint8Array;
  seedBitmapStore?: boolean;
}) {
  const vfs = stubKmnVfs(
    "kb",
    opts.seedBitmapStore === true
      ? "c stub\nstore(&BITMAP) 'kb.ico'\n"
      : "c stub\n",
  );
  if (opts.seedIco !== undefined) vfs.set("source/kb.ico", opts.seedIco, true);
  projectWorkingCopyVfs({
    vfs,
    keyboardId: "kb",
    startIr: makeFixtureIr(),
    deletedNodeIds: new Set(opts.deletedNodeIds ?? []),
    deletedItemIds: new Set(opts.deletedItemIds ?? []),
    assignments: [],
    getPattern: () => undefined,
    identity: null,
    ...(opts.iconIcoBase64 !== undefined ? { iconIcoBase64: opts.iconIcoBase64 } : {}),
    ...(opts.targetKeyboardId !== undefined ? { targetKeyboardId: opts.targetKeyboardId } : {}),
  });
  return vfs;
}

describe("projectWorkingCopyVfs — icon (#1550)", () => {
  it("writes the icon bytes byte-identical and adds the BITMAP store", () => {
    const vfs = project({ iconIcoBase64: AUTHORED_B64 });
    const ico = vfs.get("source/kb.ico");
    expect(ico).toBeDefined();
    expect(ico!.isBinary).toBe(true);
    expect(ico!.content).toEqual(AUTHORED_ICO);
    expect(vfs.get("source/kb.kmn")?.content as string).toContain(
      "store(&BITMAP) 'kb.ico'",
    );
  });

  it("changes nothing for an untouched (null) icon", () => {
    const vfs = project({});
    expect(vfs.get("source/kb.ico")).toBeUndefined();
    expect(vfs.get("source/kb.kmn")?.content).toBe("c stub\n");
  });

  it("survives a carve that forces a full .kmn re-emit (store-slot removal)", () => {
    // Slot removals set irRewritten, so step 1 re-emits the .kmn from the
    // IR — an icon applied before that emit would lose its store line.
    const vfs = project({
      iconIcoBase64: AUTHORED_B64,
      deletedItemIds: ["store#dkt#1"],
    });
    const ico = vfs.get("source/kb.ico");
    expect(ico).toBeDefined();
    expect(ico!.content).toEqual(AUTHORED_ICO);
    expect(vfs.get("source/kb.kmn")?.content as string).toContain(
      "store(&BITMAP) 'kb.ico'",
    );
  });

  it("carries the icon to the new id on rename", () => {
    const vfs = project({ iconIcoBase64: AUTHORED_B64, targetKeyboardId: "renamed_kb" });
    expect(vfs.get("source/kb.ico")).toBeUndefined();
    const ico = vfs.get("source/renamed_kb.ico");
    expect(ico).toBeDefined();
    expect(ico!.content).toEqual(AUTHORED_ICO);
    expect(vfs.get("source/renamed_kb.kmn")?.content as string).toContain(
      "store(&BITMAP) 'renamed_kb.ico'",
    );
  });

  it("keeps a kept template icon byte-identical (no duplicate store line)", () => {
    const vfs = project({
      iconIcoBase64: AUTHORED_B64,
      seedIco: AUTHORED_ICO,
      seedBitmapStore: true,
    });
    expect(vfs.get("source/kb.ico")!.content).toEqual(AUTHORED_ICO);
    expect(
      (vfs.get("source/kb.kmn")?.content as string).match(/store\(&BITMAP\)/g),
    ).toHaveLength(1);
  });

  it("warns and writes nothing for corrupt base64", () => {
    const vfs = project({ iconIcoBase64: "!!!not-base64!!!" });
    expect(vfs.get("source/kb.ico")).toBeUndefined();
    expect(vfs.get("source/kb.kmn")?.content).toBe("c stub\n");
  });
});
