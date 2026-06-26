import { describe, it, expect } from "vitest";
import { pathUtils } from "./pathUtils.js";

describe("pathUtils.normalize", () => {
  it("converts backslashes to forward slashes", () => {
    expect(pathUtils.normalize("a\\b\\c")).toBe("a/b/c");
  });

  it("resolves `.` and empty segments", () => {
    expect(pathUtils.normalize("a/./b//c/")).toBe("a/b/c");
  });

  it("resolves `..` against the preceding segment", () => {
    expect(pathUtils.normalize("a/b/../c")).toBe("a/c");
  });

  it("drops `..` that would escape the root (no leading `..` kept)", () => {
    expect(pathUtils.normalize("../../a")).toBe("a");
    expect(pathUtils.normalize("a/../../b")).toBe("b");
  });

  it("mirrors resolveKpsFontPath's source-relative font resolution", () => {
    // From release/s/sil_x/source, `..\..\` pops `source` then `sil_x`.
    expect(
      pathUtils.normalize("release/s/sil_x/source/..\\..\\shared\\fonts\\F.ttf"),
    ).toBe("release/s/shared/fonts/F.ttf");
  });
});
