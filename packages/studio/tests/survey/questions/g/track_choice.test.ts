import { describe, it, expect } from "vitest";
import { validate, fixtures, definition } from "../../../../src/survey/questions/g/track_choice.ts";

describe("track_choice — validate() valid fixtures", () => {
  for (const { value, note } of fixtures.valid) {
    it(`accepts ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(validate(value)).toEqual({ ok: true });
    });
  }
});

describe("track_choice — validate() invalid fixtures", () => {
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

describe("track_choice — definition shape", () => {
  it("has two options: copy and adapt", () => {
    expect(definition.options).toHaveLength(2);
    const values = (definition.options ?? []).map((o) => o.value);
    expect(values).toContain("copy");
    expect(values).toContain("adapt");
  });

  it("type is radio", () => {
    expect(definition.type).toBe("radio");
  });

  it("required is true", () => {
    expect(definition.required).toBe(true);
  });

  it("next rules terminate the flow (both go to null)", () => {
    // Both branches end at null so PhaseTrack's onComplete fires and maps the
    // answer to handleTrackSelected — the runner itself never jumps to a
    // project_name question ID; that routing is done outside the runner.
    expect(Array.isArray(definition.next)).toBe(true);
    if (Array.isArray(definition.next)) {
      for (const rule of definition.next) {
        expect(rule.goto).toBeNull();
      }
    }
  });
});

describe("track_choice — next fork routing", () => {
  it("both copy and adapt result in null next (terminal flow)", () => {
    // The track_choice flow has exactly one question; both option values route
    // to null so the runner calls onComplete immediately on Next.
    const rules = Array.isArray(definition.next) ? definition.next : [];
    expect(rules.every((r) => r.goto === null)).toBe(true);
  });
});
