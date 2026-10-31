import { describe, expect, it } from "vitest";
import {
  invisibleQuestionId,
  invisiblesCandidates,
  invisiblesCarriedOver,
  invisiblesResult,
  isInvisibleAccepted,
} from "./invisiblesStepRules.ts";

describe("invisiblesCarriedOver", () => {
  it("keeps format characters from controls and every character already decided about", () => {
    const out = invisiblesCarriedOver(["‍", "\u0007"], { "U+200C": "declined" });
    expect(out).toEqual(["‍", "‌"]);
  });
});

describe("invisiblesResult", () => {
  it("answers one boolean per offered candidate, false for a declined or untouched offer", () => {
    const decisions = { "U+200C": "accepted" } as const;
    const candidates = invisiblesCandidates("ltr", []);
    const result = invisiblesResult(candidates, decisions);
    expect(result.phase).toBe("C");
    expect(result.answers.map((a) => a.questionId)).toEqual(candidates.map(invisibleQuestionId));
    const accepted = candidates.filter((c) => isInvisibleAccepted(decisions, c)).map(invisibleQuestionId);
    expect(accepted).toEqual(["invisibles.u200c"]);
    expect(result.answers.filter((a) => a.value === true).map((a) => a.questionId)).toEqual(accepted);
  });
});
