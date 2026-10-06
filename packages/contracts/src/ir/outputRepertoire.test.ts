import { describe, it, expect } from "vitest";
import { buildOutputRepertoire } from "./outputRepertoire.js";
import { makeTestIR } from "../fixtures/keyboard-ir.js";
import { charRule, charStore, irGroup, touchKey, touchLayout, vkeyRule } from "../fixtures/ir-builders.js";
import type { ContextElement, IRRule, OutputElement, RawKmnFragment } from "../keyboard-ir.js";

const DOT = "\u0323";
const ACUTE = "\u0301";
const GRAVE = "\u0300";
const PLUS: ContextElement = { kind: "raw", text: "+" };

function ruleOf(context: ContextElement[], output: OutputElement[], nodeId?: string): IRRule {
  return { nodeId: nodeId ?? `r${Math.random()}`, context, output };
}
const key = (name: string, modifiers: string[] = []): ContextElement => ({ kind: "vkey", name, modifiers });
const ch = (value: string): OutputElement => ({ kind: "char", value });

describe("buildOutputRepertoire", () => {
  it("collects char, index() and outs() outputs exactly", () => {
    const ir = makeTestIR({
      groups: [
        irGroup({
          rules: [
            vkeyRule({ vkey: "K_1", output: [ch("e"), ch(DOT), ch(ACUTE)] }),
            ruleOf([{ kind: "any", storeRef: "k" }], [{ kind: "index", storeRef: "o", offset: 1 }]),
            vkeyRule({ vkey: "K_2", output: [{ kind: "outs", storeRef: "o" }] }),
          ],
        }),
      ],
      stores: [
        charStore({ name: "k", items: [{ kind: "vkey", name: "K_3" }, { kind: "vkey", name: "K_4" }] }),
        charStore({ name: "o", chars: "xy" }),
      ],
    });
    const r = buildOutputRepertoire(ir);
    expect(r.clusters.has(`e${DOT}${ACUTE}`)).toBe(true);
    expect(r.clusters.has("x")).toBe(true);
    expect(r.clusters.has("y")).toBe(true);
    expect(r.marks).toEqual([ACUTE, DOT]);
    expect(r.unresolved).toEqual([]);
  });

  it("echoes context and context(n) in output", () => {
    const ir = makeTestIR({
      groups: [
        irGroup({
          usingKeys: false,
          rules: [
            ruleOf(
              [{ kind: "char", value: "q" }, { kind: "char", value: DOT }],
              [{ kind: "context", offset: 0 }, ch(ACUTE)],
            ),
            ruleOf(
              [{ kind: "char", value: "z" }, { kind: "char", value: GRAVE }],
              [{ kind: "context", offset: 1 }, ch(DOT)],
            ),
          ],
        }),
      ],
    });
    const r = buildOutputRepertoire(ir);
    expect(r.clusters.has(`q${DOT}${ACUTE}`)).toBe(true);
    expect(r.clusters.has(`z${DOT}`)).toBe(true);
  });

  it("unions an opaque rule's producedOutput", () => {
    const frag: RawKmnFragment = {
      nodeId: "f1",
      origin: "imported",
      sourceText: "if(opt = '1') + [K_B] > 'b' U+0301",
      reason: "save/set/reset option-store",
      producedOutput: [ch("b"), ch(ACUTE)],
    };
    const r = buildOutputRepertoire(makeTestIR({ raw: [frag] }));
    expect(r.clusters.has(`b${ACUTE}`)).toBe(true);
  });

  it("decodes touch U_ ids", () => {
    const ir = makeTestIR({
      touchLayout: touchLayout({ keys: [touchKey({ id: `U_0065_0323` })] }),
    });
    expect(buildOutputRepertoire(ir).clusters.has(`e${DOT}`)).toBe(true);
  });

  it("adds base-layout fallback only for keys with no unconditional rule", () => {
    const ir = makeTestIR({
      groups: [irGroup({ rules: [vkeyRule({ vkey: "K_A", output: "\u00e4" })] })],
    });
    const r = buildOutputRepertoire(ir);
    expect(r.clusters.has("a")).toBe(false); // K_A is bound
    expect(r.clusters.has("A")).toBe(true); // shifted K_A has no rule
    expect(r.clusters.has("b")).toBe(true);
    expect(r.bases).toContain("b");
  });

  it("keeps the fallback for keys bound only behind a deadkey or baselayout context", () => {
    const ir = makeTestIR({
      groups: [
        irGroup({
          rules: [
            ruleOf([{ kind: "deadkey", id: 1 }, PLUS, key("K_A")], [ch("á")]),
            ruleOf([{ kind: "baselayout", value: "en-US" }, PLUS, key("K_B")], [ch("ß")]),
            vkeyRule({ vkey: "K_X", output: ACUTE }),
          ],
        }),
      ],
    });
    const r = buildOutputRepertoire(ir);
    expect(r.clusters.has("a")).toBe(true);
    expect(r.clusters.has("b")).toBe(true);
    // The fallback letter plus a standalone mark key is a typed cluster.
    expect(r.clusters.has(`a${ACUTE}`)).toBe(true);
  });

  it("closes postfix rules: any(dot) + any(key) > index(dot,1) index(ac,2)", () => {
    const ir = makeTestIR({
      groups: [
        irGroup({
          rules: [
            ruleOf(
              [{ kind: "any", storeRef: "dot" }, PLUS, { kind: "any", storeRef: "key" }],
              [{ kind: "index", storeRef: "dot", offset: 1 }, { kind: "index", storeRef: "ac", offset: 2 }],
            ),
            vkeyRule({ vkey: "K_E", output: "e" }),
            vkeyRule({ vkey: "K_Z", output: DOT }),
          ],
        }),
      ],
      stores: [
        charStore({ name: "dot", chars: DOT }),
        charStore({ name: "key", items: [{ kind: "vkey", name: "K_7" }, { kind: "vkey", name: "K_8" }] }),
        charStore({ name: "ac", chars: `${ACUTE}${GRAVE}` }),
      ],
    });
    const r = buildOutputRepertoire(ir);
    expect(r.clusters.has(`e${DOT}${ACUTE}`)).toBe(true);
    expect(r.clusters.has(`e${DOT}${GRAVE}`)).toBe(true);
    expect(r.stackDepth).toBe(2);
  });

  it("bounds context-free mark appends to two stacked marks", () => {
    const ir = makeTestIR({
      groups: [
        irGroup({
          rules: [
            vkeyRule({ vkey: "K_1", output: [ch("e"), ch(DOT), ch(ACUTE), ch(GRAVE)] }), // depth 3
            vkeyRule({ vkey: "K_X", output: GRAVE }),
            vkeyRule({ vkey: "K_Z", output: ACUTE }),
          ],
        }),
      ],
    });
    const r = buildOutputRepertoire(ir);
    expect(r.stackDepth).toBe(3);
    expect(r.clusters.has(`e${GRAVE}${ACUTE}`)).toBe(true);
    expect(r.clusters.has(`e${GRAVE}${ACUTE}${GRAVE}`)).toBe(false);
  });

  it("caps stack depth at 3", () => {
    const ir = makeTestIR({
      groups: [irGroup({ rules: [vkeyRule({ vkey: "K_1", output: [ch("e"), ch(DOT), ch(ACUTE), ch(GRAVE), ch("\u0302")] })] })],
    });
    expect(buildOutputRepertoire(ir).stackDepth).toBe(3);
  });

  it("reports an opaque store without a sketch as unresolved, and resolves it with one", () => {
    const rule = ruleOf([key("K_1")], [{ kind: "index", storeRef: "grv.all", offset: 1 }]);
    const frag: RawKmnFragment = {
      nodeId: "s1",
      origin: "imported",
      sourceText: "store(grv.all) outs(base)",
      reason: "outs()",
    };
    const bare = buildOutputRepertoire(makeTestIR({ groups: [irGroup({ rules: [rule] })], raw: [frag] }));
    expect(bare.unresolved.map((u) => u.storeName)).toEqual(["grv.all"]);
    const sketched = buildOutputRepertoire(
      makeTestIR({
        groups: [irGroup({ rules: [rule] })],
        raw: [{ ...frag, storeSketch: [{ kind: "char", value: "a" }, { kind: "char", value: GRAVE }] }],
      }),
    );
    expect(sketched.unresolved).toEqual([]);
    expect(sketched.clusters.has("a")).toBe(true);
  });

  it("is independent of rule order", () => {
    const rules = [
      vkeyRule({ vkey: "K_1", output: [ch("e"), ch(DOT)] }),
      vkeyRule({ vkey: "K_2", output: ACUTE }),
      charRule({ context: "x", output: "y" }),
      ruleOf([{ kind: "char", value: "e" }, { kind: "char", value: DOT }, PLUS, key("K_3")], [ch("e"), ch(DOT), ch(GRAVE)]),
    ];
    const a = buildOutputRepertoire(makeTestIR({ groups: [irGroup({ rules })] }));
    const b = buildOutputRepertoire(makeTestIR({ groups: [irGroup({ rules: [...rules].reverse() })] }));
    expect([...a.clusters]).toEqual([...b.clusters]);
    expect(a.marks).toEqual(b.marks);
    expect(a.bases).toEqual(b.bases);
    expect(a.stackDepth).toBe(b.stackDepth);
  });
});
