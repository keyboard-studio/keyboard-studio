// Tests for survey-results state in workingCopyStore — persistence + re-merge semantics.
// Zustand store is exercised via getState() (no React needed).

import { describe, it, expect, beforeEach } from "vitest";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "./workingCopyStore.ts";

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
  beforeEach(() => useWorkingCopyStore.getState().reset());

  it("starts empty with a merged empty session", () => {
    const s = useWorkingCopyStore.getState();
    expect(s.phaseResults).toEqual([]);
    expect(s.session.axes).toEqual({});
    expect(s.session.selectedPatternIds).toEqual([]);
    expect(s.session.assignments).toEqual([]);
  });

  it("recordPhase persists a result and re-merges the session", () => {
    useWorkingCopyStore.getState().recordPhase(phaseA);
    useWorkingCopyStore.getState().recordPhase(phaseB);
    const s = useWorkingCopyStore.getState();
    expect(s.phaseResults.map((p) => p.phase)).toEqual(["A", "B"]);
    expect(s.session.axes.scriptClass).toBe("alphabetic");
    expect(s.session.axes.scale).toBe("small");
  });

  it("re-recording the same phase replaces it rather than duplicating", () => {
    useWorkingCopyStore.getState().recordPhase(phaseB);
    const phaseBRedo: SurveyPhaseResult = {
      phase: "B",
      answers: [],
      computedAxes: { scale: "large", phoneticIntuition: "weak" },
    };
    useWorkingCopyStore.getState().recordPhase(phaseBRedo);
    const s = useWorkingCopyStore.getState();
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
    useWorkingCopyStore.getState().recordPhase(phaseC);
    expect(useWorkingCopyStore.getState().session.assignments).toHaveLength(1);
  });

  it("setIrAxes seeds the baseline and survey phases still override it", () => {
    useWorkingCopyStore.getState().setIrAxes({ scale: "massive" });
    useWorkingCopyStore.getState().recordPhase(phaseB); // scale: small
    const s = useWorkingCopyStore.getState();
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
    useWorkingCopyStore.getState().recordPhase(phaseBWithInventory);
    const s = useWorkingCopyStore.getState();
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
    useWorkingCopyStore.getState().recordPhase(phaseBv1);
    useWorkingCopyStore.getState().recordPhase(phaseBv2); // replaces Phase B
    const s = useWorkingCopyStore.getState();
    // Phase B replaced: only v2's inventory remains
    expect(s.session.confirmedInventory).toEqual(["ɛ", "ɔ"]);
  });

  it("session.confirmedInventory is [] on an empty session", () => {
    const s = useWorkingCopyStore.getState();
    expect(s.session.confirmedInventory).toEqual([]);
  });

  it("reset clears results and session", () => {
    useWorkingCopyStore.getState().recordPhase(phaseA);
    useWorkingCopyStore.getState().reset();
    const s = useWorkingCopyStore.getState();
    expect(s.phaseResults).toEqual([]);
    expect(s.session.axes).toEqual({});
  });

  // ---------------------------------------------------------------------------
  // Desktop lock / unlock (spec §7.7 / §8 "Gallery instantiation")
  // ---------------------------------------------------------------------------

  it("desktopLocked starts as false", () => {
    const s = useWorkingCopyStore.getState();
    expect(s.desktopLocked).toBe(false);
  });

  it("lockDesktop sets desktopLocked to true", () => {
    useWorkingCopyStore.getState().lockDesktop();
    expect(useWorkingCopyStore.getState().desktopLocked).toBe(true);
  });

  it("unlockDesktop sets desktopLocked back to false", () => {
    useWorkingCopyStore.getState().lockDesktop();
    useWorkingCopyStore.getState().unlockDesktop();
    expect(useWorkingCopyStore.getState().desktopLocked).toBe(false);
  });

  it("reset clears desktopLocked to false", () => {
    useWorkingCopyStore.getState().lockDesktop();
    expect(useWorkingCopyStore.getState().desktopLocked).toBe(true);
    useWorkingCopyStore.getState().reset();
    expect(useWorkingCopyStore.getState().desktopLocked).toBe(false);
  });

  it("reset also clears phase results when locked", () => {
    useWorkingCopyStore.getState().recordPhase(phaseA);
    useWorkingCopyStore.getState().lockDesktop();
    useWorkingCopyStore.getState().reset();
    const s = useWorkingCopyStore.getState();
    expect(s.phaseResults).toEqual([]);
    expect(s.desktopLocked).toBe(false);
  });

  // recordAssignments convenience action (§7.7 gallery)

  it("recordAssignments creates a Phase C result with the given assignments", () => {
    const assignments = [
      {
        scope: "keyboard-default" as const,
        target: "",
        modality: "physical" as const,
        mechanisms: [{ patternId: "deadkey_single_tap", strategyId: "S-02" as const }],
        source: "user" as const,
      },
    ];
    useWorkingCopyStore.getState().recordAssignments(assignments);
    const s = useWorkingCopyStore.getState();
    expect(s.session.assignments).toHaveLength(1);
    expect(s.session.assignments[0]?.mechanisms[0]?.patternId).toBe("deadkey_single_tap");
  });

  it("recordAssignments replaces prior Phase C assignments (last-wins)", () => {
    const first = [
      {
        scope: "keyboard-default" as const,
        target: "",
        modality: "physical" as const,
        mechanisms: [{ patternId: "deadkey_single_tap" }],
      },
    ];
    const second = [
      {
        scope: "keyboard-default" as const,
        target: "",
        modality: "physical" as const,
        mechanisms: [{ patternId: "modifier_as_layer_switch" }],
      },
    ];
    useWorkingCopyStore.getState().recordAssignments(first);
    useWorkingCopyStore.getState().recordAssignments(second);
    const s = useWorkingCopyStore.getState();
    // mergeAssignments last-wins: same (modality, scope, target) key → second wins.
    expect(s.session.assignments).toHaveLength(1);
    expect(s.session.assignments[0]?.mechanisms[0]?.patternId).toBe("modifier_as_layer_switch");
  });

  it("recordAssignments with empty array clears Phase C assignments", () => {
    const assignments = [
      {
        scope: "individual" as const,
        target: "ŋ",
        modality: "physical" as const,
        mechanisms: [{ patternId: "deadkey_single_tap" }],
      },
    ];
    useWorkingCopyStore.getState().recordAssignments(assignments);
    useWorkingCopyStore.getState().recordAssignments([]);
    const s = useWorkingCopyStore.getState();
    expect(s.session.assignments).toHaveLength(0);
  });

  it("recordAssignments preserves existing Phase C selectedPatternIds", () => {
    const phaseC: SurveyPhaseResult = {
      phase: "C",
      answers: [],
      selectedPatternIds: ["deadkey_single_tap"],
      assignments: [],
    };
    useWorkingCopyStore.getState().recordPhase(phaseC);
    useWorkingCopyStore.getState().recordAssignments([
      {
        scope: "keyboard-default" as const,
        target: "",
        modality: "physical" as const,
        mechanisms: [{ patternId: "deadkey_single_tap" }],
      },
    ]);
    const s = useWorkingCopyStore.getState();
    expect(s.session.selectedPatternIds).toContain("deadkey_single_tap");
    expect(s.session.assignments).toHaveLength(1);
  });
});
