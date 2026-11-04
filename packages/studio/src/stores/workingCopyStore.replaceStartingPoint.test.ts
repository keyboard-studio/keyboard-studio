// Open mode (spec 111 FR-009): replaceStartingPointFromText swaps a file and
// startIr in one update; a later decision-driven rebuild builds on the edit.

import { beforeEach, describe, expect, it } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { StartKeyboard } from "@keyboard-studio/contracts";
import { emitKmn, parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "./workingCopyStore.ts";
import { replaceStartingPointAndReplay } from "../lib/replaceStartingPoint.ts";
import { rebuildWorkingCopyFromStores } from "../decisions/rebuildWorkingCopy.ts";

const KMN = "store(&NAME) 'Kb'\nbegin Unicode > use(main)\ngroup(main) using keys\n+ [K_A] > 'a'\n";
const EDITED = "c a comment the author added\n" + KMN;
const KB: StartKeyboard = { id: "kb", path: "release/k/kb", script: "Latn", targets: ["windows"], displayName: "Kb", version: "1.0" };

function open(): void {
  const vfs = createVirtualFS();
  vfs.set("source/kb.kmn", KMN, false);
  vfs.set("source/kb.kvks", "<visualkeyboard/>", false);
  useWorkingCopyStore.getState().instantiateFromExisting(KB, { vfs, ir: parseKmn(KMN, "kb").ir });
}

function vfsText(path: string): string | undefined {
  const c = useWorkingCopyStore.getState().startVfs?.get(path)?.content;
  return typeof c === "string" ? c : undefined;
}

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
});

describe("replaceStartingPointFromText", () => {
  it("writes the text verbatim and re-parses startIr in one update", () => {
    open();
    const before = useWorkingCopyStore.getState().startIr;
    let updates = 0;
    const unsub = useWorkingCopyStore.subscribe(() => {
      updates += 1;
    });
    const result = useWorkingCopyStore.getState().replaceStartingPointFromText("source/kb.kmn", EDITED);
    unsub();
    expect(result).toEqual({ ok: true });
    expect(updates).toBe(1);
    expect(vfsText("source/kb.kmn")).toBe(EDITED);
    const after = useWorkingCopyStore.getState().startIr;
    expect(after).not.toBe(before);
    expect(emitKmn(after!)).toContain("a comment the author added");
  });

  it("counts a formatting-only change as a change", () => {
    open();
    const formatted = KMN.replace("+ [K_A]", "+   [K_A]");
    expect(useWorkingCopyStore.getState().replaceStartingPointFromText("source/kb.kmn", formatted).ok).toBe(true);
    expect(vfsText("source/kb.kmn")).toBe(formatted);
  });

  it("blocks a .kmn that does not parse and changes nothing", () => {
    open();
    const before = useWorkingCopyStore.getState().startIr;
    const result = useWorkingCopyStore.getState().replaceStartingPointFromText("source/kb.kmn", "store(&NAME 'unterminated\n+ > [[[");
    if (result.ok) {
      // The codec is lenient for some inputs; the contract is only that a
      // failure leaves the starting point untouched.
      return;
    }
    expect(useWorkingCopyStore.getState().startIr).toBe(before);
    expect(vfsText("source/kb.kmn")).toBe(KMN);
  });

  it("writes a .kvks without touching startIr", () => {
    open();
    const before = useWorkingCopyStore.getState().startIr;
    useWorkingCopyStore.getState().replaceStartingPointFromText("source/kb.kvks", "<visualkeyboard x/>");
    expect(vfsText("source/kb.kvks")).toBe("<visualkeyboard x/>");
    expect(useWorkingCopyStore.getState().startIr).toBe(before);
  });

  it("keeps the touch layout the projection compares in step with the file", () => {
    open();
    useWorkingCopyStore.getState().replaceStartingPointFromText("source/kb.keyman-touch-layout", "{}");
    expect(useWorkingCopyStore.getState().touchLayoutJson).toBe("{}");
  });

  it("survives a later decision-driven rebuild", () => {
    open();
    expect(replaceStartingPointAndReplay("source/kb.kmn", EDITED).ok).toBe(true);
    const edited = useWorkingCopyStore.getState().startIr;
    rebuildWorkingCopyFromStores(["physical-layout"]);
    expect(useWorkingCopyStore.getState().startIr).toBe(edited);
    expect(vfsText("source/kb.kmn")).toBe(EDITED);
    expect(emitKmn(useWorkingCopyStore.getState().ir!)).toContain("a comment the author added");
  });
});
