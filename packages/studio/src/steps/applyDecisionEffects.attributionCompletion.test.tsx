// Attribution capture through the REAL attribution step (#1901) — the
// post-track home of the author/copyright questions (spec 064 US1), plus
// the spec 089 pass-2 regression that used to live in
// applyDecisionEffects.identityCompletion.test.tsx.
//
// Re-homed from survey/IdentityLite.attribution.test.tsx and the old
// identity-completion suite: the questions, modules, decision ids, and
// apply machinery are unchanged — only the step that asks them moved
// (after the track choice, so the update track can preserve the base
// keyboard's existing holder and the copy track asks fresh).
//
// The DOM surface is the real SurveyRunner over the real attribution
// flow with the real attributionOptions seeds — the exact wiring
// AttributionStepFactoryComponent hands FlowStepHost (which forwards the
// seed closures verbatim). Completions are fed through StepHost's order —
// recordPhase -> recordAnswersAsDecisions -> applyDecisionEffects — with
// ReducerDeps composed over the REAL stores exactly as StudioShell
// composes them.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, fireEvent, cleanup } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import { SurveyRunner } from "../survey/SurveyRunner.tsx";
import { loadFlowSourceDef, flowSources } from "./flowSources.ts";
import {
  attributionOptions,
  type FlowStepDeps,
} from "../editors/adapters/flowStepOptions.tsx";
import {
  applyDecisionEffects,
  recordAnswersAsDecisions,
  type ReducerDeps,
} from "./reducer.ts";
import { applyMutatePatch } from "./mutateApply.ts";
import {
  useDecisionStore,
  getDecisionSnapshot,
} from "../stores/decisionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { peekStepAnswers } from "../stores/surveyAnswerStore.ts";

afterEach(cleanup);

beforeEach(() => {
  useDecisionStore.getState().reset();
  useWorkingCopyStore.setState({ attribution: null, ir: null });
});

/** ReducerDeps over the real stores — StudioShell's composition, verbatim
 *  for the decision/apply fields; no-ops for the unrelated reducer deps. */
function makeLiveDeps(): ReducerDeps {
  return {
    lockDesktop: () => {},
    clearStale: () => {},
    setTouchLayoutJson: () => {},
    instantiateFromBase: () => {},
    instantiateFromExisting: () => {},
    buildTouchLayoutJson: () => ({ json: null, warnings: [] }),
    resolveBaseTouchJson: () => undefined,
    instantiateFromBaseIfConfirmed: () => true,
    getWorkingIR: () => useWorkingCopyStore.getState().ir,
    setWorkingIR: (next) => useWorkingCopyStore.getState().setWorkingIR(next),
    writeDecisionRecords: (records) => useDecisionStore.getState().recordAll(records),
    readDecisionSet: () => getDecisionSnapshot(),
    getDecisions: () => getDecisionSnapshot(),
    getSavedAnswer: (stepId, questionId) =>
      peekStepAnswers(stepId)?.answers[questionId],
    getBaseKeyboardId: () => useWorkingCopyStore.getState().baseKeyboard?.id,
    getHistoryEntryState: () => useWorkingCopyStore.getState().historyEntryState,
    applyWorkingCopyPatch: (patch, writes) => {
      const wc = useWorkingCopyStore.getState();
      if (patch.ir !== undefined && wc.ir !== null) {
        wc.setWorkingIR(applyMutatePatch(wc.ir, patch.ir, writes));
      }
      if (patch.identity !== undefined) wc.setIdentity(patch.identity);
      if (patch.attribution !== undefined) wc.setAttribution(patch.attribution);
      if (patch.helpDocs !== undefined) wc.setHelpDocs(patch.helpDocs);
      if (patch.historyEntryState !== undefined)
        wc.setHistoryEntryState(patch.historyEntryState);
    },
  };
}

/** StepHost.handleComplete's SurveyPhaseResult block, in its order. */
function completeAttributionStep(result: SurveyPhaseResult): void {
  useWorkingCopyStore.getState().recordPhase(result, { stepId: "attribution" });
  const deps = makeLiveDeps();
  recordAnswersAsDecisions(result, "attribution", deps);
  applyDecisionEffects(result, deps);
}

