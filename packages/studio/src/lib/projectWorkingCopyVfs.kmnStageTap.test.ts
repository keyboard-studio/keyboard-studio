// The kmnStageTap observer (spec 117, research R15): it reports the `.kmn` after steps 2.2, 2.6,
// 2.7, 2.8, 2.9 (Code-tab edits), 3 and 3.1 in build order, and supplying it changes nothing the projection writes.

import { describe, expect, it } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { projectWorkingCopyVfs, type KmnStage } from "./projectWorkingCopyVfs.ts";

const KMN = "store(&NAME) 'k'\nbegin Unicode > use(main)\n\ngroup(main) using keys\n+ [K_A] > 'a'\n+ [K_B] > 'b'\n";

function project(tap?: (stage: KmnStage, text: string) => void, capsMode?: "cased-keys") {
  const vfs = createVirtualFS();
  vfs.set("source/k.kmn", KMN, false);
  const startIr = parseKmn(KMN, "k").ir;
  projectWorkingCopyVfs({
    vfs,
    keyboardId: "k",
    startIr,
    deletedNodeIds: new Set(),
    assignments: [],
    getPattern: () => undefined,
    identity: null,
    ...(capsMode !== undefined ? { capsHandling: { mode: capsMode } } : {}),
    ...(tap !== undefined ? { kmnStageTap: tap } : {}),
  });
  return vfs.get("source/k.kmn")?.content;
}

describe("projectWorkingCopyVfs kmnStageTap", () => {
  it("reports the stages in build order, and the caps stage holds what the caps step wrote", () => {
    const seen: Array<[KmnStage, string]> = [];
    project((stage, text) => seen.push([stage, text]), "cased-keys");
    expect(seen.map(([s]) => s)).toEqual([
      "kmn-edits",
      "mark-guards",
      "context-tolerance",
      "caps",
      "code-edits",
      "identity",
      "targets",
    ]);
    expect(seen[0]![1]).not.toContain("&CasedKeys");
    expect(seen[3]![1]).toContain("&CasedKeys");
  });

  it("the targets stage holds the &TARGETS the targets step forced", () => {
    const seen = new Map<KmnStage, string>();
    project((stage, text) => seen.set(stage, text));
    expect(seen.get("identity")).not.toMatch(/&TARGETS/i);
    expect(seen.get("targets")).toMatch(/&TARGETS/i);
  });

  it("does not change the projected text", () => {
    expect(project(() => undefined, "cased-keys")).toBe(project(undefined, "cased-keys"));
    expect(project(() => undefined)).toBe(project());
  });

  it("does not change the projected text when the tap throws", () => {
    const throwing = (): void => {
      throw new Error("tap failed");
    };
    expect(project(throwing, "cased-keys")).toBe(project(undefined, "cased-keys"));
    expect(project(throwing)).toBe(project());
  });
});
