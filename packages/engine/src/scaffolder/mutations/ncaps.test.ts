/**
 * Tests for mutateStripNcaps.
 */

import { describe, it, expect } from "vitest";
import type { KeyboardIR, IRGroup, IRRule } from "@keyboard-studio/contracts";
import { mutateStripNcaps } from "./ncaps.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIR(groups: IRGroup[]): KeyboardIR {
  return {
    origin: "scaffolded",
    header: {
      keyboardId: "test",
      name: "Test",
      bcp47: [],
      copyright: "",
      version: "1.0",
      targets: [],
      storeDirectives: [],
    },
    stores: [],
    groups,
    comments: [],
    raw: [],
    recognizedPatterns: [],
  };
}

function makeRule(modifiers: string[], name = "K_A"): IRRule {
  return {
    nodeId: "rule#0",
    context: [{ kind: "vkey", name, modifiers }],
    output: [{ kind: "char", value: "a" }],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("mutateStripNcaps", () => {
  it("removes NCAPS from a vkey modifier list", () => {
    const ir = makeIR([
      {
        nodeId: "group#0",
        name: "main",
        usingKeys: true,
        rules: [makeRule(["NCAPS"])],
        readonly: false,
      },
    ]);
    const result = mutateStripNcaps(ir);
    const el = result.groups[0].rules[0].context[0];
    expect(el.kind).toBe("vkey");
    if (el.kind === "vkey") {
      expect(el.modifiers).toEqual([]);
    }
  });

  it("removes NCAPS from multi-modifier list, keeps others", () => {
    const ir = makeIR([
      {
        nodeId: "group#0",
        name: "main",
        usingKeys: true,
        rules: [makeRule(["SHIFT", "NCAPS", "CTRL"])],
        readonly: false,
      },
    ]);
    const result = mutateStripNcaps(ir);
    const el = result.groups[0].rules[0].context[0];
    if (el.kind === "vkey") {
      expect(el.modifiers).toEqual(["SHIFT", "CTRL"]);
    }
  });

  it("leaves rules without NCAPS unchanged (referential equality)", () => {
    const rule = makeRule(["SHIFT"]);
    const ir = makeIR([
      {
        nodeId: "group#0",
        name: "main",
        usingKeys: true,
        rules: [rule],
        readonly: false,
      },
    ]);
    const result = mutateStripNcaps(ir);
    expect(result.groups[0].rules[0]).toBe(rule);
  });

  it("does not remove modifiers named NCAPS-adjacent but distinct", () => {
    const ir = makeIR([
      {
        nodeId: "group#0",
        name: "main",
        usingKeys: true,
        rules: [makeRule(["NCAPS2", "CAPS"])],
        readonly: false,
      },
    ]);
    const result = mutateStripNcaps(ir);
    const el = result.groups[0].rules[0].context[0];
    if (el.kind === "vkey") {
      expect(el.modifiers).toEqual(["NCAPS2", "CAPS"]);
    }
  });

  it("leaves non-vkey context elements unchanged", () => {
    const ir = makeIR([
      {
        nodeId: "group#0",
        name: "main",
        usingKeys: true,
        rules: [
          {
            nodeId: "rule#0",
            context: [{ kind: "char", value: "a" }],
            output: [{ kind: "char", value: "b" }],
          },
        ],
        readonly: false,
      },
    ]);
    const result = mutateStripNcaps(ir);
    expect(result.groups[0].rules[0].context[0]).toEqual({ kind: "char", value: "a" });
  });

  it("does not mutate input in-place", () => {
    const original = makeIR([
      {
        nodeId: "group#0",
        name: "main",
        usingKeys: true,
        rules: [makeRule(["NCAPS"])],
        readonly: false,
      },
    ]);
    const originalModifiers = [...(original.groups[0].rules[0].context[0] as { modifiers: string[] }).modifiers];
    mutateStripNcaps(original);
    const after = (original.groups[0].rules[0].context[0] as { modifiers: string[] }).modifiers;
    expect(after).toEqual(originalModifiers);
  });
});
