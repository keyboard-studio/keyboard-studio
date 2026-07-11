import { describe, it, expect } from "vitest";
import { forEachMatch } from "./_shared.js";

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
