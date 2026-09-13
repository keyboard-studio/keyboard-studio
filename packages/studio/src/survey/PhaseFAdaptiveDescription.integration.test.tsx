// Integration test: pf_welcome_paragraph's adaptive description proposal
// (spec 076 FR-009, US4, SC-005) with the REAL SurveyRunner.
//
// Verifies the prefill + waived-required override travels end to end:
//   workingCopyStore (instantiationMode / baseDocProfile / baseWelcomeHtmText)
//     -> phaseFOptions.seeds.getSeedValue / getRequiredOverride
//     -> makeFlowStepComponent
//     -> FlowStepHost
//     -> SurveyRunner (getSeedValue seeds the field; getRequiredOverride
//        waives `required`, satisfying `canAdvance` with no typing)
//     -> the rendered input's value / the Next button's enabled state
//
// Mirrors PhaseFContactSeed.integration.test.tsx's real-YAML, no-mocks style.
// Walks the real DEFAULT Phase F path (gate answered No where reached).

import { describe, it, expect, afterEach } from "vitest";
import { screen, fireEvent, act, cleanup } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { PhaseFStepFactoryComponent } from "../editors/adapters/flowStepOptions.tsx";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import type { BaseDocumentationProfile } from "@keyboard-studio/contracts";

afterEach(() => {
  cleanup();
  useSurveySessionStore.getState().reset();
  useWorkingCopyStore.getState().reset();
});

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

const WELCOME_HTML =
  "<html><body><h1>My Keyboard</h1><p>This keyboard lets you type Bafut on any computer.</p></body></html>";
const EXPECTED_PREFILL = "This keyboard lets you type Bafut on any computer.";

function descriptionField(): HTMLInputElement | HTMLTextAreaElement {
  return screen.getAllByRole("textbox")[0] as HTMLInputElement | HTMLTextAreaElement;
}

function nextButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: /next|continue|finish|done/i }) as HTMLButtonElement;
}

describe("Phase F — pf_welcome_paragraph adaptive description proposal (spec 076 FR-009, SC-005)", () => {
  it("SC-005: adapt-full prefills the description and a SINGLE confirm (no typing) advances", () => {
    useWorkingCopyStore.setState({
      instantiationMode: "adapt-existing",
      baseDocProfile: FULL_PROFILE,
      baseWelcomeHtmText: WELCOME_HTML,
      baseHelpPhpText: null,
    });
    render(<PhaseFStepFactoryComponent onComplete={() => {}} />);

    // Prefilled — the propose half of propose-then-confirm.
    expect(descriptionField().value).toBe(EXPECTED_PREFILL);

    // required is waived, so Next is enabled with NO typing at all.
    expect(nextButton().disabled).toBe(false);

    // The confirm half: one click, no edit, and the flow advances past
    // pf_welcome_paragraph onto pf_usage_tip_1 (the next question's own
    // prompt renders; pf_welcome_paragraph's prompt is gone).
    act(() => {
      fireEvent.click(nextButton());
    });
    expect(screen.queryByText(/what is this keyboard for/i)).toBeNull();
    expect(
      screen.getByText(/anything users need to know to type with this keyboard/i),
    ).toBeTruthy();
  });

  it("adapt-full: the author can still EDIT the proposal before confirming (not locked to the proposed text)", () => {
    useWorkingCopyStore.setState({
      instantiationMode: "adapt-existing",
      baseDocProfile: FULL_PROFILE,
      baseWelcomeHtmText: WELCOME_HTML,
      baseHelpPhpText: null,
    });
    render(<PhaseFStepFactoryComponent onComplete={() => {}} />);

    expect(descriptionField().value).toBe(EXPECTED_PREFILL);
    act(() => {
      fireEvent.change(descriptionField(), { target: { value: "A hand-edited description." } });
    });
    expect(descriptionField().value).toBe("A hand-edited description.");
    expect(nextButton().disabled).toBe(false);
  });

  it("net-new (Track 1 / no instantiation recorded): stays required, unfilled — Next is DISABLED with no typing", () => {
    // Default reset() state: instantiationMode is null (matches Track 1 /
    // net-new, which never sets instantiationMode to "adapt-existing").
    render(<PhaseFStepFactoryComponent onComplete={() => {}} />);

    expect(descriptionField().value).toBe("");
    expect(nextButton().disabled).toBe(true);

    // Typing something still works exactly as before (unchanged behavior).
    act(() => {
      fireEvent.change(descriptionField(), { target: { value: "A keyboard for typing Bafut." } });
    });
    expect(nextButton().disabled).toBe(false);
  });

  it("adapt track, base classified none: stays required, unfilled (no usable description to propose)", () => {
    useWorkingCopyStore.setState({
      instantiationMode: "adapt-existing",
      baseDocProfile: NONE_PROFILE,
      baseWelcomeHtmText: null,
      baseHelpPhpText: null,
    });
    render(<PhaseFStepFactoryComponent onComplete={() => {}} />);

    expect(descriptionField().value).toBe("");
    expect(nextButton().disabled).toBe(true);
  });

  it("adapt track, no profile computed yet (baseDocProfile null): stays required, unfilled", () => {
    useWorkingCopyStore.setState({
      instantiationMode: "adapt-existing",
      baseDocProfile: null,
      baseWelcomeHtmText: WELCOME_HTML,
      baseHelpPhpText: null,
    });
    render(<PhaseFStepFactoryComponent onComplete={() => {}} />);

    expect(descriptionField().value).toBe("");
    expect(nextButton().disabled).toBe(true);
  });
});
