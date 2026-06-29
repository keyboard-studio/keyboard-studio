import { describe, it, expect } from "vitest";
import { validate, fixtures, definition } from "../../../../src/survey/questions/g/project_display_name.ts";

describe("project_display_name — validate() valid fixtures", () => {
  for (const { value, note } of fixtures.valid) {
    it(`accepts ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(validate(value)).toEqual({ ok: true });
    });
  }
});

describe("project_display_name — validate() invalid fixtures", () => {
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

describe("project_display_name — validate() edge cases", () => {
  it("rejects undefined", () => {
    const r = validate(undefined);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("required");
  });

  it("rejects whitespace-only string", () => {
    const r = validate("   ");
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("required");
  });

  it("accepts a non-ASCII display name", () => {
    expect(validate("Ghomálá'")).toEqual({ ok: true });
  });
});

describe("project_display_name — definition shape", () => {
  it("type is text", () => {
    expect(definition.type).toBe("text");
  });

  it("required is true", () => {
    expect(definition.required).toBe(true);
  });

  it("next is project_keyboard_id", () => {
    expect(definition.next).toBe("project_keyboard_id");
  });
});
