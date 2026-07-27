// extractMechanismHostKey tests (spec 035 review-gate item 3).
//
// Locks the four recognized pattern/strategy shapes shared by TouchGallery's
// suggestion useMemo and deriveDesktopModifications, plus the
// unrecognized-pattern -> undefined case.

import { describe, it, expect } from "vitest";
import type { MechanismRef } from "@keyboard-studio/contracts";
import { extractMechanismHostKey } from "./extractMechanismHostKey.js";

describe("extractMechanismHostKey", () => {
  it("simple_swap / S-01 -> replace, hostKey from the kmnRules vkey", () => {
    const m: MechanismRef = {
      patternId: "simple_swap",
      strategyId: "S-01",
      slotValues: { kmnRules: "+ [K_X] > U+0078" },
    };

    expect(extractMechanismHostKey(m)).toEqual({ kind: "replace", hostKey: "K_X" });
  });

  it("simple_swap with a kmnRules value that doesn't match -> replace with empty hostKey", () => {
    const m: MechanismRef = {
      patternId: "simple_swap",
      slotValues: { kmnRules: "no vkey here" },
    };

    expect(extractMechanismHostKey(m)).toEqual({ kind: "replace", hostKey: "" });
  });

  it("deadkey_single_tap / S-02 -> longpress, hostKey from the first baseLetters letter", () => {
    const m: MechanismRef = {
      patternId: "deadkey_single_tap",
      strategyId: "S-02",
      slotValues: { baseLetters: "a" },
    };

    expect(extractMechanismHostKey(m)).toEqual({ kind: "longpress", hostKey: "K_A" });
  });

  it("deadkey_single_tap with a non-letter baseLetters value -> longpress with empty hostKey", () => {
    const m: MechanismRef = {
      patternId: "deadkey_single_tap",
      slotValues: { baseLetters: "5" },
    };

    expect(extractMechanismHostKey(m)).toEqual({ kind: "longpress", hostKey: "" });
  });

  it("modifier_as_layer_switch / S-08 -> longpress, hostKey from the altgrKeyList vkey", () => {
    const m: MechanismRef = {
      patternId: "modifier_as_layer_switch",
      strategyId: "S-08",
      slotValues: { altgrKeyList: "[SHIFT CTRL RALT K_4]" },
    };

    expect(extractMechanismHostKey(m)).toEqual({ kind: "longpress", hostKey: "K_4" });
  });

  it("multi_char_sequence / S-03 -> longpress, hostKey from the first firstLetterOut letter", () => {
    const m: MechanismRef = {
      patternId: "multi_char_sequence",
      strategyId: "S-03",
      slotValues: { firstLetterOut: "th" },
    };

    expect(extractMechanismHostKey(m)).toEqual({ kind: "longpress", hostKey: "K_T" });
  });

  it("multi_char_sequence with a non-letter firstLetterOut value -> longpress with empty hostKey", () => {
    const m: MechanismRef = {
      patternId: "multi_char_sequence",
      slotValues: { firstLetterOut: "9" },
    };

    expect(extractMechanismHostKey(m)).toEqual({ kind: "longpress", hostKey: "" });
  });

  it("an unrecognized pattern/strategy -> undefined", () => {
    const m: MechanismRef = { patternId: "touch_inherited" };

    expect(extractMechanismHostKey(m)).toBeUndefined();
  });
});
