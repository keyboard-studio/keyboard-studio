// Unit tests for SequenceGallery — the Sequence Gallery (S-03 multi-key
// sequences). Rendering style follows MechanismGallery.test.tsx (React
// Testing Library, jsdom). Services, useKeyboardArtifact, and OSKFrame are
// mocked so tests never touch WASM, VFS side-effects, or a real pattern
// catalog.
//
// Component contract under test:
//   - Cycles sequenceFlaggedChars (NOT lettersToAdd).
//   - Empty state (no flagged chars): centered message + a single Continue
//     control that fires onComplete; a Back control when onBack is given.
//   - Per-char: heading (glyph + U+XXXX), the two explained Content/Indicator
//     boxes (heading, helper text, input), and the content+indicator ->
//     currentChar result line.
//   - A character may hold MULTIPLE recorded sequences. Apply ADDS a new
//     multi_char_sequence MechanismRef to currentChar's ONE
//     scope:"individual" MechanismAssignment (creating it on first Apply);
//     an identical (content, indicator) pair is a no-op, not a duplicate.
//     After a successful Apply, both boxes clear so the author can define
//     another sequence right away — the boxes are NEVER prefilled from an
//     existing assignment. Recorded sequences render as a list below the
//     boxes, each with its own Remove control; removing the last one clears
//     the character's assignment entirely.
//   - Empty boxes: Apply is disabled and records nothing.
//   - An Indicator that cannot resolve to a physical key (charToVkey returns
//     null) blocks Apply and shows an inline role="alert" message, even
//     though resolveCharInput itself accepted the value (P1 fix).
//   - Forward gating mirrors MechanismGallery's canGoNext/Skip split (P1
//     fix): the top "Next character →"/"Done" control (sequences-continue)
//     is disabled until the CURRENT character has AT LEAST ONE recorded
//     sequence — clicking it while disabled advances nothing and discards
//     nothing. A separate, never-gated "Skip this character"
//     (sequences-skip) button always advances and never records.
//   - Back from the first flagged character fires onBack.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { SequenceGallery } from "./SequenceGallery.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { latinDeadkeyAcuteSingle } from "@keyboard-studio/contracts/fixtures";
import type { PatternLibraryService, VirtualFS } from "@keyboard-studio/contracts";
import type { Stage } from "../../hooks/useKeyboardArtifact.ts";

// ---------------------------------------------------------------------------
// Mock services — mirrors MechanismGallery.test.tsx's mockSvc shape.
// ---------------------------------------------------------------------------

const mockSvc: PatternLibraryService = {
  listAll: () => Promise.resolve([latinDeadkeyAcuteSingle]),
  getById: (id: string) => Promise.resolve({ ...latinDeadkeyAcuteSingle, id }),
  filterFor: () => Promise.resolve([]),
};

vi.mock("../../lib/services.ts", () => ({
  getPatternLibraryService: () => mockSvc,
  USE_REAL: false,
}));

// ---------------------------------------------------------------------------
// Mock useKeyboardArtifact — tests never touch WASM. SequenceGallery owns a
// single pipeline (decision D3); this mock just returns a static stage.
// ---------------------------------------------------------------------------

const _mockStage: Stage = { kind: "idle" };
const _mockRetry = vi.fn();

