// Colocated vitest spec for desktop_first_notice.

import { describe, it, expect } from "vitest";
import { fixtures, definition } from "../../../../src/survey/questions/a/desktop_first_notice.ts";

describe("desktop_first_notice — definition", () => {
  it("has type notice", () => {
    expect(definition.type).toBe("notice");
  });
  it("routes to language_name_autonym", () => {
    expect(definition.next).toBe("language_name_autonym");
  });
});

describe("desktop_first_notice — fixtures (no validate)", () => {
  it("has no invalid fixtures", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });
  for (const { value, note } of fixtures.valid) {
    it(`valid fixture: ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      // No validate() on notice questions — just assert fixture is present.
      expect(true).toBe(true);
    });
  }
});
