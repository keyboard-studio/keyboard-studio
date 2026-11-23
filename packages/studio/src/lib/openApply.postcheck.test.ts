// The apply function does not trust the splice: a changed .kmn whose rule
// order is not the intended one is "cannot be placed precisely" (needs
// consent), and nothing is written.

import { describe, expect, it, vi } from "vitest";
import { createVirtualFS, type StartKeyboard } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";

vi.mock("./projectWorkingCopyVfs.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("./projectWorkingCopyVfs.ts")>();
  return {
    ...real,
    projectWorkingCopyVfs: (input: Parameters<typeof real.projectWorkingCopyVfs>[0]) => {
      const result = real.projectWorkingCopyVfs(input);
      // Report an intended order that differs from what the splice wrote.
      for (const ir of Object.values(result.intendedKmnIr ?? {})) {
        for (const g of ir.groups) g.rules.reverse();
      }
      return result;
    },
  };
});

const { useWorkingCopyStore } = await import("../stores/workingCopyStore.ts");
const { applyOpenChange } = await import("./openApply.ts");

const ID = "tiny";
const KMN =
  "store(&NAME) 'Tiny'\nbegin Unicode > use(main)\ngroup(main) using keys\n+ [K_A] > 'a'\n+ [K_B] > 'b'\n+ [K_C] > 'c'\n";

describe("applyOpenChange post-check", () => {
  it("treats a wrong rule order as needing consent and writes nothing", () => {
    const vfs = createVirtualFS([
      { path: `source/${ID}.kmn`, content: KMN, isBinary: false },
      { path: `source/${ID}.kps`, content: "<Package/>", isBinary: false },
    ]);
    const wc = useWorkingCopyStore.getState();
    wc.reset();
    wc.instantiateFromExisting(
      { id: ID, path: "release/t/tiny", script: "Latn", targets: ["desktop"], displayName: "Tiny", version: "1.0", languages: ["en"] } as StartKeyboard,
      { vfs, ir: parseKmn(KMN, ID).ir },
    );
    wc.setFallbackPolicy("pass-through");
    const before = useWorkingCopyStore.getState().startVfs;
    const ir = useWorkingCopyStore.getState().startIr!;
    const ruleB = ir.groups.flatMap((g) => g.rules).find((r) => r.context.some((c) => c.kind === "vkey" && c.name === "K_B"))!;
    const result = applyOpenChange({ kind: "remove", itemIds: [ruleB.nodeId], chars: ["b"] });
    expect(result).toEqual({ status: "needs-consent", files: [`source/${ID}.kmn`] });
    expect(useWorkingCopyStore.getState().startVfs).toBe(before);
  });
});
