// OutputScreen — coverage-blocked banner rendering regression.
//
// Companion to ../editors/adapters/PhaseFGate.test.tsx: OutputScreen renders
// the SAME "finish every inventory character" explanation off the SAME
// shared gate (lib/unimplementedInventory.ts via usePreviewArtifact), so it
// is exposed to the identical empty-interpolation failure mode — a stale
// Lingui catalog entry with numbered placeholders (`{0}{1}{2}`) that no
// longer match the named `<Trans>` locals (`coverageUncoveredCharsList`,
// `coverageTargetGalleryLabel`) would render the character list and gallery
// name as blank while the count stayed correct. This test renders the real
// banner (through the real `en` catalog, via renderWithI18n) and asserts the
// actual uncovered characters and gallery label are present.
//
// Heavy leaf UI not relevant to the banner (PickerPane, SignUpPanel,
// ManagedPRSubmitPanel) is stubbed so the test isolates the right-pane
// coverage banner, following the precedent in
// hooks/usePreviewArtifact.coverageGate.test.ts (mock useKeyboardArtifact to
// force stage:"ready", seed the real working-copy store so the real
// usePreviewArtifact/inventoryCoverageGate pipeline runs).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, cleanup } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeTestIR, basicKbdus } from "@keyboard-studio/contracts/fixtures";
import type { Stage } from "../hooks/useKeyboardArtifact.ts";

const READY_STAGE: Stage = {
  kind: "ready",
  compileResult: { diagnostics: [] },
  jsBlobUrl: "blob:test",
  vfs: createVirtualFS([]),
  scaffoldWarnings: [],
  keyboardId: "test",
} as unknown as Stage;

vi.mock("../hooks/useKeyboardArtifact.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hooks/useKeyboardArtifact.ts")>()),
  useKeyboardArtifact: () => ({
    stage: READY_STAGE,
    retry: vi.fn(),
    recompile: vi.fn(),
  }),
}));

// Not relevant to the coverage banner — stub to keep the render lightweight.
vi.mock("./PickerPane.tsx", () => ({ PickerPane: () => null }));
vi.mock("./SignUpPanel.tsx", () => ({ SignUpPanel: () => null }));
vi.mock("./ManagedPRSubmitPanel.tsx", () => ({ ManagedPRSubmitPanel: () => null }));

function resetStore() {
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
}

function seedInstantiatedWorkingCopy(inventory: string[]) {
  const vfs = createVirtualFS([
    { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
  ]);
  useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir: makeTestIR([]) });
  useWorkingCopyStore.getState().recordPhase({
    phase: "B",
    answers: [],
    confirmedInventory: inventory,
  });
}

beforeEach(resetStore);
afterEach(() => {
  cleanup();
  resetStore();
  vi.clearAllMocks();
});

describe("OutputScreen — coverage-blocked banner", () => {
  it("renders the real uncovered characters (not empty) and a non-empty gallery label when desktop characters are unimplemented", async () => {
    const inventory = ["á", "é", "í", "ó", "ú"];
    seedInstantiatedWorkingCopy(inventory);
    // No mechanism assignments recorded — every inventory char is
    // unimplemented in the physical/desktop modality.

    const { OutputScreen } = await import("./OutputScreen.tsx");
    render(<OutputScreen />);

    const bodyText = document.body.textContent ?? "";
    for (const char of inventory) {
      expect(bodyText).toContain(char);
    }
    expect(bodyText).not.toMatch(/\{\d+\}/);
    expect(bodyText).toMatch(/Go back to the .*Gallery.* to finish them/);
    expect(bodyText).toContain("Mechanism Gallery");
  });

  it("truncates a long uncovered-character list with a '+N more' suffix instead of listing all of them", async () => {
    const inventory = Array.from({ length: 34 }, (_, i) => String.fromCharCode(0x0410 + i)); // Cyrillic run
    seedInstantiatedWorkingCopy(inventory);

    const { OutputScreen } = await import("./OutputScreen.tsx");
    render(<OutputScreen />);

    const bodyText = document.body.textContent ?? "";
    expect(bodyText).toContain("34 characters");
    expect(bodyText).toMatch(/\+22 more/);
  });
});

// ---------------------------------------------------------------------------
// "Go finish them now" — same P0 Back->Phase F regression class as
// PhaseFGate's "Go back and finish" (see ../editors/adapters/PhaseFGate.test.tsx
// for the full root-cause writeup). OutputScreen's banner offers the
// identical "route to the unfinished gallery" action, reachable directly via
// #output (bypassing "help" entirely) — it shared the same buggy
// forward-push `advance()` call before this fix, and shares the same
// `backToUnfinishedGallery` fix now.
// ---------------------------------------------------------------------------

describe("OutputScreen — \"Go finish them now\" (Back regression)", () => {
  it("routes back without corrupting history — a subsequent ordinary Back never resurfaces 'help'", async () => {
    const inventory = ["á", "é"];
    seedInstantiatedWorkingCopy(inventory);
    // No desktop mechanism assignments recorded — blockedOnDesktop === true.
    // Simulate: the author reached "help" earlier in the survey, hit the
    // hard gate, then navigated to #output directly (nav-bar) instead of
    // using PhaseFGate's own button — activeStepId is still "help".
    const session = useSurveySessionStore.getState();
    session.advance("mechanisms");
    session.advance("touch_seed_source");
    session.advance("touch");
    session.advance("help");
    expect(useSurveySessionStore.getState().activeStepId).toBe("help");

    const { OutputScreen } = await import("./OutputScreen.tsx");
    render(<OutputScreen />);

    const goToGalleryBtn = screen.getByTestId("output-coverage-goto-gallery");
    fireEvent.click(goToGalleryBtn);

    // Routed to "mechanisms" (blockedOnDesktop) — not stuck on "help".
    expect(useSurveySessionStore.getState().activeStepId).toBe("mechanisms");

    // The regression proof: the SAME ordinary Back traversal an author would
    // perform next must NOT resurface "help".
    useSurveySessionStore.getState().popHistory();
    expect(useSurveySessionStore.getState().activeStepId).not.toBe("help");
    expect(useSurveySessionStore.getState().activeStepId).toBe("touch_seed_source");
  });
});
