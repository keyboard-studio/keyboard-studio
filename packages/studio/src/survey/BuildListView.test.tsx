// Tests for PhaseB BuildListView, SuggestionPanel, CharChipEditor, and parseSpacedChars.
//
// Strategy:
//   - parseSpacedChars: exported pure function, tested directly.
//   - BuildListView / SuggestionPanel: tested through the exported PhaseB component.
//     The IntroChooser renders first with "build-list" pre-selected; clicking
//     "Continue" transitions to BuildListView.
//   - suggestMissingChars is mocked via vi.mock("../lib/services.ts") so no
//     network or CLDR calls occur.
//   - useWorkingCopyStore is seeded directly before each test that needs a baseIr.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act, cleanup, waitFor } from "@testing-library/react";
import { PhaseB, parseSpacedChars } from "./PhaseB.tsx";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { SurveyPhaseResult, IRGroup, IRRule } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// vi.hoisted — mutable reference shared across all mock factories.
// ---------------------------------------------------------------------------

const { getSuggestResult } = vi.hoisted(() => {
  let _result: import("../lib/services.ts").MissingCharSuggestions | null = null;
  return {
    getSuggestResult: {
      get: () => _result,
      set: (v: import("../lib/services.ts").MissingCharSuggestions | null) => { _result = v; },
    },
  };
});

// ---------------------------------------------------------------------------
// Mock services — controls suggestMissingChars return value deterministically.
// ---------------------------------------------------------------------------

vi.mock("../lib/services.ts", () => ({
  USE_REAL: false,
  suggestMissingChars: async (
    _bcp47: string,
    _baseIr: unknown,
    _languageName?: string,
  ) => getSuggestResult.get(),
}));

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeGroup(rules: IRRule[], name = "main"): IRGroup {
  return { nodeId: `group#${name}`, name, usingKeys: true, readonly: false, rules };
}

function makeRule(output: IRRule["output"]): IRRule {
  return {
    nodeId: `rule#${Math.random().toString(36).slice(2)}`,
    context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
    output,
  };
}

/** A minimal KeyboardIR that produces a known set of characters. */
function irProducing(chars: string[]) {
  const rules = chars.map((c) =>
    makeRule([{ kind: "char", value: c.normalize("NFC") }]),
  );
  return makeTestIR([makeGroup(rules)]);
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
  getSuggestResult.set(null);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  useWorkingCopyStore.getState().reset();
});

// ---------------------------------------------------------------------------
// Helper: navigate from IntroChooser to BuildListView.
// The IntroChooser pre-selects "build-list"; clicking Continue transitions.
// ---------------------------------------------------------------------------

async function renderBuildListView(
  context: Record<string, string> = {},
  onComplete: (r: SurveyPhaseResult) => void = vi.fn(),
  onBack: () => void = vi.fn(),
) {
  render(<PhaseB context={context} onComplete={onComplete} onBack={onBack} />);
  // IntroChooser is shown first; "build-list" is pre-selected.
  const continueBtn = screen.getByRole("button", { name: /continue/i });
  await act(async () => {
    fireEvent.click(continueBtn);
  });
}

// ---------------------------------------------------------------------------
// 1. parseSpacedChars — exported pure function
// ---------------------------------------------------------------------------

describe("parseSpacedChars", () => {
  it("splits on whitespace and returns NFC-normalized tokens", () => {
    expect(parseSpacedChars("a b c")).toEqual(["a", "b", "c"]);
  });

  it("deduplicates tokens (first-wins)", () => {
    // a b c a → a appears twice; result has one a
    expect(parseSpacedChars("a b c a")).toEqual(["a", "b", "c"]);
  });

  it("drops empty tokens from leading/trailing/multiple spaces", () => {
    const result = parseSpacedChars("  a  b  ");
    expect(result).toEqual(["a", "b"]);
  });

  it("NFC-normalizes: decomposed a+combining-acute → precomposed a-acute", () => {
    const decomposed = "á"; // a + combining acute
    const result = parseSpacedChars(decomposed);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("á"); // a-acute precomposed
  });

  it("returns empty array for empty string", () => {
    expect(parseSpacedChars("")).toEqual([]);
  });

  it("returns empty array for whitespace-only string", () => {
    expect(parseSpacedChars("   ")).toEqual([]);
  });

  it("preserves non-ASCII characters", () => {
    const result = parseSpacedChars("a ẹ ọ"); // a ẹ ọ
    expect(result).toContain("a");
    expect(result).toContain("ẹ"); // ẹ
    expect(result).toContain("ọ"); // ọ
  });
});

