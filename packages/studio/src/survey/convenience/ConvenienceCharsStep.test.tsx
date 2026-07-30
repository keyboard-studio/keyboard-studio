// ConvenienceCharsStep — the computed gate plus the rendered question.
//
// The gate never renders: a base with no surplus basic-Latin letters completes
// the step immediately on forward entry and keeps popping backward on a
// back-nav entry (transparent in both directions, mirroring the marks series'
// S0). When there IS something to ask, everything arrives pre-checked and the
// author's unchecks are what shape the emitted retained list.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import type { IRGroup, IRRule, SurveyPhaseResult } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { ConvenienceCharsStep, computeConvenienceGate } from "./ConvenienceCharsStep.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";

// neededCharsForLanguage does a real CLDR lookup when unmocked (see the same
// stub in CarveGallery.test.tsx). These tests leave identity unset, so it is
// never called — the stub only guarantees that stays true.
vi.mock("../../lib/services.ts", () => ({
  neededCharsForLanguage: async () => null,
}));

/** A base keyboard producing the whole of basic Latin, both cases. */
function fullLatinBase(): Set<string> {
  const s = new Set<string>();
  for (const c of "abcdefghijklmnopqrstuvwxyz") {
    s.add(c);
    s.add(c.toUpperCase());
  }
  return s;
}

const INSTANTIATED = { instantiated: true, hasSignal: true } as const;

describe("computeConvenienceGate", () => {
  it("asks when the base produces basic-Latin letters the orthography does not use", () => {
    const gate = computeConvenienceGate({
      ...INSTANTIATED,
      produced: fullLatinBase(),
      needed: new Set(["a", "b", "c"]),
    });
    expect(gate.skip).toBe(false);
    expect(gate.candidates.length).toBe(23);
  });

  it("skips when the orthography uses every basic-Latin letter", () => {
    const gate = computeConvenienceGate({
      ...INSTANTIATED,
      produced: fullLatinBase(),
      needed: new Set("abcdefghijklmnopqrstuvwxyz".split("")),
    });
    expect(gate).toEqual({ skip: true, candidates: [] });
  });

  it("skips for a base that produces no basic Latin at all", () => {
    const gate = computeConvenienceGate({
      ...INSTANTIATED,
      produced: new Set(["а", "б", "в"]),
      needed: new Set(["а"]),
    });
    expect(gate).toEqual({ skip: true, candidates: [] });
  });

  // The two "cannot ask" cases below MUST resolve to skip, never to a
  // render-nothing-and-wait state: a spine step that renders null without
  // completing is a dead end the author cannot navigate out of.

  it("skips — rather than offering all 26 — when no orthography is confirmed yet", () => {
    const gate = computeConvenienceGate({
      instantiated: true,
      hasSignal: false,
      produced: fullLatinBase(),
      needed: new Set(),
    });
    expect(gate).toEqual({ skip: true, candidates: [] });
  });

  it("skips when no working copy has been instantiated", () => {
    const gate = computeConvenienceGate({
      instantiated: false,
      hasSignal: true,
      produced: fullLatinBase(),
      needed: new Set(["a"]),
    });
    expect(gate).toEqual({ skip: true, candidates: [] });
  });

  it("offers each surplus letter once, as a case pair carrying both characters", () => {
    const gate = computeConvenienceGate({
      ...INSTANTIATED,
      produced: new Set(["q", "Q", "a", "A"]),
      needed: new Set(["a"]),
    });
    expect(gate.candidates).toEqual([{ primary: "q", chars: ["q", "Q"] }]);
  });
});

// ---------------------------------------------------------------------------
// The rendered step. Mirrors MarksSeriesStep.test.tsx's structure: the skip
// path in both directions of travel, then the interaction surface.
// ---------------------------------------------------------------------------

function rule(nodeId: string, vkey: string, char: string): IRRule {
  return {
    nodeId,
    context: [{ kind: "vkey", name: vkey, modifiers: [] }],
    output: [{ kind: "char", value: char }],
  };
}

function group(rules: IRRule[]): IRGroup {
  return { nodeId: "g-main", name: "main", usingKeys: true, rules, readonly: false };
}

/**
 * Seed a working copy whose base produces `produced` while the confirmed
 * orthography needs only `bases`. Identity is deliberately left unset so the
 * CLDR lookup settles synchronously ("no language to look up" is a SETTLED
 * state) and `hasSignal` rests on the alphabet alone.
 */
function seedWorkingCopy(produced: string[], bases: string[]): void {
  const ir = makeTestIR([
    group(produced.map((ch, i) => rule(`r-${i}`, `K_${i}`, ch))),
  ]);
  useWorkingCopyStore.setState({ ir, instantiationMode: "adapt-existing" });
  useWorkingCopyStore.getState().recordPhase({
    phase: "B",
    answers: [],
    alphabet: { bases, marks: [], attestedStacks: [], declaredRoles: {} },
  });
}

