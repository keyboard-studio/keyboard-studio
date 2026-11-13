// openApply fix pass (spec 111 phase 15 slice S1): a throw is a failed apply, a
// restore is atomic and honest about other files, adjacent removed rules keep
// their order, the session lists reset, the generic "files" change and the
// undo record. Real engine; no mocks beyond forcing a store write to throw.

import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createVirtualFS, type StartKeyboard } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useOpenRemovalStore } from "../stores/openRemovalStore.ts";
import { useOpenUndoStore } from "../stores/openUndoStore.ts";
import { useGuardIntentStore } from "../stores/guardIntentStore.ts";
import { useOpenRemovals } from "../editors/carve/useRemovalActions.ts";
import { applyOpenChange, undoLastOpenApply } from "./openApply.ts";
import { readVfsText } from "./vfsText.ts";

const ID = "tiny";
const KMN_PATH = `source/${ID}.kmn`;
const KPS_PATH = `source/${ID}.kps`;
const KMN = [
  "store(&NAME) 'Tiny'",
  "begin Unicode > use(main)",
  "group(main) using keys",
  "+ [K_A] > 'a'",
  "+ [K_B] > 'b'",
  "+ [K_C] > 'c'",
  "+ [K_D] > 'd'",
  "",
].join("\r\n");
const KB = {
  id: ID, path: `release/t/${ID}`, script: "Latn", targets: ["desktop"],
  displayName: "Tiny", version: "1.0", languages: ["en"],
} as StartKeyboard;

function open(id = ID, text = KMN): void {
  const vfs = createVirtualFS([
    { path: `source/${id}.kmn`, content: text, isBinary: false },
    { path: `source/${id}.kps`, content: "<Package/>", isBinary: false },
  ]);
  const wc = useWorkingCopyStore.getState();
  wc.reset();
  wc.instantiateFromExisting({ ...KB, id, path: `release/t/${id}` }, { vfs, ir: parseKmn(text, id).ir });
  wc.setFallbackPolicy("pass-through");
}

const ruleId = (vkey: string): string =>
  useWorkingCopyStore.getState().startIr!.groups.flatMap((g) => g.rules)
    .find((r) => r.context.some((c) => c.kind === "vkey" && c.name === vkey))!.nodeId;
const file = (path: string): string | undefined =>
  readVfsText(useWorkingCopyStore.getState().startVfs!, path);
const remove = (vkeys: string[], chars: string[]) =>
  applyOpenChange({ kind: "remove", itemIds: vkeys.map(ruleId), chars });
const entries = () => [...useOpenRemovalStore.getState().entries];

const realReplace = useWorkingCopyStore.getState().replaceStartingPointFiles;
afterEach(() => useWorkingCopyStore.setState({ replaceStartingPointFiles: realReplace }));
beforeEach(() => open());

describe("a throw inside an apply is a failed result", () => {
  it("remove: a throwing store write returns failed with the reason, file unchanged", () => {
    useWorkingCopyStore.setState({
      replaceStartingPointFiles: () => {
        throw new Error("boom");
      },
    });
    const r = remove(["K_B"], ["b"]);
    expect(r).toEqual({ status: "failed", reason: "boom" });
    expect(file(KMN_PATH)).toBe(KMN);
    expect(entries()).toHaveLength(0);
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
  });

  it("restore: a throwing store write returns failed, never throws", () => {
    remove(["K_B"], ["b"]);
    const removed = file(KMN_PATH);
    useWorkingCopyStore.setState({
      replaceStartingPointFiles: () => {
        throw new Error("boom");
      },
    });
    expect(applyOpenChange({ kind: "reinsert", entries: entries() })).toEqual({
      status: "failed",
      reason: "boom",
    });
    expect(file(KMN_PATH)).toBe(removed);
  });
});

