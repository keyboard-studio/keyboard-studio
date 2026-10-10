// decisionValueText — the generic reader of a `decision` payload's stored
// value. Fixtures are the value shapes the real StepHost walks settle
// (galleryLogEntries.test.ts's G7 cases), so the outline is pinned against
// what modules actually record, not against imagined JSON.

import { describe, expect, it } from "vitest";
import { decisionValueLines, type DecisionValueLine } from "./decisionValueText.ts";

function texts(lines: readonly DecisionValueLine[]): string[] {
  return lines.flatMap((line) => (line.kind === "text" ? [line.text] : []));
}

describe("scalars", () => {
  it("a string reads as itself", () => {
    expect(decisionValueLines("import-adapt")).toEqual([{ kind: "text", text: "import-adapt" }]);
  });

  it("a boolean reads as yes/no and a number as itself", () => {
    expect(decisionValueLines(true)).toEqual([{ kind: "text", text: "yes" }]);
    expect(decisionValueLines(3)).toEqual([{ kind: "text", text: "3" }]);
  });

  it("null and the empty string state an absence, never a blank line", () => {
    expect(decisionValueLines(null)).toEqual([{ kind: "empty" }]);
    expect(decisionValueLines("")).toEqual([{ kind: "empty" }]);
  });

  it("a long scalar is truncated with the ellipsis stating it", () => {
    const lines = decisionValueLines("x".repeat(600));
    expect(lines).toHaveLength(1);
    const [line] = lines;
    expect(line?.kind).toBe("text");
    if (line?.kind === "text") {
      expect(line.text.length).toBe(500);
      expect(line.text.endsWith("…")).toBe(true);
    }
  });
});

describe("the real StepHost shapes (galleryLogEntries G7)", () => {
  it("windows-layout: a single internal-named field shows by value alone", () => {
    // `layoutId` is a camelCase field name (FR-008: never renders); the
    // value — the base-supplied keyboard id — is content and does.
    expect(decisionValueLines({ layoutId: "basic_french" })).toEqual([
      { kind: "text", text: "basic_french" },
    ]);
  });

  it("rule-set: identifier-only items digest to a count, never the ids", () => {
    expect(decisionValueLines({ additions: [{ id: "rule_acute" }, { id: "rule_grave" }] })).toEqual([
      { kind: "count", count: 2, label: "additions" },
    ]);
  });

  it("punctuation-inventory: the decided characters themselves show, per field", () => {
    expect(
      decisionValueLines({
        accepted: [{ char: "«", provenance: "asked" }],
        declined: [{ char: "»", provenance: "asked" }],
      }),
    ).toEqual([
      { kind: "text", text: "accepted: «" },
      { kind: "text", text: "declined: »" },
    ]);
  });

  it("retained-convenience-chars: item chars and a primitive list both show", () => {
    expect(
      decisionValueLines({
        retained: [{ char: "@", provenance: "asked" }],
        rejected: ["#"],
      }),
    ).toEqual([
      { kind: "text", text: "retained: @" },
      { kind: "text", text: "rejected: #" },
    ]);
  });

  it("deadkeys-defined: an op reads as its values in field order", () => {
    expect(
      decisionValueLines({ ops: [{ kind: "define", triggerOutput: "´", combiningOutput: "́" }] }),
    ).toEqual([{ kind: "text", text: "ops: define ´ ́" }]);
  });

  it("help-docs: a question-id field name never renders; its text value does", () => {
    expect(decisionValueLines({ answers: { pf_welcome_paragraph: "Welcome!" } })).toEqual([
      { kind: "text", text: "answers: Welcome!" },
    ]);
  });

  it("an empty collection field states its absence under its label", () => {
    expect(decisionValueLines({ removals: [] })).toEqual([{ kind: "empty", label: "removals" }]);
  });
});

describe("bounds", () => {
  it("an array of items is capped, with the remainder stated", () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ char: String.fromCharCode(0x61 + i) }));
    const lines = decisionValueLines({ chars: items });
    expect(lines[0]).toEqual({ kind: "text", text: "chars:" });
    expect(texts(lines)).toHaveLength(1 + 8);
    expect(lines[lines.length - 1]).toEqual({ kind: "more", count: 4 });
  });

  it("a primitive list joins short strings with spaces and caps the line count overall", () => {
    const chars = Array.from({ length: 30 }, (_, i) => String.fromCharCode(0x41 + i));
    const lines = decisionValueLines(chars);
    expect(lines[0]?.kind).toBe("text");
    expect(lines[lines.length - 1]).toEqual({ kind: "more", count: 6 });
  });

  it("an object with many fields is capped, with the remainder stated", () => {
    const value: Record<string, number> = {};
    for (let i = 0; i < 9; i += 1) value[`f${i}`] = i;
    const lines = decisionValueLines(value);
    // `f0`.. are not plain words, so fields show by value alone.
    expect(texts(lines)).toEqual(["0", "1", "2", "3", "4", "5"]);
    expect(lines[lines.length - 1]).toEqual({ kind: "more", count: 3 });
  });
});
