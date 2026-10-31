import { describe, it, expect } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { checkCapsNcapsConsistent } from "./check-caps-ncaps.js";

function irWithKeys(
  keys: Array<{ name: string; modifiers: string[] }>,
): KeyboardIR {
  return makeTestIR({
    header: { keyboardId: "demo" },
    groups: [
      {
        nodeId: "g1",
        name: "main",
        usingKeys: true,
        readonly: false,
        rules: keys.map((k, i) => ({
          nodeId: `r${i}`,
          context: [{ kind: "vkey", name: k.name, modifiers: k.modifiers }],
          output: [{ kind: "char", value: "x" }],
        })),
      },
    ],
  });
}

describe("checkCapsNcapsConsistent (7.26)", () => {
  it("passes when no key uses CAPS/NCAPS", () => {
    const ir = irWithKeys([
      { name: "K_A", modifiers: [] },
      { name: "K_B", modifiers: ["SHIFT"] },
    ]);
    const { findings } = checkCapsNcapsConsistent(ir, "demo");
    expect(findings).toEqual([]);
  });

  it("passes when CAPS/NCAPS use is consistent per key", () => {
    const ir = irWithKeys([
      { name: "K_A", modifiers: ["NCAPS"] },
      { name: "K_A", modifiers: ["CAPS"] },
    ]);
    const { findings } = checkCapsNcapsConsistent(ir, "demo");
    expect(findings).toEqual([]);
  });

  it("flags a key with mixed CAPS/NCAPS handling", () => {
    const ir = irWithKeys([
      { name: "K_A", modifiers: [] },
      { name: "K_A", modifiers: ["CAPS"] },
      { name: "K_B", modifiers: [] },
    ]);
    const { findings } = checkCapsNcapsConsistent(ir, "demo");
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_CAPS_NCAPS_INCONSISTENT");
    expect(findings[0]!.message).toContain("K_A");
    expect(findings[0]!.message).not.toContain("K_B");
  });

  it("passes a keyboard with no vkey rules", () => {
    const ir = makeTestIR({ header: { keyboardId: "demo" } });
    const { findings, verified } = checkCapsNcapsConsistent(ir, "demo");
    expect(findings).toEqual([]);
    expect(verified[0]).toContain("0 referenced key(s)");
  });
});
