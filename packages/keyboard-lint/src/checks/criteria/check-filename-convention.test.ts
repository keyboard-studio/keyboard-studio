import { describe, it, expect } from "vitest";
import { checkFilenameConvention } from "./check-filename-convention.js";

describe("checkFilenameConvention (1.15)", () => {
  it("passes a clean file list", () => {
    const { findings, verified } = checkFilenameConvention([
      "source/demo.kmn",
      "source/demo.kps",
      "source/readme.htm",
      "source/welcome.htm",
      "source/my-font.ttf",
      "HISTORY.md",
      "LICENSE.md",
      "README.md",
    ]);
    expect(findings).toEqual([]);
    expect(verified[0]).toContain("8 file(s)");
  });

  it("flags an uppercase extension", () => {
    const { findings } = checkFilenameConvention([
      "source/demo.kmn",
      "source/image.PNG",
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_FILENAME_CONVENTION");
    expect(findings[0]!.message).toContain("image.PNG");
    expect(findings[0]!.message).not.toContain("demo.kmn");
  });

  it("flags non-ASCII and space characters in names", () => {
    const { findings } = checkFilenameConvention([
      "source/BurushaskiQuwatzYásin-Regular.ttf",
      "source/my file.txt",
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("BurushaskiQuwatzYásin-Regular.ttf");
    expect(findings[0]!.message).toContain("my file.txt");
  });

  it("allows -, _, + and . in names, and files without extensions", () => {
    const { findings } = checkFilenameConvention([
      "source/my-key_v1+2.kmn",
      "LICENSE",
    ]);
    expect(findings).toEqual([]);
  });

  it("passes an empty file list", () => {
    const { findings } = checkFilenameConvention([]);
    expect(findings).toEqual([]);
  });
});
