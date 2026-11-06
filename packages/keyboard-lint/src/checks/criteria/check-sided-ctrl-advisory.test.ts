import { describe, it, expect } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { checkSidedCtrlAdvisory } from "./check-sided-ctrl-advisory.js";

function ir(keyboardId: string, specs: [string, string[], string][]): KeyboardIR {
  return makeTestIR({
    header: { keyboardId },
    groups: [
      {
        nodeId: "g:main",
        name: "main",
        usingKeys: true,
        readonly: false,
        rules: specs.map(([key, modifiers, value], i) => ({
          nodeId: `r${i}`,
          context: [{ kind: "vkey", name: key, modifiers }],
          output: [{ kind: "char", value }],
        })),
      },
    ],
  });
}

describe("checkSidedCtrlAdvisory (7.30)", () => {
  it("reports an RCTRL rule as one warning finding preferring Alt", () => {
    const { findings } = checkSidedCtrlAdvisory(ir("demo", [["K_A", ["RCTRL"], "x"]]), "demo");
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_SIDED_CTRL_ADVISORY");
    expect(findings[0]!.severity).toBe("warning");
    expect(findings[0]!.message).toMatch(/Alt-based placement is preferred/);
  });

  it("reports LCTRL too", () => {
    expect(checkSidedCtrlAdvisory(ir("demo", [["K_A", ["LCTRL"], "x"]]), "demo").findings).toHaveLength(1);
  });

  it("ignores unsided Ctrl, sided Ctrl with Alt, and basic_* keyboards", () => {
    expect(checkSidedCtrlAdvisory(ir("demo", [["K_A", ["CTRL"], "x"], ["K_B", ["RCTRL", "ALT"], "y"]]), "demo").findings).toEqual([]);
    expect(checkSidedCtrlAdvisory(ir("basic_kbdfr", [["K_A", ["RCTRL"], "x"]]), "basic_kbdfr").findings).toEqual([]);
  });
});
