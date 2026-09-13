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
import pfWelcomeParagraphMod from "../../survey/questions/f/pf_welcome_paragraph.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import type {
  BaseDocumentationProfile,
  HelpDocsAnswers,
  HistoryEntryState,
  SurveyAnswer,
  SurveyPhaseResult,
} from "@keyboard-studio/contracts";

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
  setHistoryEntryStateSpy: ReturnType<typeof vi.fn>;
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
  const setHistoryEntryStateSpy = vi.fn(
    (state: HistoryEntryState | null) => useWorkingCopyStore.getState().setHistoryEntryState(state),
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
    historyEntryState: null,
    setHistoryEntryState: setHistoryEntryStateSpy,
    ...overrides,
  };

  return {
    deps,
    setSelectedTrackSpy,
    setScaffoldSpecSpy,
    setIdentitySpy,
    setHelpDocsSpy,
    setHistoryEntryStateSpy,
  };
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
  it("passes deps.surveyContext through, plus the (empty, undrived-yet) HISTORY tokens", () => {
    const ctx = { language_name: "Hausa", detected_group: "qwerty-qwertz", bcp47_tag: "ha-Latn" };
    const { deps } = buildDeps({ surveyContext: ctx });

    expect(phaseFOptions.buildContext(deps)).toEqual({
      ...ctx,
      history_heading: "",
      history_bullets: "",
    });
  });

  it("returns just the (empty) HISTORY tokens when deps.surveyContext is empty (default)", () => {
    const { deps } = buildDeps({ surveyContext: {} });
    expect(phaseFOptions.buildContext(deps)).toEqual({ history_heading: "", history_bullets: "" });
  });

  // spec 076 US5: once onMount has derived a proposal (historyEntryState
  // non-null), buildContext injects its heading + bullets as tokens
  // pf_history_entry.ts's help_text interpolates.
  it("injects history_heading / history_bullets from a derived historyEntryState", () => {
    const state: HistoryEntryState = {
      status: "proposed",
      proposal: { version: "1.1", dateIso: "2026-01-15", bullets: ["Added 2 characters: é, è"] },
      editedBullets: null,
    };
    const { deps } = buildDeps({ historyEntryState: state });

    const ctx = phaseFOptions.buildContext(deps);
    expect(ctx["history_heading"]).toBe("## 1.1 (2026-01-15)");
    expect(ctx["history_bullets"]).toBe("- Added 2 characters: é, è");
  });

  it("prefers editedBullets over the drafted proposal.bullets once the author has edited", () => {
    const state: HistoryEntryState = {
      status: "edited",
      proposal: { version: "1.1", dateIso: "2026-01-15", bullets: ["drafted bullet"] },
      editedBullets: ["My own bullet one", "My own bullet two"],
    };
    const { deps } = buildDeps({ historyEntryState: state });

    expect(phaseFOptions.buildContext(deps)["history_bullets"]).toBe(
      "- My own bullet one\n- My own bullet two",
    );
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
// phaseFOptions.onMount (spec 076 US5) — derives the HISTORY proposal once
// per mount, identity-guarded against re-stamping dateIso on a same-version
// re-derivation.
// ---------------------------------------------------------------------------

describe("phaseFOptions.onMount", () => {
  it("declares onMount", () => {
    expect(phaseFOptions.onMount).toBeDefined();
  });

  it("derives a fresh 'proposed' state on first mount (previous === null)", () => {
    const { deps, setHistoryEntryStateSpy } = buildDeps({ historyEntryState: null });

    phaseFOptions.onMount!(deps);

    expect(setHistoryEntryStateSpy).toHaveBeenCalledTimes(1);
    const written = useWorkingCopyStore.getState().historyEntryState;
    expect(written?.status).toBe("proposed");
    expect(written?.proposal.version).toBe("1.0"); // no baseIr set -> "1.0" default
    expect(written?.proposal.bullets).toEqual(["Initial release."]); // empty decision record
  });

  // research R12: a re-derivation at the SAME version must not re-stamp
  // dateIso (or fire a redundant store write at all — identity-guarded).
  it("an unchanged version does not re-stamp the stored dateIso, and does not write again", () => {
    const previous: HistoryEntryState = {
      status: "confirmed",
      proposal: { version: "1.0", dateIso: "2020-01-01", bullets: ["Initial release."] },
      editedBullets: null,
    };
    const { deps, setHistoryEntryStateSpy } = buildDeps({ historyEntryState: previous });

    phaseFOptions.onMount!(deps);

    expect(setHistoryEntryStateSpy).not.toHaveBeenCalled();
  });

  it("a version bump (adaptation) re-derives the heading but PRESERVES the original dateIso and status", () => {
    useWorkingCopyStore.setState({ instantiationMode: "adapt-existing" });
    const previous: HistoryEntryState = {
      status: "confirmed",
      proposal: { version: "1.0", dateIso: "2020-01-01", bullets: ["Initial release."] },
      editedBullets: null,
    };
    const { deps, setHistoryEntryStateSpy } = buildDeps({ historyEntryState: previous });

    phaseFOptions.onMount!(deps);

    expect(setHistoryEntryStateSpy).toHaveBeenCalledTimes(1);
    const written = useWorkingCopyStore.getState().historyEntryState;
    expect(written?.proposal.version).toBe("1.1"); // bumpKeyboardVersion("1.0")
    expect(written?.proposal.dateIso).toBe("2020-01-01"); // preserved, not re-stamped
    expect(written?.status).toBe("confirmed"); // carried forward untouched
  });
});

// ---------------------------------------------------------------------------
// phaseFOptions.onCommit — pf_history_entry confirm/edit/dismiss (spec 076 US5)
// ---------------------------------------------------------------------------

function historyResult(
  action: "confirm" | "edit" | "dismiss" | "",
  bulletsText?: string,
): SurveyPhaseResult {
  const answers: SurveyAnswer[] = [];
  if (action !== "") {
    answers.push({ questionId: "pf_history_entry", answerType: "select", value: action });
  }
  if (bulletsText !== undefined) {
    answers.push({ questionId: "pf_history_entry_bullets", answerType: "text", value: bulletsText });
  }
  return buildResultG(answers);
}

const PROPOSED: HistoryEntryState = {
  status: "proposed",
  proposal: { version: "1.0", dateIso: "2026-01-15", bullets: ["Initial release."] },
  editedBullets: null,
};

describe("phaseFOptions.onCommit — pf_history_entry", () => {
  it("confirm: reaches the store as status 'confirmed', editedBullets cleared", () => {
    const { deps, setHistoryEntryStateSpy } = buildDeps({ historyEntryState: PROPOSED });

    phaseFOptions.onCommit!(historyResult("confirm"), deps);

    expect(setHistoryEntryStateSpy).toHaveBeenCalledExactlyOnceWith({
      ...PROPOSED,
      status: "confirmed",
      editedBullets: null,
    });
    expect(useWorkingCopyStore.getState().historyEntryState?.status).toBe("confirmed");
  });

  it("edit: reaches the store as status 'edited' with the author's parsed bullets", () => {
    const { deps } = buildDeps({ historyEntryState: PROPOSED });

    phaseFOptions.onCommit!(historyResult("edit", "My rewritten bullet.\nA second one."), deps);

    const written = useWorkingCopyStore.getState().historyEntryState;
    expect(written?.status).toBe("edited");
    expect(written?.editedBullets).toEqual(["My rewritten bullet.", "A second one."]);
  });

  it("dismiss: reaches the store as status 'dismissed', editedBullets cleared", () => {
    const { deps } = buildDeps({ historyEntryState: PROPOSED });

    phaseFOptions.onCommit!(historyResult("dismiss"), deps);

    expect(useWorkingCopyStore.getState().historyEntryState?.status).toBe("dismissed");
    expect(useWorkingCopyStore.getState().historyEntryState?.editedBullets).toBeNull();
  });

  it("blank/absent answer (not yet decided): does NOT touch the store", () => {
    const { deps, setHistoryEntryStateSpy } = buildDeps({ historyEntryState: PROPOSED });

    phaseFOptions.onCommit!(historyResult(""), deps);

    expect(setHistoryEntryStateSpy).not.toHaveBeenCalled();
    expect(useWorkingCopyStore.getState().historyEntryState).toBeNull(); // reset() default
  });

  it("does nothing when historyEntryState is null (onMount never ran — defensive)", () => {
    const { deps, setHistoryEntryStateSpy } = buildDeps({ historyEntryState: null });

    phaseFOptions.onCommit!(historyResult("confirm"), deps);

    expect(setHistoryEntryStateSpy).not.toHaveBeenCalled();
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

// ---------------------------------------------------------------------------
// phaseFOptions.seeds — pf_welcome_paragraph adaptive description proposal
// (spec 076 FR-009, US4). Reads the four working-copy slices directly off
// useWorkingCopyStore.getState() (not FlowStepDeps — see
// readAdaptiveDescriptionContext's doc in flowStepOptions.tsx), so these
// tests set up REAL store state rather than passing it through `deps`.
// End-to-end coverage (the seed actually reaching SurveyRunner's rendered
// input, and the required-override actually gating Next) lives in
// survey/PhaseFAdaptiveDescription.integration.test.tsx (SC-005).
// ---------------------------------------------------------------------------

const FULL_PROFILE: BaseDocumentationProfile = {
  level: "full",
  members: ["welcome-htm"],
  welcomeConvention: "folder",
  hasUsableDescription: true,
  welcomeImages: [],
};

const NONE_PROFILE: BaseDocumentationProfile = {
  level: "none",
  members: [],
  welcomeConvention: "absent",
  hasUsableDescription: false,
  welcomeImages: [],
};

describe("phaseFOptions.seeds — pf_welcome_paragraph adaptive description (spec 076 FR-009)", () => {
  it("declares getRequiredOverride", () => {
    expect(phaseFOptions.seeds?.getRequiredOverride).toBeDefined();
  });

  it("adapt-full: seeds the base's usable description and waives required", () => {
    useWorkingCopyStore.setState({
      instantiationMode: "adapt-existing",
      baseDocProfile: FULL_PROFILE,
      baseWelcomeHtmText: "<p>This keyboard lets you type Bafut on any computer.</p>",
      baseHelpPhpText: null,
    });
    const { deps } = buildDeps();

    expect(phaseFOptions.seeds?.getSeedValue("pf_welcome_paragraph", deps)).toBe(
      "This keyboard lets you type Bafut on any computer.",
    );
    expect(phaseFOptions.seeds?.getRequiredOverride?.("pf_welcome_paragraph", deps)).toBe(false);
  });

  it("net-new (new-from-base): never seeds, required override stays true (today's behavior)", () => {
    useWorkingCopyStore.setState({
      instantiationMode: "new-from-base",
      baseDocProfile: FULL_PROFILE,
      baseWelcomeHtmText: "<p>This keyboard lets you type Bafut on any computer.</p>",
      baseHelpPhpText: null,
    });
    const { deps } = buildDeps();

    expect(phaseFOptions.seeds?.getSeedValue("pf_welcome_paragraph", deps)).toBeUndefined();
    // requiredWhen(ctx) always resolves a defined boolean (never undefined) —
    // `true` here means "use the static required:true", the same outcome as
    // no override at all (SurveyRunner's displayQ ends up required either way).
    expect(phaseFOptions.seeds?.getRequiredOverride?.("pf_welcome_paragraph", deps)).toBe(true);
  });

  it("copy track (Track 1, instantiationMode never set to adapt-existing): never seeds", () => {
    const { deps } = buildDeps();
    // Default reset() state: instantiationMode is null.
    expect(phaseFOptions.seeds?.getSeedValue("pf_welcome_paragraph", deps)).toBeUndefined();
    expect(phaseFOptions.seeds?.getRequiredOverride?.("pf_welcome_paragraph", deps)).toBe(true);
  });

  it("adapt track, base classified none: never seeds", () => {
    useWorkingCopyStore.setState({
      instantiationMode: "adapt-existing",
      baseDocProfile: NONE_PROFILE,
      baseWelcomeHtmText: null,
      baseHelpPhpText: null,
    });
    const { deps } = buildDeps();

    expect(phaseFOptions.seeds?.getSeedValue("pf_welcome_paragraph", deps)).toBeUndefined();
    expect(phaseFOptions.seeds?.getRequiredOverride?.("pf_welcome_paragraph", deps)).toBe(true);
  });

  it("does not disturb pf_welcome_paragraph's static required:true default", () => {
    // The runtime override is applied by SurveyRunner (getRequiredOverride),
    // never by mutating the module's own static definition.
    expect(pfWelcomeParagraphMod.definition.required).toBe(true);
  });
});
