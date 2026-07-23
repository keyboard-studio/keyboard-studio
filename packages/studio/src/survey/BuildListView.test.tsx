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
import { screen, fireEvent, act, cleanup, waitFor } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { PhaseB, parseSpacedChars } from "./PhaseB.tsx";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { usePhaseBDraftStore } from "../stores/phaseBDraftStore.ts";
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
  // discoveryMethod (surveySessionStore) and the draft alphabet
  // (phaseBDraftStore) are now module-level singletons shared across every
  // <PhaseB> mount (spec character-map pane work) rather than PhaseB-local
  // useState — reset both so each test starts at the IntroChooser with an
  // empty alphabet, matching the old per-mount-fresh behavior.
  useSurveySessionStore.getState().reset();
  usePhaseBDraftStore.getState().reset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
  usePhaseBDraftStore.getState().reset();
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

describe("BuildListView — whole-alphabet instructions", () => {
  it("shows the instruction callout with the space-separated example", async () => {
    await renderBuildListView({});
    // Callout: whole-alphabet wording + explicit spacing instruction.
    expect(
      screen.getByText(/every\s+character your language uses, not just the special ones/i),
    ).toBeTruthy();
    // The spaced example line.
    expect(screen.getByText("a b c d e ɛ ŋ ɔ …")).toBeTruthy();
    // Type-in section repeats the spacing instruction.
    expect(
      screen.getByText(/putting a space between each\s+character/i),
    ).toBeTruthy();
  });
});

