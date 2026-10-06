// JourneyContents — the narrow-viewport table of contents sheet, and its store.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import {
  screen,
  cleanup,
  fireEvent,
  within,
  act,
  waitFor,
} from "@testing-library/react";
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
const MARKS = dot("marks", {
  kind: "upcoming",
  fill: "none",
  label: "Marks Section",
});

const DOTS = [IDENTITY, CHAR_Q1, CHAR_Q2, MARKS];

beforeEach(() => {
  useJourneyContentsStore.setState({
    available: false,
    open: false,
    origin: null,
  });
});
afterEach(cleanup);

function renderSheet(
  onActivate = vi.fn(() => true),
  statusMessage: string | null = null,
) {
  render(
    <JourneyContents
      dots={DOTS}
      onActivate={onActivate}
      statusMessage={statusMessage}
    />,
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

  it("setOpen records the trigger origin", () => {
    useJourneyContentsStore.getState().setOpen(true, { x: 10, y: 20 });
    expect(useJourneyContentsStore.getState()).toMatchObject({
      open: true,
      origin: { x: 10, y: 20 },
    });
  });

  it("closing keeps the origin so the exit can retrace the enter path", () => {
    useJourneyContentsStore.setState({ open: true, origin: { x: 10, y: 20 } });
    useJourneyContentsStore.getState().setOpen(false);
    expect(useJourneyContentsStore.getState()).toMatchObject({
      open: false,
      origin: { x: 10, y: 20 },
    });
  });

  it("opening without an origin keeps the previous one", () => {
    useJourneyContentsStore.setState({ origin: { x: 1, y: 2 } });
    useJourneyContentsStore.getState().setOpen(true);
    expect(useJourneyContentsStore.getState().origin).toEqual({ x: 1, y: 2 });
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
    expect(
      screen
        .getByTestId("journey-contents-list")
        .children[1]!.querySelector("button"),
    ).toBeNull();
  });

  it("marks the current row with aria-current=step and does not call onActivate for it", () => {
    useJourneyContentsStore.setState({ open: true });
    const onActivate = renderSheet();
    const current = screen.getByRole("button", {
      name: /First question — you are here/,
    });
    expect(current.getAttribute("aria-current")).toBe("step");
    fireEvent.click(current);
    expect(onActivate).not.toHaveBeenCalled();
    expect(useJourneyContentsStore.getState().open).toBe(true);
  });

  it("activating a non-current row calls onActivate and closes when it returns true", async () => {
    useJourneyContentsStore.setState({ open: true });
    const onActivate = renderSheet(vi.fn(() => true));
    fireEvent.click(
      screen.getByRole("button", { name: /Identity Section — completed/ }),
    );
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledWith(IDENTITY);
    expect(useJourneyContentsStore.getState().open).toBe(false);
    // The close is staged: the sheet stays mounted on the exit path for one
    // motion beat, then unmounts.
    expect(screen.getByTestId("journey-contents-sheet")).not.toBeNull();
    await waitFor(() =>
      expect(screen.queryByTestId("journey-contents-sheet")).toBeNull(),
    );
  });

  it("stays open, showing the status message, when onActivate returns false", () => {
    useJourneyContentsStore.setState({ open: true });
    const onActivate = renderSheet(
      vi.fn(() => false),
      "Not yet reached",
    );
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

  it("anchors the enter animation at the stored trigger point", () => {
    // jsdom measures every element at 0,0, so the sheet-box translation of
    // the stored viewport point is the point itself.
    useJourneyContentsStore.setState({
      open: true,
      origin: { x: 350, y: 700 },
    });
    renderSheet();
    const originWrap = screen.getByTestId("journey-contents-origin");
    expect(originWrap.style.getPropertyValue("--jc-origin-x")).toBe("350px");
    expect(originWrap.style.getPropertyValue("--jc-origin-y")).toBe("700px");
  });

  it("without a stored trigger the sheet falls back to its default origin", () => {
    useJourneyContentsStore.setState({ open: true, origin: null });
    renderSheet();
    const originWrap = screen.getByTestId("journey-contents-origin");
    expect(originWrap.style.getPropertyValue("--jc-origin-x")).toBe("");
    expect(originWrap.style.getPropertyValue("--jc-origin-y")).toBe("");
  });

  it("plays the exit from the same origin before unmounting", async () => {
    useJourneyContentsStore.setState({
      open: true,
      origin: { x: 350, y: 700 },
    });
    renderSheet();
    act(() => useJourneyContentsStore.getState().setOpen(false));
    const originWrap = screen.getByTestId("journey-contents-origin");
    // Still mounted, now on the exit path, anchored where the enter began.
    expect(originWrap.className).toContain("jc-sheet-exit");
    expect(originWrap.style.getPropertyValue("--jc-origin-x")).toBe("350px");
    expect(screen.getByTestId("journey-contents-sheet")).not.toBeNull();
    await waitFor(() =>
      expect(screen.queryByTestId("journey-contents-sheet")).toBeNull(),
    );
  });

  it("reopening during the exit cancels it", async () => {
    useJourneyContentsStore.setState({ open: true });
    renderSheet();
    act(() => useJourneyContentsStore.getState().setOpen(false));
    expect(screen.getByTestId("journey-contents-origin").className).toContain(
      "jc-sheet-exit",
    );
    act(() => useJourneyContentsStore.getState().setOpen(true));
    expect(
      screen.getByTestId("journey-contents-origin").className,
    ).not.toContain("jc-sheet-exit");
    expect(screen.getByTestId("journey-contents-sheet")).not.toBeNull();
  });
});