// ---------------------------------------------------------------------------
// 2. SuggestionPanel — null suggestMissingChars (or no bcp47_tag)
// ---------------------------------------------------------------------------

describe("SuggestionPanel — null / no verified data", () => {
  it("shows neutral note when suggestMissingChars returns null and baseIr is set", async () => {
    // Seed a non-null baseIr so the panel doesn't bail on the no-baseIr guard.
    useWorkingCopyStore.getState().instantiateFromBase(
      {
        id: "test_kb",
        path: "release/t/test_kb",
        script: "Latn",
        targets: ["windows"],
        displayName: "Test",
        version: "1.0",
      },
      { vfs: { files: new Map() }, ir: irProducing([]) },
    );
    // suggestMissingChars returns null (already set by beforeEach).
    await renderBuildListView({ bcp47_tag: "yo" });
    // Wait for the async effect to settle.
    await waitFor(() => { expect(screen.getByText(/No verified character list/i)).toBeTruthy(); });
    // No suggestion chip group should be rendered.
    expect(
      screen.queryByRole("group", {
        name: /Suggested main characters/i,
      }),
    ).toBeNull();
  });

  it("shows neutral note when no bcp47_tag is in context", async () => {
    await renderBuildListView({}); // no bcp47_tag
    // With no bcp47, the panel guard fires synchronously.
    expect(screen.getByText(/No verified character list/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 3. SuggestionPanel — data path: main chips render unchecked; toggling adds char
// ---------------------------------------------------------------------------

describe("SuggestionPanel — data path with main suggestions", () => {
  beforeEach(() => {
    // Seed a non-null baseIr.
    useWorkingCopyStore.getState().instantiateFromBase(
      {
        id: "test_kb",
        path: "release/t/test_kb",
        script: "Latn",
        targets: ["windows"],
        displayName: "Test",
        version: "1.0",
      },
      { vfs: { files: new Map() }, ir: irProducing([]) },
    );
    // suggestMissingChars returns two main chars, no auxiliary.
    getSuggestResult.set({
      bcp47: "yo",
      main: ["ẹ", "ọ"], // ẹ ọ
      auxiliary: [],
    });
  });

  it("renders main suggestion chips after data loads", async () => {
    await renderBuildListView({ bcp47_tag: "yo" });
    await waitFor(() => {
      expect(screen.queryByRole("group", { name: /Suggested main characters/i })).not.toBeNull();
    });
    const chipGroup = screen.getByRole("group", { name: /Suggested main characters/i });
    expect(chipGroup.querySelectorAll("button").length).toBe(2);
  });

  it("main chips start in unchecked state (aria-pressed=false)", async () => {
    await renderBuildListView({ bcp47_tag: "yo" });
    await waitFor(() => {
      expect(screen.queryByRole("group", { name: /Suggested main characters/i })).not.toBeNull();
    });
    const chipGroup = screen.getByRole("group", { name: /Suggested main characters/i });
    for (const btn of Array.from(chipGroup.querySelectorAll("button"))) {
      expect(btn.getAttribute("aria-pressed")).toBe("false");
    }
  });

  it("clicking a suggestion chip adds it to the alphabet and marks it checked", async () => {
    await renderBuildListView({ bcp47_tag: "yo" });
    await waitFor(() => {
      expect(screen.queryByRole("group", { name: /Suggested main characters/i })).not.toBeNull();
    });
    const chipGroup = screen.getByRole("group", { name: /Suggested main characters/i });
    const firstChip = chipGroup.querySelectorAll("button")[0]!;
    await act(async () => {
      fireEvent.click(firstChip);
    });
    // After clicking, the chip should be pressed.
    expect(firstChip.getAttribute("aria-pressed")).toBe("true");
    // The Done button should reflect 1 character.
    expect(screen.getByRole("button", { name: /Done/i }).textContent).toMatch(/1 character/);
  });
});

// ---------------------------------------------------------------------------
// 4. Auxiliary tier collapsed by default; expanding reveals chips
// ---------------------------------------------------------------------------

describe("SuggestionPanel — auxiliary tier expand/collapse", () => {
  beforeEach(() => {
    useWorkingCopyStore.getState().instantiateFromBase(
      {
        id: "test_kb",
        path: "release/t/test_kb",
        script: "Latn",
        targets: ["windows"],
        displayName: "Test",
        version: "1.0",
      },
      { vfs: { files: new Map() }, ir: irProducing([]) },
    );
    getSuggestResult.set({
      bcp47: "yo",
      main: ["ẹ"], // ẹ
      auxiliary: ["ü"], // ü
    });
  });

  it("auxiliary chip group is NOT visible initially (collapsed)", async () => {
    await renderBuildListView({ bcp47_tag: "yo" });
    await waitFor(() => {
      expect(screen.queryByRole("group", { name: /Suggested main characters/i })).not.toBeNull();
    });
    // The auxiliary group should not be rendered yet.
    expect(
      screen.queryByRole("group", { name: /Suggested auxiliary characters/i }),
    ).toBeNull();
  });

  it("clicking the loanword toggle reveals auxiliary chips", async () => {
    await renderBuildListView({ bcp47_tag: "yo" });
    await waitFor(() => {
      expect(screen.queryByRole("group", { name: /Suggested main characters/i })).not.toBeNull();
    });
    const toggle = screen.getByRole("button", { name: /loanwords/i });
    await act(async () => {
      fireEvent.click(toggle);
    });
    // Now auxiliary group should be visible.
    expect(
      screen.queryByRole("group", { name: /Suggested auxiliary characters/i }),
    ).not.toBeNull();
  });

  it("auxiliary toggle has aria-expanded=false before click, true after", async () => {
    await renderBuildListView({ bcp47_tag: "yo" });
    await waitFor(() => {
      expect(screen.queryByRole("group", { name: /Suggested main characters/i })).not.toBeNull();
    });
    const toggle = screen.getByRole("button", { name: /loanwords/i });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });
});

// ---------------------------------------------------------------------------
// 5. Empty main+auxiliary — "already covers" message
// ---------------------------------------------------------------------------

describe("SuggestionPanel — empty main and auxiliary (base covers all)", () => {
  it("renders the 'already covers' message when both arrays are empty", async () => {
    useWorkingCopyStore.getState().instantiateFromBase(
      {
        id: "test_kb",
        path: "release/t/test_kb",
        script: "Latn",
        targets: ["windows"],
        displayName: "Test",
        version: "1.0",
      },
      { vfs: { files: new Map() }, ir: irProducing([]) },
    );
    getSuggestResult.set({
      bcp47: "yo",
      main: [],
      auxiliary: [],
    });
    await renderBuildListView({ bcp47_tag: "yo" });
    await waitFor(() => {
      expect(
        screen.queryByText(/already covers this language/i),
      ).not.toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// 6. CharChipEditor: typing + add accumulates chips; removing works
// ---------------------------------------------------------------------------

describe("CharChipEditor", () => {
  it("typing a character and clicking Add appends a chip", async () => {
    await renderBuildListView({});
    const input = screen.getByRole("textbox", { name: /Character to add/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "ẹ" } }); // ẹ
    });
    const addBtn = screen.getByRole("button", { name: /\+ Add/i });
    await act(async () => {
      fireEvent.click(addBtn);
    });
    // The alphabet counter heading should show 1 character.
    expect(screen.getByText(/Your alphabet \(1\)/i)).toBeTruthy();
  });

  it("pressing Enter in the input also adds the character", async () => {
    await renderBuildListView({});
    const input = screen.getByRole("textbox", { name: /Character to add/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "ọ" } }); // ọ
    });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    });
    expect(screen.getByText(/Your alphabet \(1\)/i)).toBeTruthy();
  });

  it("adding the same character twice only stores it once (dedup)", async () => {
    await renderBuildListView({});
    const input = screen.getByRole("textbox", { name: /Character to add/i });
    // Add ẹ twice.
    await act(async () => {
      fireEvent.change(input, { target: { value: "ẹ" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /\+ Add/i }));
    });
    await act(async () => {
      fireEvent.change(input, { target: { value: "ẹ" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /\+ Add/i }));
    });
    expect(screen.getByText(/Your alphabet \(1\)/i)).toBeTruthy();
  });

  it("clicking a chip button removes it from the alphabet", async () => {
    await renderBuildListView({});
    const input = screen.getByRole("textbox", { name: /Character to add/i });
    // Add one character.
    await act(async () => {
      fireEvent.change(input, { target: { value: "ẹ" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /\+ Add/i }));
    });
    expect(screen.getByText(/Your alphabet \(1\)/i)).toBeTruthy();
    // Find the remove button for ẹ — aria-label is "Remove ẹ (U+1EB9)".
    const removeBtn = screen.getByRole("button", {
      name: "Remove ẹ (U+1EB9)",
    });
    await act(async () => {
      fireEvent.click(removeBtn);
    });
    // Alphabet should be empty again.
    expect(screen.getByText(/Your alphabet \(0\)/i)).toBeTruthy();
  });

  it("Add button is disabled when input is empty", async () => {
    await renderBuildListView({});
    const addBtn = screen.getByRole("button", { name: /\+ Add/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. End-to-end: suggestion tick + typed char → onComplete with deduped NFC union
// ---------------------------------------------------------------------------

describe("BuildListView — end-to-end onComplete", () => {
  it("Done fires onComplete with NFC-normalized, deduped union of ticked + typed chars", async () => {
    useWorkingCopyStore.getState().instantiateFromBase(
      {
        id: "test_kb",
        path: "release/t/test_kb",
        script: "Latn",
        targets: ["windows"],
        displayName: "Test",
        version: "1.0",
      },
      { vfs: { files: new Map() }, ir: irProducing([]) },
    );
    // suggestMissingChars returns one main char ẹ and one aux ü
    getSuggestResult.set({
      bcp47: "yo",
      main: ["ẹ"], // ẹ
      auxiliary: ["ü"], // ü
    });
    const onComplete = vi.fn<[SurveyPhaseResult], void>();
    render(
      <PhaseB
        context={{ bcp47_tag: "yo" }}
        onComplete={onComplete}
      />,
    );
    // Navigate to BuildListView.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    });

    // Wait for CLDR suggestions to load.
    await waitFor(() => {
      expect(screen.queryByRole("group", { name: /Suggested main characters/i })).not.toBeNull();
    });

    // Tick the ẹ suggestion chip.
    const chipGroup = screen.getByRole("group", { name: /Suggested main characters/i });
    const chip = chipGroup.querySelectorAll("button")[0]!;
    await act(async () => {
      fireEvent.click(chip);
    });

    // Type an additional character (ọ).
    const input = screen.getByRole("textbox", { name: /Character to add/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "ọ" } }); // ọ
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /\+ Add/i }));
    });

    // Type ẹ again — should deduplicate.
    await act(async () => {
      fireEvent.change(input, { target: { value: "ẹ" } }); // ẹ (duplicate)
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /\+ Add/i }));
    });

    // Click Done.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Done/i }));
    });

    expect(onComplete).toHaveBeenCalledOnce();
    const result = onComplete.mock.calls[0]![0];
    expect(result.phase).toBe("B");

    const inv = result.confirmedInventory ?? [];
    // Must contain both ẹ and ọ exactly once each.
    expect(inv.filter((c) => c === "ẹ")).toHaveLength(1); // ẹ appears once
    expect(inv.filter((c) => c === "ọ")).toHaveLength(1); // ọ appears once
    // All entries must be NFC.
    for (const c of inv) {
      expect(c).toBe(c.normalize("NFC"));
    }
    // No duplicates.
    expect(new Set(inv).size).toBe(inv.length);
  });
});

// ---------------------------------------------------------------------------
// 8. Back button returns to IntroChooser
// ---------------------------------------------------------------------------

describe("BuildListView — Back navigation", () => {
  it("clicking Back shows the IntroChooser again", async () => {
    await renderBuildListView({});
    // We should be in BuildListView now.
    expect(screen.queryByText(/Phase B — Build your character list/i)).not.toBeNull();
    // Find and click the Back button in BuildListView.
    const backBtn = screen.getByRole("button", { name: /^Back$/i });
    await act(async () => {
      fireEvent.click(backBtn);
    });
    // IntroChooser should be visible again.
    expect(screen.queryByText(/Phase B — Character discovery/i)).not.toBeNull();
  });
});
