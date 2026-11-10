import { describe, it, expect } from "vitest";
import { minimalTagOf } from "../../langtags/index.js";

describe("minimalTagOf keeps private use and extensions", () => {
  it("keeps a private-use tail whole", () => {
    expect(minimalTagOf("en-US-x-twain")).toMatch(/-x-twain$/);
  });

  it("keeps a Unicode extension tail whole", () => {
    expect(minimalTagOf("fr-u-co-phonebk")).toBe("fr-u-co-phonebk");
  });

  it("still minimises a tag with no singleton tail", () => {
    expect(minimalTagOf("en-Latn-US")).toBe("en");
  });
});
