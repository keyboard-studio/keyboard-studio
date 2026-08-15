// Direct coverage for the REAL shipped FlowStepOptions records in
// flowStepOptions.tsx (spec 029 Stage 6, T005).
//
// makeFlowStepComponent.test.tsx exercises the FACTORY against synthetic
// buildTrackOptions()/buildSeedOptions() records, so trackOptions.extract,
// trackOptions.onCommit, and the whole of phaseFOptions were never run at
// all. This file drives the exported records directly, wiring their
// FlowStepDeps callbacks to the REAL zustand stores (wrapped in vi.fn spies
// so we can assert both call semantics and the resulting store state), reset
// between tests per the surveySessionStore.test.ts idiom.
//
// projectNameOptions is intentionally NOT covered here — it is already
// exercised end-to-end (real SurveyRunner, real YAML) by
// PhaseProjectName.integration.test.tsx.

import { describe, it, expect, vi, afterEach } from "vitest";
import { trackOptions, phaseFOptions, extractHelpDocs } from "./flowStepOptions.tsx";
import type { TrackPayload } from "./flowStepOptions.tsx";
import type { FlowStepDeps } from "./makeFlowStepComponent.tsx";
import pfContactInfoMod from "../../survey/questions/f/pf_contact_info.ts";
import pfCreditsMod from "../../survey/questions/f/pf_credits.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import type { HelpDocsAnswers, SurveyAnswer, SurveyPhaseResult } from "@keyboard-studio/contracts";

afterEach(() => {
  useSurveySessionStore.getState().reset();
  useWorkingCopyStore.getState().reset();
});

// ---------------------------------------------------------------------------
// Deps factory — wires FlowStepDeps callbacks to the REAL stores (via
// vi.fn spies that call through), so onCommit assertions verify both "was it
// called" and "did the store actually change".
// ---------------------------------------------------------------------------

function buildDeps(overrides?: Partial<FlowStepDeps>): {
  deps: FlowStepDeps;
  setSelectedTrackSpy: ReturnType<typeof vi.fn>;
  setScaffoldSpecSpy: ReturnType<typeof vi.fn>;
  setIdentitySpy: ReturnType<typeof vi.fn>;
  setHelpDocsSpy: ReturnType<typeof vi.fn>;
} {
  const setSelectedTrackSpy = vi.fn(
    (t: "copy" | "adapt" | null) => useSurveySessionStore.getState().setSelectedTrack(t),
  );
  const setScaffoldSpecSpy = vi.fn(
    (s: { keyboardId: string; displayName: string } | null) =>
      useSurveySessionStore.getState().setScaffoldSpec(s),
  );
  const setIdentitySpy = vi.fn(
    (patch: { keyboardId: string; displayName: string }) =>
      useWorkingCopyStore.getState().setIdentity(patch),
  );
  const setHelpDocsSpy = vi.fn(
    (patch: HelpDocsAnswers | null) => useWorkingCopyStore.getState().setHelpDocs(patch),
  );

  const deps: FlowStepDeps = {
    localBase: null,
    identityResult: null,
    surveyContext: {},
    setSelectedTrack: setSelectedTrackSpy,
    setScaffoldSpec: setScaffoldSpecSpy,
    setIdentity: setIdentitySpy,
    findingsByQuestionId: {},
    displayNameRef: { current: "" },
    selectedTrack: null,
    scaffoldSpec: null,
    setHelpDocs: setHelpDocsSpy,
    ...overrides,
  };

  return { deps, setSelectedTrackSpy, setScaffoldSpecSpy, setIdentitySpy, setHelpDocsSpy };
}

function buildResult(
  answers: SurveyPhaseResult["answers"],
): SurveyPhaseResult {
  return { phase: "G", answers, confirmedInventory: [] };
}

// ---------------------------------------------------------------------------
// trackOptions.buildContext
// ---------------------------------------------------------------------------

