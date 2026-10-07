// reducer.decisionStore.test.ts — spec 088 T011: the completion writer
// (contract C-2). The writer's store access is injected (ReducerDeps), so
// these tests drive it with capturing deps — no store imports needed here.
import { describe, it, expect, afterEach } from "vitest";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import { recordAnswersAsDecisions, type ReducerDeps } from "./reducer.ts";
import { questionRegistry } from "../survey/questions/registry.ts";
import type { QuestionModule } from "../survey/types.ts";
import type { Decision, DecisionSet } from "../decisions/decisionTypes.ts";
import type { SavedAnswer } from "./answerTypes.ts";

function harness(opts: {
  decisions?: DecisionSet;
  saved?: Record<string, SavedAnswer>;
  baseId?: string;
}): { deps: ReducerDeps; written: Decision[] } {
  const written: Decision[] = [];
  const deps = {
    writeDecisionRecords: (records: readonly Decision[]) => {
      written.push(...records);
    },
    readDecisionSet: () => opts.decisions ?? {},
    getSavedAnswer: (stepId: string, questionId: string) => opts.saved?.[`${stepId}/${questionId}`],
    getBaseKeyboardId: () => opts.baseId,
  } as ReducerDeps;
  return { deps, written };
}

function result(answers: SurveyPhaseResult["answers"]): SurveyPhaseResult {
  return { phase: "A", answers };
}

function savedAnswer(value: SavedAnswer["value"], proposal?: SavedAnswer["proposal"]): SavedAnswer {
  return {
    value,
    answerType: "text",
    origin: proposal === undefined ? "confirmed" : "proposed",
    ...(proposal !== undefined && { proposal }),
    stage: "confirmed",
    evidenceKey: null,
    screenId: "s",
    savedAt: 1,
  };
}

describe("recordAnswersAsDecisions (spec 088 C-2)", () => {
  it("writes one record per provides id with the answer's value and the completing step", () => {
    const { deps, written } = harness({});
    recordAnswersAsDecisions(
      result([{ questionId: "il_language_code", answerType: "text", value: "fr" }]),
      "identity",
      deps,
    );
    expect(written).toEqual([
      { id: "language-code", value: "fr", provenance: "asked", step: "identity" },
    ]);
  });

  it("snapshots `inputs` from the store's current values for the module's requires", () => {
    const { deps, written } = harness({
      decisions: { "author-name": { id: "author-name", value: "A. Author", provenance: "asked" } },
    });
    recordAnswersAsDecisions(
      result([{ questionId: "il_copyright_holder", answerType: "text", value: "A. Author" }]),
      "identity",
      deps,
    );
    expect(written).toHaveLength(1);
    expect(written[0]?.inputs).toEqual({ "author-name": "A. Author" });
  });

  it("provenance: no proposal → asked", () => {
    const { deps, written } = harness({ saved: { "identity/il_language_code": savedAnswer("fr") } });
    recordAnswersAsDecisions(
      result([{ questionId: "il_language_code", answerType: "text", value: "fr" }]),
      "identity",
      deps,
    );
    expect(written[0]?.provenance).toBe("asked");
    expect(written[0]?.offered).toBeUndefined();
  });

  it("provenance: proposal accepted with source \"base\" → extracted, source = the starting-point keyboard", () => {
    const { deps, written } = harness({
      saved: { "identity/il_language_code": savedAnswer("fr", { value: "fr", source: "base" }) },
      baseId: "basic_kbdfr",
    });
    recordAnswersAsDecisions(
      result([{ questionId: "il_language_code", answerType: "text", value: "fr" }]),
      "identity",
      deps,
    );
    expect(written[0]).toMatchObject({ provenance: "extracted", source: "basic_kbdfr" });
  });

  it("provenance: proposal accepted with another source → default, source = the proposal's label", () => {
    const { deps, written } = harness({
      saved: { "identity/il_language_code": savedAnswer("fr", { value: "fr", source: "langtags" }) },
    });
    recordAnswersAsDecisions(
      result([{ questionId: "il_language_code", answerType: "text", value: "fr" }]),
      "identity",
      deps,
    );
    expect(written[0]).toMatchObject({ provenance: "default", source: "langtags" });
  });

  it("provenance: proposal overridden → asked with offered = the proposal value", () => {
    const { deps, written } = harness({
      saved: { "identity/il_language_code": savedAnswer("ha", { value: "fr", source: "langtags" }) },
    });
    recordAnswersAsDecisions(
      result([{ questionId: "il_language_code", answerType: "text", value: "ha" }]),
      "identity",
      deps,
    );
    expect(written[0]).toMatchObject({ provenance: "asked", offered: "fr" });
  });

  it("an answer with no registry entry writes nothing (C-2.2)", () => {
    const { deps, written } = harness({});
    recordAnswersAsDecisions(
      result([{ questionId: "invisibles.u200c", answerType: "boolean", value: true }]),
      "invisibles",
      deps,
    );
    expect(written).toEqual([]);
  });

  describe("multi-provide broadcast (research §1b)", () => {
    const SYNTHETIC_ID = "synthetic_multi_provide";
    afterEach(() => {
      delete (questionRegistry as Record<string, QuestionModule>)[SYNTHETIC_ID];
    });

    it("a module providing several decisions broadcasts its value to each", () => {
      // No live module provides more than one decision (research §1b), so
      // the broadcast is pinned with a synthetic registry entry, removed
      // after the test.
      (questionRegistry as Record<string, QuestionModule>)[SYNTHETIC_ID] = {
        ...questionRegistry["il_language_code"],
        provides: ["language-code", "language-name"],
        requires: [],
      } as QuestionModule;
      const { deps, written } = harness({});
      recordAnswersAsDecisions(
        result([{ questionId: SYNTHETIC_ID, answerType: "text", value: "fr" }]),
        "identity",
        deps,
      );
      expect(written.map((r) => r.id)).toEqual(["language-code", "language-name"]);
      expect(written.every((r) => r.value === "fr")).toBe(true);
    });
  });

  it("is a no-op when the host injected no decision-store dep", () => {
    const deps = {} as ReducerDeps;
    expect(() =>
      recordAnswersAsDecisions(
        result([{ questionId: "il_language_code", answerType: "text", value: "fr" }]),
        "identity",
        deps,
      ),
    ).not.toThrow();
  });
});
