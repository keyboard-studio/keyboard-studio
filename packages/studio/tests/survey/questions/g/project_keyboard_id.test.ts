// project_keyboard_id: the length boundary and the slug seed derivation.
// Fixtures (including the blank-answer code, invalid_keyboard_id), definition
// shape and the generic invariants run in
// src/survey/questions/questionModules.test.ts.
import { describe, it, expect } from "vitest";
import { validate } from "../../../../src/survey/questions/g/project_keyboard_id.ts";
// P3 fix: slugifyKeyboardId is no longer re-exported from project_keyboard_id.ts;
// import directly from @keyboard-studio/contracts (the single canonical source).
import { slugifyKeyboardId } from "@keyboard-studio/contracts";

describe("project_keyboard_id — validate() length boundary", () => {
  it("accepts a string with exactly 254 characters", () => {
    const id = "a" + "b".repeat(253);
    expect(validate(id)).toEqual({ ok: true });
  });

  it("rejects a string with 255 characters", () => {
    const r = validate("a".repeat(255));
    expect(r.ok).toBe(false);
  });
});

describe("project_keyboard_id — slugifyKeyboardId integration (seed derivation)", () => {
  it("derives ewondo from Ewondo", () => {
    expect(slugifyKeyboardId("Ewondo")).toBe("ewondo");
  });

  it("derives hausa_qwerty from Hausa (QWERTY)", () => {
    // Trailing underscore from the closing paren is stripped by step 6.
    expect(slugifyKeyboardId("Hausa (QWERTY)")).toBe("hausa_qwerty");
  });

  it("produces a slug that passes validateKeyboardId for typical names", () => {
    const slug = slugifyKeyboardId("Bafut Keyboard");
    expect(validate(slug)).toEqual({ ok: true });
  });

  it("produces empty string for an all-digit name", () => {
    expect(slugifyKeyboardId("123")).toBe("");
  });
});
