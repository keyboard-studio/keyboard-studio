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
import { useSurveyAnswerStore } from "../stores/surveyAnswerStore.ts";
import { useReproposalNoticeStore } from "../stores/reproposalNoticeStore.ts";
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
  // The walk store is now load-bearing for VISIBILITY (FR-040's revised gate),
  // not only for dot granularity — a walk leaked from a previous test would
  // make the "absent before the journey starts" case pass for the wrong
  // reason, or fail depending on file order.
  useStepWalkStore.getState().reset();

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
  // No reset() on this store — global test-setup only clears stores with reset().
  useReproposalNoticeStore.getState().clear();
  window.location.hash = "";
});

// ---------------------------------------------------------------------------
// Visibility gate (FR-040, revised 2026-08-05).
//
// The row must be up from the FIRST question, not from base selection: the
// identity-lite battery runs before a base is chosen and its answers reach the
// emitted `.kps`. These cases pin both directions of the new gate, and the
// separation between "the strip is up" and "the project has a name" — the
// second is what the OLD gate conflated with the first.
// ---------------------------------------------------------------------------

/** No project, no walks, no answers — the state a first-time author boots into. */
function seedNothing(): void {
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
  useDecisionLogStore.getState().reset();
  useStepWalkStore.getState().reset();
}

describe("StudioFooter — visibility gate (FR-040)", () => {
  it("is absent before the journey starts — no project, no walk", () => {
    seedNothing();
    const { container } = render(<StudioFooter />);
    expect(container.querySelector("footer")).toBeNull();
  });

  it("is present at the FIRST question, with no base keyboard chosen yet", () => {
    seedNothing();
    // Exactly the pre-base state: the author is on `identity`, the identity
    // flow's runner has published its walk, and nothing has been instantiated.
    useSurveySessionStore.setState({ activeStepId: "identity", history: [] });
    useStepWalkStore
      .getState()
      .publishStepWalk("identity", [{ id: "il_language_english", done: false }]);

    const { container } = render(<StudioFooter />);

    expect(useWorkingCopyStore.getState().baseKeyboard).toBeNull();
    expect(container.querySelector("footer")).not.toBeNull();
    expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
  });

  it("omits the project label — rather than inventing one — while the project has no name", () => {
    seedNothing();
    useSurveySessionStore.setState({ activeStepId: "identity", history: [] });
    useStepWalkStore
      .getState()
      .publishStepWalk("identity", [{ id: "il_language_english", done: false }]);

    render(<StudioFooter />);

    expect(screen.queryByText(/^Project:/)).toBeNull();
    expect(screen.queryByText(/untitled/i)).toBeNull();
  });

  it("still shows for a project whose step published no walk (pre-change behaviour)", () => {
    seedProject();
    useStepWalkStore.getState().reset();

    const { container } = render(<StudioFooter />);

    expect(container.querySelector("footer")).not.toBeNull();
    expect(screen.getByText(/^Project: French$/)).toBeTruthy();
  });
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
  it("collapses a gallery's character walk to a single stage dot", () => {
    useSurveySessionStore.setState({
      activeStepId: "mechanisms",
      history: ["identity", "choose_base", "track", "characters", "marks", "convenience", "carve"],
      visited: ["identity", "choose_base", "track", "characters", "marks", "convenience", "carve", "mechanisms"],
      selectedTrack: "adapt",
    });
    useStepWalkStore.getState().publishStepWalk("mechanisms", [
      { id: charToPositionToken("á"), label: "á (U+00E1)", done: true },
      { id: charToPositionToken("é"), label: "é (U+00E9)", done: false },
      { id: charToPositionToken("í"), label: "í (U+00ED)", done: false },
    ]);
    useSurveyAnswerStore.getState().setPosition("mechanisms", charToPositionToken("é"));

    render(<StudioFooter />);
    const names = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? "");
    // One dot for the gallery, none per letter — the author navigates to the
    // character they want inside the gallery itself.
    expect(names.some((n) => n.startsWith("á (U+00E1)"))).toBe(false);
    expect(names.some((n) => n.startsWith("é (U+00E9)"))).toBe(false);
    expect(names.some((n) => n.startsWith("í (U+00ED)"))).toBe(false);
    expect(names.filter((n) => n.startsWith("Mechanisms"))).toHaveLength(1);
  });

  it("keeps ONE dot per question for a flow's walk — the marks battery is not a gallery", () => {
    useSurveySessionStore.setState({
      activeStepId: "marks",
      history: ["identity", "choose_base", "track", "characters"],
      visited: ["identity", "choose_base", "track", "characters", "marks"],
      selectedTrack: "adapt",
    });
    useStepWalkStore.getState().publishStepWalk("marks", [
      { id: "ms_series_s1", done: true },
      { id: "ms_series_s2", done: false },
    ]);

    render(<StudioFooter />);
    // spec 079 journey-strip-contract.md §4: a label is NEVER a raw answer/
    // stop id — these two stops have no catalog entry, so both fall through
    // to the STAGE label ("Accents & marks"), not to the raw id (the exact
    // gap §4 closes). Two stops still yield two QUESTION-tier marks — that is
    // what this case is actually pinning, via the structural
    // `data-progress-dot-tier` hook rather than the (now-collapsed) label text.
    const marksDots = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("data-progress-dot-tier") === "question");
    expect(marksDots).toHaveLength(2);
    for (const dot of marksDots) {
      expect(dot.getAttribute("aria-label") ?? "").not.toMatch(/ms_series_/);
    }
  });
});

