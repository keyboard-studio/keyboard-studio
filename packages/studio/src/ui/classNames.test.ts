// Unit tests for the mergeClassNames helper (classNames.ts, #536).

import { describe, it, expect } from "vitest";
import { mergeClassNames } from "./classNames.ts";

describe("mergeClassNames", () => {
  it("returns the base alone when no className is given", () => {
    expect(mergeClassNames("ks-control ks-focus-ring")).toBe("ks-control ks-focus-ring");
  });

  it("returns the base alone when className is undefined", () => {
    expect(mergeClassNames("ks-focus-ring", undefined)).toBe("ks-focus-ring");
  });

  it("returns the base alone when className is an empty string", () => {
    expect(mergeClassNames("ks-focus-ring", "")).toBe("ks-focus-ring");
  });

  it("appends a caller className after the base", () => {
    expect(mergeClassNames("ks-focus-ring", "custom")).toBe("ks-focus-ring custom");
  });

  it("keeps the base classes first", () => {
    const merged = mergeClassNames("a b", "c").split(" ");
    expect(merged).toEqual(["a", "b", "c"]);
  });
});
