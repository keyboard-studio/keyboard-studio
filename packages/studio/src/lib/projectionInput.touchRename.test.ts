// A touch-key rename's rule half must reach the download. The layout half is
// already spliced into the store's touchLayoutJson, so the output path used to
// pass no key-edit ops and the rules kept naming the old key.

import { describe, expect, it, vi } from "vitest";
import { createVirtualFS, touchKeyAddress } from "@keyboard-studio/contracts";
import { basicKbdus, irGroup, makeTestIR, vkeyRule } from "@keyboard-studio/contracts/fixtures";
import { emitKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { projectWorkingCopyForOutput } from "./serializeWorkingCopy.ts";
import { projectionInputFromState } from "./projectionInput.ts";

vi.mock("./services.ts", () => ({
  getToZip: vi.fn(async () => vi.fn(async () => new Uint8Array())),
  getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
}));

const KMN_PATH = `source/${basicKbdus.id}.kmn`;

function seedWithRename() {
  const ir = makeTestIR({
    groups: [irGroup({ nodeId: "group#main", rules: [vkeyRule({ nodeId: "rule#b", vkey: "K_B", output: "b" })] })],
  });
  const vfs = createVirtualFS([{ path: KMN_PATH, content: emitKmn(ir), isBinary: false }]);
  const wc = useWorkingCopyStore.getState();
  wc.instantiateFromStart(basicKbdus, { vfs, ir });
  wc.setAttribution({ authorName: "T", copyrightHolder: "T" });
  useWorkingCopyStore.setState({
    keyEditOverlay: {
      ops: [{ kind: "rename", seq: 1, address: touchKeyAddress("phone", "default", "K_B"), toId: "K_Z" }],
    },
  });
}

describe("touch-key rename reaches the download", () => {
  it("hands the committed ops to the rule half without replaying the layout half", () => {
    seedWithRename();
    const state = useWorkingCopyStore.getState();
    const input = projectionInputFromState(
      { ...state, startIr: state.startIr! },
      { vfs: createVirtualFS([]), keyboardId: basicKbdus.id, assignments: [], getPattern: () => undefined, identity: null },
    );
    expect(input.keyEditOps).toEqual([]);
    expect(input.keyEditRuleOps).toHaveLength(1);
  });

  it("rewrites the rule's key name in the downloaded keyboard", async () => {
    seedWithRename();
    const projected = await projectWorkingCopyForOutput();
    const kmn = [...projected!.vfs.entries()].find((e) => e.path.endsWith(".kmn"))!.content as string;
    expect(kmn).toContain("K_Z");
    expect(kmn).not.toContain("K_B");
  });
});
