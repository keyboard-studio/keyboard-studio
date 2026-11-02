import { describe, expect, it } from "vitest";
import type { ContextElement, IRRule, KeyboardIR } from "@keyboard-studio/contracts";
import { enumerateUnhandledPositions } from "./unhandledPositions.js";

function rule(nodeId: string, context: ContextElement[], output = "x"): IRRule {
  return { nodeId, context, output: [{ kind: "char", value: output }] };
}

function ir(rules: IRRule[]): KeyboardIR {
  return { nodeId: "kbd", stores: [], groups: [{ nodeId: "g", rules }] };
}

const vk = (name: string, modifiers: string[] = []): ContextElement => ({
  kind: "vkey",
  name,
  modifiers,
});

describe("enumerateUnhandledPositions", () => {
  it("lists every printable position of an empty keyboard, none layer-bound", () => {
    const out = enumerateUnhandledPositions(ir([]));
    expect(out.every((p) => !p.layerBound)).toBe(true);
    expect(out.filter((p) => p.modifiers === "")).toHaveLength(
      out.filter((p) => p.modifiers === "SHIFT").length,
    );
    expect(out.some((p) => p.key === "K_A" && p.modifiers === "")).toBe(true);
  });

  it("overlay keyboard: handled keys drop out, the rest stay, layer is bound", () => {
    const out = enumerateUnhandledPositions(
      ir([rule("r1", [{ kind: "raw", text: "+" }, vk("K_E")], "e")]),
    );
    expect(out.some((p) => p.key === "K_E" && p.modifiers === "")).toBe(false);
    const a = out.find((p) => p.key === "K_A" && p.modifiers === "");
    expect(a?.layerBound).toBe(true);
    expect(out.some((p) => p.key === "K_E" && p.modifiers === "SHIFT")).toBe(true);
  });

  it("unused layer is reported with layerBound false", () => {
    const out = enumerateUnhandledPositions(ir([rule("r1", [vk("K_E")])]));
    const shifted = out.filter((p) => p.modifiers === "SHIFT");
    expect(shifted.length).toBeGreaterThan(0);
    expect(shifted.every((p) => !p.layerBound)).toBe(true);
  });

  it("Caps layer is its own bound layer", () => {
    const out = enumerateUnhandledPositions(ir([rule("r1", [vk("K_E", ["CAPS"])])]));
    expect(out.some((p) => p.key === "K_E" && p.modifiers === "CAPS")).toBe(false);
    const q = out.find((p) => p.key === "K_Q" && p.modifiers === "CAPS");
    expect(q?.layerBound).toBe(true);
    expect(out.find((p) => p.key === "K_Q" && p.modifiers === "")?.layerBound).toBe(false);
  });

  it("deadkey-context rule binds the layer but leaves the bare key unhandled", () => {
    const out = enumerateUnhandledPositions(
      ir([
        rule("arm", [vk("K_QUOTE")], "q"),
        rule("use", [{ kind: "deadkey", id: 1 }, { kind: "raw", text: "+" }, vk("K_A")], "a"),
      ]),
    );
    expect(out.some((p) => p.key === "K_QUOTE" && p.modifiers === "")).toBe(false);
    const a = out.find((p) => p.key === "K_A" && p.modifiers === "");
    expect(a?.layerBound).toBe(true);
  });

  it("any() over a vkey store handles each listed key", () => {
    const k: KeyboardIR = {
      nodeId: "kbd",
      stores: [
        {
          nodeId: "s",
          name: "keys",
          items: [{ kind: "vkey", name: "K_A" }, { kind: "raw", text: "[SHIFT K_B]" }],
        },
      ],
      groups: [
        {
          nodeId: "g",
          rules: [
            {
              nodeId: "r",
              context: [{ kind: "raw", text: "+" }, { kind: "any", storeRef: "keys" }],
              output: [{ kind: "index", storeRef: "keys", offset: 1 }],
            },
          ],
        },
      ],
    };
    const out = enumerateUnhandledPositions(k);
    expect(out.some((p) => p.key === "K_A" && p.modifiers === "")).toBe(false);
    expect(out.some((p) => p.key === "K_B" && p.modifiers === "SHIFT")).toBe(false);
    expect(out.some((p) => p.key === "K_B" && p.modifiers === "")).toBe(true);
  });

  it("never reports frame keys, and a frame-key binding does not bind a layer", () => {
    const out = enumerateUnhandledPositions(ir([rule("r1", [vk("K_BKSP", ["SHIFT"])])]));
    const frame = ["K_BKSP", "K_ENTER", "K_TAB", "K_ESC", "K_DEL", "K_LEFT", "K_SPACE"];
    expect(out.some((p) => frame.includes(p.key))).toBe(false);
    expect(out.filter((p) => p.modifiers === "SHIFT").every((p) => !p.layerBound)).toBe(true);
  });
});
