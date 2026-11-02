// InvisiblesStep — the always-rendering "Invisible characters" spine step
// between punctuation and convenience (spec 075 US3, as amended by #2283).
//
// What matters here: it never returns null (FR-020); the left pane is the
// author's BUILD LIST — only accepted characters render, each with its name,
// U+XXXX and a remove control (remove = declineInvisible); unaccepted
// candidates are never rendered here (the gallery is the pick surface); an
// accepted character reaches the phase-C inventory WITHOUT touching `chars`
// (FR-014); the result carries one boolean per offered candidate so a
// declined offer is distinguishable from never asked (FR-018); a format
// character an earlier code-point entry filed into `controls` is carried over
// once, pre-selected (FR-017); the bidi group no longer lives in this pane —
// the gallery keeps the expanded-for-RTL / collapsed-never-hidden-for-LTR
// rule.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import { directionAnswersFromDecisions, writingDirectionFrom } from "./InvisiblesStep.tsx";
import { InvisiblesStepHost } from "./InvisiblesStepHost.tsx";
import { InvisiblesGalleryPane } from "../characterMap/InvisiblesGalleryPane.tsx";
import { invisibleCandidatesFor } from "./invisibleCandidates.ts";
import { getCharacterInventoryValue, getInvisiblesInventoryValue, inventoryOps, resetInventoryDecisions } from "../../survey/useInventoryDraft.ts";
import { invisibleDecisionsOf } from "../../survey/phaseBDraftOps.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { phaseCConfirmedInventory } from "../phaseCInventory.ts";

function lastResult(onComplete: ReturnType<typeof vi.fn>): SurveyPhaseResult {
  const call = onComplete.mock.calls.at(-1);
  expect(call).toBeDefined();
  return call![0] as SurveyPhaseResult;
}

function markRtl(): void {
  // The author answered the Phase B rtl-confirm question on the characters
  // step; its completion records the answer as the module's provided
  // decision (recordAnswersAsDecisions), which is where the invisibles
  // step now reads the direction signal from. (Until spec 090 T063 this
  // wrote the answer into the phase-B result slot; the slot carries no
  // answers now.)
  useDecisionStore.getState().record({
    id: "rtl-direction-confirm",
    value: "true",
    provenance: "asked",
    step: "characters",
  });
}

/** The step's left pane AND the right-pane gallery in one tree, sharing the
 *  draft store — the production arrangement (manifest rightPane). */
function renderStepWithGallery(onComplete: ReturnType<typeof vi.fn> = vi.fn()) {
  return render(
    <>
      <InvisiblesStepHost onComplete={onComplete} />
      <InvisiblesGalleryPane />
    </>,
    { withStepNav: true },
  );
}

beforeEach(() => {
  resetInventoryDecisions();
});

afterEach(() => {
  cleanup();
});

