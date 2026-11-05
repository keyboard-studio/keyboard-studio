// Spec 111 T020: the Open entry records the starting keyboard and the "adapt"
// track, previews the keyboard, and moves on to the walk.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SourceRef, StartKeyboard } from "@keyboard-studio/contracts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";

const navigateTo = vi.fn();
vi.mock("../lib/navigate.ts", () => ({ navigateTo: (...a: unknown[]) => navigateTo(...a) }));

import { openExistingKeyboard } from "./OpenKeyboardEntry.tsx";

const KB: StartKeyboard = {
  id: "sil_cameroon_qwerty",
  path: "release/sil/sil_cameroon_qwerty",
  script: "Latn",
  targets: ["windows"],
  displayName: "Cameroon QWERTY",
  version: "1.0",
  languages: ["bas"],
};

beforeEach(() => {
  navigateTo.mockClear();
  useDecisionStore.getState().reset();
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().setLocalStart(null);
});

describe("openExistingKeyboard", () => {
  it("records base-keyboard and authoring-track=adapt, previews the keyboard and lands on the criteria page", () => {
    expect(openExistingKeyboard(KB)).toBe(true);
    const decisions = useDecisionStore.getState().decisions;
    expect(decisions["authoring-track"]?.value).toBe("adapt");
    expect(decisions["base-keyboard"]?.value).toEqual({ id: KB.id, name: KB.displayName });
    expect(useSurveySessionStore.getState().localStart?.id).toBe(KB.id);
    // The working copy is instantiated by the walk's pipeline; the criteria page follows it.
    expect(navigateTo).toHaveBeenCalledWith("survey");
    expect(navigateTo).not.toHaveBeenCalledWith("criteria");
    expect(useSurveySessionStore.getState().activeStepId).toBe("attribution");
    expect(useWorkingCopyStore.getState().startSource).toBeNull();
  });

  it("stores the chosen SourceRef in the working copy", () => {
    const source: SourceRef = {
      owner: "keyboard-studio",
      repo: "keyboards",
      commit: "b".repeat(40),
      path: KB.path,
      alternative: { owner: "keymanapp", commit: "a".repeat(40), newer: false },
    };
    expect(openExistingKeyboard(KB, source)).toBe(true);
    expect(useWorkingCopyStore.getState().startSource).toEqual(source);
  });
});
