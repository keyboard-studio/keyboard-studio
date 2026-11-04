// CharacterMapPane tests: digits & punctuation tiers and the search filter.
// Split from the former CharacterMapPane.test.tsx; shared fixtures live in
// ../test/characterMapPaneTestkit.ts.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, fireEvent, cleanup, waitFor, within, act } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import {
  CharacterMapPane,
} from "./CharacterMapPane.tsx";
import type { CharacterMapGroup } from "../lib/services.ts";
import { COMBINING_ACUTE, twoGroupFixture, seedIdentityDecisions, seedStartAndLanguage } from "../test/characterMapPaneTestkit.ts";

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
// New tiers — digits & punctuation (engine's parallel-track extension).
// ---------------------------------------------------------------------------

describe("CharacterMapPane — digits & punctuation tiers", () => {
  it("renders the digits tier; punctuation/symbols are not shown on this page (spec 047)", async () => {
    seedStartAndLanguage();
    getGroupsResult.set([
      {
        block: "Digits",
        tier: "digits",
        script: "Common",
        usedByStart: false,
        cells: [{ char: "0", isCombiningMark: false }],
      },
      {
        block: "Punctuation",
        tier: "punctuation",
        script: "Common",
        usedByStart: false,
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

// The three "Search by:" checkboxes live inside the "Search filters"
// disclosure (closed by default) — open it before interacting with any of
// them, mirroring how a real user would reach the panel.
function openSearchFilters(): void {
  fireEvent.click(screen.getByRole("button", { name: "Search filters" }));
}

describe("CharacterMapPane — search filter", () => {
  it("filters cells by substring match, dropping groups with zero surviving cells", async () => {
    seedStartAndLanguage();
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
    seedStartAndLanguage();
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
    seedStartAndLanguage();
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });

    getGroupsResult.set([
      {
        block: "Combining Diacritical Marks",
        tier: "auxiliary",
        script: "Latn",
        usedByStart: false,
        cells: [{ char: COMBINING_ACUTE, isCombiningMark: true, name: "COMBINING ACUTE ACCENT" }],
      },
    ]);
    act(() => {
      seedIdentityDecisions("yo", "Yoruba2");
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
    seedStartAndLanguage();
    getGroupsResult.set([
      {
        block: "Basic Latin",
        tier: "main",
        script: "Latn",
        usedByStart: false,
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

  it("unchecking the Unicode value filter stops codepoint matches", async () => {
    seedStartAndLanguage();
    getGroupsResult.set([
      {
        block: "Basic Latin",
        tier: "main",
        script: "Latn",
        usedByStart: false,
        cells: [{ char: "a", isCombiningMark: false }], // U+0061
      },
    ]);
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Basic Latin characters (main)")).toBeTruthy();
    });
    const searchInput = screen.getByLabelText("Search the character map");
    fireEvent.change(searchInput, { target: { value: "0061" } });
    expect(screen.getByLabelText("Basic Latin characters (main)")).toBeTruthy();

    openSearchFilters();
    fireEvent.click(screen.getByLabelText("Search by Unicode value"));
    expect(
      screen.queryByText('No characters match "0061".'),
    ).toBeTruthy();
  });

  it("unchecking the Character filter stops glyph matches while a Name match still surfaces the same cell", async () => {
    seedStartAndLanguage();
    getGroupsResult.set([
      {
        block: "Latin",
        tier: "main",
        script: "Latn",
        usedByStart: false,
        cells: [{ char: "ø", isCombiningMark: false, name: "LATIN SMALL LETTER O WITH STROKE" }],
      },
    ]);
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });
    const searchInput = screen.getByLabelText("Search the character map");

    // Before unchecking: a raw-glyph query matches via the Character filter's
    // GLYPH mode (the cell's name is plain ASCII, so this isn't a Name-mode
    // coincidence).
    fireEvent.change(searchInput, { target: { value: "ø" } });
    expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();

    openSearchFilters();
    fireEvent.click(screen.getByLabelText("Search by character"));
    expect(screen.queryByText('No characters match "ø".')).toBeTruthy();

    // The Name filter is untouched — a name-substring query for the very
    // same cell still matches, proving "Character" gates glyph/base-letter
    // matching specifically, not search as a whole.
    fireEvent.change(searchInput, { target: { value: "stroke" } });
    expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
  });

  it("unchecking the Name filter stops name-substring matches while a Character (glyph) match still surfaces the same cell", async () => {
    seedStartAndLanguage();
    getGroupsResult.set([
      {
        block: "Latin",
        tier: "main",
        script: "Latn",
        usedByStart: false,
        cells: [{ char: "ø", isCombiningMark: false, name: "LATIN SMALL LETTER O WITH STROKE" }],
      },
    ]);
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });
    const searchInput = screen.getByLabelText("Search the character map");

    fireEvent.change(searchInput, { target: { value: "stroke" } });
    expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();

    openSearchFilters();
    fireEvent.click(screen.getByLabelText("Search by name"));
    expect(screen.queryByText('No characters match "stroke".')).toBeTruthy();

    // The Character filter is untouched — a raw-glyph query for the very
    // same cell still matches.
    fireEvent.change(searchInput, { target: { value: "ø" } });
    expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
  });

  it("a language/base change resets the search filter checkboxes back to all-checked", async () => {
    seedStartAndLanguage();
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });

    openSearchFilters();
    const characterCheckbox = screen.getByLabelText("Search by character") as HTMLInputElement;
    const nameCheckbox = screen.getByLabelText("Search by name") as HTMLInputElement;

    fireEvent.click(characterCheckbox);
    fireEvent.click(nameCheckbox);
    expect(characterCheckbox.checked).toBe(false);
    expect(nameCheckbox.checked).toBe(false);

    // Drive a language change the same way the hiddenGroups-reset test does
    // (act + setSurveyContext) — this re-triggers the fetch effect, which
    // resets searchFilters to ALL_FILTERS (and closes the filters panel).
    act(() => {
      seedIdentityDecisions("fr", "French");
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });
    openSearchFilters();
    expect(screen.getByLabelText("Search by character")).toHaveProperty("checked", true);
    expect(screen.getByLabelText("Search by name")).toHaveProperty("checked", true);
    expect(screen.getByLabelText("Search by Unicode value")).toHaveProperty("checked", true);
  });

  it("matches by base letter — 'o' finds o, an accented o, and a non-decomposing o-variant", async () => {
    seedStartAndLanguage();
    getGroupsResult.set([
      {
        block: "Latin",
        tier: "main",
        script: "Latn",
        usedByStart: false,
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

  // -------------------------------------------------------------------------
  // P0 regression — "the search bar does nothing". Reproduction: click into
  // the search box the way a real user would (focus, then type), and
  // separately, drive the search filters into an all-unchecked state and
  // confirm the pane refuses to reach it (see CharacterMapPane.tsx's
  // handleToggleSearchFilter doc comment for the root-cause writeup).
  // -------------------------------------------------------------------------

  it("a real user click-then-type into the search box narrows the grid (regression coverage for the reported 'search bar does nothing' bug)", async () => {
    seedStartAndLanguage();
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });

    const searchInput = screen.getByLabelText("Search the character map");
    fireEvent.click(searchInput);
    fireEvent.focus(searchInput);
    // Real typing is a sequence of incremental value changes, not one bulk
    // paste-like fireEvent.change — append one character at a time.
    let typed = "";
    for (const ch of "a") {
      typed += ch;
      fireEvent.input(searchInput, { target: { value: typed } });
    }

    expect((searchInput as HTMLInputElement).value).toBe("a");
    const latinGroup = screen.getByLabelText("Latin characters (main)");
    expect(within(latinGroup).queryByRole("button", { name: /a \(U\+0061\)/ })).toBeTruthy();
    expect(within(latinGroup).queryByRole("button", { name: /b \(U\+0062\)/ })).toBeNull();
  });

  it("refuses to uncheck the last remaining search filter — at least one field stays selected, so a query never silently matches nothing", async () => {
    seedStartAndLanguage();
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });

    openSearchFilters();
    const characterCheckbox = screen.getByLabelText("Search by character") as HTMLInputElement;
    const nameCheckbox = screen.getByLabelText("Search by name") as HTMLInputElement;
    const unicodeCheckbox = screen.getByLabelText("Search by Unicode value") as HTMLInputElement;

    fireEvent.click(characterCheckbox);
    fireEvent.click(nameCheckbox);
    // Two down, one (codepoint) left checked — this attempt to uncheck the
    // last one must be refused.
    fireEvent.click(unicodeCheckbox);

    expect(unicodeCheckbox.checked).toBe(true);
    expect(screen.getByText("At least one search field must stay selected.")).toBeTruthy();

    // A query that only the (still-active) codepoint mode can match still
    // works — proving search wasn't silently disabled.
    fireEvent.change(screen.getByLabelText("Search the character map"), { target: { value: "0061" } });
    expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // "Search filters" disclosure (TASK 2) — dropdown trigger + popover replacing
  // the always-visible "Search by:" row.
  // -------------------------------------------------------------------------

  it("the filter checkboxes are not present until the 'Search filters' trigger is opened", async () => {
    seedStartAndLanguage();
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });

    expect(screen.queryByLabelText("Search by character")).toBeNull();
    const trigger = screen.getByRole("button", { name: "Search filters" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-haspopup")).toBe("true");

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByLabelText("Search by character")).toBeTruthy();
    const panel = screen.getByRole("group", { name: "Search by:" });
    expect(trigger.getAttribute("aria-controls")).toBe(panel.getAttribute("id"));
  });

  it("Escape closes the filters panel and returns focus to the trigger", async () => {
    seedStartAndLanguage();
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });

    const trigger = screen.getByRole("button", { name: "Search filters" });
    fireEvent.click(trigger);
    const characterCheckbox = screen.getByLabelText("Search by character");

    fireEvent.keyDown(characterCheckbox, { key: "Escape" });

    expect(screen.queryByLabelText("Search by character")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("a pointerdown outside the trigger and panel closes the filters popover", async () => {
    seedStartAndLanguage();
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Search filters" }));
    expect(screen.getByLabelText("Search by character")).toBeTruthy();

    fireEvent.pointerDown(document.body);

    expect(screen.queryByLabelText("Search by character")).toBeNull();
  });

  it("toggling a checkbox inside the open panel keeps it open", async () => {
    seedStartAndLanguage();
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });

    openSearchFilters();
    fireEvent.click(screen.getByLabelText("Search by name"));
    expect(screen.getByLabelText("Search by character")).toBeTruthy();
    expect((screen.getByLabelText("Search by name") as HTMLInputElement).checked).toBe(false);
  });
});
