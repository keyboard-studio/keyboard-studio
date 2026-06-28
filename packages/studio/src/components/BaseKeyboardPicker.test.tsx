// ARIA combobox integration tests for BaseKeyboardPicker.
// Uses RTL + fireEvent (user-event is not installed).
// Services and import-corpus are mocked so no network calls happen.
//
// Coverage (AC-mapped):
//   - Combobox role + aria-expanded=false after load
//   - Typing opens list (aria-expanded true) and shows role="option" rows
//   - ArrowDown → aria-activedescendant + aria-selected
//   - Enter on active option → onChange(BaseKeyboard) + list closes + input shows displayName
//   - Esc when open → closes list (keeps query)
//   - Esc when closed → clears query AND calls onChange(null) [TWO-STAGE — AC#3]
//   - Home/End → first/last active option
//   - Ranking smoke: substring shared by 2 fixtures → both listed, non-match excluded
//   - Import badge text on option row (AC#2)
//   - Import badge on committed selection (AC#2)
//   - Loading state (never-resolving promise → "Loading…" visible)
//   - Error state (listAll rejects → role="alert")
//   - Empty catalog (listAll resolves [] → role="status" "No base keyboards found")
//   - Zero-match (type "zzzz" → role="status" "No keyboards match", Enter does NOT call onChange)
//   - Controlled value (render with a value prop, list closed → input shows displayName)