// ---------------------------------------------------------------------------
// Jump round trip (defect, 2026-08-05: "I jumped back and can't jump forward
// again").
//
// `jumpToStep` truncates `history`, so reachability keyed on `history` alone
// told the author their own finished stages were ahead of them and refused
// every one. These cases pin the round trip end to end through the mounted
// footer: back, then forward again, with nothing lost on either leg.
// ---------------------------------------------------------------------------

describe("StudioFooter — jumping back and forward again (FR-045/FR-063)", () => {
  /** Mid-journey: the author has walked as far as the touch gallery. */
  function seedDeepWalk(): void {
    useSurveySessionStore.setState({
      activeStepId: "touch",
      history: ["identity", "choose_base", "track", "characters", "marks", "convenience", "carve", "mechanisms"],
      visited: ["identity", "choose_base", "track", "characters", "marks", "convenience", "carve", "mechanisms", "touch"],
      selectedTrack: "adapt",
    });
  }

  it("a stage ahead of the landing point stays in the row AND stays jumpable", async () => {
    const user = userEvent.setup();
    seedDeepWalk();
    useSurveySessionStore.getState().jumpToStep("carve");
    expect(useSurveySessionStore.getState().activeStepId).toBe("carve");

    render(<StudioFooter />);

    // FR-063: jumping back truncates history, not progress — mechanisms is
    // still in the row even though it is now ahead of where the author stands.
    const mechanisms = screen
      .getAllByRole("button")
      .find((b) => (b.getAttribute("aria-label") ?? "").startsWith("Mechanisms"));
    expect(mechanisms).toBeDefined();
    // ...and it is reported as finished work, not as an unvisited stage.
    expect(mechanisms!.getAttribute("data-progress-dot-kind")).toBe("completed");

    mechanisms!.focus();
    await user.keyboard("{Enter}");

    // The jump ARRIVED — no refusal message, and the author actually moved.
    expect(screen.getByRole("status").textContent ?? "").toBe("");
    expect(useSurveySessionStore.getState().activeStepId).toBe("mechanisms");
  });

  it("back, forward, and back again — the walked path is never lost", () => {
    seedDeepWalk();
    const session = useSurveySessionStore.getState();

    session.jumpToStep("characters");
    expect(useSurveySessionStore.getState().activeStepId).toBe("characters");

    // Forward again to a stage the truncated back-stack no longer mentions.
    session.jumpToStep("touch");
    expect(useSurveySessionStore.getState().activeStepId).toBe("touch");

    // Nothing was dropped from the high-water mark on either leg.
    expect(useSurveySessionStore.getState().visited).toEqual([
      "identity", "choose_base", "track", "characters",
      "marks", "convenience", "carve", "mechanisms", "touch",
    ]);

    // Back still works after a forward jump — the stack was rebuilt from the
    // walked route, not left empty.
    session.popHistory();
    expect(useSurveySessionStore.getState().activeStepId).toBe("mechanisms");
  });

  it("loses no in-progress work on the round trip — walk, cursor and answer draft all survive", () => {
    seedDeepWalk();
    const walkStore = useStepWalkStore.getState();
    // A half-answered flow left behind on an earlier step, plus a gallery walk
    // parked mid-inventory. Both are the state a jump must not disturb.
    walkStore.publishStepWalk("identity", [
      { id: "il_language_english", done: true },
      { id: "il_language_autonym", done: false },
    ]);
    const answerStore = useSurveyAnswerStore.getState();
    answerStore.setPosition("identity", "il_language_autonym");
    answerStore.setStepAnswers("identity", {
      il_language_english: {
        value: "Bambara",
        answerType: "text",
        origin: "confirmed",
        stage: "draft",
        evidenceKey: null,
        screenId: "il_language_english",
      },
    });
    walkStore.publishStepWalk("mechanisms", [
      { id: charToPositionToken("á"), done: true },
      { id: charToPositionToken("é"), done: false },
    ]);
    useSurveyAnswerStore.getState().setPosition("mechanisms", charToPositionToken("é"));

    const session = useSurveySessionStore.getState();
    session.jumpToStep("identity");
    session.jumpToStep("mechanisms");
    session.jumpToStep("identity");

    const after = useStepWalkStore.getState();
    const afterAnswers = useSurveyAnswerStore.getState();
    expect(afterAnswers.steps["identity"]?.answers["il_language_english"]?.value).toBe("Bambara");
    expect(afterAnswers.steps["identity"]?.position).toBe("il_language_autonym");
    expect(after.walks["identity"]).toHaveLength(2);
    // The gallery it passed through twice is exactly as it was left.
    expect(afterAnswers.steps["mechanisms"]?.position).toBe(charToPositionToken("é"));
    expect(after.walks["mechanisms"]?.[0]?.done).toBe(true);
  });

  it("still refuses a stage the author has genuinely never reached", async () => {
    const user = userEvent.setup();
    // Only as far as `track`; the galleries are ahead and unvisited.
    useSurveySessionStore.setState({
      activeStepId: "track",
      history: ["identity", "choose_base"],
      visited: ["identity", "choose_base", "track"],
      selectedTrack: "adapt",
    });

    render(<StudioFooter />);
    const mechanisms = screen
      .getAllByRole("button")
      .find((b) => (b.getAttribute("aria-label") ?? "").startsWith("Mechanisms"));
    expect(mechanisms).toBeDefined();
    expect(mechanisms!.getAttribute("data-progress-dot-kind")).toBe("upcoming");

    mechanisms!.focus();
    await user.keyboard("{Enter}");

    // The gate held, with a stated reason, and the author did not move.
    expect(screen.getByRole("status").textContent ?? "").not.toBe("");
    expect(useSurveySessionStore.getState().activeStepId).toBe("track");
  });
});