describe("BuildListView — Back navigation", () => {
  it("clicking Back shows the IntroChooser again", async () => {
    await renderBuildListView({});
    // We should be in BuildListView now.
    expect(screen.queryByText(/Phase B — Add your whole alphabet/i)).not.toBeNull();
    // Find and click the Back button in BuildListView.
    const backBtn = screen.getByRole("button", { name: /^Back$/i });
    await act(async () => {
      fireEvent.click(backBtn);
    });
    // IntroChooser should be visible again.
    expect(screen.queryByText(/Phase B — Character discovery/i)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AlphabetBreakdown — visible three-store decomposition (spec 046, US5)
// ---------------------------------------------------------------------------

describe("AlphabetBreakdown — visible decomposition (spec 046)", () => {
  const ACUTE = "́";

  it("does not render while the alphabet has no marks and no accented letters", async () => {
    await renderBuildListView();
    act(() => {
      usePhaseBDraftStore.getState().add("a");
    });
    expect(screen.queryByTestId("alphabet-marks")).toBeNull();
    expect(screen.queryByTestId("alphabet-accented")).toBeNull();
  });

  it("a precomposed pick populates Letters, Marks, and Accented letters visibly", async () => {
    await renderBuildListView();
    act(() => {
      usePhaseBDraftStore.getState().add("é");
    });
    const letters = screen.getByTestId("alphabet-letters");
    const marks = screen.getByTestId("alphabet-marks");
    const accented = screen.getByTestId("alphabet-accented");
    expect(letters.textContent).toContain("e");
    expect(marks.textContent).toContain("U+0301");
    expect(accented.textContent).toContain("é");
  });

  it("marks the just-added base and mark as new (US5 AC2)", async () => {
    await renderBuildListView();
    act(() => {
      usePhaseBDraftStore.getState().add("é");
    });
    const justAdded = screen.getAllByLabelText(/just added/);
    const labels = justAdded.map((el) => el.getAttribute("aria-label") ?? "");
    expect(labels.some((l) => l.includes("U+0065"))).toBe(true); // base e
    expect(labels.some((l) => l.includes("U+0301"))).toBe(true); // combining acute
  });

  it("a lone combining-mark pick renders in Marks on a dotted-circle carrier", async () => {
    await renderBuildListView();
    act(() => {
      usePhaseBDraftStore.getState().add(ACUTE);
    });
    const marks = screen.getByTestId("alphabet-marks");
    expect(marks.textContent).toContain("◌");
  });

  it("orders the Marks section by raw code point, not ICU (spec 047 refinement)", async () => {
    await renderBuildListView();
    const BREVE = "̆"; // U+0306
    const CIRCUMFLEX = "̂"; // U+0302
    // Entered breve-first; code-point order must still list U+0302 before U+0306.
    act(() => {
      usePhaseBDraftStore.getState().setAll([BREVE, CIRCUMFLEX]);
    });
    const marks = screen.getByTestId("alphabet-marks").textContent ?? "";
    expect(marks.indexOf("U+0302")).toBeLessThan(marks.indexOf("U+0306"));
  });
});

// ---------------------------------------------------------------------------
// US1 — whole-text capture (spec 047, FR-001/002/003)
// ---------------------------------------------------------------------------

describe("US1 — whole-text capture (spec 047)", () => {
  it("pasting a sentence captures every distinct non-whitespace character (AS1.1/SC-001)", async () => {
    await renderBuildListView({});
    const input = screen.getByRole("textbox", { name: /Character to add/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "Naïve? Yes — 3 times." } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /\+ Add/i }));
    });
    const { chars } = usePhaseBDraftStore.getState();
    // Entered uppercase (N, Y) is folded to lowercase in the alphabet — we never
    // store a capital without its lowercase (both cases reach the IR on Done).
    for (const ch of ["n", "a", "ï", "v", "e", "?", "y", "s", "—", "3", "t", "i", "m", "."]) {
      expect(chars).toContain(ch);
    }
    // The uppercase forms themselves are not stored (folded to lowercase).
    expect(chars).not.toContain("N");
    expect(chars).not.toContain("Y");
    // Ordinary space is never captured (SC-006).
    expect(chars).not.toContain(" ");
  });

  it("typing characters with no spaces captures each one (AS1.2)", async () => {
    await renderBuildListView({});
    const input = screen.getByRole("textbox", { name: /Character to add/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "ab4." } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /\+ Add/i }));
    });
    expect(usePhaseBDraftStore.getState().chars).toEqual(
      expect.arrayContaining(["a", "b", "4", "."]),
    );
  });

  it("a whitespace-only paste adds nothing (edge case)", async () => {
    await renderBuildListView({});
    const input = screen.getByRole("textbox", { name: /Character to add/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "   \t " } });
    });
    // The Add button is disabled for whitespace-only input; nothing is captured.
    expect((screen.getByRole("button", { name: /\+ Add/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(usePhaseBDraftStore.getState().chars).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// US2 — category breakdown sections (spec 047, FR-004/005/006/007)
// ---------------------------------------------------------------------------

describe("US2 — category breakdown (spec 047)", () => {
  it("routes a/1/./€ to Letters/Numbers/Punctuation/Symbols, each once; empty sections hidden (AS2.1/2.2)", async () => {
    await renderBuildListView({});
    act(() => {
      usePhaseBDraftStore.getState().setAll(["a", "1", ".", "€"]);
    });
    expect(screen.getByTestId("alphabet-letters").textContent).toContain("U+0061"); // a
    expect(screen.getByTestId("alphabet-numbers").textContent).toContain("U+0031"); // 1
    expect(screen.getByTestId("alphabet-punctuation").textContent).toContain("U+002E"); // .
    expect(screen.getByTestId("alphabet-symbols").textContent).toContain("U+20AC"); // €
    // Empty categories are not rendered (FR-006).
    expect(screen.queryByTestId("alphabet-separators")).toBeNull();
    expect(screen.queryByTestId("alphabet-controls")).toBeNull();
    // "1", ".", "€" never appear under Letters (FR-005 — no double-count).
    const letters = screen.getByTestId("alphabet-letters").textContent ?? "";
    expect(letters).not.toContain("U+0031");
    expect(letters).not.toContain("U+002E");
    expect(letters).not.toContain("U+20AC");
  });

  it("the new sections render beneath Accented letters (FR-004)", async () => {
    await renderBuildListView({});
    act(() => {
      usePhaseBDraftStore.getState().setAll(["é", "1"]);
    });
    const accented = screen.getByTestId("alphabet-accented");
    const numbers = screen.getByTestId("alphabet-numbers");
    // Numbers follows Accented in document order.
    expect(
      accented.compareDocumentPosition(numbers) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("Letters are default-ICU ordered, not raw code-point order (FR-007/SC-003)", async () => {
    await renderBuildListView({});
    // ɛ (U+025B) has a LOWER code point than a (U+0061); raw code-point order
    // would place ɛ first, but ICU root collation places a before ɛ.
    act(() => {
      usePhaseBDraftStore.getState().setAll(["ɛ", "a"]);
    });
    const letters = screen.getByTestId("alphabet-letters").textContent ?? "";
    expect(letters.indexOf("U+0061")).toBeLessThan(letters.indexOf("U+025B"));
  });
});

// ---------------------------------------------------------------------------
// US3 — Letters case-collapse + uppercase toggle (spec 047, FR-008/009/010)
// ---------------------------------------------------------------------------

describe("US3 — case-collapse + toggle (spec 047)", () => {
  it("Letters collapse to lowercase with the toggle off (AS3.1)", async () => {
    await renderBuildListView({});
    act(() => {
      usePhaseBDraftStore.getState().setAll(["a", "b", "c"]);
    });
    const letters = screen.getByTestId("alphabet-letters").textContent ?? "";
    expect(letters).toContain("U+0061"); // a shown
    expect(letters).not.toContain("U+0041"); // A hidden while toggle off
  });

  it("toggling on reveals derived uppercases (AS3.2/FR-008)", async () => {
    await renderBuildListView({});
    act(() => {
      usePhaseBDraftStore.getState().setAll(["a", "b", "c"]);
    });
    const toggle = screen.getByTestId("letters-uppercase-toggle");
    await act(async () => {
      fireEvent.click(toggle);
    });
    const letters = screen.getByTestId("alphabet-letters").textContent ?? "";
    expect(letters).toContain("U+0041"); // A
    expect(letters).toContain("U+0042"); // B
    expect(letters).toContain("U+0043"); // C
  });

  it("a caseless-script letter is shown as entered, not folded (AS3.4/FR-010)", async () => {
    await renderBuildListView({});
    // Devanagari letter क (U+0915) is caseless — caseCounterpart returns null.
    act(() => {
      usePhaseBDraftStore.getState().setAll(["क", "1"]);
    });
    expect(screen.getByTestId("alphabet-letters").textContent).toContain("U+0915");
  });

  it("an uppercase-only entry is shown as the entered uppercase, not replaced by a synthesized lowercase (FR-010 edge case)", async () => {
    await renderBuildListView({});
    // Only "A" entered, never "a": it must be shown as-is (U+0041), and no
    // lowercase "a" (U+0061) is synthesized into the Letters view.
    act(() => {
      usePhaseBDraftStore.getState().setAll(["A", "1"]);
    });
    const letters = screen.getByTestId("alphabet-letters").textContent ?? "";
    expect(letters).toContain("U+0041"); // A shown as entered
    expect(letters).not.toContain("U+0061"); // no synthesized lowercase
  });

  it("on Done the recorded alphabet contains both cases, deduped, locale-correct (AS3.3/FR-009/SC-004)", async () => {
    const onComplete = vi.fn<[SurveyPhaseResult], void>();
    await renderBuildListView({ bcp47_tag: "en" }, onComplete);
    act(() => {
      usePhaseBDraftStore.getState().setAll(["a", "b", "c"]);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Done/i }));
    });
    const inv = onComplete.mock.calls[0]![0].confirmedInventory ?? [];
    for (const ch of ["a", "b", "c", "A", "B", "C"]) {
      expect(inv).toContain(ch);
    }
    // Deduped, all NFC.
    expect(new Set(inv).size).toBe(inv.length);
    for (const c of inv) expect(c).toBe(c.normalize("NFC"));
  });

  it("Turkish dotted-i casing is respected on Done (FR-009)", async () => {
    const onComplete = vi.fn<[SurveyPhaseResult], void>();
    await renderBuildListView({ bcp47_tag: "tr" }, onComplete);
    act(() => {
      usePhaseBDraftStore.getState().setAll(["i"]);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Done/i }));
    });
    const inv = onComplete.mock.calls[0]![0].confirmedInventory ?? [];
    // Under "tr", i → İ (U+0130 dotted capital I), not plain "I".
    expect(inv).toContain("İ");
    expect(inv).not.toContain("I");
  });
});

// ---------------------------------------------------------------------------
// US4 — "Your alphabet" list focused on letters (spec 047, FR-011)
// ---------------------------------------------------------------------------

describe("US4 — focused Your-alphabet list (spec 047)", () => {
  it("shows letters/marks/combos but not numbers/punctuation, which stay in their sections (AS4.1/4.2/SC-005)", async () => {
    await renderBuildListView({});
    const ACUTE = "́";
    act(() => {
      usePhaseBDraftStore.getState().setAll(["a", "é", ACUTE, "5", "?"]);
    });
    // "Your alphabet (n)" reflects only linguistic content: a, é, and the mark = 3.
    expect(screen.getByText(/Your alphabet \(3\)/i)).toBeTruthy();
    const group = screen.getByRole("group", { name: /Accumulated characters/i });
    const groupText = group.textContent ?? "";
    expect(groupText).toContain("U+0061"); // a
    expect(groupText).not.toContain("U+0035"); // 5 excluded
    expect(groupText).not.toContain("U+003F"); // ? excluded
    // 5 and ? still appear in their breakdown sections.
    expect(screen.getByTestId("alphabet-numbers").textContent).toContain("U+0035");
    expect(screen.getByTestId("alphabet-punctuation").textContent).toContain("U+003F");
  });

  it("orders letters/combos by ICU and bare diacritics by code-point, marks last", async () => {
    await renderBuildListView({});
    const GRAVE = "̀"; // U+0300
    const ACUTE = "́"; // U+0301
    // Entered out of order: ɛ (U+025B), a, é (U+00E9 combo), acute, grave.
    act(() => {
      usePhaseBDraftStore.getState().setAll(["ɛ", "a", "é", ACUTE, GRAVE]);
    });
    const group = screen.getByRole("group", { name: /Accumulated characters/i }).textContent ?? "";
    const at = (u: string) => group.indexOf(u);
    // Letters/combos in ICU order: a < é < ɛ.
    expect(at("U+0061")).toBeLessThan(at("U+00E9"));
    expect(at("U+00E9")).toBeLessThan(at("U+025B"));
    // Bare marks in code-point order (U+0300 before U+0301), after all letters.
    expect(at("U+025B")).toBeLessThan(at("U+0300"));
    expect(at("U+0300")).toBeLessThan(at("U+0301"));
  });
});

// ---------------------------------------------------------------------------
// FR-014 — multi-code-point chip label (spec 047, SC-007)
// ---------------------------------------------------------------------------

describe("FR-014 — code-point chip label (spec 047)", () => {
  it("a multi-code-point grapheme shows the base + a bracketed [+<mark>] badge with the full stack on hover (SC-007)", async () => {
    await renderBuildListView({});
    // Ə + combining acute (U+018F U+0301): no single composed form.
    const graph = "Ə́";
    act(() => {
      usePhaseBDraftStore.getState().setAll([graph]);
    });
    // The "Your alphabet" chip shows the base code point, then the extra mark in
    // a bracketed "[+́]" badge; the full stack is on the chip's hover title.
    const group = screen.getByRole("group", { name: /Accumulated characters/i });
    expect(group.textContent).toContain("U+018F");
    expect(group.textContent).toContain("[+" + "́" + "]"); // [+ COMBINING ACUTE ]
    const chipBtn = group.querySelector("button[title='U+018F U+0301']");
    expect(chipBtn).not.toBeNull();
  });

  it("folds an entered uppercase to lowercase in the UI, recording both cases on Done (no capital without a lowercase)", async () => {
    const onComplete = vi.fn<[SurveyPhaseResult], void>();
    await renderBuildListView({ bcp47_tag: "en" }, onComplete);
    const input = screen.getByRole("textbox", { name: /Character to add/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "Q" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /\+ Add/i }));
    });
    // The UI shows the lowercase q, never a capital-without-lowercase.
    const groupText = screen.getByRole("group", { name: /Accumulated characters/i }).textContent ?? "";
    expect(groupText).toContain("U+0071"); // q
    expect(groupText).not.toContain("U+0051"); // Q not shown
    expect(usePhaseBDraftStore.getState().chars).toEqual(["q"]);
    // Both cases still reach the recorded IR on Done.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Done/i }));
    });
    const inv = onComplete.mock.calls[0]![0].confirmedInventory ?? [];
    expect(inv).toContain("q");
    expect(inv).toContain("Q");
  });

  it("keeps a lowercase letter that has no uppercase counterpart, forcing no uppercase (IPA)", async () => {
    // U+0138 LATIN SMALL LETTER KRA is \p{Ll} but has no uppercase mapping —
    // exactly the "lowercase without a corresponding uppercase" IPA case.
    const onComplete = vi.fn<[SurveyPhaseResult], void>();
    await renderBuildListView({ bcp47_tag: "en" }, onComplete);
    const input = screen.getByRole("textbox", { name: /Character to add/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "ĸ" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /\+ Add/i }));
    });
    // Kept as entered (not folded away, no synthesized uppercase in the UI).
    expect(usePhaseBDraftStore.getState().chars).toEqual(["ĸ"]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Done/i }));
    });
    // No uppercase counterpart is forced into the recorded inventory.
    expect(onComplete.mock.calls[0]![0].confirmedInventory).toEqual(["ĸ"]);
  });

  it("'Your alphabet' collapses letters to lowercase with the toggle off, reveals uppercases when on", async () => {
    await renderBuildListView({});
    act(() => {
      usePhaseBDraftStore.getState().setAll(["a", "b", "c"]);
    });
    const groupText = () =>
      screen.getByRole("group", { name: /Accumulated characters/i }).textContent ?? "";
    expect(groupText()).toContain("U+0061"); // a shown
    expect(groupText()).not.toContain("U+0041"); // A hidden by default
    const toggle = screen.getByTestId("your-alphabet-uppercase-toggle");
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(groupText()).toContain("U+0041"); // A revealed (display-only)
    expect(groupText()).toContain("U+0042"); // B
  });

  it("'Your alphabet' count is the collapsed lowercase-unit count (both cases present not double-counted)", async () => {
    await renderBuildListView({});
    act(() => {
      usePhaseBDraftStore.getState().setAll(["a", "A", "b", "B"]);
    });
    expect(screen.getByText(/Your alphabet \(2\)/i)).toBeTruthy();
  });

  it("FR-012 — a single-code-point grapheme still renders a plain U+XXXX label with no badge", async () => {
    await renderBuildListView({});
    act(() => {
      usePhaseBDraftStore.getState().setAll(["a"]);
    });
    const group = screen.getByRole("group", { name: /Accumulated characters/i });
    expect(group.textContent).toContain("U+0061");
    // No multi-code-point badge on a single code point.
    expect(group.textContent).not.toContain("[+");
  });
});
