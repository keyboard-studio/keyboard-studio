// Tests for bundleSummary.summarizeSelection (#1986).
//
// The draft bundle description must collapse the selection to one segment
// per rule kind with counts added up — never the concatenated per-family
// explanations (which repeat, embed store ids, and leak "the assist layer").

import { describe, it, expect } from "vitest";
import type { IRRule } from "@keyboard-studio/contracts";
import type { RuleFamily } from "@keyboard-studio/engine/kmAssist";
import { summarizeSelection } from "./bundleSummary.ts";

function rule(nodeId: string, kind: "vkey" | "deadkey" = "vkey"): IRRule {
  return kind === "vkey"
    ? {
        nodeId,
        context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
        output: [{ kind: "char", value: "a" }],
      }
    : {
        nodeId,
        context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
        output: [{ kind: "deadkey", id: 1 }],
      };
}

function family(
  id: string,
  kind: RuleFamily["kind"],
  memberIds: string[],
  guardStore?: string,
): RuleFamily {
  return {
    id,
    name: `${id} name`,
    ...(guardStore === undefined ? {} : { guardStore }),
    outputShape: kind === "plain-output" ? "char" : "nul",
    kind,
    memberIds,
    count: memberIds.length,
    // Deliberately "bad" explanations: the summarizer must never surface them.
    explanation: `INTERNAL: the assist layer on store "secret_store_xyz" for ${id}.`,
    sampleRuleTexts: [],
    patternSummary: "pattern",
  };
}

describe("summarizeSelection", () => {
  it("merges two families of the same kind into one segment with counts added up", () => {
    const rules = [rule("a"), rule("b"), rule("c"), rule("d1", "deadkey"), rule("d2", "deadkey")];
    const segments = summarizeSelection(
      [
        { family: family("plain-a", "plain-output", ["a", "b"]), rules: rules.slice(0, 2) },
        { family: family("plain-b", "plain-output", ["c"]), rules: rules.slice(2, 3) },
        { family: family("deadkeys", "plain-output", ["d1", "d2"]), rules: rules.slice(3, 5) },
      ],
      [],
      ["a", "b", "c", "d1", "d2"],
    );
    expect(segments).toEqual([{ kind: "plain-output", count: 5 }]);
  });

  it("emits one segment per kind in first-appearance order", () => {
    const rules = [rule("a"), rule("b"), rule("c")];
    const segments = summarizeSelection(
      [
        { family: family("plain", "plain-output", ["a"]), rules: [rules[0]!] },
        { family: family("block", "blocking", ["b"], "diablock"), rules: [rules[1]!] },
        { family: family("plain2", "plain-output", ["c"]), rules: [rules[2]!] },
      ],
      [],
      ["a", "b", "c"],
    );
    expect(segments).toEqual([
      { kind: "plain-output", count: 2 },
      { kind: "blocking", count: 1 },
    ]);
  });

  it("counts only the selected rules of a partially-selected family", () => {
    const rules = [rule("a"), rule("b"), rule("c")];
    const segments = summarizeSelection(
      [{ family: family("plain", "plain-output", ["a", "b", "c"]), rules }],
      [],
      ["a", "c"],
    );
    expect(segments).toEqual([{ kind: "plain-output", count: 2 }]);
  });

  it("buckets ungrouped selected rules by their own kind", () => {
    const rules = [rule("a"), rule("b")];
    const segments = summarizeSelection(
      [{ family: family("block", "blocking", ["a"], "diablock"), rules: [rules[0]!] }],
      [rules[1]!],
      ["a", "b"],
    );
    expect(segments).toEqual([
      { kind: "blocking", count: 1 },
      { kind: "plain-output", count: 1 },
    ]);
  });

  it("ignores deselected ungrouped rules and returns [] for an empty selection", () => {
    const rules = [rule("a")];
    expect(summarizeSelection([], [rules[0]!], [])).toEqual([]);
    expect(summarizeSelection([], [rules[0]!], ["zzz"])).toEqual([]);
  });

  it("never surfaces family explanations, store ids, or assist-layer wording", () => {
    const rules = [rule("a"), rule("b")];
    const segments = summarizeSelection(
      [
        {
          family: family("block", "blocking", ["a", "b"], "generated_marks_unwrap_from"),
          rules,
        },
      ],
      [],
      ["a", "b"],
    );
    const text = JSON.stringify(segments);
    expect(text).not.toContain("secret_store_xyz");
    expect(text).not.toContain("generated_marks_unwrap_from");
    expect(text).not.toContain("assist layer");
    expect(text).not.toContain("INTERNAL");
  });
});
