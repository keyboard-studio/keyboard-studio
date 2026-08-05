// StudioFooter.a11y.test — keyboard-only operability of the footer (spec 057
// T055, SC-010).
//
// The axe SCAN half of SC-010 ("expectNoSeriousAxeViolations clean on every
// tab with the footer present") is E2E-only (@axe-core/playwright needs a
// live page; this package's jsdom/vitest lane has no axe integration — grep
// confirms `@axe-core/playwright` is the ONLY axe dependency in
// package.json). That half lives in e2e/footer-progress.spec.ts. This file
// covers the half a component test CAN prove directly: every dot is a real,
// individually focusable `<button>` reached by Tab, named on focus, and
// activated by BOTH Enter and Space — using @testing-library/user-event,
// which drives real keyboard-default button activation rather than
// synthesizing a click.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeBaseKeyboard } from "@keyboard-studio/contracts";
import { render } from "../test/renderWithI18n.tsx";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { useDecisionLogStore } from "../decisions/decisionLogStore.ts";
import { useStepWalkStore } from "../stores/stepWalkStore.ts";
import { charToPositionToken } from "../lib/stepWalk.ts";
import { StudioFooter } from "./StudioFooter.tsx";

const BASE = makeBaseKeyboard({
  id: "basic_kbdfr",
  path: "release/b/basic_kbdfr",
  script: "Latn",
  targets: ["windows"],
  displayName: "French",
  version: "1.0",
});

function seedProject(): void {
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
  useDecisionLogStore.getState().reset();

  useWorkingCopyStore.setState({ baseKeyboard: BASE });
  useSurveySessionStore.setState({
    activeStepId: "characters",
    history: ["identity", "choose_base", "track"],
    selectedTrack: "adapt",
  });
  useDecisionLogStore.setState({
    record: {
      format: "keyboard-studio.decision-record",
      version: 2,
      keyboardId: "test_kbd",
      entries: [
        {
          entryId: "e1",
          stepId: "identity",
          payload: {
            kind: "survey-answer",
            questionId: "il_language_english",
            answerType: "text",
            value: "Test",
          },
          provenance: { agency: "hand-set" },
          recordedAt: 1,
          supersedes: null,
        },
      ],
      truncated: null,
    },
  });
}

beforeEach(() => {
  seedProject();
  window.location.hash = "#survey";
});

afterEach(() => {
  cleanup();
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
  useDecisionLogStore.getState().reset();
  window.location.hash = "";
});

describe("StudioFooter — keyboard operability (SC-010)", () => {
  it("renders one real <button> per dot, each with a non-empty accessible name", () => {
    render(<StudioFooter />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button.tagName).toBe("BUTTON");
      expect(button.getAttribute("type")).toBe("button");
      expect(button.getAttribute("aria-label")).toBeTruthy();
    }
  });

  it("every dot is reachable by Tab, in document order", async () => {
    const user = userEvent.setup();
    render(<StudioFooter />);
    const buttons = screen.getAllByRole("button");
    for (const button of buttons) {
      await user.tab();
      expect(document.activeElement).toBe(button);
    }
  });

  it("the current dot carries aria-current=\"step\" and a distinct accessible name", () => {
    render(<StudioFooter />);
    const current = screen
      .getAllByRole("button")
      .find((b) => b.getAttribute("aria-current") === "step");
    expect(current).toBeDefined();
    expect(current!.getAttribute("aria-label")).toMatch(/you are here/i);
  });

  it("an upcoming dot's accessible name announces it is not yet reached", () => {
    render(<StudioFooter />);
    const upcoming = screen
      .getAllByRole("button")
      .find((b) => b.getAttribute("data-progress-dot-kind") === "upcoming");
    expect(upcoming).toBeDefined();
    expect(upcoming!.getAttribute("aria-label")).toMatch(/not yet reached/i);
  });

  it("activating a completed (reached) dot with Enter navigates the wizard there", async () => {
    const user = userEvent.setup();
    render(<StudioFooter />);
    const completed = screen
      .getAllByRole("button")
      .find((b) => b.getAttribute("data-progress-dot-kind") === "completed");
    expect(completed).toBeDefined();

    completed!.focus();
    await user.keyboard("{Enter}");

    // The completed dot's question lives on "identity", which is in history —
    // a reached step, so jumpToLocation actually moves the traversal target.
    expect(useSurveySessionStore.getState().activeStepId).toBe("identity");
  });

  it("activating a completed (reached) dot with Space also navigates the wizard there", async () => {
    const user = userEvent.setup();
    render(<StudioFooter />);
    const completed = screen
      .getAllByRole("button")
      .find((b) => b.getAttribute("data-progress-dot-kind") === "completed");
    completed!.focus();
    await user.keyboard(" ");
    expect(useSurveySessionStore.getState().activeStepId).toBe("identity");
  });

  it("activating the current dot is a no-op (FR-061 — not a jump target to itself)", async () => {
    const user = userEvent.setup();
    render(<StudioFooter />);
    const current = screen
      .getAllByRole("button")
      .find((b) => b.getAttribute("data-progress-dot-kind") === "current");
    current!.focus();
    await user.keyboard("{Enter}");
    expect(useSurveySessionStore.getState().activeStepId).toBe("characters");
  });

  it("activating an upcoming dot behind a gate is refused and states why, without moving the walk", async () => {
    const user = userEvent.setup();
    render(<StudioFooter />);
    const upcoming = screen
      .getAllByRole("button")
      .find((b) => b.getAttribute("data-progress-dot-kind") === "upcoming");
    expect(upcoming).toBeDefined();

    upcoming!.focus();
    await user.keyboard("{Enter}");

    // The gate holds: the walk did not move forward past where it has reached.
    expect(useSurveySessionStore.getState().activeStepId).toBe("characters");
    // And the reason is stated, not silently swallowed (FR-045, US4 scenario 9).
    expect(screen.getByRole("status").textContent).toMatch(/not yet reached/i);
  });
});

