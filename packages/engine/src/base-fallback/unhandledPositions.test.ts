import { describe, expect, it } from "vitest";
import { parse } from "../codec/index.js";
import { enumerateUnhandledPositions } from "./unhandledPositions.js";

const HEAD = `store(&NAME) 'x'
begin Unicode > use(main)
store(keys) [K_Q] [SHIFT K_W]
group(main) using keys
`;

function unhandled(body: string, vkeys: string[]): string[] {
  const { ir } = parse(HEAD + body, "t");
  return enumerateUnhandledPositions(ir, vkeys).map((p) => `${p.vkey}/${p.state}`);
}

describe("enumerateUnhandledPositions (spec 109 FR-040)", () => {
  it("lists every state of an untouched key", () => {
    expect(unhandled("+ [K_A] > 'x'\n", ["K_B"])).toEqual(["K_B/none", "K_B/shift", "K_B/altgr", "K_B/shiftAltgr"]);
  });

  it("treats a rule as covering only its own state", () => {
    const u = unhandled("+ [K_A] > 'x'\n+ [SHIFT K_A] > 'X'\n+ [RALT K_A] > 'y'\n", ["K_A"]);
    expect(u).toEqual(["K_A/shiftAltgr"]);
  });

  it("counts LCTRL RALT as AltGr", () => {
    expect(unhandled("+ [LCTRL RALT K_A] > 'x'\n", ["K_A"])).not.toContain("K_A/altgr");
  });

  it("resolves character keystrokes through the US layout", () => {
    expect(unhandled("+ 'a' > 'x'\n+ 'A' > 'y'\n", ["K_A"])).toEqual(["K_A/altgr", "K_A/shiftAltgr"]);
  });

  it("expands any() over virtual keys in keystroke position", () => {
    expect(unhandled("+ any(keys) > 'x'\n", ["K_Q", "K_W"])).toEqual([
      "K_Q/shift", "K_Q/altgr", "K_Q/shiftAltgr",
      "K_W/none", "K_W/altgr", "K_W/shiftAltgr",
    ]);
  });

  it("is independent of the base keyboard: it takes only the IR and the positions", () => {
    expect(unhandled("", [])).toEqual([]);
  });
});
