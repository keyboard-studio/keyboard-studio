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
import { screen, fireEvent, cleanup, waitFor, within, act } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { CharacterMapPane, MAX_CELLS_PER_GROUP } from "./CharacterMapPane.tsx";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { usePhaseBDraftStore } from "../stores/phaseBDraftStore.ts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { IRGroup } from "@keyboard-studio/contracts";
import type { CharacterMapGroup } from "../lib/services.ts";

// ---------------------------------------------------------------------------
// vi.hoisted — mutable reference the mock factory reads from, and a call
// counter so the short-circuit tests can assert the service was NOT invoked.
// ---------------------------------------------------------------------------

const { getGroupsResult, callCount, unsupportedDisplays } = vi.hoisted(() => {
  let _result: CharacterMapGroup[] = [];
  let _calls = 0;
  let _unsupported = new Set<string>();
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
    // Font-support box-fallback test double: displays named here report as
    // "not supported by the selected font", exercising the box-placeholder
    // render path without depending on real Canvas 2D metrics (unavailable
    // in jsdom — see fontSupport.test.ts for that module's own coverage).
    unsupportedDisplays: {
      set: (displays: string[]) => { _unsupported = new Set(displays); },
      has: (display: string) => _unsupported.has(display),
    },
  };
});

vi.mock("../lib/services.ts", () => ({
  USE_REAL: false,
  characterMapGroups: async (
    _baseIr: unknown,
    _bcp47?: string,
    _languageName?: string,
    _baseScripts?: readonly string[],
  ) => {
    callCount.bump();
    return getGroupsResult.get();
  },
}));