describe("restore is atomic and reports other files", () => {
  it("fails the whole restore, changing nothing, when one entry cannot be put back", () => {
    remove(["K_A"], ["a"]);
    remove(["K_C"], ["c"]);
    const [first, second] = entries();
    const afterBoth = file(KMN_PATH);
    // The first entry has no recorded rules and no whole-file record.
    const r = applyOpenChange({
      kind: "reinsert",
      entries: [{ ...first!, rules: [], files: {} }, second!],
    });
    expect(r.status).toBe("failed");
    expect(file(KMN_PATH)).toBe(afterBoth);
    expect(entries()).toHaveLength(2);
  });

  it("puts back a non-.kmn file the removal touched while it still holds the removal's text", () => {
    remove(["K_B"], ["b"]);
    const [e] = entries();
    // Pretend the removal also rewrote the package file.
    const patched = {
      ...e!,
      files: { ...e!.files, [KPS_PATH]: { before: "<Package/>", after: "<Package v2/>" } },
    };
    expect(applyOpenChange({ kind: "files", files: { [KPS_PATH]: "<Package v2/>" }, label: "x" }).status).toBe("applied");
    remove(["K_D"], ["d"]); // the files moved on: rules-only path for the first
    const r = applyOpenChange({ kind: "reinsert", entries: [patched] });
    expect(r.status).toBe("applied");
    expect(file(KPS_PATH)).toBe("<Package/>");
    expect(file(KMN_PATH)).toContain("[K_B]");
    expect(r.status === "applied" && r.notRestored).toBeFalsy();
  });

  it("reports a non-.kmn file that changed since and leaves it alone", () => {
    remove(["K_B"], ["b"]);
    const [e] = entries();
    const patched = {
      ...e!,
      files: { ...e!.files, [KPS_PATH]: { before: "<Package/>", after: "<Package v2/>" } },
    };
    applyOpenChange({ kind: "files", files: { [KPS_PATH]: "<Edited/>" }, label: "x" });
    remove(["K_D"], ["d"]);
    const r = applyOpenChange({ kind: "reinsert", entries: [patched] });
    expect(r).toMatchObject({ status: "applied", notRestored: [KPS_PATH] });
    expect(file(KPS_PATH)).toBe("<Edited/>");
    expect(file(KMN_PATH)).toContain("[K_B]");
  });
});

describe("adjacent removed rules", () => {
  it("two adjacent rules sharing one neighbour come back in their original order", () => {
    remove(["K_B", "K_C"], ["b", "c"]);
    remove(["K_D"], ["d"]); // forces the rules-only path for the first entry
    const [first] = entries();
    expect(applyOpenChange({ kind: "reinsert", entries: [first!] }).status).toBe("applied");
    expect(file(KMN_PATH)).toBe(KMN.replace("+ [K_D] > 'd'\r\n", ""));
  });

  it("two adjacent rules at the group start keep their order too", () => {
    remove(["K_A", "K_B"], ["a", "b"]);
    remove(["K_D"], ["d"]);
    const [first] = entries();
    expect(applyOpenChange({ kind: "reinsert", entries: [first!] }).status).toBe("applied");
    expect(file(KMN_PATH)).toBe(KMN.replace("+ [K_D] > 'd'\r\n", ""));
  });
});

describe("the session lists reset", () => {
  it("reset, a new instantiation and a project restore empty them", () => {
    const fill = () => {
      remove(["K_B"], ["b"]);
      expect(entries()).toHaveLength(1);
      expect(useOpenUndoStore.getState().records).toHaveLength(1);
    };
    fill();
    useWorkingCopyStore.getState().reset();
    expect(entries()).toHaveLength(0);
    expect(useOpenUndoStore.getState().records).toHaveLength(0);

    open();
    fill();
    open("other"); // a different keyboard: a genuine new instantiation
    expect(entries()).toHaveLength(0);
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
  });

  it("readers ignore entries recorded for another keyboard", () => {
    remove(["K_B"], ["b"]);
    const [e] = entries();
    useOpenRemovalStore.getState().push({ ...e!, id: "foreign", keyboardId: "other" });
    const { result } = renderHook(() => useOpenRemovals());
    expect(result.current.map((x) => x.id)).toEqual([e!.id]);
  });
});

