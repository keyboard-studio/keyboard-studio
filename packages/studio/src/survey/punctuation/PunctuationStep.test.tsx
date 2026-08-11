// PunctuationStep — the punctuation page (Phase B build-list clone, scoped to
// punctuation) between the marks series and the convenience question.
//
// What matters here: the page collects ONLY punctuation (typed letters are
// declined visibly, never silently absorbed into the shared draft); the list
// is the shared phaseBDraftStore's derived `punctuation` category (so map
// picks and Phase-B leftovers arrive pre-listed); Done emits the picks as
// confirmedInventory on a phase:"C" result (never "B" — see the component's
// module header for the recordPhase shallow-merge hazard); suggestions come
// from the sourced exemplars' punctuation tier as tick-to-add proposals.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import { PunctuationStep } from "./PunctuationStep.tsx";
import { usePhaseBDraftStore, resetPhaseBDraftDecisions } from "../../stores/phaseBDraftStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";

// sourcedExemplars does a real (offline-index) lookup when unmocked;
// charactersInTier is a pure engine re-export, reproduced verbatim so the
// component sees the same tier-filter contract.
const mocks = vi.hoisted(() => ({
  inventory: null as {
    source: string;
    confidence: string;
    characters: { char: string; tier: string }[];
    digraphs: string[];
  } | null,
}));
vi.mock("../../lib/services.ts", () => ({
  sourcedExemplars: async () => mocks.inventory,
  charactersInTier: (
    inv: { characters: { char: string; tier: string }[] },
    tier: string,
  ) => inv.characters.filter((c) => c.tier === tier).map((c) => c.char),
}));

function typeAndAdd(text: string): void {
  fireEvent.change(screen.getByLabelText("Punctuation to add"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "+ Add" }));
}

function lastResult(onComplete: ReturnType<typeof vi.fn>): SurveyPhaseResult {
  const call = onComplete.mock.calls.at(-1);
  expect(call).toBeDefined();
  return call![0] as SurveyPhaseResult;
}

beforeEach(() => {
  mocks.inventory = null;
  usePhaseBDraftStore.getState().reset();
  // reset() deliberately leaves the sticky proposal decisions (`rejected`)
  // alone; clear them so a removal in one test cannot suppress a proposal in
  // the next.
  resetPhaseBDraftDecisions();
  useSurveySessionStore.getState().reset();
});

afterEach(() => {
  cleanup();
});

