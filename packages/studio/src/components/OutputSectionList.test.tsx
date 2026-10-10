// OutputSectionList — Output's "Revise a section" list (spec 094 FR-001, R4).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, cleanup } from "@testing-library/react";
import { makeEmptyDecisionRecord, type DecisionEntry } from "@keyboard-studio/contracts";
import { render } from "../test/renderWithI18n.tsx";
import { useDecisionLogStore } from "../decisions/decisionLogStore.ts";
import { buildStageGroups } from "../decisions/stageGroups.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";

const jumpToLocation = vi.fn((_loc: unknown, _opts?: unknown) => ({ kind: "arrived" as const, at: _loc }));
vi.mock("../lib/jumpToLocation.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/jumpToLocation.ts")>()),
  jumpToLocation: (loc: unknown, opts?: unknown) => jumpToLocation(loc, opts),
}));

import { OutputSectionList, completedSections } from "./OutputSectionList.tsx";

let seq = 0;
function surveyEntry(stepId: string): DecisionEntry {
  seq += 1;
  return {
    entryId: `e${seq}`,
    stepId,
    payload: { kind: "survey-answer", questionId: `${stepId}_q`, answerType: "text", value: "x" },
    provenance: { agency: "hand-set" },
    recordedAt: 1_700_000_000_000 + seq,
    supersedes: null,
  } as DecisionEntry;
}

function editorEntry(stepId: string, summary: Record<string, unknown>): DecisionEntry {
  seq += 1;
  return {
    entryId: `e${seq}`,
    stepId,
    payload: {
      kind: "editor-action",
      actionType: "mechanism_edit",
      summary: { sample: [], sampleTruncated: false, ...summary },
    },
    provenance: { agency: "hand-set" },
    recordedAt: 1_700_000_000_000 + seq,
    supersedes: null,
  } as DecisionEntry;
}

function seed(entries: DecisionEntry[], visited: string[]): void {
  useDecisionLogStore.getState().hydrate({ ...makeEmptyDecisionRecord(), entries });
  useSurveySessionStore.setState({ visited: visited as never });
}

beforeEach(() => {
  seq = 0;
  jumpToLocation.mockClear();
});

afterEach(() => {
  cleanup();
  useDecisionLogStore.getState().reset();
  useSurveySessionStore.getState().reset();
});

describe("completedSections", () => {
  it("keeps walked steps with recorded decisions, in walked order, minus the starting-point steps", () => {
    const entries = [
      surveyEntry("identity"),
      surveyEntry("choose_base"),
      surveyEntry("track"),
      surveyEntry("characters"),
      editorEntry("mechanisms", { mechanismsAssigned: 3 }),
      surveyEntry("rules"),
    ];
    const groups = buildStageGroups({ entries });
    const ids = completedSections(
      ["identity", "layout", "choose_base", "track", "characters", "rules", "mechanisms", "touch"],
      groups,
    ).map((s) => s.stepId);
    // "touch" was visited but nothing was recorded for it; "rules" keeps walked order.
    expect(ids).toEqual(["identity", "characters", "rules", "mechanisms"]);
  });
});

describe("OutputSectionList", () => {
  it("renders nothing when no section is complete", () => {
    seed([], []);
    render(<OutputSectionList />);
    expect(screen.queryByTestId("output-section-list")).toBeNull();
  });

  it("is a disclosure: the toggle controls the list and reports its state", () => {
    seed([surveyEntry("characters")], ["characters"]);
    render(<OutputSectionList />);

    const toggle = screen.getByRole("button", { name: "Revise a section" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    const list = document.getElementById(toggle.getAttribute("aria-controls")!);
    expect(list?.hidden).toBe(true);

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(list?.hidden).toBe(false);
  });

  it("labels each row with its section and a one-line summary", () => {
    seed(
      [surveyEntry("characters"), surveyEntry("characters"), editorEntry("mechanisms", { mechanismsAssigned: 2 }), surveyEntry("rules")],
      ["characters", "mechanisms", "rules"],
    );
    render(<OutputSectionList />);
    fireEvent.click(screen.getByRole("button", { name: "Revise a section" }));

    expect(screen.getByRole("button", { name: "Revise Characters: 2 answers" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Revise Mechanisms: 2 mechanisms assigned" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Revise Rules: 1 answer" })).toBeTruthy();
  });

  it("opens a section with the return-to-Output seam", () => {
    seed([surveyEntry("rules")], ["rules"]);
    render(<OutputSectionList />);
    fireEvent.click(screen.getByRole("button", { name: "Revise a section" }));
    fireEvent.click(screen.getByTestId("output-section-rules"));

    expect(jumpToLocation).toHaveBeenCalledWith({ route: "survey", step: "rules" }, { returnTo: { route: "output" } });
  });

  it("states the reason in the live region when the jump is refused", () => {
    jumpToLocation.mockReturnValueOnce({ kind: "refused", reason: "beyond-gate" } as never);
    seed([surveyEntry("rules")], ["rules"]);
    render(<OutputSectionList />);
    fireEvent.click(screen.getByRole("button", { name: "Revise a section" }));
    fireEvent.click(screen.getByTestId("output-section-rules"));

    expect(screen.getByRole("status").textContent).not.toBe("");
  });
});
