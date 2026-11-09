import { describe, it, expect } from "vitest";
import { minimalLocale } from "./document.js";

describe("minimalLocale keeps private use and extensions", () => {
  it("keeps a private-use tail whole", () => {
    expect(minimalLocale("en-US-x-twain")).toMatch(/-x-twain$/);
  });

  it("keeps a Unicode extension tail whole", () => {
    expect(minimalLocale("fr-u-co-phonebk")).toBe("fr-u-co-phonebk");
  });

  it("still minimises a tag with no singleton tail", () => {
    expect(minimalLocale("en-Latn-US")).toBe("en");
  });
});