vi.mock("./useFontSupportChecker.ts", () => ({
  useFontSupportChecker: (_fontStack: string) => (display: string) => !unsupportedDisplays.has(display),
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
      script: "Latn",
      usedByBase: false,
      cells: [
        { char: "a", isCombiningMark: false },
        { char: "b", isCombiningMark: false },
      ],
    },
    {
      block: "Combining Diacritical Marks",
      tier: "auxiliary",
      script: "Latn",
      usedByBase: false,
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

/** Seed a base whose IR PRODUCES the given glyphs (one rule per char). */
function seedBaseProducing(produced: string[], bcp47 = "yo", languageName = "Yoruba"): void {
  const rules = produced.map((c, i) => ({
    nodeId: `rule#${i}`,
    context: [{ kind: "vkey" as const, name: "K_A", modifiers: [] }],
    output: [{ kind: "char" as const, value: c.normalize("NFC") }],
  }));
  const group: IRGroup = { nodeId: "group#main", name: "main", usingKeys: true, readonly: false, rules };
  useWorkingCopyStore.getState().instantiateFromBase(TEST_BASE, {
    vfs: { files: new Map() },
    ir: makeTestIR([group]),
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
  unsupportedDisplays.set([]);
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

  it("renders a deterministic box placeholder (not the glyph) when the selected font can't render a cell — codepoint label and click/aria behavior stay unchanged (Requirement 1)", async () => {
    seedBaseAndLanguage();
    unsupportedDisplays.set(["b"]);
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });
    const latinGroup = screen.getByLabelText("Latin characters (main)");
    const bButton = within(latinGroup).getByRole("button", { name: /Add b \(U\+0062\)/ });

    // Box fallback: no visible "b" glyph text in the button, but the U+
    // codepoint label and the aria-label both stay exactly as before.
    expect(bButton.textContent).not.toContain("b");
    expect(bButton.textContent).toContain("U+0062");
    expect(bButton.querySelector('[aria-hidden="true"]')).toBeTruthy();

    // Still toggleable exactly like a normal (glyph-rendering) cell.
    fireEvent.click(bButton);
    expect(usePhaseBDraftStore.getState().chars).toContain("b");
    expect(bButton.getAttribute("aria-pressed")).toBe("true");

    // The unaffected "a" cell still renders its real glyph.
    const aButton = within(latinGroup).getByRole("button", { name: /Add a \(U\+0061\)/ });
    expect(aButton.textContent).toContain("a");
  });

  it("never boxes a combining-mark cell even when the font-support checker reports it unsupported (regression)", async () => {
    seedBaseAndLanguage();
    // The dotted-circle-prefixed display string for the fixture's combining
    // mark cell (◌ + U+0301) — report it as "unsupported" via the mocked
    // useFontSupportChecker, exactly the shape of the measureText misfire
    // fontSupport.ts's isGlyphSupported doc comment describes for a
    // near-zero-advance-width mark.
    unsupportedDisplays.set(["◌" + COMBINING_ACUTE]);
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Combining Diacritical Marks characters (loanwords)")).toBeTruthy();
    });
    const markGroup = screen.getByLabelText("Combining Diacritical Marks characters (loanwords)");
    const markButton = within(markGroup).getByRole("button", { name: /Add.*\(U\+0301\)/ });

    // Must still render the dotted-circle glyph, NEVER the box placeholder.
    expect(markButton.textContent).toContain("◌");
    expect(markButton.querySelector('[aria-hidden="true"]')).toBeFalsy();
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

  it("hides uppercase letters of a cased script, showing only the lowercase (spec 047)", async () => {
    seedBaseAndLanguage();
    getGroupsResult.set([
      {
        block: "Latin",
        tier: "main",
        script: "Latn",
        usedByBase: false,
        cells: [
          { char: "a", isCombiningMark: false },
          { char: "A", isCombiningMark: false },
          { char: "b", isCombiningMark: false },
          { char: "B", isCombiningMark: false },
        ],
      },
    ]);
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });
    const group = screen.getByLabelText("Latin characters (main)");
    // Lowercase shown…
    expect(within(group).queryByRole("button", { name: /Add a \(U\+0061\)/ })).toBeTruthy();
    expect(within(group).queryByRole("button", { name: /Add b \(U\+0062\)/ })).toBeTruthy();
    // …uppercase counterparts hidden (recorded on Done instead).
    expect(within(group).queryByRole("button", { name: /A \(U\+0041\)/ })).toBeNull();
    expect(within(group).queryByRole("button", { name: /B \(U\+0042\)/ })).toBeNull();
  });

  it("clicking a cased letter adds BOTH cases to the alphabet; clicking again removes both (spec 047)", async () => {
    seedBaseAndLanguage();
    getGroupsResult.set([
      {
        block: "Latin",
        tier: "main",
        script: "Latn",
        usedByBase: false,
        cells: [
          { char: "a", isCombiningMark: false },
          { char: "b", isCombiningMark: false },
        ],
      },
    ]);
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });
    const group = screen.getByLabelText("Latin characters (main)");
    fireEvent.click(within(group).getByRole("button", { name: /Add a \(U\+0061\)/ }));
    // The lowercase and its (hidden) uppercase both join the alphabet.
    expect(usePhaseBDraftStore.getState().chars).toContain("a");
    expect(usePhaseBDraftStore.getState().chars).toContain("A");
    // Clicking the now-selected cell removes both.
    fireEvent.click(within(group).getByRole("button", { name: /Remove a \(U\+0061\)/ }));
    expect(usePhaseBDraftStore.getState().chars).not.toContain("a");
    expect(usePhaseBDraftStore.getState().chars).not.toContain("A");
  });

  it("tints base-keyboard output glyphs (with an accessible hint) until the author selects them", async () => {
    // Base produces "a" but not "b".
    seedBaseProducing(["a"]);
    getGroupsResult.set([
      {
        block: "Latin",
        tier: "main",
        script: "Latn",
        usedByBase: false,
        cells: [
          { char: "a", isCombiningMark: false },
          { char: "b", isCombiningMark: false },
        ],
      },
    ]);
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });
    // "a" is a base-output glyph → accessible name carries the base hint.
    expect(
      screen.getByRole("button", { name: /Add a \(U\+0061\) — from your base keyboard/ }),
    ).toBeTruthy();
    // "b" is not produced by the base → no hint.
    expect(
      screen.queryByRole("button", { name: /Add b \(U\+0062\) — from your base keyboard/ }),
    ).toBeNull();
    // Selecting "a" clears the base tint/hint (it is now a chosen alphabet char).
    fireEvent.click(screen.getByRole("button", { name: /Add a \(U\+0061\) — from your base keyboard/ }));
    expect(screen.queryByRole("button", { name: /from your base keyboard/ })).toBeNull();
  });

  it("shows only letters, numerals, and marks; excludes symbols and separators (spec 047)", async () => {
    seedBaseAndLanguage();
    getGroupsResult.set([
      {
        block: "Mixed",
        tier: "main",
        script: "Latn",
        usedByBase: false,
        cells: [
          { char: "a", isCombiningMark: false }, // letter — kept
          { char: "5", isCombiningMark: false }, // numeral — kept (word-forming)
          { char: "́", isCombiningMark: true }, // combining mark — kept
          { char: "€", isCombiningMark: false }, // symbol — excluded
          { char: " ", isCombiningMark: false }, // NBSP separator — excluded
        ],
      },
    ]);
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Mixed characters (main)")).toBeTruthy();
    });
    const group = screen.getByLabelText("Mixed characters (main)");
    expect(within(group).queryByRole("button", { name: /Add a \(U\+0061\)/ })).toBeTruthy();
    expect(within(group).queryByRole("button", { name: /Add 5 \(U\+0035\)/ })).toBeTruthy();
    expect(within(group).queryByRole("button", { name: /\(U\+0301\)/ })).toBeTruthy(); // mark
    expect(within(group).queryByRole("button", { name: /\(U\+20AC\)/ })).toBeNull(); // € symbol
    expect(within(group).queryByRole("button", { name: /\(U\+00A0\)/ })).toBeNull(); // NBSP separator
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

  it("allows a PUA code point after the role prompt (the escape hatch's whole point, spec 046 FR-004)", async () => {
    seedBaseAndLanguage();
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });

    const input = screen.getByLabelText("Add a character by Unicode code point");
    fireEvent.change(input, { target: { value: "U+E000" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    // FR-004: nothing is added until the designer answers letter-or-mark.
    expect(usePhaseBDraftStore.getState().chars).toEqual([]);
    expect(screen.getByTestId("pua-role-prompt")).toBeTruthy();
    fireEvent.click(screen.getByTestId("pua-role-letter"));

    expect(usePhaseBDraftStore.getState().chars).toContain("\u{E000}");
  });

  it("PUA answered 'mark' lands in the Marks store with a permanent declared role (US6 AC2)", async () => {
    seedBaseAndLanguage();
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });

    const input = screen.getByLabelText("Add a character by Unicode code point");
    fireEvent.change(input, { target: { value: "U+E001" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByTestId("pua-role-mark"));

    const state = usePhaseBDraftStore.getState();
    expect(state.marks).toContain("\u{E001}");
    expect(state.bases).not.toContain("\u{E001}");
    expect(state.declaredRoles["\u{E001}"]).toBe("mark");
  });

  it("PUA answered 'letter' lands in the Letters store and never in Marks (US6 AC3)", async () => {
    seedBaseAndLanguage();
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });

    const input = screen.getByLabelText("Add a character by Unicode code point");
    fireEvent.change(input, { target: { value: "U+E002" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByTestId("pua-role-letter"));

    const state = usePhaseBDraftStore.getState();
    expect(state.bases).toContain("\u{E002}");
    expect(state.marks).not.toContain("\u{E002}");
    expect(state.declaredRoles["\u{E002}"]).toBe("letter");
  });

  it("cancelling the PUA role prompt adds nothing", async () => {
    seedBaseAndLanguage();
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });

    const input = screen.getByLabelText("Add a character by Unicode code point");
    fireEvent.change(input, { target: { value: "U+E003" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(usePhaseBDraftStore.getState().chars).toEqual([]);
    expect(screen.queryByTestId("pua-role-prompt")).toBeNull();
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
  it("renders the digits tier; punctuation/symbols are not shown on this page (spec 047)", async () => {
    seedBaseAndLanguage();
    getGroupsResult.set([
      {
        block: "Digits",
        tier: "digits",
        script: "Common",
        usedByBase: false,
        cells: [{ char: "0", isCombiningMark: false }],
      },
      {
        block: "Punctuation",
        tier: "punctuation",
        script: "Common",
        usedByBase: false,
        cells: [{ char: ".", isCombiningMark: false }],
      },
    ]);
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Digits characters (Digits & numerals)")).toBeTruthy();
    });
    // Numerals are kept (some languages use digits word-formingly)…
    expect(screen.getByRole("button", { name: /Add 0 \(U\+0030\)/ })).toBeTruthy();
    // …but punctuation/symbols move to a later dedicated page — their group is
    // filtered out here (every cell dropped → group not rendered).
    expect(
      screen.queryByLabelText("Punctuation characters (Punctuation & symbols)"),
    ).toBeNull();
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

  it("matches by Unicode name — 'acute' finds the combining acute accent cell", async () => {
    seedBaseAndLanguage();
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });

    getGroupsResult.set([
      {
        block: "Combining Diacritical Marks",
        tier: "auxiliary",
        script: "Latn",
        usedByBase: false,
        cells: [{ char: COMBINING_ACUTE, isCombiningMark: true, name: "COMBINING ACUTE ACCENT" }],
      },
    ]);
    act(() => {
      useSurveySessionStore.getState().setSurveyContext({ bcp47_tag: "yo", language_name: "Yoruba2" });
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Combining Diacritical Marks characters (loanwords)")).toBeTruthy();
    });
    fireEvent.change(screen.getByLabelText("Search the character map"), { target: { value: "acute" } });
    expect(
      screen.getByLabelText("Combining Diacritical Marks characters (loanwords)"),
    ).toBeTruthy();
  });

  it("matches by codepoint — 'U+0061', '0061', and the partial prefix '003'", async () => {
    // NOTE: uses lowercase 'a' (U+0061), not uppercase 'A': the map hides
    // uppercase letters of cased scripts (spec 047 refinement), so an uppercase
    // fixture would be filtered out of the grid entirely. This test exercises
    // the code-point search mechanism, independent of casing.
    seedBaseAndLanguage();
    getGroupsResult.set([
      {
        block: "Basic Latin",
        tier: "main",
        script: "Latn",
        usedByBase: false,
        cells: [
          { char: "a", isCombiningMark: false }, // U+0061
          { char: "0", isCombiningMark: false }, // U+0030
          { char: "9", isCombiningMark: false }, // U+0039
        ],
      },
    ]);
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Basic Latin characters (main)")).toBeTruthy();
    });
    const group = screen.getByLabelText("Basic Latin characters (main)");
    const searchInput = screen.getByLabelText("Search the character map");

    fireEvent.change(searchInput, { target: { value: "U+0061" } });
    expect(within(group).queryByRole("button", { name: /a \(U\+0061\)/ })).toBeTruthy();
    expect(within(group).queryByRole("button", { name: /0 \(U\+0030\)/ })).toBeNull();

    fireEvent.change(searchInput, { target: { value: "0061" } });
    expect(within(group).queryByRole("button", { name: /a \(U\+0061\)/ })).toBeTruthy();

    fireEvent.change(searchInput, { target: { value: "003" } });
    expect(within(group).queryByRole("button", { name: /0 \(U\+0030\)/ })).toBeTruthy();
    expect(within(group).queryByRole("button", { name: /9 \(U\+0039\)/ })).toBeTruthy();
    expect(within(group).queryByRole("button", { name: /a \(U\+0061\)/ })).toBeNull();
  });

  it("matches by base letter — 'o' finds o, an accented o, and a non-decomposing o-variant", async () => {
    seedBaseAndLanguage();
    getGroupsResult.set([
      {
        block: "Latin",
        tier: "main",
        script: "Latn",
        usedByBase: false,
        cells: [
          { char: "o", isCombiningMark: false, name: "LATIN SMALL LETTER O" },
          { char: "ó", isCombiningMark: false, name: "LATIN SMALL LETTER O WITH ACUTE" },
          { char: "ø", isCombiningMark: false, name: "LATIN SMALL LETTER O WITH STROKE" },
          { char: "b", isCombiningMark: false, name: "LATIN SMALL LETTER B" },
        ],
      },
    ]);
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });
    const group = screen.getByLabelText("Latin characters (main)");
    fireEvent.change(screen.getByLabelText("Search the character map"), { target: { value: "o" } });

    expect(within(group).queryByRole("button", { name: /^Add o \(U\+006F\)/ })).toBeTruthy();
    expect(within(group).queryByRole("button", { name: /ó \(U\+00F3\)/ })).toBeTruthy();
    expect(within(group).queryByRole("button", { name: /ø \(U\+00F8\)/ })).toBeTruthy();
    expect(within(group).queryByRole("button", { name: /Add b \(U\+0062\)/ })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Per-group render cap (MAX_CELLS_PER_GROUP) — raised so a real one-group
// script like Yi (~1,165 letters) renders in full; still caps anything larger.
// ---------------------------------------------------------------------------

// Synthetic cells built from a run of CJK ideograph code points (U+4E00+) —
// unique `char` values (required, since `cell.char` is the React key) that are
// all \p{Lo} LETTERS, so they survive this page's letters/numerals/marks cell
// filter (PUA would be dropped as non-letter "control").
function syntheticCells(count: number): CharacterMapGroup["cells"] {
  return Array.from({ length: count }, (_, i) => ({
    char: String.fromCodePoint(0x4e00 + i),
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
      { block: "Synthetic", tier: "main", script: "Latn", usedByBase: false, cells: syntheticCells(TEST_CAP) },
    ]);
    render(<CharacterMapPane maxCellsPerGroup={TEST_CAP} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Synthetic characters (main)")).toBeTruthy();
    });
    const group = screen.getByLabelText("Synthetic characters (main)");
    // Scope to the cell grid (the inner role="group" div) so the section's
    // own Hide/Show toggle button isn't counted alongside the cell buttons.
    const cellGrid = within(group).getByRole("group", { name: /click to toggle/i });
    expect(within(cellGrid).getAllByRole("button")).toHaveLength(TEST_CAP);
    expect(screen.queryByText(/Showing \d+ of \d+ characters/i)).toBeNull();
  });

  it("caps a group larger than the cap and shows 'Showing N of M'", async () => {
    seedBaseAndLanguage();
    const over = TEST_CAP + 5;
    getGroupsResult.set([
      { block: "Synthetic", tier: "main", script: "Latn", usedByBase: false, cells: syntheticCells(over) },
    ]);
    render(<CharacterMapPane maxCellsPerGroup={TEST_CAP} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Synthetic characters (main)")).toBeTruthy();
    });
    const group = screen.getByLabelText("Synthetic characters (main)");
    const cellGrid = within(group).getByRole("group", { name: /click to toggle/i });
    expect(within(cellGrid).getAllByRole("button")).toHaveLength(TEST_CAP);
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

// ---------------------------------------------------------------------------
// Blocks-my-keyboard-uses filter — a checkbox (checked by default) that
// narrows the grid to only the groups the engine tagged usedByBase: true
// (the Unicode blocks the base keyboard actually produces, via
// producedGlyphs — see packages/engine/.../characterMap.ts), with the
// "auto-unhide" mechanism: any group already represented in the author's
// accumulating alphabet is shown too, so adding a character from a hidden
// block unhides that whole block even while the checkbox stays checked. The
// checkbox itself only renders once we actually know the base's blocks (at
// least one loaded group is usedByBase: true) — otherwise the filter would
// be meaningless, so every group shows.
// ---------------------------------------------------------------------------

function blocksFixture(): CharacterMapGroup[] {
  return [
    {
      block: "Latin",
      tier: "main",
      script: "Latn",
      usedByBase: true,
      cells: [{ char: "a", isCombiningMark: false }],
    },
    {
      block: "Combining Diacritical Marks",
      tier: "auxiliary",
      script: "Latn",
      usedByBase: true,
      cells: [{ char: COMBINING_ACUTE, isCombiningMark: true }],
    },
    {
      block: "Greek",
      tier: "block",
      script: "Grek",
      usedByBase: false,
      cells: [{ char: "α", isCombiningMark: false, name: "GREEK SMALL LETTER ALPHA" }],
    },
  ];
}

describe("CharacterMapPane — blocks-my-keyboard-uses filter", () => {
  it("is checked by default; shows usedByBase groups, hides the non-used Greek group", async () => {
    seedBaseAndLanguage();
    getGroupsResult.set(blocksFixture());
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });
    const checkbox = screen.getByRole("checkbox", { name: "Show only blocks my keyboard uses" });
    expect((checkbox as HTMLInputElement).checked).toBe(true);

    // usedByBase groups show...
    expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    expect(
      screen.getByLabelText("Combining Diacritical Marks characters (loanwords)"),
    ).toBeTruthy();
    // ...but the non-used Greek group is hidden.
    expect(screen.queryByLabelText("Greek characters")).toBeNull();
  });

  it("unchecking shows all groups, including the previously-hidden Greek group", async () => {
    seedBaseAndLanguage();
    getGroupsResult.set(blocksFixture());
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });
    expect(screen.queryByLabelText("Greek characters")).toBeNull();

    fireEvent.click(screen.getByRole("checkbox", { name: "Show only blocks my keyboard uses" }));

    expect(screen.getByLabelText("Greek characters")).toBeTruthy();
    const checkbox = screen.getByRole("checkbox", { name: "Show only blocks my keyboard uses" });
    expect((checkbox as HTMLInputElement).checked).toBe(false);
  });

  it("adding a character from a hidden block (reached via search) unhides that block while the checkbox stays checked", async () => {
    seedBaseAndLanguage();
    getGroupsResult.set(blocksFixture());
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });
    expect(screen.queryByLabelText("Greek characters")).toBeNull();

    // Reach the hidden Greek cell via search (whole-set, so it's reachable
    // even while the box is hiding its group from the plain browse view).
    fireEvent.change(screen.getByLabelText("Search the character map"), { target: { value: "alpha" } });
    const greekGroup = screen.getByLabelText("Greek characters");
    fireEvent.click(within(greekGroup).getByRole("button", { name: /Add α/ }));

    // Clear the search — the box is STILL checked, but the Greek group now
    // stays visible because "α" is in the author's alphabet.
    fireEvent.change(screen.getByLabelText("Search the character map"), { target: { value: "" } });

    const checkbox = screen.getByRole("checkbox", { name: "Show only blocks my keyboard uses" });
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    expect(screen.getByLabelText("Greek characters")).toBeTruthy();
    expect(usePhaseBDraftStore.getState().chars).toContain("α");
  });

  it("search is whole-set: finds a hidden-block character even while the box is checked", async () => {
    seedBaseAndLanguage();
    getGroupsResult.set(blocksFixture());
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });
    expect(screen.queryByLabelText("Greek characters")).toBeNull();

    fireEvent.change(screen.getByLabelText("Search the character map"), { target: { value: "alpha" } });
    expect(screen.getByLabelText("Greek characters")).toBeTruthy();
  });

  it("announces the filter state via the aria-live region on toggle", async () => {
    seedBaseAndLanguage();
    getGroupsResult.set(blocksFixture());
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });
    const checkbox = screen.getByRole("checkbox", { name: "Show only blocks my keyboard uses" });

    fireEvent.click(checkbox);
    expect(screen.getByText("Showing all blocks")).toBeTruthy();

    fireEvent.click(checkbox);
    expect(screen.getByText("Showing only blocks your keyboard uses")).toBeTruthy();
  });

  it("hides the checkbox entirely when no loaded group is usedByBase (e.g. no producedGlyphs known), and shows every group", async () => {
    seedBaseAndLanguage();
    getGroupsResult.set([
      { block: "Latin", tier: "main", script: "Latn", usedByBase: false, cells: [{ char: "a", isCombiningMark: false }] },
      { block: "Greek", tier: "block", script: "Grek", usedByBase: false, cells: [{ char: "α", isCombiningMark: false }] },
    ]);
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });
    expect(screen.queryByRole("checkbox", { name: "Show only blocks my keyboard uses" })).toBeNull();
    // No known blocks — the filter is meaningless, so every group shows.
    expect(screen.getByLabelText("Greek characters")).toBeTruthy();
  });

  it("renders same-block groups from different scripts without a React key collision", async () => {
    // Uncurated scripts share generic fallback block names ("Letters"), so two
    // groups can be tier:"block"/block:"Letters" and differ only by script.
    // groupKey() must include script or React drops one of them. Neither
    // group is usedByBase, so the filter is inactive (checkbox hidden) and
    // both render without needing to be toggled.
    seedBaseAndLanguage();
    getGroupsResult.set([
      // Two caseless-script letters (Greek α is lowercase; Devanagari क is
      // caseless) so neither is removed by the uppercase fold (spec 047).
      { block: "Letters", tier: "block", script: "Grek", usedByBase: false, cells: [{ char: "α", isCombiningMark: false }] },
      { block: "Letters", tier: "block", script: "Deva", usedByBase: false, cells: [{ char: "क", isCombiningMark: false }] },
    ]);
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Add α \(U\+03B1\)/ })).toBeTruthy();
    });
    // Both cells render — neither same-key section was dropped/merged.
    expect(screen.getByRole("button", { name: /Add क \(U\+0915\)/ })).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Per-group "Hide" button — deliberately different from the "blocks my
