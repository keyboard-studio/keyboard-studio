import { describe, it, expect } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import {
  checkMathLatinLookalikes,
  checkPuaPlacement,
  scanProducedRanges,
} from "./check-produced-set.js";

function irWithOutput(value: string): KeyboardIR {
  return makeTestIR({
    header: { keyboardId: "demo" },
    groups: [
      {
        nodeId: "g1",
        name: "main",
        usingKeys: true,
        readonly: false,
        rules: [
          {
            nodeId: "r1",
            context: [],
            output: [{ kind: "char", value }],
          },
        ],
      },
    ],
  });
}

describe("scanProducedRanges", () => {
  it("reports PUA and math-lookalike codepoints distinctly", () => {
    const ranges = scanProducedRanges(irWithOutput("\u{E001}\u{1D41A}a"));
    expect(ranges.pua).toEqual(["U+E001"]);
    expect(ranges.mathLatinLookalikes).toEqual(["U+1D41A"]);
  });

  it("reports nothing for ordinary output", () => {
    const ranges = scanProducedRanges(irWithOutput("abcé"));
    expect(ranges.pua).toEqual([]);
    expect(ranges.mathLatinLookalikes).toEqual([]);
  });
});

describe("checkPuaPlacement (13.1)", () => {
  it("flags PUA output in release/ placement", () => {
    const findings = checkPuaPlacement(irWithOutput("\u{E001}"), "release");
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_PUA_KEYBOARD_PLACEMENT");
    expect(findings[0]!.message).toContain("U+E001");
  });

  it("passes PUA output in experimental/ placement", () => {
    expect(checkPuaPlacement(irWithOutput("\u{E001}"), "experimental")).toEqual(
      [],
    );
  });

  it("passes non-PUA output anywhere", () => {
    expect(checkPuaPlacement(irWithOutput("a"), "release")).toEqual([]);
  });
});

describe("checkMathLatinLookalikes (13.4)", () => {
  it("flags a mathematical Latin look-alike in the output", () => {
    const findings = checkMathLatinLookalikes(irWithOutput("\u{1D41A}"));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_MATH_LATIN_LOOKALIKE");
    expect(findings[0]!.message).toContain("U+1D41A");
  });

  it("passes regular Latin output", () => {
    expect(checkMathLatinLookalikes(irWithOutput("aA"))).toEqual([]);
  });
});
