// Unit tests for MechanismGallery — Phase C "add a key" assignment loop.
// Rendering style follows lint.test.tsx (React Testing Library, jsdom).
// Services, useKeyboardArtifact, and OSKFrame are mocked so tests never touch
// WASM, VFS side-effects, or a real pattern catalog.
//
// Component contract under test:
//   - One character at a time from lettersToAdd (inventory when baseIr is null).
//   - "Apply method for <char>" button records a MechanismAssignment(scope:"individual").
//     It lives at the top-right of whichever method card is OPEN, on the same line
//     as the card's title (CardApplyRow, testids mechanism-apply-swap /
//     mechanism-apply-deadkey), not in a shared row below the chooser — so exactly
//     one is on screen and it sits with the fields it commits. Its accessible name
//     is unchanged by that move.
//   - "Mark for later review" (mechanism-gallery-progression) is a per-
//     character toggle — it records nothing in the working copy, but
//     satisfies canGoNext exactly like an Apply, so Next/Done can advance
//     past it. A marked character is never treated as covered for coverage
//     purposes, only as "accounted for" (see lib/accountedForGate.ts).
//   - The last character's forward button always reads "Done", disabled
//     until every character in lettersToAdd is implemented or marked.
//   - Coverage status line: "<N> of <M> added".
//   - Method chooser: "Type a sequence" always present; "Tap a trigger key, then a letter"
//     always present (S-02 deadkey is always offered, regardless of char type).
//   - Default method per character is "swap" (S-01), except a decomposable
//     accented char defaults to "deadkey" (S-02) — see §3c propose-then-
//     confirm. Selecting "Type a sequence" (S-03) swaps the RIGHT pane's live
//     preview for SequenceBuilderPanel; that panel's own Apply records a real
//     multi_char_sequence MechanismAssignment and hands control back
//     (method -> "swap"), never counted as "added"/covered (a distinct
//     "Sequences" dimension — see excludeSequenceMechanisms in the component).
//   - Added chip row appears; chips invoke remove (filters assignment from store).
//   - Already-produced section collapsed by default; toggle expands it.
//   - Guards: null base → no-base prompt; empty inventory → survey prompt.
//
// This suite covers the shell: the no-base / no-inventory guards, the
// current-character display, the heading, the intro splash, the preview pane states,
// the vfsTransform handed to useKeyboardArtifact, and the import-derived provenance
// publish. Sibling MechanismGallery.<concern>.test.tsx suites cover the rest.
//
// Shared module mocks, spies, and the lifecycle hooks every suite installs:
// ../../test/mechanismGallery/mocks.tsx. Seeders and IR fixtures:
// ../../test/mechanismGallery/harness.ts.

import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, act, waitFor } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { MechanismGallery } from "./MechanismGallery.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { Stage } from "../../hooks/useKeyboardArtifact.ts";
import { expectCurrentChar } from "../../test/currentCharChip.ts";
import { installMechanismGalleryHooks, setMockStage, _lastVfsTransform } from "../../test/mechanismGallery/mocks.tsx";
import { seedInventory } from "../../test/mechanismGallery/harness.ts";

vi.mock("../../lib/services.ts", () => import("../../test/mechanismGallery/mocks.tsx"));
vi.mock("../../hooks/useKeyboardArtifact.ts", () => import("../../test/mechanismGallery/mocks.tsx"));
vi.mock("@keyboard-studio/engine", async (importOriginal) =>
  (await import("../../test/mechanismGallery/mocks.tsx")).withMockedEngine(
    await importOriginal<typeof import("@keyboard-studio/engine")>(),
  ),
);
vi.mock("../../components/OSKFrame.tsx", () => import("../../test/mechanismGallery/mocks.tsx"));

installMechanismGalleryHooks();

// ---------------------------------------------------------------------------
// Guard: no base keyboard
// ---------------------------------------------------------------------------

