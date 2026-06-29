import { describe, it, expect } from "vitest";
import { validate, fixtures, definition, slugifyKeyboardId } from "../../../../src/survey/questions/g/project_keyboard_id.ts";

describe("project_keyboard_id — validate() valid fixtures", () => {
  for (const { value, note } of fixtures.valid) {
    it(`accepts ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(validate(value)).toEqual({ ok: true });
    });
  }
});

describe("project_keyboard_id — validate() invalid fixtures", () => {
  for (const { value, note, expectedCode } of fixtures.invalid) {
    it(`rejects ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      const result = validate(value);
      expect(result.ok).toBe(false);
      if (expectedCode !== undefined && result.ok === false) {
        expect(result.code).toBe(expectedCode);
      }
    });
  }
});

describe("project_keyboard_id — validate() edge cases", () => {
  it("rejects undefined", () => {
    const r = validate(undefined);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("invalid_keyboard_id");
  });

  it("rejects empty string", () => {
    const r = validate("");
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("invalid_keyboard_id");
  });

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

describe("project_keyboard_id — definition shape", () => {
  it("type is text", () => {
    expect(definition.type).toBe("text");
  });

  it("required is true", () => {
    expect(definition.required).toBe(true);
  });

  it("next is null (terminal question in project_name flow)", () => {
    expect(definition.next).toBeNull();
  });
});
