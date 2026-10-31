import { describe, it, expect } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type {
  KeyboardIR,
  KvksIR,
  TouchLayoutIR,
} from "@keyboard-studio/contracts";
import {
  checkModifierNamesConsistent,
  kvksShiftAtoms,
} from "./check-modifiers.js";

function irWithModifiers(...modSets: string[][]): KeyboardIR {
  return makeTestIR({
    header: { keyboardId: "demo" },
    groups: [
      {
        nodeId: "g1",
        name: "main",
        usingKeys: true,
        readonly: false,
        rules: modSets.map((modifiers, i) => ({
          nodeId: `r${i}`,
          context: [{ kind: "vkey" as const, name: "K_A", modifiers }],
          output: [{ kind: "char" as const, value: "a" }],
        })),
      },
    ],
  });
}

function kvksWithShifts(...shifts: string[]): KvksIR {
  return {
    layers: shifts.map((shift) => ({
      shift,
      keys: [{ vkey: "K_A", label: "a" }],
    })),
    usealtgr: false,
    nodeIds: [],
  };
}

function touchWithLayers(...ids: string[]): TouchLayoutIR {
  return {
    platforms: [
      {
        id: "phone",
        layers: ids.map((id) => ({ id, rows: [] })),
      },
    ],
    nodeIds: [],
  };
}

describe("kvksShiftAtoms (the .kvks arm of the 7.4 map)", () => {
  it("decodes bare and prefixed codes", () => {
    expect(kvksShiftAtoms("")).toEqual([]);
    expect(kvksShiftAtoms("S")).toEqual([{ family: "shift", side: "any" }]);
    expect(kvksShiftAtoms("LC")).toEqual([{ family: "ctrl", side: "left" }]);
    expect(kvksShiftAtoms("SRA")).toEqual([
      { family: "shift", side: "any" },
      { family: "alt", side: "right" },
    ]);
  });

  it("returns null for codes outside the vocabulary", () => {
    expect(kvksShiftAtoms("X")).toBeNull();
    expect(kvksShiftAtoms("L")).toBeNull();
    expect(kvksShiftAtoms("LZ")).toBeNull();
  });
});

describe("checkModifierNamesConsistent (7.4)", () => {
  it("the prose example, consistent: RALT / RA / rightalt agree", () => {
    const { findings } = checkModifierNamesConsistent({
      ir: irWithModifiers(["RALT"]),
      kvks: kvksWithShifts("", "RA"),
      touchLayout: touchWithLayers("default", "rightalt"),
    });
    expect(findings).toEqual([]);
  });

  it("the prose example, inconsistent: unsided ALT in the .kmn against RA / rightalt", () => {
    const { findings } = checkModifierNamesConsistent({
      ir: irWithModifiers(["ALT"]),
      kvks: kvksWithShifts("", "RA"),
      touchLayout: touchWithLayers("default", "rightalt"),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_MODIFIER_NAME_INCONSISTENT");
    expect(findings[0]!.message).toContain("Alt");
    expect(findings[0]!.message).toContain("ALT");
  });

  it("flags left in one source against right in another", () => {
    const { findings } = checkModifierNamesConsistent({
      ir: irWithModifiers(["LALT"]),
      touchLayout: touchWithLayers("default", "rightalt"),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("LALT");
    expect(findings[0]!.message).toContain("rightalt");
  });

  it("applies the same agreement rule to Ctrl", () => {
    const { findings } = checkModifierNamesConsistent({
      ir: irWithModifiers(["CTRL"]),
      kvks: kvksWithShifts("", "LC"),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("Ctrl");
  });

  it("a family used by only one source has nothing to disagree with", () => {
    expect(
      checkModifierNamesConsistent({ ir: irWithModifiers(["RALT"]) }).findings,
    ).toEqual([]);
    expect(
      checkModifierNamesConsistent({
        ir: irWithModifiers(["RALT"]),
        kvks: kvksWithShifts(""),
      }).findings,
    ).toEqual([]);
  });

  it("agrees when every source uses the unsided name", () => {
    const { findings } = checkModifierNamesConsistent({
      ir: irWithModifiers(["ALT"]),
      kvks: kvksWithShifts("", "A"),
      touchLayout: touchWithLayers("default", "alt"),
    });
    expect(findings).toEqual([]);
  });

  it("ignores non-modifier touch layers and NCAPS negations", () => {
    const { findings } = checkModifierNamesConsistent({
      ir: irWithModifiers(["NCAPS"], ["SHIFT"]),
      touchLayout: touchWithLayers("default", "symbol", "numeric", "shift"),
    });
    expect(findings).toEqual([]);
  });
});