describe("trackOptions.buildContext", () => {
  it("returns base_name from localBase.displayName", () => {
    const { deps } = buildDeps({ localBase: { displayName: "English (US)" } });
    expect(trackOptions.buildContext(deps)).toEqual({ base_name: "English (US)" });
  });

  it("falls back to empty string when localBase is null", () => {
    const { deps } = buildDeps({ localBase: null });
    expect(trackOptions.buildContext(deps)).toEqual({ base_name: "" });
  });
});

// ---------------------------------------------------------------------------
// trackOptions.seeds — FR-031 (spec 057): arriving at the step (deep link or
// Back) shows the currently-recorded answer, never an empty radio group.
// ---------------------------------------------------------------------------

describe("trackOptions.seeds.getSeedValue (FR-031 recorded-answer prefill)", () => {
  it("seeds track_choice from the session's recorded selectedTrack", () => {
    const { deps } = buildDeps({ selectedTrack: "adapt" });
    expect(trackOptions.seeds!.getSeedValue("track_choice", deps)).toBe("adapt");
  });

  it("returns undefined before any track was ever chosen (field genuinely unset)", () => {
    const { deps } = buildDeps({ selectedTrack: null });
    expect(trackOptions.seeds!.getSeedValue("track_choice", deps)).toBeUndefined();
  });

  it("returns undefined for any other questionId", () => {
    const { deps } = buildDeps({ selectedTrack: "copy" });
    expect(trackOptions.seeds!.getSeedValue("some_other_question", deps)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// trackOptions.extract
// ---------------------------------------------------------------------------

describe("trackOptions.extract", () => {
  it("extracts {track:'copy'} from a select answer", () => {
    const result = buildResult([
      { questionId: "track_choice", answerType: "select", value: "copy" },
    ]);
    expect(trackOptions.extract(result)).toEqual({ track: "copy" });
  });

  it("extracts {track:'adapt'} from a text answer", () => {
    const result = buildResult([
      { questionId: "track_choice", answerType: "text", value: "adapt" },
    ]);
    expect(trackOptions.extract(result)).toEqual({ track: "adapt" });
  });

  it("returns undefined for a value other than 'copy'/'adapt'", () => {
    const result = buildResult([
      { questionId: "track_choice", answerType: "select", value: "something_else" },
    ]);
    expect(trackOptions.extract(result)).toBeUndefined();
  });

  it("returns undefined when track_choice is missing entirely", () => {
    const result = buildResult([]);
    expect(trackOptions.extract(result)).toBeUndefined();
  });

  it("returns undefined when the answerType is neither select nor text (e.g. boolean)", () => {
    const result = buildResult([
      { questionId: "track_choice", answerType: "boolean", value: true },
    ]);
    expect(trackOptions.extract(result)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// trackOptions.onCommit
// ---------------------------------------------------------------------------

describe("trackOptions.onCommit", () => {
  it("copy track: calls setSelectedTrack('copy') and does NOT call setScaffoldSpec", () => {
    const { deps, setSelectedTrackSpy, setScaffoldSpecSpy } = buildDeps();
    const extracted: TrackPayload = { track: "copy" };

    trackOptions.onCommit!(extracted, deps);

    expect(setSelectedTrackSpy).toHaveBeenCalledExactlyOnceWith("copy");
    expect(setScaffoldSpecSpy).not.toHaveBeenCalled();
    expect(useSurveySessionStore.getState().selectedTrack).toBe("copy");
  });

  it("adapt track: calls setSelectedTrack('adapt') AND setScaffoldSpec(null)", () => {
    const { deps, setSelectedTrackSpy, setScaffoldSpecSpy } = buildDeps();
    const extracted: TrackPayload = { track: "adapt" };

    trackOptions.onCommit!(extracted, deps);

    expect(setSelectedTrackSpy).toHaveBeenCalledExactlyOnceWith("adapt");
    expect(setScaffoldSpecSpy).toHaveBeenCalledExactlyOnceWith(null);
    expect(useSurveySessionStore.getState().selectedTrack).toBe("adapt");
    expect(useSurveySessionStore.getState().scaffoldSpec).toBeNull();
  });

  it("adapt track: setSelectedTrack fires BEFORE setScaffoldSpec (R7-style ordering within onCommit)", () => {
    const callOrder: string[] = [];
    const { deps } = buildDeps({
      setSelectedTrack: vi.fn((t) => {
        callOrder.push("setSelectedTrack");
        useSurveySessionStore.getState().setSelectedTrack(t);
      }),
      setScaffoldSpec: vi.fn((s) => {
        callOrder.push("setScaffoldSpec");
        useSurveySessionStore.getState().setScaffoldSpec(s);
      }),
    });

    trackOptions.onCommit!({ track: "adapt" }, deps);

    expect(callOrder).toEqual(["setSelectedTrack", "setScaffoldSpec"]);
  });

  it("copy track: a pre-existing scaffoldSpec is left untouched (copy does not clear it)", () => {
    useSurveySessionStore.getState().setScaffoldSpec({ keyboardId: "existing_kb", displayName: "Existing" });
    const { deps, setScaffoldSpecSpy } = buildDeps();

    trackOptions.onCommit!({ track: "copy" }, deps);

    expect(setScaffoldSpecSpy).not.toHaveBeenCalled();
    expect(useSurveySessionStore.getState().scaffoldSpec).toEqual({
      keyboardId: "existing_kb",
      displayName: "Existing",
    });
  });
});

// ---------------------------------------------------------------------------
// phaseFOptions.buildContext
// ---------------------------------------------------------------------------

describe("phaseFOptions.buildContext", () => {
  it("returns deps.surveyContext unchanged (direct passthrough — buildContext never reads a store itself)", () => {
    const ctx = { language_name: "Hausa", detected_group: "qwerty-qwertz", bcp47_tag: "ha-Latn" };
    const { deps } = buildDeps({ surveyContext: ctx });

    expect(phaseFOptions.buildContext(deps)).toEqual(ctx);
  });

  it("returns an empty object when deps.surveyContext is empty (default)", () => {
    const { deps } = buildDeps({ surveyContext: {} });
    expect(phaseFOptions.buildContext(deps)).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// phaseFOptions.extract
// ---------------------------------------------------------------------------

describe("phaseFOptions.extract", () => {
  it("returns the raw SurveyPhaseResult unchanged (identity extraction)", () => {
    const result = buildResult([
      { questionId: "some_question", answerType: "text", value: "some value" },
    ]);
    expect(phaseFOptions.extract(result)).toBe(result);
  });

  it("returns the result even when answers is empty (no-guard, always advances)", () => {
    const result = buildResult([]);
    expect(phaseFOptions.extract(result)).toBe(result);
  });
});

// ---------------------------------------------------------------------------
// phaseFOptions — record shape (flowRef / title / usesFindings / no onCommit)
// ---------------------------------------------------------------------------

describe("phaseFOptions — record shape", () => {
  it("has flowRef 'phase_f_helpdocs' and usesFindings true", () => {
    expect(phaseFOptions.flowRef).toBe("phase_f_helpdocs");
    expect(phaseFOptions.usesFindings).toBe(true);
  });

  it("declares an onCommit (spec 061: wires help-docs answers into the working copy)", () => {
    expect(phaseFOptions.onCommit).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// phaseFOptions.onCommit (spec 061)
// ---------------------------------------------------------------------------

function buildResultG(answers: SurveyAnswer[]): SurveyPhaseResult {
  return { phase: "G", answers };
}

describe("phaseFOptions.onCommit", () => {
  it("calls setHelpDocs when the required description is answered", () => {
    const { deps, setHelpDocsSpy } = buildDeps();
    const result = buildResultG([
      { questionId: "pf_welcome_paragraph", answerType: "text", value: "A keyboard for Piaroa." },
    ]);

    phaseFOptions.onCommit!(result, deps);

    expect(setHelpDocsSpy).toHaveBeenCalledExactlyOnceWith({
      description: "A keyboard for Piaroa.",
      usageTips: [],
    });
    expect(useWorkingCopyStore.getState().helpDocs).toEqual({
      description: "A keyboard for Piaroa.",
      usageTips: [],
    });
  });

  it("does NOT call setHelpDocs when the description is blank", () => {
    const { deps, setHelpDocsSpy } = buildDeps();
    const result = buildResultG([]);

    phaseFOptions.onCommit!(result, deps);

    expect(setHelpDocsSpy).not.toHaveBeenCalled();
    expect(useWorkingCopyStore.getState().helpDocs).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractHelpDocs (spec 061 US1/US3/US4)
// ---------------------------------------------------------------------------

function textAnswer(questionId: string, value: string): SurveyAnswer {
  return { questionId, answerType: "text", value };
}

describe("extractHelpDocs — US1 required description", () => {
  it("returns { description, usageTips: [] } when only the description is answered", () => {
    const result = buildResultG([textAnswer("pf_welcome_paragraph", "A keyboard for Piaroa.")]);
    expect(extractHelpDocs(result)).toEqual({
      description: "A keyboard for Piaroa.",
      usageTips: [],
    });
  });

  it("returns undefined when the description is absent", () => {
    expect(extractHelpDocs(buildResultG([]))).toBeUndefined();
  });

  it("returns undefined when the description is whitespace-only", () => {
    const result = buildResultG([textAnswer("pf_welcome_paragraph", "   ")]);
    expect(extractHelpDocs(result)).toBeUndefined();
  });
});

describe("extractHelpDocs — US3 optional default-path answers", () => {
  it("captures usageTips from pf_usage_tip_1/_2, credits, contactInfo", () => {
    const result = buildResultG([
      textAnswer("pf_welcome_paragraph", "A keyboard for Piaroa."),
      textAnswer("pf_usage_tip_1", "Type slowly at first."),
      textAnswer("pf_usage_tip_2", "Long-press for accents."),
      textAnswer("pf_credits", "Jane Doe"),
      textAnswer("pf_contact_info", "jane@example.com"),
    ]);
    expect(extractHelpDocs(result)).toEqual({
      description: "A keyboard for Piaroa.",
      usageTips: ["Type slowly at first.", "Long-press for accents."],
      credits: "Jane Doe",
      contactInfo: "jane@example.com",
    });
  });

  it("does NOT read pf_usage_tip_3/_4/_5 — only _1/_2 are reachable (research D-11)", () => {
    const result = buildResultG([
      textAnswer("pf_welcome_paragraph", "A keyboard for Piaroa."),
      textAnswer("pf_usage_tip_3", "should never be read"),
    ]);
    expect(extractHelpDocs(result)?.usageTips).toEqual([]);
  });

  it("splits a two-line pf_project_url answer into projectHomeUrl/projectHelpUrl", () => {
    const result = buildResultG([
      textAnswer("pf_welcome_paragraph", "A keyboard for Piaroa."),
      textAnswer("pf_project_url", "https://example.com\nhttps://example.com/help"),
    ]);
    expect(extractHelpDocs(result)).toEqual({
      description: "A keyboard for Piaroa.",
      usageTips: [],
      projectHomeUrl: "https://example.com",
      projectHelpUrl: "https://example.com/help",
    });
  });

  it("populates only projectHomeUrl when pf_project_url has a single line", () => {
    const result = buildResultG([
      textAnswer("pf_welcome_paragraph", "A keyboard for Piaroa."),
      textAnswer("pf_project_url", "https://example.com"),
    ]);
    const extracted = extractHelpDocs(result);
    expect(extracted?.projectHomeUrl).toBe("https://example.com");
    expect(extracted?.projectHelpUrl).toBeUndefined();
  });
});

describe("extractHelpDocs — US4 opt-in additional-detail battery", () => {
  it("captures all eleven opt-in fields when answered (FR-011/FR-014)", () => {
    const result = buildResultG([
      textAnswer("pf_welcome_paragraph", "A keyboard for Piaroa."),
      textAnswer("pf_design_rationale", "a"),
      textAnswer("pf_font_guidance", "b"),
      textAnswer("pf_canonical_order", "c"),
      textAnswer("pf_script_glossary", "d"),
      textAnswer("pf_example_words", "e"),
      textAnswer("pf_scope_variety", "f"),
      textAnswer("pf_provenance_basis", "g"),
      textAnswer("pf_troubleshooting", "h"),
      textAnswer("pf_known_limitations", "i"),
      textAnswer("pf_related_keyboards", "j"),
      textAnswer("pf_further_reading", "k"),
    ]);
    expect(extractHelpDocs(result)).toEqual({
      description: "A keyboard for Piaroa.",
      usageTips: [],
      designRationale: "a",
      fontGuidance: "b",
      canonicalOrder: "c",
      scriptGlossary: "d",
      exampleWords: "e",
      scopeVariety: "f",
      provenanceBasis: "g",
      troubleshooting: "h",
      knownLimitations: "i",
      relatedKeyboards: "j",
      furtherReading: "k",
    });
  });

  // Acceptance Scenario 2 (spec.md US4): validates the EXISTING survey
  // routing carries through unchanged, not new generation logic — a
  // Latin-script session never reaches pf_canonical_order, so it is simply
  // absent from the result's answers; a non-Latin-script session's result
  // carries it. extractHelpDocs's own job is only to read what is present.
  it("includes canonicalOrder only when the survey routed the author to it", () => {
    const nonLatin = buildResultG([
      textAnswer("pf_welcome_paragraph", "A keyboard for Dagbani."),
      textAnswer("pf_canonical_order", "Base then mark, left to right."),
    ]);
    expect(extractHelpDocs(nonLatin)?.canonicalOrder).toBe("Base then mark, left to right.");

    const latin = buildResultG([textAnswer("pf_welcome_paragraph", "A keyboard for French.")]);
    expect(extractHelpDocs(latin)?.canonicalOrder).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// phaseFOptions.seeds — pf_contact_info pre-fill (spec 064 FR-016)
//
// The contact is captured once during attribution and published into
// SurveyContext as `author_contact`; Phase F pre-fills from it instead of asking
// again. The seam is INERT until that producer exists, which is what the
// "absent" cases below pin — so landing this early cannot change today's
// behaviour.
// ---------------------------------------------------------------------------

describe("phaseFOptions.seeds — pf_contact_info pre-fill", () => {
  function seed(questionId: string, ctx: Record<string, string | undefined>) {
    const { deps } = buildDeps({ surveyContext: ctx });
    return phaseFOptions.seeds?.getSeedValue(questionId, deps);
  }

  it("declares a seeds block", () => {
    expect(phaseFOptions.seeds).toBeDefined();
  });

  it("pre-fills pf_contact_info from surveyContext.author_contact", () => {
    expect(seed("pf_contact_info", { author_contact: "info@bafutliteracy.org" })).toBe(
      "info@bafutliteracy.org",
    );
  });

  // Inert-today guarantee: nothing writes author_contact until spec 064 lands.
  it("returns undefined when author_contact is absent (today's behaviour, unchanged)", () => {
    expect(seed("pf_contact_info", {})).toBeUndefined();
  });

  it("returns undefined when author_contact is empty rather than seeding a blank", () => {
    expect(seed("pf_contact_info", { author_contact: "" })).toBeUndefined();
  });

  // Thanking and owning are different: shipped credits sections acknowledge
  // advisors and contributors who hold no copyright, so seeding the holder here
  // would produce duplicated boilerplate.
  it("does NOT seed pf_credits, even when a holder-ish context value is present", () => {
    expect(seed("pf_credits", { author_contact: "info@example.org" })).toBeUndefined();
    expect(seed("pf_credits", { copyright_holder: "SIL Global" })).toBeUndefined();
  });

  it("seeds no other Phase F question", () => {
    for (const id of [
      "pf_welcome_paragraph",
      "pf_usage_tip_1",
      "pf_more_detail_gate",
      "pf_font_guidance",
      "pf_project_url",
    ]) {
      expect(seed(id, { author_contact: "info@example.org" }), `${id} must not be seeded`).toBeUndefined();
    }
  });

  // Pre-filled is not the same as required — the whole point of the answer to
  // "should credits and contact be optional?".
  it("pre-filling does not make either question required", () => {
    expect(pfContactInfoMod.definition.required).toBe(false);
    expect(pfCreditsMod.definition.required).toBe(false);
  });
});
