// ConvenienceCharsStep — the computed gate plus the rendered question.
//
// The gate never renders: a base with no surplus basic-Latin letters completes
// the step immediately on forward entry and keeps popping backward on a
// back-nav entry (transparent in both directions, mirroring the marks series'
// S0). When there IS something to ask, everything arrives pre-checked and the
// author's unchecks are what shape the emitted retained list.

import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import type { IRGroup, IRRule, SurveyPhaseResult } from "@keyboard-studio/contracts";
import { irGroup, makeTestIR, vkeyRule } from "@keyboard-studio/contracts/fixtures";
import { ConvenienceCharsStep, computeConvenienceGate } from "./ConvenienceCharsStep.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { useSurveyAnswerStore } from "../../stores/surveyAnswerStore.ts";

// neededCharsForLanguage does a real CLDR lookup when unmocked (see the same
// stub in CarveGalleryV2.test.tsx). These tests leave identity unset, so it is
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
  it("applies when the base produces basic-Latin letters the orthography does not use", () => {
    const gate = computeConvenienceGate({
      ...INSTANTIATED,
      produced: fullLatinBase(),
      needed: new Set(["a", "b", "c"]),
    });
    expect(gate.kind).toBe("applies");
    expect(gate.kind === "applies" && gate.candidates.length).toBe(23);
  });

  it("is not-applicable when the orthography uses every basic-Latin letter (a genuine no-surplus base)", () => {
    const gate = computeConvenienceGate({
      ...INSTANTIATED,
      produced: fullLatinBase(),
      needed: new Set("abcdefghijklmnopqrstuvwxyz".split("")),
    });
    expect(gate).toEqual({ kind: "not-applicable", reason: { code: "convenience-no-surplus" } });
  });

  it("is not-applicable for a base that produces no basic Latin at all", () => {
    const gate = computeConvenienceGate({
      ...INSTANTIATED,
      produced: new Set(["а", "б", "в"]),
      needed: new Set(["а"]),
    });
    expect(gate).toEqual({ kind: "not-applicable", reason: { code: "convenience-no-surplus" } });
  });

  // FR-064: missing/unknown evidence must NEVER read as "does not apply" —
  // it is `unknown`, and the step must render rather than silently pass.

  it("is unknown — never not-applicable, never offering all 26 — when no orthography is confirmed yet", () => {
    const gate = computeConvenienceGate({
      instantiated: true,
      hasSignal: false,
      produced: fullLatinBase(),
      needed: new Set(),
    });
    expect(gate).toEqual({ kind: "unknown", reason: { code: "convenience-signal-unknown" } });
  });

  it("is not-applicable when no working copy has been instantiated (genuinely nothing to carve)", () => {
    const gate = computeConvenienceGate({
      instantiated: false,
      hasSignal: true,
      produced: fullLatinBase(),
      needed: new Set(["a"]),
    });
    expect(gate).toEqual({ kind: "not-applicable", reason: { code: "convenience-not-instantiated" } });
  });

  it("offers each surplus letter once, as a case pair carrying both characters", () => {
    const gate = computeConvenienceGate({
      ...INSTANTIATED,
      produced: new Set(["q", "Q", "a", "A"]),
      needed: new Set(["a"]),
    });
    expect(gate.kind === "applies" && gate.candidates).toEqual([{ primary: "q", chars: ["q", "Q"] }]);
  });
});

// ---------------------------------------------------------------------------
// The rendered step. Mirrors MarksSeriesStep.test.tsx's structure: the skip
// path in both directions of travel, then the interaction surface.
// ---------------------------------------------------------------------------

function rule(nodeId: string, vkey: string, char: string): IRRule {
  return vkeyRule({ nodeId, vkey, output: char });
}

