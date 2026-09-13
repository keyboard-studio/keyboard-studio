import { describe, it, expect } from "vitest";
import {
  definition,
  validate,
  fixtures,
  bulletsDefinition,
  bulletsFixtures,
  HISTORY_ENTRY_ACTIONS,
} from "../../../../src/survey/questions/f/pf_history_entry.ts";

describe("pf_history_entry — definition", () => {
  it("has correct id and a conditional next: edit branches to the bullets screen, everything else falls through to the opt-in gate", () => {
    expect(definition.id).toBe("pf_history_entry");
    expect(Array.isArray(definition.next)).toBe(true);
    const rules = definition.next as ReadonlyArray<{ goto: string; default?: boolean }>;
    expect(rules.map((r) => r.goto)).toContain("pf_history_entry_bullets");
    expect(rules.find((r) => r.default === true)?.goto).toBe("pf_more_detail_gate");
  });

  it("offers exactly the three proposal actions (spec 076 FR-011)", () => {
    expect([...HISTORY_ENTRY_ACTIONS]).toEqual(["confirm", "edit", "dismiss"]);
  });
});

describe("pf_history_entry — validate() valid fixtures", () => {
  for (const { value, note } of fixtures.valid) {
    it(`accepts ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(validate(value)).toEqual({ ok: true });
    });
  }
});

describe("pf_history_entry — validate() invalid fixtures", () => {
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

describe("pf_history_entry_bullets — the edit-branch companion", () => {
  it("has its own id and rejoins the flow at the opt-in gate", () => {
    expect(bulletsDefinition.id).toBe("pf_history_entry_bullets");
    expect(bulletsDefinition.next).toBe("pf_more_detail_gate");
  });

  it("every valid fixture is a string or omitted", () => {
    for (const { value } of bulletsFixtures.valid) {
      expect(
        value === undefined || typeof value === "string",
        `fixture ${JSON.stringify(value)} is neither a string nor undefined`,
      ).toBe(true);
    }
  });
});
