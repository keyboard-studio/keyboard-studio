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
import { trackOptions, phaseFOptions } from "./flowStepOptions.tsx";
import type { TrackPayload } from "./flowStepOptions.tsx";
import type { FlowStepDeps } from "./makeFlowStepComponent.tsx";
import pfContactInfoMod from "../../survey/questions/f/pf_contact_info.ts";
import pfCreditsMod from "../../survey/questions/f/pf_credits.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";

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

  const deps: FlowStepDeps = {
    localBase: null,
    identityResult: null,
    surveyContext: {},
    setSelectedTrack: setSelectedTrackSpy,
    setScaffoldSpec: setScaffoldSpecSpy,
    setIdentity: setIdentitySpy,
    findingsByQuestionId: {},
    displayNameRef: { current: "" },
    ...overrides,
  };

  return { deps, setSelectedTrackSpy, setScaffoldSpecSpy, setIdentitySpy };
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

  it("declares no onCommit (PhaseFAdapter had no pre-onComplete store writes)", () => {
    expect(phaseFOptions.onCommit).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// phaseFOptions.seeds — pf_contact_info pre-fill (spec 059 FR-016)
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

  // Inert-today guarantee: nothing writes author_contact until spec 059 lands.
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
