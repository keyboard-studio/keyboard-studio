// The one undo log (spec 111 FR-045): the Removed list is derived from it, and
// undoing a step of any kind is a pop with nothing patched back by hand.

import { beforeEach, describe, expect, it } from "vitest";
import { createVirtualFS, type StartKeyboard } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { clearOpenSession, useOpenUndoStore } from "../stores/openUndoStore.ts";
import { useOpenRemovalStore } from "../stores/openRemovalStore.ts";
import { applyOpenChange, undoLastOpenApply } from "./openApply.ts";
import { readVfsText } from "./vfsText.ts";

const ID = "tiny";
const KMN_PATH = `source/${ID}.kmn`;
const KMN = ["store(&NAME) 'Tiny'", "begin Unicode > use(main)", "group(main) using keys", "+ [K_A] > 'a'", "+ [K_B] > 'b'", ""].join("\n");
const text = () => readVfsText(useWorkingCopyStore.getState().startVfs!, KMN_PATH)!;
const ruleId = (v: string) =>
  useWorkingCopyStore.getState().startIr!.groups.flatMap((g) => g.rules).find((r) => JSON.stringify(r.context).includes(v))!.nodeId;

beforeEach(() => {
  clearOpenSession();
  const vfs = createVirtualFS([
    { path: KMN_PATH, content: KMN, isBinary: false },
    { path: `source/${ID}.kps`, content: "<Package/>", isBinary: false },
  ]);
  const wc = useWorkingCopyStore.getState();
  wc.reset();
  wc.instantiateFromExisting(
    { id: ID, path: "release/t/tiny", script: "Latn", targets: ["desktop"], displayName: "Tiny", version: "1.0", languages: ["en"] } as StartKeyboard,
    { vfs, ir: parseKmn(KMN, ID).ir },
  );
  wc.setAttribution({ authorName: "T", copyrightHolder: "T" });
  wc.setFallbackPolicy("pass-through");
});

describe("the undo log", () => {
  it("a removal is on the Removed list, and undoing it takes it off and puts the rule back", () => {
    expect(applyOpenChange({ kind: "remove", itemIds: [ruleId("K_B")], chars: ["b"] }).status).toBe("applied");
    expect(useOpenRemovalStore.getState().entries).toHaveLength(1);
    expect(useOpenUndoStore.getState().records.map((r) => r.view.kind)).toEqual(["removal"]);
    expect(undoLastOpenApply().ok).toBe(true);
    expect(useOpenRemovalStore.getState().entries).toHaveLength(0);
    expect(text()).toBe(KMN);
  });

  it("a restore takes the removal off the list, and undoing the restore puts it back on", () => {
    applyOpenChange({ kind: "remove", itemIds: [ruleId("K_B")], chars: ["b"] });
    const entries = [...useOpenRemovalStore.getState().entries];
    expect(applyOpenChange({ kind: "reinsert", entries }).status).toBe("applied");
    expect(useOpenRemovalStore.getState().entries).toHaveLength(0);
    expect(useOpenUndoStore.getState().records.map((r) => r.view.kind)).toEqual(["removal", "restore"]);
    expect(undoLastOpenApply().ok).toBe(true);
    expect(useOpenRemovalStore.getState().entries).toHaveLength(1);
    expect(text()).not.toContain("K_B");
  });

  it("a generic files step undoes to the text before it", () => {
    const edited = KMN.replace("'b'", "'bb'");
    expect(applyOpenChange({ kind: "files", files: { [KMN_PATH]: edited }, label: "edit" }).status).toBe("applied");
    expect(useOpenUndoStore.getState().records[0]!.view.kind).toBe("files");
    expect(undoLastOpenApply().ok).toBe(true);
    expect(text()).toBe(KMN);
  });

  it("clearing the session empties the log and both caches", () => {
    applyOpenChange({ kind: "remove", itemIds: [ruleId("K_B")], chars: ["b"] });
    clearOpenSession();
    expect(useOpenUndoStore.getState().records).toEqual([]);
    expect(useOpenRemovalStore.getState().entries).toEqual([]);
  });
});
