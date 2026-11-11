// baseFallbackCells — the base keyboard answer for positions the working copy does not handle
// (spec 117 FR-014).

import { describe, expect, it } from "vitest";
import { parseKmn } from "@keyboard-studio/engine";
import type { KeyboardIR, LayerCombo } from "@keyboard-studio/contracts";
import { lookupHostOutput } from "../../lib/referenceBaseLayouts.ts";
import type { WindowsLayout } from "../../lib/windowsLayouts.ts";
import { baseFallbackCells, baseFallbackFor, layerBaseState } from "./baseFallbackCells.ts";

const HEAD = `store(&VERSION) '10.0'
store(&NAME) 'T'
begin Unicode > use(main)
group(main) using keys
`;

function irOf(rules: string): KeyboardIR {
  return parseKmn(HEAD + rules + "\n", "t").ir;
}

const US: WindowsLayout = { id: "00000409", name: "US", languages: [], family: "qwerty", host: "us" };
const AZERTY: WindowsLayout = { id: "0000040c", name: "French", languages: [], family: "azerty", host: "azerty" };
const NO_DATA: WindowsLayout = { id: "00000452", name: "Welsh", languages: [], family: "qwerty" };

describe("layerBaseState", () => {
  it.each<[LayerCombo, string | null]>([
    [[], "none"],
    [["SHIFT"], "shift"],
    [["RALT"], "altgr"],
    [["LCTRL", "LALT"], "altgr"],
    [["SHIFT", "RALT"], "shiftAltgr"],
    [["CTRL"], null],
    [["CAPS"], null],
    [["SHIFT", "CAPS"], null],
  ])("%j", (layer, want) => {
    expect(layerBaseState(layer)).toBe(want);
  });
});

describe("baseFallbackFor", () => {
  it("lists the primary base keyboard first, and every picked base in the detail", () => {
    const d = baseFallbackFor("K_A", [], [US, AZERTY]);
    expect(d.entries.map((e) => [e.baseId, e.primary])).toEqual([
      ["00000409", true],
      ["0000040c", false],
    ]);
    expect(d.entries[0]?.result).toEqual({ kind: "character", text: lookupHostOutput("us", "K_A") });
    expect(d.entries[1]?.result).toEqual({ kind: "character", text: lookupHostOutput("azerty", "K_A") });
    expect(d.entries[0]?.result).not.toEqual(d.entries[1]?.result);
    // The cell shows the primary base keyboard's character, never another pick's.
    expect(d.display).toBe(lookupHostOutput("us", "K_A"));
    expect(d.outcome).toEqual(d.entries[0]?.result);
  });

  it("a base keyboard that arms a deadkey there reports a deadkey with no display character", () => {
    const d = baseFallbackFor("K_LBRKT", [], [AZERTY]);
    expect(d.outcome).toEqual({ kind: "deadkey" });
    expect(d.display).toBeNull();
  });

  it("is unknown when a picked base has no reference data", () => {
    const d = baseFallbackFor("K_A", [], [NO_DATA, US]);
    expect(d.entries[0]?.result).toEqual({ kind: "unknown" });
    expect(d.outcome).toEqual({ kind: "unknown" });
    expect(d.display).toBeNull();
    expect(d.entries[1]?.result.kind).toBe("character");
  });

  it("is unknown when the reference data has no cell for the position", () => {
    // The US reference has no AltGr character on E.
    expect(lookupHostOutput("us", "K_E", ["RALT"])).toBeUndefined();
    expect(baseFallbackFor("K_E", ["RALT"], [US]).outcome).toEqual({ kind: "unknown" });
  });

  it("is unknown when the layer is outside none/shift/altgr/shiftAltgr", () => {
    expect(baseFallbackFor("K_A", ["CAPS"], [US]).outcome).toEqual({ kind: "unknown" });
    expect(baseFallbackFor("K_1", ["CTRL"], [US]).outcome).toEqual({ kind: "unknown" });
  });

  it("is a system shortcut for Ctrl or Alt with a letter, but not AltGr", () => {
    expect(baseFallbackFor("K_A", ["CTRL"], [US]).outcome).toEqual({ kind: "system-shortcut" });
    expect(baseFallbackFor("K_A", ["ALT"], [US]).outcome).toEqual({ kind: "system-shortcut" });
    expect(baseFallbackFor("K_A", ["CTRL", "SHIFT"], [US]).outcome).toEqual({ kind: "system-shortcut" });
    expect(baseFallbackFor("K_A", ["RALT"], [US]).outcome.kind).not.toBe("system-shortcut");
    expect(baseFallbackFor("K_A", ["LCTRL", "LALT"], [US]).outcome.kind).not.toBe("system-shortcut");
  });

  it("is unknown (not a guess) when no base keyboard is picked", () => {
    const d = baseFallbackFor("K_A", [], []);
    expect(d.entries).toEqual([]);
    expect(d.outcome).toEqual({ kind: "unknown" });
    expect(d.display).toBeNull();
  });

  it("a Do-nothing class policy shows the base character and says the policy is not in effect", () => {
    const d = baseFallbackFor("K_A", [], [US], { policyDoNothing: () => true });
    expect(d.display).toBe(lookupHostOutput("us", "K_A"));
    expect(d.policyNotInEffect).toBe(true);
    expect(baseFallbackFor("K_A", [], [US]).policyNotInEffect).toBe(false);
    // Nothing to claim when there is no base character to show.
    expect(baseFallbackFor("K_A", [], [NO_DATA], { policyDoNothing: () => true }).policyNotInEffect).toBe(false);
  });

  it("never uses the simulator's US fallback: a non-US primary shows its own character", () => {
    const d = baseFallbackFor("K_A", [], [AZERTY, US]);
    expect(d.display).toBe(lookupHostOutput("azerty", "K_A"));
    expect(d.display).not.toBe(lookupHostOutput("us", "K_A"));
  });
});

describe("baseFallbackCells", () => {
  const vkeys = ["K_A", "K_B", "K_E"];

  it("returns only the positions the keyboard has no rule for (shared enumerator)", () => {
    const ir = irOf("+ [K_A] > 'x'");
    const cells = baseFallbackCells(ir, vkeys, [], [US]);
    expect([...cells.keys()]).toEqual(["K_B", "K_E"]);
    expect(cells.get("K_B")?.display).toBe(lookupHostOutput("us", "K_B"));
  });

  it("a rule on another layer does not cover this layer", () => {
    const ir = irOf("+ [SHIFT K_A] > 'X'");
    expect(baseFallbackCells(ir, vkeys, [], [US]).has("K_A")).toBe(true);
    expect(baseFallbackCells(ir, vkeys, ["SHIFT"], [US]).has("K_A")).toBe(false);
  });

  it("a layer outside the four states returns every key, as unknown or system shortcut", () => {
    const ir = irOf("+ [K_A] > 'x'");
    const cells = baseFallbackCells(ir, vkeys, ["CAPS"], [US]);
    expect([...cells.keys()]).toEqual(vkeys);
    expect(cells.get("K_A")?.outcome).toEqual({ kind: "unknown" });
    const ctrl = baseFallbackCells(ir, vkeys, ["CTRL"], [US]);
    expect(ctrl.get("K_A")?.outcome).toEqual({ kind: "system-shortcut" });
  });
});
