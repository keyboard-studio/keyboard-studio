// Open mode keeps the author's text byte for byte through the caps-handling
// pass (step 2.8) and the id rename (step 4): a pass that changes nothing must
// not reformat the file, and a pass that changes a line must splice, not re-emit.

import { describe, expect, it } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { projectWorkingCopyVfs } from "./projectWorkingCopyVfs.ts";
import type { ProjectWorkingCopyVfsInput } from "./projectWorkingCopyVfs.ts";

const ID = "tiny";
const KMN = [
  "c a hand-written comment",
  "store(&NAME) 'Tiny'",
  "store(&VERSION) '10.0'",
  "begin Unicode > use(main)",
  "group(main) using keys",
  "+   [K_A]   >   'a'",
  "+ [K_B] > 'b'",
  "",
].join("\r\n");

function project(extra: Partial<ProjectWorkingCopyVfsInput>) {
  const vfs = createVirtualFS();
  vfs.set(`source/${ID}.kmn`, KMN, false);
  const startIr = parseKmn(KMN, ID).ir;
  const result = projectWorkingCopyVfs({
    vfs,
    keyboardId: ID,
    startIr,
    deletedNodeIds: new Set(),
    assignments: [],
    getPattern: () => undefined,
    identity: null,
    openMode: { kps: { nameEdited: false } },
    ...extra,
  });
  return { vfs, result };
}

describe("projectWorkingCopyVfs: Open mode byte identity", () => {
  it("leaves the text untouched when the caps pass changes nothing", () => {
    const { vfs } = project({ capsHandling: { mode: "none" } as ProjectWorkingCopyVfsInput["capsHandling"] });
    expect(vfs.get(`source/${ID}.kmn`)!.content).toBe(KMN);
  });

  it("splices the id rename into the author's text", () => {
    const { vfs } = project({ targetKeyboardId: "tiny2" });
    const text = vfs.get(`source/tiny2.kmn`)?.content as string | undefined;
    expect(text).toBeDefined();
    expect(text).toContain("+   [K_A]   >   'a'\r\n");
    expect(text).toContain("c a hand-written comment\r\n");
  });
});
