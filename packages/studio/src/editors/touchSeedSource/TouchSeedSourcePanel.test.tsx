// Unit tests for TouchSeedSourcePanel (spec 035 T014, contracts/seed-source-fork.md).
//
// Coverage:
//   - default selection with/without a usable base touch layout (R4)
//   - malformed base JSON is treated as absent, with a distinct note (R4)
//   - tablet-drop advisory rendered on the Reseed card when the base ships a
//     non-phone platform (R7/R10)
//   - confirm calls setTouchSeedSource then onComplete
//   - the draft-discard warning (R12) is shown ONLY on re-entry with a
//     DIFFERENT selection than the recorded choice, while a touch draft exists

import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, fireEvent, cleanup } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { TouchSeedSourcePanel } from "./TouchSeedSourcePanel.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { TouchAssignment, IRGroup, IRRule } from "@keyboard-studio/contracts";
import { devLog } from "@keyboard-studio/contracts/dev-log";
import { deriveSeedLayout } from "../../lib/buildTouchLayoutJson.ts";

// ---------------------------------------------------------------------------
// deriveSeedLayout mock — wraps the REAL implementation by default (every
// existing test in this file relies on the real reseed derivation for its
// preview assertions); only the "genuine derivation error" test below
// overrides it once, via mockImplementationOnce, to force the catch branch.
// ---------------------------------------------------------------------------

vi.mock("../../lib/buildTouchLayoutJson.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../lib/buildTouchLayoutJson.ts")>();
  return {
    ...original,
    deriveSeedLayout: vi.fn(original.deriveSeedLayout),
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PHONE_ONLY_JSON = JSON.stringify({
  phone: {
    layer: [
      {
        id: "default",
        row: [{ id: 1, key: [{ id: "K_Q", text: "q" }, { id: "K_W", text: "w" }] }],
      },
    ],
  },
});

const PHONE_AND_TABLET_JSON = JSON.stringify({
  phone: {
    layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_Q", text: "q" }] }] }],
  },
  tablet: {
    layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_Q", text: "q" }] }] }],
  },
});

const TABLET_ONLY_JSON = JSON.stringify({
  tablet: {
    layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_Q", text: "q" }] }] }],
  },
});

const MALFORMED_JSON = "{not valid json";

const fakeTouchAssignment: TouchAssignment = {
  scope: "individual",
  target: "ä",
  modality: "touch",
  mechanisms: [{ patternId: "longpress_alternates", slotValues: { hostKey: "K_A", char: "ä" } }],
  source: "user",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Seed baseVfs/baseIr, optionally with a `.keyman-touch-layout` file and/or IR groups. */
function seedBase(touchLayoutJson?: string, groups: IRGroup[] = []) {
  const files = [{ path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false }];
  if (touchLayoutJson !== undefined) {
    files.push({
      path: "source/basic_kbdus.keyman-touch-layout",
      content: touchLayoutJson,
      isBinary: false,
    });
  }
  const vfs = createVirtualFS(files);
  const ir = makeTestIR(groups);
  useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });
}

/**
 * A single-rule IRGroup producing `overflowChar` on `K_oE2` — a vkey with no
 * compact-layout slot AND no known physical neighbor (see
 * OVERFLOW_NEAREST_SLOT in scaffoldTouchLayout.ts), so scaffoldTouchLayout
 * spills it onto the space bar's "extras" sk[] rather than dropping it.
 */
function makeOverflowGroup(overflowChar: string): IRGroup {
  const rule: IRRule = {
    nodeId: "rule:overflow",
    context: [{ kind: "vkey", name: "K_oE2", modifiers: [] }],
    output: [{ kind: "char", value: overflowChar }],
  };
  return { nodeId: "group:overflow", name: "main", usingKeys: true, rules: [rule], readonly: false };
}

afterEach(() => {
  cleanup();
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
});

// ---------------------------------------------------------------------------
// Default selection (R4)
// ---------------------------------------------------------------------------

