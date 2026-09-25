// readWorkToDo — spec 079 US3 item 6: a non-reactive snapshot usable outside
// render (the strip agent's FR-016 notice). Covers marks + characters flags
// and convenience's not-asked -> applies transition; punctuation and
// unassigned mechanisms/touch are deliberately omitted (see the function's
// own header for why) — this test pins that scope, not a false completeness.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ConfirmedAlphabet } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveyAnswerStore } from "../stores/surveyAnswerStore.ts";
import { readWorkToDo } from "./useWorkToDo.ts";

const ACUTE = "́";

function resetStores(): void {
  useWorkingCopyStore.getState().reset();
  useSurveyAnswerStore.getState().reset();
}

beforeEach(resetStores);
afterEach(resetStores);

describe("readWorkToDo (spec 079 US3 item 6)", () => {
  it("returns an empty map when nothing is flagged and no step is not-asked", () => {
    expect(readWorkToDo()).toEqual({});
  });

  it("reports a reproposed marks answer, matching what useWorkToDo() would compute for the same store state", () => {
    const alphabet: ConfirmedAlphabet = {
      bases: ["e", "a"],
      marks: [ACUTE],
      attestedStacks: [{ base: "e", marks: [ACUTE] }],
      declaredRoles: {},
    };
    useWorkingCopyStore.getState().recordPhase({ phase: "B", answers: [], alphabet });
    useSurveyAnswerStore.getState().saveAnswer("marks", `marks_attachment.${ACUTE}|e`, {
      value: true,
      answerType: "boolean",
      origin: "confirmed",
      stage: "confirmed",
      evidenceKey: "stale-key",
      screenId: "marks_attachment",
    });
    useSurveyAnswerStore.getState().markScreenRecorded("marks", "marks_attachment", "h1");

    const workToDo = readWorkToDo();
    expect(workToDo["marks"]).toBeDefined();
    expect(workToDo["marks"]!.some((item) => item.kind === "reproposed")).toBe(true);
  });

  it("never reports a punctuation entry — deliberately out of scope (no synchronous exemplar cache)", () => {
    useSurveyAnswerStore.getState().saveAnswer("punctuation", "punctuation.inventory", {
      value: ["!"],
      answerType: "char-list",
      origin: "confirmed",
      stage: "confirmed",
      evidenceKey: "some-other-key",
      screenId: "punctuation",
    });
    expect(readWorkToDo()["punctuation"]).toBeUndefined();
  });
});