// ---------------------------------------------------------------------------
// Within-step walk dots — the wiring, end to end through the real component
//
// progressDots.test.ts covers the derivation against fixtures; this covers what
// only the mounted footer can: that it reads the live walk store, that a
// character stop's dot resolves (rather than refusing itself as
// "question-not-in-build"), and that activating one moves the within-step cursor
// the gallery reads on arrival.
// ---------------------------------------------------------------------------

describe("StudioFooter — within-step walk dots", () => {
  it("renders a dot per character stop instead of a single stage dot", () => {
    useSurveySessionStore.setState({
      activeStepId: "mechanisms",
      history: ["identity", "choose_base", "track", "characters", "marks", "convenience", "carve"],
      selectedTrack: "adapt",
    });
    useStepWalkStore.getState().publishStepWalk("mechanisms", [
      { id: charToPositionToken("á"), label: "á (U+00E1)", done: true },
      { id: charToPositionToken("é"), label: "é (U+00E9)", done: false },
      { id: charToPositionToken("í"), label: "í (U+00ED)", done: false },
    ]);
    useStepWalkStore.getState().setStepCursor("mechanisms", charToPositionToken("é"));

    render(<StudioFooter />);
    const names = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? "");
    expect(names.some((n) => n.startsWith("á (U+00E1)"))).toBe(true);
    expect(names.some((n) => n.startsWith("é (U+00E9)"))).toBe(true);
    expect(names.some((n) => n.startsWith("í (U+00ED)"))).toBe(true);
    // The stage's own dot is gone — the stops replaced it, they did not join it.
    expect(names.some((n) => n.startsWith("Mechanisms"))).toBe(false);
  });

  it("activating a character stop moves the within-step cursor, not just the step", async () => {
    const user = userEvent.setup();
    useSurveySessionStore.setState({
      activeStepId: "mechanisms",
      history: ["identity", "choose_base", "track", "characters", "marks", "convenience", "carve"],
      selectedTrack: "adapt",
    });
    useStepWalkStore.getState().publishStepWalk("mechanisms", [
      { id: charToPositionToken("á"), label: "á (U+00E1)", done: true },
      { id: charToPositionToken("é"), label: "é (U+00E9)", done: false },
    ]);
    useStepWalkStore.getState().setStepCursor("mechanisms", charToPositionToken("é"));

    render(<StudioFooter />);
    const target = screen
      .getAllByRole("button")
      .find((b) => (b.getAttribute("aria-label") ?? "").startsWith("á (U+00E1)"));
    expect(target).toBeDefined();

    target!.focus();
    await user.keyboard("{Enter}");

    // No refusal: a character has no questionRegistry entry, so this only
    // resolves because the published walk makes it addressable.
    expect(screen.getByRole("status").textContent ?? "").toBe("");
    expect(useStepWalkStore.getState().cursors["mechanisms"]).toBe(charToPositionToken("á"));
    expect(useSurveySessionStore.getState().activeStepId).toBe("mechanisms");
  });
});
