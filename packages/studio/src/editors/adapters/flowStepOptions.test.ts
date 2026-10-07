// Direct coverage for the REAL shipped FlowStepOptions records in
// flowStepOptions.tsx (spec 029 Stage 6, T005).
//
// makeFlowStepComponent.test.tsx exercises the FACTORY against synthetic
// buildTrackOptions()/buildSeedOptions() records, so trackOptions.extract
// and the whole of phaseFOptions were never run at all. This file drives
// the exported records directly against the REAL zustand stores, reset
// between tests by the global test setup.
//
// Spec 089: the records no longer carry onCommit — a completion's store
// effects are the question modules' applies (the identity composition is
// pinned in decisions/identitySelectors.test.ts; the Phase F composition in
// decisions/helpDocsFromDecisions.test.ts; the runner in
// steps/applyDecisionEffects.test.ts). What remains here is what the
// records still own: buildContext, seeds, extract, and phaseF's onMount
// HISTORY-proposal derivation.
//
// projectNameOptions seed policy (English-preferred keyboard id, FR-031) is
// covered below; end-to-end SurveyRunner coverage remains in
// PhaseProjectName.integration.test.tsx.

import { describe, it, expect } from "vitest";
import {
  trackOptions,
  phaseFOptions,
  projectNameOptions,
  slugRetainsMostLetters,
} from "./flowStepOptions.tsx";
import type { FlowStepDeps } from "./makeFlowStepComponent.tsx";
import { createVirtualFS, makeBaseKeyboard, slugifyKeyboardId } from "@keyboard-studio/contracts";
import pfMoreDetailGateMod from "../../survey/questions/f/pf_more_detail_gate.ts";
import pfDocLanguageMod from "../../survey/questions/f/pf_doc_language.ts";
import pfHistoryEntryMod from "../../survey/questions/f/pf_history_entry.ts";
import pfContactInfoMod from "../../survey/questions/f/pf_contact_info.ts";
import pfCreditsMod from "../../survey/questions/f/pf_credits.ts";
import pfWelcomeParagraphMod from "../../survey/questions/f/pf_welcome_paragraph.ts";

import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import type { Decision, DecisionId, DecisionSet } from "../../decisions/decisionTypes.ts";
import type {
  BaseDocumentationProfile,
  HistoryEntryState,
  SurveyPhaseResult,
} from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Deps factory — plain FlowStepDeps values over a hand-built decision set
// (spec 089: the records read derived values, never store setters).
// ---------------------------------------------------------------------------

/** Build a DecisionSet from raw values, as recordAnswersAsDecisions records them. */
function decisionSet(values: Partial<Record<DecisionId, unknown>>): DecisionSet {
  const set: Partial<Record<DecisionId, Decision<unknown>>> = {};
  for (const [id, value] of Object.entries(values)) {
    set[id as DecisionId] = { id: id as DecisionId, value, provenance: "asked" };
  }
  return set;
}