describe("InvisiblesStep — always renders (FR-020)", () => {
  it("renders the step, heading, continue and back even when nothing is accepted, with the none-needed note and a gallery pointer", () => {
    const onBack = vi.fn();
    const { container } = render(<InvisiblesStepHost onComplete={vi.fn()} onBack={onBack} />, { withStepNav: true });
    expect(container.firstChild).not.toBeNull();
    expect(screen.getByTestId("invisibles-step")).toBeTruthy();
    expect(screen.getByTestId("invisibles-heading").textContent).toContain("Invisible characters");
    expect(screen.getByTestId("invisibles-continue")).toBeTruthy();
    expect(screen.getByTestId("invisibles-none-needed").textContent).toMatch(/Most keyboards need none/);
    expect(screen.getByTestId("invisibles-gallery-pointer").textContent).toMatch(/gallery on the right/);
    fireEvent.click(screen.getByTestId("invisibles-back"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("omits Back only when onBack is not supplied; no candidate is offered in the left pane", () => {
    render(<InvisiblesStepHost onComplete={vi.fn()} />, { withStepNav: true });
    expect(screen.queryByTestId("invisibles-back")).toBeNull();
    // The left pane is the accepted list, not a picker: with nothing
    // accepted, NO candidate row renders — not the fixed five…
    for (const hex of ["200d", "200c", "200b", "00ad", "2060"]) {
      expect(screen.queryByTestId(`invisible-accepted-${hex}`)).toBeNull();
    }
    // …and the old checkbox-picker testids are gone entirely.
    expect(document.querySelector('[data-testid^="invisible-candidate-"]')).toBeNull();
    // The bidi group moved to the gallery: no collapsed section here.
    expect(screen.queryByTestId("invisibles-bidi-group")).toBeNull();
    expect(screen.queryByTestId("invisibles-bidi-expand")).toBeNull();
  });
});

describe("InvisiblesStep — the accepted list (#2283)", () => {
  it("renders only accepted characters, each with its name, U+XXXX, need statement and a labelled remove control", () => {
    inventoryOps("invisibles").acceptInvisible("U+200C");
    inventoryOps("invisibles").acceptInvisible("U+00AD");
    render(<InvisiblesStepHost onComplete={vi.fn()} />, { withStepNav: true });

    const zwnj = screen.getByTestId("invisible-accepted-200c");
    expect(zwnj.textContent).toMatch(/ZERO WIDTH NON-JOINER/);
    expect(zwnj.textContent).toContain("U+200C");
    expect(zwnj.textContent).toMatch(/Persian and Urdu/);
    const remove = screen.getByTestId("invisible-accepted-remove-200c");
    expect(remove.tagName).toBe("BUTTON");
    expect(remove.getAttribute("aria-label")).toMatch(/Remove .*ZERO WIDTH NON-JOINER.*\(U\+200C\)/);

    // Accepted…
    expect(screen.getByTestId("invisible-accepted-00ad")).toBeTruthy();
    // …and nothing else: declined and untouched candidates stay unrendered.
    inventoryOps("invisibles").declineInvisible("U+200D");
    cleanup();
    render(<InvisiblesStepHost onComplete={vi.fn()} />, { withStepNav: true });
    expect(screen.queryByTestId("invisible-accepted-200d")).toBeNull();
    expect(screen.queryByTestId("invisible-accepted-200b")).toBeNull();
  });

  it("removing on the left declines the decision, drops the row, and un-ticks the gallery cell", () => {
    renderStepWithGallery();
    fireEvent.click(screen.getByTestId("invisible-gallery-cell-200c"));
    expect(screen.getByTestId("invisible-accepted-200c")).toBeTruthy();

    fireEvent.click(screen.getByTestId("invisible-accepted-remove-200c"));
    expect(invisibleDecisionsOf(getInvisiblesInventoryValue())["U+200C"]).toBe("declined");
    expect(screen.queryByTestId("invisible-accepted-200c")).toBeNull();
    expect(screen.getByTestId("invisible-gallery-cell-200c").getAttribute("aria-checked")).toBe("false");
    // The empty state returns, with its guidance.
    expect(screen.getByTestId("invisibles-none-needed")).toBeTruthy();
  });

  it("accepting in the gallery adds the row on the left with the gallery still showing it checked", () => {
    renderStepWithGallery();
    fireEvent.click(screen.getByTestId("invisible-gallery-cell-200d"));

    const row = screen.getByTestId("invisible-accepted-200d");
    expect(row.textContent).toMatch(/ZERO WIDTH JOINER/);
    expect(row.textContent).toContain("U+200D");
    expect(screen.getByTestId("invisible-gallery-cell-200d").getAttribute("aria-checked")).toBe("true");
    // The guidance note is replaced by the list.
    expect(screen.queryByTestId("invisibles-none-needed")).toBeNull();
  });

  it("a carried-over bidi character renders in the left list (the pane is direction-independent)", () => {
    // U+061C is a bidi-allowlist member the step used to hide behind the
    // collapsed group; as an accepted character it renders in the list.
    inventoryOps("invisibles").acceptInvisible("U+061C");
    render(<InvisiblesStepHost onComplete={vi.fn()} />, { withStepNav: true });
    expect(screen.getByTestId("invisible-accepted-061c").textContent).toMatch(/ARABIC LETTER MARK/);
  });
});

describe("InvisiblesStep — the result (FR-014, FR-018, FR-024)", () => {
  it("accepted characters reach phaseCConfirmedInventory() and never enter chars or controls", () => {
    inventoryOps("characters").add("!");
    const onComplete = vi.fn();
    renderStepWithGallery(onComplete);
    fireEvent.click(screen.getByTestId("invisible-gallery-cell-200c"));
    fireEvent.click(screen.getByTestId("invisibles-continue"));

    const result = lastResult(onComplete);
    expect(result.phase).toBe("C");
    expect(result.confirmedInventory).toEqual(["!", "‌"]);
    expect(result.confirmedInventory).toEqual(phaseCConfirmedInventory());
    expect(getCharacterInventoryValue().chars).toEqual(["!"]);
    expect(getCharacterInventoryValue().controls).toEqual([]);
  });

  it("carries one boolean answer per offered candidate, so a declined offer is false rather than absent", () => {
    const onComplete = vi.fn();
    renderStepWithGallery(onComplete);
    fireEvent.click(screen.getByTestId("invisible-gallery-cell-200d"));
    // Decline explicitly by toggling twice.
    fireEvent.click(screen.getByTestId("invisible-gallery-cell-200b"));
    fireEvent.click(screen.getByTestId("invisible-gallery-cell-200b"));
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
    render(<InvisiblesStepHost onComplete={onComplete} />, { withStepNav: true });
    fireEvent.click(screen.getByTestId("invisibles-continue"));
    fireEvent.click(screen.getByTestId("invisibles-continue"));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe("InvisiblesStep — carry-over of code-point entries (FR-017)", () => {
  it("a format character pre-loaded into the draft's controls bucket lands pre-selected in the left list, and is removed from chars", () => {
    const s = inventoryOps("characters");
    s.add("⁡"); // FUNCTION APPLICATION — Cf, in neither offered list
    s.add("‌"); // ZWNJ — a fixed-five member reached by code point
    s.add("!");
    expect(getCharacterInventoryValue().controls).toEqual(["⁡", "‌"]);

    const onComplete = vi.fn();
    render(<InvisiblesStepHost onComplete={onComplete} />, { withStepNav: true });

    expect(getCharacterInventoryValue().chars).toEqual(["!"]);
    expect(getCharacterInventoryValue().controls).toEqual([]);
    // Both arrive pre-accepted in the left list — with remove controls,
    // not checkboxes.
    expect(screen.getAllByTestId("invisible-accepted-2061")).toHaveLength(1);
    expect(screen.getByTestId("invisible-accepted-remove-2061")).toBeTruthy();
    expect(screen.getAllByTestId("invisible-accepted-200c")).toHaveLength(1);
    expect(screen.getByTestId("invisible-accepted-remove-200c")).toBeTruthy();

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
    const first = renderStepWithGallery();
    // Accept through the gallery (the production pick path — a store write
    // outside `act` would not flush the step's re-render in this harness).
    fireEvent.click(screen.getByTestId("invisible-gallery-cell-200c"));
    expect(invisibleDecisionsOf(getInvisiblesInventoryValue())["U+200C"]).toBe("accepted");
    expect(screen.getByTestId("invisible-accepted-200c")).toBeTruthy();

    first.unmount();
    render(<InvisiblesStepHost onComplete={vi.fn()} />, { withStepNav: true });

    expect(invisibleDecisionsOf(getInvisiblesInventoryValue())["U+200C"]).toBe("accepted");
    expect(screen.getByTestId("invisible-accepted-200c")).toBeTruthy();
  });

  it("invisibles' recorded answers still hold after convenience records into the same phase (D-4/R-08)", () => {
    const recordPhase = useWorkingCopyStore.getState().recordPhase;
    const onComplete = vi.fn();
    renderStepWithGallery(onComplete);
    fireEvent.click(screen.getByTestId("invisible-gallery-cell-200d"));
    fireEvent.click(screen.getByTestId("invisibles-continue"));
    const invisiblesResult = lastResult(onComplete);

    recordPhase(invisiblesResult, { stepId: "invisibles" });

    // Convenience records into the SAME phase ("C") with its own (empty,
    // never-asked-yet) answer set — this must not erase invisibles' entries.
    recordPhase({ phase: "C", answers: [] }, { stepId: "convenience" });

    // The phase slot no longer carries answers (spec 090 T063): what
    // recordPhase still owes D-4 is the phase's non-answer fields — the
    // confirmed inventory invisibles recorded survives the same-phase
    // recording (the slot's shallow merge keeps it).
    const phaseC = useWorkingCopyStore
      .getState()
      .phaseResults.find((p) => p.phase === "C");
    expect(phaseC).toBeDefined();
    expect(phaseC!.confirmedInventory).toEqual(invisiblesResult.confirmedInventory);

    // The answers themselves are decision state now: every answer
    // invisibles recorded is still held in its inventory decision,
    // exactly as recorded — convenience's same-phase recording erased
    // none of them (spec 079 D-4/R-08).
    const held = invisibleDecisionsOf(getInvisiblesInventoryValue());
    for (const a of invisiblesResult.answers) {
      const notation = "U+" + a.questionId.slice("invisibles.u".length).toUpperCase();
      expect(held[notation] === "accepted").toBe(a.value);
    }
  });
});

// ---------------------------------------------------------------------------
// spec 079 US3 T048/T079 — a shape change (writing direction becomes RTL)
// proposes new bidi candidates while keeping the earlier decision, and there
// is structurally no `reproposed` flag to show (see useWorkToDo.ts's
// spec-079 note). Since #2283 the proposal surface is the gallery: the step
// keeps the earlier decision in its accepted list, and the gallery shows the
// bidi group expanded for the RTL author.
// ---------------------------------------------------------------------------

describe("InvisiblesStep — shape change: new candidates proposed, decisions kept, no flags (spec 079 US3 T048/T079)", () => {
  it("a writing-direction change to RTL proposes the bidi candidates in the gallery while an earlier decision survives in the step's list", () => {
    const first = renderStepWithGallery();
    fireEvent.click(screen.getByTestId("invisible-gallery-cell-200c")); // an always-offered candidate
    expect(invisibleDecisionsOf(getInvisiblesInventoryValue())["U+200C"]).toBe("accepted");
    first.unmount();

    // Shape change: the author is now known to be RTL — new bidi candidates
    // become relevant. (Spec 089: the signal is the Phase B rtl-confirm
    // answer — markRtl() — not a seeded survey context, which is
    // decision-derived now and cannot carry a synthetic "rtl"
    // script_family. Since spec 090 T063 the answer reaches this step as
    // the recorded `rtl-direction-confirm` decision, not a phase result.)
    markRtl();
    renderStepWithGallery();

    // The earlier decision survives untouched, in the step's accepted list.
    expect(invisibleDecisionsOf(getInvisiblesInventoryValue())["U+200C"]).toBe("accepted");
    expect(screen.getByTestId("invisible-accepted-200c")).toBeTruthy();
    // The bidi group is now expanded in the GALLERY with its candidates
    // newly offered, defaulting to unchecked (proposed, not "reproposed" —
    // nothing was ever decided about them before).
    expect(screen.queryByTestId("invisible-gallery-bidi-expand")).toBeNull();
    expect(screen.getByTestId("invisible-gallery-cell-200e").getAttribute("aria-checked")).toBe("false");
  });

  it("never shows a flagged-answers list or reason cue — there is no `reproposed` state for this step's per-answer design", () => {
    const first = renderStepWithGallery();
    fireEvent.click(screen.getByTestId("invisible-gallery-cell-200c"));
    first.unmount();

    markRtl();
    renderStepWithGallery();

    expect(screen.queryByTestId("flagged-answers-list")).toBeNull();
  });
});

describe("InvisiblesStep — the bidi group lives in the gallery, not the step", () => {
  it("the step renders no direction-controls section of its own; the gallery keeps the collapsed-not-hidden rule for non-RTL authors", () => {
    renderStepWithGallery();
    expect(screen.queryByTestId("invisibles-bidi-group")).toBeNull();
    expect(screen.queryByTestId("invisibles-bidi-expand")).toBeNull();
    // The gallery still offers the direction controls collapsed-but-findable.
    expect(screen.getByTestId("invisible-gallery-bidi-expand")).toBeTruthy();
    expect(screen.queryByTestId("invisible-gallery-cell-200e")).toBeNull();
  });

  it("writingDirectionFrom reads the Phase A answer first, then the RTL branch, then the script family, else unknown", () => {
    const ctx = {};
    expect(writingDirectionFrom([], ctx)).toBe("unknown");
    expect(
      writingDirectionFrom(
        [{ questionId: "writing_direction", answerType: "select", value: "ltr" }],
        ctx,
      ),
    ).toBe("ltr");
    expect(
      writingDirectionFrom(
        [{ questionId: "pb_rtl_direction_confirm", answerType: "select", value: "false" }],
        ctx,
      ),
    ).toBe("rtl");
    expect(
      writingDirectionFrom(
        [{ questionId: "pb_non_roman_branch", answerType: "select", value: "rtl" }],
        ctx,
      ),
    ).toBe("rtl");
    expect(writingDirectionFrom([], { script_family: "rtl" })).toBe("rtl");
    expect(writingDirectionFrom([], { script_family: "indic" })).toBe("ltr");
  });

  it("directionAnswersFromDecisions reads the three direction answers from their decision records, Phase A first", () => {
    expect(directionAnswersFromDecisions({})).toEqual([]);
    expect(
      directionAnswersFromDecisions({
        "rtl-direction-confirm": { id: "rtl-direction-confirm", value: "true", provenance: "asked" },
        "reserve-writing-direction": { id: "reserve-writing-direction", value: "ltr", provenance: "asked" },
        "non-roman-branch": { id: "non-roman-branch", value: "rtl", provenance: "asked" },
      }),
    ).toEqual([
      { questionId: "writing_direction", answerType: "select", value: "ltr" },
      { questionId: "pb_non_roman_branch", answerType: "select", value: "rtl" },
      { questionId: "pb_rtl_direction_confirm", answerType: "select", value: "true" },
    ]);
    // A record carrying no value (a seed that never became an answer)
    // is not an answer and must not signal a direction.
    expect(
      directionAnswersFromDecisions({
        "rtl-direction-confirm": { id: "rtl-direction-confirm", value: undefined, provenance: "default" },
      }),
    ).toEqual([]);
  });
});
