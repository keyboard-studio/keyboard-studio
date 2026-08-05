// SurveyRunner — the within-step walk: committed answers survive Back/Next, and
// survive the unmount a tab switch causes.
//
// The defect these cover, as reported: "when I jump then browse back and forth,
// sometimes the previously filled value of 'confirm language code' and 'Which
// script' is empty." Both of those questions are seeded ONLY from IdentityLite
// refs the langtags name-picker populates, and those refs do not survive a
// remount — so any path that re-seeded instead of restoring produced a blank
// field where the author had already answered. Two independent causes:
//
//   1. Back TRUNCATED the answer stack (`slice(0, -1)`), so walking forward
//      again rebuilt the entry from a seed that was now `undefined`.
//   2. The stack was component state, so a tab switch destroyed the whole
//      in-progress step and the flow remounted on question 1.
//
// Both are asserted here against DOM state (what the author sees in the field),
// not against internals, so the tests keep holding if the mechanism changes.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, fireEvent, cleanup, act } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import React from "react";

import { SurveyRunner } from "./SurveyRunner.tsx";
import type { FlowDef } from "./types.ts";
import { useStepWalkStore } from "../stores/stepWalkStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { charToPositionToken } from "../lib/stepWalk.ts";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  // The runner publishes under `activeStepId`; pin it so these tests name the
  // same key the assertions read.
  useSurveySessionStore.setState({ activeStepId: "identity" });
});

// ---------------------------------------------------------------------------
// Fixture — a three-question linear flow. q2/q3 stand in for the two
// langtags-seeded identity questions: OPTIONAL (so the walk can pass them) and
// with no seed of their own, which is exactly the state a remount leaves the
// real `il_language_code` / `il_target_script` seeds in.
// ---------------------------------------------------------------------------

const FLOW: FlowDef = {
  flow_id: "walk-test",
  phase: "A",
  questions: [
    { id: "q1", type: "short_text", prompt: "First question", required: true, next: "q2" },
    { id: "q2", type: "short_text", prompt: "Second question", required: false, next: "q3" },
    { id: "q3", type: "short_text", prompt: "Third question", required: false, next: null },
  ],
};

/** The single visible text input, whatever question is showing. */
function field(): HTMLInputElement | HTMLTextAreaElement {
  return screen.getByRole("textbox") as HTMLInputElement | HTMLTextAreaElement;
}

function type(value: string): void {
  fireEvent.change(field(), { target: { value } });
}

function next(): void {
  fireEvent.click(screen.getByTestId("survey-advance"));
}

function back(): void {
  fireEvent.click(screen.getByTestId("survey-back"));
}

// ---------------------------------------------------------------------------
// Cause 1 — Back must not discard the answers ahead of it
// ---------------------------------------------------------------------------

describe("SurveyRunner — Back then forward preserves committed answers", () => {
  it("restores the answer to the question walked back behind, with no seed available", () => {
    // No getSeedValue at all — the post-remount state of the real seeds.
    render(<SurveyRunner flow={FLOW} onComplete={vi.fn()} />);

    type("alpha");
    next();
    type("beta");
    next();
    expect(screen.getByText("Third question")).toBeTruthy();

    back();
    expect(screen.getByText("Second question")).toBeTruthy();
    expect(field().value).toBe("beta");

    next();
    // The bug: "" here, because the entry was rebuilt from an absent seed.
    expect(screen.getByText("Third question")).toBeTruthy();
    expect(field().value).toBe("");
  });

  it("restores answers two questions ahead — the whole tail is kept, not just one entry", () => {
    render(<SurveyRunner flow={FLOW} onComplete={vi.fn()} />);

    type("alpha");
    next();
    type("beta");
    next();
    // Never submitted from q3 (that would complete the flow) — Back banks it.
    type("gamma");
    back();
    back();
    expect(screen.getByText("First question")).toBeTruthy();
    expect(field().value).toBe("alpha");

    next();
    expect(field().value).toBe("beta");
    next();
    expect(screen.getByText("Third question")).toBeTruthy();
    expect(field().value).toBe("gamma");
  });

  it("a CHANGED answer still discards the walk ahead, so downstream seeds re-derive", () => {
    // The seed stands in for IdentityLite's region-driven reseed (spec 030 US3):
    // it must fire again when the answer it depends on changes.
    const getSeedValue = vi.fn((questionId: string) =>
      questionId === "q3" ? "seeded-for-q3" : undefined,
    );
    render(<SurveyRunner flow={FLOW} onComplete={vi.fn()} getSeedValue={getSeedValue} />);

    type("alpha");
    next();
    type("beta");
    next();
    expect(field().value).toBe("seeded-for-q3");
    type("author-edited");
    back();

    // Same answer re-confirmed -> the author's q3 edit survives (Back banked it).
    expect(field().value).toBe("beta");
    next();
    expect(field().value).toBe("author-edited");

    back();
    // Changed answer -> q3 is re-seeded, discarding the stale downstream edit.
    type("beta-CHANGED");
    next();
    expect(field().value).toBe("seeded-for-q3");
  });
});