const PROFILE = { name: "Alice Example", email: "alice@example.org" };
const NO_PROFILE = { name: null, email: null };

/** The deps fields attributionOptions reads, with a live decisions view. */
function makeAttributionDeps(authorProfile: {
  name: string | null;
  email: string | null;
}): FlowStepDeps {
  return {
    surveyContext: {},
    authorProfile,
    get decisions() {
      return getDecisionSnapshot();
    },
  } as unknown as FlowStepDeps;
}

/**
 * Render the attribution step the way its factory does: the real flow,
 * the real options object. Only the deps fields attributionOptions
 * reads are populated (surveyContext + authorProfile + decisions).
 */
function renderAttributionStep(opts: {
  authorProfile: { name: string | null; email: string | null };
  onComplete: (result: SurveyPhaseResult) => void;
}): void {
  const deps = makeAttributionDeps(opts.authorProfile);
  const options = attributionOptions;
  render(
    <SurveyRunner
      flow={loadFlowSourceDef(flowSources["attribution"]!)}
      context={{}}
      onComplete={opts.onComplete}
      {...(options.seeds?.getSeedValue !== undefined
        ? {
            getSeedValue: (qid: string) => options.seeds!.getSeedValue!(qid, deps),
          }
        : {})}
      {...(options.seeds?.getSeedSource !== undefined
        ? {
            getSeedSource: (qid: string) =>
              options.seeds!.getSeedSource!(qid, deps),
          }
        : {})}
    />,
    { withStepNav: true },
  );
}

function finish(): void {
  fireEvent.click(screen.getByTestId("survey-advance"));
}

function type(value: string): void {
  fireEvent.change(screen.getAllByRole("textbox")[0]!, { target: { value } });
}

function currentFieldValue(): string {
  return (screen.getAllByRole("textbox")[0] as HTMLInputElement).value;
}

describe("attribution step — profile seeding (spec 064 D7, #1901)", () => {
  it("pre-fills the author name and email from the profile for confirmation", () => {
    renderAttributionStep({ authorProfile: PROFILE, onComplete: vi.fn() });
    expect(screen.getByText("Who should be credited as the author of this keyboard?")).toBeTruthy();
    expect(currentFieldValue()).toBe("Alice Example");
    finish();
    expect(currentFieldValue()).toBe("alice@example.org");
  });

  // A handle is not a copyright holder. With no profile name the field must
  // be empty so the author supplies one (D7): the factory passes the
  // profile's DISPLAY name (useGitHubAuth's authorName), never the login.
  it("does NOT pre-fill anything when the profile has no name", () => {
    renderAttributionStep({ authorProfile: NO_PROFILE, onComplete: vi.fn() });
    expect(currentFieldValue()).toBe("");
  });

  it("an asked author-name record wins over the profile seed on re-entry", () => {
    useDecisionStore.getState().record({
      id: "author-name",
      value: "Typed Before",
      provenance: "asked",
    });
    renderAttributionStep({ authorProfile: PROFILE, onComplete: vi.fn() });
    expect(currentFieldValue()).toBe("Typed Before");
  });

  // format: "email" (spec 059 follow-up): SurveyRunner's canAdvance blocks a
  // non-blank, malformed address but still treats blank as fine —
  // required:false means "no email provided" must stay a legitimate answer.
  it("blocks Continue on a malformed email but allows blank or a valid address", () => {
    renderAttributionStep({ authorProfile: NO_PROFILE, onComplete: vi.fn() });
    type("Alice Example");
    finish(); // -> il_author_email, blank
    const advanceButton = () =>
      screen.getByTestId("survey-advance") as HTMLButtonElement;
    expect(advanceButton().disabled).toBe(false); // optional field — blank passes
    type("not-an-email");
    expect(advanceButton().disabled).toBe(true);
    type("alice@example.org");
    expect(advanceButton().disabled).toBe(false);
  });
});

