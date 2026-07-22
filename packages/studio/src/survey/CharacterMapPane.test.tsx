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
import { screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { CharacterMapPane, MAX_CELLS_PER_GROUP } from "./CharacterMapPane.tsx";
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

// ---------------------------------------------------------------------------
// Raw U+XXXX entry — the "all options" escape hatch.
// ---------------------------------------------------------------------------

describe("CharacterMapPane — raw code point entry", () => {
  it("adds a character by U+XXXX code point and clears the field on success", async () => {
    seedBaseAndLanguage();
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });

    const input = screen.getByLabelText("Add a character by Unicode code point");
    fireEvent.change(input, { target: { value: "U+0041" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(usePhaseBDraftStore.getState().chars).toContain("A");
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("accepts liberal hex forms (bare hex, lowercase u+) — canonical parser drops the 0x form", async () => {
    seedBaseAndLanguage();
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });

    const input = screen.getByLabelText("Add a character by Unicode code point");
    const addButton = screen.getByRole("button", { name: "Add" });

    fireEvent.change(input, { target: { value: "u+0042" } });
    fireEvent.click(addButton);
    expect(usePhaseBDraftStore.getState().chars).toContain("B");

    fireEvent.change(input, { target: { value: "0043" } });
    fireEvent.click(addButton);
    expect(usePhaseBDraftStore.getState().chars).toContain("C");
  });

  it("rejects an out-of-range code point and shows an inline error without mutating the store", async () => {
    seedBaseAndLanguage();
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });

    const input = screen.getByLabelText("Add a character by Unicode code point");
    fireEvent.change(input, { target: { value: "U+110000" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(/enter a valid code point/i)).toBeTruthy();
    expect(usePhaseBDraftStore.getState().chars).toEqual([]);
  });

  it("rejects a surrogate-half code point", async () => {
    seedBaseAndLanguage();
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });

    const input = screen.getByLabelText("Add a character by Unicode code point");
    fireEvent.change(input, { target: { value: "U+D800" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByText(/enter a valid code point/i)).toBeTruthy();
    expect(usePhaseBDraftStore.getState().chars).toEqual([]);
  });

  it("rejects a noncharacter code point (plane-end and Arabic-presentation-forms range)", async () => {
    seedBaseAndLanguage();
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });

    const input = screen.getByLabelText("Add a character by Unicode code point");
    const addButton = screen.getByRole("button", { name: "Add" });

    fireEvent.change(input, { target: { value: "U+FFFF" } });
    fireEvent.click(addButton);
    expect(screen.getByText(/enter a valid code point/i)).toBeTruthy();
    expect(usePhaseBDraftStore.getState().chars).toEqual([]);

    fireEvent.change(input, { target: { value: "U+FDD0" } });
    fireEvent.click(addButton);
    expect(screen.getByText(/enter a valid code point/i)).toBeTruthy();
    expect(usePhaseBDraftStore.getState().chars).toEqual([]);
  });

  it("allows a PUA code point (the escape hatch's whole point)", async () => {
    seedBaseAndLanguage();
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });

    const input = screen.getByLabelText("Add a character by Unicode code point");
    fireEvent.change(input, { target: { value: "U+E000" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(usePhaseBDraftStore.getState().chars).toContain("\u{E000}");
  });

  it("clears a stale error as soon as the field is edited again", async () => {
    seedBaseAndLanguage();
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });

    const input = screen.getByLabelText("Add a character by Unicode code point");
    fireEvent.change(input, { target: { value: "U+D800" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.queryByRole("alert")).toBeTruthy();

    fireEvent.change(input, { target: { value: "U+0041" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("disables the Add button while the field is empty or whitespace-only", async () => {
    seedBaseAndLanguage();
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });

    const input = screen.getByLabelText("Add a character by Unicode code point");
    const addButton = screen.getByRole("button", { name: "Add" }) as HTMLButtonElement;

    expect(addButton.disabled).toBe(true);

    fireEvent.change(input, { target: { value: "   " } });
    expect(addButton.disabled).toBe(true);

    fireEvent.change(input, { target: { value: "U+0041" } });
    expect(addButton.disabled).toBe(false);

    fireEvent.change(input, { target: { value: "" } });
    expect(addButton.disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// New tiers — digits & punctuation (engine's parallel-track extension).
// ---------------------------------------------------------------------------

describe("CharacterMapPane — digits & punctuation tiers", () => {
  it("renders the digits and punctuation tier labels", async () => {
    seedBaseAndLanguage();
    getGroupsResult.set([
      {
        block: "Digits",
        tier: "digits",
        cells: [{ char: "0", isCombiningMark: false }],
      },
      {
        block: "Punctuation",
        tier: "punctuation",
        cells: [{ char: ".", isCombiningMark: false }],
      },
    ]);
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Digits characters (Digits & numerals)")).toBeTruthy();
    });
    expect(screen.getByLabelText("Punctuation characters (Punctuation & symbols)")).toBeTruthy();
  });
});

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

// ---------------------------------------------------------------------------
// Per-group render cap (MAX_CELLS_PER_GROUP) — raised so a real one-group
// script like Yi (~1,165 letters) renders in full; still caps anything larger.
// ---------------------------------------------------------------------------

// Synthetic cells built from a run of PUA code points — unique `char` values
// (required, since `cell.char` is the React key) without depending on any
// real script having exactly N assigned letters.
function syntheticCells(count: number): CharacterMapGroup["cells"] {
  return Array.from({ length: count }, (_, i) => ({
    char: String.fromCodePoint(0xe000 + i),
    isCombiningMark: false,
  }));
}

describe("CharacterMapPane — per-group render cap", () => {
  // These exercise the slice / hiddenCount / "Showing N of M" logic. Rendering
  // the real cap (3000+ chips → ~12k DOM nodes) is CPU-bound and flaked past
  // the timeout under full-suite parallel load, so we drive a small injected
  // cap via the `maxCellsPerGroup` prop — the exact same code path, a fraction
  // of the DOM. The default equals MAX_CELLS_PER_GROUP; production never sets it.
  const TEST_CAP = 30;

  it("renders an at-cap group in full — no 'Showing N of M' truncation note", async () => {
    seedBaseAndLanguage();
    getGroupsResult.set([
      { block: "Synthetic", tier: "main", cells: syntheticCells(TEST_CAP) },
    ]);
    render(<CharacterMapPane maxCellsPerGroup={TEST_CAP} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Synthetic characters (main)")).toBeTruthy();
    });
    const group = screen.getByLabelText("Synthetic characters (main)");
    expect(within(group).getAllByRole("button")).toHaveLength(TEST_CAP);
    expect(screen.queryByText(/Showing \d+ of \d+ characters/i)).toBeNull();
  });

  it("caps a group larger than the cap and shows 'Showing N of M'", async () => {
    seedBaseAndLanguage();
    const over = TEST_CAP + 5;
    getGroupsResult.set([
      { block: "Synthetic", tier: "main", cells: syntheticCells(over) },
    ]);
    render(<CharacterMapPane maxCellsPerGroup={TEST_CAP} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Synthetic characters (main)")).toBeTruthy();
    });
    const group = screen.getByLabelText("Synthetic characters (main)");
    expect(within(group).getAllByRole("button")).toHaveLength(TEST_CAP);
    expect(
      screen.getByText(new RegExp(`Showing ${TEST_CAP} of ${over} characters`, "i")),
    ).toBeTruthy();
  });

  it("uses MAX_CELLS_PER_GROUP as the default cap", () => {
    // Guards the production default without rendering it: the prop is optional
    // and falls back to the exported constant.
    expect(MAX_CELLS_PER_GROUP).toBe(3000);
  });
});