/** 'q'/'Q' and 'x'/'X' are surplus; the orthography needs only 'a'. */
function seedTwoSurplusPairs(): void {
  seedWorkingCopy(["a", "A", "q", "Q", "x", "X"], ["a"]);
}

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
});

afterEach(() => {
  cleanup();
});

describe("ConvenienceCharsStep — skip path (computed, never rendered)", () => {
  it("completes with an empty retained list and renders nothing (forward entry)", async () => {
    // Every basic-Latin letter the base produces is in the alphabet.
    seedWorkingCopy(["a", "A"], ["a"]);
    const onComplete = vi.fn();
    render(<ConvenienceCharsStep onComplete={onComplete} />);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("convenience-chars")).toBeNull();
    const result = onComplete.mock.calls[0]?.[0] as SurveyPhaseResult;
    // `[]` records "asked, kept nothing" — distinct from absent (never asked).
    expect(result.retainedConvenienceChars).toEqual([]);
  });

  it("pops backward instead of completing when entered via back-navigation", async () => {
    seedWorkingCopy(["a", "A"], ["a"]);
    const onComplete = vi.fn();
    const onBack = vi.fn();
    // The Back press that landed here: back from carve into convenience.
    useSurveySessionStore.getState().advance("convenience");
    useSurveySessionStore.getState().advance("carve");
    useSurveySessionStore.getState().popHistory();

    render(<ConvenienceCharsStep onComplete={onComplete} onBack={onBack} />);

    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
    expect(onComplete).not.toHaveBeenCalled();
  });
});

describe("ConvenienceCharsStep — the question", () => {
  /** Renders and waits for the async needed-set to settle into a real list. */
  async function renderQuestion(): Promise<ReturnType<typeof vi.fn>> {
    seedTwoSurplusPairs();
    const onComplete = vi.fn();
    render(<ConvenienceCharsStep onComplete={onComplete} />);
    await screen.findByTestId("convenience-chars");
    expect(onComplete).not.toHaveBeenCalled();
    return onComplete;
  }

  it("renders every candidate pre-checked (defaults are the product)", async () => {
    await renderQuestion();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    for (const box of boxes) expect((box as HTMLInputElement).checked).toBe(true);
    // Both cases ride on one chip, and the button counts what survives.
    expect(screen.getByLabelText("Keep q Q")).not.toBeNull();
    expect(screen.getByTestId("convenience-continue").textContent)
      .toBe("Continue, keeping 2 letters");
  });

  it("emits only the checked pairs — both cases together — on Continue", async () => {
    const onComplete = await renderQuestion();
    fireEvent.click(screen.getByLabelText("Keep q Q"));
    expect(screen.getByTestId("convenience-continue").textContent)
      .toBe("Continue, keeping 1 letter");

    fireEvent.click(screen.getByTestId("convenience-continue"));

    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0]?.[0] as SurveyPhaseResult;
    expect(result.retainedConvenienceChars).toEqual(["x", "X"]);
  });

  it("Keep none clears every candidate; Keep all restores them", async () => {
    const onComplete = await renderQuestion();
    fireEvent.click(screen.getByTestId("convenience-keep-none"));
    for (const box of screen.getAllByRole("checkbox")) {
      expect((box as HTMLInputElement).checked).toBe(false);
    }
    expect(screen.getByTestId("convenience-continue").textContent)
      .toBe("Continue, keeping none");

    fireEvent.click(screen.getByTestId("convenience-keep-all"));
    for (const box of screen.getAllByRole("checkbox")) {
      expect((box as HTMLInputElement).checked).toBe(true);
    }
    expect(screen.getByTestId("convenience-continue").textContent)
      .toBe("Continue, keeping 2 letters");

    fireEvent.click(screen.getByTestId("convenience-continue"));
    const result = onComplete.mock.calls[0]?.[0] as SurveyPhaseResult;
    expect(result.retainedConvenienceChars).toEqual(["q", "Q", "x", "X"]);
  });

  it("records an empty retained list when the author keeps none", async () => {
    const onComplete = await renderQuestion();
    fireEvent.click(screen.getByTestId("convenience-keep-none"));
    fireEvent.click(screen.getByTestId("convenience-continue"));

    const result = onComplete.mock.calls[0]?.[0] as SurveyPhaseResult;
    expect(result.retainedConvenienceChars).toEqual([]);
  });

  it("Back navigates without completing the step", async () => {
    seedTwoSurplusPairs();
    const onComplete = vi.fn();
    const onBack = vi.fn();
    render(<ConvenienceCharsStep onComplete={onComplete} onBack={onBack} />);
    await screen.findByTestId("convenience-chars");

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });
});
