// Unit tests for slotOccupancy (#2300) — the per-key occupancy ledger.
// Refs #2300.

import { describe, it, expect } from "vitest";
import type { IRGroup, IRStore, MechanismAssignment } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import {
  buildSlotOccupancy,
  classifySlot,
  displacedFor,
  isProducedOnOtherSlot,
  slotKeyFor,
  type NeedSets,
} from "./slotOccupancy.ts";

function groupWith(rules: IRGroup["rules"]): IRGroup {
  return { nodeId: "g-main", name: "main", usingKeys: true, readonly: false, rules };
}

function vkeyRule(nodeId: string, vkey: string, modifiers: string[], out: string) {
  return {
    nodeId,
    context: [{ kind: "vkey" as const, name: vkey, modifiers }],
    output: [{ kind: "char" as const, value: out }],
  };
}

const noNeeds: NeedSets = {
  confirmedInventory: new Set<string>(),
  baseProducedSet: new Set<string>(),
};

describe("slotKeyFor", () => {
  it("serializes like contracts collisions(): vkey|sorted-modifiers", () => {
    expect(slotKeyFor("K_N", ["RALT", "SHIFT"])).toBe("K_N|RALT,SHIFT");
    expect(slotKeyFor("K_QUOTE", [])).toBe("K_QUOTE|");
  });
});

describe("buildSlotOccupancy — base IR walk", () => {
  it("records a literal rule's glyph on its slot", () => {
    const ir = makeTestIR([groupWith([vkeyRule("r1", "K_QUOTE", [], "'")])]);
    const occ = buildSlotOccupancy(ir, []);
    expect(occ.get("K_QUOTE|")).toEqual({ char: "'", source: "base" });
  });

  it("records a store-index producer that expands to exactly one glyph", () => {
    const store: IRStore = {
      nodeId: "s-out",
      name: "outStore",
      items: [{ kind: "char", value: "ə" }],
      isSystem: false,
    };
    const rule = {
      nodeId: "r-store",
      context: [{ kind: "vkey" as const, name: "K_E", modifiers: [] }],
      output: [{ kind: "index" as const, storeRef: "outStore", offset: 1 }],
    };
    const ir = makeTestIR([groupWith([rule])], [store]);
    const occ = buildSlotOccupancy(ir, []);
    expect(occ.get("K_E|")).toEqual({ char: "ə", source: "base" });
  });

  it("skips a store fan-out that expands to several glyphs (no single incumbent)", () => {
    const store: IRStore = {
      nodeId: "s-out",
      name: "outStore",
      items: [
        { kind: "char", value: "a" },
        { kind: "char", value: "b" },
      ],
      isSystem: false,
    };
    const rule = {
      nodeId: "r-store",
      context: [{ kind: "vkey" as const, name: "K_E", modifiers: [] }],
      output: [{ kind: "outs" as const, storeRef: "outStore" }],
    };
    const ir = makeTestIR([groupWith([rule])], [store]);
    expect(buildSlotOccupancy(ir, []).has("K_E|")).toBe(false);
  });

  it("keys a CAPS pair to its two distinct slots", () => {
    const ir = makeTestIR([
      groupWith([
        vkeyRule("r-ncaps", "K_Q", ["NCAPS"], "q"),
        vkeyRule("r-caps", "K_Q", ["CAPS"], "Q"),
      ]),
    ]);
    const occ = buildSlotOccupancy(ir, []);
    expect(occ.get("K_Q|NCAPS")).toEqual({ char: "q", source: "base" });
    expect(occ.get("K_Q|CAPS")).toEqual({ char: "Q", source: "base" });
  });

  it("ignores deadkey-only trigger rules and multi-char outputs", () => {
    const trigger = {
      nodeId: "r-trig",
      context: [{ kind: "vkey" as const, name: "K_COLON", modifiers: [] }],
      output: [{ kind: "deadkey" as const, id: 1 }],
    };
    const multi = {
      nodeId: "r-multi",
      context: [{ kind: "vkey" as const, name: "K_X", modifiers: [] }],
      output: [
        { kind: "char" as const, value: "t" },
        { kind: "char" as const, value: "h" },
      ],
    };
    // The two char elements run-merge into one string "th" (two codepoints),
    // which is not a single glyph — skipped conservatively.
    const ir = makeTestIR([groupWith([trigger, multi])]);
    const occ = buildSlotOccupancy(ir, []);
    expect(occ.has("K_COLON|")).toBe(false);
    expect(occ.has("K_X|")).toBe(false);
  });
});

