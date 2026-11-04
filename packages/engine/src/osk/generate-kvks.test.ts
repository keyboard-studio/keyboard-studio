/**
 * Tests for the OSK-from-IR generator.
 */

import { describe, expect, it } from "vitest";
import { generateKvksFromIR } from "./generate-kvks.js";
import type { ContextElement, KeyboardIR, OutputElement } from "@keyboard-studio/contracts";

function makeIR(rules: Array<{ context: ContextElement[]; output: OutputElement[] }>): KeyboardIR {
  return {
    origin: "import",
    header: { name: "test", version: "1.0" },
    stores: [],
    groups: [
      {
        nodeId: "g1",
        name: "main",
        rules: rules.map((r, i) => ({
          nodeId: `r${i}`,
          context: r.context,
          output: r.output,
        })),
      },
    ],
    raw: [],
  } as unknown as KeyboardIR;
}

describe("generateKvksFromIR", () => {
  it("generates keys from vkey rules", () => {
    const ir = makeIR([
      {
        context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
        output: [{ kind: "char", value: "a" }],
      },
      {
        context: [{ kind: "vkey", name: "K_A", modifiers: ["SHIFT"] }],
        output: [{ kind: "char", value: "A" }],
      },
    ]);
    const kvks = generateKvksFromIR(ir, "test");
    expect(kvks.layers).toHaveLength(2);
    expect(kvks.layers[0]?.shift).toBe("");
    expect(kvks.layers[0]?.keys[0]).toMatchObject({ vkey: "K_A", label: "a", chars: "a" });
    expect(kvks.layers[1]?.shift).toBe("S");
    expect(kvks.layers[1]?.keys[0]).toMatchObject({ vkey: "K_A", label: "A", chars: "A" });
  });

  it("generates human-readable deadkey labels (never dk(...))", () => {
    const ir = makeIR([
      {
        context: [{ kind: "vkey", name: "K_E", modifiers: [] }],
        output: [{ kind: "namedDeadkey", name: "acute" }],
      },
    ]);
    const kvks = generateKvksFromIR(ir, "test");
    const label = kvks.layers[0]?.keys[0]?.label ?? "";
    expect(label).not.toMatch(/dk\(/i);
    expect(label).toBe("Acute");
  });

  it("maps CTRL/ALT modifiers to C/A shift codes", () => {
    const ir = makeIR([
      {
        context: [{ kind: "vkey", name: "K_C", modifiers: ["CTRL"] }],
        output: [{ kind: "char", value: "c" }],
      },
      {
        context: [{ kind: "vkey", name: "K_V", modifiers: ["ALT"] }],
        output: [{ kind: "char", value: "v" }],
      },
    ]);
    const kvks = generateKvksFromIR(ir, "test");
    const shifts = kvks.layers.map((l) => l.shift).sort();
    expect(shifts).toContain("C");
    expect(shifts).toContain("A");
  });

  it("first rule wins for duplicate vkey+shift", () => {
    const ir = makeIR([
      {
        context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
        output: [{ kind: "char", value: "a" }],
      },
      {
        context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
        output: [{ kind: "char", value: "x" }],
      },
    ]);
    const kvks = generateKvksFromIR(ir, "test");
    expect(kvks.layers[0]?.keys).toHaveLength(1);
    expect(kvks.layers[0]?.keys[0]?.label).toBe("a");
  });
});
