import { describe, it, expect } from "vitest";
import { deriveConvenienceFlags } from "./convenienceFlags.ts";

describe("deriveConvenienceFlags (spec 079 US3 T079) — structurally always empty", () => {
  it("returns no flags, regardless of arguments (see module header)", () => {
    expect(deriveConvenienceFlags()).toEqual([]);
  });
});
