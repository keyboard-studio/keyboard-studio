// SC-007 and the per-class proposal rules (spec 109 FR-020).

import { describe, it, expect } from "vitest";
import type { KeyboardIR, LeakClass } from "@keyboard-studio/contracts";
import { charRule, irGroup, makeTestIR, vkeyRule } from "@keyboard-studio/contracts/fixtures";
import { classifyChar, proposeFallbackPolicy } from "./fallbackProposal.js";
import type { Leak } from "./fallbackPolicy.js";

/** A US English base keyboard's leaks for a handful of keys, one per class and then some. */
function usLeaks(): Leak[] {
  const cells: Array<[string, string, string, LeakClass]> = [
    ["K_Q", "", "q", "letters"],
    ["K_W", "", "w", "letters"],
    ["K_E", "SHIFT", "E", "letters"],
    ["K_1", "", "1", "digits"],
    ["K_2", "", "2", "digits"],
    ["K_COMMA", "", ",", "punctuation"],
    ["K_PERIOD", "", ".", "punctuation"],
  ];
  return cells.map(([key, modifiers, char, leakClass]) => ({
    position: { key, modifiers },
    baseKeyboard: "us",
    outcome: { kind: "char", char, leakClass },
  }));
}

function keyboard(outputs: string[]): KeyboardIR {
  const rules = outputs.map((o, i) =>
    vkeyRule({ nodeId: `r${i}`, vkey: `K_${String.fromCharCode(65 + i)}`, output: o }),
  );
  return makeTestIR({ groups: [irGroup({ nodeId: "group#main", rules })] });
}

const byClass = (ps: ReturnType<typeof proposeFallbackPolicy>) =>
  Object.fromEntries(ps.map((p) => [p.class, p]));

describe("classifyChar", () => {
  it("classes by General Category", () => {
    expect(classifyChar("q")).toBe("letters");
    expect(classifyChar("́")).toBe("letters"); // combining acute: a mark a base keyboard types
    expect(classifyChar("7")).toBe("digits");
    expect(classifyChar("٣")).toBe("digits");
    expect(classifyChar(",")).toBe("punctuation");
    expect(classifyChar("$")).toBe("punctuation");
    expect(classifyChar(" ")).toBeNull();
  });
});

