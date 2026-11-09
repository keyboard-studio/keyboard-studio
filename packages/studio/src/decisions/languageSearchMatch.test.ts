// Spec 115 T027: the `language-search-match` decision (why a picked language
// matched a dialect or variety name) is declared by il_language_english and
// survives a snapshot round trip like every other decision (the draft envelope
// serialises the whole decision set by id, so a new id needs no persistence code).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useDecisionStore, getDecisionSnapshot } from "../stores/decisionStore.ts";
import { captureRevisionSnapshot, restoreRevisionSnapshot } from "../lib/draftPersistence.ts";
import { questionRegistry } from "../survey/questions/registry.ts";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import { recordAnswersAsDecisions, type ReducerDeps } from "../steps/reducer.ts";
import { rehydrateAnswersFromDecisions } from "../lib/draftPersistence.ts";
import { runDecisionFlow } from "./decisionFlow.ts";
import type { Decision, DecisionSet } from "./decisionTypes.ts";
import { decisionIRPaths } from "./decisionTypes.ts";

const MATCH = {
  name: "Gascon",
  relation: "dialect",
  source: "glottolog",
  glottocode: "gasc1240",
  countries: ["ES", "FR"],
} as const;

describe("language-search-match decision", () => {
  beforeEach(() => {
    localStorage.clear();
    useDecisionStore.getState().reset();
  });
  afterEach(() => {
    localStorage.clear();
    useDecisionStore.getState().reset();
  });

  it("is provided by il_language_english, after language-name, and maps to no IR path", () => {
    expect(questionRegistry["il_language_english"]?.provides).toEqual(["language-name", "language-search-match"]);
    expect(decisionIRPaths["language-search-match"]).toEqual([]);
  });

  it("persists through a revision snapshot round trip (JSON, as stored)", () => {
    useDecisionStore.getState().record({
      id: "language-search-match",
      value: MATCH,
      provenance: "derived",
      source: "il_language_english",
    });
    const stored = JSON.stringify(captureRevisionSnapshot());
    useDecisionStore.getState().reset();
    expect(getDecisionSnapshot()["language-search-match"]).toBeUndefined();

    restoreRevisionSnapshot(JSON.parse(stored));
    expect(getDecisionSnapshot()["language-search-match"]).toMatchObject({
      value: MATCH,
      provenance: "derived",
      source: "il_language_english",
    });
  });

  // il_language_english is the first module with a second provided id that its
  // renderer records itself. Every writer that fans an answer over `provides` must
  // leave that id alone, or the typed name would overwrite the match object.
  describe("the renderer-written id is never filled from the answer", () => {
    const english = questionRegistry["il_language_english"]!;

    it("declares it as renderer-written", () => {
      expect(english.rendererWrites).toEqual(["language-search-match"]);
    });

    it("answer commit writes only language-name", () => {
      const written: Decision[] = [];
      const deps = {
        writeDecisionRecords: (rs: readonly Decision[]) => written.push(...rs),
        readDecisionSet: () => ({}),
        getSavedAnswer: () => undefined,
        getStartKeyboardId: () => undefined,
      } as ReducerDeps;
      const result: SurveyPhaseResult = {
        phase: "A",
        answers: [{ questionId: "il_language_english", answerType: "text", value: "Occitan" }],
      };
      recordAnswersAsDecisions(result, "identity", deps);
      expect(written.map((r) => r.id)).toEqual(["language-name"]);
    });

    it("the decision flow and extraction do not seed it", () => {
      const decisions = runDecisionFlow({ modules: [english], answers: { il_language_english: "Occitan" } });
      expect(decisions["language-name"]?.value).toBe("Occitan");
      expect(decisions["language-search-match"]).toBeUndefined();
    });

    it("a reload keeps the Q1 answer a name, and the match record out of the answers", () => {
      const decisions: DecisionSet = {
        "language-name": { id: "language-name", value: "Occitan", provenance: "asked", step: "identity" },
        "language-search-match": {
          id: "language-search-match",
          value: MATCH,
          provenance: "derived",
          source: "il_language_english",
          step: "identity",
        },
      };
      const snap = rehydrateAnswersFromDecisions(decisions, { version: 1, steps: {} } as never, 1);
      expect(snap.steps["identity"]?.answers["il_language_english"]?.value).toBe("Occitan");
      // A record the question's renderer owns is never read back as an answer.
      const reversed: DecisionSet = {
        "language-search-match": decisions["language-search-match"]!,
        "language-name": decisions["language-name"]!,
      };
      const snap2 = rehydrateAnswersFromDecisions(reversed, { version: 1, steps: {} } as never, 1);
      expect(snap2.steps["identity"]?.answers["il_language_english"]?.value).toBe("Occitan");
    });
  });
});
