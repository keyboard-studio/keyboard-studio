// spec 106 FR-005 (T006): the OSK preview and the download project the same
// working copy to the same keyboard. Before projectionInputFromState, the
// download dropped the fallback policy and the disabled rule families, so a
// carved key or a disabled family behaved differently in the zip than in the
// preview. Real projection on both routes, no engine mocks.
//
// Key edits are deliberately not seeded in the store's overlay: committed
// edits are already spliced into the store's touchLayoutJson, and neither
// route replays the overlay (see projectionInput.ts).

import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { createVirtualFS, type FallbackPolicy, type VirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus, charRule, irGroup, makeTestIR, vkeyRule } from "@keyboard-studio/contracts/fixtures";
import { emitKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useWorkingCopyTransform } from "../hooks/useWorkingCopyTransform.ts";
import { groupRules } from "../components/rules/ruleFamilies.ts";
import { projectWorkingCopyForOutput } from "./serializeWorkingCopy.ts";
import { projectionInputFromState } from "./projectionInput.ts";

vi.mock("./services.ts", () => ({
  getToZip: vi.fn(async () => vi.fn(async () => new Uint8Array())),
  getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
}));

const KMN_PATH = `source/${basicKbdus.id}.kmn`;

function startIr() {
  return makeTestIR({
    groups: [
      irGroup({
        nodeId: "group#main",
        rules: [
          vkeyRule({ nodeId: "rule#carved", vkey: "K_A", output: "a" }),
          vkeyRule({ nodeId: "rule#kept", vkey: "K_B", output: "b" }),
          charRule({ nodeId: "rule#ctx1", context: "q", output: "Q" }),
          charRule({ nodeId: "rule#ctx2", context: "w", output: "W" }),
        ],
      }),
    ],
  });
}

function seed(fallbackPolicy: FallbackPolicy): VirtualFS {
  const ir = startIr();
  const vfs = createVirtualFS([{ path: KMN_PATH, content: emitKmn(ir), isBinary: false }]);
  const wc = useWorkingCopyStore.getState();
  wc.instantiateFromStart(basicKbdus, { vfs, ir });
  wc.setAttribution({ authorName: "Parity", copyrightHolder: "Parity" });
  wc.setFallbackPolicy(fallbackPolicy);
  wc.deleteNode("rule#carved");
  const families = groupRules(ir.groups.flatMap((g) => g.rules));
  const family = families.find((f) => !f.memberIds.includes("rule#carved"));
  expect(family, "fixture needs a family to disable").toBeDefined();
  wc.toggleFamilyDisabled(family!.id);
  return vfs;
}

async function previewKmn(startVfs: VirtualFS): Promise<string> {
  const { result } = renderHook(() => useWorkingCopyTransform({ previewedStartId: basicKbdus.id }));
  const vfs = createVirtualFS(startVfs.entries());
  result.current!(vfs, basicKbdus.id);
  return vfs.get(KMN_PATH)!.content as string;
}

async function downloadKmn(): Promise<string> {
  const projected = await projectWorkingCopyForOutput();
  expect(projected).not.toBeNull();
  const kmn = [...projected!.vfs.entries()].find((e) => e.path.startsWith("source/") && e.path.endsWith(".kmn"));
  return kmn!.content as string;
}

describe("projectionInputFromState — preview/download parity", () => {
  it.each<FallbackPolicy>(["swallow", "pass-through"])(
    "a carved rule under %s and a disabled family project identically",
    async (policy) => {
      const startVfs = seed(policy);
      const preview = await previewKmn(startVfs);
      expect(await downloadKmn()).toBe(preview);
    },
  );

  it.each(["observing", "throwing"] as const)(
    "supplying a kmnStageTap (%s) does not change the preview, and the preview still equals the download",
    async (kind) => {
      const startVfs = seed("swallow");
      const plain = await previewKmn(startVfs);
      const seen: string[] = [];
      const tap = (stage: string): void => {
        seen.push(stage);
        if (kind === "throwing") throw new Error("tap failed");
      };
      const { result } = renderHook(() =>
        useWorkingCopyTransform({ previewedStartId: basicKbdus.id, kmnStageTap: tap }),
      );
      const vfs = createVirtualFS(startVfs.entries());
      result.current!(vfs, basicKbdus.id);
      expect(seen.length).toBeGreaterThan(0);
      expect(vfs.get(KMN_PATH)!.content).toBe(plain);
      expect(await downloadKmn()).toBe(plain);
    },
  );

  it("passes no key-edit ops unless a live layout override supplies them", () => {
    seed("swallow");
    const state = useWorkingCopyStore.getState();
    const input = projectionInputFromState(
      { ...state, startIr: state.startIr! },
      { vfs: createVirtualFS([]), keyboardId: basicKbdus.id, assignments: [], getPattern: () => undefined, identity: null },
    );
    expect(input.keyEditOps).toEqual([]);
    expect(input.fallbackPolicy).toBe("swallow");
    expect(input.suppressionExemptIds?.size).toBeGreaterThan(0);
  });
});

describe("projectionInputFromState — authored welcome path on a flat-convention base", () => {
  const AUTHORED = "<html><body><p>AUTHORED-WELCOME</p></body></html>";
  const KPS_PATH = `source/${basicKbdus.id}.kps`;

  function seedFlat(track: "copy" | "open"): VirtualFS {
    const ir = startIr();
    const vfs = createVirtualFS([
      { path: KMN_PATH, content: emitKmn(ir), isBinary: false },
      { path: "source/welcome.htm", content: "<p>carried</p>", isBinary: false },
      ...(track === "open" ? [{ path: KPS_PATH, content: "<Package></Package>\n", isBinary: false }] : []),
    ]);
    const wc = useWorkingCopyStore.getState();
    if (track === "copy") wc.instantiateFromStart(basicKbdus, { vfs, ir });
    else wc.instantiateFromExisting(basicKbdus, { vfs, ir });
    useWorkingCopyStore.setState({ startWelcomeConvention: "flat", authoredWelcomeHtm: AUTHORED });
    return vfs;
  }

  it.each([
    ["open", "source/welcome.htm"],
    ["copy", "source/welcome/welcome.htm"],
  ] as const)("%s: the preview and the download input name the same welcome path", (track, path) => {
    seedFlat(track);
    const state = useWorkingCopyStore.getState();
    const input = projectionInputFromState(
      { ...state, startIr: state.startIr! },
      { vfs: createVirtualFS([]), keyboardId: basicKbdus.id, assignments: [], getPattern: () => undefined, identity: null, marksTreatment: undefined, capsHandling: undefined },
    );
    expect(input.welcomePath).toBe(path);
  });

  it("open: the OSK preview writes the edit over the carried flat page and adds no folder page", () => {
    const startVfs = seedFlat("open");
    const { result } = renderHook(() => useWorkingCopyTransform({ previewedStartId: basicKbdus.id }));
    const vfs = createVirtualFS(startVfs.entries());
    result.current!(vfs, basicKbdus.id);
    expect(vfs.get("source/welcome.htm")?.content).toBe(AUTHORED);
    expect(vfs.get("source/welcome/welcome.htm")).toBeUndefined();
  });
});
