import { describe, it, expect } from "vitest";
import { checkDeprecatedNumericFormats } from "./check-numeric-formats.js";

const PATH = "source/demo.kmn";

describe("checkDeprecatedNumericFormats (7.25)", () => {
  it("passes modern U+NNNN notation", () => {
    const { findings } = checkDeprecatedNumericFormats(
      "store(&NAME) 'Demo'\nbegin Unicode > use(main)\ngroup(main) using keys\n+ 'a' > U+0061\n",
      PATH,
    );
    expect(findings).toEqual([]);
  });

  it("flags decimal d### codes", () => {
    const { findings } = checkDeprecatedNumericFormats(
      "store(punct) \".,:;'\\\\/!?\" d34\n",
      PATH,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_DEPRECATED_NUMERIC_FORMAT");
    expect(findings[0]!.message).toContain("line 1");
    expect(findings[0]!.message).toContain("d34");
  });

  it("flags hex x### codes", () => {
    const { findings } = checkDeprecatedNumericFormats(
      "store(x) xff\n+ 'a' > x41\n",
      PATH,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("line 1 (xff)");
    expect(findings[0]!.message).toContain("line 2 (x41)");
  });

  it("ignores codes inside strings, comments and dk()", () => {
    const { findings } = checkDeprecatedNumericFormats(
      "store(s) 'd34 xff'\nc d65 in a comment\n+ [K_A] > dk(1)\n",
      PATH,
    );
    expect(findings).toEqual([]);
  });

  it("does not flag 0x-prefixed hex", () => {
    // The x in 0x41 is glued to the 0, so \\b blocks the match.
    const { findings } = checkDeprecatedNumericFormats("store(s) 0x41\n", PATH);
    expect(findings).toEqual([]);
  });
});
