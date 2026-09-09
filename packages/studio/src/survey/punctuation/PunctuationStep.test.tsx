// PunctuationStep — the punctuation page (Phase B build-list clone, scoped to
// punctuation) between the marks series and the convenience question.
//
// What matters here: the page collects ONLY punctuation (typed letters are
// declined visibly, never silently absorbed into the shared draft); the list
// is the shared phaseBDraftStore's derived `punctuation` category (so map
// picks and Phase-B leftovers arrive pre-listed); Done emits the picks as
// confirmedInventory on a phase:"C" result (never "B" — see the component's
// module header for the recordPhase shallow-merge hazard); and the sourced
// exemplars' punctuation tier is added FOR the author on arrival, with
// removals that stick.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { render, i18n } from "../../test/renderWithI18n.tsx";
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
  i18n.activate("en");
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

describe("PunctuationStep — automatic CLDR punctuation", () => {
  // useSourcedExemplars only looks up when the session carries a BCP47 tag.
  beforeEach(() => {
    useSurveySessionStore.getState().setSurveyContext({
      bcp47_tag: "hi",
      language_name: "Hindi",
    });
  });

  function withPunctuationTier(chars: string[]): void {
    mocks.inventory = {
      source: "cldr",
      confidence: "high",
      characters: [
        ...chars.map((char) => ({ char, tier: "punctuation" })),
        { char: "क", tier: "main" }, // other tiers are never this page's business
      ],
      digraphs: [],
    };
  }

  it("adds the exemplar punctuation tier on arrival, attributed to the source, with no clicking", async () => {
    withPunctuationTier(["।", "॥"]);
    const onComplete = vi.fn();
    render(<PunctuationStep onComplete={onComplete} />);

    // No tick, no chip to hunt for: the marks are simply in the list, dashed,
    // waiting to be confirmed or pruned.
    await waitFor(() => {
      expect(screen.getByText("Your punctuation (2)")).toBeTruthy();
    });
    expect(screen.getAllByTestId("proposed-punctuation-chip")).toHaveLength(2);
    expect(screen.queryByTestId("authored-punctuation-chip")).toBeNull();
    expect(usePhaseBDraftStore.getState().provenance["।"]).toBe("cldr");

    fireEvent.click(screen.getByTestId("punctuation-done"));
    expect(lastResult(onComplete).confirmedInventory).toEqual(["।", "॥"]);
  });

  it("explains where the marks came from and that removing them is expected", async () => {
    withPunctuationTier(["।"]);
    render(<PunctuationStep onComplete={vi.fn()} />);

    expect(
      await screen.findByText(/The dashed marks came from CLDR exemplars for Hindi/),
    ).toBeTruthy();
    // The old add-only tray is gone, not left behind as a dead empty region.
    expect(screen.queryByText("Suggested punctuation")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Add / })).toBeNull();
  });

  it("only the punctuation tier is proposed — a main-tier letter never lands in the draft", async () => {
    withPunctuationTier(["।"]);
    render(<PunctuationStep onComplete={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Your punctuation (1)")).toBeTruthy();
    });
    expect(usePhaseBDraftStore.getState().chars).toEqual(["।"]);
  });

  it("a removed auto-added mark stays removed across a remount — the proposal never fights the author", async () => {
    withPunctuationTier(["।"]);
    const { unmount } = render(<PunctuationStep onComplete={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Your punctuation (1)")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: /Remove ।/ }));
    expect(screen.getByText("Your punctuation (0)")).toBeTruthy();
    expect(usePhaseBDraftStore.getState().rejected).toContain("।");

    // Remount with the draft empty again: the auto-add gate is open, and the
    // ONLY thing keeping the mark out is the store's sticky rejection.
    unmount();
    const onComplete = vi.fn();
    render(<PunctuationStep onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText("Your punctuation (0)")).toBeTruthy();
    });
    expect(screen.queryByRole("button", { name: /Remove ।/ })).toBeNull();
    fireEvent.click(screen.getByTestId("punctuation-done"));
    expect(lastResult(onComplete).confirmedInventory).toEqual([]);
  });

  it("a removed mark is not re-added by a re-render of the step", async () => {
    withPunctuationTier(["।", "॥"]);
    render(<PunctuationStep onComplete={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Your punctuation (2)")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: /Remove ।/ }));

    // A store write re-renders the step; the effect must not put it back.
    typeAndAdd("!");
    expect(screen.getByText("Your punctuation (2)")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Remove ।/ })).toBeNull();
    expect(usePhaseBDraftStore.getState().punctuation).toEqual(["॥", "!"]);
  });

  it("a returning author's existing punctuation is not proposed over", async () => {
    usePhaseBDraftStore.getState().add("«"); // their own earlier work
    withPunctuationTier(["।"]);
    const onComplete = vi.fn();
    render(<PunctuationStep onComplete={onComplete} />);

    // The loading note is the settle signal — it is on screen only while the
    // lookup is in flight, so waiting for it to GO proves the inventory really
    // resolved (a bare "the hint is absent" assertion would pass vacuously on
    // the first render, before the proposal ever had a chance to fire).
    expect(screen.getByText(/Adding the suggested punctuation for Hindi/)).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByText(/Adding the suggested punctuation/)).toBeNull();
    });
    expect(screen.queryByText(/The dashed marks came from/)).toBeNull();
    expect(screen.getByText("Your punctuation (1)")).toBeTruthy();
    expect(screen.getByTestId("authored-punctuation-chip")).toBeTruthy();
    fireEvent.click(screen.getByTestId("punctuation-done"));
    expect(lastResult(onComplete).confirmedInventory).toEqual(["«"]);
  });

  it("a gated or unknown tag has nothing to propose, says so, and does not crash", async () => {
    mocks.inventory = null; // no coverage, or the confidence gate fired
    render(<PunctuationStep onComplete={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/No suggested punctuation for Hindi/)).toBeTruthy();
    });
    expect(usePhaseBDraftStore.getState().punctuation).toEqual([]);
    expect(screen.queryByTestId("proposed-punctuation-chip")).toBeNull();
  });

  it("says so when the source covers the language but has no punctuation tier", async () => {
    mocks.inventory = {
      source: "cldr",
      confidence: "high",
      characters: [{ char: "क", tier: "main" }],
      digraphs: [],
    };
    render(<PunctuationStep onComplete={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/No suggested punctuation for Hindi/)).toBeTruthy();
    });
    expect(usePhaseBDraftStore.getState().punctuation).toEqual([]);
  });

  // km-triage finding on #1596: an English-only assertion proves the id/macro
  // wiring produces the right English text, but not that a translator can
  // actually REORDER "Remove X (Y)" — the real fr catalog is still an
  // untranslated stub with nothing to test against. This loads a test-only
  // locale whose message deliberately reverses the placeholder order, so a
  // real regression (an assembled fragment ignoring the catalog's word order)
  // would fail this even if the English text matched.
  it("a translator's word-order choice actually reaches a chip's accessible name — not locked to English order", async () => {
    i18n.load("zz", {
      "survey.punctuation.removeAriaLabel": "({cp}) {char} evomer",
    });
    i18n.activate("zz");

    withPunctuationTier(["।"]);
    render(<PunctuationStep onComplete={vi.fn()} />);

    expect(await screen.findByRole("button", { name: "(U+0964) । evomer" })).toBeTruthy();
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
