// Unit tests for SequenceGallery — the interim (visual-only) Sequence Gallery.
// Rendering style follows MechanismGallery.test.tsx (React Testing Library,
// jsdom). Services, useKeyboardArtifact, and OSKFrame are mocked so tests
// never touch WASM, VFS side-effects, or a real pattern catalog.
//
// Component contract under test:
//   - Cycles sequenceFlaggedChars (NOT lettersToAdd).
//   - Empty state (no flagged chars): centered message + a single Continue
//     control that fires onComplete; a Back control when onBack is given.
//   - Per-char: heading (glyph + U+XXXX), the two visual-only sequence boxes
//     (Content, Indicator — each with a heading, an explanatory line, and an
//     input), the content+indicator -> currentChar result line, and the
//     "coming soon" note.
//   - Next/Done never gate on the sequence box — the author can always
//     advance. Advancing past the last flagged char fires onComplete.
//   - Back from the first flagged char fires onBack.
//   - The box records/emits NOTHING: no MechanismAssignment, no
//     multi_char_sequence pattern application.

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
// Populated cycle
// ---------------------------------------------------------------------------

describe("SequenceGallery — populated cycle", () => {
  it("shows the first flagged char heading, both explained boxes, and the coming-soon note", () => {
    seedFlagged(["á", "ñ"]);
    render(<SequenceGallery selectedBaseKeyboard={basicKbdus} />);

    expect(screen.getByLabelText(/^U\+00E1 á$/)).toBeTruthy();

    expect(screen.getByText("Content")).toBeTruthy();
    expect(
      screen.getByText(/the characters that come first/i),
    ).toBeTruthy();
    expect(screen.getByLabelText("Content characters")).toBeTruthy();

    expect(screen.getByText("Indicator")).toBeTruthy();
    expect(
      screen.getByText(/the single character that triggers the combination/i),
    ).toBeTruthy();
    expect(screen.getByLabelText("Indicator character")).toBeTruthy();

    expect(screen.getByText(/More sequence options are coming soon\./i)).toBeTruthy();
  });

  it("Next advances to the second flagged character", () => {
    seedFlagged(["á", "ñ"]);
    render(<SequenceGallery selectedBaseKeyboard={basicKbdus} />);

    fireEvent.click(screen.getByTestId("sequences-continue"));
    expect(screen.getByLabelText(/^U\+00F1 ñ$/)).toBeTruthy();
  });

  it("Done past the last flagged character calls onComplete", () => {
    const onComplete = vi.fn();
    seedFlagged(["á", "ñ"]);
    render(<SequenceGallery selectedBaseKeyboard={basicKbdus} onComplete={onComplete} />);

    fireEvent.click(screen.getByTestId("sequences-continue")); // á -> ñ
    fireEvent.click(screen.getByTestId("sequences-continue")); // ñ -> Done -> onComplete
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("Back calls onBack from the first flagged character", () => {
    const onBack = vi.fn();
    seedFlagged(["á", "ñ"]);
    render(<SequenceGallery selectedBaseKeyboard={basicKbdus} onBack={onBack} />);

    fireEvent.click(screen.getByTestId("sequences-back"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("the content and indicator boxes are independently editable", () => {
    seedFlagged(["á", "ñ"]);
    render(<SequenceGallery selectedBaseKeyboard={basicKbdus} />);

    const contentInput = screen.getByLabelText("Content characters") as HTMLInputElement;
    const indicatorInput = screen.getByLabelText("Indicator character") as HTMLInputElement;
    fireEvent.change(contentInput, { target: { value: "ae" } });
    fireEvent.change(indicatorInput, { target: { value: "'" } });
    expect(contentInput.value).toBe("ae");
    expect(indicatorInput.value).toBe("'");
  });

  it("typing into either box records nothing onto the working copy", () => {
    seedFlagged(["á", "ñ"]);
    render(<SequenceGallery selectedBaseKeyboard={basicKbdus} />);

    const contentInput = screen.getByLabelText("Content characters") as HTMLInputElement;
    const indicatorInput = screen.getByLabelText("Indicator character") as HTMLInputElement;
    fireEvent.change(contentInput, { target: { value: "a" } });
    fireEvent.change(indicatorInput, { target: { value: "'" } });

    // Nothing is ever recorded onto the working copy for these boxes: no
    // MechanismAssignment, no Phase C result, and the flagged-char list is
    // untouched by typing.
    expect(useWorkingCopyStore.getState().phaseResults).toEqual([]);
    expect(useWorkingCopyStore.getState().sequenceFlaggedChars).toEqual(["á", "ñ"]);
  });

  it("both fields reset when advancing to the next flagged character", () => {
    seedFlagged(["á", "ñ"]);
    render(<SequenceGallery selectedBaseKeyboard={basicKbdus} />);

    const contentInput = screen.getByLabelText("Content characters") as HTMLInputElement;
    const indicatorInput = screen.getByLabelText("Indicator character") as HTMLInputElement;
    fireEvent.change(contentInput, { target: { value: "ae" } });
    fireEvent.change(indicatorInput, { target: { value: "'" } });
    expect(contentInput.value).toBe("ae");
    expect(indicatorInput.value).toBe("'");

    fireEvent.click(screen.getByTestId("sequences-continue"));
    const contentAfter = screen.getByLabelText("Content characters") as HTMLInputElement;
    const indicatorAfter = screen.getByLabelText("Indicator character") as HTMLInputElement;
    expect(contentAfter.value).toBe("");
    expect(indicatorAfter.value).toBe("");
  });
});
