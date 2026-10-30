// importedStartOfLine — the per-mark Track 2 seed (issue #2374):
// only an all-unguarded T_ mark population seeds the start-of-line box
// ticked. Classification cases carried over from the retired
// guardSpecification.test.ts.

import { describe, expect, it } from "vitest";
import type { IRRule, KeyboardIR, TouchKeyIR } from "@keyboard-studio/contracts";
import { makeTestIR, makeTouchKeyRuleJoinFixture } from "@keyboard-studio/contracts/fixtures";

import { detectImportedStartOfLineSeed } from "./importedStartOfLine.ts";

const GRAVE = "̀"; // U+0300 combining grave

function vkeyContext(name: string): IRRule["context"] {
  return [
    { kind: "any", storeRef: "diablock" },
    { kind: "raw", text: "+" },
    { kind: "vkey", name, modifiers: [] },
  ];
}

function guardRule(nodeId: string, keyId: string): IRRule {
  return { nodeId, context: vkeyContext(keyId), output: [{ kind: "raw", text: "context" }] };
}

function producingRule(nodeId: string, keyId: string, text: string): IRRule {
  return {
    nodeId,
    context: [{ kind: "vkey", name: keyId, modifiers: [] }],
    output: [...text].map((value) => ({ kind: "char" as const, value })),
  };
}

let keyCounter = 0;
function key(id: string, text: string): TouchKeyIR {
  return { nodeId: `touchKey#${keyCounter++}`, id, text };
}

function irWith(keys: TouchKeyIR[], rules: IRRule[]): KeyboardIR {
  return makeTestIR({
    stores: [
      {
        nodeId: "store#diablock",
        name: "diablock",
        items: [{ kind: "char", value: " " }],
        isSystem: false,
      },
    ],
    groups: [{ nodeId: "group#main", name: "main", usingKeys: true, rules, readonly: false }],
    touchLayout: {
      platforms: [{ id: "phone", layers: [{ id: "default", rows: [{ keys }] }] }],
      nodeIds: [],
    },
  });
}

function guardedMarkIR(): KeyboardIR {
  return irWith(
    [key("T_0300", "◌̀")],
    [guardRule("rule#g", "T_0300"), producingRule("rule#p", "T_0300", GRAVE)],
  );
}

function unguardedMarkIR(): KeyboardIR {
  return irWith([key("T_0300", "◌̀")], [producingRule("rule#p", "T_0300", GRAVE)]);
}

describe("detectImportedStartOfLineSeed — the per-mark Track 2 seed", () => {
  it("guarded T_ marks and no unguarded ones seed nothing", () => {
    expect(detectImportedStartOfLineSeed(guardedMarkIR())).toBe(false);
  });

  it("unguarded producing T_ marks and no guarded ones seed the tick", () => {
    expect(detectImportedStartOfLineSeed(unguardedMarkIR())).toBe(true);
  });

  it("a mixed population seeds nothing", () => {
    const ir = irWith(
      [key("T_0300", "◌̀"), key("T_0301", "◌́")],
      [
        guardRule("rule#g", "T_0300"),
        producingRule("rule#p0", "T_0300", GRAVE),
        producingRule("rule#p1", "T_0301", "́"),
      ],
    );
    expect(detectImportedStartOfLineSeed(ir)).toBe(false);
  });

  it("no T_ mark keys at all seed nothing", () => {
    const ir = irWith(
      [key("U_0300", "◌̀"), key("K_A", "a")],
      [producingRule("rule#p", "K_A", "a")],
    );
    expect(detectImportedStartOfLineSeed(ir)).toBe(false);
  });

  it("the contracts join fixture (Cameroon-shaped guarded marks) seeds nothing", () => {
    expect(detectImportedStartOfLineSeed(makeTouchKeyRuleJoinFixture())).toBe(false);
  });
});
