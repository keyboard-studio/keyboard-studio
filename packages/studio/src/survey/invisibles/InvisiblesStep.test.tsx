// InvisiblesStep — the always-rendering "Invisible characters" spine step
// between punctuation and convenience (spec 075 US3).
//
// What matters here: it never returns null (FR-020); every offered character
// is a named checkbox bound to the draft store's `invisibleDecisions`; an
// accepted character reaches the phase-C inventory WITHOUT touching `chars`
// (FR-014); the result carries one boolean per offered candidate so a
// declined offer is distinguishable from never asked (FR-018); a format
// character an earlier code-point entry filed into `controls` is carried over
// once, pre-selected (FR-017); the bidi group is collapsed for non-RTL authors.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import { InvisiblesStep, writingDirectionFrom } from "./InvisiblesStep.tsx";
import { invisibleCandidatesFor } from "./invisibleCandidates.ts";
import { usePhaseBDraftStore, resetPhaseBDraftDecisions } from "../../stores/phaseBDraftStore.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { phaseCConfirmedInventory } from "../phaseCInventory.ts";

function lastResult(onComplete: ReturnType<typeof vi.fn>): SurveyPhaseResult {
  const call = onComplete.mock.calls.at(-1);
  expect(call).toBeDefined();
  return call![0] as SurveyPhaseResult;
}

function markRtl(): void {
  useWorkingCopyStore.getState().recordPhase({
    phase: "B",
    answers: [{ questionId: "pb_rtl_direction_confirm", answerType: "select", value: "true" }],
  });
}

beforeEach(() => {
  resetPhaseBDraftDecisions();
});

afterEach(() => {
  cleanup();
});

