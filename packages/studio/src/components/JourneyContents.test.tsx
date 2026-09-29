// JourneyContents — the narrow-viewport table of contents sheet, and its store.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, fireEvent, within, act } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { JourneyContents } from "./JourneyContents.tsx";
import { useJourneyContentsStore } from "../stores/journeyContentsStore.ts";
import type { ProgressDot as ProgressDotData } from "../decisions/progressDots.ts";

function dot(
  step: "identity" | "characters" | "marks",
  over: Partial<ProgressDotData> = {},
): ProgressDotData {
  const location = { route: "survey" as const, step };
  return {
    kind: "completed",
    tier: "section",
    fill: "full",
    id: step,
    location,
    label: step,
    resolution: { kind: "reachable", location },
    ...over,
  };
}

const IDENTITY = dot("identity", { label: "Identity Section" });
const CHAR_Q1 = dot("characters", {
  kind: "current",
  tier: "question",
  fill: "none",
  id: "q_one",
  label: "First question",
  location: { route: "survey", step: "characters", question: "q_one" },
});
const CHAR_Q2 = dot("characters", {
  kind: "upcoming",
  tier: "question",
  fill: "none",
  id: "q_two",
  label: "Second question",
  location: { route: "survey", step: "characters", question: "q_two" },
});
const MARKS = dot("marks", { kind: "upcoming", fill: "none", label: "Marks Section" });

const DOTS = [IDENTITY, CHAR_Q1, CHAR_Q2, MARKS];

beforeEach(() => {
  useJourneyContentsStore.setState({ available: false, open: false });
});
afterEach(cleanup);

function renderSheet(onActivate = vi.fn(() => true), statusMessage: string | null = null) {
  render(
    <JourneyContents dots={DOTS} onActivate={onActivate} statusMessage={statusMessage} />,
  );
  return onActivate;
}

describe("journeyContentsStore", () => {
  it("setAvailable(false) also closes the sheet", () => {
    useJourneyContentsStore.setState({ available: true, open: true });
    useJourneyContentsStore.getState().setAvailable(false);
    expect(useJourneyContentsStore.getState()).toMatchObject({
      available: false,
      open: false,
    });
  });

  it("setAvailable(true) leaves open untouched", () => {
    useJourneyContentsStore.setState({ available: false, open: true });
    useJourneyContentsStore.getState().setAvailable(true);
    expect(useJourneyContentsStore.getState()).toMatchObject({
      available: true,
      open: true,
    });
  });
});

describe("JourneyContents", () => {
  it("renders nothing while the store is closed", () => {
    renderSheet();
    expect(screen.queryByTestId("journey-contents-sheet")).toBeNull();
  });

  it("opens the Contents dialog when store.open becomes true", () => {
    renderSheet();
    act(() => useJourneyContentsStore.getState().setOpen(true));
    expect(screen.getByRole("dialog", { name: "Contents" })).toBeTruthy();
  });

  it("lists each mark as a row with its visible label", () => {
    useJourneyContentsStore.setState({ open: true });
    renderSheet();
    const list = screen.getByTestId("journey-contents-list");
    for (const label of [
      "Identity Section",
      "First question",
      "Second question",
      "Marks Section",
    ]) {
      expect(within(list).getByText(label)).toBeTruthy();
    }
    expect(within(list).getAllByRole("button")).toHaveLength(4);
  });

  it("inserts ONE stage heading before a run of question-tier marks only", () => {
    useJourneyContentsStore.setState({ open: true });
    renderSheet();
    const items = [...screen.getByTestId("journey-contents-list").children].map(
      (li) => li.textContent ?? "",
    );
    // identity row, heading, q1, q2, marks row
    expect(items).toHaveLength(5);
    expect(items[0]).toBe("Identity Section");
    expect(items[1]).toBe("Characters");
    expect(items[2]).toBe("First question");
    expect(items[3]).toBe("Second question");
    expect(items[4]).toBe("Marks Section");
    // Headings are not buttons.
    expect(screen.getByTestId("journey-contents-list").children[1]!.querySelector("button")).toBeNull();
  });

  it("marks the current row with aria-current=step and does not call onActivate for it", () => {
    useJourneyContentsStore.setState({ open: true });
    const onActivate = renderSheet();
    const current = screen.getByRole("button", { name: /First question — you are here/ });
    expect(current.getAttribute("aria-current")).toBe("step");
    fireEvent.click(current);
    expect(onActivate).not.toHaveBeenCalled();
    expect(useJourneyContentsStore.getState().open).toBe(true);
  });

  it("activating a non-current row calls onActivate and closes when it returns true", () => {
    useJourneyContentsStore.setState({ open: true });
    const onActivate = renderSheet(vi.fn(() => true));
    fireEvent.click(screen.getByRole("button", { name: /Identity Section — completed/ }));
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledWith(IDENTITY);
    expect(useJourneyContentsStore.getState().open).toBe(false);
    expect(screen.queryByTestId("journey-contents-sheet")).toBeNull();
  });

  it("stays open, showing the status message, when onActivate returns false", () => {
    useJourneyContentsStore.setState({ open: true });
    const onActivate = renderSheet(vi.fn(() => false), "Not yet reached");
    fireEvent.click(screen.getByRole("button", { name: /Marks Section/ }));
    expect(onActivate).toHaveBeenCalledWith(MARKS);
    expect(useJourneyContentsStore.getState().open).toBe(true);
    expect(screen.getByTestId("journey-contents-sheet")).toBeTruthy();
    expect(screen.getByText("Not yet reached")).toBeTruthy();
  });

  it("the close button closes the sheet", () => {
    useJourneyContentsStore.setState({ open: true });
    renderSheet();
    fireEvent.click(screen.getByTestId("journey-contents-sheet-close"));
    expect(useJourneyContentsStore.getState().open).toBe(false);
  });
});
