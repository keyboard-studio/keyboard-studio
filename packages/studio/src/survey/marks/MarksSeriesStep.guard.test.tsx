// MarksSeriesStep × guard station (spec 104 FR-013 / T013): the question
// is asked once per keyboard and recorded as a GuardSpecification
// decision; on Track 2 the imported keyboard's guarded marks seed it for
// confirmation; marks minted before the answer are reported for
// re-evaluation in the completion channel (US1 scenario 6), never
// silently re-minted.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import type { IRRule, KeyboardIR, SurveyPhaseResult, TouchKeyIR } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";

import { render } from "../../test/renderWithI18n.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { MarksStepHost } from "./MarksStepHost.tsx";
import { getGuardSpecification } from "./guardSpecification.ts";

const ACUTE = "́";
const GRAVE = "̀";

/**
 * The acute on three letters: productive enough (PRODUCTIVITY_SPREAD_THRESHOLD)
 * that its proposed treatment is a key of its own, so the guard question applies.
 */
function seedAlphabet(): void {
  useWorkingCopyStore.getState().recordPhase({
    phase: "B",
    answers: [],
    alphabet: {
      bases: ["a", "e", "o"],
      marks: [ACUTE],
      attestedStacks: [
        { base: "a", marks: [ACUTE] },
        { base: "e", marks: [ACUTE] },
        { base: "o", marks: [ACUTE] },
      ],
      declaredRoles: {},
    },
  });
}

function key(id: string, text: string): TouchKeyIR {
  return { nodeId: `touchKey#${id}`, id, text };
}

function layoutIR(keys: TouchKeyIR[], rules: IRRule[]): KeyboardIR {
  return makeTestIR({
    stores: [
      { nodeId: "store#diablock", name: "diablock", items: [{ kind: "char", value: " " }], isSystem: false },
    ],
    groups: [{ nodeId: "group#main", name: "main", usingKeys: true, rules, readonly: false }],
    touchLayout: {
      platforms: [{ id: "phone", layers: [{ id: "default", rows: [{ keys }] }] }],
      nodeIds: [],
    },
  });
}

/** An imported keyboard whose one mark key is guarded (the Cameroon shape). */
function guardedImportIR(): KeyboardIR {
  return layoutIR(
    [key("T_0300", "◌̀")],
    [
      {
        nodeId: "rule#g",
        context: [
          { kind: "any", storeRef: "diablock" },
          { kind: "raw", text: "+" },
          { kind: "vkey", name: "T_0300", modifiers: [] },
        ],
        output: [{ kind: "raw", text: "context" }],
      },
      {
        nodeId: "rule#p",
        context: [{ kind: "vkey", name: "T_0300", modifiers: [] }],
        output: [{ kind: "char", value: GRAVE }],
      },
    ],
  );
}

/** Walk forward until the guard station shows (bounded). */
function walkToGuard(): void {
  for (let i = 0; i < 6 && screen.queryByTestId("guard-station") === null; i++) {
    fireEvent.click(screen.getByTestId("marks-continue"));
  }
  expect(screen.getByTestId("guard-station")).toBeTruthy();
}

function renderSeries() {
  const onComplete = vi.fn();
  act(() => {
    render(<MarksStepHost onComplete={onComplete} />, { withStepNav: true });
  });
  return onComplete;
}

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
  useDecisionStore.getState().reset();
  seedAlphabet();
});

afterEach(() => {
  cleanup();
});

/** An imported keyboard whose one mark key is unguarded — it types the mark anywhere. */
function unguardedImportIR(): KeyboardIR {
  return layoutIR(
    [key("T_0300", "◌̀")],
    [
      {
        nodeId: "rule#p",
        context: [{ kind: "vkey", name: "T_0300", modifiers: [] }],
        output: [{ kind: "char", value: GRAVE }],
      },
    ],
  );
}

