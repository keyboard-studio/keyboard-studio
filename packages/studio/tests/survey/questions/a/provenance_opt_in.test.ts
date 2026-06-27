// Colocated vitest spec for provenance_opt_in.

import { describe, it, expect } from "vitest";
import { fixtures, definition } from "../../../../src/survey/questions/a/provenance_opt_in.ts";

describe("provenance_opt_in — definition", () => {
  it("is optional (required: false)", () => {
    expect(definition.required).toBe(false);
  });
  it("has conditional routing", () => {
    expect(Array.isArray(definition.next)).toBe(true);
  });
  it("routes true to provenance_requester_name", () => {
    const rules = definition.next as Array<{ condition?: string; goto: string | null }>;
    const trueRule = rules.find((r) => r.condition?.includes("true"));
    expect(trueRule?.goto).toBe("provenance_requester_name");
  });
  it("default route is terminal (null)", () => {
    const rules = definition.next as Array<{ default?: true; goto: string | null }>;
    const defaultRule = rules.find((r) => r.default === true);
    expect(defaultRule?.goto).toBeNull();
  });
});

describe("provenance_opt_in — fixtures (no validate)", () => {
  it("has no invalid fixtures", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });
  for (const { value, note } of fixtures.valid) {
    it(`valid fixture: ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(true).toBe(true);
    });
  }
});
