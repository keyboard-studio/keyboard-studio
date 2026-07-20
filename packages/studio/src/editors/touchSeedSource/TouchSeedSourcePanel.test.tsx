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

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { TouchSeedSourcePanel } from "./TouchSeedSourcePanel.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { TouchAssignment } from "@keyboard-studio/contracts";

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

/** Seed baseVfs/baseIr, optionally with a `.keyman-touch-layout` file. */
function seedBase(touchLayoutJson?: string) {
  const files = [{ path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false }];
  if (touchLayoutJson !== undefined) {
    files.push({
      path: "source/basic_kbdus.keyman-touch-layout",
      content: touchLayoutJson,
      isBinary: false,
    });
  }
  const vfs = createVirtualFS(files);
  const ir = makeTestIR([]);
  useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });
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
    expect(screen.getByTestId("seed-source-absent-note")).toBeTruthy();
  });

  it("treats malformed base touch-layout JSON as absent, with a distinct note", () => {
    seedBase(MALFORMED_JSON);
    render(<TouchSeedSourcePanel onComplete={() => undefined} onBack={() => undefined} />);

    // Same default as "absent" (Reseed selected)...
    expect(screen.getByTestId("seed-source-reseed").getAttribute("aria-pressed")).toBe("true");
    // ...but the note text distinguishes malformed from truly absent.
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
