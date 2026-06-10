import { describe, it, expect } from "vitest";
import { s01Recognizer } from "./s01-simple-swap.js";
import type { IRGroup, IRRule } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";

const makeIR = (groups: IRGroup[]) => makeTestIR(groups);

function s01Rule(nodeId: string, vkey: string, modifiers: string[], charOut: string): IRRule {
  return {
    nodeId,
    context: [{ kind: "vkey", name: vkey, modifiers }],
    output: [{ kind: "char", value: charOut }],
  };
}

describe("s01Recognizer", () => {
  it("3 S-01 rules in one group produce 1 MatchResult with 3 ownedNodes and 3 map lines", () => {
    const group: IRGroup = {
      nodeId: "group#0",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [
        s01Rule("rule#0", "K_Q", [], "ɛ"),
        s01Rule("rule#1", "K_Q", ["SHIFT"], "Ɛ"),
        s01Rule("rule#2", "K_C", [], "ɔ"),
      ],
    };
    const ir = makeIR([group]);
    const matches = s01Recognizer.match(ir);

    expect(matches).toHaveLength(1);
    const m = matches[0]!;
    expect(m.ownedNodes).toHaveLength(3);

    const lines = m.slotValues["keystrokeCharacterMap"]!.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("[K_Q],U+025B");
    expect(lines[1]).toBe("[SHIFT K_Q],U+0190");
    expect(lines[2]).toBe("[K_C],U+0254");
  });

  it("deadkey-output rule mixed in is left alone; only S-01 rules lift", () => {
    const group: IRGroup = {
      nodeId: "group#0",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [
        s01Rule("rule#0", "K_Q", [], "ɛ"),
        {
          nodeId: "rule#1",
          context: [{ kind: "vkey", name: "K_2", modifiers: ["RALT"] }],
          output: [{ kind: "deadkey", id: 0x007e }],
        },
      ],
    };
    const ir = makeIR([group]);
    const matches = s01Recognizer.match(ir);

    expect(matches).toHaveLength(1);
    const m = matches[0]!;
    // Only the S-01 rule is owned
    expect(m.ownedNodes).toHaveLength(1);
    expect(m.ownedNodes[0]!.nodeId).toBe("rule#0");
  });

  it("rules in the deadkeys group do not match", () => {
    const group: IRGroup = {
      nodeId: "group#1",
      name: "deadkeys",
      usingKeys: false,
      readonly: false,
      rules: [
        s01Rule("rule#0", "K_Q", [], "ɛ"),
      ],
    };
    const ir = makeIR([group]);
    const matches = s01Recognizer.match(ir);
    expect(matches).toHaveLength(0);
  });

  it("lift() returns a Pattern with origin=recognized and populated slot", () => {
    const match = {
      patternId: "simple-swap#main",
      ownedNodes: [{ kind: "rule" as const, nodeId: "rule#0" }],
      slotValues: { keystrokeCharacterMap: "[K_Q],U+025B" },
    };
    const pattern = s01Recognizer.lift(match);
    expect(pattern.id).toBe("simple-swap#main");
    expect(pattern.origin).toBe("recognized");
    expect(pattern.strategyId).toBe("S-01");
    expect(pattern.questions[0]!.default).toBe("[K_Q],U+025B");
  });

  it("two non-deadkey groups produce two Patterns with distinct ids", () => {
    const groupA: IRGroup = {
      nodeId: "group#0",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [s01Rule("rule#0", "K_Q", [], "ɛ")],
    };
    const groupB: IRGroup = {
      nodeId: "group#1",
      name: "shift",
      usingKeys: true,
      readonly: false,
      rules: [s01Rule("rule#1", "K_Q", ["SHIFT"], "Ɛ")],
    };
    const ir = makeIR([groupA, groupB]);
    const matches = s01Recognizer.match(ir);

    expect(matches).toHaveLength(2);
    const ids = matches.map((m) => m.patternId);
    expect(ids).toContain("simple-swap#main");
    expect(ids).toContain("simple-swap#shift");

    const patterns = matches.map((m) => s01Recognizer.lift(m));
    const patternIds = patterns.map((p) => p.id);
    expect(patternIds).toContain("simple-swap#main");
    expect(patternIds).toContain("simple-swap#shift");
  });
});
