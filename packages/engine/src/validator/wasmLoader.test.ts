import { describe, it, expect } from "vitest";
import { loadWasmOracle } from "./wasmLoader.js";
import { validateWithOracle } from "./oracle.js";

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
      const storeMissing = raws.find((r) => r.kmcmpCode === "ERROR_StoreDoesNotExist");
      expect(storeMissing).toBeDefined();
      expect(storeMissing?.line).toBe(7);
    } finally {
      handle.dispose();
    }
  }, 30_000);
});

// Regression: kmc-kmn reports NUMERIC codes (severity | namespace | base), but
// codeMap.ts keys CODE_MAP and the passthrough severity on SYMBOLIC names
// (`HINT_UnreachableRule`, `ERROR_…`). Without resolving the number to its
// upstream name, no curated entry ever matched and every passthrough finding
// fell to severity "hint". Runs the full oracle against the real kmc-kmn WASM.
describe("validateWithOracle — numeric kmc-kmn codes resolve to curated / symbolic findings", () => {
  const source = [
    "store(&NAME) 'Code Probe'",
    "store(&VERSION) '10.0'",
    "store(&TARGETS) 'any'",
    "begin Unicode > use(main)",
    "",
    "group(main) using keys",
    "+ 'a' > 'b'",
    "+ 'a' > 'c'",
    "+ [K_B] > index(nosuch, 1)",
    "",
  ].join("\n");

  it("maps HINT_UnreachableRule to its curated CODE_MAP entry", async () => {
    // Without the store error (kmcmplib stops before the reachability pass).
    const clean = source.replace("+ [K_B] > index(nosuch, 1)\n", "");
    const findings = await validateWithOracle(clean, { groups: ["behavior"] });
    expect(findings).toContainEqual(
      expect.objectContaining({
        code: "KM_HINT_UNREACHABLE_RULE",
        severity: "hint",
        layer: "A",
        location: expect.objectContaining({ line: 8 }),
      }),
    );
  }, 30_000);

  it("gives an uncurated error its upstream name and error severity", async () => {
    const findings = await validateWithOracle(source, { groups: ["passthrough"] });
    expect(findings).toContainEqual(
      expect.objectContaining({
        code: "KM_ERROR_KMCMP_STOREDOESNOTEXIST",
        severity: "error",
        location: expect.objectContaining({ line: 9 }),
      }),
    );
    expect(findings.some((f) => /^KM_[A-Z]+_KMCMP_\d+$/.test(f.code))).toBe(false);
  }, 30_000);
});
