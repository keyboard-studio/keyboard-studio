// see spec.md §7.1 §7.2 §8 — shape + merge-semantics tests for SurveySession,
// mergePhaseResults(), and updateIrAxes(). Strict tsconfig applies
// (exactOptionalPropertyTypes + noUncheckedIndexedAccess).

import { describe, it, expect } from "vitest";
import type { SurveySession } from "./surveySession";
import { mergePhaseResults, updateIrAxes } from "./surveySession";
import type { SurveyPhaseResult } from "./surveyPhaseResult";
import type { DiscoveryAxisVector } from "./axes";

// ---------------------------------------------------------------------------
// SurveySession interface shape
// ---------------------------------------------------------------------------

describe("SurveySession interface", () => {
  it("requires axes, irAxes, phaseResults, selectedPatternIds", () => {
    const s: SurveySession = {
      axes: {},
      irAxes: {},
      phaseResults: [],
      selectedPatternIds: [],
      assignments: [],
    };
    expect(s.axes).toEqual({});
    expect(s.irAxes).toEqual({});
    expect(s.phaseResults).toHaveLength(0);
    expect(s.selectedPatternIds).toHaveLength(0);
  });

  it("axes accepts a Partial<DiscoveryAxisVector> with a subset of fields", () => {
    const s: SurveySession = {
      axes: { scriptClass: "abugida", scale: "small" },
      irAxes: {},
      phaseResults: [],
      selectedPatternIds: [],
      assignments: [],
    };
    expect(s.axes.scriptClass).toBe("abugida");
    expect(s.axes.scale).toBe("small");
    expect(s.axes.phoneticIntuition).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// mergePhaseResults()
// ---------------------------------------------------------------------------

describe("mergePhaseResults()", () => {
  it("empty phases with empty irAxes yields axes={}, selectedPatternIds=[], assignments=[]", () => {
    const session = mergePhaseResults({}, []);
    expect(session.axes).toEqual({});
    expect(session.selectedPatternIds).toEqual([]);
    expect(session.assignments).toEqual([]);
    expect(session.phaseResults).toHaveLength(0);
  });

  it("collects assignments across phases, last-wins per modality+scope+target", () => {
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
        {
          scope: "individual",
          target: "ŋ",
          modality: "physical",
          mechanisms: [{ patternId: "direct_key_swap" }],
        },
      ],
    };
    // A later gallery re-pass overrides the default and adds a touch assignment.
    const phaseE: SurveyPhaseResult = {
      phase: "E",
      answers: [],
      assignments: [
        {
          scope: "keyboard-default",
          target: "",
          modality: "physical",
          mechanisms: [{ patternId: "latin_deadkey_acute_single", strategyId: "S-02" }, { patternId: "ralt_layer" }],
        },
        {
          scope: "keyboard-default",
          target: "",
          modality: "touch",
          mechanisms: [{ patternId: "longpress_alternates", strategyId: "S-13" }],
        },
      ],
    };
    const session = mergePhaseResults({}, [phaseC, phaseE]);
    // physical default replaced by the later phase (2 mechanisms), individual kept, touch added.
    expect(session.assignments).toHaveLength(3);
    const physDefault = session.assignments.find(
      (a) => a.modality === "physical" && a.scope === "keyboard-default"
    );
    expect(physDefault?.mechanisms).toHaveLength(2);
    expect(
      session.assignments.some((a) => a.modality === "touch")
    ).toBe(true);
  });

  it("irAxes baseline appears in axes when no phases override it", () => {
    const irAxes: Partial<DiscoveryAxisVector> = {
      scale: "large",
      phoneticIntuition: "weak",
    };
    const session = mergePhaseResults(irAxes, []);
    expect(session.axes.scale).toBe("large");
    expect(session.axes.phoneticIntuition).toBe("weak");
    expect(session.irAxes).toEqual(irAxes);
  });

  it("phase computedAxes override irAxes baseline for the same key", () => {
    const phaseA: SurveyPhaseResult = {
      phase: "A",
      answers: [],
      computedAxes: { scale: "medium" },
    };
    const session = mergePhaseResults({ scale: "large" }, [phaseA]);
    expect(session.axes.scale).toBe("medium");
    expect(session.irAxes.scale).toBe("large");
  });

  it("later phase overrides earlier phase for the same axis", () => {
    const phaseA: SurveyPhaseResult = {
      phase: "A",
      answers: [],
      computedAxes: { scriptClass: "alphabetic" },
    };
    const phaseB: SurveyPhaseResult = {
      phase: "B",
      answers: [],
      computedAxes: { scriptClass: "abjad" },
    };
    const session = mergePhaseResults({}, [phaseA, phaseB]);
    expect(session.axes.scriptClass).toBe("abjad");
  });

  it("Phase C adds A2a without clobbering A2 from Phase A", () => {
    const phaseA: SurveyPhaseResult = {
      phase: "A",
      answers: [],
      computedAxes: { scriptClass: "abjad" },
    };
    const phaseC: SurveyPhaseResult = {
      phase: "C",
      answers: [],
      computedAxes: { clusterSensitivity: true },
    };
    const session = mergePhaseResults({}, [phaseA, phaseC]);
    expect(session.axes.scriptClass).toBe("abjad");
    expect(session.axes.clusterSensitivity).toBe(true);
  });

  it("selectedPatternIds deduplicates across phases", () => {
    const phaseA: SurveyPhaseResult = {
      phase: "A",
      answers: [],
      selectedPatternIds: ["latin_deadkey_acute_single", "nfd_normalization"],
    };
    const phaseB: SurveyPhaseResult = {
      phase: "B",
      answers: [],
      selectedPatternIds: ["nfd_normalization", "longpress_alternates"],
    };
    const session = mergePhaseResults({}, [phaseA, phaseB]);
    expect(session.selectedPatternIds).toEqual([
      "latin_deadkey_acute_single",
      "nfd_normalization",
      "longpress_alternates",
    ]);
  });

  it("phases with no computedAxes do not clear accumulated axes", () => {
    const phaseA: SurveyPhaseResult = {
      phase: "A",
      answers: [],
      computedAxes: { scriptClass: "alphabetic" },
    };
    const phaseB: SurveyPhaseResult = {
      phase: "B",
      answers: [],
      // no computedAxes
    };
    const session = mergePhaseResults({}, [phaseA, phaseB]);
    expect(session.axes.scriptClass).toBe("alphabetic");
  });

  it("phaseResults field on returned session equals the passed array", () => {
    const phases: SurveyPhaseResult[] = [
      { phase: "A", answers: [] },
      { phase: "B", answers: [] },
    ];
    const session = mergePhaseResults({}, phases);
    expect(session.phaseResults).toBe(phases);
  });

  it("irAxes field on returned session equals the passed irAxes object", () => {
    const irAxes: Partial<DiscoveryAxisVector> = { scale: "small" };
    const session = mergePhaseResults(irAxes, []);
    expect(session.irAxes).toEqual(irAxes);
  });
});

// ---------------------------------------------------------------------------
// updateIrAxes()
// ---------------------------------------------------------------------------

describe("updateIrAxes()", () => {
  it("re-merges with new irAxes and preserves phaseResults", () => {
    const phases: SurveyPhaseResult[] = [
      {
        phase: "A",
        answers: [],
        computedAxes: { scriptClass: "alphabetic" },
      },
    ];
    const original = mergePhaseResults({ scale: "small" }, phases);
    const updated = updateIrAxes(original, { scale: "large" });

    expect(updated.axes.scale).toBe("large");
    expect(updated.axes.scriptClass).toBe("alphabetic");
    expect(updated.irAxes.scale).toBe("large");
    expect(updated.phaseResults).toBe(phases);
  });

  it("survey phase axes still override the updated irAxes", () => {
    const phases: SurveyPhaseResult[] = [
      { phase: "B", answers: [], computedAxes: { scale: "tiny" } },
    ];
    const session = mergePhaseResults({ scale: "massive" }, phases);
    const updated = updateIrAxes(session, { scale: "large" });
    expect(updated.axes.scale).toBe("tiny");
  });
});