describe("proposeFallbackPolicy (SC-007, US English base keyboard)", () => {
  it("Korean keyboard: letters Do nothing, naming class, base keyboard and character", () => {
    const ps = proposeFallbackPolicy({
      ir: keyboard(["ᄀ", "ᅡ"]),
      targetScript: "Hang",
      leaks: usLeaks(),
    });
    expect(ps.map((p) => p.class)).toEqual(["letters", "digits", "punctuation"]);
    const m = byClass(ps);
    expect(m.letters?.disposition).toBe("swallow");
    expect(m.letters?.evidence).toEqual({ baseKeyboard: "us", char: "q", count: 3 });
    expect(m.digits?.disposition).toBe("pass-through");
    expect(m.punctuation?.disposition).toBe("pass-through");
  });

  it("French Latin-script overlay: pass-through for all three classes", () => {
    const ps = proposeFallbackPolicy({
      ir: keyboard(["é", "è", "1"]),
      targetScript: "Latn",
      leaks: usLeaks(),
    });
    expect(ps.every((p) => p.disposition === "pass-through")).toBe(true);
    // Each still names what it saw, so the author can judge it.
    expect(byClass(ps).letters?.evidence?.baseKeyboard).toBe("us");
    expect(byClass(ps).digits?.evidence?.char).toBe("1");
  });

  it("Arabic keyboard with Arabic-Indic digits and the Arabic comma: Do nothing for all three", () => {
    const ps = proposeFallbackPolicy({
      ir: keyboard(["ب", "٣", "،"]),
      targetScript: "Arab",
      leaks: usLeaks(),
    });
    const m = byClass(ps);
    expect(m.letters?.disposition).toBe("swallow");
    expect(m.digits?.disposition).toBe("swallow");
    expect(m.digits?.evidence).toMatchObject({ baseKeyboard: "us", char: "٣" });
    expect(m.punctuation?.disposition).toBe("swallow");
    expect(m.punctuation?.evidence).toMatchObject({ baseKeyboard: "us", char: "،" });
  });

  it("splits a script: Arabic letters and comma but no own digits keeps the digits", () => {
    const ps = proposeFallbackPolicy({
      ir: keyboard(["ب", "،"]),
      targetScript: "Arab",
      leaks: usLeaks(),
    });
    const m = byClass(ps);
    expect(m.letters?.disposition).toBe("swallow");
    expect(m.digits?.disposition).toBe("pass-through");
    expect(m.punctuation?.disposition).toBe("swallow");
  });

  it("mixed picks: a Cyrillic base keyboard makes a Latin-script keyboard swallow letters, naming it", () => {
    const ru: Leak = {
      position: { key: "K_Q", modifiers: "" },
      baseKeyboard: "basic_kbdru",
      outcome: { kind: "char", char: "й", leakClass: "letters" },
    };
    const ps = proposeFallbackPolicy({ ir: keyboard(["a"]), targetScript: "Latn", leaks: [...usLeaks(), ru] });
    expect(byClass(ps).letters?.disposition).toBe("swallow");
    expect(byClass(ps).letters?.evidence).toEqual({ baseKeyboard: "basic_kbdru", char: "й", count: 1 });
  });

  it("a shared combining mark never counts as a foreign letter", () => {
    const mark: Leak = {
      position: { key: "K_BKQUOTE", modifiers: "" },
      baseKeyboard: "us",
      outcome: { kind: "char", char: "́", leakClass: "letters" },
    };
    const ps = proposeFallbackPolicy({ ir: keyboard(["ᄀ"]), targetScript: "Hang", leaks: [mark] });
    expect(byClass(ps).letters?.disposition).toBe("pass-through");
  });

  it("no character data: letters take the base keyboard's catalog language script", () => {
    const unknown: Leak = {
      position: { key: "K_Q", modifiers: "" },
      baseKeyboard: "basic_kbdru",
      outcome: { kind: "unknown" },
    };
    const swallow = proposeFallbackPolicy({
      ir: keyboard(["a"]),
      targetScript: "Latn",
      leaks: [unknown],
      baseKeyboardScripts: { basic_kbdru: "Cyrl" },
    });
    expect(byClass(swallow).letters?.disposition).toBe("swallow");
    expect(byClass(swallow).letters?.evidence?.baseKeyboard).toBe("basic_kbdru");
    const keep = proposeFallbackPolicy({
      ir: keyboard(["a"]),
      targetScript: "Latn",
      leaks: [unknown],
      baseKeyboardScripts: { basic_kbdru: "Latn" },
    });
    expect(byClass(keep).letters?.disposition).toBe("pass-through");
  });

  it("an unusable target script proposes pass-through rather than guessing", () => {
    const ps = proposeFallbackPolicy({ ir: keyboard(["ᄀ"]), targetScript: "", leaks: usLeaks() });
    expect(byClass(ps).letters?.disposition).toBe("pass-through");
  });

  it("reads emitted digits from index() stores too", () => {
    const ir = makeTestIR({
      groups: [
        irGroup({
          nodeId: "group#main",
          rules: [
            charRule({
              nodeId: "r",
              context: [{ kind: "raw", text: "+" }, { kind: "any", storeRef: "k" }],
              output: [{ kind: "index", storeRef: "d", offset: 2 }],
            }),
          ],
        }),
      ],
      stores: [
        { nodeId: "s#k", name: "k", isSystem: false, items: [{ kind: "vkey", name: "K_1" }] },
        { nodeId: "s#d", name: "d", isSystem: false, items: [{ kind: "char", value: "१" }] },
      ],
    });
    const ps = proposeFallbackPolicy({ ir, targetScript: "Deva", leaks: usLeaks() });
    expect(byClass(ps).digits?.disposition).toBe("swallow");
  });
});
