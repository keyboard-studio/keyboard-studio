// Round-trip test: generated deadkey_single_tap rule vs hand-written s02Recognizer.
//
// Since #2233 the two matchers share ONE shape definition (recognizer/
// s02-families.ts findS02Families): the escape rule is optional for both,
// families are keyed by the full cluster key (group, deadkey id, prefix char,
// base store, output store), and the patternId base is "deadkey_single_tap"
// for BOTH (the hand-written rule previously used the kebab base
// "deadkey-single-tap" — changed deliberately: applyAssignments matches the
// snake base verbatim). The parity contract pinned here: for every fixture
// family the two matchers produce the SAME patternId, the SAME owned-node
// set, the SAME slot values (excluding the interpreter-internal __hasBeep
// marker), and lift() produces the SAME kmnFragment.
import { describe, it, expect } from "vitest";
import { rule as generatedDeadkeySingleTap } from "./deadkey-single-tap.js";
import { s02Recognizer } from "../s02-deadkey-single-tap.js";
import type { IRGroup } from "@keyboard-studio/contracts";
import type { MatchResult } from "../../types.js";
import { makeTestIR, makeCharStore } from "@keyboard-studio/contracts/fixtures";
import {
  buildCompleteGraveIR,
  buildGraveIR,
  buildTwoTriggerGraveIR,
} from "../__fixtures__/recognizerIr.js";

/** Assert full match parity between the two matchers' results on one IR. */
export function expectTwinParity(refMatches: MatchResult[], genMatches: MatchResult[]): void {
  expect(genMatches.map((m) => m.patternId).sort()).toEqual(
    refMatches.map((m) => m.patternId).sort(),
  );
  for (const ref of refMatches) {
    const gen = genMatches.find((m) => m.patternId === ref.patternId)!;
    expect(gen.ownedNodes.map((n) => n.nodeId).sort()).toEqual(
      ref.ownedNodes.map((n) => n.nodeId).sort(),
    );
    const { __hasBeep: _beep, ...genSlots } = gen.slotValues;
    expect(genSlots).toEqual(ref.slotValues);
    expect(generatedDeadkeySingleTap.lift(gen).kmnFragment).toBe(
      s02Recognizer.lift(ref).kmnFragment,
    );
  }
}

// ---------------------------------------------------------------------------
// Round-trip tests
// ---------------------------------------------------------------------------

