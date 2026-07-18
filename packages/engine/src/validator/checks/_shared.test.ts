import { describe, it, expect } from "vitest";
import { forEachMatch, stripNonCode, stripNonCodeSource } from "./_shared.js";

// forEachMatch is the shared line-split + global-regex-clone + exec-loop
// helper used by checkDeprecatedStores, checkIdentifiers, checkCodepointFormat,
// and checkIfStoreResolution (and, per the docstring, is a migration target for
// deadkeyResolution/indexBounds). It is only ever exercised indirectly through
// those checks today; this suite pins the helper's contract directly so a
// regression here doesn't hide behind four other checks' fixtures.

describe("forEachMatch", () => {
  it("forces the global flag even when the caller's regex omits it", () => {
    // A non-global regex would only ever produce one match per re.exec() call
    // (lastIndex never advances), so if forEachMatch did not force "g", this
    // would report a single match per line instead of every match.
    const calls: Array<{ match: string; lineIdx: number }> = [];
    forEachMatch("aXaXa", /a/, (match, lineIdx) => {
      calls.push({ match: match[0], lineIdx });
    });
    expect(calls).toHaveLength(3);
    expect(calls.every((c) => c.match === "a")).toBe(true);
  });

  it("preserves caller flags (e.g. case-insensitivity) alongside the forced global flag", () => {
    const calls: string[] = [];
    forEachMatch("Foo foo FOO", /foo/i, (match) => {
      calls.push(match[0]);
    });
    expect(calls).toEqual(["Foo", "foo", "FOO"]);
  });

  it("does not mutate or leak state on the caller-supplied RegExp object", () => {
    // forEachMatch clones the regex per line (`new RegExp(regex.source, flags)`);
    // the caller's original RegExp instance must be untouched — no residual
    // lastIndex, and reusing it afterwards behaves as a fresh regex.
    const callerRegex = /a/;
    forEachMatch("aaa\naaa", callerRegex, () => undefined);
    expect(callerRegex.lastIndex).toBe(0);
    expect(callerRegex.global).toBe(false);
    // Reusing the same instance directly afterwards must not skip matches
    // due to a leaked lastIndex from forEachMatch's internal clone.
    expect(callerRegex.test("a")).toBe(true);
  });

  it("does not leak lastIndex state between separate lines (per-line regex clone)", () => {
    // Each line gets its own `new RegExp(...)` clone inside the loop. If the
    // implementation instead reused one compiled regex across lines, a match
    // ending at the end of line N would leave lastIndex non-zero, and exec()
    // on line N+1 could start mid-string and miss a leading match.
    const perLine: string[][] = [[], []];
    forEachMatch("bXb\nbXb", /b/, (match, lineIdx) => {
      perLine[lineIdx]?.push(match[0]);
    });
    expect(perLine[0]).toEqual(["b", "b"]);
    expect(perLine[1]).toEqual(["b", "b"]);
  });

  it("reports multiple matches on the same line, each with the correct 0-based lineIdx and match.index column", () => {
    const results: Array<{ lineIdx: number; index: number; text: string }> = [];
    forEachMatch("store(A) store(B)\nstore(C)", /store\(([^)]+)\)/, (match, lineIdx) => {
      results.push({ lineIdx, index: match.index, text: match[1] ?? "" });
    });
    expect(results).toEqual([
      { lineIdx: 0, index: 0, text: "A" },
      { lineIdx: 0, index: 9, text: "B" },
      { lineIdx: 1, index: 0, text: "C" },
    ]);
  });

  it("invokes the callback zero times when no line matches", () => {
    let count = 0;
    forEachMatch("group(main) using keys\nc comment", /store\(/, () => {
      count++;
    });
    expect(count).toBe(0);
  });

  it("handles an empty source string without throwing and without invoking the callback", () => {
    let count = 0;
    forEachMatch("", /a/, () => {
      count++;
    });
    expect(count).toBe(0);
  });
});

// stripNonCode / stripNonCodeSource blank the "not-code" spans of a line —
// quoted-string contents and trailing `c` comments — with spaces, so a regex
// scan never mistakes keyword-shaped prose for live syntax. Pinned directly
// here (per this file's convention for shared helpers) rather than only via the
// checks that consume them.

describe("stripNonCode", () => {
  it("blanks single-quoted content, length-preserving", () => {
    const out = stripNonCode("store(s) 'abc'");
    expect(out).toHaveLength("store(s) 'abc'".length);
    expect(out.startsWith("store(s)")).toBe(true);
    expect(out).not.toContain("abc");
  });

  it("blanks double-quoted content, length-preserving", () => {
    const out = stripNonCode('x "U+110000" y');
    expect(out).toHaveLength('x "U+110000" y'.length);
    expect(out).not.toContain("U+110000");
    expect(out.startsWith("x ")).toBe(true);
    expect(out.endsWith(" y")).toBe(true);
  });

  it("blanks a trailing `c` comment to end of line, length-preserving", () => {
    const out = stripNonCode('+ "a" > "b" c see U+110000 later');
    expect(out).toHaveLength('+ "a" > "b" c see U+110000 later'.length);
    expect(out).not.toContain("U+110000");
    expect(out).not.toContain("see");
  });

  it("only treats a whitespace-bounded standalone `c` as a comment (not c-in-a-word)", () => {
    // `c` bordered by non-whitespace is part of an identifier, not a comment.
    expect(stripNonCode("context + 'a'")).toBe("context +    ");
    expect(stripNonCode("abc def")).toBe("abc def");
  });

  it("does not treat a `c` inside parens as a comment (parens/brackets are code)", () => {
    // dk(c): the `c` is bordered by `(`/`)`, not whitespace — left intact.
    expect(stripNonCode("dk(c)")).toBe("dk(c)");
    expect(stripNonCode("index(x, 1)")).toBe("index(x, 1)");
  });

  it("treats a `c` inside quotes as string content, not a comment start", () => {
    expect(stripNonCode("'c'")).toBe("   ");
  });

  it("leaves a line with no quotes or comment untouched", () => {
    expect(stripNonCode("+ [K_A] > U+0061")).toBe("+ [K_A] > U+0061");
  });
});

describe("stripNonCodeSource", () => {
  it("applies stripNonCode per line and preserves line structure + per-line length", () => {
    const src = "a 'x'\nb c cmt";
    const out = stripNonCodeSource(src);
    const inLines = src.split("\n");
    const outLines = out.split("\n");
    expect(outLines).toHaveLength(2);
    expect(outLines[0]).toHaveLength(inLines[0]!.length);
    expect(outLines[1]).toHaveLength(inLines[1]!.length);
    expect(out).not.toContain("x");
    expect(out).not.toContain("cmt");
    expect(outLines[0]!.startsWith("a ")).toBe(true);
    expect(outLines[1]!.startsWith("b ")).toBe(true);
  });
});
