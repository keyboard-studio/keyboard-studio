import { describe, it, expect } from "vitest";
import {
  answersDiffer,
  assembleFlowResult,
  buildSavedAnswers,
  canAdvanceFrom,
  hasValue,
  indexFlow,
  toSurveyAnswer,
} from "./flowWalk.ts";
import type { FlowQuestion } from "./types.ts";

const q = (over: Partial<FlowQuestion> & { id: string }): FlowQuestion =>
  ({ prompt: "p", type: "text", required: false, ...over }) as FlowQuestion;

describe("flowWalk value rules", () => {
  it("hasValue: blank strings and empty arrays are no value", () => {
    expect(hasValue(undefined)).toBe(false);
    expect(hasValue("  ")).toBe(false);
    expect(hasValue([])).toBe(false);
    expect(hasValue("a")).toBe(true);
    expect(hasValue(["a"])).toBe(true);
  });

  it("answersDiffer compares arrays by element and order", () => {
    expect(answersDiffer("a", "a")).toBe(false);
    expect(answersDiffer(["a", "b"], ["a", "b"])).toBe(false);
    expect(answersDiffer(["a", "b"], ["b", "a"])).toBe(true);
    expect(answersDiffer("a", undefined)).toBe(true);
  });

  it("toSurveyAnswer maps each question type to its recorded answer type", () => {
    expect(toSurveyAnswer("x", q({ id: "x", type: "text" }), "v")).toEqual({ questionId: "x", answerType: "text", value: "v" });
    expect(toSurveyAnswer("x", q({ id: "x", type: "radio" }), "")).toBeNull();
    expect(toSurveyAnswer("x", q({ id: "x", type: "radio" }), "copy")).toEqual({
      questionId: "x",
      answerType: "select",
      value: "copy",
    });
    expect(toSurveyAnswer("x", q({ id: "x", type: "bool" }), "true")).toEqual({
      questionId: "x",
      answerType: "boolean",
      value: true,
    });
    expect(toSurveyAnswer("x", q({ id: "x", type: "notice" }), "v")).toBeNull();
    expect(toSurveyAnswer("x", q({ id: "x", type: "text" }), undefined)).toBeNull();
  });
});

describe("flowWalk walk rules", () => {
  const a = q({ id: "a", required: true });
  const b = q({ id: "b", type: "radio" });
  const hidden = q({ id: "h", engine_resolved: true });
  const flow = { questions: [hidden, a, b], phase: "A" } as const;

  it("indexFlow: first renderable skips engine-resolved questions", () => {
    const { index, firstId } = indexFlow(flow as never);
    expect(firstId).toBe("a");
    expect([...index.keys()]).toEqual(["h", "a", "b"]);
  });

  it("canAdvanceFrom: required needs a value, a notice never does, email format is checked", () => {
    expect(canAdvanceFrom(a, undefined)).toBe(false);
    expect(canAdvanceFrom(a, "x")).toBe(true);
    expect(canAdvanceFrom(q({ id: "n", type: "notice", required: true }), undefined)).toBe(true);
    const email = q({ id: "e", format: "email" } as never);
    expect(canAdvanceFrom(email, "nope")).toBe(false);
    expect(canAdvanceFrom(email, "a@b.co")).toBe(true);
    expect(canAdvanceFrom(email, "")).toBe(true);
  });

  it("buildSavedAnswers: a kept proposal is proposed, a changed one overturned, no proposal confirmed", () => {
    const { index } = indexFlow(flow as never);
    const stack = [
      { questionId: "a", value: "x", proposal: { value: "x", source: "langtags" as const } },
      { questionId: "b", value: "no", proposal: { value: "yes" } },
    ];
    const saved = buildSavedAnswers(stack, ["x", "no"], index);
    expect(saved["a"]).toMatchObject({ origin: "proposed", proposal: { value: "x", source: "langtags" }, answerType: "text" });
    expect(saved["b"]).toMatchObject({ origin: "overturned", answerType: "select" });
    expect(buildSavedAnswers([{ questionId: "a", value: "x" }], ["x"], index)["a"]?.origin).toBe("confirmed");
    expect(buildSavedAnswers([{ questionId: "a", value: undefined }], [undefined], index)).toEqual({});
  });

  it("assembleFlowResult: earlier entries then the committed one, once", () => {
    const { index } = indexFlow(flow as never);
    const result = assembleFlowResult(
      flow as never,
      [{ questionId: "a", value: "x" }],
      index,
      { questionId: "b", question: b },
      "yes",
    );
    expect(result).toEqual({
      phase: "A",
      answers: [
        { questionId: "a", answerType: "text", value: "x" },
        { questionId: "b", answerType: "select", value: "yes" },
      ],
    });
  });
});
