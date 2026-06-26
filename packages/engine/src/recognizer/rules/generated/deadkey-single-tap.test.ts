// Round-trip test: generated deadkey_single_tap rule vs hand-written s02Recognizer.
//
// Behavioural divergence documented here:
//   - The interpreter (generated rule) requires an escape rule in the deadkeys group;
//     the hand-written s02Recognizer treats fallback/escape rules as optional.
//   - The deadkeyName slot now agrees between both paths (underscore-hex,
//     e.g. "dk_0060"): the interpreter's numeric_id_to_label transform delegates
//     to formatDkName, matching the hand-written rule. The round-trip assertions
//     below verify the two implementations produce identical deadkeyName values.
//   - patternId bases differ by naming convention ("deadkey_single_tap" vs
//     "deadkey-single-tap"); only the suffix after '#' is compared.
//
// Fixtures in this file include escape rules so both rules produce matches.
// Negative cases and divergence cases are documented explicitly.
import { describe, it, expect } from "vitest";
import { rule as generatedDeadkeySingleTap } from "./deadkey-single-tap.js";
import { s02Recognizer } from "../s02-deadkey-single-tap.js";
import type { IRGroup, IRRule, IRStore } from "@keyboard-studio/contracts";
import { makeTestIR, makeCharStore } from "@keyboard-studio/contracts/fixtures";

function suffixId(patternId: string): string {
  return patternId.split("#")[1]?.split(":")[0] ?? "";
}

// ---------------------------------------------------------------------------
// Complete S-02 fixture builder (trigger + fan-out + escape, so both rules match)
// ---------------------------------------------------------------------------

function buildCompleteGraveIR() {
  const triggerNodeId = "rule#trigger-0060";
  const bodyNodeId = "rule#body-0060";
  const escapeNodeId = "rule#escape-0060";

  const mainGroup: IRGroup = {
    nodeId: "group#main",
    name: "main",
    usingKeys: true,
    readonly: false,
    rules: [
      {
        // trigger: RALT K_7 -> dk(0x0060)
        nodeId: triggerNodeId,
        context: [{ kind: "vkey", name: "K_7", modifiers: ["RALT"] }],
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
        // fan-out: dk(0x0060) + any(dkf0060) -> index(dkt0060, 2)
        nodeId: bodyNodeId,
        context: [
          { kind: "deadkey", id: 0x0060 },
          { kind: "any", storeRef: "dkf0060" },
        ],
        output: [{ kind: "index", storeRef: "dkt0060", offset: 2 }],
      },
      {
        // escape: dk(0x0060) + K_7 -> char '`'  (bare accent)
        nodeId: escapeNodeId,
        context: [
          { kind: "deadkey", id: 0x0060 },
          { kind: "vkey", name: "K_7", modifiers: [] },
        ],
        output: [{ kind: "char", value: "`" }],
      },
    ],
  };

  const stores: IRStore[] = [
    makeCharStore("store#dkf0060", "dkf0060", " aAeEiIoOuU"),
    makeCharStore("store#dkt0060", "dkt0060", "`àÀèÈìÌòÒùÙ"),
  ];

  const ir = makeTestIR([mainGroup, deadkeysGroup], stores);
  return { ir, triggerNodeId, bodyNodeId, escapeNodeId };
}

// Two-trigger fixture (unshifted + shifted trigger, with escape rule)
function buildTwoTriggerGraveIR() {
  const trigger1 = "rule#trigger-0060-a";
  const trigger2 = "rule#trigger-0060-b";
  const bodyNodeId = "rule#body-0060";
  const escapeNodeId = "rule#escape-0060";

  const mainGroup: IRGroup = {
    nodeId: "group#main",
    name: "main",
    usingKeys: true,
    readonly: false,
    rules: [
      {
        nodeId: trigger1,
        context: [{ kind: "vkey", name: "K_QUOTE", modifiers: [] }],
        output: [{ kind: "deadkey", id: 0x0060 }],
      },
      {
        nodeId: trigger2,
        context: [{ kind: "vkey", name: "K_QUOTE", modifiers: ["SHIFT"] }],
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
        nodeId: bodyNodeId,
        context: [
          { kind: "deadkey", id: 0x0060 },
          { kind: "any", storeRef: "dkf0060" },
        ],
        output: [{ kind: "index", storeRef: "dkt0060", offset: 2 }],
      },
      {
        nodeId: escapeNodeId,
        context: [
          { kind: "deadkey", id: 0x0060 },
          { kind: "vkey", name: "K_QUOTE", modifiers: [] },
        ],
        output: [{ kind: "char", value: "`" }],
      },
    ],
  };

  const stores: IRStore[] = [
    makeCharStore("store#dkf0060", "dkf0060", " aAeEiIoOuU"),
    makeCharStore("store#dkt0060", "dkt0060", "`àÀèÈìÌòÒùÙ"),
  ];

  return { ir: makeTestIR([mainGroup, deadkeysGroup], stores), trigger1, trigger2, bodyNodeId, escapeNodeId };
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

    // Suffix (dk_0060 in both cases) must agree
    expect(suffixId(gen.patternId)).toBe(suffixId(ref.patternId));

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

  // --- Documented divergence: generated requires escape rule; hand-written does not ---

  it("divergence: without escape rule, hand-written matches but generated does not", () => {
    // This fixture matches the original buildFrGraveIR() from s02-deadkey-single-tap.test.ts
    // which has no escape rule.  The two implementations differ here by design:
    // the YAML DSL spec requires the escape rule; the hand-written rule treats it as optional.
    const mainGroup: IRGroup = {
      nodeId: "group#main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [
        {
          nodeId: "rule#trigger-0060",
          context: [{ kind: "vkey", name: "K_7", modifiers: ["RALT"] }],
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
          nodeId: "rule#body-0060",
          context: [
            { kind: "deadkey", id: 0x0060 },
            { kind: "any", storeRef: "dkf0060" },
          ],
          output: [{ kind: "index", storeRef: "dkt0060", offset: 2 }],
        },
      ],
    };
    const stores = [
      makeCharStore("store#dkf0060", "dkf0060", " aAeEiIoOuU"),
      makeCharStore("store#dkt0060", "dkt0060", "`àÀèÈìÌòÒùÙ"),
    ];
    const ir = makeTestIR([mainGroup, deadkeysGroup], stores);

    // Hand-written rule lifts without escape
    expect(s02Recognizer.match(ir)).toHaveLength(1);
    // Generated rule requires escape — no match
    expect(generatedDeadkeySingleTap.match(ir)).toHaveLength(0);
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
