// Open mode (spec 111): the language list is seeded from the keyboard's own
// package descriptor, in source order, instead of a single-tag seed.

import { beforeEach, describe, expect, it } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { StartKeyboard } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "./workingCopyStore.ts";

const KMN = "store(&NAME) 'Kb'\nbegin Unicode > use(main)\ngroup(main) using keys\n+ [K_A] > 'a'\n";
const KPS =
  '<Package><Keyboards><Keyboard><Languages>\n<Language ID="bas">Basaa</Language>\n<Language ID="bkm">Kom</Language>\n</Languages></Keyboard></Keyboards></Package>';
const KB: StartKeyboard = { id: "kb", path: "release/k/kb", script: "Latn", targets: ["windows"], displayName: "Kb", version: "1.0", languages: ["bas", "bkm"] };

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
});

describe("instantiateFromExisting: language list", () => {
  it("seeds identity.languages from the .kps in source order", () => {
    const vfs = createVirtualFS();
    vfs.set("source/kb.kmn", KMN, false);
    vfs.set("source/kb.kps", KPS, false);
    useWorkingCopyStore.getState().instantiateFromExisting(KB, { vfs, ir: parseKmn(KMN, "kb").ir });
    expect(useWorkingCopyStore.getState().identity?.languages).toEqual([
      { tag: "bas", name: "Basaa" },
      { tag: "bkm", name: "Kom" },
    ]);
  });

  it("leaves it unset when there is no descriptor", () => {
    const vfs = createVirtualFS();
    vfs.set("source/kb.kmn", KMN, false);
    useWorkingCopyStore.getState().instantiateFromExisting(KB, { vfs, ir: parseKmn(KMN, "kb").ir });
    expect(useWorkingCopyStore.getState().identity?.languages).toBeUndefined();
  });
});
