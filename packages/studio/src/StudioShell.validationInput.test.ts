import { describe, it, expect } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { parseKmn, emitKmn } from "@keyboard-studio/engine";
import { selectValidationSource } from "./lib/validationSource.ts";

const START_KMN = "store(&NAME) 'Start'\nbegin Unicode > use(main)\ngroup(main) using keys\n+ 'a' > 'a'\n";
const EDITED_KMN = "store(&NAME) 'Start'\nbegin Unicode > use(main)\ngroup(main) using keys\n+ 'a' > 'b'\n";

function startVfs() {
  const vfs = createVirtualFS();
  vfs.set("source/k.kmn", START_KMN);
  return vfs;
}

describe("D3 validation input", () => {
  it("validates the replayed keyboard's emitted text, not the unedited startVfs", () => {
    const projection = {
      ir: parseKmn(EDITED_KMN).ir,
      touchLayoutText: null,
      kvksText: null,
      keyboardId: "k",
    };
    const source = selectValidationSource(projection, startVfs());
    expect(source).toBe(emitKmn(projection.ir));
    expect(source).not.toBe(START_KMN);
  });

  it("falls back to the starting point's text before any projection exists", () => {
    expect(selectValidationSource(null, startVfs())).toBe(START_KMN);
  });

  it("is null with neither", () => {
    expect(selectValidationSource(null, null)).toBeNull();
  });
});
