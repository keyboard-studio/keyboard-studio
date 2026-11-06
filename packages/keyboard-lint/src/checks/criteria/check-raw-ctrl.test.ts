import { describe, it, expect } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { IRGroup, KeyboardIR } from "@keyboard-studio/contracts";
import { checkRawCtrl, findRawCtrlRules } from "./check-raw-ctrl.js";

type Spec = [key: string, modifiers: string[], output: string];

function group(name: string, specs: Spec[], usingKeys = true): IRGroup {
  return {
    nodeId: `g:${name}`,
    name,
    usingKeys,
    readonly: false,
    rules: specs.map(([key, modifiers, value], i) => ({
      nodeId: `${name}-r${i}`,
      context: [{ kind: "vkey", name: key, modifiers }],
      output: [{ kind: "char", value }],
    })),
  };
}

function ir(keyboardId: string, ...groups: IRGroup[]): KeyboardIR {
  return makeTestIR({ header: { keyboardId }, groups });
}

describe("checkRawCtrl (7.29)", () => {
  it("reports Ctrl without Alt, once, with the warning wording", () => {
    const k = ir("demo", group("main", [["K_1", ["CTRL"], "\u00e9"], ["K_2", ["CTRL", "SHIFT"], "\u00e8"]]));
    const { findings } = checkRawCtrl(k, "demo");
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_RAW_CTRL");
    expect(findings[0]!.location.file).toBe("source/demo.kmn");
    expect(findings[0]!.message).toMatch(/may not be accepted/i);
    expect(findings[0]!.hint).toMatch(/move/i);
  });

  it("does not report Ctrl with Alt, or sided Ctrl", () => {
    const k = ir(
      "demo",
      group("main", [["K_A", ["CTRL", "ALT"], "x"], ["K_B", ["CTRL", "RALT"], "y"], ["K_C", ["LCTRL"], "z"], ["K_D", ["RCTRL"], "w"]]),
    );
    expect(checkRawCtrl(k, "demo").findings).toEqual([]);
  });

  it("skips Ctrl+Space", () => {
    const k = ir("demo", group("main", [["K_SPACE", ["CTRL"], "\u2009"]]));
    expect(checkRawCtrl(k, "demo").findings).toEqual([]);
  });

  it("skips basic_* keyboards", () => {
    const k = ir("basic_kbdurdu", group("main", [["K_1", ["CTRL"], "\u200d"]]));
    expect(checkRawCtrl(k, "basic_kbdurdu").findings).toEqual([]);
  });

  it("skips an ASCII digit that matches the base digit, reports a different output", () => {
    const same = ir("demo", group("main", [["K_5", ["CTRL"], "5"]]));
    expect(checkRawCtrl(same, "demo").findings).toEqual([]);
    const other = ir("demo", group("main", [["K_5", ["CTRL"], "\u20b9"]]));
    expect(checkRawCtrl(other, "demo").findings).toHaveLength(1);
  });

  it("reports rules in deadkey and context groups", () => {
    const k = ir(
      "demo",
      group("main", [["K_A", [], "a"]]),
      group("dk", [["K_1", ["CTRL"], "\u00e9"]], false),
    );
    const rules = findRawCtrlRules(k, "demo");
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ key: "K_1", plane: "CTRL", outputs: ["\u00e9"] });
    expect(checkRawCtrl(k, "demo").findings).toHaveLength(1);
  });

  it("passes with no Ctrl rules", () => {
    expect(checkRawCtrl(ir("demo", group("main", [["K_A", [], "a"]])), "demo").findings).toEqual([]);
  });
});
