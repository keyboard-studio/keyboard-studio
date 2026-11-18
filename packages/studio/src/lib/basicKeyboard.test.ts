import { describe, expect, it } from "vitest";
import { diffIR, parseKmn } from "@keyboard-studio/engine";
import { editsPhysicalKeys, isBasicKeyboard, physicalCodeChanges, withoutPhysicalFixes } from "./basicKeyboard.ts";
import type { SuggestedFix } from "./consistencySuggestions.ts";

const fix = (target: "physical" | "touch" | "docs" | "mechanisms"): SuggestedFix => ({
  id: `f:${target}`,
  kind: "consistency",
  findingKey: null,
  preview: [],
  status: "pending",
  title: "t",
  action: { target, change: "add", subject: "a" },
});

describe("isBasicKeyboard", () => {
  it("matches by id prefix or by the release/basic source path", () => {
    expect(isBasicKeyboard({ id: "basic_kbdus" })).toBe(true);
    expect(isBasicKeyboard({ id: "anything", path: "release/basic/anything" })).toBe(true);
    expect(isBasicKeyboard({ id: "basic_kbdfr", path: "release/b/basic_kbdfr" })).toBe(true);
  });

  it("does not match other keyboards", () => {
    expect(isBasicKeyboard({ id: "sil_cameroon_qwerty", path: "release/sil/sil_cameroon_qwerty" })).toBe(false);
    expect(isBasicKeyboard({ id: "basicish", path: "release/basicish/basicish" })).toBe(false);
    expect(isBasicKeyboard(null)).toBe(false);
  });
});

describe("withoutPhysicalFixes", () => {
  const all = [fix("mechanisms"), fix("physical"), fix("touch"), fix("docs")];

  it("drops the fixes that edit physical keys when suppressing", () => {
    expect(all.filter(editsPhysicalKeys)).toHaveLength(2);
    expect(withoutPhysicalFixes(all, true).map((f) => f.action?.target)).toEqual(["touch", "docs"]);
  });

  it("keeps everything otherwise", () => {
    expect(withoutPhysicalFixes(all, false)).toHaveLength(4);
  });
});

describe("physicalCodeChanges", () => {
  const HEAD = `store(&VERSION) '10.0'
store(&NAME) 'b'
store(touchbase) 'ae'
store(shared) 'xy'
begin Unicode > use(main)
group(main) using keys
`;
  const BASE = `${HEAD}+ [K_A] > 'a'
+ [T_X] > 'x'
+ any(shared) + [K_Q] > 'q'
`;
  const changesOf = (edited: string) => {
    const after = parseKmn(edited, "b").ir;
    const changes = diffIR(parseKmn(BASE, "b").ir, after);
    return { changes, physical: physicalCodeChanges(changes, after) };
  };

  it("accepts rules on T_ and U_ keys and rules behind platform('touch')", () => {
    for (const rule of ["+ [T_Y] > 'y'", "+ [U_0101] > U+0101", "platform('touch') + [K_B] > 'β'", "if(&platform = 'touch') + [K_C] > 'ç'"]) {
      const { changes, physical } = changesOf(`${BASE}${rule}\n`);
      expect(changes.length, rule).toBeGreaterThan(0);
      expect(physical, rule).toEqual([]);
    }
  });

  it("accepts changing and removing a touch rule, and a comment", () => {
    expect(changesOf(BASE.replace("+ [T_X] > 'x'", "+ [T_X] > 'z'")).physical).toEqual([]);
    expect(changesOf(BASE.replace("+ [T_X] > 'x'\n", "")).physical).toEqual([]);
    expect(changesOf(`${BASE}c a note\n`).physical).toEqual([]);
  });

  it("refuses any change to what a physical key types", () => {
    expect(changesOf(BASE.replace("+ [K_A] > 'a'", "+ [K_A] > 'b'")).physical).toHaveLength(1);
    expect(changesOf(`${BASE}+ [K_Z] > 'ʒ'\n`).physical).toHaveLength(1);
    expect(changesOf(BASE.replace("+ [K_A] > 'a'\n", "")).physical).toHaveLength(1);
    // Turning a desktop rule into a touch one still removes the desktop behaviour.
    expect(changesOf(BASE.replace("+ [K_A] > 'a'", "platform('touch') + [K_A] > 'a'")).physical).toHaveLength(1);
  });

  it("accepts a store only touch rules use and metadata stores; refuses one a physical rule uses and the caps stores", () => {
    expect(changesOf(`${BASE}+ [T_W] > index(touchbase, 1)\n`.replace("store(touchbase) 'ae'", "store(touchbase) 'aeo'")).physical).toEqual([]);
    expect(changesOf(BASE.replace("store(shared) 'xy'", "store(shared) 'xyz'")).physical).toHaveLength(1);
    expect(changesOf(BASE.replace("store(&NAME) 'b'", "store(&NAME) 'b'\nstore(&CasedKeys) [K_A]")).physical).toHaveLength(1);
    expect(changesOf(BASE.replace("store(&NAME) 'b'", "store(&NAME) 'b'\nstore(&KEYBOARDVERSION) '2.0'")).physical).toEqual([]);
  });
});
