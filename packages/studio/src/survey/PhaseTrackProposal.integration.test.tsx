// Integration test: TrackStepFactoryComponent with the REAL SurveyRunner.
//
// The authoring-track question opens with proposeTrack's proposal already
// selected, its one-line reason shown under the radio group, and the saved
// answer's origin recording whether the author kept the proposal
// ("proposed") or changed it ("overturned"). A track the author has already
// recorded is shown as recorded — never re-proposed over.

import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { screen, fireEvent, act, cleanup } from "@testing-library/react";
import { makeStartKeyboard } from "@keyboard-studio/contracts";
import { render } from "../test/renderWithI18n.tsx";
import { TrackStepFactoryComponent } from "../editors/adapters/flowStepOptions.tsx";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { useSurveyAnswerStore } from "../stores/surveyAnswerStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { loadLangtags } from "../lib/langtagsDefaults.ts";

// By the time an author reaches this step, the identity step's name picker
// has loaded langtags — the canonical target tag relies on it (it omits a
// language's default script). Load it here so the arranged identity
// decisions compose the same tag production composes.
beforeAll(async () => {
  await loadLangtags();
});

afterEach(() => {
  cleanup();
});

/** Identity + base arrangements, as the live stores hold them at the track step. */
function arrange(targetCode: string, baseLanguages: string[] | undefined): void {
  const record = useDecisionStore.getState().record;
  record({ id: "language-name", value: "Test Language", provenance: "asked" });
  record({ id: "language-autonym", value: "Test Language", provenance: "asked" });
  record({ id: "language-code", value: targetCode, provenance: "asked" });
  record({ id: "target-script", value: "Latn", provenance: "asked" });
  useSurveySessionStore.setState({
    activeStepId: "track",
    localStart: makeStartKeyboard({
      id: "test_base",
      path: "release/t/test_base",
      script: "Latn",
      targets: ["windows"],
      displayName: "Test Base",
      version: "1.0",
      ...(baseLanguages !== undefined ? { languages: baseLanguages } : {}),
    }),
  });
}

function savedTrack() {
  for (const step of Object.values(useSurveyAnswerStore.getState().steps)) {
    const answer = step.answers["track_choice"];
    if (answer !== undefined) return answer;
  }
  return undefined;
}

const adaptRadio = () =>
  screen.getByRole("radio", { name: /Adapt — modify this keyboard in place/ }) as HTMLInputElement;
const copyRadio = () =>
  screen.getByRole("radio", { name: /Copy — start a new keyboard/ }) as HTMLInputElement;

describe("TrackStepFactoryComponent — track proposal (real SurveyRunner)", () => {
  it("preselects adapt with its reason when the base's single language is the target", async () => {
    act(() => arrange("ewo", ["ewo"]));
    render(<TrackStepFactoryComponent onComplete={vi.fn()} onBack={vi.fn()} />, {
      withStepNav: true,
    });

    expect(adaptRadio().checked).toBe(true);
    expect(copyRadio().checked).toBe(false);
    expect(screen.getByText(/^Suggested because /)).toBeTruthy();
    // Kept as-is, the saved answer is the studio's proposal.
    expect(savedTrack()?.origin).toBe("proposed");
    expect(savedTrack()?.proposal).toEqual({ value: "adapt", source: "analysis" });
  });

  it("preselects copy when the target is not the base's single language", async () => {
    act(() => arrange("ewo", ["fr"]));
    render(<TrackStepFactoryComponent onComplete={vi.fn()} onBack={vi.fn()} />, {
      withStepNav: true,
    });

    expect(copyRadio().checked).toBe(true);
    expect(adaptRadio().checked).toBe(false);
    expect(screen.getByText(/^Suggested because /)).toBeTruthy();
  });

  it("an author who changes the preselection saves it as overturned, keeping the proposal", async () => {
    act(() => arrange("ewo", ["ewo"]));
    const onComplete = vi.fn();
    render(<TrackStepFactoryComponent onComplete={onComplete} onBack={vi.fn()} />, {
      withStepNav: true,
    });

    await act(async () => {
      fireEvent.click(copyRadio());
    });
    expect(savedTrack()?.origin).toBe("overturned");
    expect(savedTrack()?.proposal).toEqual({ value: "adapt", source: "analysis" });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /next|continue/i }));
    });
    expect(onComplete).toHaveBeenCalledOnce();
    const result = onComplete.mock.calls[0]?.[0] as
      | { answers: { questionId: string; value: unknown }[] }
      | undefined;
    expect(result?.answers.find((a) => a.questionId === "track_choice")?.value).toBe("copy");
  });

  it("a previously recorded track is shown as recorded, with no proposal caption", async () => {
    act(() => {
      arrange("ewo", ["ewo"]);
      useDecisionStore.getState().record({
        id: "authoring-track",
        value: "copy",
        provenance: "asked",
      });
    });
    render(<TrackStepFactoryComponent onComplete={vi.fn()} onBack={vi.fn()} />, {
      withStepNav: true,
    });

    expect(copyRadio().checked).toBe(true);
    expect(adaptRadio().checked).toBe(false);
    expect(screen.queryByText(/^Suggested because /)).toBeNull();
  });
});
