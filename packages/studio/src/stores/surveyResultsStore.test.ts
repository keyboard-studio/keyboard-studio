// Tests for the survey-results store — persistence + re-merge semantics that
// replace the three discarded-result TODOs (refs #334, #369). Zustand store is
// exercised via getState() (no React needed).

import { describe, it, expect, beforeEach } from "vitest";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import { useSurveyResultsStore } from "./surveyResultsStore";

const phaseA: SurveyPhaseResult = {
  phase: "A",
  answers: [],
  computedAxes: { scriptClass: "alphabetic" },
};
const phaseB: SurveyPhaseResult = {
  phase: "B",
  answers: [],
  computedAxes: { scale: "small", phoneticIntuition: "strong" },
};

describe("surveyResultsStore", () => {
  beforeEach(() => useSurveyResultsStore.getState().reset());

  it("starts empty with a merged empty session", () => {
    const s = useSurveyResultsStore.getState();
    expect(s.phaseResults).toEqual([]);
    expect(s.session.axes).toEqual({});
    expect(s.session.selectedPatternIds).toEqual([]);
    expect(s.session.assignments).toEqual([]);
  });

  it("recordPhase persists a result and re-merges the session", () => {
    useSurveyResultsStore.getState().recordPhase(phaseA);
    useSurveyResultsStore.getState().recordPhase(phaseB);
    const s = useSurveyResultsStore.getState();
    expect(s.phaseResults.map((p) => p.phase)).toEqual(["A", "B"]);
    expect(s.session.axes.scriptClass).toBe("alphabetic");
    expect(s.session.axes.scale).toBe("small");
  });

  it("re-recording the same phase replaces it rather than duplicating", () => {
    useSurveyResultsStore.getState().recordPhase(phaseB);
    const phaseBRedo: SurveyPhaseResult = {
      phase: "B",
      answers: [],
      computedAxes: { scale: "large", phoneticIntuition: "weak" },
    };
    useSurveyResultsStore.getState().recordPhase(phaseBRedo);
    const s = useSurveyResultsStore.getState();
    expect(s.phaseResults).toHaveLength(1);
    expect(s.session.axes.scale).toBe("large");
  });

  it("merges assignments from a gallery phase into the session", () => {
    const phaseC: SurveyPhaseResult = {
      phase: "C",
      answers: [],
      assignments: [
        {
          scope: "keyboard-default",
          target: "",
          modality: "physical",
          mechanisms: [{ patternId: "latin_deadkey_acute_single", strategyId: "S-02" }],
        },
      ],
    };
    useSurveyResultsStore.getState().recordPhase(phaseC);
    expect(useSurveyResultsStore.getState().session.assignments).toHaveLength(1);
  });

  it("setIrAxes seeds the baseline and survey phases still override it", () => {
    useSurveyResultsStore.getState().setIrAxes({ scale: "massive" });
    useSurveyResultsStore.getState().recordPhase(phaseB); // scale: small
    const s = useSurveyResultsStore.getState();
    expect(s.irAxes.scale).toBe("massive");
    expect(s.session.axes.scale).toBe("small");
  });

  it("Phase B confirmedInventory surfaces on session.confirmedInventory", () => {
    const phaseBWithInventory: SurveyPhaseResult = {
      phase: "B",
      answers: [],
      computedAxes: { scale: "small" },
      confirmedInventory: ["ŋ", "ɛ", "ɔ"],
    };
    useSurveyResultsStore.getState().recordPhase(phaseBWithInventory);
    const s = useSurveyResultsStore.getState();
    expect(s.session.confirmedInventory).toEqual(["ŋ", "ɛ", "ɔ"]);
  });

  it("confirmedInventory dedupes across a Phase B re-record", () => {
    const phaseBv1: SurveyPhaseResult = {
      phase: "B",
      answers: [],
      confirmedInventory: ["ŋ", "ɛ"],
    };
    const phaseBv2: SurveyPhaseResult = {
      phase: "B",
      answers: [],
      confirmedInventory: ["ɛ", "ɔ"],
    };
    useSurveyResultsStore.getState().recordPhase(phaseBv1);
    useSurveyResultsStore.getState().recordPhase(phaseBv2); // replaces Phase B
    const s = useSurveyResultsStore.getState();
    // Phase B replaced: only v2's inventory remains
    expect(s.session.confirmedInventory).toEqual(["ɛ", "ɔ"]);
  });

  it("session.confirmedInventory is [] on an empty session", () => {
    const s = useSurveyResultsStore.getState();
    expect(s.session.confirmedInventory).toEqual([]);
  });

  it("reset clears results and session", () => {
    useSurveyResultsStore.getState().recordPhase(phaseA);
    useSurveyResultsStore.getState().reset();
    const s = useSurveyResultsStore.getState();
    expect(s.phaseResults).toEqual([]);
    expect(s.session.axes).toEqual({});
  });
});
