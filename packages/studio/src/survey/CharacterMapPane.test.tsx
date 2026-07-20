// Tests for CharacterMapPane — the Phase B build-list right-pane interactive
// character map (spec character-map pane work).
//
// Strategy (mirrors BuildListView.test.tsx, the sibling component that
// mutates the same shared phaseBDraftStore):
//   - characterMapGroups is mocked via vi.mock("../lib/services.ts") so no
//     network/CLDR traffic occurs and the returned groups are deterministic.
//   - baseIr/bcp47/languageName are read by the pane from the REAL
//     workingCopyStore/surveySessionStore singletons (not mocked) — seeded
//     directly, matching BuildListView.test.tsx's convention.
//   - phaseBDraftStore is the real singleton store; reset in before/afterEach
//     so selection state never bleeds across tests.
//
// Out of scope (per task boundary): the engine's buildCharacterMap builder
// (covered in packages/engine/.../characterMap.test.ts) and durable-draft
// persistence round-trip (covered in ../lib/draftPersistence.test.ts).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { CharacterMapPane } from "./CharacterMapPane.tsx";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { usePhaseBDraftStore } from "../stores/phaseBDraftStore.ts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { CharacterMapGroup } from "../lib/services.ts";

// ---------------------------------------------------------------------------
// vi.hoisted — mutable reference the mock factory reads from, and a call
// counter so the short-circuit tests can assert the service was NOT invoked.
// ---------------------------------------------------------------------------

const { getGroupsResult, callCount } = vi.hoisted(() => {
  let _result: CharacterMapGroup[] = [];
  let _calls = 0;
  return {
    getGroupsResult: {
      get: () => _result,
      set: (v: CharacterMapGroup[]) => { _result = v; },
    },
    callCount: {
      get: () => _calls,
      reset: () => { _calls = 0; },
      bump: () => { _calls += 1; },
    },
  };
});

vi.mock("../lib/services.ts", () => ({
  USE_REAL: false,
  characterMapGroups: async (
    _baseIr: unknown,
    _bcp47?: string,
    _languageName?: string,
  ) => {
    callCount.bump();
    return getGroupsResult.get();
  },
}));

// ---------------------------------------------------------------------------
// Fixture: 2 groups — one plain "main" tier group with two ordinary letters,
// one "auxiliary" tier group with a lone combining mark (isCombiningMark:true)
// so the dotted-circle affordance and the tier -> "loanwords" label both get
// exercised in the same fixture.
// ---------------------------------------------------------------------------

// Combining acute accent, U+0301 — a genuine standalone combining mark (not
// attached to a base letter), the case CharacterMapPane's dotted-circle
// rendering exists for.
const COMBINING_ACUTE = "́";

function twoGroupFixture(): CharacterMapGroup[] {
  return [
    {
      block: "Latin",
      tier: "main",
      cells: [
        { char: "a", isCombiningMark: false },
        { char: "b", isCombiningMark: false },
      ],
    },
    {
      block: "Combining Diacritical Marks",
      tier: "auxiliary",
      cells: [{ char: COMBINING_ACUTE, isCombiningMark: true }],
    },
  ];
}

const TEST_BASE = {
  id: "test_kb",
  path: "release/t/test_kb",
  script: "Latn",
  targets: ["windows"] as const,
  displayName: "Test",
  version: "1.0",
};

function seedBaseAndLanguage(bcp47 = "yo", languageName = "Yoruba"): void {
  useWorkingCopyStore.getState().instantiateFromBase(TEST_BASE, {
    vfs: { files: new Map() },
    ir: makeTestIR([]),
  });
  useSurveySessionStore.getState().setSurveyContext({ bcp47_tag: bcp47, language_name: languageName });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
  usePhaseBDraftStore.getState().reset();
  getGroupsResult.set(twoGroupFixture());
  callCount.reset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
  usePhaseBDraftStore.getState().reset();
});

// ---------------------------------------------------------------------------
// Data path — groups render with glyph + U+ notation, tier labels, and the
// combining-mark dotted-circle affordance.
// ---------------------------------------------------------------------------

