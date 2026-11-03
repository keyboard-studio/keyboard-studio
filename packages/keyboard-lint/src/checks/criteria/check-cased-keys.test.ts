import { describe, it, expect } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { IRStore, KeyboardIR } from "@keyboard-studio/contracts";
import { checkCasedKeysDeclared } from "./check-cased-keys.js";

function ir(outputs: string[], systemStores: Record<string, string> = {}): KeyboardIR {
  const stores: IRStore[] = Object.entries(systemStores).map(([name, text]) => ({
    nodeId: `store:${name}`,
    name,
    isSystem: true,
    items: [{ kind: "raw", text }],
  }));
  return makeTestIR({
    header: { keyboardId: "demo" },
    stores,
    groups: [
      {
        nodeId: "g1",
        name: "main",
        usingKeys: true,
        readonly: false,
        rules: outputs.map((value, i) => ({
          nodeId: `r${i}`,
          context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
          output: [{ kind: "char", value }],
        })),
      },
    ],
  });
}

describe("checkCasedKeysDeclared (7.28)", () => {
  it("flags a cased-script keyboard without &CasedKeys", () => {
    const { findings } = checkCasedKeysDeclared(ir(["a", "1"]), "demo");
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_CASEDKEYS_MISSING");
    expect(findings[0]!.location.file).toBe("source/demo.kmn");
  });

  it("passes when &CasedKeys is declared", () => {
    const k = ir(["a"], { CasedKeys: "[K_A] .. [K_Z]" });
    expect(checkCasedKeysDeclared(k, "demo").findings).toEqual([]);
  });

  it("passes an uncased script", () => {
    expect(checkCasedKeysDeclared(ir(["क", "अ"]), "demo").findings).toEqual([]);
  });

  it("exempts mnemonic layouts", () => {
    const k = ir(["a"], { MNEMONICLAYOUT: "'1'" });
    expect(checkCasedKeysDeclared(k, "demo").findings).toEqual([]);
  });
});