// ---------------------------------------------------------------------------
// Two-tier strip additions (spec 079 T054, journey-strip-contract.md
// §3a-§3c, §9).
// ---------------------------------------------------------------------------

describe("StudioFooter — two-tier strip (spec 079)", () => {
  it("a section with some but not all screens done reads as 'partly answered'", () => {
    // "identity" is behind the current position ("characters") and has a
    // published walk (not a character walk) with one done stop and one not —
    // its section mark must aggregate to `partial`, not `full` or `none`.
    useStepWalkStore
      .getState()
      .publishStepWalk("identity", [
        { id: "il_language_english", done: true },
        { id: "il_language_autonym", done: false },
      ]);

    render(<StudioFooter />);
    const partial = screen
      .getAllByRole("button")
      .find((b) => (b.getAttribute("aria-label") ?? "").match(/partly answered/i));
    expect(partial).toBeDefined();
    expect(partial!.getAttribute("data-progress-dot-fill")).toBe("partial");
    expect(partial!.getAttribute("data-progress-dot-tier")).toBe("section");
  });

  it("the FR-016 notice rides the SAME role=status span — no second aria-live region", () => {
    useReproposalNoticeStore.getState().setMessage("2 questions in Accents & marks will need reconfirming.", "characters");

    render(<StudioFooter />);

    const liveRegions = screen.getAllByRole("status");
    expect(liveRegions).toHaveLength(1);
    expect(liveRegions[0]?.textContent).toMatch(/need reconfirming/i);
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(1);
  });

  it("the notice clears on the NEXT navigation away from the step it was raised for", () => {
    useReproposalNoticeStore.getState().setMessage("2 questions will need reconfirming.", "characters");
    const { rerender } = render(<StudioFooter />);
    expect(screen.getByRole("status").textContent).toMatch(/need reconfirming/i);

    // Navigate away from "characters" — the notice was raised FOR that step.
    useSurveySessionStore.setState({ activeStepId: "marks" });
    rerender(<StudioFooter />);

    expect(screen.getByRole("status").textContent ?? "").not.toMatch(/need reconfirming/i);
    expect(useReproposalNoticeStore.getState().message).toBeNull();
  });

  it("a not-asked step's section mark reads as 'passed — {reason}', never as an answer", () => {
    useSurveyAnswerStore.getState().setStatus("convenience", {
      kind: "not-asked",
      reason: { code: "convenience-no-surplus" },
      evidenceKey: "k1",
    });

    render(<StudioFooter />);
    const passed = screen
      .getAllByRole("button")
      .find((b) => (b.getAttribute("aria-label") ?? "").match(/passed —/i));
    expect(passed).toBeDefined();
    expect(passed!.getAttribute("aria-label") ?? "").not.toMatch(/completed/i);
  });
});

