// Tests for headline composition (specs/053 T028, FR-013).
//
// The claim under test is FR-013's central one: the SAME value must read
// differently depending on whose value it is. That is what an author auditing
// their own keyboard needs — "did I choose this, or did I just accept what the
// tool offered?" — and it is why agency is a separate axis from source.

import { describe, expect, it } from "vitest";
import type { DecisionPayload } from "@keyboard-studio/contracts";
import { formatAnswerValue, headlineOf } from "./headline.ts";

const SCRIPT_ANSWER: DecisionPayload = {
  kind: "survey-answer",
  questionId: "il_target_script",
  answerType: "select",
  value: "Latn",
};

describe("headlineOf — the three agency literals over one value", () => {
  it("distinguishes hand-set from tool-proposed for the identical value", () => {
    const chosen = headlineOf(SCRIPT_ANSWER, { agency: "hand-set" });
    const accepted = headlineOf(SCRIPT_ANSWER, { agency: "tool-proposed", source: "langtags" });
    expect(chosen.id).toBe("chose");
    expect(accepted.id).toBe("acceptedSuggested");
    // Same value, different message — the distinction is not in the value slot.
    expect(chosen).toMatchObject({ value: "Latn" });
    expect(accepted).toMatchObject({ value: "Latn", source: "langtags" });
  });

  it("reports a base-derived value as carried from the base", () => {
    expect(headlineOf(SCRIPT_ANSWER, { agency: "base-derived", source: "base" }))
      .toEqual({ id: "fromBase", question: "il_target_script", value: "Latn" });
  });

  it("names each proposal source distinctly", () => {
    for (const source of ["langtags", "cldr", "corpus", "axis-fill"] as const) {
      const spec = headlineOf(SCRIPT_ANSWER, { agency: "tool-proposed", source });
      expect(spec).toMatchObject({ id: "acceptedSuggested", source });
    }
  });

  it("still produces a sentence for a proposal with no recorded source", () => {
    // The type permits a sourceless proposal; a headline with an empty slot would
    // read as a bug, so it falls back to naming the tool generically.
    const spec = headlineOf(SCRIPT_ANSWER, { agency: "tool-proposed" });
    expect(spec).toMatchObject({ id: "acceptedSuggested", source: "the tool" });
  });
});

describe("headlineOf — editor steps interpolate counts", () => {
  it("carries all four counts and the editor", () => {
    // keysAdded: 0 alongside mechanismsAssigned: 7 — a mechanism edit assigns
    // mechanisms to keys that already exist and adds none of its own (a real
    // production shape, not an arbitrary fixture: recordEditorStep.ts always
    // reports mechanism_edit this way).
    const spec = headlineOf(
      {
        kind: "editor-action",
        actionType: "mechanism_edit",
        summary: {
          keysRemoved: 0,
          keysAdded: 0,
          mechanismsAssigned: 7,
          touchKeysAffected: 0,
          sample: ["a", "b"],
          sampleTruncated: false,
        },
      },
      { agency: "hand-set" },
    );
    expect(spec).toEqual({
      id: "editorStep",
      editor: "mechanism_edit",
      keysRemoved: 0,
      keysAdded: 0,
      mechanismsAssigned: 7,
      touchKeysAffected: 0,
    });
  });

  it("uses the editor's own action type, so three editors read differently", () => {
    const editors = (["gallery_edit", "mechanism_edit", "touch_edit"] as const).map((actionType) =>
      headlineOf(
        {
          kind: "editor-action",
          actionType,
          summary: {
            keysRemoved: 1,
            keysAdded: 0,
            mechanismsAssigned: 0,
            touchKeysAffected: 0,
            sample: [],
            sampleTruncated: false,
          },
        },
        { agency: "hand-set" },
      ),
    );
    expect(new Set(editors.map((e) => (e.id === "editorStep" ? e.editor : "")))).toHaveProperty(
      "size",
      3,
    );
  });
});

describe("formatAnswerValue", () => {
  it("joins a char-list with spaces, not commas", () => {
    // The values are characters; a comma would read as part of the alphabet.
    expect(formatAnswerValue(["ɓ", "ɗ", "ƙ"])).toBe("ɓ ɗ ƙ");
  });

  it("says so for an empty list and a blank string rather than rendering nothing", () => {
    expect(formatAnswerValue([])).toBe("(none)");
    expect(formatAnswerValue("")).toBe("(blank)");
  });

  it("renders booleans as words", () => {
    expect(formatAnswerValue(true)).toBe("yes");
    expect(formatAnswerValue(false)).toBe("no");
  });

  it("passes an ordinary string through unchanged", () => {
    expect(formatAnswerValue("Hausa")).toBe("Hausa");
  });
});
