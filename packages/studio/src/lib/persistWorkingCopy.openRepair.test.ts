// Spec 111: an Adapt draft saved before Open carried the .kps gets the
// descriptor back, with build entries rewritten and the language list seeded.

import { beforeEach, describe, expect, it } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { StartKeyboard } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { repairOpenDraftDescriptor } from "./persistWorkingCopy.ts";

const KMN = "store(&NAME) 'Kb'\nbegin Unicode > use(main)\ngroup(main) using keys\n+ [K_A] > 'a'\n";
const KPS =
  '<Package><Files><File><Name>..\\build\\other.kmx</Name></File></Files><Keyboards><Keyboard><Languages><Language ID="bas">Basaa</Language></Languages></Keyboard></Keyboards></Package>';
const KB: StartKeyboard = { id: "kb", path: "release/k/kb", script: "Latn", targets: ["windows"], displayName: "Kb", version: "1.0", languages: ["bas"] };

function openDraftWithoutKps(): void {
  const vfs = createVirtualFS();
  vfs.set("source/kb.kmn", KMN, false);
  useWorkingCopyStore.getState().instantiateFromExisting(KB, { vfs, ir: parseKmn(KMN, "kb").ir });
}

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
});

describe("repairOpenDraftDescriptor", () => {
  it("adds the descriptor, rewrites build entries and seeds the language list", async () => {
    openDraftWithoutKps();
    useWorkingCopyStore.setState({ startReadmeMdText: "# Kb" });
    const urls: string[] = [];
    const report = await repairOpenDraftDescriptor({
      proxyBase: "http://p",
      fetchImpl: async (url) => {
        urls.push(url);
        return { ok: true, text: async () => KPS };
      },
    });
    expect(urls).toEqual(["http://p/release/k/kb/source/kb.kps"]);
    expect(report).toEqual({ restored: true, carriedFiles: ["README.md"] });
    const state = useWorkingCopyStore.getState();
    expect(state.startVfs!.get("source/kb.kps")!.content as string).toContain("..\\build\\kb.kmx");
    expect(state.identity?.languages).toEqual([{ tag: "bas", name: "Basaa" }]);
  });

  it("leaves the draft alone and says why when the descriptor cannot be fetched", async () => {
    openDraftWithoutKps();
    const report = await repairOpenDraftDescriptor({ fetchImpl: async () => ({ ok: false, text: async () => "" }) });
    expect(report.restored).toBe(false);
    expect(report.reason).toBeDefined();
    expect(useWorkingCopyStore.getState().startVfs!.get("source/kb.kps")).toBeUndefined();
  });

  it("does nothing for a Copy working copy", async () => {
    const vfs = createVirtualFS();
    vfs.set("source/kb.kmn", KMN, false);
    useWorkingCopyStore.getState().instantiateFromStart(KB, { vfs, ir: parseKmn(KMN, "kb").ir });
    let called = false;
    const report = await repairOpenDraftDescriptor({ fetchImpl: async () => { called = true; return { ok: true, text: async () => KPS }; } });
    expect(called).toBe(false);
    expect(report.restored).toBe(false);
  });
});