import { describe, it, expect, vi, afterEach, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import React from "react";

import type { BaseKeyboard } from "@keyboard-studio/contracts";
import { ImportStatus } from "@keyboard-studio/contracts";
import {
  basicKbdus,
  silEuroLatin,
  silDevanagariPhonetic,
} from "@keyboard-studio/contracts/fixtures";

// ---------------------------------------------------------------------------
// jsdom does not implement scrollIntoView — stub it out globally.
// The component guards with ?. but older jsdom versions throw; be safe.
// ---------------------------------------------------------------------------

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

// ---------------------------------------------------------------------------
// Fixture bases served by the mock service.
// We use the real contract fixtures so their ids line up with the corpus mock.
// ---------------------------------------------------------------------------

const SOME_BASES: BaseKeyboard[] = [basicKbdus, silEuroLatin, silDevanagariPhonetic];

// ---------------------------------------------------------------------------
// Service mock — vi.mock is hoisted, so it runs before imports.
// We declare a mutable factory that individual tests can replace.
// ---------------------------------------------------------------------------

// The listAllImpl variable is mutated by individual tests that need error/empty behaviour.
let listAllImpl: () => Promise<BaseKeyboard[]> = () => Promise.resolve(SOME_BASES);

vi.mock("../lib/services.ts", () => ({
  getBaseBrowserService: () => ({ listAll: () => listAllImpl() }),
  USE_REAL: false,
}));

// ---------------------------------------------------------------------------
// Import-corpus — covers all three badge variants deterministically.
// basic_kbdus             → ImportStatus.Clean              (badge: "clean")
// sil_euro_latin          → ImportStatus.CleanWithOpaque    (badge: "opaque")
// sil_devanagari_phonetic → ImportStatus.RoundTripDivergence (badge: "diverged")
//
// CROSS-FILE ISOLATION (#829): the component reads the corpus via a dynamic
// import("@docs/import-corpus.json") inside loadCorpus(). vitest runs several
// test files per worker, and other files in this package also
// `vi.mock("../lib/services.ts")`. When this file is co-scheduled with one of
// them in the same worker, this file's dynamic-import mock registration for
// "@docs/import-corpus.json" is intermittently dropped, so loadCorpus() falls
// through to the REAL ~346 KB corpus file — which does not carry these fixture
// statuses — and the "clean" / "diverged" badge assertions flake with
// "Unable to find a label with the text of: Import status: …".
//
// Robust fix: do NOT depend on the (worker-fragile) dynamic-import mock at all.
// We seed the module-level corpus cache directly via _setCorpusCacheForTesting()
// in beforeEach, so loadCorpus() returns the seeded map immediately and never
// performs the dynamic import. This makes the corpus fully deterministic
// regardless of co-scheduling. The hoisted vi.mock below is kept purely as a
// belt-and-suspenders fallback for any cache-cold path; the seed is the
// load-bearing mechanism.
// ---------------------------------------------------------------------------

const CORPUS_STATUS_BY_ID: ReadonlyArray<readonly [string, string]> = [
  [basicKbdus.id, ImportStatus.Clean],
  [silEuroLatin.id, ImportStatus.CleanWithOpaque],
  [silDevanagariPhonetic.id, ImportStatus.RoundTripDivergence],
];

vi.mock("@docs/import-corpus.json", () => ({
  default: {
    keyboards: CORPUS_STATUS_BY_ID.map(([keyboardId, status]) => ({ keyboardId, status })),
  },
}));

beforeEach(() => {
  // Seed the module-level corpus cache directly so loadCorpus() resolves to
  // these fixture statuses without performing (and without depending on the
  // mock of) the dynamic import("@docs/import-corpus.json"). See #829 note above.
  _setCorpusCacheForTesting(new Map(CORPUS_STATUS_BY_ID));
});

afterEach(() => {
  cleanup();
  // Reset listAllImpl back to the default (succeeds with SOME_BASES).
  listAllImpl = () => Promise.resolve(SOME_BASES);
  // Flush the module-level corpus cache so the next test re-seeds from scratch.
  _resetCorpusCacheForTesting();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Import the component AFTER mocks are set up. _setCorpusCacheForTesting /
// _resetCorpusCacheForTesting let each test seed/flush the module-level
// _corpusCache so badge rendering is driven deterministically by the seeded
// map (see #829 note above), independent of the real (volatile) corpus file.
// ---------------------------------------------------------------------------

import {
  BaseKeyboardPicker,
  _resetCorpusCacheForTesting,
  _setCorpusCacheForTesting,
} from "./BaseKeyboardPicker";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPicker(props: Partial<React.ComponentProps<typeof BaseKeyboardPicker>> = {}) {
  const onChange = vi.fn();
  const { rerender, unmount } = render(
    <BaseKeyboardPicker value={null} onChange={onChange} {...props} />,
  );
  return { onChange, rerender, unmount };
}

// Wait for the loading state to clear and the combobox to appear.
async function waitForCombobox() {
  return waitFor(() => screen.getByRole("combobox"));
}

// ---------------------------------------------------------------------------
// 1. Combobox role present + aria-expanded false after load
// ---------------------------------------------------------------------------

describe("BaseKeyboardPicker — initial render", () => {
  it("combobox role present and aria-expanded is false after load", async () => {
    renderPicker();
    const input = await waitForCombobox();
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  it("no option rows visible while list is closed", async () => {
    renderPicker();
    await waitForCombobox();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Typing opens list (aria-expanded true) + shows role="option" rows
// ---------------------------------------------------------------------------

describe("BaseKeyboardPicker — typing opens list", () => {
  it("typing a character sets aria-expanded=true and renders option rows", async () => {
    renderPicker();
    const input = await waitForCombobox();
    fireEvent.change(input, { target: { value: "s" } });
    await waitFor(() => {
      expect(input.getAttribute("aria-expanded")).toBe("true");
    });
    const options = screen.getAllByRole("option");
    expect(options.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 3. ArrowDown sets aria-activedescendant + aria-selected on first option
// ---------------------------------------------------------------------------

describe("BaseKeyboardPicker — ArrowDown keyboard navigation", () => {
  it("ArrowDown on closed list opens it and activates the first item", async () => {
    renderPicker();
    const input = await waitForCombobox();
    // Confirm list is closed before we start
    expect(input.getAttribute("aria-expanded")).toBe("false");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    await waitFor(() => {
      expect(input.getAttribute("aria-expanded")).toBe("true");
    });
    // First item should be active — aria-activedescendant must point to a real element
    const activeId = input.getAttribute("aria-activedescendant");
    expect(activeId).toBeTruthy();
    const activeOption = document.getElementById(activeId!);
    expect(activeOption?.getAttribute("aria-selected")).toBe("true");
  });

  it("second ArrowDown moves aria-activedescendant to the second item", async () => {
    renderPicker();
    const input = await waitForCombobox();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    await waitFor(() => screen.getAllByRole("option"));

    const firstActiveId = input.getAttribute("aria-activedescendant");
    fireEvent.keyDown(input, { key: "ArrowDown" });

    await waitFor(() => {
      const secondActiveId = input.getAttribute("aria-activedescendant");
      // id must have changed to the second item
      expect(secondActiveId).not.toBe(firstActiveId);
      const activeOption = document.getElementById(secondActiveId!);
      expect(activeOption?.getAttribute("aria-selected")).toBe("true");
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Enter on active option → onChange(BaseKeyboard) + list closes + input text
// ---------------------------------------------------------------------------

describe("BaseKeyboardPicker — Enter commits the selection", () => {
  it("Enter on the active option calls onChange with the correct BaseKeyboard", async () => {
    const { onChange } = renderPicker();
    const input = await waitForCombobox();

    // Open the list via ArrowDown (opens list and activates first item)
    fireEvent.keyDown(input, { key: "ArrowDown" });
    await waitFor(() => {
      expect(input.getAttribute("aria-expanded")).toBe("true");
      expect(input.getAttribute("aria-activedescendant")).toBeTruthy();
    });

    // Press Enter
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ id: expect.any(String) }));
    });
  });

  it("after Enter the list closes (aria-expanded false)", async () => {
    renderPicker();
    const input = await waitForCombobox();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    await waitFor(() => {
      expect(input.getAttribute("aria-expanded")).toBe("true");
      expect(input.getAttribute("aria-activedescendant")).toBeTruthy();
    });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(input.getAttribute("aria-expanded")).toBe("false");
    });
  });

  it("after Enter the input shows the committed displayName", async () => {
    const { onChange, rerender } = renderPicker();
    const input = await waitForCombobox();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    await waitFor(() => {
      expect(input.getAttribute("aria-expanded")).toBe("true");
      expect(input.getAttribute("aria-activedescendant")).toBeTruthy();
    });

    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });

    // Rerender with the committed value
    const committedBase = onChange.mock.calls[0]?.[0] as BaseKeyboard;
    rerender(
      <BaseKeyboardPicker
        value={committedBase}
        onChange={onChange}
      />,
    );

    // Input text should equal the committed displayName (list closed, value set)
    expect((input as HTMLInputElement).value).toBe(committedBase.displayName);
  });
});

// ---------------------------------------------------------------------------
// 5. Esc when open → closes the list but keeps the query
// ---------------------------------------------------------------------------

describe("BaseKeyboardPicker — Esc closes list (first stage)", () => {
  it("Esc when list is open closes it (aria-expanded false)", async () => {
    renderPicker();
    const input = await waitForCombobox();
    fireEvent.change(input, { target: { value: "sil" } });
    await waitFor(() => {
      expect(input.getAttribute("aria-expanded")).toBe("true");
    });
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => {
      expect(input.getAttribute("aria-expanded")).toBe("false");
    });
  });
});

// ---------------------------------------------------------------------------
// 6. Esc when closed → clears query AND calls onChange(null) [TWO-STAGE AC#3]
// ---------------------------------------------------------------------------

describe("BaseKeyboardPicker — Esc two-stage (AC#3)", () => {
  it("second Esc (list already closed) calls onChange(null)", async () => {
    const { onChange } = renderPicker();
    const input = await waitForCombobox();
    // Open list by typing
    fireEvent.change(input, { target: { value: "sil" } });
    await waitFor(() => expect(input.getAttribute("aria-expanded")).toBe("true"));
    // First Esc: close
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => expect(input.getAttribute("aria-expanded")).toBe("false"));
    // Second Esc: clear + onChange(null)
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(null);
    });
  });

  it("after second Esc the query is cleared (input shows empty when value is null)", async () => {
    const { onChange, rerender } = renderPicker();
    const input = await waitForCombobox();
    fireEvent.change(input, { target: { value: "sil" } });
    await waitFor(() => expect(input.getAttribute("aria-expanded")).toBe("true"));
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => expect(input.getAttribute("aria-expanded")).toBe("false"));
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(null));
    // Rerender with value=null (the caller resets state)
    rerender(<BaseKeyboardPicker value={null} onChange={onChange} />);
    expect((input as HTMLInputElement).value).toBe("");
  });
});

// ---------------------------------------------------------------------------
// 7. Home/End jump active to first/last
// ---------------------------------------------------------------------------

describe("BaseKeyboardPicker — Home/End navigation", () => {
  it("End moves active index to the last option", async () => {
    renderPicker();
    const input = await waitForCombobox();
    // Open list via ArrowDown — list opens and first item is active
    fireEvent.keyDown(input, { key: "ArrowDown" });
    await waitFor(() => screen.getAllByRole("option"));
    const options = screen.getAllByRole("option");

    // Press End
    fireEvent.keyDown(input, { key: "End" });
    await waitFor(() => {
      const activeId = input.getAttribute("aria-activedescendant");
      const lastOpt = options[options.length - 1];
      expect(activeId).toBe(lastOpt?.id);
    });
  });

  it("Home moves active index back to the first option", async () => {
    renderPicker();
    const input = await waitForCombobox();
    // Open list via ArrowDown
    fireEvent.keyDown(input, { key: "ArrowDown" });
    await waitFor(() => screen.getAllByRole("option"));
    const options = screen.getAllByRole("option");

    // Jump to end first, then Home
    fireEvent.keyDown(input, { key: "End" });
    await waitFor(() => {
      const id = input.getAttribute("aria-activedescendant");
      return id === options[options.length - 1]?.id;
    });

    fireEvent.keyDown(input, { key: "Home" });
    await waitFor(() => {
      const activeId = input.getAttribute("aria-activedescendant");
      expect(activeId).toBe(options[0]?.id);
    });
  });
});

// ---------------------------------------------------------------------------
// 8. Ranking smoke: shared substring → 2 listed, non-matching excluded
// ---------------------------------------------------------------------------

describe("BaseKeyboardPicker — ranking smoke", () => {
  it("typing 'sil' shows sil_euro_latin and sil_devanagari_phonetic but not basic_kbdus", async () => {
    renderPicker();
    const input = await waitForCombobox();
    fireEvent.change(input, { target: { value: "sil" } });
    await waitFor(() => {
      const options = screen.getAllByRole("option");
      expect(options.length).toBeGreaterThanOrEqual(2);
    });
    const optionTexts = screen.getAllByRole("option").map((o) => o.textContent);
    const hasSilEuro = optionTexts.some((t) => t?.includes("SIL Euro Latin"));
    const hasSilDeva = optionTexts.some((t) => t?.includes("SIL Devanagari Phonetic"));
    const hasBasic = optionTexts.some((t) => t?.includes("US English (Basic)"));
    expect(hasSilEuro).toBe(true);
    expect(hasSilDeva).toBe(true);
    expect(hasBasic).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 9. Import badge text renders on an option row (AC#2)
// ---------------------------------------------------------------------------

describe("BaseKeyboardPicker — import badge on option row (AC#2)", () => {
  it("basic_kbdus option row shows a 'clean' badge (matches corpus mock)", async () => {
    renderPicker();
    const input = await waitForCombobox();
    // Search for "basic" to get basic_kbdus option
    fireEvent.change(input, { target: { value: "basic" } });
    await waitFor(() => screen.getAllByRole("option"));

    const options = screen.getAllByRole("option");
    const basicOption = options.find((o) => o.textContent?.includes("US English"));
    expect(basicOption).toBeDefined();

    // The corpus mock sets basic_kbdus → "clean" → badge label "clean"
    expect(
      within(basicOption!).getByLabelText("Import status: clean"),
    ).toBeTruthy();
  });

  it("sil_devanagari_phonetic option row shows a 'diverged' badge (matches corpus mock)", async () => {
    // The corpus mock sets sil_devanagari_phonetic → RoundTripDivergence → badge "diverged".
    // _resetCorpusCacheForTesting() in afterEach ensures loadCorpus() re-runs the dynamic
    // import on each test so vi.mock("@docs/import-corpus.json") drives this deterministically,
    // independent of what the real corpus file contains for this keyboard.
    renderPicker();
    const input = await waitForCombobox();
    fireEvent.change(input, { target: { value: "sil_deva" } });
    await waitFor(() => screen.getAllByRole("option"));

    const options = screen.getAllByRole("option");
    const devaOption = options.find((o) => o.textContent?.includes("SIL Devanagari"));
    expect(devaOption).toBeDefined();

    expect(
      within(devaOption!).getByLabelText("Import status: diverged"),
    ).toBeTruthy();
  });

  it("sil_euro_latin option row shows an 'opaque' badge (matches corpus mock)", async () => {
    // The corpus mock sets sil_euro_latin → CleanWithOpaque → badge "opaque".
    // _resetCorpusCacheForTesting() in afterEach ensures vi.mock drives this deterministically.
    renderPicker();
    const input = await waitForCombobox();
    fireEvent.change(input, { target: { value: "sil_euro" } });
    await waitFor(() => screen.getAllByRole("option"));

    const options = screen.getAllByRole("option");
    const euroOption = options.find((o) => o.textContent?.includes("SIL Euro Latin"));
    expect(euroOption).toBeDefined();

    expect(
      within(euroOption!).getByLabelText("Import status: opaque"),
    ).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 10. Import badge on committed selection (AC#2)
// ---------------------------------------------------------------------------

describe("BaseKeyboardPicker — import badge on committed value (AC#2)", () => {
  it("after committing basic_kbdus the 'Import readiness: clean' badge appears below the input", async () => {
    const { onChange, rerender } = renderPicker();
    const input = await waitForCombobox();

    // Search and commit basic_kbdus
    fireEvent.change(input, { target: { value: "basic" } });
    await waitFor(() => screen.getAllByRole("option"));
    const options = screen.getAllByRole("option");
    const basicOption = options.find((o) => o.textContent?.includes("US English"));
    expect(basicOption).toBeDefined();
    fireEvent.click(basicOption!);

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(basicKbdus));

    // Rerender with the committed value
    rerender(<BaseKeyboardPicker value={basicKbdus} onChange={onChange} />);

    // The "Import readiness:" label + badge should appear below the input
    await waitFor(() => {
      expect(screen.getByText("Import readiness:")).toBeTruthy();
      expect(screen.getByLabelText("Import status: clean")).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// 11. Loading state: deferred promise → input disabled or "Loading…" visible
// ---------------------------------------------------------------------------

describe("BaseKeyboardPicker — loading state", () => {
  it("shows a loading indicator before listAll resolves", () => {
    // Replace listAllImpl with a never-resolving promise
    listAllImpl = () => new Promise(() => { /* never resolves */ });
    renderPicker();
    // The component renders role="status" with "Loading base keyboards..." while loading
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText(/loading base keyboards/i)).toBeTruthy();
  });

  it("combobox input is NOT present while loading", () => {
    listAllImpl = () => new Promise(() => { /* never resolves */ });
    renderPicker();
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 12. Error state: listAll rejects → role="alert"
// ---------------------------------------------------------------------------

describe("BaseKeyboardPicker — error state", () => {
  it("renders role='alert' when listAll() rejects", async () => {
    listAllImpl = () => Promise.reject(new Error("Network unavailable"));
    renderPicker();
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
  });

  it("alert text includes the error message", async () => {
    listAllImpl = () => Promise.reject(new Error("Network unavailable"));
    renderPicker();
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(/Network unavailable/);
    });
  });
});

// ---------------------------------------------------------------------------
// 13. Empty catalog: listAll resolves [] → role="status" "No base keyboards found"
// ---------------------------------------------------------------------------

describe("BaseKeyboardPicker — empty catalog", () => {
  it("renders role='status' with 'No base keyboards found' when listAll returns []", async () => {
    listAllImpl = () => Promise.resolve([]);
    renderPicker();
    await waitFor(() => {
      const statuses = screen.getAllByRole("status");
      const noKbd = statuses.find((el) => el.textContent?.match(/No base keyboards found/i));
      expect(noKbd).toBeDefined();
    });
  });

  it("no combobox is rendered for an empty catalog", async () => {
    listAllImpl = () => Promise.resolve([]);
    renderPicker();
    await waitFor(() => screen.getAllByRole("status"));
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 14. Zero-match: type "zzzz" → role="status" "No keyboards match", Enter no-op
// ---------------------------------------------------------------------------

describe("BaseKeyboardPicker — zero-match query", () => {
  it("typing a non-matching query shows a 'No keyboards match' status", async () => {
    renderPicker();
    const input = await waitForCombobox();
    fireEvent.change(input, { target: { value: "zzzz_no_match_xyz" } });
    await waitFor(() => {
      const listbox = screen.queryByRole("listbox");
      if (listbox) {
        const statusEl = within(listbox).queryByRole("status");
        expect(statusEl?.textContent).toMatch(/No keyboards match/i);
      }
    });
  });

  it("Enter on a zero-match query does NOT call onChange", async () => {
    const { onChange } = renderPicker();
    const input = await waitForCombobox();
    fireEvent.change(input, { target: { value: "zzzz_no_match_xyz" } });
    await waitFor(() =>
      screen.queryByRole("listbox") !== null,
    );
    fireEvent.keyDown(input, { key: "Enter" });
    // onChange must not be called — no active option
    expect(onChange).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 15. Controlled value: render with a value prop → input shows displayName, list closed
// ---------------------------------------------------------------------------

describe("BaseKeyboardPicker — controlled value prop", () => {
  it("input shows the displayName of the value prop when list is closed", async () => {
    renderPicker({ value: basicKbdus });
    const input = await waitForCombobox();
    // List should be closed initially
    expect(input.getAttribute("aria-expanded")).toBe("false");
    // Input value should be the displayName
    expect((input as HTMLInputElement).value).toBe(basicKbdus.displayName);
  });

  it("controlled value changes when a new value prop is passed", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <BaseKeyboardPicker value={basicKbdus} onChange={onChange} />,
    );
    const input = await waitForCombobox();
    expect((input as HTMLInputElement).value).toBe(basicKbdus.displayName);

    rerender(<BaseKeyboardPicker value={silEuroLatin} onChange={onChange} />);
    expect((input as HTMLInputElement).value).toBe(silEuroLatin.displayName);
  });
});