vi.mock("../../hooks/useKeyboardArtifact.ts", () => ({
  useKeyboardArtifact: (
    _baseKeyboard: unknown,
    _scaffoldSpec: unknown,
    _vfsTransform: ((vfs: VirtualFS, keyboardId: string) => { warnings: string[] }) | null | undefined,
  ) => ({ stage: _mockStage, retry: _mockRetry, recompile: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Mock OSKFrame — no iframe / KMW environment needed.
// ---------------------------------------------------------------------------

vi.mock("../../components/OSKFrame.tsx", () => ({
  OSKFrame: () => <div data-testid="osk-frame">osk-frame-mock</div>,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedFlagged(chars: string[]) {
  for (const c of chars) {
    useWorkingCopyStore.getState().flagCharForSequence(c);
  }
}

afterEach(() => {
  cleanup();
  useWorkingCopyStore.getState().reset();
  vi.clearAllMocks();
});

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe("SequenceGallery — empty state", () => {
  it("renders the no-flagged-characters message", () => {
    render(<SequenceGallery selectedBaseKeyboard={null} />);
    expect(
      screen.getByText(/No characters flagged for sequences/i),
    ).toBeTruthy();
  });

  it("Continue calls onComplete", () => {
    const onComplete = vi.fn();
    render(<SequenceGallery selectedBaseKeyboard={null} onComplete={onComplete} />);
    fireEvent.click(screen.getByTestId("sequences-continue"));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("renders a Back control that calls onBack when provided", () => {
    const onBack = vi.fn();
    render(<SequenceGallery selectedBaseKeyboard={null} onBack={onBack} />);
    fireEvent.click(screen.getByTestId("sequences-back"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("omits the Back control when onBack is not provided", () => {
    render(<SequenceGallery selectedBaseKeyboard={null} onComplete={vi.fn()} />);
    expect(screen.queryByTestId("sequences-back")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Populated cycle — labels, helper text, navigation
// ---------------------------------------------------------------------------

describe("SequenceGallery — populated cycle", () => {
  it("shows the first flagged char heading, both explained boxes, and their helper text", () => {
    seedFlagged(["á", "ñ"]);
    render(<SequenceGallery selectedBaseKeyboard={basicKbdus} />);

    expect(screen.getByLabelText(/^U\+00E1 á$/)).toBeTruthy();

    expect(screen.getByLabelText("Content")).toBeTruthy();
    expect(
      screen.getByText(/the characters that come first/i),
    ).toBeTruthy();

    expect(screen.getByLabelText("Indicator")).toBeTruthy();
    expect(
      screen.getByText(/the single character that triggers the combination/i),
    ).toBeTruthy();

    expect(screen.queryByText(/More sequence options are coming soon/i)).toBeNull();
  });

  it("Skip advances to the second flagged character (pure navigation, ungated)", () => {
    seedFlagged(["á", "ñ"]);
    render(<SequenceGallery selectedBaseKeyboard={basicKbdus} />);

    fireEvent.click(screen.getByTestId("sequences-skip"));
    expect(screen.getByLabelText(/^U\+00F1 ñ$/)).toBeTruthy();
  });

  it("Skip past the last flagged character calls onComplete", () => {
    const onComplete = vi.fn();
    seedFlagged(["á", "ñ"]);
    render(<SequenceGallery selectedBaseKeyboard={basicKbdus} onComplete={onComplete} />);

    fireEvent.click(screen.getByTestId("sequences-skip")); // á -> ñ
    fireEvent.click(screen.getByTestId("sequences-skip")); // ñ -> Done -> onComplete
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("Next/Done (sequences-continue) advances once the current character has been Applied", () => {
    const onComplete = vi.fn();
    seedFlagged(["á", "ñ"]);
    render(<SequenceGallery selectedBaseKeyboard={basicKbdus} onComplete={onComplete} />);

    fireEvent.change(screen.getByTestId("sequences-content"), { target: { value: "a" } });
    fireEvent.change(screen.getByTestId("sequences-indicator"), { target: { value: "e" } });
    fireEvent.click(screen.getByTestId("sequences-apply"));

    fireEvent.click(screen.getByTestId("sequences-continue"));
    expect(screen.getByLabelText(/^U\+00F1 ñ$/)).toBeTruthy();
  });

  it("Back calls onBack from the first flagged character", () => {
    const onBack = vi.fn();
    seedFlagged(["á", "ñ"]);
    render(<SequenceGallery selectedBaseKeyboard={basicKbdus} onBack={onBack} />);

    fireEvent.click(screen.getByTestId("sequences-back"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Recording — Apply writes a real MechanismAssignment
// ---------------------------------------------------------------------------

describe("SequenceGallery — recording", () => {
  it("Apply is disabled with empty boxes and records nothing", () => {
    seedFlagged(["ŋ"]);
    render(<SequenceGallery selectedBaseKeyboard={basicKbdus} />);

    const applyBtn = screen.getByTestId("sequences-apply") as HTMLButtonElement;
    expect(applyBtn.disabled).toBe(true);
    fireEvent.click(applyBtn);
    expect(useWorkingCopyStore.getState().phaseResults).toEqual([]);
  });

  it("Apply with both boxes filled records a multi_char_sequence assignment for the flagged char", () => {
    seedFlagged(["ŋ"]);
    render(<SequenceGallery selectedBaseKeyboard={basicKbdus} />);

    fireEvent.change(screen.getByTestId("sequences-content"), { target: { value: "n" } });
    fireEvent.change(screen.getByTestId("sequences-indicator"), { target: { value: "g" } });
    fireEvent.click(screen.getByTestId("sequences-apply"));

    const phaseC = useWorkingCopyStore
      .getState()
      .phaseResults.find((p) => p.phase === "C");
    expect(phaseC?.assignments).toHaveLength(1);
    const assignment = phaseC?.assignments?.[0];
    expect(assignment?.scope).toBe("individual");
    expect(assignment?.target).toBe("ŋ");
    expect(assignment?.modality).toBe("physical");
    expect(assignment?.mechanisms[0]?.patternId).toBe("multi_char_sequence");
    expect(assignment?.mechanisms[0]?.strategyId).toBe("S-03");
    expect(assignment?.mechanisms[0]?.slotValues).toEqual({
      firstLetterOut: "n",
      secondLetter: "g",
      collapsedChar: "ŋ",
    });

    expect(screen.getByText(/Sequence recorded/i)).toBeTruthy();
  });

  it("Apply ADDS a second sequence for the same character rather than replacing the first", () => {
    seedFlagged(["ŋ"]);
    render(<SequenceGallery selectedBaseKeyboard={basicKbdus} />);

    fireEvent.change(screen.getByTestId("sequences-content"), { target: { value: "n" } });
    fireEvent.change(screen.getByTestId("sequences-indicator"), { target: { value: "g" } });
    fireEvent.click(screen.getByTestId("sequences-apply"));

    fireEvent.change(screen.getByTestId("sequences-content"), { target: { value: "n" } });
    fireEvent.change(screen.getByTestId("sequences-indicator"), { target: { value: "y" } });
    fireEvent.click(screen.getByTestId("sequences-apply"));

    const phaseC = useWorkingCopyStore
      .getState()
      .phaseResults.find((p) => p.phase === "C");
    expect(phaseC?.assignments).toHaveLength(1);
    const mechanisms = phaseC?.assignments?.[0]?.mechanisms ?? [];
    expect(mechanisms).toHaveLength(2);
    expect(mechanisms.map((m) => m.slotValues)).toEqual([
      { firstLetterOut: "n", secondLetter: "g", collapsedChar: "ŋ" },
      { firstLetterOut: "n", secondLetter: "y", collapsedChar: "ŋ" },
    ]);
  });

  it("Apply with an identical (content, indicator) pair already recorded is a no-op (no duplicate ref)", () => {
    seedFlagged(["ŋ"]);
    render(<SequenceGallery selectedBaseKeyboard={basicKbdus} />);

    fireEvent.change(screen.getByTestId("sequences-content"), { target: { value: "n" } });
    fireEvent.change(screen.getByTestId("sequences-indicator"), { target: { value: "g" } });
    fireEvent.click(screen.getByTestId("sequences-apply"));

    fireEvent.change(screen.getByTestId("sequences-content"), { target: { value: "n" } });
    fireEvent.change(screen.getByTestId("sequences-indicator"), { target: { value: "g" } });
    fireEvent.click(screen.getByTestId("sequences-apply"));

    const phaseC = useWorkingCopyStore
      .getState()
      .phaseResults.find((p) => p.phase === "C");
    expect(phaseC?.assignments?.[0]?.mechanisms).toHaveLength(1);
  });

  it("boxes clear after Apply (never prefilled from an existing assignment on revisit)", () => {
    seedFlagged(["ŋ", "ɲ"]);
    render(<SequenceGallery selectedBaseKeyboard={basicKbdus} />);

    fireEvent.change(screen.getByTestId("sequences-content"), { target: { value: "n" } });
    fireEvent.change(screen.getByTestId("sequences-indicator"), { target: { value: "g" } });
    fireEvent.click(screen.getByTestId("sequences-apply"));

    // Boxes clear immediately after Apply.
    const contentImmediately = screen.getByTestId("sequences-content") as HTMLInputElement;
    const indicatorImmediately = screen.getByTestId("sequences-indicator") as HTMLInputElement;
    expect(contentImmediately.value).toBe("");
    expect(indicatorImmediately.value).toBe("");

    // Advance to the second char, then back to the first — still cleared,
    // not prefilled from the recorded sequence.
    fireEvent.click(screen.getByTestId("sequences-continue"));
    expect(screen.getByLabelText(/^U\+0272 ɲ$/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("sequences-prev-char"));

    const contentAfter = screen.getByTestId("sequences-content") as HTMLInputElement;
    const indicatorAfter = screen.getByTestId("sequences-indicator") as HTMLInputElement;
    expect(contentAfter.value).toBe("");
    expect(indicatorAfter.value).toBe("");
  });

  it("renders one list row per recorded sequence, with content + indicator -> char text", () => {
    seedFlagged(["ŋ"]);
    render(<SequenceGallery selectedBaseKeyboard={basicKbdus} />);

    fireEvent.change(screen.getByTestId("sequences-content"), { target: { value: "n" } });
    fireEvent.change(screen.getByTestId("sequences-indicator"), { target: { value: "g" } });
    fireEvent.click(screen.getByTestId("sequences-apply"));

    fireEvent.change(screen.getByTestId("sequences-content"), { target: { value: "n" } });
    fireEvent.change(screen.getByTestId("sequences-indicator"), { target: { value: "y" } });
    fireEvent.click(screen.getByTestId("sequences-apply"));

    expect(screen.getByTestId("sequences-remove-0")).toBeTruthy();
    expect(screen.getByTestId("sequences-remove-1")).toBeTruthy();
    expect(screen.getByText(/2 sequences recorded/i)).toBeTruthy();
  });

  it("Remove drops one recorded sequence and keeps the others", () => {
    seedFlagged(["ŋ"]);
    render(<SequenceGallery selectedBaseKeyboard={basicKbdus} />);

    fireEvent.change(screen.getByTestId("sequences-content"), { target: { value: "n" } });
    fireEvent.change(screen.getByTestId("sequences-indicator"), { target: { value: "g" } });
    fireEvent.click(screen.getByTestId("sequences-apply"));

    fireEvent.change(screen.getByTestId("sequences-content"), { target: { value: "n" } });
    fireEvent.change(screen.getByTestId("sequences-indicator"), { target: { value: "y" } });
    fireEvent.click(screen.getByTestId("sequences-apply"));

    fireEvent.click(screen.getByTestId("sequences-remove-0"));

    const phaseC = useWorkingCopyStore
      .getState()
      .phaseResults.find((p) => p.phase === "C");
    const mechanisms = phaseC?.assignments?.[0]?.mechanisms ?? [];
    expect(mechanisms).toHaveLength(1);
    expect(mechanisms[0]?.slotValues).toEqual({
      firstLetterOut: "n",
      secondLetter: "y",
      collapsedChar: "ŋ",
    });
    expect(screen.getByText(/Sequence recorded/i)).toBeTruthy();
  });

  it("Removing the last recorded sequence clears the character's assignment entirely", () => {
    seedFlagged(["ŋ"]);
    render(<SequenceGallery selectedBaseKeyboard={basicKbdus} />);

    fireEvent.change(screen.getByTestId("sequences-content"), { target: { value: "n" } });
    fireEvent.change(screen.getByTestId("sequences-indicator"), { target: { value: "g" } });
    fireEvent.click(screen.getByTestId("sequences-apply"));

    fireEvent.click(screen.getByTestId("sequences-remove-0"));

    const phaseC = useWorkingCopyStore
      .getState()
      .phaseResults.find((p) => p.phase === "C");
    expect(phaseC?.assignments ?? []).toHaveLength(0);
    expect(screen.queryByTestId("sequences-remove-0")).toBeNull();

    // canGoNext gates back off with no recorded sequence.
    const continueBtn = screen.getByTestId("sequences-continue") as HTMLButtonElement;
    expect(continueBtn.disabled).toBe(true);
  });

  it("the gated Next/Done control cannot silently discard unapplied (filled) input", () => {
    seedFlagged(["ŋ", "ɲ"]);
    render(<SequenceGallery selectedBaseKeyboard={basicKbdus} />);

    fireEvent.change(screen.getByTestId("sequences-content"), { target: { value: "n" } });
    fireEvent.change(screen.getByTestId("sequences-indicator"), { target: { value: "g" } });
    // No Apply click. sequences-continue is disabled (canGoNext is false —
    // nothing recorded yet for the current character) — clicking a disabled
    // button fires no handler, so this must neither advance nor discard.
    const continueBtn = screen.getByTestId("sequences-continue") as HTMLButtonElement;
    expect(continueBtn.disabled).toBe(true);
    fireEvent.click(continueBtn);

    expect(useWorkingCopyStore.getState().phaseResults).toEqual([]);
    expect(screen.getByLabelText(/^U\+014B ŋ$/)).toBeTruthy(); // still on the first char

    const contentAfter = screen.getByTestId("sequences-content") as HTMLInputElement;
    const indicatorAfter = screen.getByTestId("sequences-indicator") as HTMLInputElement;
    expect(contentAfter.value).toBe("n");
    expect(indicatorAfter.value).toBe("g");
  });

  it("Skip explicitly discards unapplied (filled) input and advances — nothing is recorded", () => {
    seedFlagged(["ŋ", "ɲ"]);
    render(<SequenceGallery selectedBaseKeyboard={basicKbdus} />);

    fireEvent.change(screen.getByTestId("sequences-content"), { target: { value: "n" } });
    fireEvent.change(screen.getByTestId("sequences-indicator"), { target: { value: "g" } });
    // No Apply click — Skip is pure forward navigation, never gated.
    fireEvent.click(screen.getByTestId("sequences-skip"));

    expect(screen.getByLabelText(/^U\+0272 ɲ$/)).toBeTruthy();
    expect(useWorkingCopyStore.getState().phaseResults).toEqual([]);

    const contentAfter = screen.getByTestId("sequences-content") as HTMLInputElement;
    const indicatorAfter = screen.getByTestId("sequences-indicator") as HTMLInputElement;
    expect(contentAfter.value).toBe("");
    expect(indicatorAfter.value).toBe("");
  });

  it("Content accepts a multi-grapheme digraph (e.g. 'ng') while Indicator stays single-grapheme", () => {
    seedFlagged(["ŋ"]);
    render(<SequenceGallery selectedBaseKeyboard={basicKbdus} />);

    fireEvent.change(screen.getByTestId("sequences-content"), { target: { value: "ng" } });
    fireEvent.change(screen.getByTestId("sequences-indicator"), { target: { value: "y" } });
    fireEvent.click(screen.getByTestId("sequences-apply"));

    const phaseC = useWorkingCopyStore
      .getState()
      .phaseResults.find((p) => p.phase === "C");
    expect(phaseC?.assignments?.[0]?.mechanisms[0]?.slotValues?.["firstLetterOut"]).toBe("ng");

    // Indicator rejects a two-grapheme value — Apply is disabled again.
    fireEvent.change(screen.getByTestId("sequences-indicator"), { target: { value: "yz" } });
    const applyBtn = screen.getByTestId("sequences-apply") as HTMLButtonElement;
    expect(applyBtn.disabled).toBe(true);
  });

  it("removing the MIDDLE of 3+ recorded sequences keeps the correct two remaining, in order (pins index-based remove)", () => {
    seedFlagged(["ŋ"]);
    render(<SequenceGallery selectedBaseKeyboard={basicKbdus} />);

    const applySeq = (contentVal: string, indicatorVal: string) => {
      fireEvent.change(screen.getByTestId("sequences-content"), { target: { value: contentVal } });
      fireEvent.change(screen.getByTestId("sequences-indicator"), { target: { value: indicatorVal } });
      fireEvent.click(screen.getByTestId("sequences-apply"));
    };

    applySeq("n", "g");
    applySeq("n", "y");
    applySeq("n", "h");

    // Remove index 1 — the MIDDLE sequence ("n"+"y").
    fireEvent.click(screen.getByTestId("sequences-remove-1"));

    const phaseC = useWorkingCopyStore
      .getState()
      .phaseResults.find((p) => p.phase === "C");
    const mechanisms = phaseC?.assignments?.[0]?.mechanisms ?? [];
    expect(mechanisms).toHaveLength(2);
    expect(mechanisms.map((m) => m.slotValues)).toEqual([
      { firstLetterOut: "n", secondLetter: "g", collapsedChar: "ŋ" },
      { firstLetterOut: "n", secondLetter: "h", collapsedChar: "ŋ" },
    ]);
  });

  it("each Remove button's accessible name identifies which sequence it removes (usable with 2+ rows)", () => {
    seedFlagged(["ŋ"]);
    render(<SequenceGallery selectedBaseKeyboard={basicKbdus} />);

    fireEvent.change(screen.getByTestId("sequences-content"), { target: { value: "n" } });
    fireEvent.change(screen.getByTestId("sequences-indicator"), { target: { value: "g" } });
    fireEvent.click(screen.getByTestId("sequences-apply"));

    fireEvent.change(screen.getByTestId("sequences-content"), { target: { value: "n" } });
    fireEvent.change(screen.getByTestId("sequences-indicator"), { target: { value: "y" } });
    fireEvent.click(screen.getByTestId("sequences-apply"));

    // Each button's aria-label names its OWN sequence, not just a shared
    // generic "Remove" — a screen-reader user tabbing through 2+ rows must
    // be able to tell them apart without relying on visual position.
    expect(
      screen.getByRole("button", { name: /Remove sequence n \+ g for.*ŋ/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Remove sequence n \+ y for.*ŋ/i }),
    ).toBeTruthy();
  });

  it("Apply/Remove of a sequence does not disturb a non-sequence assignment recorded for the SAME character", () => {
    // Seed a prior non-sequence assignment directly on the store (as
    // MechanismGallery's simple_swap branch would record it) — the
    // exclude-filter/partition in SequenceGallery must be scoped to
    // PATTERN_SEQUENCE only, never to "any assignment targeting this char".
    useWorkingCopyStore.getState().recordAssignments([
      {
        scope: "individual",
        target: "ŋ",
        modality: "physical",
        mechanisms: [
          { patternId: "simple_swap", strategyId: "S-01", slotValues: { kmnRules: "+ [K_G] > U+014B" } },
        ],
        source: "user",
      },
    ]);
    seedFlagged(["ŋ"]);
    render(<SequenceGallery selectedBaseKeyboard={basicKbdus} />);

    fireEvent.change(screen.getByTestId("sequences-content"), { target: { value: "n" } });
    fireEvent.change(screen.getByTestId("sequences-indicator"), { target: { value: "g" } });
    fireEvent.click(screen.getByTestId("sequences-apply"));

    let phaseC = useWorkingCopyStore
      .getState()
      .phaseResults.find((p) => p.phase === "C");
    // Two DISTINCT assignments for the same target: the untouched
    // simple_swap one, plus the new multi_char_sequence one.
    expect(phaseC?.assignments).toHaveLength(2);
    const swapAssignment = phaseC?.assignments?.find(
      (a) => a.mechanisms[0]?.patternId === "simple_swap",
    );
    expect(swapAssignment?.mechanisms).toHaveLength(1);
    expect(swapAssignment?.mechanisms[0]?.slotValues).toEqual({ kmnRules: "+ [K_G] > U+014B" });

    // Remove the sequence — the swap assignment must survive untouched.
    fireEvent.click(screen.getByTestId("sequences-remove-0"));

    phaseC = useWorkingCopyStore.getState().phaseResults.find((p) => p.phase === "C");
    expect(phaseC?.assignments).toHaveLength(1);
    expect(phaseC?.assignments?.[0]?.mechanisms[0]?.patternId).toBe("simple_swap");
    expect(phaseC?.assignments?.[0]?.mechanisms[0]?.slotValues).toEqual({ kmnRules: "+ [K_G] > U+014B" });
  });

  it("an Indicator that can't map to a physical key blocks Apply and shows an inline alert (P1 fix)", () => {
    seedFlagged(["ŋ"]);
    render(<SequenceGallery selectedBaseKeyboard={basicKbdus} />);

    fireEvent.change(screen.getByTestId("sequences-content"), { target: { value: "n" } });
    // "ñ" resolves fine as a single-grapheme character (resolveCharInput
    // accepts it — it is not a U+ parse error, not multi-grapheme, not a
    // blocked delimiter) but charToVkey has no entry for it: KEY_OPTIONS only
    // covers ASCII letters/digits/punctuation, so this is exactly the
    // unmappable-indicator case the fix targets.
    fireEvent.change(screen.getByTestId("sequences-indicator"), { target: { value: "ñ" } });

    const applyBtn = screen.getByTestId("sequences-apply") as HTMLButtonElement;
    expect(applyBtn.disabled).toBe(true);
    expect(screen.getByText(/isn't a key on this layout/i)).toBeTruthy();

    fireEvent.click(applyBtn);
    expect(useWorkingCopyStore.getState().phaseResults).toEqual([]);
  });
});
