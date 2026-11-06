import { describe, expect, it } from "vitest";
import { editsPhysicalKeys, isBasicKeyboard, withoutPhysicalFixes } from "./basicKeyboard.ts";
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