function group(rules: IRRule[]): IRGroup {
  return irGroup({ nodeId: "g-main", rules });
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

/**
 * A working copy that IS instantiated but has never confirmed an alphabet —
 * `hasSignal` is false, so the gate reads `unknown` (FR-064), not
 * `not-applicable`.
 */
function seedInstantiatedNoAlphabet(): void {
  const ir = makeTestIR([group([rule("r-0", "K_0", "a")])]);
  useWorkingCopyStore.setState({ ir, instantiationMode: "adapt-existing" });
}

afterEach(() => {
  cleanup();
});

describe("ConvenienceCharsStep — not-applicable (computed, never rendered)", () => {
  it("completes without retainedConvenienceChars and renders nothing (forward entry)", async () => {
    // Every basic-Latin letter the base produces is in the alphabet: a
    // genuinely no-surplus base, known evidence.
    seedWorkingCopy(["a", "A"], ["a"]);
    const onComplete = vi.fn();
    render(<ConvenienceCharsStep onComplete={onComplete} />);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("convenience-chars")).toBeNull();
    const result = onComplete.mock.calls[0]?.[0] as SurveyPhaseResult;
    // Absent — not `[]` — means "never asked" (R-09); `[]` is reserved for a
    // step the author was actually asked and who kept nothing.
    expect(result.retainedConvenienceChars).toBeUndefined();
  });

  it("writes a not-asked status with reason and evidence key, and appends no decision entry (FR-065)", async () => {
    seedWorkingCopy(["a", "A"], ["a"]);
    const onComplete = vi.fn();
    render(<ConvenienceCharsStep onComplete={onComplete} />);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const result = onComplete.mock.calls[0]?.[0] as SurveyPhaseResult;
    expect(result.answers).toEqual([]);

    const status = useSurveyAnswerStore.getState().steps["convenience"]?.status;
    expect(status?.kind).toBe("not-asked");
    expect(status).toMatchObject({
      kind: "not-asked",
      reason: { code: "convenience-no-surplus" },
    });
    expect(typeof (status as { evidenceKey?: unknown })?.evidenceKey).toBe("string");
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

describe("ConvenienceCharsStep — unknown evidence (FR-064: renders, never skips)", () => {
  it("renders the gap explanation instead of skipping when no orthography signal exists yet", async () => {
    seedInstantiatedNoAlphabet();
    const onComplete = vi.fn();
    render(<ConvenienceCharsStep onComplete={onComplete} />);

    await screen.findByTestId("convenience-chars");
    expect(screen.getByTestId("convenience-unknown-notice")).not.toBeNull();
    expect(onComplete).not.toHaveBeenCalled();
    // Never written as a judged skip — there is nothing to judge yet.
    expect(useSurveyAnswerStore.getState().steps["convenience"]?.status).toBeUndefined();
  });

  it("is completable: Continue finishes the step with nothing retained", async () => {
    seedInstantiatedNoAlphabet();
    const onComplete = vi.fn();
    render(<ConvenienceCharsStep onComplete={onComplete} />);
    await screen.findByTestId("convenience-chars");

    fireEvent.click(screen.getByTestId("convenience-continue"));

    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0]?.[0] as SurveyPhaseResult;
    expect(result.retainedConvenienceChars).toEqual([]);
    expect(useSurveyAnswerStore.getState().steps["convenience"]?.status).toEqual({ kind: "finished" });
  });

  it("still allows Back without completing", async () => {
    seedInstantiatedNoAlphabet();
    const onComplete = vi.fn();
    const onBack = vi.fn();
    render(<ConvenienceCharsStep onComplete={onComplete} onBack={onBack} />);
    await screen.findByTestId("convenience-chars");

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(onBack).toHaveBeenCalledTimes(1);
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

  // spec 079 T025: unchecking is store-backed (T034) — it survives an unmount
  // (tab switch) the way every other survey answer does, as long as the
  // evidence (the offered candidate set) is unchanged on remount.
  it("un-ticking survives unmount/remount with the same evidence (T025)", async () => {
    await renderQuestion();
    fireEvent.click(screen.getByLabelText("Keep q Q"));
    fireEvent.click(screen.getByLabelText("Keep x X"));
    for (const box of screen.getAllByRole("checkbox")) {
      expect((box as HTMLInputElement).checked).toBe(false);
    }

    cleanup();
    // Same evidence: same base/orthography seed as renderQuestion's setup.
    const onComplete = vi.fn();
    render(<ConvenienceCharsStep onComplete={onComplete} />);
    await screen.findByTestId("convenience-chars");

    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    for (const box of boxes) expect((box as HTMLInputElement).checked).toBe(false);
    expect(screen.getByTestId("convenience-continue").textContent).toBe(
      "Continue, keeping none",
    );
  });
});

// ---------------------------------------------------------------------------
// spec 079 US3 T048/T079 — a shape change (a new surplus letter appears)
// proposes it pre-checked while an earlier un-tick survives; there is
// structurally no `reproposed` flag to show (see ./convenienceFlags.ts).
// ---------------------------------------------------------------------------

describe("ConvenienceCharsStep — shape change: new surplus proposed, un-ticks kept, no flags (spec 079 US3 T048/T079)", () => {
  it("a newly-surplus letter is proposed pre-checked while an earlier un-tick survives", async () => {
    seedWorkingCopy(["a", "A", "q", "Q"], ["a"]); // one surplus pair initially
    const first = render(<ConvenienceCharsStep onComplete={vi.fn()} />);
    await screen.findByTestId("convenience-chars");
    fireEvent.click(screen.getByLabelText("Keep q Q"));
    expect((screen.getByLabelText("Keep q Q") as HTMLInputElement).checked).toBe(false);
    first.unmount();

    // Shape change: the base now also has an 'x'/'X' surplus pair.
    seedWorkingCopy(["a", "A", "q", "Q", "x", "X"], ["a"]);
    render(<ConvenienceCharsStep onComplete={vi.fn()} />);
    await screen.findByTestId("convenience-chars");

    // Existing un-tick survives.
    expect((screen.getByLabelText("Keep q Q") as HTMLInputElement).checked).toBe(false);
    // New candidate proposed, checked by default (defaults are the product).
    expect((screen.getByLabelText("Keep x X") as HTMLInputElement).checked).toBe(true);
  });

  it("never shows a flagged-answers list — there is no `reproposed` state for this step's per-answer design", async () => {
    seedWorkingCopy(["a", "A", "q", "Q"], ["a"]);
    const first = render(<ConvenienceCharsStep onComplete={vi.fn()} />);
    await screen.findByTestId("convenience-chars");
    fireEvent.click(screen.getByLabelText("Keep q Q"));
    first.unmount();

    seedWorkingCopy(["a", "A", "q", "Q", "x", "X"], ["a"]);
    render(<ConvenienceCharsStep onComplete={vi.fn()} />);
    await screen.findByTestId("convenience-chars");

    expect(screen.queryByTestId("flagged-answers-list")).toBeNull();
  });
});
