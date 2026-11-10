// Defect (f): accepting a doc regeneration replaces the file through the replay wrapper.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createVirtualFS, makeStartKeyboard } from "@keyboard-studio/contracts";
import { applyDocRegeneration } from "./docRegenerationFix.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";

// Regression: the editor must replace the file through the replay wrapper.
const replaySpy = vi.hoisted(() => vi.fn());
vi.mock("./replaceStartingPoint.ts", async (importActual) => {
  const actual = await importActual<typeof import("./replaceStartingPoint.ts")>();
  return {
    ...actual,
    replaceStartingPointAndReplay: (...args: Parameters<typeof actual.replaceStartingPointAndReplay>) => {
      replaySpy(...args);
      return actual.replaceStartingPointAndReplay(...args);
    },
  };
});

const KB = makeStartKeyboard({
  id: "kb_x",
  path: "release/x/kb_x",
  script: "Latn",
  targets: ["windows"],
  displayName: "X",
  version: "1.0",
});

beforeEach(() => {
  replaySpy.mockClear();
  const vfs = createVirtualFS();
  vfs.set("source/help/kb_x.php", "<body>old</body>", false);
  useWorkingCopyStore.setState({ startVfs: vfs, startKeyboard: KB, instantiationMode: "adapt-existing" });
});

describe("applyDocRegeneration replay wrapper", () => {
  it("replaces the file through replaceStartingPointAndReplay", () => {
    const fix = {
      kind: "docs",
      preview: [{ file: "source/help/kb_x.php", before: "", after: "<body>new</body>" }],
    } as never;
    applyDocRegeneration(fix);
    expect(replaySpy).toHaveBeenCalledWith("source/help/kb_x.php", "<body>new</body>");
  });
});