// ---------------------------------------------------------------------------
// Cause 2 — the in-progress step survives the unmount a tab switch causes
// ---------------------------------------------------------------------------

describe("SurveyRunner — an unfinished step survives unmount", () => {
  it("remounts on the question the author was on, with every answer restored", () => {
    render(<SurveyRunner flow={FLOW} onComplete={vi.fn()} />);
    type("alpha");
    next();
    type("beta");
    next();
    expect(screen.getByText("Third question")).toBeTruthy();

    // The tab switch: StudioShell renders one route at a time, so leaving the
    // wizard unmounts the whole step. `resumeAnswers` is NOT supplied — the step
    // never completed, so nothing recorded a phase result for it.
    cleanup();
    render(<SurveyRunner flow={FLOW} onComplete={vi.fn()} />);

    expect(screen.getByText("Third question")).toBeTruthy();
    back();
    expect(field().value).toBe("beta");
    back();
    expect(field().value).toBe("alpha");
  });

  it("still mounts on question 1 when nothing was answered before the unmount", () => {
    render(<SurveyRunner flow={FLOW} onComplete={vi.fn()} />);
    cleanup();
    render(<SurveyRunner flow={FLOW} onComplete={vi.fn()} />);
    expect(screen.getByText("First question")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// The published walk — what the footer renders its dots from
// ---------------------------------------------------------------------------

describe("SurveyRunner — publishes its walk", () => {
  it("publishes one stop per visited question, marking answered ones done", () => {
    render(<SurveyRunner flow={FLOW} onComplete={vi.fn()} />);
    type("alpha");
    next();

    const { walks, cursors } = useStepWalkStore.getState();
    expect(walks["identity"]?.map((p) => p.id)).toEqual(["q1", "q2"]);
    expect(walks["identity"]?.map((p) => p.done)).toEqual([true, false]);
    expect(cursors["identity"]).toBe("q2");
  });

  it("marks the current stop done as soon as it is answered, before Next", () => {
    render(<SurveyRunner flow={FLOW} onComplete={vi.fn()} />);
    expect(useStepWalkStore.getState().walks["identity"]?.[0]?.done).toBe(false);
    type("alpha");
    expect(useStepWalkStore.getState().walks["identity"]?.[0]?.done).toBe(true);
  });

  it("publishes no label — the question-label precedence has exactly one owner", () => {
    render(<SurveyRunner flow={FLOW} onComplete={vi.fn()} />);
    expect(useStepWalkStore.getState().walks["identity"]?.[0]?.label).toBeUndefined();
  });

  it("honours a cursor a jump parked before this runner existed", () => {
    // Seed a walk and its answers the way a previous visit would have, then ask
    // for the FIRST question — what activating its footer dot does.
    render(<SurveyRunner flow={FLOW} onComplete={vi.fn()} />);
    type("alpha");
    next();
    type("beta");
    next();
    cleanup();

    useStepWalkStore.getState().setStepCursor("identity", "q1");
    render(<SurveyRunner flow={FLOW} onComplete={vi.fn()} />);
    expect(screen.getByText("First question")).toBeTruthy();
    expect(field().value).toBe("alpha");
  });

  it("honours a cursor written while already mounted — the same-step jump", () => {
    render(<SurveyRunner flow={FLOW} onComplete={vi.fn()} />);
    type("alpha");
    next();
    type("beta");
    next();
    expect(screen.getByText("Third question")).toBeTruthy();

    // A footer dot for another question in the step the author is already on:
    // no route change, no step change, nothing remounts.
    // `act` because this is a store write from outside React — the same thing
    // `jumpToLocation` does, but there the ensuing hash change re-renders the
    // tree for us.
    act(() => {
      useStepWalkStore.getState().setStepCursor("identity", "q1");
    });
    expect(screen.getByText("First question")).toBeTruthy();
    expect(field().value).toBe("alpha");
  });

  it("ignores a cursor naming a stop this walk does not have", () => {
    render(<SurveyRunner flow={FLOW} onComplete={vi.fn()} />);
    useStepWalkStore.getState().setStepCursor("identity", charToPositionToken("á"));
    expect(screen.getByText("First question")).toBeTruthy();
  });
});