describe("InvisiblesStep — always renders (FR-020)", () => {
  it("renders the step, heading, continue and back even when nothing is relevant, with the none-needed note", () => {
    const onBack = vi.fn();
    const { container } = render(<InvisiblesStep onComplete={vi.fn()} onBack={onBack} />);
    expect(container.firstChild).not.toBeNull();
    expect(screen.getByTestId("invisibles-step")).toBeTruthy();
    expect(screen.getByTestId("invisibles-heading").textContent).toContain("Invisible characters");
    expect(screen.getByTestId("invisibles-continue")).toBeTruthy();
    expect(screen.getByTestId("invisibles-none-needed").textContent).toMatch(/Most keyboards need none/);
    fireEvent.click(screen.getByTestId("invisibles-back"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("omits Back only when onBack is not supplied; the fixed five are still offered by name", () => {
    render(<InvisiblesStep onComplete={vi.fn()} />);
    expect(screen.queryByTestId("invisibles-back")).toBeNull();
    for (const hex of ["200d", "200c", "200b", "00ad", "2060"]) {
      expect(screen.getByTestId(`invisible-candidate-${hex}`)).toBeTruthy();
    }
    expect(screen.getByText(/ZERO WIDTH NON-JOINER/)).toBeTruthy();
    expect(screen.getByText(/WORD JOINER/)).toBeTruthy();
    expect(screen.getByText("U+200C")).toBeTruthy();
  });
});

describe("InvisiblesStep — checkbox toggles bound to invisibleDecisions", () => {
  it("each candidate is a role=checkbox whose aria-checked follows the store; toggling accepts then declines", () => {
    render(<InvisiblesStep onComplete={vi.fn()} />);
    const zwnj = screen.getByTestId("invisible-candidate-200c");
    expect(zwnj.getAttribute("role")).toBe("checkbox");
    expect(zwnj.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(zwnj);
    expect(usePhaseBDraftStore.getState().invisibleDecisions["U+200C"]).toBe("accepted");
    expect(screen.getByTestId("invisible-candidate-200c").getAttribute("aria-checked")).toBe("true");

    fireEvent.click(screen.getByTestId("invisible-candidate-200c"));
    expect(usePhaseBDraftStore.getState().invisibleDecisions["U+200C"]).toBe("declined");
    expect(screen.getByTestId("invisible-candidate-200c").getAttribute("aria-checked")).toBe("false");
  });

  it("every candidate has an accessible name and a need statement wired through aria-labelledby/aria-describedby", () => {
    render(<InvisiblesStep onComplete={vi.fn()} />);
    const row = screen.getByTestId("invisible-candidate-00ad");
    const labelId = row.getAttribute("aria-labelledby")!;
    const needId = row.getAttribute("aria-describedby")!;
    expect(document.getElementById(labelId)?.textContent).toMatch(/SOFT HYPHEN/);
    expect(document.getElementById(needId)?.textContent).toMatch(/hyphenated/);
  });
});

describe("InvisiblesStep — the result (FR-014, FR-018, FR-024)", () => {
  it("accepted characters reach phaseCConfirmedInventory() and never enter chars or controls", () => {
    usePhaseBDraftStore.getState().add("!");
    const onComplete = vi.fn();
    render(<InvisiblesStep onComplete={onComplete} />);
    fireEvent.click(screen.getByTestId("invisible-candidate-200c"));
    fireEvent.click(screen.getByTestId("invisibles-continue"));

    const result = lastResult(onComplete);
    expect(result.phase).toBe("C");
    expect(result.confirmedInventory).toEqual(["!", "‌"]);
    expect(result.confirmedInventory).toEqual(phaseCConfirmedInventory());
    expect(usePhaseBDraftStore.getState().chars).toEqual(["!"]);
    expect(usePhaseBDraftStore.getState().controls).toEqual([]);
  });

  it("carries one boolean answer per offered candidate, so a declined offer is false rather than absent", () => {
    const onComplete = vi.fn();
    render(<InvisiblesStep onComplete={onComplete} />);
    fireEvent.click(screen.getByTestId("invisible-candidate-200d"));
    // Decline explicitly by toggling twice.
    fireEvent.click(screen.getByTestId("invisible-candidate-200b"));
    fireEvent.click(screen.getByTestId("invisible-candidate-200b"));
    fireEvent.click(screen.getByTestId("invisibles-continue"));

    const { answers } = lastResult(onComplete);
    const offered = invisibleCandidatesFor({ direction: "unknown", carriedOver: [] });
    expect(answers).toHaveLength(offered.length);
    for (const a of answers) {
      expect(a.answerType).toBe("boolean");
      expect(a.questionId).toMatch(/^invisibles\.u[0-9a-f]{4,6}$/);
    }
    const byId = Object.fromEntries(answers.map((a) => [a.questionId, a.value]));
    expect(byId["invisibles.u200d"]).toBe(true);
    expect(byId["invisibles.u200b"]).toBe(false); // declined
    expect(byId["invisibles.u00ad"]).toBe(false); // untouched — still a recorded false, not absent
    expect(byId["invisibles.ufeff"]).toBe(false); // collapsed bidi offer, still answered
  });

  it("a second Continue click never completes twice", () => {
    const onComplete = vi.fn();
    render(<InvisiblesStep onComplete={onComplete} />);
    fireEvent.click(screen.getByTestId("invisibles-continue"));
    fireEvent.click(screen.getByTestId("invisibles-continue"));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe("InvisiblesStep — carry-over of code-point entries (FR-017)", () => {
  it("a format character pre-loaded into the draft's controls bucket is offered once, pre-selected, and removed from chars", () => {
    const s = usePhaseBDraftStore.getState();
    s.add("⁡"); // FUNCTION APPLICATION — Cf, in neither offered list
    s.add("‌"); // ZWNJ — a fixed-five member reached by code point
    s.add("!");
    expect(usePhaseBDraftStore.getState().controls).toEqual(["⁡", "‌"]);

    const onComplete = vi.fn();
    render(<InvisiblesStep onComplete={onComplete} />);

    expect(usePhaseBDraftStore.getState().chars).toEqual(["!"]);
    expect(usePhaseBDraftStore.getState().controls).toEqual([]);
    expect(screen.getAllByTestId("invisible-candidate-2061")).toHaveLength(1);
    expect(screen.getByTestId("invisible-candidate-2061").getAttribute("aria-checked")).toBe("true");
    expect(screen.getAllByTestId("invisible-candidate-200c")).toHaveLength(1);
    expect(screen.getByTestId("invisible-candidate-200c").getAttribute("aria-checked")).toBe("true");

    fireEvent.click(screen.getByTestId("invisibles-continue"));
    const result = lastResult(onComplete);
    // Once in the inventory, once in the answers — never duplicated.
    expect(result.confirmedInventory).toEqual(["!", "⁡", "‌"]);
    expect(result.answers.filter((a) => a.questionId === "invisibles.u2061")).toHaveLength(1);
    expect(result.answers.find((a) => a.questionId === "invisibles.u2061")?.value).toBe(true);
  });
});

describe("InvisiblesStep — leave and return (spec 079 FR-051, D-4)", () => {
  it("an accepted candidate survives an unmount/remount with the same evidence", () => {
    const first = render(<InvisiblesStep onComplete={vi.fn()} />);
    fireEvent.click(screen.getByTestId("invisible-candidate-200c"));
    expect(usePhaseBDraftStore.getState().invisibleDecisions["U+200C"]).toBe("accepted");
    expect(screen.getByTestId("invisible-candidate-200c").getAttribute("aria-checked")).toBe("true");

    first.unmount();
    render(<InvisiblesStep onComplete={vi.fn()} />);

    expect(usePhaseBDraftStore.getState().invisibleDecisions["U+200C"]).toBe("accepted");
    expect(screen.getByTestId("invisible-candidate-200c").getAttribute("aria-checked")).toBe("true");
  });

  it("the phase-C answer slot still holds invisibles' own answers after convenience records into the same phase (D-4/R-08)", () => {
    const recordPhase = useWorkingCopyStore.getState().recordPhase;
    const onComplete = vi.fn();
    render(<InvisiblesStep onComplete={onComplete} />);
    fireEvent.click(screen.getByTestId("invisible-candidate-200d"));
    fireEvent.click(screen.getByTestId("invisibles-continue"));
    const invisiblesResult = lastResult(onComplete);

    recordPhase(invisiblesResult, { stepId: "invisibles" });

    // Convenience records into the SAME phase ("C") with its own (empty,
    // never-asked-yet) answer set — this must not erase invisibles' entries.
    recordPhase({ phase: "C", answers: [] }, { stepId: "convenience" });

    const phaseC = useWorkingCopyStore
      .getState()
      .phaseResults.find((p) => p.phase === "C");
    expect(phaseC).toBeDefined();
    for (const a of invisiblesResult.answers) {
      expect(phaseC!.answers).toContainEqual(a);
    }
  });
});

// ---------------------------------------------------------------------------
// spec 079 US3 T048/T079 — a shape change (writing direction becomes RTL)
// proposes new bidi candidates while keeping the earlier decision, and there
// is structurally no `reproposed` flag to show (see ../invisiblesFlags.ts).
// ---------------------------------------------------------------------------

describe("InvisiblesStep — shape change: new candidates proposed, decisions kept, no flags (spec 079 US3 T048/T079)", () => {
  it("a writing-direction change to RTL proposes the bidi candidates while an earlier LTR decision survives", () => {
    const first = render(<InvisiblesStep onComplete={vi.fn()} />);
    fireEvent.click(screen.getByTestId("invisible-candidate-200c")); // an always-offered candidate
    expect(usePhaseBDraftStore.getState().invisibleDecisions["U+200C"]).toBe("accepted");
    first.unmount();

    // Shape change: the author is now known to be RTL — new bidi candidates
    // become relevant.
    useSurveySessionStore.getState().setSurveyContext({ script_family: "rtl" });
    render(<InvisiblesStep onComplete={vi.fn()} />);

    // The earlier decision survives untouched.
    expect(usePhaseBDraftStore.getState().invisibleDecisions["U+200C"]).toBe("accepted");
    expect(screen.getByTestId("invisible-candidate-200c").getAttribute("aria-checked")).toBe("true");
    // The bidi group is now expanded with its candidates newly offered,
    // defaulting to unchecked (proposed, not "reproposed" — nothing was ever
    // decided about them before).
    expect(screen.getByTestId("invisible-candidate-200e").getAttribute("aria-checked")).toBe("false");
  });

  it("never shows a flagged-answers list or reason cue — there is no `reproposed` state for this step's per-answer design", () => {
    const first = render(<InvisiblesStep onComplete={vi.fn()} />);
    fireEvent.click(screen.getByTestId("invisible-candidate-200c"));
    first.unmount();

    useSurveySessionStore.getState().setSurveyContext({ script_family: "rtl" });
    render(<InvisiblesStep onComplete={vi.fn()} />);

    expect(screen.queryByTestId("flagged-answers-list")).toBeNull();
  });
});

describe("InvisiblesStep — the bidi group and writing direction", () => {
  it("collapses the direction controls under the collapsed note when the author is not right-to-left, and can expand them", () => {
    render(<InvisiblesStep onComplete={vi.fn()} />);
    const bidi = screen.getByTestId("invisibles-bidi-group");
    expect(within(bidi).getByText(/right-to-left scripts/)).toBeTruthy();
    expect(screen.queryByTestId("invisible-candidate-200e")).toBeNull();

    fireEvent.click(screen.getByTestId("invisibles-bidi-expand"));
    expect(screen.getByTestId("invisible-candidate-200e")).toBeTruthy();
    expect(screen.getByTestId("invisible-candidate-061c")).toBeTruthy();
  });

  it("shows the direction controls expanded for a right-to-left author", () => {
    markRtl();
    render(<InvisiblesStep onComplete={vi.fn()} />);
    expect(screen.queryByTestId("invisibles-bidi-expand")).toBeNull();
    expect(screen.getByTestId("invisible-candidate-200f")).toBeTruthy();
    expect(screen.getByText(/RIGHT-TO-LEFT MARK/)).toBeTruthy();
  });

  it("writingDirectionFrom reads the Phase A answer first, then the RTL branch, then the script family, else unknown", () => {
    const ctx = {};
    expect(writingDirectionFrom([], ctx)).toBe("unknown");
    expect(
      writingDirectionFrom(
        [{ phase: "A", answers: [{ questionId: "writing_direction", answerType: "select", value: "ltr" }] }],
        ctx,
      ),
    ).toBe("ltr");
    expect(
      writingDirectionFrom(
        [{ phase: "B", answers: [{ questionId: "pb_rtl_direction_confirm", answerType: "select", value: "false" }] }],
        ctx,
      ),
    ).toBe("rtl");
    expect(
      writingDirectionFrom(
        [{ phase: "B", answers: [{ questionId: "pb_non_roman_branch", answerType: "select", value: "rtl" }] }],
        ctx,
      ),
    ).toBe("rtl");
    expect(writingDirectionFrom([], { script_family: "rtl" })).toBe("rtl");
    expect(writingDirectionFrom([], { script_family: "indic" })).toBe("ltr");
  });
});
