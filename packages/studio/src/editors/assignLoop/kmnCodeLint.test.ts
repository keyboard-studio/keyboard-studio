// kmnCodeLint tests — parse-error mapping for the Code tab.

import { describe, expect, it } from "vitest";
import { kmnErrorPosition, lintKmnCodeText } from "./kmnCodeLint.ts";

describe("kmnErrorPosition", () => {
  it("extracts line and column", () => {
    expect(kmnErrorPosition("Malformed rule at line 12:3: + [a]")).toEqual({
      line: 12,
      column: 3,
    });
  });

  it("extracts line-only positions", () => {
    expect(kmnErrorPosition("Malformed store declaration at line 5: foo")).toEqual({
      line: 5,
      column: 1,
    });
  });

  it("returns null when no position is present", () => {
    expect(kmnErrorPosition("Something went wrong")).toBeNull();
  });
});

describe("lintKmnCodeText", () => {
  const okParse = () => ({ ir: {}, opaqueFeatures: [] });

  it("passes when parse succeeds", () => {
    const result = lintKmnCodeText("store(&NAME) 'x'\n", okParse);
    expect(result.parsed).toBe(true);
    expect(result.markers).toHaveLength(0);
  });

  it("maps a positioned parse error to a marker", () => {
    const badParse = () => {
      throw new Error("Malformed rule at line 4:7: + [a]");
    };
    const result = lintKmnCodeText("bad", badParse);
    expect(result.parsed).toBe(false);
    expect(result.markers).toHaveLength(1);
    const m = result.markers[0]!;
    expect(m.severity).toBe("error");
    expect(m.code).toBe("KMN_SYNTAX");
    expect(m.startLineNumber).toBe(4);
    expect(m.startColumn).toBe(7);
  });

  it("maps a position-less error to a file-level marker", () => {
    const badParse = () => {
      throw new Error("Keyboard id mismatch");
    };
    const result = lintKmnCodeText("bad", badParse);
    expect(result.parsed).toBe(false);
    expect(result.markers[0]?.startLineNumber).toBe(1);
  });

  it("handles non-Error throws", () => {
    const badParse = () => {
      throw "string failure";
    };
    const result = lintKmnCodeText("bad", badParse);
    expect(result.parsed).toBe(false);
    expect(result.markers[0]?.message).toBe("string failure");
  });
});