describe("CharacterMapPane — data path", () => {
  it("renders both groups with their tier label after data loads", async () => {
    seedBaseAndLanguage();
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });
    expect(screen.getByLabelText("Combining Diacritical Marks characters (loanwords)")).toBeTruthy();
  });

  it("renders a cell's glyph and U+ codepoint notation", async () => {
    seedBaseAndLanguage();
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });
    const latinGroup = screen.getByLabelText("Latin characters (main)");
    const aButton = within(latinGroup).getByRole("button", { name: /Add a \(U\+0061\)/ });
    expect(aButton.textContent).toContain("a");
    expect(aButton.textContent).toContain("U+0061");
  });

  it("renders the dotted-circle affordance for a combining-mark cell", async () => {
    seedBaseAndLanguage();
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Combining Diacritical Marks characters (loanwords)")).toBeTruthy();
    });
    const markGroup = screen.getByLabelText("Combining Diacritical Marks characters (loanwords)");
    const markButton = within(markGroup).getByRole("button", { name: /Add.*\(U\+0301\)/ });
    // Dotted circle (U+25CC) prefixes the bare combining mark so it renders visibly standalone.
    expect(markButton.textContent).toContain("◌");
  });

  it("clicking a cell toggles it into the draft store and flips aria-pressed", async () => {
    seedBaseAndLanguage();
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });
    const latinGroup = screen.getByLabelText("Latin characters (main)");
    const aButton = within(latinGroup).getByRole("button", { name: /Add a \(U\+0061\)/ });

    expect(aButton.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(aButton);

    expect(usePhaseBDraftStore.getState().chars).toContain("a");
    const aButtonAfter = within(latinGroup).getByRole("button", { name: /Remove a \(U\+0061\)/ });
    expect(aButtonAfter.getAttribute("aria-pressed")).toBe("true");

    // Click again — removes it.
    fireEvent.click(aButtonAfter);
    expect(usePhaseBDraftStore.getState().chars).not.toContain("a");
    const aButtonFinal = within(latinGroup).getByRole("button", { name: /Add a \(U\+0061\)/ });
    expect(aButtonFinal.getAttribute("aria-pressed")).toBe("false");
  });

  it("a cell already present in phaseBDraftStore.chars renders aria-pressed=true on mount", async () => {
    seedBaseAndLanguage();
    usePhaseBDraftStore.getState().setAll(["b"]);
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });
    const latinGroup = screen.getByLabelText("Latin characters (main)");
    const bButton = within(latinGroup).getByRole("button", { name: /Remove b \(U\+0062\)/ });
    expect(bButton.getAttribute("aria-pressed")).toBe("true");

    // The other cell ("a") was NOT pre-selected — must remain unpressed.
    const aButton = within(latinGroup).getByRole("button", { name: /Add a \(U\+0061\)/ });
    expect(aButton.getAttribute("aria-pressed")).toBe("false");
  });
});

// ---------------------------------------------------------------------------
// Short-circuit — no base IR / no BCP47 tag.
// ---------------------------------------------------------------------------

describe("CharacterMapPane — short-circuit (no verified character list)", () => {
  it("baseIr === null: renders the no-verified-list message and never calls characterMapGroups", () => {
    // No instantiateFromBase call — baseIr stays null (workingCopyStore default).
    useSurveySessionStore.getState().setSurveyContext({ bcp47_tag: "yo", language_name: "Yoruba" });
    render(<CharacterMapPane />);

    expect(screen.getByText(/No verified character list for Yoruba/i)).toBeTruthy();
    expect(callCount.get()).toBe(0);
  });

  it("no bcp47_tag in context: renders the no-verified-list message and never calls characterMapGroups", () => {
    useWorkingCopyStore.getState().instantiateFromBase(TEST_BASE, {
      vfs: { files: new Map() },
      ir: makeTestIR([]),
    });
    // surveyContext left at its reset default — no bcp47_tag.
    render(<CharacterMapPane />);

    expect(screen.getByText(/No verified character list for this language/i)).toBeTruthy();
    expect(callCount.get()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Search filter — plain client-side array filter over already-loaded cells.
// ---------------------------------------------------------------------------

describe("CharacterMapPane — search filter", () => {
  it("filters cells by substring match, dropping groups with zero surviving cells", async () => {
    seedBaseAndLanguage();
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });

    const searchInput = screen.getByLabelText("Search the character map");
    fireEvent.change(searchInput, { target: { value: "a" } });

    // "a" cell survives; "b" cell (and the combining-mark group, which has no
    // "a" in it) are filtered out entirely.
    const latinGroup = screen.getByLabelText("Latin characters (main)");
    expect(within(latinGroup).queryByRole("button", { name: /a \(U\+0061\)/ })).toBeTruthy();
    expect(within(latinGroup).queryByRole("button", { name: /b \(U\+0062\)/ })).toBeNull();
    expect(screen.queryByLabelText("Combining Diacritical Marks characters (loanwords)")).toBeNull();
  });

  it("shows a 'no characters match' message when the filter yields zero cells anywhere", async () => {
    seedBaseAndLanguage();
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });

    const searchInput = screen.getByLabelText("Search the character map");
    fireEvent.change(searchInput, { target: { value: "zzz-no-match" } });

    expect(screen.getByText(/No characters match "zzz-no-match"/i)).toBeTruthy();
    expect(screen.queryByLabelText("Latin characters (main)")).toBeNull();
  });
});
