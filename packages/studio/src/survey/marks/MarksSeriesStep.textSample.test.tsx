// MarksSeriesStep — S5 stacking from a pasted text sample (spec 071
// FR-018/FR-019).
//
// End to end over the real pieces: the engine's harvestFromText splits the
// sample into grapheme clusters, each goes into the Phase B draft exactly as
// the text-sample affordance adds it (addProposed(char, "text")), the draft
// resolves to the confirmed alphabet, and the marks series renders from that.
// A letter carrying two marks must surface S5 proposing "yes", with that
// combination pre-ticked.

import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { screen, cleanup, act, fireEvent } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import type { BaseKeyboard, ConfirmedAlphabet } from "@keyboard-studio/contracts";
import { createCharacterDiscoveryService } from "@keyboard-studio/engine";
import type { CldrLoader } from "@keyboard-studio/engine";
import { MarksStepHost } from "./MarksStepHost.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { useSurveyAnswerStore } from "../../stores/surveyAnswerStore.ts";
import { usePhaseBDraftStore, draftConfirmedAlphabet } from "../../stores/phaseBDraftStore.ts";

const ACUTE = "́";
const DOT_BELOW = "̣";
const CIRCUMFLEX = "̂";

// harvestFromText reads neither the loader nor the completer.
const service = createCharacterDiscoveryService(
  {} as CldrLoader,
  async () => {
    throw new Error("not used");
  },
);

async function alphabetFromSample(sample: string): Promise<ConfirmedAlphabet> {
  const harvested = await service.harvestFromText(sample, {} as BaseKeyboard);
  for (const { char } of harvested) usePhaseBDraftStore.getState().addProposed(char, "text");
  return draftConfirmedAlphabet();
}

function renderSeries(alphabet: ConfirmedAlphabet): void {
  useWorkingCopyStore.getState().recordPhase({ phase: "B", answers: [], alphabet });
  act(() => {
    render(<MarksStepHost onComplete={() => {}} />, { withStepNav: true });
  });
}

/** Walk forward until S5 shows; null if the series ends without it. */
function walkToStacking(): HTMLElement | null {
  for (let i = 0; i < 8; i++) {
    const station = screen.queryByTestId("marks-stacking");
    if (station !== null) return station;
    const next = screen.queryByTestId("marks-continue");
    if (next === null) return null;
    fireEvent.click(next);
  }
  return null;
}

function stackingRadios(station: HTMLElement): HTMLInputElement[] {
  return [...station.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
}

function tickedCombinations(station: HTMLElement): string[] {
  return [...station.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
    .filter((box) => box.checked)
    .map((box) => box.getAttribute("aria-label") ?? "");
}

beforeEach(() => {
  usePhaseBDraftStore.getState().reset();
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
  useSurveyAnswerStore.getState().reset();
});

afterEach(() => {
  cleanup();
});

describe("MarksSeriesStep — S5 stacking from a text sample", () => {
  it("attests a two-mark letter from an NFC sample and proposes yes with it pre-ticked", async () => {
    // Yoruba: ẹ́ is e + dot below + acute.
    const alphabet = await alphabetFromSample("Ó wá ní ẹ́ bẹ́ẹ̀ ni");
    expect(alphabet.attestedStacks).toContainEqual({ base: "e", marks: [DOT_BELOW, ACUTE] });

    renderSeries(alphabet);
    const station = walkToStacking();
    expect(station).not.toBeNull();

    const [yes, no] = stackingRadios(station!);
    expect(yes?.checked).toBe(true);
    expect(no?.checked).toBe(false);
    expect(tickedCombinations(station!).some((label) => label.includes("U+0323 + U+0301"))).toBe(true);
  });

  it("gives the same stack for an NFD sample", async () => {
    const alphabet = await alphabetFromSample(`be${DOT_BELOW}${ACUTE} ta`.normalize("NFD"));
    expect(alphabet.attestedStacks).toContainEqual({ base: "e", marks: [DOT_BELOW, ACUTE] });
  });

  it("gives the same stack whichever order marks of different combining class were typed in", async () => {
    // Acute (ccc 230) typed BEFORE dot below (ccc 220): canonically equivalent
    // to the other order, so it is the same letter, not a second spelling.
    const alphabet = await alphabetFromSample(`e${ACUTE}${DOT_BELOW}`);
    const multi = alphabet.attestedStacks.filter((s) => s.marks.length >= 2);
    expect(multi).toEqual([{ base: "e", marks: [DOT_BELOW, ACUTE] }]);
  });

  it("proposes yes for Vietnamese ệ (circumflex + dot below)", async () => {
    const alphabet = await alphabetFromSample("Tiếng Việt");
    expect(alphabet.attestedStacks.some((s) => s.base === "e" && s.marks.length >= 2)).toBe(true);
    expect(alphabet.attestedStacks).toContainEqual({ base: "e", marks: [DOT_BELOW, CIRCUMFLEX] });

    renderSeries(alphabet);
    const station = walkToStacking();
    expect(station).not.toBeNull();
    expect(stackingRadios(station!)[0]?.checked).toBe(true);
    expect(tickedCombinations(station!).length).toBeGreaterThan(0);
  });

  it("keeps the stack when the single-mark sibling is removed from the draft", async () => {
    await alphabetFromSample("ẹ́ é");
    usePhaseBDraftStore.getState().remove("é");
    expect(draftConfirmedAlphabet().attestedStacks).toContainEqual({ base: "e", marks: [DOT_BELOW, ACUTE] });
  });
});
