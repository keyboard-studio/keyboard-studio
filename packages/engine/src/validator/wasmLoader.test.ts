import { describe, it, expect } from "vitest";
import { loadWasmOracle } from "./wasmLoader.js";

// Regression: kmc-kmn reports a message's line as `line` (CompilerEvent),
// not `lineNumber`. The oracle handle used to read `lineNumber`, so every raw
// finding came back with line 0. Runs against the real kmc-kmn WASM.
describe("loadWasmOracle — raw finding line numbers", () => {
  it("carries kmcmplib's 1-based source line on each raw finding", async () => {
    const source = [
      "store(&NAME) 'Line Probe'",
      "store(&VERSION) '10.0'",
      "store(&TARGETS) 'any'",
      "begin Unicode > use(main)",
      "",
      "group(main) using keys",
      "+ [K_A] > index(nosuch, 1)",
      "",
    ].join("\n");
    const handle = await loadWasmOracle();
    try {
      const raws = await handle.lintWasmGroups(source, ["reference"]);
      // ERROR_StoreDoesNotExist = SevError | KmnCompiler | 0x01D.
      const storeMissing = raws.find((r) => Number(r.kmcmpCode) === 0x50201d);
      expect(storeMissing).toBeDefined();
      expect(storeMissing?.line).toBe(7);
    } finally {
      handle.dispose();
    }
  }, 30_000);
});