describe("buildSlotOccupancy — session overlay", () => {
  it("overlays an S-01 session assignment over the base occupant", () => {
    const ir = makeTestIR([groupWith([vkeyRule("r1", "K_QUOTE", [], "'")])]);
    const assignment: MechanismAssignment = {
      scope: "individual",
      target: "ə",
      modality: "physical",
      mechanisms: [
        {
          patternId: "simple_swap",
          strategyId: "S-01",
          slotValues: { kmnRules: "+ [K_QUOTE] > U+0259" },
        },
      ],
      source: "user",
    };
    const occ = buildSlotOccupancy(ir, [assignment]);
    expect(occ.get("K_QUOTE|")).toEqual({ char: "ə", source: "session" });
  });

  it("overlays an S-08 session assignment on its RAlt slot", () => {
    const ir = makeTestIR([groupWith([])]);
    const assignment: MechanismAssignment = {
      scope: "individual",
      target: "ŋ",
      modality: "physical",
      mechanisms: [
        {
          patternId: "modifier_as_layer_switch",
          strategyId: "S-08",
          slotValues: { altgrKeyList: "[RALT K_N]", altgrOutputList: "ŋ" },
        },
      ],
      source: "user",
    };
    const occ = buildSlotOccupancy(ir, [assignment]);
    expect(occ.get("K_N|RALT")).toEqual({ char: "ŋ", source: "session" });
  });
});

describe("classifySlot / displacedFor", () => {
  const ir = makeTestIR([
    groupWith([
      vkeyRule("r-quote", "K_QUOTE", [], "'"),
      vkeyRule("r-hyphen", "K_HYPHEN", [], "-"),
      vkeyRule("r-x", "K_X", [], "x"),
    ]),
  ]);
  const occ = buildSlotOccupancy(ir, []);
  const needs: NeedSets = {
    confirmedInventory: new Set(["'"]),
    baseProducedSet: new Set(["'", "-"]),
  };

  it("classifies a confirmed-inventory incumbent as needed-frequent", () => {
    expect(classifySlot(occ, "K_QUOTE|", needs).kind).toBe("needed-frequent");
  });

  it("classifies a base-produced punctuation incumbent outside the inventory as needed-rare", () => {
    expect(classifySlot(occ, "K_HYPHEN|", needs).kind).toBe("needed-rare");
  });

  it("classifies an incumbent in no need set as not-needed, and a hole as spare", () => {
    expect(classifySlot(occ, "K_X|", needs).kind).toBe("not-needed");
    expect(classifySlot(occ, "K_Z|", needs)).toEqual({ kind: "spare", incumbent: null });
  });

  it("displacedFor names the incumbent unless it is the char itself", () => {
    expect(displacedFor(occ, "K_QUOTE", [], "ə")?.char).toBe("'");
    expect(displacedFor(occ, "K_QUOTE", [], "'")).toBeNull();
    expect(displacedFor(occ, "K_Z", [], "ə")).toBeNull();
  });

  it("isProducedOnOtherSlot sees a glyph that survives elsewhere", () => {
    const occ2 = buildSlotOccupancy(
      makeTestIR([
        groupWith([
          vkeyRule("r1", "K_QUOTE", [], "'"),
          vkeyRule("r2", "K_1", [], "'"),
        ]),
      ]),
      [],
    );
    expect(isProducedOnOtherSlot(occ2, "'", "K_QUOTE|")).toBe(true);
    expect(isProducedOnOtherSlot(occ, "'", "K_QUOTE|")).toBe(false);
    void noNeeds;
  });
});
