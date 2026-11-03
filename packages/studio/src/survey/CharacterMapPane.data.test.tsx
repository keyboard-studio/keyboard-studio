// CharacterMapPane tests: data path, short-circuit, raw code point entry.
// Split from the former CharacterMapPane.test.tsx; shared fixtures live in
// ../test/characterMapPaneTestkit.ts.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import {
  CharacterMapPane,
} from "./CharacterMapPane.tsx";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { getCharacterInventoryValue, inventoryOps } from "../survey/useInventoryDraft.ts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { CharacterMapGroup } from "../lib/services.ts";
import { COMBINING_ACUTE, twoGroupFixture, TEST_BASE, seedIdentityDecisions, seedStartAndLanguage, seedStartProducing } from "../test/characterMapPaneTestkit.ts";

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
    _startIr: unknown,
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
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  getGroupsResult.set(twoGroupFixture());
  callCount.reset();
  unsupportedDisplays.set([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Data path — groups render with glyph + U+ notation, tier labels, and the
// combining-mark dotted-circle affordance.
// ---------------------------------------------------------------------------

describe("CharacterMapPane — data path", () => {
  it("renders both groups with their tier label after data loads", async () => {
    seedStartAndLanguage();
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });
    expect(screen.getByLabelText("Combining Diacritical Marks characters (loanwords)")).toBeTruthy();
  });

  it("renders a cell's glyph and U+ codepoint notation", async () => {
    seedStartAndLanguage();
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
    seedStartAndLanguage();
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
    seedStartAndLanguage();
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
    expect(getCharacterInventoryValue().chars).toContain("b");
    expect(bButton.getAttribute("aria-pressed")).toBe("true");

    // The unaffected "a" cell still renders its real glyph.
    const aButton = within(latinGroup).getByRole("button", { name: /Add a \(U\+0061\)/ });
    expect(aButton.textContent).toContain("a");
  });

  it("never boxes a combining-mark cell even when the font-support checker reports it unsupported (regression)", async () => {
    seedStartAndLanguage();
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

  it("announces a pane-level summary of the characters the selected font cannot preview", async () => {
    seedStartAndLanguage();
    unsupportedDisplays.set(["a", "b"]);
    render(<CharacterMapPane />);

    // The box placeholders are aria-hidden and the cell names do not carry
    // the unpreviewed state — the pane-level live-region summary is the
    // only place a screen-reader user learns these glyphs are not shown.
    await waitFor(() => {
      expect(screen.getByText("2 characters can't be previewed in the selected font")).toBeTruthy();
    });
  });

  it("preview summary counts only boxed cells: combining marks never count, and one reads singular", async () => {
    seedStartAndLanguage();
    // "a" boxes; the combining mark's dotted-circle display also reports
    // unsupported, but mark cells never take the box path (see the
    // regression test above), so the summary must not count it.
    unsupportedDisplays.set(["a", "◌" + COMBINING_ACUTE]);
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByText("1 character can't be previewed in the selected font")).toBeTruthy();
    });
    expect(screen.queryByText(/characters can't be previewed/)).toBeFalsy();
  });

  it("shows no preview summary when every rendered glyph previews", async () => {
    seedStartAndLanguage();
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });
    expect(screen.queryByText(/can't be previewed in the selected font/)).toBeFalsy();
  });

  it("clicking a cell toggles it into the draft store and flips aria-pressed", async () => {
    seedStartAndLanguage();
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });
    const latinGroup = screen.getByLabelText("Latin characters (main)");
    const aButton = within(latinGroup).getByRole("button", { name: /Add a \(U\+0061\)/ });

    expect(aButton.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(aButton);

    expect(getCharacterInventoryValue().chars).toContain("a");
    const aButtonAfter = within(latinGroup).getByRole("button", { name: /Remove a \(U\+0061\)/ });
    expect(aButtonAfter.getAttribute("aria-pressed")).toBe("true");

    // Click again — removes it.
    fireEvent.click(aButtonAfter);
    expect(getCharacterInventoryValue().chars).not.toContain("a");
    const aButtonFinal = within(latinGroup).getByRole("button", { name: /Add a \(U\+0061\)/ });
    expect(aButtonFinal.getAttribute("aria-pressed")).toBe("false");
  });

  // #1589/#1596 sibling: the screen-reader announcement must be one full
  // catalog sentence, not a translated action word spliced with raw char/
  // codepoint data via template literal outside any t()/Trans call.
  it("announces toggling a cell as one full catalog sentence, not an assembled fragment", async () => {
    seedStartAndLanguage();
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });
    const latinGroup = screen.getByLabelText("Latin characters (main)");
    const aButton = within(latinGroup).getByRole("button", { name: /Add a \(U\+0061\)/ });

    fireEvent.click(aButton);
    // Includes describeContribution's suffix — "a" is a plain base letter,
    // so this pick registers as an addedBases contribution.
    expect(screen.getByText("Added a (U+0061) — a added to Letters")).toBeTruthy();

    fireEvent.click(within(latinGroup).getByRole("button", { name: /Remove a \(U\+0061\)/ }));
    expect(screen.getByText("Removed a (U+0061)")).toBeTruthy();
  });

  it("hides uppercase letters of a cased script, showing only the lowercase (spec 047)", async () => {
    // The fold is gated on the base's casing facet: seed a base that
    // produces case pairs so its baked facet reads "cased".
    seedStartProducing(["a", "b"]);
    getGroupsResult.set([
      {
        block: "Latin",
        tier: "main",
        script: "Latn",
        usedByStart: false,
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
    // Pair picks sit behind the same casing-facet gate — seed a cased base.
    seedStartProducing(["a", "b"]);
    getGroupsResult.set([
      {
        block: "Latin",
        tier: "main",
        script: "Latn",
        usedByStart: false,
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
    expect(getCharacterInventoryValue().chars).toContain("a");
    expect(getCharacterInventoryValue().chars).toContain("A");
    // Clicking the now-selected cell removes both.
    fireEvent.click(within(group).getByRole("button", { name: /Remove a \(U\+0061\)/ }));
    expect(getCharacterInventoryValue().chars).not.toContain("a");
    expect(getCharacterInventoryValue().chars).not.toContain("A");
  });

  it("on a caseless base, uppercase cells are offered as-is and a pick adds only the picked char (casing facet gate)", async () => {
    // Base produces only Hebrew letters → its baked casing facet reads
    // "caseless", so the gate stays closed even for Latin cells in the map:
    // no fold hides the uppercase, and no pair joins on a pick.
    seedStartProducing(["א", "ב"], "he", "Hebrew");
    getGroupsResult.set([
      {
        block: "Latin",
        tier: "main",
        script: "Latn",
        usedByStart: false,
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
    // The uppercase is NOT folded away — it is offered as its own cell.
    const aUpper = within(group).queryByRole("button", { name: /Add A \(U\+0041\)/ });
    expect(aUpper).toBeTruthy();
    // Picking it adds exactly "A" — its lowercase is not auto-paired in.
    fireEvent.click(aUpper!);
    expect(getCharacterInventoryValue().chars).toEqual(["A"]);
  });

  it("tints base-keyboard output glyphs (with an accessible hint) until the author selects them", async () => {
    // Base produces "a" but not "b".
    seedStartProducing(["a"]);
    getGroupsResult.set([
      {
        block: "Latin",
        tier: "main",
        script: "Latn",
        usedByStart: false,
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
      screen.getByRole("button", { name: /Add a \(U\+0061\) — from your starting keyboard/ }),
    ).toBeTruthy();
    // "b" is not produced by the base → no hint.
    expect(
      screen.queryByRole("button", { name: /Add b \(U\+0062\) — from your starting keyboard/ }),
    ).toBeNull();
    // Selecting "a" clears the base tint/hint (it is now a chosen alphabet char).
    fireEvent.click(screen.getByRole("button", { name: /Add a \(U\+0061\) — from your starting keyboard/ }));
    expect(screen.queryByRole("button", { name: /from your starting keyboard/ })).toBeNull();
  });

  it("shows a loanword letter as selected, and clicking it removes it from the loanword list only", async () => {
    // The seeded loanword pair (q/Q) is removed as a pair by the map toggle —
    // pair behaviour sits behind the casing-facet gate, so seed a cased base.
    seedStartProducing(["a"]);
    getGroupsResult.set([
      {
        block: "Latin",
        tier: "main",
        script: "Latn",
        usedByStart: false,
        cells: [
          { char: "a", isCombiningMark: false },
          { char: "q", isCombiningMark: false },
        ],
      },
    ]);
    inventoryOps("characters").add("a");
    inventoryOps("characters").addLoanword("q");
    inventoryOps("characters").addLoanword("Q");
    render(<CharacterMapPane />);
    const qCell = await screen.findByRole("button", { name: /Remove q \(U\+0071\)/ });
    expect(qCell.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(qCell);
    expect(getCharacterInventoryValue().loanwordChars).toEqual([]);
    expect(getCharacterInventoryValue().chars).toEqual(["a"]);
  });

  it("shows only letters, numerals, and marks; excludes symbols and separators (spec 047)", async () => {
    seedStartAndLanguage();
    getGroupsResult.set([
      {
        block: "Mixed",
        tier: "main",
        script: "Latn",
        usedByStart: false,
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

  it("shows the dashed-outline base-output legend note when the base produces glyphs", async () => {
    seedStartProducing(["a"]);
    getGroupsResult.set([
      { block: "Latin", tier: "main", script: "Latn", usedByStart: false, cells: [{ char: "a", isCombiningMark: false }] },
    ]);
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(
        screen.getByText(/Characters with a dashed outline are on your starting keyboard/i),
      ).toBeTruthy();
    });
  });

  it("omits the base-output legend note when the base produces nothing", async () => {
    seedStartAndLanguage(); // makeTestIR([]) — empty produced set
    getGroupsResult.set([
      { block: "Latin", tier: "main", script: "Latn", usedByStart: false, cells: [{ char: "a", isCombiningMark: false }] },
    ]);
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });
    expect(
      screen.queryByText(/Characters with a dashed outline are on your starting keyboard/i),
    ).toBeNull();
  });

  it("a cell already present in the inventory chars renders aria-pressed=true on mount", async () => {
    seedStartAndLanguage();
    inventoryOps("characters").setAll(["b"]);
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
    // No instantiateFromStart call — startIr stays null (workingCopyStore default).
    seedIdentityDecisions("yo", "Yoruba");
    render(<CharacterMapPane />);

    expect(screen.getByText(/No verified character list for Yoruba/i)).toBeTruthy();
    expect(callCount.get()).toBe(0);
  });

  it("no bcp47_tag in context: renders the no-verified-list message and never calls characterMapGroups", () => {
    useWorkingCopyStore.getState().instantiateFromStart(TEST_BASE, {
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
    seedStartAndLanguage();
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });

    const input = screen.getByLabelText("Add a character by Unicode code point");
    fireEvent.change(input, { target: { value: "U+0041" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(getCharacterInventoryValue().chars).toContain("A");
    expect((input as HTMLInputElement).value).toBe("");
    // #1589/#1596 sibling: one full catalog sentence, not a translated
    // "Added" word spliced with raw char/codepoint data. Includes
    // describeContribution's suffix — "A" is a plain base letter.
    expect(screen.getByText("Added A (U+0041) — A added to Letters")).toBeTruthy();
  });

  it("accepts liberal hex forms (bare hex, lowercase u+) — canonical parser drops the 0x form", async () => {
    seedStartAndLanguage();
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });

    const input = screen.getByLabelText("Add a character by Unicode code point");
    const addButton = screen.getByRole("button", { name: "Add" });

    fireEvent.change(input, { target: { value: "u+0042" } });
    fireEvent.click(addButton);
    expect(getCharacterInventoryValue().chars).toContain("B");

    fireEvent.change(input, { target: { value: "0043" } });
    fireEvent.click(addButton);
    expect(getCharacterInventoryValue().chars).toContain("C");
  });

  it("rejects an out-of-range code point and shows an inline error without mutating the store", async () => {
    seedStartAndLanguage();
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });

    const input = screen.getByLabelText("Add a character by Unicode code point");
    fireEvent.change(input, { target: { value: "U+110000" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(/enter a valid code point/i)).toBeTruthy();
    expect(getCharacterInventoryValue().chars).toEqual([]);
  });

  it("rejects a surrogate-half code point", async () => {
    seedStartAndLanguage();
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });

    const input = screen.getByLabelText("Add a character by Unicode code point");
    fireEvent.change(input, { target: { value: "U+D800" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByText(/enter a valid code point/i)).toBeTruthy();
    expect(getCharacterInventoryValue().chars).toEqual([]);
  });

  it("rejects a noncharacter code point (plane-end and Arabic-presentation-forms range)", async () => {
    seedStartAndLanguage();
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });

    const input = screen.getByLabelText("Add a character by Unicode code point");
    const addButton = screen.getByRole("button", { name: "Add" });

    fireEvent.change(input, { target: { value: "U+FFFF" } });
    fireEvent.click(addButton);
    expect(screen.getByText(/enter a valid code point/i)).toBeTruthy();
    expect(getCharacterInventoryValue().chars).toEqual([]);

    fireEvent.change(input, { target: { value: "U+FDD0" } });
    fireEvent.click(addButton);
    expect(screen.getByText(/enter a valid code point/i)).toBeTruthy();
    expect(getCharacterInventoryValue().chars).toEqual([]);
  });

  it("allows a PUA code point after the role prompt (the escape hatch's whole point, spec 071 FR-004)", async () => {
    seedStartAndLanguage();
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });

    const input = screen.getByLabelText("Add a character by Unicode code point");
    fireEvent.change(input, { target: { value: "U+E000" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    // FR-004: nothing is added until the designer answers letter-or-mark.
    expect(getCharacterInventoryValue().chars).toEqual([]);
    expect(screen.getByTestId("pua-role-prompt")).toBeTruthy();
    fireEvent.click(screen.getByTestId("pua-role-letter"));

    expect(getCharacterInventoryValue().chars).toContain("\u{E000}");
    // #1589/#1596 sibling: this announcement was previously hardcoded
    // English with no t() call at all — now a real catalog sentence.
    expect(screen.getByText("Added \u{E000} (U+E000) as a letter")).toBeTruthy();
  });

  it("PUA answered 'mark' lands in the Marks store with a permanent declared role (US6 AC2)", async () => {
    seedStartAndLanguage();
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });

    const input = screen.getByLabelText("Add a character by Unicode code point");
    fireEvent.change(input, { target: { value: "U+E001" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByTestId("pua-role-mark"));

    const state = getCharacterInventoryValue();
    expect(state.marks).toContain("\u{E001}");
    expect(state.bases).not.toContain("\u{E001}");
    expect(state.declaredRoles["\u{E001}"]).toBe("mark");
    expect(screen.getByText("Added \u{E001} (U+E001) as a mark")).toBeTruthy();
  });

  it("PUA answered 'letter' lands in the Letters store and never in Marks (US6 AC3)", async () => {
    seedStartAndLanguage();
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });

    const input = screen.getByLabelText("Add a character by Unicode code point");
    fireEvent.change(input, { target: { value: "U+E002" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByTestId("pua-role-letter"));

    const state = getCharacterInventoryValue();
    expect(state.bases).toContain("\u{E002}");
    expect(state.marks).not.toContain("\u{E002}");
    expect(state.declaredRoles["\u{E002}"]).toBe("letter");
  });

  it("cancelling the PUA role prompt adds nothing", async () => {
    seedStartAndLanguage();
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });

    const input = screen.getByLabelText("Add a character by Unicode code point");
    fireEvent.change(input, { target: { value: "U+E003" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(getCharacterInventoryValue().chars).toEqual([]);
    expect(screen.queryByTestId("pua-role-prompt")).toBeNull();
  });

  it("clears a stale error as soon as the field is edited again", async () => {
    seedStartAndLanguage();
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
    seedStartAndLanguage();
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
