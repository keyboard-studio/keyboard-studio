// Tests for the character map's hover/focus info popover
// (keyboard-studio#1783).
//
// Strategy (mirrors CharacterMapPane.test.tsx):
//   - characterMapGroups is mocked via vi.mock("../lib/services.ts").
//   - The Unicode table loader (./characterMap/unicodeTable.ts) is mocked
//     with a tiny stub table — the popover path under test is
//     describeCharacter (the REAL engine helper) + the hook + the pane
//     wiring; the real 1.5 MB table never loads in jsdom.
//   - baseIr/bcp47/languageName come from the real workingCopyStore /
//     surveySessionStore singletons, seeded directly.
//
// What is pinned here:
//   - focus opens the popover with name, per-codepoint names, readable
//     category + code, combining/standalone status, script, block;
//   - Escape dismisses without moving focus (and the cell stays shut while
//     hovered/focused — the NEXT cell reopens it);
//   - hoverable: moving the pointer onto the popover keeps it open; leaving
//     both closes it (no close timers);
//   - moving focus from a cell to neutral space inside the pane closes it
//     (only the active cell and the popover count as interactive);
//   - exactly one popover instance per pane; no per-cell tooltip DOM;
//   - the table loads lazily (not on pane mount) and only once (cached).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, fireEvent, cleanup, waitFor, within, act } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { CharacterMapPane } from "./CharacterMapPane.tsx";
import { resetUnicodeTableForTests } from "./characterMap/unicodeTable.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { CharacterMapGroup } from "../lib/services.ts";

// ---------------------------------------------------------------------------
// vi.hoisted fixtures
// ---------------------------------------------------------------------------

const { getGroupsResult, loadCalls, unsupportedDisplays } = vi.hoisted(() => {
  let _result: CharacterMapGroup[] = [];
  let _calls = 0;
  let _unsupported = new Set<string>();
  return {
    getGroupsResult: {
      get: () => _result,
      set: (v: CharacterMapGroup[]) => {
        _result = v;
      },
    },
    loadCalls: {
      get: () => _calls,
      reset: () => {
        _calls = 0;
      },
      bump: () => {
        _calls += 1;
      },
    },
    unsupportedDisplays: {
      set: (displays: string[]) => {
        _unsupported = new Set(displays);
      },
      has: (display: string) => _unsupported.has(display),
    },
  };
});

// Stub Unicode table: just enough rows for the fixture cells. Script comes
// from the REAL runtime ICU probes inside describeCharacter (a -> Latin,
// U+0301 -> Inherited, Devanagari chars -> Devanagari).
const STUB_NAMES: Record<number, string> = {
  0x61: "LATIN SMALL LETTER A",
  0x62: "LATIN SMALL LETTER B",
  0x301: "COMBINING ACUTE ACCENT",
  0x915: "DEVANAGARI LETTER KA",
  0x94d: "DEVANAGARI SIGN VIRAMA",
  0x937: "DEVANAGARI LETTER SSA",
};
const STUB_CATEGORIES: Record<number, string> = {
  0x61: "Ll",
  0x62: "Ll",
  0x301: "Mn",
  0x915: "Lo",
  0x94d: "Mn",
  0x937: "Lo",
};
const STUB_CCC: Record<number, number> = {
  0x61: 0,
  0x62: 0,
  0x301: 230,
  0x915: 0,
  0x94d: 9,
  0x937: 0,
};

vi.mock("./characterMap/unicodeTable.ts", () => {
  // Mirrors the real loader's contract: a cached promise — the dynamic
  // import runs once no matter how many cells activate. loadCalls counts
  // IMPORTS, not activations.
  let cached: Promise<unknown> | null = null;
  return {
    loadUnicodeTable: () => {
      if (cached === null) {
        loadCalls.bump();
        cached = Promise.resolve({
          getName: (cp: number) => STUB_NAMES[cp],
          getCategory: (cp: number) => STUB_CATEGORIES[cp],
          getCCC: (cp: number) => STUB_CCC[cp] ?? 0,
        });
      }
      return cached;
    },
    resetUnicodeTableForTests: () => {
      cached = null;
    },
  };
});

