// demoSimulation.test.ts — keystroke → SimKeyInput conversion (spec 082 FR-001).

import { describe, expect, it } from "vitest";
import {
  charToDemoKey,
  codePointsOf,
  describeDelta,
  textToDemoKeys,
} from "./demoSimulation.ts";

describe("textToDemoKeys", () => {
  it("maps ASCII letters to K_ vkeys", () => {
    const keys = textToDemoKeys("ab");
    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatchObject({ vkey: "K_A", char: "a", shift: false });
    expect(keys[1]).toMatchObject({ vkey: "K_B", char: "b", shift: false });
  });

  it("marks shifted characters", () => {
    const keys = textToDemoKeys("A!");
    expect(keys[0]).toMatchObject({ vkey: "K_A", shift: true });
    expect(keys[1]).toMatchObject({ vkey: "K_1", shift: true });
  });

  it("maps non-ASCII characters to U_XXXX unicode key events", () => {
    const keys = textToDemoKeys("ŋ");
    expect(keys).toHaveLength(1);
    expect(keys[0]!.vkey).toBe("U_014B");
    expect(keys[0]!.char).toBe("ŋ");
  });

  it("handles surrogate pairs as a single key", () => {
    const keys = textToDemoKeys("𝄞");
    expect(keys).toHaveLength(1);
    expect(keys[0]!.vkey).toBe("U_1D11E");
  });
});

describe("charToDemoKey", () => {
  it("maps space to K_SPACE", () => {
    expect(charToDemoKey(" ")).toMatchObject({ vkey: "K_SPACE", char: " " });
  });
});

describe("codePointsOf", () => {
  it("formats code points as U+XXXX", () => {
    expect(codePointsOf("aŋ")).toBe("U+0061 U+014B");
  });
});

describe("describeDelta", () => {
  it("describes inserted text", () => {
    expect(describeDelta("", "a")).toContain("a");
  });

  it("describes no change with an em dash", () => {
    expect(describeDelta("a", "a")).toBe("—");
  });
});
