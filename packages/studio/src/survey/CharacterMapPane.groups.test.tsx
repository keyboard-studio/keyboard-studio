// CharacterMapPane tests: per-group render cap, blocks filter, Hide/Show, zoom.
// Split from the former CharacterMapPane.test.tsx; shared fixtures live in
// ../test/characterMapPaneTestkit.ts.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, fireEvent, cleanup, waitFor, within, act } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import {
  CharacterMapPane,
  MAX_CELLS_PER_GROUP,
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_STEP,
  zoomPercent,
} from "./CharacterMapPane.tsx";
import { getCharacterInventoryValue } from "../survey/useInventoryDraft.ts";
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
    seedStartAndLanguage();
    getGroupsResult.set([
      { block: "Synthetic", tier: "main", script: "Latn", usedByStart: false, cells: syntheticCells(TEST_CAP) },
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
    seedStartAndLanguage();
    const over = TEST_CAP + 5;
    getGroupsResult.set([
      { block: "Synthetic", tier: "main", script: "Latn", usedByStart: false, cells: syntheticCells(over) },
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
// narrows the grid to only the groups the engine tagged usedByStart: true
// (the Unicode blocks the base keyboard actually produces, via
// producedGlyphs — see packages/engine/.../characterMap.ts), with the
// "auto-unhide" mechanism: any group already represented in the author's
// accumulating alphabet is shown too, so adding a character from a hidden
// block unhides that whole block even while the checkbox stays checked. The
// checkbox itself only renders once we actually know the base's blocks (at
// least one loaded group is usedByStart: true) — otherwise the filter would
// be meaningless, so every group shows.
// ---------------------------------------------------------------------------

function blocksFixture(): CharacterMapGroup[] {
  return [
    {
      block: "Latin",
      tier: "main",
      script: "Latn",
      usedByStart: true,
      cells: [{ char: "a", isCombiningMark: false }],
    },
    {
      block: "Combining Diacritical Marks",
      tier: "auxiliary",
      script: "Latn",
      usedByStart: true,
      cells: [{ char: COMBINING_ACUTE, isCombiningMark: true }],
    },
    {
      block: "Greek",
      tier: "block",
      script: "Grek",
      usedByStart: false,
      cells: [{ char: "α", isCombiningMark: false, name: "GREEK SMALL LETTER ALPHA" }],
    },
  ];
}

describe("CharacterMapPane — blocks-my-keyboard-uses filter", () => {
  it("is checked by default; shows usedByBase groups, hides the non-used Greek group", async () => {
    seedStartAndLanguage();
    getGroupsResult.set(blocksFixture());
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });
    const checkbox = screen.getByRole("checkbox", { name: "Show only blocks my keyboard uses" });
    expect((checkbox as HTMLInputElement).checked).toBe(true);

    // usedByStart groups show...
    expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    expect(
      screen.getByLabelText("Combining Diacritical Marks characters (loanwords)"),
    ).toBeTruthy();
    // ...but the non-used Greek group is hidden.
    expect(screen.queryByLabelText("Greek characters")).toBeNull();
  });

  it("unchecking shows all groups, including the previously-hidden Greek group", async () => {
    seedStartAndLanguage();
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
    seedStartAndLanguage();
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
    expect(getCharacterInventoryValue().chars).toContain("α");
  });

  it("search is whole-set: finds a hidden-block character even while the box is checked", async () => {
    seedStartAndLanguage();
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
    seedStartAndLanguage();
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
    seedStartAndLanguage();
    getGroupsResult.set([
      { block: "Latin", tier: "main", script: "Latn", usedByStart: false, cells: [{ char: "a", isCombiningMark: false }] },
      { block: "Greek", tier: "block", script: "Grek", usedByStart: false, cells: [{ char: "α", isCombiningMark: false }] },
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
    // group is usedByStart, so the filter is inactive (checkbox hidden) and
    // both render without needing to be toggled.
    seedStartAndLanguage();
    getGroupsResult.set([
      // Two caseless-script letters (Greek α is lowercase; Devanagari क is
      // caseless) so neither is removed by the uppercase fold (spec 047).
      { block: "Letters", tier: "block", script: "Grek", usedByStart: false, cells: [{ char: "α", isCombiningMark: false }] },
      { block: "Letters", tier: "block", script: "Deva", usedByStart: false, cells: [{ char: "क", isCombiningMark: false }] },
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
    seedStartAndLanguage();
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
    seedStartAndLanguage();
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
    seedStartAndLanguage();
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
    seedStartAndLanguage();
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
    seedStartAndLanguage();
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
    seedStartAndLanguage();
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
      seedIdentityDecisions("fr", "French");
    });

    await waitFor(() => {
      const refreshedGroup = screen.getByLabelText("Latin characters (main)");
      expect(within(refreshedGroup).queryByRole("button", { name: /Add a \(U\+0061\)/ })).toBeTruthy();
    });
  });

  it("search bypasses a per-group Hide: a matching cell in a hidden group still renders while the query is active, and the group re-collapses once the query is cleared", async () => {
    seedStartAndLanguage();
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
    seedStartAndLanguage();
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
    seedStartAndLanguage();
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

// ---------------------------------------------------------------------------
// Zoom control — scales the rendered chip glyphs (and the chip cells around
// them) via the +/- toolbar. Threaded through surveyStyles.ts's `scale`
// params (charChip/chipGlyph/chipGlyphMissingBox/chipCodepoint) so the
// flex-wrap grid reflows naturally, rather than a CSS transform on the
// scrollable container.
// ---------------------------------------------------------------------------

describe("CharacterMapPane — zoom control", () => {
  it("defaults to 100% and renders the glyph at fontSize 22 (unchanged from pre-zoom)", async () => {
    seedStartAndLanguage();
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });
    expect(screen.getByTestId("char-map-zoom-level").textContent).toBe("100%");

    const latinGroup = screen.getByLabelText("Latin characters (main)");
    const aButton = within(latinGroup).getByRole("button", { name: /Add a \(U\+0061\)/ });
    const glyphSpan = aButton.querySelector("span") as HTMLElement;
    expect(glyphSpan.style.fontSize).toBe("22px");
  });

  it("clicking + increases the rendered glyph font-size and updates the zoom indicator", async () => {
    seedStartAndLanguage();
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));

    expect(screen.getByTestId("char-map-zoom-level").textContent).toBe("125%");
    const latinGroup = screen.getByLabelText("Latin characters (main)");
    const aButton = within(latinGroup).getByRole("button", { name: /Add a \(U\+0061\)/ });
    const glyphSpan = aButton.querySelector("span") as HTMLElement;
    expect(glyphSpan.style.fontSize).toBe("27.5px");
  });

  it("clicking − decreases the rendered glyph font-size and updates the zoom indicator", async () => {
    seedStartAndLanguage();
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));

    // One ZOOM_STEP down from the 100% default happens to land exactly on
    // ZOOM_MIN (1 - ZOOM_STEP === ZOOM_MIN at the current constants).
    expect(screen.getByTestId("char-map-zoom-level").textContent).toBe(`${zoomPercent(ZOOM_MIN)}%`);
    const latinGroup = screen.getByLabelText("Latin characters (main)");
    const aButton = within(latinGroup).getByRole("button", { name: /Add a \(U\+0061\)/ });
    const glyphSpan = aButton.querySelector("span") as HTMLElement;
    expect(glyphSpan.style.fontSize).toBe("16.5px");
  });

  it("disables − at the minimum zoom and re-enables it after zooming back in", async () => {
    seedStartAndLanguage();
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });

    const minPercent = `${zoomPercent(ZOOM_MIN)}%`;
    const zoomOut = screen.getByRole("button", { name: "Zoom out" }) as HTMLButtonElement;
    expect(zoomOut.disabled).toBe(false);

    fireEvent.click(zoomOut); // 100% -> ZOOM_MIN
    expect(screen.getByTestId("char-map-zoom-level").textContent).toBe(minPercent);
    expect(zoomOut.disabled).toBe(true);

    // A further click while disabled must not move past the clamp.
    fireEvent.click(zoomOut);
    expect(screen.getByTestId("char-map-zoom-level").textContent).toBe(minPercent);

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(zoomOut.disabled).toBe(false);
  });

  it("disables + at the maximum zoom", async () => {
    seedStartAndLanguage();
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });

    const maxPercent = `${zoomPercent(ZOOM_MAX)}%`;
    // Number of ZOOM_STEP clicks needed to walk from the 100% default up to
    // ZOOM_MAX, derived from the exported constants rather than hardcoded.
    const stepsToMax = Math.ceil((ZOOM_MAX - 1) / ZOOM_STEP);
    const zoomIn = screen.getByRole("button", { name: "Zoom in" }) as HTMLButtonElement;
    for (let i = 0; i < stepsToMax; i++) {
      fireEvent.click(zoomIn);
    }
    expect(screen.getByTestId("char-map-zoom-level").textContent).toBe(maxPercent);
    expect(zoomIn.disabled).toBe(true);

    // A further click while disabled must not move past the clamp.
    fireEvent.click(zoomIn);
    expect(screen.getByTestId("char-map-zoom-level").textContent).toBe(maxPercent);
  });

  it("moves focus to the zoom-in button when zoom-out hits ZOOM_MIN, and vice versa (clamp-boundary focus management)", async () => {
    seedStartAndLanguage();
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });

    const zoomOut = screen.getByRole("button", { name: "Zoom out" }) as HTMLButtonElement;
    const zoomIn = screen.getByRole("button", { name: "Zoom in" }) as HTMLButtonElement;

    zoomOut.focus();
    expect(document.activeElement).toBe(zoomOut);
    fireEvent.click(zoomOut); // 100% -> ZOOM_MIN; zoomOut is about to disable
    expect(zoomOut.disabled).toBe(true);
    expect(document.activeElement).toBe(zoomIn);

    // Walk back up to ZOOM_MAX — the last click disables zoomIn, so focus
    // must land back on zoomOut.
    const stepsToMax = Math.ceil((ZOOM_MAX - ZOOM_MIN) / ZOOM_STEP);
    for (let i = 0; i < stepsToMax; i++) {
      fireEvent.click(zoomIn);
    }
    expect(zoomIn.disabled).toBe(true);
    expect(document.activeElement).toBe(zoomOut);
  });

  it("announces the new zoom level via the shared aria-live region", async () => {
    seedStartAndLanguage();
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByText("Zoom 125%")).toBeTruthy();
  });

  it("scales the codepoint label and the missing-glyph box fallback alongside the glyph", async () => {
    seedStartAndLanguage();
    unsupportedDisplays.set(["b"]);
    render(<CharacterMapPane />);

    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });
    const latinGroup = screen.getByLabelText("Latin characters (main)");

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" })); // 125%

    const aButton = within(latinGroup).getByRole("button", { name: /Add a \(U\+0061\)/ });
    const codepointSpan = aButton.querySelectorAll("span")[1] as HTMLElement;
    expect(codepointSpan.style.fontSize).toBe("11.25px"); // 9 * 1.25

    const bButton = within(latinGroup).getByRole("button", { name: /Add b \(U\+0062\)/ });
    const boxSpan = bButton.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(boxSpan.style.width).toBe("17.5px"); // 14 * 1.25
    expect(boxSpan.style.height).toBe("30px"); // 24 * 1.25
  });
});