describe("generated/deadkey-single-tap round-trip vs s02Recognizer", () => {
  it("complete grave cluster (trigger + fan-out + escape): both rules produce 1 match", () => {
    const { ir, triggerNodeId, bodyNodeId } = buildCompleteGraveIR();

    const refMatches = s02Recognizer.match(ir);
    const genMatches = generatedDeadkeySingleTap.match(ir);

    expect(refMatches).toHaveLength(1);
    expect(genMatches).toHaveLength(1);

    const ref = refMatches[0]!;
    const gen = genMatches[0]!;

    // Full patternId equality (#2233): same snake base, same full cluster key
    expect(gen.patternId).toBe(ref.patternId);
    expect(ref.patternId).toBe("deadkey_single_tap#deadkeys:dk_0060:dkf0060>dkt0060");
    expectTwinParity(refMatches, genMatches);

    // Both own the trigger and body nodes
    const genNodeIds = gen.ownedNodes.map((n) => n.nodeId);
    const refNodeIds = ref.ownedNodes.map((n) => n.nodeId);
    expect(genNodeIds).toContain(triggerNodeId);
    expect(genNodeIds).toContain(bodyNodeId);
    expect(refNodeIds).toContain(triggerNodeId);
    expect(refNodeIds).toContain(bodyNodeId);

    // Both own the store nodes
    expect(genNodeIds).toContain("store#dkf0060");
    expect(genNodeIds).toContain("store#dkt0060");
    expect(refNodeIds).toContain("store#dkf0060");
    expect(refNodeIds).toContain("store#dkt0060");

    // The triggerKey slot must agree
    expect(gen.slotValues["triggerKey"]).toBe(ref.slotValues["triggerKey"]);

    // The deadkeyName slot must agree (both produce underscore-hex "dk_0060")
    expect(gen.slotValues["deadkeyName"]).toBe(ref.slotValues["deadkeyName"]);
    expect(gen.slotValues["deadkeyName"]).toBe("dk_0060");

    // The baseLetters and accentedForms slots must agree
    expect(gen.slotValues["baseLetters"]).toBe(ref.slotValues["baseLetters"]);
    expect(gen.slotValues["accentedForms"]).toBe(ref.slotValues["accentedForms"]);
  });

  it("two-trigger cluster (unshifted + shifted): both rules produce 1 match; triggerKey matches", () => {
    const { ir, trigger1, trigger2, bodyNodeId } = buildTwoTriggerGraveIR();

    const refMatches = s02Recognizer.match(ir);
    const genMatches = generatedDeadkeySingleTap.match(ir);

    expect(refMatches).toHaveLength(1);
    expect(genMatches).toHaveLength(1);

    const ref = refMatches[0]!;
    const gen = genMatches[0]!;
    expectTwinParity(refMatches, genMatches);

    // Unshifted trigger is preferred as primary — both agree
    expect(gen.slotValues["triggerKey"]).toBe("K_QUOTE");
    expect(ref.slotValues["triggerKey"]).toBe("K_QUOTE");

    // Both own all three rule nodes
    const genNodeIds = gen.ownedNodes.map((n) => n.nodeId);
    const refNodeIds = ref.ownedNodes.map((n) => n.nodeId);
    expect(genNodeIds).toContain(trigger1);
    expect(genNodeIds).toContain(trigger2);
    expect(genNodeIds).toContain(bodyNodeId);
    expect(refNodeIds).toContain(trigger1);
    expect(refNodeIds).toContain(trigger2);
    expect(refNodeIds).toContain(bodyNodeId);

    // ...and the hand-written rule owns them as rule nodes
    const refRuleNodeIds = ref.ownedNodes.filter((n) => n.kind === "rule").map((n) => n.nodeId);
    expect(refRuleNodeIds).toEqual(expect.arrayContaining([trigger1, trigger2, bodyNodeId]));
  });

  it("base and accented stores are surfaced correctly in both rules", () => {
    const { ir } = buildCompleteGraveIR();

    const refMatches = s02Recognizer.match(ir);
    const genMatches = generatedDeadkeySingleTap.match(ir);

    expect(refMatches).toHaveLength(1);
    expect(genMatches).toHaveLength(1);

    const ref = refMatches[0]!;
    const gen = genMatches[0]!;

    expect(gen.slotValues["baseLetters"]).toBe(" aAeEiIoOuU");
    expect(ref.slotValues["baseLetters"]).toBe(" aAeEiIoOuU");
    expect(gen.slotValues["accentedForms"]).toBe("`àÀèÈìÌòÒùÙ");
    expect(ref.slotValues["accentedForms"]).toBe("`àÀèÈìÌòÒùÙ");
  });

  // --- Negative tests: both rules ---

  it("body but no triggers: both rules return zero matches", () => {
    const deadkeysGroup: IRGroup = {
      nodeId: "group#deadkeys",
      name: "deadkeys",
      usingKeys: false,
      readonly: false,
      rules: [
        {
          nodeId: "rule#body",
          context: [
            { kind: "deadkey", id: 0x0060 },
            { kind: "any", storeRef: "dkf0060" },
          ],
          output: [{ kind: "index", storeRef: "dkt0060", offset: 2 }],
        },
      ],
    };
    const stores = [
      makeCharStore("store#dkf0060", "dkf0060", " aA"),
      makeCharStore("store#dkt0060", "dkt0060", "`àÀ"),
    ];
    const ir = makeTestIR([deadkeysGroup], stores);

    expect(s02Recognizer.match(ir)).toHaveLength(0);
    expect(generatedDeadkeySingleTap.match(ir)).toHaveLength(0);
  });

  it("triggers but no body: both rules return zero matches", () => {
    const mainGroup: IRGroup = {
      nodeId: "group#main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [
        {
          nodeId: "rule#trigger",
          context: [{ kind: "vkey", name: "K_QUOTE", modifiers: [] }],
          output: [{ kind: "deadkey", id: 0x0060 }],
        },
      ],
    };
    const deadkeysGroup: IRGroup = {
      nodeId: "group#deadkeys",
      name: "deadkeys",
      usingKeys: false,
      readonly: false,
      rules: [],
    };
    const ir = makeTestIR([mainGroup, deadkeysGroup], []);

    expect(s02Recognizer.match(ir)).toHaveLength(0);
    expect(generatedDeadkeySingleTap.match(ir)).toHaveLength(0);
  });

  it("non-parallel stores (length mismatch): both rules return zero matches", () => {
    const mainGroup: IRGroup = {
      nodeId: "group#main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [
        {
          nodeId: "rule#trigger",
          context: [{ kind: "vkey", name: "K_QUOTE", modifiers: [] }],
          output: [{ kind: "deadkey", id: 0x0060 }],
        },
      ],
    };
    const deadkeysGroup: IRGroup = {
      nodeId: "group#deadkeys",
      name: "deadkeys",
      usingKeys: false,
      readonly: false,
      rules: [
        {
          nodeId: "rule#body",
          context: [
            { kind: "deadkey", id: 0x0060 },
            { kind: "any", storeRef: "dkf0060" },
          ],
          output: [{ kind: "index", storeRef: "dkt0060", offset: 2 }],
        },
        {
          nodeId: "rule#escape",
          context: [
            { kind: "deadkey", id: 0x0060 },
            { kind: "vkey", name: "K_QUOTE", modifiers: [] },
          ],
          output: [{ kind: "char", value: "`" }],
        },
      ],
    };
    // Non-parallel: base 3 items, out 2 items
    const stores = [
      makeCharStore("store#dkf0060", "dkf0060", " aA"),
      makeCharStore("store#dkt0060", "dkt0060", "`à"),
    ];
    const ir = makeTestIR([mainGroup, deadkeysGroup], stores);

    expect(s02Recognizer.match(ir)).toHaveLength(0);
    expect(generatedDeadkeySingleTap.match(ir)).toHaveLength(0);
  });

  it("fan-out with offset !== 2: both rules return zero matches", () => {
    const mainGroup: IRGroup = {
      nodeId: "group#main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [
        {
          nodeId: "rule#trigger",
          context: [{ kind: "vkey", name: "K_QUOTE", modifiers: [] }],
          output: [{ kind: "deadkey", id: 0x0060 }],
        },
      ],
    };
    const deadkeysGroup: IRGroup = {
      nodeId: "group#deadkeys",
      name: "deadkeys",
      usingKeys: false,
      readonly: false,
      rules: [
        {
          nodeId: "rule#body",
          context: [
            { kind: "deadkey", id: 0x0060 },
            { kind: "any", storeRef: "dkf0060" },
          ],
          output: [{ kind: "index", storeRef: "dkt0060", offset: 3 }],
        },
      ],
    };
    const stores = [
      makeCharStore("store#dkf0060", "dkf0060", " aA"),
      makeCharStore("store#dkt0060", "dkt0060", "`àÀ"),
    ];
    const ir = makeTestIR([mainGroup, deadkeysGroup], stores);

    expect(s02Recognizer.match(ir)).toHaveLength(0);
    expect(generatedDeadkeySingleTap.match(ir)).toHaveLength(0);
  });

  // --- Former divergence, reconciled in #2233: the escape rule is optional
  // --- for BOTH matchers (basic_kbdfr ships no escape rules at all).

  it("without escape rule: BOTH rules match (escape is optional since #2233)", () => {
    const { ir, triggerNodeId, bodyNodeId } = buildGraveIR({ escape: false });

    const refMatches = s02Recognizer.match(ir);
    const genMatches = generatedDeadkeySingleTap.match(ir);
    expect(refMatches).toHaveLength(1);
    expect(genMatches).toHaveLength(1);
    expectTwinParity(refMatches, genMatches);

    const ref = refMatches[0]!;
    expect(ref.patternId).toBe("deadkey_single_tap#deadkeys:dk_0060:dkf0060>dkt0060");
    expect(ref.ownedNodes.map((n) => n.nodeId)).toEqual(
      expect.arrayContaining([triggerNodeId, bodyNodeId, "store#dkf0060", "store#dkt0060"]),
    );
    expect(ref.slotValues["triggerKey"]).toBe("RALT K_7");
    expect(ref.slotValues["deadkeyName"]).toBe("dk_0060");
    expect(ref.slotValues["baseLetters"]).toBe(" aAeEiIoOuU");
    expect(ref.slotValues["accentedForms"]).toBe("`àÀèÈìÌòÒùÙ");
    // No escape -> no accentChar slot, and the lifted fragment has no escape line
    expect(ref.slotValues["accentChar"]).toBeUndefined();
    expect(s02Recognizer.lift(ref).kmnFragment).not.toContain("{{accentChar}}");
    expect(s02Recognizer.lift(ref).kmnFragment.split("\n")).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// lift() smoke tests (generated rule)
// ---------------------------------------------------------------------------

describe("generated/deadkey-single-tap lift()", () => {
  it("lift returns a Pattern with origin=recognized and strategyId=S-02", () => {
    const { ir } = buildCompleteGraveIR();
    const matches = generatedDeadkeySingleTap.match(ir);
    expect(matches).toHaveLength(1);

    const pattern = generatedDeadkeySingleTap.lift(matches[0]!);
    expect(pattern.origin).toBe("recognized");
    expect(pattern.strategyId).toBe("S-02");
  });

  it("lift surfaces triggerKey, baseLetters, accentedForms questions", () => {
    const { ir } = buildCompleteGraveIR();
    const matches = generatedDeadkeySingleTap.match(ir);
    expect(matches).toHaveLength(1);

    const pattern = generatedDeadkeySingleTap.lift(matches[0]!);
    const ids = pattern.questions.map((q) => q.id);
    expect(ids).toContain("triggerKey");
    expect(ids).toContain("baseLetters");
    expect(ids).toContain("accentedForms");

    const triggerQ = pattern.questions.find((q) => q.id === "triggerKey")!;
    expect(triggerQ.default).toBe("RALT K_7");
  });
});
