// Unit tests for slotOccupancy (#2300) — the per-key occupancy ledger.
// Refs #2300.

import { describe, it, expect } from "vitest";
import type { IRGroup, IRStore, MechanismAssignment } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import {
  assignmentSlotKeys,
  buildSlotOccupancy,
  classifySlot,
  displacedFor,
  displacementActions,
  isProducedOnOtherSlot,
  mechanismClaimedSlots,
  orthographyTier,
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

  it("does NOT record a deadkey-composition rule's output on the plain slot (Cycle 4 P1-1)", () => {
    // `[deadkey, K_E] → é` is keyed to a deadkey context, not to the plain
    // K_E slot: a plain assignment on K_E does not shadow it, so é is not
    // the plain slot's incumbent. The composition rule comes FIRST —
    // first-rule-wins must not entrench the phantom incumbent.
    const composition = {
      nodeId: "r-comp",
      context: [
        { kind: "deadkey" as const, id: 1 },
        { kind: "vkey" as const, name: "K_E", modifiers: [] },
      ],
      output: [{ kind: "char" as const, value: "é" }],
    };
    const plain = vkeyRule("r-plain", "K_E", [], "e");
    const occ = buildSlotOccupancy(makeTestIR([groupWith([composition, plain])]), []);
    expect(occ.get("K_E|")).toEqual({ char: "e", source: "base" });
    // And with no plain rule at all, the composition names no incumbent.
    const occOnly = buildSlotOccupancy(makeTestIR([groupWith([composition])]), []);
    expect(occOnly.has("K_E|")).toBe(false);
  });

  it("skips any()+vkey and char+vkey contexts for the same reason (Cycle 4 P1-1)", () => {
    const anyCtx = {
      nodeId: "r-any",
      context: [
        { kind: "any" as const, storeRef: "vowels" },
        { kind: "vkey" as const, name: "K_A", modifiers: [] },
      ],
      output: [{ kind: "char" as const, value: "à" }],
    };
    const charCtx = {
      nodeId: "r-char",
      context: [
        { kind: "char" as const, value: "n" },
        { kind: "vkey" as const, name: "K_G", modifiers: [] },
      ],
      output: [{ kind: "char" as const, value: "ŋ" }],
    };
    const occ = buildSlotOccupancy(makeTestIR([groupWith([anyCtx, charCtx])]), []);
    expect(occ.has("K_A|")).toBe(false);
    expect(occ.has("K_G|")).toBe(false);
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

describe("assignmentSlotKeys — slots derived from the RECORDED assignment (Cycle 4 P1-2)", () => {
  function assignment(mechanisms: MechanismAssignment["mechanisms"]): MechanismAssignment {
    return {
      scope: "individual",
      target: "X",
      modality: "physical",
      mechanisms,
      source: "user",
    };
  }

  it("keys an S-01 assignment by its recorded bare rule, not by any candidate modifiers", () => {
    // The S-01 suggestion-accept writes a bare `+ [K_QUOTE] > U+XXXX` rule
    // even when the accepted candidate carried ["SHIFT"] (case-pair
    // inheritance) — the recorded rule's slot is the BARE slot.
    const a = assignment([
      {
        patternId: "simple_swap",
        strategyId: "S-01",
        slotValues: { kmnRules: "+ [K_QUOTE] > U+0186" },
      },
    ]);
    expect(assignmentSlotKeys(a)).toEqual([
      { key: "K_QUOTE|", vkey: "K_QUOTE", modifiers: [], char: "Ɔ" },
    ]);
  });

  it("names the whole NFC glyph of an NFD S-01 output, not its first code point", () => {
    const a = assignment([
      {
        patternId: "simple_swap",
        strategyId: "S-01",
        slotValues: { kmnRules: "+ [K_QUOTE] > U+0061 U+030C" },
      },
    ]);
    expect(assignmentSlotKeys(a)).toEqual([
      { key: "K_QUOTE|", vkey: "K_QUOTE", modifiers: [], char: "ǎ" },
    ]);
  });

  it("yields nothing for an S-01 output that is more than one grapheme", () => {
    const a = assignment([
      {
        patternId: "simple_swap",
        strategyId: "S-01",
        slotValues: { kmnRules: "+ [K_QUOTE] > U+0061 U+0062" },
      },
    ]);
    expect(assignmentSlotKeys(a)).toEqual([]);
  });

  it("keys each line of a multi-line S-01 (CAPS quad shape) to its own slot", () => {
    const a = assignment([
      {
        patternId: "simple_swap",
        strategyId: "S-01",
        slotValues: {
          kmnRules: "+ [K_Q] > U+0071\n+ [SHIFT K_Q] > U+0051",
        },
      },
    ]);
    expect(assignmentSlotKeys(a).map((e) => e.key)).toEqual(["K_Q|", "K_Q|SHIFT"]);
  });

  it("keys an S-08 assignment by its recorded altgrKeyList", () => {
    const a = assignment([
      {
        patternId: "modifier_as_layer_switch",
        strategyId: "S-08",
        slotValues: { altgrKeyList: "[RALT K_N]", altgrOutputList: "ŋ" },
      },
    ]);
    expect(assignmentSlotKeys(a)).toEqual([
      { key: "K_N|RALT", vkey: "K_N", modifiers: ["RALT"], char: "ŋ" },
    ]);
  });

  it("yields NO slots for an unparseable mechanism — the P2-c seam: unparseable counts as not-produced-elsewhere", () => {
    const a = assignment([
      {
        patternId: "simple_swap",
        strategyId: "S-01",
        slotValues: { kmnRules: "this is not a key rule at all" },
      },
    ]);
    expect(assignmentSlotKeys(a)).toEqual([]);
  });

  it("yields no slots for a deadkey assignment (it takes no slot)", () => {
    const a = assignment([
      {
        patternId: "deadkey_single_tap",
        strategyId: "S-02",
        slotValues: { triggerKey: "K_COLON", baseLetters: "e" },
      },
    ]);
    expect(assignmentSlotKeys(a)).toEqual([]);
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

describe("orthographyTier", () => {
  const needs: NeedSets = {
    confirmedInventory: new Set(["ə", "ʼ", "'", "’", "5"]),
    baseProducedSet: new Set(["a", "'", "-"]),
  };

  it("an inventory letter is core, including the modifier-letter apostrophe ʼ", () => {
    expect(orthographyTier("ə", needs)).toBe("core");
    expect(orthographyTier("ʼ", needs)).toBe("core");
  });

  it("inventory punctuation and digits are convenience, never core (spec 106 FR-043)", () => {
    expect(orthographyTier("'", needs)).toBe("convenience");
    expect(orthographyTier("’", needs)).toBe("convenience");
    expect(orthographyTier("5", needs)).toBe("convenience");
  });

  it("base-produced characters outside the inventory are convenience; the rest none", () => {
    expect(orthographyTier("-", needs)).toBe("convenience");
    expect(orthographyTier("q", needs)).toBe("none");
  });
});

describe("mechanismClaimedSlots (spec 106 US4)", () => {
  it("an S-08 claims every keystroke of a multi-key list, whatever its outputs", () => {
    const slots = mechanismClaimedSlots({
      patternId: "modifier_as_layer_switch",
      strategyId: "S-08",
      slotValues: { altgrKeyList: "[RALT K_E] [RALT SHIFT K_E]", altgrOutputList: "éÉ" },
    });
    expect(slots).toEqual([
      { vkey: "K_E", modifiers: ["RALT"] },
      { vkey: "K_E", modifiers: ["SHIFT", "RALT"] },
    ]);
  });

  it("an S-02 claims its trigger, and RALT trigger only with the altgr escape", () => {
    const dk = (escapes?: string) => ({
      patternId: "deadkey_single_tap",
      strategyId: "S-02" as const,
      slotValues: { triggerKey: "K_COLON", ...(escapes !== undefined ? { escapes } : {}) },
    });
    expect(mechanismClaimedSlots(dk())).toEqual([{ vkey: "K_COLON", modifiers: [] }]);
    expect(mechanismClaimedSlots(dk("double-tap space altgr"))).toEqual([
      { vkey: "K_COLON", modifiers: [] },
      { vkey: "K_COLON", modifiers: ["RALT"] },
    ]);
  });

  it("postfix_compose claims its mark key only with the bare escape", () => {
    const pc = (escapes: string) => ({
      patternId: "postfix_compose",
      strategyId: "S-03" as const,
      slotValues: { markKey: "K_5", escapes },
    });
    expect(mechanismClaimedSlots(pc("bare"))).toEqual([{ vkey: "K_5", modifiers: [] }]);
    expect(mechanismClaimedSlots(pc(""))).toEqual([]);
  });

  it("a plain S-03 sequence claims nothing", () => {
    expect(
      mechanismClaimedSlots({ patternId: "multi_char_sequence", strategyId: "S-03", slotValues: {} }),
    ).toEqual([]);
  });
});

describe("displacementActions", () => {
  it("offers the move first and leave second when one glyph is demoted", () => {
    expect(displacementActions("demote-incumbent")).toEqual(["confirm-move", "leave"]);
    expect(displacementActions("demote-incoming")).toEqual(["confirm-move", "leave"]);
  });

  it("makes keep-both the default for both-core, with demotion the explicit override", () => {
    expect(displacementActions("both-core")).toEqual(["keep-both", "demote-displaced"]);
  });
});
