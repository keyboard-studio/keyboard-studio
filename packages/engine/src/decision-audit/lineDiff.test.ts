// Tests for the decision-audit line differ (specs/053 T006).
//
// The properties under test are the ones the record depends on: no hunks for
// identical input (so "changed nothing" is representable), correct unified line
// numbering including the zero-lines-on-one-side convention, coalescing at the
// context bound, and bit-for-bit determinism across runs.

import { describe, expect, it } from "vitest";
import { diffLines, diffMagnitude } from "./lineDiff.js";

const K = (...lines: string[]): string => lines.join("\n");

describe("diffLines — identical input", () => {
  it("yields no hunks for equal text", () => {
    expect(diffLines(K("store(&NAME) 'x'", "+ 'a' > 'b'"), K("store(&NAME) 'x'", "+ 'a' > 'b'")))
      .toEqual([]);
  });

  it("yields no hunks for two empty strings", () => {
    expect(diffLines("", "")).toEqual([]);
  });

  it("treats CRLF and LF as the same line breaks", () => {
    expect(diffLines("a\r\nb\r\nc", "a\nb\nc")).toEqual([]);
  });
});

describe("diffLines — single-line edits", () => {
  it("reports a single-line insertion", () => {
    const hunks = diffLines(K("a", "b", "c"), K("a", "b", "NEW", "c"));
    expect(hunks).toHaveLength(1);
    expect(hunks[0]!.lines).toEqual([" a", " b", "+NEW", " c"]);
    expect(hunks[0]!.oldLines).toBe(3);
    expect(hunks[0]!.newLines).toBe(4);
    expect(diffMagnitude(hunks)).toEqual({ added: 1, removed: 0 });
  });

  it("reports a single-line deletion", () => {
    const hunks = diffLines(K("a", "b", "c"), K("a", "c"));
    expect(hunks).toHaveLength(1);
    expect(hunks[0]!.lines).toEqual([" a", "-b", " c"]);
    expect(diffMagnitude(hunks)).toEqual({ added: 0, removed: 1 });
  });

  it("reports a replacement as a delete followed by an insert", () => {
    const hunks = diffLines(K("a", "b", "c"), K("a", "B", "c"));
    expect(hunks).toHaveLength(1);
    // The fixed tie-break puts the deletion first — this ordering is the
    // determinism contract, not an accident of the table walk.
    expect(hunks[0]!.lines).toEqual([" a", "-b", "+B", " c"]);
    expect(diffMagnitude(hunks)).toEqual({ added: 1, removed: 1 });
  });

  it("numbers hunks 1-based against the old and new sides", () => {
    const before = K("l1", "l2", "l3", "l4", "l5", "l6", "l7", "l8", "l9", "l10");
    const after = K("l1", "l2", "l3", "l4", "l5", "CHANGED", "l7", "l8", "l9", "l10");
    const hunks = diffLines(before, after);
    expect(hunks).toHaveLength(1);
    // 3 lines of context either side of line 6 ⇒ hunk covers lines 3..9.
    expect(hunks[0]!.oldStart).toBe(3);
    expect(hunks[0]!.oldLines).toBe(7);
    expect(hunks[0]!.newStart).toBe(3);
    expect(hunks[0]!.newLines).toBe(7);
  });

  it("uses the follows-this-line convention when one side contributes nothing", () => {
    // Zero context ⇒ a pure insertion hunk has oldLines 0, and oldStart is then
    // the line it follows rather than a 1-based line that does not exist.
    const hunks = diffLines(K("a", "b"), K("a", "NEW", "b"), 0);
    expect(hunks).toHaveLength(1);
    expect(hunks[0]!.oldLines).toBe(0);
    expect(hunks[0]!.oldStart).toBe(1);
    expect(hunks[0]!.newStart).toBe(2);
    expect(hunks[0]!.newLines).toBe(1);
  });
});

describe("diffLines — hunk coalescing at the 3-line context bound", () => {
  const lines = (n: number): string[] => Array.from({ length: n }, (_, i) => `line${i + 1}`);

  it("coalesces two changes whose context windows touch", () => {
    const before = lines(20);
    const after = [...before];
    after[4] = "CHANGED-A"; // line 5
    after[9] = "CHANGED-B"; // line 10 — 5 apart, windows abut at 3 context lines
    const hunks = diffLines(before.join("\n"), after.join("\n"));
    expect(hunks).toHaveLength(1);
  });

  it("keeps two changes separate when their context windows do not touch", () => {
    const before = lines(40);
    const after = [...before];
    after[4] = "CHANGED-A"; // line 5
    after[29] = "CHANGED-B"; // line 30 — far apart
    const hunks = diffLines(before.join("\n"), after.join("\n"));
    expect(hunks).toHaveLength(2);
    expect(hunks[0]!.oldStart).toBeLessThan(hunks[1]!.oldStart);
  });

  it("honours a wider context by merging what 3 lines would have split", () => {
    const before = lines(40);
    const after = [...before];
    after[4] = "CHANGED-A";
    after[19] = "CHANGED-B"; // 15 apart: split at 3, merged at 8
    expect(diffLines(before.join("\n"), after.join("\n"), 3)).toHaveLength(2);
    expect(diffLines(before.join("\n"), after.join("\n"), 8)).toHaveLength(1);
  });
});

describe("diffLines — determinism", () => {
  it("produces byte-identical hunks across two runs of the same input", () => {
    const before = K("c GROUP", "+ [K_A] > 'a'", "+ [K_B] > 'b'", "+ [K_C] > 'c'", "store(&X) 'y'");
    const after = K("c GROUP", "+ [K_A] > 'á'", "+ [K_B] > 'b'", "store(&X) 'y'", "store(&Z) 'w'");
    const first = JSON.stringify(diffLines(before, after));
    const second = JSON.stringify(diffLines(before, after));
    expect(first).toBe(second);
  });

  it("degrades a wholesale rewrite to delete-all-then-insert-all", () => {
    // No shared lines at all: the LCS is empty, so every old line is deleted
    // before any new line is inserted — the same ordering the oversized-input
    // fallback uses, which is why the two paths cannot disagree.
    const hunks = diffLines(K("a", "b"), K("x", "y"));
    expect(hunks).toHaveLength(1);
    expect(hunks[0]!.lines).toEqual(["-a", "-b", "+x", "+y"]);
  });
});
