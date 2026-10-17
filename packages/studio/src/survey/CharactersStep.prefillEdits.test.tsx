// CharactersStep — prefill inline edits write back to the identity
// decisions (issue 542).
//
// Renders the REAL Prefill through the real CharactersStepHost (PhaseB is
// never reached: the tests stay at the prefill substage) and pins the
// two-channel contract: an inline edit replaces the identity step's own
// decision record (the source of truth deriveIdentityResult reads), so
// the derived rows — script class, routing group — recompute from the
// edited value through the existing derivation, and the edited row is
// marked "edited by you" from the replacement record's own stamp.

import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, fireEvent, cleanup } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { CharactersStepHost } from "./CharactersStepHost.tsx";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { useSurveyAnswerStore } from "../stores/surveyAnswerStore.ts";
import { resetInventoryDecisions } from "./useInventoryDraft.ts";
import { changeSelectMenu } from "../test/selectMenuTestUtils.ts";

const fakeStart = {
  id: "basic_kbdus",
  path: "release/b/basic_kbdus",
  script: "Latn",
  displayName: "English (US)",
  targets: ["windows"] as string[],
  version: "1.0",
};

function seedSessionStore(): void {
  const record = useDecisionStore.getState().record;
  record({ id: "language-name", value: "Test Language", provenance: "asked", step: "identity" });
  record({ id: "language-autonym", value: "Test Language", provenance: "asked", step: "identity" });
  record({ id: "language-code", value: "tl", provenance: "asked", step: "identity" });
  record({ id: "language-region", value: "", provenance: "asked", step: "identity" });
  record({ id: "target-script", value: "Latn", provenance: "asked", step: "identity" });
  useSurveySessionStore.setState({
    localStart: fakeStart,
    charactersSubStage: "prefill",
  });
}

afterEach(() => {
  cleanup();
  useDecisionStore.getState().reset();
  useSurveyAnswerStore.getState().reset();
  resetInventoryDecisions();
  useSurveySessionStore.setState({ localStart: null, charactersSubStage: "prefill" });
});

describe("CharactersStep — prefill inline edits", () => {
  it("a language edit replaces the language-name decision and the row shows the new value, marked edited", () => {
    seedSessionStore();
    const onComplete = vi.fn();
    render(<CharactersStepHost onComplete={onComplete} onBack={vi.fn()} />);

    fireEvent.click(screen.getByTestId("prefill-edit-language"));
    const input = screen.getByTestId("prefill-edit-language-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Bafut" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // The write-back landed on the identity decision itself — provenance
    // re-stated by the author, stamped with this step, carrying the
    // replaced value as the offer it overrode.
    const record = useDecisionStore.getState().decisions["language-name"];
    expect(record?.value).toBe("Bafut");
    expect(record?.provenance).toBe("asked");
    expect(record?.step).toBe("characters");
    expect(record?.offered).toBe("Test Language");

    // The re-derived identity renders: new value, honest provenance, and
    // the step did NOT advance.
    expect(screen.getByText("Bafut")).toBeTruthy();
    expect(screen.getByText("edited by you")).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByText("Confirm the basics")).toBeTruthy();
  });

  it("a script edit replaces the target-script decision and script class + routing group recompute", async () => {
    seedSessionStore();
    const onComplete = vi.fn();
    render(<CharactersStepHost onComplete={onComplete} onBack={vi.fn()} />);

    expect(screen.getByText("alphabetic")).toBeTruthy();
    expect(screen.getByText("qwerty-qwertz")).toBeTruthy();

    fireEvent.click(screen.getByTestId("prefill-edit-script"));
    const trigger = screen.getByRole("button", { name: "Target script" });
    await changeSelectMenu(trigger, "Deva");

    const record = useDecisionStore.getState().decisions["target-script"];
    expect(record?.value).toBe("Deva");
    expect(record?.provenance).toBe("asked");
    expect(record?.step).toBe("characters");
    expect(record?.offered).toBe("Latn");

    // deriveIdentityResult + deriveScriptPrefill recompute the dependents
    // from the edited decision — nothing was hand-patched in Prefill.
    expect(screen.getByText("Deva")).toBeTruthy();
    expect(screen.getByText("abugida")).toBeTruthy();
    expect(screen.getByText("non-roman")).toBeTruthy();
    expect(screen.getByText("edited by you")).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
