import { describe, it, expect } from "vitest";
import { joinContinuations } from "./continuation.js";

describe("joinContinuations", () => {
  it("joins a 3-line chained continuation into one logical line with a 3-entry segment map", () => {
    const tokens = joinContinuations("a\\\nb\\\nc\n");
    // Logical lines: [0] "abc" (joined from physical lines 0,1,2), [1] "" (trailing blank).
    expect(tokens[0]?.text).toBe("abc");
    expect(tokens[0]?.line).toBe(1);

    const segments = tokens[0]?.segments ?? [];
    expect(segments).toHaveLength(3);

    // Segment 0: physical line 0 ("a\"), starts the logical text at offset 0,
    // never trimmed (tokenize.ts never trims physical line 1).
    expect(segments[0]).toEqual({ physicalLine: 0, logicalStart: 0, leadingTrim: 0 });
    // Segment 1: physical line 1 ("b\"), its content ("b") starts at offset 1
    // in the joined text ("a" + "b" + "c" = "abc").
    expect(segments[1]).toEqual({ physicalLine: 1, logicalStart: 1, leadingTrim: 0 });
    // Segment 2: physical line 2 ("c"), its content starts at offset 2.
    expect(segments[2]).toEqual({ physicalLine: 2, logicalStart: 2, leadingTrim: 0 });
  });

  it("records leadingTrim for a continuation segment whose physical line has leading whitespace", () => {
    const tokens = joinContinuations("store(&VERSION) \\\n  '10.0'\n");
    const [first] = tokens;
    expect(first?.text).toBe("store(&VERSION) '10.0'");
    expect(first?.segments).toHaveLength(2);
    expect(first?.segments[0]).toEqual({ physicalLine: 0, logicalStart: 0, leadingTrim: 0 });
    // "  '10.0'" has 2 leading spaces trimmed; its content starts right after
    // "store(&VERSION) " (16 chars) in the joined text.
    expect(first?.segments[1]).toEqual({ physicalLine: 1, logicalStart: 16, leadingTrim: 2 });
  });

  it("a `\\` inside a trailing `c` comment does NOT join the next line", () => {
    // Trailing "\n" produces a final blank logical line — 3 entries total.
    const tokens = joinContinuations("+ 'a' > 'b' c trailing note \\\nstore(kept) 'x'\n");
    expect(tokens).toHaveLength(3);
    expect(tokens[0]?.text).toBe("+ 'a' > 'b' c trailing note \\");
    expect(tokens[0]?.segments).toHaveLength(1);
    expect(tokens[1]?.text).toBe("store(kept) 'x'");
    expect(tokens[1]?.line).toBe(2);
    expect(tokens[1]?.segments).toEqual([{ physicalLine: 1, logicalStart: 0, leadingTrim: 0 }]);
  });

  it("a `\\` inside a full-line `c` comment does NOT join the next line", () => {
    // Trailing "\n" produces a final blank logical line — 3 entries total.
    const tokens = joinContinuations("c \\\nstore(specialO) 'abc'\n");
    expect(tokens).toHaveLength(3);
    expect(tokens[0]?.text).toBe("c \\");
    expect(tokens[0]?.segments).toHaveLength(1);
    expect(tokens[1]?.text).toBe("store(specialO) 'abc'");
    expect(tokens[1]?.segments).toHaveLength(1);
  });

  it("a single physical line with no continuation has exactly one segment", () => {
    const tokens = joinContinuations('store(s) "hello"\n');
    expect(tokens[0]?.segments).toEqual([{ physicalLine: 0, logicalStart: 0, leadingTrim: 0 }]);
  });

  it("a dangling `\\` at EOF with no following physical line is NOT joined", () => {
    // No trailing "\n" — the backslash-terminated line is the LAST physical
    // line, so the `i + 1 < physicalLines.length` guard stops the join and
    // the backslash is left in place (there is nothing to join it to).
    const tokens = joinContinuations("abc\\");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.text).toBe("abc\\");
    expect(tokens[0]?.segments).toEqual([{ physicalLine: 0, logicalStart: 0, leadingTrim: 0 }]);
  });

  it("a standalone `c` inside a quoted string is not mistaken for a comment token, so the join still happens", () => {
    // hasCommentToken's quote-aware guard must skip the `c` in `"a c"` (it is
    // string content, not the comment keyword) so the trailing `\` is still
    // treated as a genuine continuation and the next physical line joins.
    const tokens = joinContinuations('+ "a c" > "b" \\\nstore(x) "y"\n');
    expect(tokens[0]?.text).toBe('+ "a c" > "b" store(x) "y"');
    expect(tokens[0]?.segments).toHaveLength(2);
  });
});
