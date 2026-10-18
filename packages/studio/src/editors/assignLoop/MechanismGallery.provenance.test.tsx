// Unit tests for MechanismGallery — placement-suggestion provenance
// (issue #331): each suggestion chip shows WHERE the proposal came from —
// the candidate's stored priorSource/priorCount metadata — framed by the
// author's community context when the Phase B placement-habit answers
// (pb_existing_keyboards / pb_co_installed_keyboards) were given.
//
// Provenance is display only: these tests also pin that Accept behaves
// exactly as before with a provenance line present (the proposal stays
// overridable; nothing about the prior reaches the recorded mechanism).
//
// Shared module mocks, spies, and lifecycle hooks:
// ../../test/mechanismGallery/mocks.tsx. Seeders and IR fixtures:
// ../../test/mechanismGallery/harness.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, act, waitFor, within } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { MechanismGallery } from "./MechanismGallery.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveyAnswerStore } from "../../stores/surveyAnswerStore.ts";
import {
  createVirtualFS,
  makePlacementMap,
  type PlacementMap,
} from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { expectCurrentChar } from "../../test/currentCharChip.ts";
import { installMechanismGalleryHooks } from "../../test/mechanismGallery/mocks.tsx";
import { suggestionRowText, seedInventory, mainGroup } from "../../test/mechanismGallery/harness.ts";

vi.mock("../../lib/services.ts", () => import("../../test/mechanismGallery/mocks.tsx"));
vi.mock("../../hooks/useKeyboardArtifact.ts", () => import("../../test/mechanismGallery/mocks.tsx"));
vi.mock("@keyboard-studio/engine", async (importOriginal) =>
  (await import("../../test/mechanismGallery/mocks.tsx")).withMockedEngine(
    await importOriginal<typeof import("@keyboard-studio/engine")>(),
  ),
);
vi.mock("../../components/OSKFrame.tsx", () => import("../../test/mechanismGallery/mocks.tsx"));

installMechanismGalleryHooks();

beforeEach(() => {
  useSurveyAnswerStore.getState().reset();
});

afterEach(() => {
  useSurveyAnswerStore.getState().reset();
});

/** Seed the characters step's placement-habit answers, as Phase B leaves them. */
function seedPlacementHabitAnswers(existing: string, coInstalled?: string) {
  const save = useSurveyAnswerStore.getState().saveAnswer;
  save("characters", "pb_existing_keyboards", {
    value: existing,
    answerType: "text",
    origin: "confirmed",
    stage: "confirmed",
    evidenceKey: null,
    screenId: "characters",
  });
  if (coInstalled !== undefined) {
    save("characters", "pb_co_installed_keyboards", {
      value: coInstalled,
      answerType: "text",
      origin: "confirmed",
      stage: "confirmed",
      evidenceKey: null,
      screenId: "characters",
    });
  }
}

/** Render the gallery over a bare US base with "à" as the inventory char. */
async function renderGalleryForA(placementMap: PlacementMap) {
  const seedVfs = createVirtualFS([
    { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
  ]);
  useWorkingCopyStore
    .getState()
    .instantiateFromStart(basicKbdus, { vfs: seedVfs, ir: makeTestIR([mainGroup()]) });
  seedInventory(["à"]);
  await act(async () => {
    render(<MechanismGallery selectedStartKeyboard={basicKbdus} placementMap={placementMap} />, {
      withStepNav: true,
    });
  });
  const strip = screen.getByTestId("char-scroll-strip");
  fireEvent.click(within(strip).getByTestId("char-scroll-chip-00E0"));
  await waitFor(() => {
    expectCurrentChar("à");
  });
}

const corpusMapForA: PlacementMap = makePlacementMap({
  bcp47Context: "test",
  baseLayoutFamily: "QWERTY",
  entries: [
    {
      codepoint: "U+00E0", // à
      candidates: [
        {
          vkey: "K_A",
          modifiers: ["RALT"],
          mechanism: "direct",
          priorSource: "corpus",
          priorCount: 4,
          confidence: 0.88,
        },
      ],
    },
  ],
});

describe("MechanismGallery — suggestion provenance (issue #331)", () => {
  it("shows the plain corpus citation when the placement-habit questions went unanswered", async () => {
    await renderGalleryForA(corpusMapForA);
    await waitFor(() => {
      expect(suggestionRowText()).toMatch(/Attested by 4 keyboards in the corpus\./i);
    });
    expect(suggestionRowText()).not.toMatch(/Communities like yours/i);
  });

  it("frames the citation as community evidence when the author answered pb_existing_keyboards", async () => {
    seedPlacementHabitAnswers("French AZERTY keyboard", "English US");
    await renderGalleryForA(corpusMapForA);
    await waitFor(() => {
      expect(suggestionRowText()).toMatch(
        /Communities like yours chose this placement — attested by 4 keyboards in the corpus\./i,
      );
    });
  });

  it("uses the singular form for a single-keyboard attestation", async () => {
    const singleMap = makePlacementMap({
      entries: [
        {
          codepoint: "U+00E0",
          candidates: [
            {
              vkey: "K_A",
              modifiers: ["RALT"],
              mechanism: "direct",
              priorSource: "corpus",
              priorCount: 1,
              confidence: 0.9,
            },
          ],
        },
      ],
    });
    await renderGalleryForA(singleMap);
    await waitFor(() => {
      expect(suggestionRowText()).toMatch(/Attested by 1 keyboard in the corpus\./i);
    });
  });

  it("labels an anchor-backed candidate by its anchor type instead of a corpus count", async () => {
    const phoneticMap = makePlacementMap({
      entries: [
        {
          codepoint: "U+00E0",
          candidates: [
            {
              vkey: "K_E",
              modifiers: [],
              mechanism: "direct",
              priorSource: "phonetic",
              priorCount: 0,
              confidence: 0.9,
            },
          ],
        },
      ],
    });
    seedPlacementHabitAnswers("French AZERTY keyboard");
    await renderGalleryForA(phoneticMap);
    await waitFor(() => {
      expect(suggestionRowText()).toMatch(
        /Suggested because this character sounds like the e key\./i,
      );
    });
    // An anchor carries no corpus attestation — no count may be claimed,
    // and the community framing must not attach to it either.
    expect(suggestionRowText()).not.toMatch(/in the corpus/i);
    expect(suggestionRowText()).not.toMatch(/Communities like yours/i);
  });

  it("Accept still records the placement with a provenance line present (prior stays a proposal)", async () => {
    seedPlacementHabitAnswers("French AZERTY keyboard");
    await renderGalleryForA(corpusMapForA);
    await waitFor(() => {
      expect(suggestionRowText()).toMatch(/Communities like yours/i);
    });
    const row = screen.getByRole("note", { name: /Placement suggestion from kbgen seeder/i });
    fireEvent.click(within(row).getByRole("button", { name: /Accept suggestion/i }));
    // The chip is consumed by the accept, exactly as without provenance.
    await waitFor(() => {
      expect(
        screen.queryByRole("note", { name: /Placement suggestion from kbgen seeder/i }),
      ).toBeNull();
    });
  });
});
