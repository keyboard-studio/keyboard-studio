// Regression coverage for BaseResolutionAdapter's suggest-target wiring
// (refs #1021). The adapter must build SuggestTarget from
// surveySessionStore.identityResult (written by IdentityLiteAdapter before
// this step is reached), not from workingCopyStore.identity, which is null
// at base-resolution time. Covers:
//   1. identityResult with a declared language -> language-match badge.
//   2. identityResult === null -> falls back to script "Latn", no crash,
//      no language-match badge.
//   3. identityResult.bcp47 === "" -> same fallback behaviour as (2).
//   4. identityResult.prefill.script === "" (unrecognized language) -> script
//      falls back to "Latn" instead of failing every script comparison.

import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import type { BaseKeyboard } from "@keyboard-studio/contracts";
import {
  basicKbdus,
  silEuroLatin,
} from "@keyboard-studio/contracts/fixtures";

import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import type { IdentityLiteResult } from "../../survey/IdentityLite.tsx";

// ---------------------------------------------------------------------------
// jsdom does not implement scrollIntoView — BaseKeyboardPicker (rendered
// inside BaseResolution) may call it; stub it out globally like the existing
// BaseKeyboardPicker.test.tsx does.
// ---------------------------------------------------------------------------

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

// ---------------------------------------------------------------------------
// Service mock — BaseResolution loads bases via getBaseBrowserService().
// vi.mock is hoisted, so it runs before the panelAdapters import below.
// ---------------------------------------------------------------------------

const BASES: BaseKeyboard[] = [basicKbdus, silEuroLatin];

vi.mock("../../lib/services.ts", () => ({
  getBaseBrowserService: () => ({ listAll: () => Promise.resolve(BASES) }),
  USE_REAL: false,
}));

import { BaseResolutionAdapter } from "./panelAdapters.tsx";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Full IdentityLiteResult shape (see survey/IdentityLite.tsx). */
function makeIdentityResult(overrides: Partial<IdentityLiteResult>): IdentityLiteResult {
  return {
    autonym: "Hausa",
    english: "Hausa",
    languageSubtag: "ha",
    targetScriptRaw: "Latn",
    bcp47: "ha-Latn",
    supported: true,
    prefill: {
      script: "Latn",
      scriptClass: "alphabetic",
      routingGroup: "qwerty-qwertz",
    },
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  useSurveySessionStore.getState().reset();
});

describe("BaseResolutionAdapter — suggest target sourced from surveySessionStore", () => {
  it("declared-language identityResult surfaces the language-match badge", async () => {
    useSurveySessionStore.getState().setIdentityResult(makeIdentityResult({}));

    render(<BaseResolutionAdapter onComplete={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("Already supports your language")).toBeDefined();
    });
  });

  it("identityResult === null falls back to script-only target without crashing", async () => {
    useSurveySessionStore.getState().setIdentityResult(null);

    render(<BaseResolutionAdapter onComplete={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("Matches your script")).toBeDefined();
    });
    expect(screen.queryByText("Already supports your language")).toBeNull();
  });

  it("identityResult.bcp47 === '' falls back to script-only target without crashing", async () => {
    useSurveySessionStore.getState().setIdentityResult(
      makeIdentityResult({ bcp47: "" }),
    );

    render(<BaseResolutionAdapter onComplete={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("Matches your script")).toBeDefined();
    });
    expect(screen.queryByText("Already supports your language")).toBeNull();
  });

  it("prefill.script === '' falls back to 'Latn' so script matching still works", async () => {
    useSurveySessionStore.getState().setIdentityResult(
      makeIdentityResult({
        bcp47: "",
        prefill: { script: "", scriptClass: "alphabetic", routingGroup: "qwerty-qwertz" },
      }),
    );

    render(<BaseResolutionAdapter onComplete={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("Matches your script")).toBeDefined();
    });
    expect(screen.queryByText("Already supports your language")).toBeNull();
  });
});
