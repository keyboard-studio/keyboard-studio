// isContextReachable (spec 113 T116, FR-029a): can some listed layer type the characters (and
// deadkeys) a new "after ..." context is made of?

import { describe, expect, it } from "vitest";
import type { KeyboardIR, LayoutContext } from "@keyboard-studio/contracts";
import { parse } from "../codec/parse.js";
import { isContextReachable } from "./isContextReachable.js";

const HEAD = `store(&VERSION) '10.0'
store(&NAME) 'T'
begin Unicode > use(main)
group(main) using keys
`;

function irOf(rules: string): KeyboardIR {
  return parse(HEAD + rules + "\n", "t").ir;
}

const text = (s: string): LayoutContext => [{ kind: "text", text: s }];

describe("isContextReachable", () => {
  const ir = irOf(
    ["+ [K_N] > 'n'", "+ [K_G] > 'g'", "+ [SHIFT K_N] > 'N'", "+ [K_D] > dk(0001)", "+ [RALT K_E] > 'ə'", "'n' + [K_G] > 'ŋ'"].join("\n"),
  );

  it("an empty context is reachable", () => {
    expect(isContextReachable(ir, [[]], [])).toBe(true);
  });

  it("is true when listed layers type every character of the context", () => {
    expect(isContextReachable(ir, [[]], text("ng"))).toBe(true);
    expect(isContextReachable(ir, [[], ["SHIFT"]], text("nN"))).toBe(true);
  });

  it("is false when a character is typed on none of the listed layers", () => {
    expect(isContextReachable(ir, [[]], text("ə"))).toBe(false);
    expect(isContextReachable(ir, [[], ["RALT"]], text("ə"))).toBe(true);
  });

  it("an unhandled key counts as typing its base-keyboard character", () => {
    // No rule for K_Q: the base keyboard types q.
    expect(isContextReachable(ir, [[]], text("q"))).toBe(true);
    expect(isContextReachable(ir, [[]], text("\u014B\u0301"))).toBe(false);
  });

  it("a deadkey is reachable only when a key on a listed layer produces it", () => {
    expect(isContextReachable(ir, [[]], [{ kind: "deadkey", deadkeyId: "0001" }])).toBe(true);
    expect(isContextReachable(ir, [[]], [{ kind: "deadkey", deadkeyId: "0002" }])).toBe(false);
    expect(isContextReachable(ir, [[]], [{ kind: "text", text: "n" }, { kind: "deadkey", deadkeyId: "0001" }])).toBe(true);
  });

  it("a character a contextual row produces is reachable by typing that row", () => {
    expect(isContextReachable(ir, [[]], text("ŋ"))).toBe(true);
  });
});