vi.mock("../lib/services.ts", () => ({
  USE_REAL: false,
  characterMapGroups: async () => getGroupsResult.get(),
}));

vi.mock("./useFontSupportChecker.ts", () => ({
  useFontSupportChecker: (_fontStack: string) => (display: string) =>
    !unsupportedDisplays.has(display),
}));

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const COMBINING_ACUTE = "́"; // U+0301
const KSSA = "क्ष"; // U+0915 U+094D U+0937 — multi-codepoint NFC grapheme

function fixture(): CharacterMapGroup[] {
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
    {
      block: "Devanagari",
      tier: "auxiliary",
      script: "Deva",
      usedByBase: false,
      cells: [{ char: KSSA, isCombiningMark: false }],
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
  useSurveySessionStore
    .getState()
    .setSurveyContext({ bcp47_tag: bcp47, language_name: languageName });
}

beforeEach(() => {
  getGroupsResult.set(fixture());
  loadCalls.reset();
  resetUnicodeTableForTests();
  unsupportedDisplays.set([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function renderPaneAndGetCell(
  groupLabel: string,
  namePattern: RegExp,
): Promise<HTMLElement> {
  seedBaseAndLanguage();
  render(<CharacterMapPane />);
  await waitFor(() => {
    expect(screen.getByLabelText(groupLabel)).toBeTruthy();
  });
  const group = screen.getByLabelText(groupLabel);
  return within(group).getByRole("button", { name: namePattern });
}

function popover(): HTMLElement {
  return screen.getByTestId("char-info-popover");
}

/**
 * Dispatch a bubbling pointerout with a real relatedTarget. jsdom's
 * PointerEvent constructor drops relatedTarget from its init dict, so this
 * sends a MouseEvent typed as pointerout instead — React keys its
 * pointerout/pointerleave synthesis off the type string, and the MouseEvent
 * init (which jsdom honors) carries relatedTarget.
 */
function dispatchPointerOut(target: Element, relatedTarget: Element | null): void {
  // Wrapped in act(): unlike fireEvent, a raw dispatchEvent does not flush
  // React's batched state updates before the next assertion.
  act(() => {
    target.dispatchEvent(new MouseEvent("pointerout", { bubbles: true, relatedTarget }));
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CharacterInfoPopover", () => {
  it("is a single instance per pane and adds no DOM nodes per cell", async () => {
    await renderPaneAndGetCell("Latin characters (main)", /Add a \(U\+0061\)/);

    expect(screen.getAllByTestId("char-info-popover")).toHaveLength(1);

    const cellButtons = document.querySelectorAll("button[data-char]");
    expect(cellButtons.length).toBeGreaterThan(0);
    for (const button of cellButtons) {
      // Unchanged cell DOM: glyph span + codepoint span + indicator span.
      expect(button.childElementCount).toBe(3);
      expect(button.querySelector("[role='tooltip']")).toBeNull();
      // No per-cell handlers — the popover reads these attributes instead.
      expect(button.getAttribute("data-char")).toBeTruthy();
    }
  });

  it("opens on keyboard focus with name, category, spacing, script, block", async () => {
    const aButton = await renderPaneAndGetCell(
      "Latin characters (main)",
      /Add a \(U\+0061\)/,
    );

    fireEvent.focus(aButton);

    const pop = popover();
    expect(pop.hidden).toBe(false);
    await waitFor(() => {
      expect(pop.textContent).toContain("LATIN SMALL LETTER A");
    });
    expect(pop.textContent).toContain("Lowercase letter (Ll)");
    expect(pop.textContent).toContain("Stands alone");
    expect(pop.textContent).toContain("Latin"); // script
    expect(pop.textContent).toContain("Latin"); // block (group block)
    expect(aButton.getAttribute("aria-describedby")).toBe("char-info-popover");
  });

  it("Escape dismisses without moving focus; the cell stays shut until the pointer moves on", async () => {
    const aButton = await renderPaneAndGetCell(
      "Latin characters (main)",
      /Add a \(U\+0061\)/,
    );
    // Native focus (not fireEvent.focus): the test asserts focus is NOT
    // moved by Escape, so focus must genuinely be on the cell first.
    act(() => {
      aButton.focus();
    });
    await waitFor(() => {
      expect(popover().hidden).toBe(false);
    });

    fireEvent.keyDown(aButton, { key: "Escape" });

    expect(popover().hidden).toBe(true);
    expect(document.activeElement).toBe(aButton);

    // Re-hovering the SAME cell does not reopen it (dismissed gate).
    fireEvent.pointerOver(aButton);
    expect(popover().hidden).toBe(true);

    // The NEXT cell reopens it.
    const bButton = within(screen.getByLabelText("Latin characters (main)")).getByRole(
      "button",
      { name: /Add b \(U\+0062\)/ },
    );
    fireEvent.pointerOver(bButton);
    await waitFor(() => {
      expect(popover().hidden).toBe(false);
    });
    await waitFor(() => {
      expect(popover().textContent).toContain("LATIN SMALL LETTER B");
    });
  });

  it("is hoverable and persistent: pointer can move onto it; leaving both closes it", async () => {
    const aButton = await renderPaneAndGetCell(
      "Latin characters (main)",
      /Add a \(U\+0061\)/,
    );

    fireEvent.pointerOver(aButton);
    const pop = popover();
    await waitFor(() => {
      expect(pop.hidden).toBe(false);
    });

    // Pointer moves from the cell onto the popover: stays open (hoverable).
    dispatchPointerOut(aButton, pop);
    expect(popover().hidden).toBe(false);

    // Pointer leaves the popover to neutral ground: closes (persistent only
    // while the cell or the popover is hovered).
    dispatchPointerOut(pop, document.body);
    expect(popover().hidden).toBe(true);
  });

  it("moves the popover when the pointer goes from one cell to another", async () => {
    // Two cells in the fixture Latin group: a, b. Render once, grab both.
    seedBaseAndLanguage();
    render(<CharacterMapPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Latin characters (main)")).toBeTruthy();
    });
    const latin = screen.getByLabelText("Latin characters (main)");
    const aButton = within(latin).getByRole("button", { name: /Add a \(U\+0061\)/ });
    const bButton = within(latin).getByRole("button", { name: /Add b \(U\+0062\)/ });

    fireEvent.pointerOver(aButton);
    const pop = popover();
    await waitFor(() => {
      expect(pop.textContent).toContain("LATIN SMALL LETTER A");
    });

    // Pointer moves from cell a to cell b: the popover follows.
    dispatchPointerOut(aButton, bButton);
    fireEvent.pointerOver(bButton);
    await waitFor(() => {
      expect(popover().textContent).toContain("LATIN SMALL LETTER B");
    });
  });

  it("describes a combining mark as combining with its category and combining class", async () => {
    const markButton = await renderPaneAndGetCell(
      "Combining Diacritical Marks characters (loanwords)",
      /Add ́ \(U\+0301\)/,
    );

    fireEvent.focus(markButton);

    const pop = popover();
    await waitFor(() => {
      expect(pop.textContent).toContain("COMBINING ACUTE ACCENT");
    });
    expect(pop.textContent).toContain("Nonspacing mark (Mn)");
    expect(pop.textContent).toContain("Combines with the preceding character");
    expect(pop.textContent).toContain("Inherited"); // script via ICU
    expect(pop.textContent).toContain("Combining Diacritical Marks"); // block
    expect(pop.textContent).toContain("230"); // canonical combining class
  });

  it("closes when focus moves from a cell to neutral space inside the pane", async () => {
    const aButton = await renderPaneAndGetCell(
      "Latin characters (main)",
      /Add a \(U\+0061\)/,
    );
    // The group wrapper: inside the scroll container, but neither a cell
    // nor the popover — neutral space.
    const group = screen.getByLabelText("Latin characters (main)");

    fireEvent.focus(aButton);
    const pop = popover();
    await waitFor(() => {
      expect(pop.hidden).toBe(false);
    });

    // Regression: insideInteractive used to treat the whole scroll
    // container as interactive, so moving to blank space inside the pane
    // wrongly left the popover open.
    fireEvent.focusOut(aButton, { relatedTarget: group });
    expect(popover().hidden).toBe(true);
  });

  it("shows Script_Extensions only where they add something", async () => {
    // U+0301: Script=Inherited, scx lists the scripts the mark is used
    // with — the "Also used in" row appears.
    const markButton = await renderPaneAndGetCell(
      "Combining Diacritical Marks characters (loanwords)",
      /Add ́ \(U\+0301\)/,
    );
    fireEvent.focus(markButton);
    const pop = popover();
    await waitFor(() => {
      expect(pop.textContent).toContain("COMBINING ACUTE ACCENT");
    });
    expect(pop.textContent).toContain("Also used in");
    expect(pop.textContent).toContain("Latin");
    cleanup();

    // U+0061: scx is exactly {Latin} — nothing beyond Script, no row.
    const aButton = await renderPaneAndGetCell(
      "Latin characters (main)",
      /Add a \(U\+0061\)/,
    );
    fireEvent.focus(aButton);
    const pop2 = popover();
    await waitFor(() => {
      expect(pop2.textContent).toContain("LATIN SMALL LETTER A");
    });
    expect(pop2.textContent).not.toContain("Also used in");
  });

  it("lists every code point with its name for a multi-codepoint grapheme", async () => {
    const kssaButton = await renderPaneAndGetCell(
      "Devanagari characters (loanwords)",
      /Add क्ष/,
    );

    fireEvent.focus(kssaButton);

    const pop = popover();
    await waitFor(() => {
      expect(pop.textContent).toContain("U+0915");
    });
    expect(pop.textContent).toContain("DEVANAGARI LETTER KA");
    expect(pop.textContent).toContain("U+094D");
    expect(pop.textContent).toContain("DEVANAGARI SIGN VIRAMA");
    expect(pop.textContent).toContain("U+0937");
    expect(pop.textContent).toContain("DEVANAGARI LETTER SSA");
    expect(pop.textContent).toContain("Devanagari"); // script
    expect(pop.textContent).toContain("Devanagari"); // block
  });

  it("loads the Unicode table lazily and caches it across cells", async () => {
    const aButton = await renderPaneAndGetCell(
      "Latin characters (main)",
      /Add a \(U\+0061\)/,
    );

    // Pane rendered with cells on screen: no table load yet.
    expect(loadCalls.get()).toBe(0);

    fireEvent.focus(aButton);
    await waitFor(() => {
      expect(loadCalls.get()).toBe(1);
    });
    await waitFor(() => {
      expect(popover().textContent).toContain("LATIN SMALL LETTER A");
    });

    // A second cell reuses the cached module — no second import.
    const bButton = within(screen.getByLabelText("Latin characters (main)")).getByRole(
      "button",
      { name: /Add b \(U\+0062\)/ },
    );
    fireEvent.focus(bButton);
    await waitFor(() => {
      expect(popover().textContent).toContain("LATIN SMALL LETTER B");
    });
    expect(loadCalls.get()).toBe(1);
  });

  it("closes the popover when its cell is toggled", async () => {
    const aButton = await renderPaneAndGetCell(
      "Latin characters (main)",
      /Add a \(U\+0061\)/,
    );
    fireEvent.focus(aButton);
    await waitFor(() => {
      expect(popover().hidden).toBe(false);
    });

    fireEvent.click(aButton);

    expect(popover().hidden).toBe(true);
  });
});