function buildDeps(overrides?: Partial<FlowStepDeps>): { deps: FlowStepDeps } {
  const deps: FlowStepDeps = {
    localBase: null,
    decisions: {},
    surveyContext: {},
    findingsByQuestionId: {},
    displayNameRef: { current: "" },
    selectedTrack: null,
    historyEntryState: null,
    ...overrides,
  };
  return { deps };
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
  it("seeds track_choice from the recorded track (deps.selectedTrack)", () => {
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
// projectNameOptions.seeds — English-preferred keyboard id (#1777) + FR-031
// ---------------------------------------------------------------------------

describe("slugRetainsMostLetters", () => {
  it("accepts a slug that keeps most ASCII letters", () => {
    expect(slugRetainsMostLetters("Ewondo (AZERTY)", "ewondo_azerty")).toBe(true);
  });

  it("rejects a slug that collapses non-decomposing letters (Bafut autonym)", () => {
    // slugifyKeyboardId("Bɨfɨɨ̀") → "b_f" — only 2 of 5 letters survive
    expect(slugRetainsMostLetters("Bɨfɨɨ̀", "b_f")).toBe(false);
  });
});

describe("projectNameOptions.seeds.getSeedValue (English-preferred keyboard id)", () => {
  // Spec 089: the identity the seeds read is derived from the recorded
  // decisions (language-autonym / language-name / target-script).
  const bafutDecisions = decisionSet({
    "language-autonym": "Bɨfɨɨ̀",
    "language-name": "Bafut",
    "language-code": "bfd",
    "target-script": "Latn",
  });

  it("seeds project_display_name from the autonym", () => {
    const { deps } = buildDeps({ decisions: bafutDecisions });
    expect(projectNameOptions.seeds!.getSeedValue("project_display_name", deps)).toBe(
      "Bɨfɨɨ̀",
    );
  });

  it("seeds project_keyboard_id from the English name when the display name is the autonym", () => {
    const { deps } = buildDeps({
      decisions: bafutDecisions,
      displayNameRef: { current: "Bɨfɨɨ̀" },
    });
    expect(projectNameOptions.seeds!.getSeedValue("project_keyboard_id", deps)).toBe(
      "bafut",
    );
    // Contrast: slugifying the autonym alone would lose most letters.
    expect(slugifyKeyboardId("Bɨfɨɨ̀")).toBe("b_f");
  });

  it("falls back to the display-name slug when English is empty", () => {
    const { deps } = buildDeps({
      decisions: decisionSet({
        "language-autonym": "Hausa",
        "language-name": "",
        "language-code": "ha",
        "target-script": "Latn",
      }),
      displayNameRef: { current: "Hausa" },
    });
    expect(projectNameOptions.seeds!.getSeedValue("project_keyboard_id", deps)).toBe(
      "hausa",
    );
  });

  it("re-derives from an edited display name that slugifies cleanly", () => {
    const { deps } = buildDeps({
      decisions: decisionSet({
        "language-autonym": "Ewondo",
        "language-name": "Ewondo",
        "language-code": "ewo",
        "target-script": "Latn",
      }),
      displayNameRef: { current: "Ewondo (AZERTY)" },
    });
    expect(projectNameOptions.seeds!.getSeedValue("project_keyboard_id", deps)).toBe(
      "ewondo_azerty",
    );
  });

  it("FR-031: a previously-recorded keyboardId wins over any re-derived seed", () => {
    const { deps } = buildDeps({
      decisions: decisionSet({
        "language-autonym": "Bɨfɨɨ̀",
        "language-name": "Bafut",
        "language-code": "bfd",
        "target-script": "Latn",
        "project-display-name": "Bɨfɨɨ̀",
        "project-keyboard-id": "custom_bfd",
      }),
      displayNameRef: { current: "Bɨfɨɨ̀" },
    });
    expect(projectNameOptions.seeds!.getSeedValue("project_keyboard_id", deps)).toBe(
      "custom_bfd",
    );
  });

  it("FR-031: a previously-recorded displayName wins for project_display_name", () => {
    const { deps } = buildDeps({
      decisions: decisionSet({
        "language-autonym": "Bɨfɨɨ̀",
        "language-name": "Bafut",
        "language-code": "bfd",
        "target-script": "Latn",
        "project-display-name": "My Bafut Keyboard",
        "project-keyboard-id": "bafut",
      }),
    });
    expect(projectNameOptions.seeds!.getSeedValue("project_display_name", deps)).toBe(
      "My Bafut Keyboard",
    );
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
// trackOptions — record shape (spec 089: no onCommit; effects are the
// recorded authoring-track decision + track_choice's empty apply)
// ---------------------------------------------------------------------------

describe("trackOptions — record shape", () => {
  it("declares no onCommit", () => {
    expect("onCommit" in trackOptions).toBe(false);

  });
});

describe("phaseFOptions.seeds.getSeedValue (choice-question defaults)", () => {
  it.each([
    [pfMoreDetailGateMod, "false"],
    [pfDocLanguageMod, "english"],
    [pfHistoryEntryMod, "confirm"],
  ])("seeds a valid default for %#", (mod, expected) => {
    const { deps } = buildDeps();
    const seed = phaseFOptions.seeds!.getSeedValue(mod.definition.id, deps);
    expect(seed).toBe(expected);
    expect(mod.validate(seed).ok).toBe(true);
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

  // spec 079 US5: once onMount has derived a proposal (historyEntryState
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
// phaseFOptions — record shape (flowRef / title / usesFindings / onCommit)
// ---------------------------------------------------------------------------

describe("phaseFOptions — record shape", () => {
  it("has flowRef 'phase_f_helpdocs' and usesFindings true", () => {
    expect(phaseFOptions.flowRef).toBe("phase_f_helpdocs");
    expect(phaseFOptions.usesFindings).toBe(true);
  });

  it("declares no onCommit (spec 089: pf_welcome_paragraph's apply wires the help-docs decisions into the working copy)", () => {
    expect("onCommit" in phaseFOptions).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// phaseFOptions.onMount (spec 079 US5) — derives the HISTORY proposal once
// per mount, identity-guarded against re-stamping dateIso on a same-version
// re-derivation.
// ---------------------------------------------------------------------------

describe("phaseFOptions.onMount", () => {
  it("declares onMount", () => {
    expect(phaseFOptions.onMount).toBeDefined();
  });

  it("derives a fresh 'proposed' state on first mount (previous === null)", () => {
    const { deps } = buildDeps({ historyEntryState: null });

    phaseFOptions.onMount!(deps);

    // Spec 089: the write goes through the working-copy store directly
    // (no FlowStepDeps setter) — assert the resulting store state.
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
    useWorkingCopyStore.setState({ historyEntryState: previous });
    const { deps } = buildDeps({ historyEntryState: previous });

    phaseFOptions.onMount!(deps);

    // Same object reference: no write happened.
    expect(useWorkingCopyStore.getState().historyEntryState).toBe(previous);
  });

  it("a version bump (adaptation) re-derives the heading but PRESERVES the original dateIso and status", () => {
    useWorkingCopyStore.setState({ instantiationMode: "adapt-existing" });
    const previous: HistoryEntryState = {
      status: "confirmed",
      proposal: { version: "1.0", dateIso: "2020-01-01", bullets: ["Initial release."] },
      editedBullets: null,
    };
    const { deps } = buildDeps({ historyEntryState: previous });

    phaseFOptions.onMount!(deps);

    const written = useWorkingCopyStore.getState().historyEntryState;
    expect(written?.proposal.version).toBe("1.1"); // bumpKeyboardVersion("1.0")
    expect(written?.proposal.dateIso).toBe("2020-01-01"); // preserved, not re-stamped
    expect(written?.status).toBe("confirmed"); // carried forward untouched
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

  it("seeds no free-text Phase F question", () => {
    for (const id of [
      "pf_welcome_paragraph",
      "pf_usage_tip_1",
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
// (spec 079 FR-009, US4). Reads the four working-copy slices directly off
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

describe("phaseFOptions.seeds — pf_welcome_paragraph adaptive description (spec 079 FR-009)", () => {
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

// ---------------------------------------------------------------------------
// phaseFOptions.seeds.getSeedValue — choice questions always open selected
// ---------------------------------------------------------------------------

describe("phaseFOptions.seeds.getSeedValue (choice defaults)", () => {
  const seedFor = (id: string, surveyContext = {}): string | string[] | undefined =>
    phaseFOptions.seeds!.getSeedValue(id, buildDeps({ surveyContext }).deps);

  it("defaults the more-detail gate to No", () => {
    expect(seedFor("pf_more_detail_gate")).toBe("false");
  });

  it("defaults the help language to English, or bilingual for a non-English keyboard", () => {
    expect(seedFor("pf_doc_language")).toBe("english");
    expect(seedFor("pf_doc_language", { bcp47_tag: "en-Latn" })).toBe("english");
    expect(seedFor("pf_doc_language", { bcp47_tag: "ha-Latn" })).toBe("bilingual");
  });

  it("preselects adding the drafted HISTORY entry", () => {
    expect(seedFor("pf_history_entry")).toBe("confirm");
  });

  it("seeds every bool/radio question in the Phase F question set with a valid option", () => {
    const modules = import.meta.glob<{ default: { definition: { id: string; type: string; options?: { value: string }[] } } }>(
      "../../survey/questions/f/*.ts",
      { eager: true },
    );
    const choice = Object.values(modules)
      .map((m) => m.default?.definition)
      .filter((d) => d !== undefined && (d.type === "bool" || d.type === "radio"));
    expect(choice.length).toBeGreaterThanOrEqual(3);
    for (const d of choice) {
      const seed = seedFor(d.id);
      expect(seed, d.id).toBeDefined();
      if (d.options !== undefined) {
        expect(d.options.map((o) => o.value), d.id).toContain(seed);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// phaseFOptions.seeds — text proposals derived from the starting point, and the
// source each seed is recorded with
// ---------------------------------------------------------------------------

describe("phaseFOptions.seeds — derived text proposals", () => {
  const BASE = makeBaseKeyboard({
    id: "sil_bafut",
    path: "release/sil/sil_bafut",
    script: "Latn",
    targets: ["windows"],
    displayName: "Bafut",
    version: "1.2",
  });

  function withBase(instantiationMode: "new-from-base" | "adapt-existing"): void {
    const baseVfs = createVirtualFS();
    baseVfs.set("source/sil_bafut.kps", '<Info><WebSite URL="https://bafut.org">https://bafut.org</WebSite></Info>');
    useWorkingCopyStore.getState().reset();
    useWorkingCopyStore.setState({ instantiationMode, baseKeyboard: BASE, baseVfs });
  }

  const seedFor = (id: string) => phaseFOptions.seeds!.getSeedValue(id, buildDeps().deps);

  it("an update proposes the released package's website", () => {
    withBase("adapt-existing");
    expect(seedFor("pf_project_url")).toBe("https://bafut.org");
    expect(seedFor("pf_provenance_basis")).toBeUndefined();
  });

  it("a copy proposes the copied keyboard as its provenance", () => {
    withBase("new-from-base");
    expect(seedFor("pf_provenance_basis")).toBe(
      "This keyboard started as a copy of the Bafut keyboard (sil_bafut).",
    );
    expect(seedFor("pf_project_url")).toBeUndefined();
  });

  it("names a source for every data-backed seed, and none for the plain gate default", () => {
    const sourceFor = (id: string) => phaseFOptions.seeds!.getSeedSource!(id, buildDeps().deps);
    expect(sourceFor("pf_welcome_paragraph")).toBe("base");
    expect(sourceFor("pf_contact_info")).toBe("identity");
    expect(sourceFor("pf_doc_language")).toBe("identity");
    expect(sourceFor("pf_history_entry")).toBe("analysis");
    expect(sourceFor("pf_project_url")).toBe("base");
    expect(sourceFor("pf_provenance_basis")).toBe("base");
    expect(sourceFor("pf_more_detail_gate")).toBeUndefined();
  });

  it("value and source lookups agree on the seeded set: unseeded ids return neither", () => {
    // Regression guard for km-triage finding 1 (PR #1927): getSeedValue and
    // getSeedSource both read the single PHASE_F_SEEDS registry, so a
    // question id can never be seeded without its source or sourced without
    // a value resolver. Unseeded ids (deliberately unseeded, unknown, or
    // belonging to another flow) resolve to neither.
    const { deps } = buildDeps();
    for (const id of ["pf_credits", "pf_not_a_question", "il_language_code"]) {
      expect(phaseFOptions.seeds!.getSeedValue(id, deps)).toBeUndefined();
      expect(phaseFOptions.seeds!.getSeedSource!(id, deps)).toBeUndefined();
    }
  });
});