describe("MarksSeriesStep — guard station (spec 104 FR-013)", () => {
  it("defaults to swallow with no prior answer or seed; passing the station confirms it as the author's answer", () => {
    const onComplete = renderSeries();
    walkToGuard();
    expect((screen.getByTestId("guard-option-swallow") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId("guard-option-emit") as HTMLInputElement).checked).toBe(false);

    fireEvent.click(screen.getByTestId("marks-continue"));
    expect(onComplete).toHaveBeenCalledTimes(1);

    expect(getGuardSpecification()).toMatchObject({
      behaviour: "swallow",
      origin: "asked",
      confirmed: true,
    });
    const result = onComplete.mock.calls[0]![0] as SurveyPhaseResult;
    expect(result.answers).toContainEqual({
      questionId: "marks.marks_guard.behaviour",
      answerType: "select",
      value: "swallow",
    });
  });

  it("the author can still choose emit over the default", () => {
    const onComplete = renderSeries();
    walkToGuard();
    fireEvent.click(screen.getByTestId("guard-option-emit"));
    fireEvent.click(screen.getByTestId("marks-continue"));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(getGuardSpecification()).toMatchObject({ behaviour: "emit", origin: "asked", confirmed: true });
  });

  it("skips the station when no mark has a key of its own (every class composed)", () => {
    const onComplete = renderSeries();
    let composedChosen = 0;
    for (let i = 0; i < 6 && onComplete.mock.calls.length === 0; i++) {
      expect(screen.queryByTestId("guard-station")).toBeNull();
      for (const option of screen.queryAllByTestId(/^treatment-option-.*-composed$/)) {
        fireEvent.click(option.querySelector("input")!);
        composedChosen += 1;
      }
      fireEvent.click(screen.getByTestId("marks-continue"));
    }
    // The skip is driven by the author's composed answer, not a fixture
    // that never offered a mark key.
    expect(composedChosen).toBeGreaterThan(0);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(getGuardSpecification()).toBeUndefined();
    const result = onComplete.mock.calls[0]![0] as SurveyPhaseResult;
    expect(result.answers.some((a) => a.questionId === "marks.marks_guard.behaviour")).toBe(false);
  });

  it("reports pre-answer U_ minting for re-evaluation when the defaulted answer is swallow (US1 scenario 6)", () => {
    // The working keyboard already carries a U_ mark key (minted before
    // any specification existed). `complete()` scans the working copy's
    // current IR — the same IR the editor mints into.
    useWorkingCopyStore.setState({
      ir: layoutIR([key("U_0300", "◌̀")], []),
    });
    const onComplete = renderSeries();
    walkToGuard();
    fireEvent.click(screen.getByTestId("marks-continue"));
    expect(onComplete).toHaveBeenCalledTimes(1);

    expect(useSurveySessionStore.getState().marksGuardReevaluation).toEqual([
      {
        mark: GRAVE,
        keyId: "U_0300",
        platformId: "phone",
        layerId: "default",
        currentForm: "unicode",
        specBehaviour: "swallow",
      },
    ]);
  });

  it("Track 2: seeds the specification from the imported keyboard's guarded marks, confirmed by passing the station", () => {
    useDecisionStore.getState().record({ id: "authoring-track", value: "adapt", provenance: "asked" });
    useWorkingCopyStore.setState({ startIr: guardedImportIR() });
    const onComplete = renderSeries();
    walkToGuard();

    expect(screen.getByTestId("guard-seeded-note")).toBeTruthy();
    expect((screen.getByTestId("guard-option-swallow") as HTMLInputElement).checked).toBe(true);

    fireEvent.click(screen.getByTestId("marks-continue"));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(getGuardSpecification()).toMatchObject({
      behaviour: "swallow",
      origin: "seeded-from-import",
      confirmed: true,
    });
  });

  it("Track 2: an emit seed overrides the swallow default", () => {
    useDecisionStore.getState().record({ id: "authoring-track", value: "adapt", provenance: "asked" });
    useWorkingCopyStore.setState({ startIr: unguardedImportIR() });
    const onComplete = renderSeries();
    walkToGuard();

    expect(screen.getByTestId("guard-seeded-note")).toBeTruthy();
    expect((screen.getByTestId("guard-option-emit") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId("guard-option-swallow") as HTMLInputElement).checked).toBe(false);

    fireEvent.click(screen.getByTestId("marks-continue"));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(getGuardSpecification()).toMatchObject({
      behaviour: "emit",
      origin: "seeded-from-import",
      confirmed: true,
    });
  });

  it("Track 2: choosing the other behaviour at the station records an asked specification", () => {
    useDecisionStore.getState().record({ id: "authoring-track", value: "adapt", provenance: "asked" });
    useWorkingCopyStore.setState({ startIr: guardedImportIR() });
    const onComplete = renderSeries();
    walkToGuard();

    fireEvent.click(screen.getByTestId("guard-option-emit"));
    fireEvent.click(screen.getByTestId("marks-continue"));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(getGuardSpecification()).toMatchObject({
      behaviour: "emit",
      origin: "asked",
      confirmed: true,
    });
  });
});
