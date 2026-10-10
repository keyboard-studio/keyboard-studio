// TesterReports (spec 094 T035, FR-012..FR-014, FR-019).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, cleanup, act } from "@testing-library/react";
import { makeEmptyDecisionRecord, type DecisionEntry } from "@keyboard-studio/contracts";
import { render } from "../test/renderWithI18n.tsx";
import { useTestingStore } from "../stores/testingStore.ts";
import { useDecisionLogStore } from "../decisions/decisionLogStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";

const jumpToLocation = vi.fn();
vi.mock("../lib/jumpToLocation.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/jumpToLocation.ts")>()),
  jumpToLocation: (...args: unknown[]) => jumpToLocation(...args),
}));

import { TesterReports } from "./TesterReports.tsx";

function entry(stepId: string, n: number): DecisionEntry {
  return {
    entryId: `e${n}`,
    stepId,
    payload: { kind: "survey-answer", questionId: `${stepId}_q`, answerType: "text", value: "x" },
    provenance: { agency: "hand-set" },
    recordedAt: 1_700_000_000_000 + n,
    supersedes: null,
  } as DecisionEntry;
}

function build(fingerprint: string) {
  act(() => {
    useTestingStore.getState().recordBuild({ version: "2.3.1", fingerprint, decisionCursor: 0, changedSections: [] });
  });
}

beforeEach(() => {
  useDecisionLogStore.getState().hydrate({ ...makeEmptyDecisionRecord(), entries: [entry("rules", 1)] });
  useSurveySessionStore.setState({ visited: ["rules"] as never });
  build("a".repeat(64));
});

afterEach(() => {
  cleanup();
  jumpToLocation.mockClear();
  useTestingStore.getState().reset();
  useDecisionLogStore.getState().reset();
  useSurveySessionStore.getState().reset();
});

function addReport(text: string, section = "") {
  fireEvent.change(screen.getByLabelText("Problem reported"), { target: { value: text } });
  fireEvent.change(screen.getByLabelText("Section (optional)"), { target: { value: section } });
  fireEvent.click(screen.getByRole("button", { name: "Add report" }));
}

describe("TesterReports", () => {
  it("has labelled, keyboard-operable controls", () => {
    render(<TesterReports />);
    expect(screen.getByLabelText("Problem reported").tagName).toBe("TEXTAREA");
    expect(screen.getByLabelText("Found in").tagName).toBe("SELECT");
    expect(screen.getByLabelText("Section (optional)").tagName).toBe("SELECT");
    expect(screen.getByRole("button", { name: "Add report" }).tagName).toBe("BUTTON");
  });

  it("requires text; the section is optional and the build defaults to the latest", () => {
    render(<TesterReports />);
    addReport("   ");
    expect(screen.getByRole("alert").textContent).toMatch(/Describe the problem/);
    expect(useTestingStore.getState().reports).toHaveLength(0);

    addReport("Wrong vowel on K_E");
    expect(useTestingStore.getState().reports).toMatchObject([{ text: "Wrong vowel on K_E", foundInBuild: 1, status: "open" }]);
    expect(useTestingStore.getState().reports[0]).not.toHaveProperty("sectionId");
  });

  it("a report naming a section opens it with the return to Output (FR-013)", () => {
    render(<TesterReports />);
    addReport("Rule fires twice", "rules");
    const report = useTestingStore.getState().reports[0]!;
    fireEvent.click(screen.getByTestId(`report-open-${report.reportId}`));
    expect(jumpToLocation).toHaveBeenCalledWith({ route: "survey", step: "rules" }, { returnTo: { route: "output" } });
  });

  it("marking fixed then making a build shows 'fixed in build N'; reopening clears it (FR-014)", () => {
    render(<TesterReports />);
    addReport("Missing ɛ");
    const id = useTestingStore.getState().reports[0]!.reportId;

    fireEvent.click(screen.getByTestId(`report-toggle-${id}`));
    expect(screen.getByTestId(`report-${id}`).textContent).toMatch(/fixed, not yet in a build/);

    build("b".repeat(64));
    expect(screen.getByTestId(`report-${id}`).textContent).toMatch(/fixed in build 2/);

    fireEvent.click(screen.getByTestId(`report-toggle-${id}`));
    expect(screen.getByTestId(`report-${id}`).textContent).toMatch(/Open · found in build 1/);
    expect(useTestingStore.getState().reports[0]).not.toHaveProperty("fixedInBuild");
  });

  it("is read-only when the project is submitted", () => {
    act(() => {
      useTestingStore.getState().addReport({ text: "Old report", foundInBuild: 1 });
      useTestingStore.getState().markFrozen();
    });
    render(<TesterReports />);
    expect(screen.queryByRole("button", { name: "Add report" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Mark fixed" })).toBeNull();
    expect(screen.getByTestId("report-list").textContent).toMatch(/Old report/);
  });
});
