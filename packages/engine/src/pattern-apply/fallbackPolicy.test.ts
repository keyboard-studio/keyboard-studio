// Per-class dispositions for carved combinations (spec 109 FR-015).

import { describe, it, expect } from "vitest";
import { uniformFallbackPolicy, type FallbackPolicy } from "@keyboard-studio/contracts";
import { charRule, charStore, irGroup, makeTestIR, vkeyRule } from "@keyboard-studio/contracts/fixtures";
import {
  dispositionsForFallbackPolicy,
  isSwallowedByPolicy,
  positionsOfCombo,
  type Leak,
} from "./fallbackPolicy.js";

const LETTERS_ONLY: FallbackPolicy = { letters: "swallow", digits: "pass-through", punctuation: "pass-through" };

function leak(key: string, modifiers: string, char: string, leakClass: "letters" | "digits" | "punctuation", baseKeyboard = "us"): Leak {
  return { position: { key, modifiers }, baseKeyboard, outcome: { kind: "char", char, leakClass } };
}

const ir = () =>
  makeTestIR({
    stores: [
      { nodeId: "s#k", name: "k", isSystem: false, items: [{ kind: "vkey", name: "K_A" }, { kind: "raw", text: "[SHIFT K_B]" }] },
      charStore({ nodeId: "s#c", name: "c", chars: ["x", "y"] }),
    ],
    groups: [
      irGroup({
        nodeId: "group#main",
        rules: [
          vkeyRule({ nodeId: "one", vkey: "K_1", output: "!" }),
          vkeyRule({ nodeId: "q", vkey: "K_Q", output: "q" }),
          charRule({
            nodeId: "pair",
            context: [{ kind: "raw", text: "+" }, { kind: "any", storeRef: "k" }],
            output: [{ kind: "index", storeRef: "c", offset: 2 }],
          }),
        ],
      }),
    ],
  });

describe("isSwallowedByPolicy", () => {
  it("a position is swallowed when any picked keyboard's leak is in a Do nothing class", () => {
    expect(isSwallowedByPolicy(LETTERS_ONLY, [{ kind: "char", char: "1", leakClass: "digits" }])).toBe(false);
    expect(
      isSwallowedByPolicy(LETTERS_ONLY, [
        { kind: "char", char: "1", leakClass: "digits" },
        { kind: "char", char: "q", leakClass: "letters" },
      ]),
    ).toBe(true);
  });
});

describe("positionsOfCombo", () => {
  it("places a rule, a key-store slot and a character-store slot", () => {
    expect(positionsOfCombo(ir(), "q")).toEqual([{ key: "K_Q", modifiers: "" }]);
    expect(positionsOfCombo(ir(), "s#k#1")).toEqual([{ key: "K_B", modifiers: "SHIFT" }]);
    expect(positionsOfCombo(ir(), "s#c#1")).toEqual([{ key: "K_B", modifiers: "SHIFT" }]);
    expect(positionsOfCombo(ir(), "nope")).toEqual([]);
  });
});

describe("dispositionsForFallbackPolicy per class", () => {
  const leaks: Leak[] = [
    leak("K_1", "", "1", "digits"),
    leak("K_1", "", "&", "punctuation", "basic_kbdfr"),
    leak("K_Q", "", "q", "letters"),
    leak("K_B", "SHIFT", "B", "letters"),
  ];
  const run = (policy: FallbackPolicy) =>
    Object.fromEntries(
      dispositionsForFallbackPolicy(policy, ["one", "q", "s#c#1"], { ir: ir(), leaks }).map((d) => [d.comboId, d.disposition]),
    );

  it("each carved combination takes the class of its leak", () => {
    expect(run(LETTERS_ONLY)).toEqual({ one: "allow-host", q: "block", "s#c#1": "block" });
  });

  it("the position class can differ between picked keyboards: any picked wins", () => {
    const punct: FallbackPolicy = { letters: "pass-through", digits: "pass-through", punctuation: "swallow" };
    expect(run(punct).one).toBe("block"); // French AZERTY types & there
    expect(run(punct).q).toBe("allow-host");
  });

  it("a uniform per-class policy reproduces the single-value expansion", () => {
    for (const d of ["swallow", "pass-through"] as const) {
      expect(dispositionsForFallbackPolicy(uniformFallbackPolicy(d), ["one", "q"], { ir: ir(), leaks })).toEqual(
        dispositionsForFallbackPolicy(d, ["one", "q"]),
      );
    }
  });

  it("a combination with no leak data is swallowed while any class swallows", () => {
    const out = dispositionsForFallbackPolicy(LETTERS_ONLY, ["one"], { ir: ir(), leaks: [] });
    expect(out[0]?.disposition).toBe("block");
  });
});
