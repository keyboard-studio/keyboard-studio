import { describe, it, expect } from "vitest";
import { recognizePatterns } from "./index.js";
import type { IRGroup, IRRule } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";

const makeIR = (groups: IRGroup[]) => makeTestIR(groups);

describe("recognizePatterns", () => {
  it("empty IR (no groups) returns empty recognizedPatterns and recognizedRatio 0", () => {
    const ir = makeIR([]);
    const { ir: out, recognizedRatio } = recognizePatterns(ir);
    expect(out.recognizedPatterns).toHaveLength(0);
    // 0/0 => 0 per spec (no rules means nothing to recognize)
    expect(recognizedRatio).toBe(0);
  });

  it("IR with one group and no matching rules leaves recognizedPatterns empty", () => {
    const group: IRGroup = {
      nodeId: "group#0",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [
        {
          nodeId: "rule#0",
          // two-element context: not S-01
          context: [
            { kind: "char", value: "a" },
            { kind: "vkey", name: "K_A", modifiers: [] },
          ],
          output: [{ kind: "char", value: "b" }],
        },
      ],
    };
    const ir = makeIR([group]);
    const { ir: out, recognizedRatio } = recognizePatterns(ir);
    expect(out.recognizedPatterns).toHaveLength(0);
    expect(recognizedRatio).toBe(0);
  });

  it("IR with one S-01 rule produces one Pattern with ownedNodes and ownedByPattern set", () => {
    const rule: IRRule = {
      nodeId: "rule#0",
      context: [{ kind: "vkey", name: "K_Q", modifiers: [] }],
      output: [{ kind: "char", value: "ɛ" }],
    };
    const group: IRGroup = {
      nodeId: "group#0",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [rule],
    };
    const ir = makeIR([group]);
    const { ir: out, recognizedRatio } = recognizePatterns(ir);

    expect(out.recognizedPatterns).toHaveLength(1);
    const pattern = out.recognizedPatterns[0]!;
    expect(pattern.origin).toBe("recognized");
    expect(pattern.ownedNodes).toHaveLength(1);
    expect(pattern.ownedNodes?.[0]?.nodeId).toBe("rule#0");

    // ownedByPattern must be set on the covered rule (disambiguated id)
    expect(out.groups[0]!.rules[0]!.ownedByPattern).toBe("simple-swap#main");
    expect(recognizedRatio).toBe(1);
  });

  it("calling recognizePatterns twice does not duplicate patterns or change the ratio", () => {
    const rule: IRRule = {
      nodeId: "rule#0",
      context: [{ kind: "vkey", name: "K_Q", modifiers: [] }],
      output: [{ kind: "char", value: "ɛ" }],
    };
    const group: IRGroup = {
      nodeId: "group#0",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [rule],
    };
    const ir = makeIR([group]);

    const { recognizedRatio: ratio1 } = recognizePatterns(ir);
    expect(ir.recognizedPatterns).toHaveLength(1);

    const { recognizedRatio: ratio2 } = recognizePatterns(ir);
    // Second call must not push more patterns
    expect(ir.recognizedPatterns).toHaveLength(1);
    // Ratio must be identical
    expect(ratio2).toBe(ratio1);
  });
});