describe("MechanismGallery — no base keyboard", () => {
  it("renders the no-base-selected prompt when selectedBaseKeyboard is null", () => {
    render(<MechanismGallery selectedBaseKeyboard={null} />);
    expect(screen.getByText(/No base keyboard selected/i)).toBeTruthy();
  });

  it("does NOT render a status line or Add key button when base is null", () => {
    render(<MechanismGallery selectedBaseKeyboard={null} />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("button", { name: /Add key for/i })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Guard: empty inventory
// ---------------------------------------------------------------------------

describe("MechanismGallery — no inventory", () => {
  it("renders the survey prompt when inventory is empty and base is set", () => {
    render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    expect(screen.getByText(/No inventory confirmed yet/i)).toBeTruthy();
  });

  it("renders a Back button inside the no-inventory guard when onBack is provided", () => {
    const onBack = vi.fn();
    render(<MechanismGallery selectedBaseKeyboard={basicKbdus} onBack={onBack} />);
    // The guard path renders a Back button when onBack is given.
    const btn = screen.getByRole("button", { name: /← back/i });
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(onBack).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Assignment loop — current character display
// ---------------------------------------------------------------------------

describe("MechanismGallery — current character display", () => {
  it("shows the first character from lettersToAdd as the current target", async () => {
    seedInventory(["á", "é"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    // The "Add a key" eyebrow still renders above the CharScrollStrip.
    expect(screen.getByText("Add a key")).toBeTruthy();
    // The CharScrollStrip's selected chip is "á" (aria-pressed + "Go to U+00E1 á").
    expectCurrentChar("á");
  });

  it("renders the coverage status line with initial 0-of-N count", async () => {
    seedInventory(["á", "é"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    // Scoped by name: "á" is decomposable-accented, so the deadkey method's
    // pre-filled base-letter box also renders its own (unrelated) status
    // reflection — getByRole("status") alone would now match more than one.
    const status = screen.getByRole("status", { name: "0 of 2 added" });
    expect(status.getAttribute("aria-label")).toBe("0 of 2 added");
  });
});

// ---------------------------------------------------------------------------
// Preview wiring — loading / error / ready states (right pane)
// ---------------------------------------------------------------------------

describe("MechanismGallery — preview loading state", () => {
  it("renders a loading indicator when stage is fetching", async () => {
    setMockStage({ kind: "fetching" });
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expect(screen.getByText(/Fetching keyboard source/i)).toBeTruthy();
  });

  it("renders a compiling indicator when stage is compiling (warm)", async () => {
    setMockStage({ kind: "compiling", isWarmCompile: true });
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expect(screen.getByText(/Compiling/i)).toBeTruthy();
  });

  it("renders a cold-compile indicator for isWarmCompile false", async () => {
    setMockStage({ kind: "compiling", isWarmCompile: false });
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expect(screen.getByText(/loading WASM/i)).toBeTruthy();
  });
});

describe("MechanismGallery — preview error state", () => {
  it("renders the error message when stage is error", async () => {
    setMockStage({ kind: "error", step: "fetch", message: "Network timeout" });
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expect(screen.getByText(/Network timeout/i)).toBeTruthy();
    expect(screen.getByText(/Preview failed/i)).toBeTruthy();
  });

  it("renders a Retry button on error", async () => {
    setMockStage({ kind: "error", step: "compile", message: "WASM crash" });
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy();
  });
});

describe("MechanismGallery — preview ready state", () => {
  const readyStage: Stage = {
    kind: "ready",
    compileResult: { success: true, artifacts: [], diagnostics: [] },
    jsBlobUrl: "",
    vfs: createVirtualFS(),
    scaffoldWarnings: [],
  };

  it("renders the OSKFrame mock when stage is ready", async () => {
    setMockStage(readyStage);
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expect(screen.getByTestId("osk-frame")).toBeTruthy();
    expect(screen.getByTestId("osk-frame").getAttribute("data-stage")).toBe("ready");
  });

  it("shows apply warnings from scaffoldWarnings on ready stage", async () => {
    const stageWithWarnings: Stage = {
      ...readyStage,
      scaffoldWarnings: ['[pattern-apply] unknown patternId "foo" — fragment skipped'],
    };
    setMockStage(stageWithWarnings);
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expect(screen.getByText(/Apply warnings/i)).toBeTruthy();
    expect(screen.getByText(/unknown patternId "foo"/i)).toBeTruthy();
  });

  it("does NOT show apply warnings when scaffoldWarnings is empty", async () => {
    setMockStage(readyStage);
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expect(screen.queryByText(/Apply warnings/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Heading and subheading — gallery-QoL rename
// ---------------------------------------------------------------------------

describe("MechanismGallery — heading", () => {
  it("renders 'Mechanism Gallery' as the main heading", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expect(screen.getByRole("heading", { level: 1, name: /Mechanism Gallery/i })).toBeTruthy();
  });

  it("renders 'Desktop' as a subheading label in the header area", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    // "Desktop" is rendered as a <span> sibling to the <h1> (not inside it).
    expect(screen.getByText(/^Desktop$/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Preview wiring — vfsTransform passes through to useKeyboardArtifact
// ---------------------------------------------------------------------------

describe("MechanismGallery — vfsTransform passed to useKeyboardArtifact", () => {
  it("passes a non-null vfsTransform after patterns have loaded and working copy is instantiated", async () => {
    // Use a ready stage so OSKFrame renders (confirms GalleryPreviewWithPatterns
    // mounted) and useKeyboardArtifact receives the transform callback.
    setMockStage({
      kind: "ready",
      compileResult: { success: true, artifacts: [], diagnostics: [] },
      jsBlobUrl: "",
      vfs: createVirtualFS(),
      scaffoldWarnings: [],
    });
    // Seed a working copy: useWorkingCopyTransform returns null when baseIr is null,
    // so instantiateFromBase must be called before patterns load.
    const seedVfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    ]);
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, {
      vfs: seedVfs,
      ir: makeTestIR([]),
    });
    seedInventory(["á"]);
    // Let patterns load fully inside act so the async filterFor + getById chain
    // completes and patternMap is populated before assertions run.
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
      // Flush remaining microtasks (filterFor / getById promises).
      await new Promise((r) => setTimeout(r, 0));
    });
    // GalleryPreviewWithPatterns mounted → useKeyboardArtifact called → transform captured.
    expect(_lastVfsTransform).not.toBeNull();
    expect(typeof _lastVfsTransform).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Intro splash — first-entry orientation
// ---------------------------------------------------------------------------

describe("MechanismGallery — intro splash", () => {
  it("shows the intro on first entry and reveals the gallery after 'Get started'", async () => {
    seedInventory(["á"], { intro: true });

    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
      await new Promise((r) => setTimeout(r, 0));
    });

    // Intro visible; the gallery's coverage status line is not yet shown.
    expect(screen.queryByText(/Welcome to the Mechanism Gallery/i)).not.toBeNull();
    expect(screen.queryByRole("status")).toBeNull();

    const startBtn = screen.getByRole("button", { name: /start the mechanism gallery/i });
    await act(async () => {
      fireEvent.click(startBtn);
      await new Promise((r) => setTimeout(r, 0));
    });

    // Gallery now visible; intro gone. "á" is decomposable-accented, so more
    // than one status region can legitimately be present (the coverage line
    // plus the deadkey method's pre-filled base-letter reflection) — assert
    // at least one rather than exactly one.
    expect(screen.queryByText(/Welcome to the Mechanism Gallery/i)).toBeNull();
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
  });

  it("does NOT show the intro on a return visit (intro already marked seen)", async () => {
    seedInventory(["á"]); // default: marks the intro seen

    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(screen.queryByText(/Welcome to the Mechanism Gallery/i)).toBeNull();
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Import-derived A3a provenance on the Flow Map (spec §7.2 rule 3a, #926)
// ---------------------------------------------------------------------------

describe("MechanismGallery — import-derived markInputOrder provenance", () => {
  it("publishes the import-derived provenance fill when the base seeded A3a=postfix", async () => {
    // seedIrAxesFromBaseIr seeds markInputOrder="postfix" onto irAxes at
    // instantiation. defaultFillAxes correctly omits an already-present axis
    // from its own axisFills, so MechanismGallery reconstructs the
    // import-derived provenance (postfix can only be base-derived) and
    // publishes it so the Flow Map's DefaultFillProvenance panel shows it.
    useWorkingCopyStore.getState().setIrAxes({ markInputOrder: "postfix" });
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    await waitFor(() => {
      expect(useWorkingCopyStore.getState().axisFills).toContainEqual({
        axis: "markInputOrder",
        value: "postfix",
        source: "import-derived",
      });
    });
  });

  it("publishes no import-derived fill when markInputOrder is absent", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    await waitFor(() => {
      expect(
        useWorkingCopyStore
          .getState()
          .axisFills.some((f) => f.source === "import-derived"),
      ).toBe(false);
    });
  });
});