// keyboard uses" checkbox above: collapses ONE group's cell grid in place
// without dropping the group from the data. The heading stays queryable, and
// a single click on "Show" restores the cells.
// ---------------------------------------------------------------------------

describe("CharacterMapPane — per-group Hide/Show", () => {
  it("clicking Hide collapses a group's cells but keeps its heading present", async () => {
    seedBaseAndLanguage();
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });
    const latinGroup = screen.getByLabelText("Latin characters (main)");
    const aButtonBefore = within(latinGroup).queryByRole("button", { name: /Add a \(U\+0061\)/ });
    expect(aButtonBefore).toBeTruthy();

    fireEvent.click(within(latinGroup).getByRole("button", { name: "Hide Latin" }));

    // Heading still present.
    expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    // Cells gone.
    expect(within(latinGroup).queryByRole("button", { name: /Add a \(U\+0061\)/ })).toBeNull();
    expect(within(latinGroup).queryByRole("button", { name: /Add b \(U\+0062\)/ })).toBeNull();
    // The toggle is now a "Show" control.
    const showButton = within(latinGroup).getByRole("button", { name: "Show Latin" });
    expect(showButton.getAttribute("aria-expanded")).toBe("false");
  });

  it("clicking Show restores the cells", async () => {
    seedBaseAndLanguage();
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });
    const latinGroup = screen.getByLabelText("Latin characters (main)");
    fireEvent.click(within(latinGroup).getByRole("button", { name: "Hide Latin" }));
    expect(within(latinGroup).queryByRole("button", { name: /Add a \(U\+0061\)/ })).toBeNull();

    fireEvent.click(within(latinGroup).getByRole("button", { name: "Show Latin" }));

    expect(within(latinGroup).getByRole("button", { name: /Add a \(U\+0061\)/ })).toBeTruthy();
    expect(within(latinGroup).getByRole("button", { name: /Add b \(U\+0062\)/ })).toBeTruthy();
    const hideButton = within(latinGroup).getByRole("button", { name: "Hide Latin" });
    expect(hideButton.getAttribute("aria-expanded")).toBe("true");
  });

  it("hiding one group leaves other groups' cells visible (per-group, not all-or-nothing)", async () => {
    seedBaseAndLanguage();
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });
    const latinGroup = screen.getByLabelText("Latin characters (main)");
    fireEvent.click(within(latinGroup).getByRole("button", { name: "Hide Latin" }));

    // Latin cells collapsed...
    expect(within(latinGroup).queryByRole("button", { name: /Add a \(U\+0061\)/ })).toBeNull();
    // ...but the other group's cells are untouched.
    const markGroup = screen.getByLabelText("Combining Diacritical Marks characters (loanwords)");
    expect(within(markGroup).getByRole("button", { name: /Add.*\(U\+0301\)/ })).toBeTruthy();
  });

  it("hidden state does not remove the group from the data — heading still queryable and re-fetch is not triggered", async () => {
    seedBaseAndLanguage();
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });
    const before = callCount.get();
    const latinGroup = screen.getByLabelText("Latin characters (main)");
    fireEvent.click(within(latinGroup).getByRole("button", { name: "Hide Latin" }));

    // The section (and its aria-label) is still present — the group was never
    // filtered out of the underlying data, only its cell grid collapsed.
    expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    // No re-fetch occurred — this was a pure client-side view toggle.
    expect(callCount.get()).toBe(before);
  });

  it("announces the hide/show action via the shared aria-live region", async () => {
    seedBaseAndLanguage();
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });
    const latinGroup = screen.getByLabelText("Latin characters (main)");

    fireEvent.click(within(latinGroup).getByRole("button", { name: "Hide Latin" }));
    expect(screen.getByText("Hidden Latin")).toBeTruthy();

    fireEvent.click(within(latinGroup).getByRole("button", { name: "Show Latin" }));
    expect(screen.getByText("Showing Latin")).toBeTruthy();
  });

  it("a language/base change resets hiddenGroups — a previously-hidden group renders expanded again", async () => {
    seedBaseAndLanguage();
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });
    const latinGroup = screen.getByLabelText("Latin characters (main)");
    fireEvent.click(within(latinGroup).getByRole("button", { name: "Hide Latin" }));
    expect(within(latinGroup).queryByRole("button", { name: /Add a \(U\+0061\)/ })).toBeNull();

    // Drive a language change the same way the existing search test does
    // (act + setSurveyContext) — this re-triggers the fetch effect, which
    // resets hiddenGroups at ~line 210.
    act(() => {
      useSurveySessionStore.getState().setSurveyContext({ bcp47_tag: "fr", language_name: "French" });
    });

    await waitFor(() => {
      const refreshedGroup = screen.getByLabelText("Latin characters (main)");
      expect(within(refreshedGroup).queryByRole("button", { name: /Add a \(U\+0061\)/ })).toBeTruthy();
    });
  });

  it("search bypasses a per-group Hide: a matching cell in a hidden group still renders while the query is active, and the group re-collapses once the query is cleared", async () => {
    seedBaseAndLanguage();
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });
    const latinGroup = screen.getByLabelText("Latin characters (main)");
    fireEvent.click(within(latinGroup).getByRole("button", { name: "Hide Latin" }));
    expect(within(latinGroup).queryByRole("button", { name: /Add a \(U\+0061\)/ })).toBeNull();

    // Search for a cell that lives inside the hidden group.
    fireEvent.change(screen.getByLabelText("Search the character map"), { target: { value: "a" } });

    const latinGroupWhileSearching = screen.getByLabelText("Latin characters (main)");
    expect(
      within(latinGroupWhileSearching).getByRole("button", { name: /Add a \(U\+0061\)/ }),
    ).toBeTruthy();

    // Clear the query — the group returns to collapsed (hiddenGroups was
    // never cleared, only bypassed for the duration of the active query).
    fireEvent.change(screen.getByLabelText("Search the character map"), { target: { value: "" } });

    const latinGroupAfterClear = screen.getByLabelText("Latin characters (main)");
    expect(
      within(latinGroupAfterClear).queryByRole("button", { name: /Add a \(U\+0061\)/ }),
    ).toBeNull();
    expect(within(latinGroupAfterClear).getByRole("button", { name: "Show Latin" })).toBeTruthy();
  });

  it("pairs the Hide/Show button's aria-controls with the cell grid's id", async () => {
    seedBaseAndLanguage();
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });
    const latinGroup = screen.getByLabelText("Latin characters (main)");
    const hideButton = within(latinGroup).getByRole("button", { name: "Hide Latin" });
    const controlsId = hideButton.getAttribute("aria-controls");
    expect(controlsId).toBeTruthy();
    const grid = within(latinGroup).getByRole("group", { name: /click to toggle/i });
    expect(grid.getAttribute("id")).toBe(controlsId);
  });

  it("keeps aria-controls pointing at an element that exists while the group is collapsed (no dangling idref)", async () => {
    seedBaseAndLanguage();
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });
    const latinGroup = screen.getByLabelText("Latin characters (main)");
    const hideButton = within(latinGroup).getByRole("button", { name: "Hide Latin" });
    const controlsId = hideButton.getAttribute("aria-controls");
    expect(controlsId).toBeTruthy();

    fireEvent.click(hideButton);

    // Same aria-controls value persists across the collapse (the button
    // itself is unchanged, just relabelled to "Show").
    const showButton = within(latinGroup).getByRole("button", { name: "Show Latin" });
    expect(showButton.getAttribute("aria-controls")).toBe(controlsId);

    // The idref must resolve to a real element — the collapsed-state note,
    // not the (now unrendered) cell grid.
    const controlledElement = document.getElementById(controlsId as string);
    expect(controlledElement).not.toBeNull();
    expect(controlledElement?.textContent).toMatch(/characters hidden/i);
  });
});
