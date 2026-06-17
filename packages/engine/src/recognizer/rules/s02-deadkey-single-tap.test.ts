import { describe, it, expect } from "vitest";
import { s02Recognizer } from "./s02-deadkey-single-tap.js";
import type {
  IRGroup,
  IRStore,
} from "@keyboard-studio/contracts";
import { makeTestIR, charItems } from "@keyboard-studio/contracts/fixtures";

const makeIR = (groups: IRGroup[], stores: IRStore[]) => makeTestIR(groups, stores);

function store(nodeId: string, name: string, chars: string): IRStore {
  return { nodeId, name, items: charItems(chars), isSystem: false };
}

// basic_kbdfr grave-family: 1 trigger, 1 body
function buildFrGraveIR(): { ir: KeyboardIR; triggerNodeId: string; bodyNodeId: string } {
  const triggerNodeId = "rule#trigger-0060";
  const bodyNodeId = "rule#body-0060";

  const mainGroup: IRGroup = {
    nodeId: "group#main",
    name: "main",
    usingKeys: true,
    readonly: false,
    rules: [
      {
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
        nodeId: bodyNodeId,
        context: [
          { kind: "deadkey", id: 0x0060 },
          { kind: "any", storeRef: "dkf0060" },
        ],
        output: [{ kind: "index", storeRef: "dkt0060", offset: 2 }],
      },
    ],
  };

  const stores: IRStore[] = [
    store("store#dkf0060", "dkf0060", " aAeEiIoOuU"),
    store("store#dkt0060", "dkt0060", "`àÀèÈìÌòÒùÙ"),
  ];

  const ir = makeIR([mainGroup, deadkeysGroup], stores);
  return { ir, triggerNodeId, bodyNodeId };
}

describe("s02Recognizer", () => {
  it("basic_kbdfr grave: 1 trigger + 1 body produces 1 Pattern with both nodes owned", () => {
    const { ir, triggerNodeId, bodyNodeId } = buildFrGraveIR();
    const matches = s02Recognizer.match(ir);

    expect(matches).toHaveLength(1);
    const m = matches[0]!;
    expect(m.patternId).toBe("deadkey-single-tap#dk_0060");
    const nodeIds = m.ownedNodes.map((n) => n.nodeId);
    expect(nodeIds).toContain(triggerNodeId);
    expect(nodeIds).toContain(bodyNodeId);
    // stores are also owned
    expect(nodeIds).toContain("store#dkf0060");
    expect(nodeIds).toContain("store#dkt0060");

    expect(m.slotValues["triggerKey"]).toBe("RALT K_7");
    expect(m.slotValues["deadkeyName"]).toBe("dk_0060");
    expect(m.slotValues["baseLetters"]).toBe(" aAeEiIoOuU");
    expect(m.slotValues["accentedForms"]).toBe("`àÀèÈìÌòÒùÙ");
  });

  it("basic_kbdca grave: 2 triggers + 1 body produces 1 Pattern with 3 rule ownedNodes", () => {
    const trigger1NodeId = "rule#trigger-0060-a";
    const trigger2NodeId = "rule#trigger-0060-b";
    const bodyNodeId = "rule#body-0060";

    const mainGroup: IRGroup = {
      nodeId: "group#main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [
        {
          nodeId: trigger1NodeId,
          context: [{ kind: "vkey", name: "K_QUOTE", modifiers: [] }],
          output: [{ kind: "deadkey", id: 0x0060 }],
        },
        {
          nodeId: trigger2NodeId,
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
      ],
    };

    const stores: IRStore[] = [
      store("store#dkf0060", "dkf0060", " aAeEiIoOuU"),
      store("store#dkt0060", "dkt0060", "`àÀèÈìÌòÒùÙ"),
    ];

    const ir = makeIR([mainGroup, deadkeysGroup], stores);
    const matches = s02Recognizer.match(ir);

    expect(matches).toHaveLength(1);
    const m = matches[0]!;
    const ruleNodeIds = m.ownedNodes
      .filter((n) => n.kind === "rule")
      .map((n) => n.nodeId);
    expect(ruleNodeIds).toContain(trigger1NodeId);
    expect(ruleNodeIds).toContain(trigger2NodeId);
    expect(ruleNodeIds).toContain(bodyNodeId);

    // Unshifted trigger is chosen as primary
    expect(m.slotValues["triggerKey"]).toBe("K_QUOTE");
  });

  it("body but no triggers: no match", () => {
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
    const stores: IRStore[] = [
      store("store#dkf0060", "dkf0060", " aA"),
      store("store#dkt0060", "dkt0060", "`àÀ"),
    ];
    // No main group with a trigger
    const ir = makeIR([deadkeysGroup], stores);
    const matches = s02Recognizer.match(ir);
    expect(matches).toHaveLength(0);
  });

  it("triggers but no body: no match", () => {
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
    // deadkeys group has no body rule for 0x0060
    const deadkeysGroup: IRGroup = {
      nodeId: "group#deadkeys",
      name: "deadkeys",
      usingKeys: false,
      readonly: false,
      rules: [],
    };
    const ir = makeIR([mainGroup, deadkeysGroup], []);
    const matches = s02Recognizer.match(ir);
    expect(matches).toHaveLength(0);
  });

  it("body rule with offset !== 2 is skipped (falls back to raw, no S-02 match)", () => {
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
          // offset: 3 — non-standard, not S-02 in v1.1 scope
          output: [{ kind: "index", storeRef: "dkt0060", offset: 3 }],
        },
      ],
    };
    const stores: IRStore[] = [
      store("store#dkf0060", "dkf0060", " aA"),
      store("store#dkt0060", "dkt0060", "`àÀ"),
    ];
    const ir = makeIR([mainGroup, deadkeysGroup], stores);
    const matches = s02Recognizer.match(ir);
    expect(matches).toHaveLength(0);
  });

  it("non-parallel stores: no match (no throw)", () => {
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
      ],
    };
    // Non-parallel: base has 3 items, out has 2
    const stores: IRStore[] = [
      store("store#dkf0060", "dkf0060", " aA"),
      store("store#dkt0060", "dkt0060", "`à"),
    ];
    const ir = makeIR([mainGroup, deadkeysGroup], stores);
    expect(() => s02Recognizer.match(ir)).not.toThrow();
    const matches = s02Recognizer.match(ir);
    expect(matches).toHaveLength(0);
  });
});