// ---------------------------------------------------------------------------
// §5 jump rules, end to end through the mounted footer and the REAL
// `useWorkToDo()` wiring (not a fixture — journey-strip-contract.md §5's
// exception only matters if the live badge computation actually produces a
// badge for the same mark the click resolves against).
//
// The badge is produced the same way MarksSeriesStep's own reproposal cue is
// (spec 079 US3 item 4): a saved `marks_attachment` answer whose
// `evidenceKey` no longer matches the current proposal's key
// (`survey/marks/marksViews.ts`'s `classify()`). Mirrors the fixture
// `hooks/useWorkToDo.marksParity.test.tsx` already established for the same
// purpose.
// ---------------------------------------------------------------------------

describe("StudioFooter — §5 jump target (badged vs. unbadged collapsed section)", () => {
  const ACUTE = "́";
  const ALPHABET = {
    bases: ["e", "a"],
    marks: [ACUTE],
    attestedStacks: [{ base: "e", marks: [ACUTE] }],
    declaredRoles: {},
  };
  const SAVED_POSITION = "some-other-saved-marker";

  function seedMarksAheadOfCarve(): void {
    useWorkingCopyStore.getState().recordPhase({ phase: "B", answers: [], alphabet: ALPHABET });
    useSurveySessionStore.setState({
      activeStepId: "carve",
      history: [
        "identity", "choose_base", "track", "characters",
        "marks", "punctuation", "invisibles", "convenience",
      ],
      selectedTrack: "adapt",
    });
    // The author already walked through "marks" earlier — MarksSeriesStep.tsx
    // publishes its `visibleStations` as this exact walk (:647-653), and the
    // store keeps a step's last-published walk until overwritten (it is not
    // cleared on leaving the step). Without this, "marks_attachment" is not
    // an addressable question in this build (no registry entry, no published
    // stop), and the badged jump target degrades to the bare step — a real
    // finding this test exists to pin, not an artefact of the fixture.
    useStepWalkStore.getState().publishStepWalk("marks", [
      { id: "marks_attachment", done: true },
      { id: "marks_treatment", done: true },
      { id: "marks_output_form", done: true },
      { id: "marks_stacking", done: true },
    ]);
    // The author's own last position inside "marks" — read by the UNBADGED
    // jump case; the badged case must ignore it (§5's deliberate exception).
    useSurveyAnswerStore.getState().setPosition("marks", SAVED_POSITION);
  }

  function findMarksButton(): HTMLElement {
    const button = screen
      .getAllByRole("button")
      .find((b) => (b.getAttribute("aria-label") ?? "").startsWith("Accents & marks"));
    expect(button).toBeDefined();
    return button!;
  }

  it("a BADGED collapsed section jumps to the earliest work item, not the saved position", async () => {
    const user = userEvent.setup();
    seedMarksAheadOfCarve();
    // A stale evidenceKey makes `classify()` read this attachment as
    // "reproposed" — a real badge from the real hook, not an injected fixture.
    useSurveyAnswerStore.getState().saveAnswer("marks", `marks_attachment.${ACUTE}|e`, {
      value: true,
      answerType: "boolean",
      origin: "confirmed",
      stage: "confirmed",
      evidenceKey: "stale-key-that-no-longer-matches",
      screenId: "marks_attachment",
    });

    render(<StudioFooter />);
    const marksButton = findMarksButton();
    expect(marksButton.getAttribute("aria-label") ?? "").toMatch(/work waiting/i);

    marksButton.focus();
    await user.keyboard("{Enter}");

    expect(useSurveyAnswerStore.getState().steps["marks"]?.position).toBe("marks_attachment");
    expect(useSurveyAnswerStore.getState().steps["marks"]?.position).not.toBe(SAVED_POSITION);
  });

  it("an UNBADGED collapsed section jumps to the author's saved position", async () => {
    const user = userEvent.setup();
    seedMarksAheadOfCarve();
    // No stale answer this time — nothing for the real hook to flag.

    render(<StudioFooter />);
    const marksButton = findMarksButton();
    expect(marksButton.getAttribute("aria-label") ?? "").not.toMatch(/work waiting/i);

    marksButton.focus();
    await user.keyboard(" ");

    expect(useSurveyAnswerStore.getState().steps["marks"]?.position).toBe(SAVED_POSITION);
  });
});
