import { describe, expect, it } from "vitest";
import { isOpenMode } from "./openMode";

describe("isOpenMode", () => {
  it("is true only for adapt-existing", () => {
    expect(isOpenMode("adapt-existing")).toBe(true);
    expect(isOpenMode("new-from-base")).toBe(false);
    expect(isOpenMode(null)).toBe(false);
    expect(isOpenMode(undefined)).toBe(false);
  });
});