describe("PunctuationStep — type-in and Done", () => {
  it("adds typed punctuation to the list and Done emits it as phase-C confirmedInventory", () => {
    const onComplete = vi.fn();
    render(<PunctuationStep onComplete={onComplete} />);

    typeAndAdd("! ?");
    expect(screen.getByText("Your punctuation (2)")).toBeTruthy();

    fireEvent.click(screen.getByTestId("punctuation-done"));
    expect(lastResult(onComplete)).toEqual({
      phase: "C",
      answers: [],
      confirmedInventory: ["!", "?"],
    });
  });

  it("Done with nothing chosen emits an empty confirmedInventory (a valid answer, not a skip)", () => {
    const onComplete = vi.fn();
    render(<PunctuationStep onComplete={onComplete} />);

    const done = screen.getByTestId("punctuation-done");
    expect(done.textContent).toContain("Continue without punctuation");
    fireEvent.click(done);
    expect(lastResult(onComplete)).toEqual({ phase: "C", answers: [], confirmedInventory: [] });
  });

  it("declines non-punctuation typed input with a visible note and keeps it OUT of the shared draft", () => {
    const onComplete = vi.fn();
    render(<PunctuationStep onComplete={onComplete} />);

    typeAndAdd("a !");
    // The "!" is collected; the "a" is declined out loud — a letter absorbed
    // here would silently resurface in the Phase B alphabet.
    expect(screen.getByText("Your punctuation (1)")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("a");
    expect(usePhaseBDraftStore.getState().chars).toEqual(["!"]);
  });

  it("clicking a chip removes that pick", () => {
    const onComplete = vi.fn();
    render(<PunctuationStep onComplete={onComplete} />);

    typeAndAdd("! ?");
    fireEvent.click(screen.getByRole("button", { name: /Remove !/ }));
    expect(screen.getByText("Your punctuation (1)")).toBeTruthy();

    fireEvent.click(screen.getByTestId("punctuation-done"));
    expect(lastResult(onComplete).confirmedInventory).toEqual(["?"]);
  });
});

describe("PunctuationStep — shared draft continuity", () => {
  it("punctuation already in the shared draft (Phase B leftovers, map picks) arrives pre-listed", () => {
    usePhaseBDraftStore.getState().add("«");
    usePhaseBDraftStore.getState().add("a"); // a letter — not this page's category
    const onComplete = vi.fn();
    render(<PunctuationStep onComplete={onComplete} />);

    expect(screen.getByText("Your punctuation (1)")).toBeTruthy();
    fireEvent.click(screen.getByTestId("punctuation-done"));
    // Only the punctuation category is emitted — the letter stays Phase B's.
    expect(lastResult(onComplete).confirmedInventory).toEqual(["«"]);
  });
});

describe("PunctuationStep — sourced suggestions", () => {
  // useSourcedExemplars only looks up when the session carries a BCP47 tag.
  beforeEach(() => {
    useSurveySessionStore.getState().setSurveyContext({
      bcp47_tag: "hi",
      language_name: "Hindi",
    });
  });

  it("offers the exemplar punctuation tier as tick-to-add proposals that keep their attribution", async () => {
    mocks.inventory = {
      source: "cldr",
      confidence: "high",
      characters: [
        { char: "।", tier: "punctuation" },
        { char: "क", tier: "main" }, // other tiers never offered here
      ],
      digraphs: [],
    };
    const onComplete = vi.fn();
    render(<PunctuationStep onComplete={onComplete} />);

    const chip = await screen.findByRole("button", { name: /Add । / });
    fireEvent.click(chip);

    // The tick lands in the list as a PROPOSED pick (dashed attribution) and
    // leaves the suggestion panel (add-only, like the alphabet screen's).
    expect(screen.getByTestId("proposed-punctuation-chip")).toBeTruthy();
    expect(screen.getByText("Every suggested punctuation mark is already in your list below.")).toBeTruthy();

    fireEvent.click(screen.getByTestId("punctuation-done"));
    expect(lastResult(onComplete).confirmedInventory).toEqual(["।"]);
  });

  it("renders the suggestion chip's accessible name as one full catalog sentence, not an assembled fragment (#1589)", async () => {
    mocks.inventory = {
      source: "cldr",
      confidence: "high",
      characters: [{ char: "।", tier: "punctuation" }],
      digraphs: [],
    };
    render(<PunctuationStep onComplete={vi.fn()} />);

    expect(await screen.findByRole("button", { name: "Add । (U+0964)" })).toBeTruthy();
  });

  it("says so when the source has no punctuation tier for the language", async () => {
    mocks.inventory = {
      source: "cldr",
      confidence: "high",
      characters: [{ char: "क", tier: "main" }],
      digraphs: [],
    };
    render(<PunctuationStep onComplete={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/No suggested punctuation/)).toBeTruthy();
    });
  });
});

describe("PunctuationStep — navigation", () => {
  it("renders a Back button only when onBack is supplied", () => {
    const { unmount } = render(<PunctuationStep onComplete={vi.fn()} />);
    expect(screen.queryByTestId("punctuation-back")).toBeNull();
    unmount();

    const onBack = vi.fn();
    render(<PunctuationStep onComplete={vi.fn()} onBack={onBack} />);
    fireEvent.click(screen.getByTestId("punctuation-back"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("a second Done click never completes twice", () => {
    const onComplete = vi.fn();
    render(<PunctuationStep onComplete={onComplete} />);

    fireEvent.click(screen.getByTestId("punctuation-done"));
    fireEvent.click(screen.getByTestId("punctuation-done"));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