describe("TouchSeedSourcePanel — default selection", () => {
  it("defaults to Import & adapt when the base ships a usable touch layout", () => {
    seedBase(PHONE_ONLY_JSON);
    render(<TouchSeedSourcePanel onComplete={() => undefined} onBack={() => undefined} />);

    expect(screen.getByTestId("seed-source-import-adapt").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("seed-source-reseed").getAttribute("aria-pressed")).toBe("false");
  });

  it("defaults to Reseed from desktop when the base has no touch layout", () => {
    seedBase(); // no touch-layout file
    render(<TouchSeedSourcePanel onComplete={() => undefined} onBack={() => undefined} />);

    expect(screen.getByTestId("seed-source-reseed").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("seed-source-import-adapt").getAttribute("aria-pressed")).toBe("false");
    // The live preview pane shows whichever card is selected (R4a) — the
    // default selection is Reseed, so the base-layout note is only visible
    // once the author looks at the Import & adapt preview.
    fireEvent.click(screen.getByTestId("seed-source-import-adapt"));
    expect(screen.getByTestId("seed-source-absent-note")).toBeTruthy();
  });

  it("treats malformed base touch-layout JSON as absent, with a distinct note", () => {
    seedBase(MALFORMED_JSON);
    render(<TouchSeedSourcePanel onComplete={() => undefined} onBack={() => undefined} />);

    // Same default as "absent" (Reseed selected)...
    expect(screen.getByTestId("seed-source-reseed").getAttribute("aria-pressed")).toBe("true");
    // ...but the note text distinguishes malformed from truly absent, visible
    // in the live preview pane once Import & adapt is selected (R4a).
    fireEvent.click(screen.getByTestId("seed-source-import-adapt"));
    expect(screen.getByTestId("seed-source-malformed-note")).toBeTruthy();
    expect(screen.queryByTestId("seed-source-absent-note")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Advisories (R4/R7/R10) — never gating
// ---------------------------------------------------------------------------

describe("TouchSeedSourcePanel — advisories", () => {
  it("shows the no-phone-platform warning when the base ships only tablet", () => {
    seedBase(TABLET_ONLY_JSON);
    render(<TouchSeedSourcePanel onComplete={() => undefined} onBack={() => undefined} />);

    expect(screen.getByTestId("seed-source-no-phone-warn")).toBeTruthy();
    // Advisory never disables a choice — both cards remain clickable.
    fireEvent.click(screen.getByTestId("seed-source-import-adapt"));
    expect(screen.getByTestId("seed-source-import-adapt").getAttribute("aria-pressed")).toBe("true");
  });

  it("does NOT show the no-phone-platform warning when the base ships phone", () => {
    seedBase(PHONE_ONLY_JSON);
    render(<TouchSeedSourcePanel onComplete={() => undefined} onBack={() => undefined} />);

    expect(screen.queryByTestId("seed-source-no-phone-warn")).toBeNull();
  });

  it("states the Reseed option discards tablet/desktop platforms when the base ships one", () => {
    seedBase(PHONE_AND_TABLET_JSON);
    render(<TouchSeedSourcePanel onComplete={() => undefined} onBack={() => undefined} />);

    expect(screen.getByTestId("seed-source-reseed").textContent).toContain(
      "discards the base's shipped tablet/desktop touch platforms",
    );
  });

  it("does not mention discarding platforms when the base ships phone only", () => {
    seedBase(PHONE_ONLY_JSON);
    render(<TouchSeedSourcePanel onComplete={() => undefined} onBack={() => undefined} />);

    expect(screen.getByTestId("seed-source-reseed").textContent).not.toContain("discards");
  });
});

// ---------------------------------------------------------------------------
// Confirm behavior
// ---------------------------------------------------------------------------

describe("TouchSeedSourcePanel — confirm", () => {
  it("confirm calls setTouchSeedSource with the selection, then onComplete", () => {
    seedBase(); // absent -> default reseed
    let completed = false;
    render(
      <TouchSeedSourcePanel
        onComplete={() => {
          completed = true;
        }}
        onBack={() => undefined}
      />,
    );

    fireEvent.click(screen.getByTestId("seed-source-import-adapt"));
    fireEvent.click(screen.getByTestId("seed-source-confirm"));

    expect(useSurveySessionStore.getState().touchSeedSource).toBe("import-adapt");
    expect(completed).toBe(true);
  });

  it("explicit Reseed on a base that ships a layout shows the drop advisory and records reseed-from-desktop on confirm", () => {
    seedBase(PHONE_AND_TABLET_JSON); // usable base layout -> default is Import & adapt
    let completed = false;
    render(
      <TouchSeedSourcePanel
        onComplete={() => {
          completed = true;
        }}
        onBack={() => undefined}
      />,
    );

    // The drop advisory is present on the Reseed card regardless of which
    // choice is currently selected (it reflects the base's shipped platforms).
    expect(screen.getByTestId("seed-source-reseed").textContent).toContain(
      "discards the base's shipped tablet/desktop touch platforms",
    );

    fireEvent.click(screen.getByTestId("seed-source-reseed"));
    fireEvent.click(screen.getByTestId("seed-source-confirm"));

    expect(useSurveySessionStore.getState().touchSeedSource).toBe("reseed-from-desktop");
    expect(completed).toBe(true);
  });

  it("Back button calls the supplied onBack", () => {
    seedBase();
    let backCalled = false;
    render(
      <TouchSeedSourcePanel
        onComplete={() => undefined}
        onBack={() => {
          backCalled = true;
        }}
      />,
    );

    fireEvent.click(screen.getByTestId("seed-source-back"));
    expect(backCalled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Live preview switching (spec 035 R4a amendment)
// ---------------------------------------------------------------------------

describe("TouchSeedSourcePanel — live preview (R4a)", () => {
  it("shows the base-layout preview when Import & adapt is selected, and the derived reseed preview when Reseed is selected", () => {
    seedBase(PHONE_ONLY_JSON); // usable base layout -> default is Import & adapt
    render(<TouchSeedSourcePanel onComplete={() => undefined} onBack={() => undefined} />);

    // Default selection (Import & adapt) shows the base preview, not the
    // derived-reseed preview.
    expect(screen.getByTestId("seed-source-preview")).toBeTruthy();
    expect(screen.queryByTestId("seed-source-reseed-preview")).toBeNull();

    fireEvent.click(screen.getByTestId("seed-source-reseed"));

    // Selecting Reseed swaps the live preview to the derived layout, and
    // hides the base-layout preview.
    expect(screen.queryByTestId("seed-source-preview")).toBeNull();
    expect(screen.getByTestId("seed-source-reseed-preview")).toBeTruthy();
    // The pure deriveSeedLayout call succeeds against the seeded baseIr, so
    // this is the success branch (a rendered layout), not the error note.
    expect(screen.queryByTestId("seed-source-reseed-preview-error")).toBeNull();
  });

  it("renders the reseed-preview graceful fallback note when there is no baseIr to derive from", () => {
    // Fresh store, no instantiateFromBase call -> baseIr stays null.
    render(<TouchSeedSourcePanel onComplete={() => undefined} onBack={() => undefined} />);

    // No usable base layout either -> default selection is already Reseed.
    expect(screen.getByTestId("seed-source-reseed").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("seed-source-reseed-preview")).toBeTruthy();
    expect(screen.getByTestId("seed-source-reseed-preview-error")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// P1 fix: unplaced/spilled overflow characters surfaced in the live preview
// (structured data from scaffoldTouchLayoutWithDiagnostics -> deriveSeedLayout
// -> reseedResult.unplacedChars), never gating.
// ---------------------------------------------------------------------------

describe("TouchSeedSourcePanel — reseed extras advisory", () => {
  it("shows the reseed-extras advisory note listing a character spilled onto the space bar's extras sk[]", () => {
    const overflowChar = "ʔ"; // LATIN LETTER GLOTTAL STOP — no compact slot, no known neighbor
    seedBase(undefined, [makeOverflowGroup(overflowChar)]); // no base layout -> default is Reseed
    render(<TouchSeedSourcePanel onComplete={() => undefined} onBack={() => undefined} />);

    expect(screen.getByTestId("seed-source-reseed").getAttribute("aria-pressed")).toBe("true");
    const note = screen.getByTestId("seed-source-reseed-extras-note");
    expect(note).toBeTruthy();
    expect(note.textContent).toContain(overflowChar);
  });

  it("does not show the reseed-extras advisory note when nothing was spilled", () => {
    seedBase(); // no groups -> no overflow characters at all
    render(<TouchSeedSourcePanel onComplete={() => undefined} onBack={() => undefined} />);

    expect(screen.queryByTestId("seed-source-reseed-extras-note")).toBeNull();
  });

  it("never gates either choice — both cards stay clickable when the advisory is showing", () => {
    const overflowChar = "ʔ";
    seedBase(undefined, [makeOverflowGroup(overflowChar)]);
    render(<TouchSeedSourcePanel onComplete={() => undefined} onBack={() => undefined} />);

    expect(screen.getByTestId("seed-source-reseed-extras-note")).toBeTruthy();
    fireEvent.click(screen.getByTestId("seed-source-import-adapt"));
    expect(screen.getByTestId("seed-source-import-adapt").getAttribute("aria-pressed")).toBe("true");
  });
});

// ---------------------------------------------------------------------------
// P2 fix: a genuine deriveSeedLayout failure (as opposed to "no baseIr yet")
// must be logged, not swallowed identically to the expected empty case.
// ---------------------------------------------------------------------------

describe("TouchSeedSourcePanel — reseed derivation error logging", () => {
  it("logs via devLog.error and still renders the graceful fallback when deriveSeedLayout throws", () => {
    seedBase();
    const errorSpy = vi.spyOn(devLog, "error").mockImplementation(() => undefined);
    vi.mocked(deriveSeedLayout).mockImplementationOnce(() => {
      throw new Error("simulated genuine derivation failure");
    });

    render(<TouchSeedSourcePanel onComplete={() => undefined} onBack={() => undefined} />);

    expect(errorSpy).toHaveBeenCalled();
    expect(screen.getByTestId("seed-source-reseed-preview-error")).toBeTruthy();

    errorSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Draft-discard warning (R12) — only on re-entry with a DIFFERENT selection
// ---------------------------------------------------------------------------

describe("TouchSeedSourcePanel — draft-discard warning (R12)", () => {
  it("does not warn on a fresh entry (no recorded choice yet), even if a stray draft existed", () => {
    seedBase(PHONE_ONLY_JSON);
    // touchSeedSource is null (fresh) — the warning must never depend on
    // touchDraft alone.
    useWorkingCopyStore.getState().setTouchDraft({
      charTouchEntries: [["ä", fakeTouchAssignment]],
      suggestionResolvedChars: [],
    });
    render(<TouchSeedSourcePanel onComplete={() => undefined} onBack={() => undefined} />);

    fireEvent.click(screen.getByTestId("seed-source-reseed"));
    expect(screen.queryByTestId("seed-source-draft-warning")).toBeNull();
    expect(screen.getByTestId("seed-source-confirm").textContent).toBe("Confirm");
  });

  it("does not warn when re-confirming the SAME recorded choice, even with a draft present", () => {
    seedBase(PHONE_ONLY_JSON);
    useSurveySessionStore.setState({ touchSeedSource: "import-adapt" });
    useWorkingCopyStore.getState().setTouchDraft({
      charTouchEntries: [["ä", fakeTouchAssignment]],
      suggestionResolvedChars: [],
    });
    render(<TouchSeedSourcePanel onComplete={() => undefined} onBack={() => undefined} />);

    // Default selection on re-entry is the recorded choice — re-clicking the
    // same card keeps selected === storedSeedSource.
    fireEvent.click(screen.getByTestId("seed-source-import-adapt"));
    expect(screen.queryByTestId("seed-source-draft-warning")).toBeNull();
    expect(screen.getByTestId("seed-source-confirm").textContent).toBe("Confirm");
  });

  it("warns when re-entry picks a DIFFERENT value than the recorded choice, with a draft present", () => {
    seedBase(PHONE_ONLY_JSON);
    useSurveySessionStore.setState({ touchSeedSource: "import-adapt" });
    useWorkingCopyStore.getState().setTouchDraft({
      charTouchEntries: [["ä", fakeTouchAssignment]],
      suggestionResolvedChars: [],
    });
    render(<TouchSeedSourcePanel onComplete={() => undefined} onBack={() => undefined} />);

    fireEvent.click(screen.getByTestId("seed-source-reseed"));

    expect(screen.getByTestId("seed-source-draft-warning")).toBeTruthy();
    expect(screen.getByTestId("seed-source-confirm").textContent).toBe(
      "Discard touch edits & confirm",
    );
  });

  it("does not warn on a different selection when no touch draft exists", () => {
    seedBase(PHONE_ONLY_JSON);
    useSurveySessionStore.setState({ touchSeedSource: "import-adapt" });
    // touchDraft stays null (no in-progress touch edits).
    render(<TouchSeedSourcePanel onComplete={() => undefined} onBack={() => undefined} />);

    fireEvent.click(screen.getByTestId("seed-source-reseed"));

    expect(screen.queryByTestId("seed-source-draft-warning")).toBeNull();
    expect(screen.getByTestId("seed-source-confirm").textContent).toBe("Confirm");
  });

  it("confirming a changed selection past the warning records the new choice AND clears touchDraft", () => {
    seedBase(PHONE_ONLY_JSON);
    useSurveySessionStore.setState({ touchSeedSource: "import-adapt" });
    useWorkingCopyStore.getState().setTouchDraft({
      charTouchEntries: [["ä", fakeTouchAssignment]],
      suggestionResolvedChars: [],
    });
    render(<TouchSeedSourcePanel onComplete={() => undefined} onBack={() => undefined} />);

    fireEvent.click(screen.getByTestId("seed-source-reseed"));
    expect(screen.getByTestId("seed-source-draft-warning")).toBeTruthy();

    // Confirming past the warning is the wiring under test: the panel must
    // call setTouchSeedSource with the NEW value, and that setter (R12,
    // surveySessionStore.ts) is what actually clears touchDraft.
    fireEvent.click(screen.getByTestId("seed-source-confirm"));

    expect(useSurveySessionStore.getState().touchSeedSource).toBe("reseed-from-desktop");
    expect(useWorkingCopyStore.getState().touchDraft).toBeNull();
  });
});