describe("attribution step — seed channel contract (#1901 D4)", () => {
  it("the holder is never seeded through the options channel (the extraction pass owns it)", () => {
    const deps = makeAttributionDeps(PROFILE);
    const seeds = attributionOptions.seeds!;
    expect(seeds.getSeedValue?.("il_copyright_holder", deps)).toBeUndefined();
    expect(seeds.getSeedSource?.("il_copyright_holder", deps)).toBeUndefined();
  });

  it("name/email seeds carry the profile proposal source", () => {
    const deps = makeAttributionDeps(PROFILE);
    const seeds = attributionOptions.seeds!;
    expect(seeds.getSeedValue?.("il_author_name", deps)).toBe("Alice Example");
    // The modules' declared lookup-default source (spec 002 provenance
    // label for the authenticated identity).
    expect(seeds.getSeedSource?.("il_author_name", deps)).toBe("identity");
  });
});

describe("attribution completion through the live apply path (spec 089 regression, re-homed)", () => {
  it("lands the D1 attribution when the copyright holder is left blank", () => {
    const onComplete = vi.fn<[SurveyPhaseResult], void>();
    renderAttributionStep({ authorProfile: NO_PROFILE, onComplete });
    type("Test Author");
    finish();
    finish(); // author email — left blank (optional)
    finish(); // copyright holder — left blank; D1 defaults it to the author

    expect(onComplete).toHaveBeenCalledTimes(1);
    const [result] = onComplete.mock.calls[0]!;
    // The live result carries NO il_copyright_holder answer at all — the
    // fact the per-answer dispatch tripped over in spec 089: pass 2 must
    // still fire il_copyright_holder's apply because this completion
    // recorded one of its `requires` (the author name).
    expect(result.answers.map((a) => a.questionId)).not.toContain("il_copyright_holder");

    completeAttributionStep(result);

    expect(getDecisionSnapshot()["author-name"]?.value).toBe("Test Author");
    expect(useWorkingCopyStore.getState().attribution).toEqual({
      authorName: "Test Author",
      copyrightHolder: "Test Author",
    });
  });

  it("lands an explicitly entered copyright holder (answered path)", () => {
    const onComplete = vi.fn<[SurveyPhaseResult], void>();
    renderAttributionStep({ authorProfile: NO_PROFILE, onComplete });
    type("Test Author");
    finish();
    finish(); // email blank
    type("Hausa Language Committee");
    finish(); // copyright holder — explicitly entered

    expect(onComplete).toHaveBeenCalledTimes(1);
    const [result] = onComplete.mock.calls[0]!;
    expect(result.answers.map((a) => a.questionId)).toContain("il_copyright_holder");

    completeAttributionStep(result);

    expect(useWorkingCopyStore.getState().attribution).toEqual({
      authorName: "Test Author",
      copyrightHolder: "Hausa Language Committee",
    });
  });

  it("update track: the base's existing holder, seeded by the extraction pass, is preserved by default", () => {
    // The store state production has when the attribution step mounts on
    // the update track: the 092 pass ran at the setup commit and seeded
    // copyright-holder from the base bundle's .kps copyright.
    useDecisionStore.getState().record({
      id: "copyright-holder",
      value: "(c) 2009-2019 SIL International",
      provenance: "extracted",
      source: "basic_kbdfr",
    });
    const onComplete = vi.fn<[SurveyPhaseResult], void>();
    renderAttributionStep({ authorProfile: NO_PROFILE, onComplete });
    type("Test Author");
    finish();
    finish(); // email blank
    // The holder question arrives pre-filled with the preserved holder —
    // the author is not prompted to re-enter it, only to confirm or edit.
    expect(currentFieldValue()).toBe("(c) 2009-2019 SIL International");
    expect(screen.getByText("from basic_kbdfr")).toBeTruthy();
    finish();

    expect(onComplete).toHaveBeenCalledTimes(1);
    const [result] = onComplete.mock.calls[0]!;
    completeAttributionStep(result);
    expect(useWorkingCopyStore.getState().attribution).toEqual({
      authorName: "Test Author",
      copyrightHolder: "(c) 2009-2019 SIL International",
    });
  });
});