describe("the generic files change", () => {
  it("writes several files in one update, records one undo step, and skips unchanged ones", () => {
    const r = applyOpenChange({
      kind: "files",
      files: { [KPS_PATH]: "<Package v2/>", "source/new.txt": "hi", [KMN_PATH]: KMN },
      label: "Edit package",
    });
    expect(r).toMatchObject({ status: "applied" });
    expect(r.status === "applied" && r.changedPaths.sort()).toEqual(["source/new.txt", KPS_PATH].sort());
    expect(file(KPS_PATH)).toBe("<Package v2/>");
    expect(file("source/new.txt")).toBe("hi");
    expect(useOpenUndoStore.getState().records).toHaveLength(1);
    expect(applyOpenChange({ kind: "files", files: { [KPS_PATH]: "<Package v2/>" }, label: "x" })).toEqual({
      status: "unchanged",
    });
  });

  it("deletes a file with null", () => {
    expect(applyOpenChange({ kind: "files", files: { [KPS_PATH]: null }, label: "x" }).status).toBe("applied");
    expect(file(KPS_PATH)).toBeUndefined();
  });

  it("a .kmn included is re-parsed into startIr; one that is not a keyboard writes nothing", () => {
    const next = KMN.replace("+ [K_D] > 'd'\r\n", "");
    expect(applyOpenChange({ kind: "files", files: { [KMN_PATH]: next }, label: "x" }).status).toBe("applied");
    expect(useWorkingCopyStore.getState().startIr!.groups.flatMap((g) => g.rules)).toHaveLength(3);
    const r = applyOpenChange({
      kind: "files",
      files: { [KPS_PATH]: "<Changed/>", [KMN_PATH]: "this is not a keyboard" },
      label: "x",
    });
    expect(r.status).toBe("failed");
    expect(file(KMN_PATH)).toBe(next);
    expect(file(KPS_PATH)).toBe("<Package/>");
  });

  it("without a .kmn it does not parse anything and leaves startIr alone", () => {
    const ir = useWorkingCopyStore.getState().startIr;
    applyOpenChange({ kind: "files", files: { [KPS_PATH]: "<X/>" }, label: "x" });
    expect(useWorkingCopyStore.getState().startIr).toBe(ir);
  });
});

describe("undoLastOpenApply", () => {
  it("restores the files before the last change and drops its removal entry", () => {
    remove(["K_B"], ["b"]);
    expect(undoLastOpenApply().ok).toBe(true);
    expect(file(KMN_PATH)).toBe(KMN);
    expect(entries()).toHaveLength(0);
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
  });

  it("undoes a files change, newest first, one step each", () => {
    applyOpenChange({ kind: "files", files: { [KPS_PATH]: "<1/>" }, label: "one" });
    applyOpenChange({ kind: "files", files: { [KPS_PATH]: "<2/>" }, label: "two" });
    expect(undoLastOpenApply().ok).toBe(true);
    expect(file(KPS_PATH)).toBe("<1/>");
    expect(undoLastOpenApply().ok).toBe(true);
    expect(file(KPS_PATH)).toBe("<Package/>");
    expect(undoLastOpenApply()).toMatchObject({ ok: false });
  });

  it("undoing a restore puts the removal back on the Removed list", () => {
    remove(["K_B"], ["b"]);
    const before = entries();
    expect(applyOpenChange({ kind: "reinsert", entries: before }).status).toBe("applied");
    expect(entries()).toHaveLength(0);
    expect(undoLastOpenApply().ok).toBe(true);
    expect(entries().map((e) => e.id)).toEqual(before.map((e) => e.id));
    expect(file(KMN_PATH)).not.toContain("[K_B]");
  });

  it("refuses with a reason when a file no longer equals what the change wrote", () => {
    applyOpenChange({ kind: "files", files: { [KPS_PATH]: "<1/>" }, label: "one" });
    // Another writer changes the file behind the undo record.
    useWorkingCopyStore.getState().replaceStartingPointFiles({ [KPS_PATH]: "<other/>" });
    const r = undoLastOpenApply();
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain(KPS_PATH);
    expect(file(KPS_PATH)).toBe("<other/>");
  });
});

describe("startIr and the guard ids update in a safe order", () => {
  it("no subscriber sees the new startIr while old guard ids are still set", () => {
    useGuardIntentStore.setState({ keptGuardRuleIds: new Set(["stale-id"]) });
    const seen: number[] = [];
    const unsub = useWorkingCopyStore.subscribe((s, prev) => {
      if (s.startIr !== prev.startIr) seen.push(useGuardIntentStore.getState().keptGuardRuleIds.size);
    });
    remove(["K_B"], ["b"]);
    unsub();
    expect(seen).toEqual([0]);
  });
});
