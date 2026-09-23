// surveyWriteObservability — SC-004 / SC-009 harness (spec 075, contract §9).
//
// No invisible character may be silently discarded anywhere in the survey.
// Every format character the invisibles step offers — the fixed five plus the
// whole bidi allowlist — is driven through each of the three inputs that can
// receive one:
//   (a) the punctuation page's type-in box,
//   (b) the punctuation-scope code-point field in the character-map pane,
//   (c) the invisibles step's own toggle,
// and for each the outcome must be OBSERVABLE, one of:
//   - confirmed: the character is in phaseCConfirmedInventory() (route c, and
//     the hand-off routes too, since an accepted invisible is in the union);
//   - handed-off: invisibleDecisions[notation] === "accepted" AND a visible
//     hand-off note names it (routes a and b);
//   - declined: a role="status"/"alert" element names it with a reason.
// A character that satisfies none of these is a silent write and FAILS.
//
// The carry-over leg (SC-004 measures it separately): a saved answer that
// already holds a code-point format character — on the alphabet scope as a
// `controls` entry, or on the punctuation scope as an accepted decision — is
// still observable after restore, exactly once.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { toUPlusNotation } from "@keyboard-studio/contracts";
import { PunctuationStep } from "./punctuation/PunctuationStep.tsx";
import { InvisiblesStep } from "./invisibles/InvisiblesStep.tsx";
import { CharacterMapPane } from "./CharacterMapPane.tsx";
import {
  BIDI_CONTROL_CODE_POINTS,
  FIXED_INVISIBLE_CODE_POINTS,
} from "./invisibles/invisibleCandidates.ts";
import { phaseCConfirmedInventory } from "./phaseCInventory.ts";
import {
  usePhaseBDraftStore,
  resetPhaseBDraftDecisions,
  applyPhaseBDraftSnapshot,
} from "../stores/phaseBDraftStore.ts";
import { DEFAULT_PHASE_B_FONT } from "./surveyStyles.ts";

// The punctuation step and the pane both read lib/services.ts; neither route
// under test needs real exemplar or character-map data.
vi.mock("../lib/services.ts", () => ({
  USE_REAL: false,
  sourcedExemplars: async () => null,
  charactersInTier: (inv: { characters: { char: string; tier: string }[] }, tier: string) =>
    inv.characters.filter((c) => c.tier === tier).map((c) => c.char),
  neededCharsForLanguage: async () => null,
  characterMapGroups: async () => [],
}));
vi.mock("./useFontSupportChecker.ts", () => ({
  useFontSupportChecker: () => () => true,
}));

/** Every format character the invisibles step offers, deduped, fixed five first. */
const ALL_OFFERED: number[] = [
  ...FIXED_INVISIBLE_CODE_POINTS,
  ...BIDI_CONTROL_CODE_POINTS.filter((cp) => !FIXED_INVISIBLE_CODE_POINTS.includes(cp)),
];

type Outcome = "confirmed" | "handed-off" | "declined" | "silent";

/** Classify what happened to `cp` after an input received it. Never throws. */
function classify(cp: number): Outcome {
  const char = String.fromCodePoint(cp);
  const notation = toUPlusNotation(char);
  const inInventory = phaseCConfirmedInventory().includes(char);
  const accepted = usePhaseBDraftStore.getState().invisibleDecisions[notation] === "accepted";
  const namesIt = (el: Element): boolean =>
    (el.textContent ?? "").includes(notation) || (el.textContent ?? "").includes(char);
  const handoffNote = Array.from(
    document.querySelectorAll('[data-testid="punctuation-handoff-note"], [aria-live]'),
  ).some(namesIt);
  const statusNames = Array.from(
    document.querySelectorAll('[role="status"], [role="alert"]'),
  ).some(namesIt);

  if (accepted && handoffNote) return "handed-off";
  if (inInventory) return "confirmed";
  if (statusNames) return "declined";
  return "silent";
}

beforeEach(() => {
  resetPhaseBDraftDecisions();
});

afterEach(() => {
  cleanup();
});

describe("SC-004 / SC-009 — every offered invisible is observable through every input", () => {
  for (const cp of ALL_OFFERED) {
    const char = String.fromCodePoint(cp);
    const notation = toUPlusNotation(char);

    it(`${notation} typed into the punctuation box is handed off, never silently dropped`, () => {
      render(<PunctuationStep onComplete={vi.fn()} />);
      fireEvent.change(screen.getByLabelText("Punctuation to add"), { target: { value: char } });
      fireEvent.click(screen.getByRole("button", { name: "+ Add" }));
      expect(classify(cp)).toBe("handed-off");
      expect(usePhaseBDraftStore.getState().chars).toEqual([]);
    });

    it(`${notation} entered in the punctuation-scope code-point field is handed off and announced`, () => {
      render(<CharacterMapPane scope="punctuation" />);
      fireEvent.change(screen.getByLabelText("Add a character by Unicode code point"), {
        target: { value: notation },
      });
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
      expect(classify(cp)).toBe("handed-off");
      expect(usePhaseBDraftStore.getState().controls).toEqual([]);
    });

    it(`${notation} toggled on the invisibles step is confirmed into the phase-C inventory`, () => {
      render(<InvisiblesStep onComplete={vi.fn()} />);
      const hex = cp.toString(16).toLowerCase().padStart(4, "0");
      if (screen.queryByTestId(`invisible-candidate-${hex}`) === null) {
        fireEvent.click(screen.getByTestId("invisibles-bidi-expand"));
      }
      fireEvent.click(screen.getByTestId(`invisible-candidate-${hex}`));
      expect(classify(cp)).toBe("confirmed");
    });
  }

  it("the classifier itself reports a character nothing received as silent (so a missing route cannot pass)", () => {
    render(<InvisiblesStep onComplete={vi.fn()} />);
    expect(classify(0x2061)).toBe("silent");
  });
});

describe("SC-004 carry-over leg — a saved code-point invisible stays observable after restore", () => {
  it("alphabet-scope controls entry in a restored draft is adopted once by the invisibles step", () => {
    // A pre-075 draft: the code-point field filed ZWNJ into the pick list,
    // where `deriveStores` routes it to the unrendered `controls` bucket.
    applyPhaseBDraftSnapshot({ chars: ["‌", "a"], selectedFont: DEFAULT_PHASE_B_FONT });
    expect(usePhaseBDraftStore.getState().controls).toEqual(["‌"]);

    render(<InvisiblesStep onComplete={vi.fn()} />);
    expect(classify(0x200c)).toBe("confirmed");
    expect(phaseCConfirmedInventory().filter((c) => c === "‌")).toHaveLength(1);
    expect(screen.getAllByTestId("invisible-candidate-200c")).toHaveLength(1);
    expect(usePhaseBDraftStore.getState().chars).toEqual(["a"]);
  });

  it("punctuation-scope hand-off saved as an accepted decision survives restore and is still confirmed", () => {
    applyPhaseBDraftSnapshot({
      chars: ["!"],
      invisibleDecisions: { "U+00AD": "accepted" },
      selectedFont: DEFAULT_PHASE_B_FONT,
    });
    render(<InvisiblesStep onComplete={vi.fn()} />);
    expect(classify(0x00ad)).toBe("confirmed");
    expect(screen.getByTestId("invisible-candidate-00ad").getAttribute("aria-checked")).toBe("true");
    expect(phaseCConfirmedInventory()).toEqual(["!", "­"]);
  });
});
