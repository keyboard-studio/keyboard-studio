// Unit tests for TouchSeedSourcePanel (spec 035 T014, contracts/seed-source-fork.md;
// spec 035 R4b amendment — real OSK live preview).
//
// Coverage:
//   - default selection with/without a usable base touch layout (R4)
//   - malformed base JSON is treated as absent, with a distinct note (R4)
//   - tablet-drop advisory rendered on the Reseed card when the base ships a
//     non-phone platform (R7/R10)
//   - confirm calls setTouchSeedSource then onComplete
//   - the draft-discard warning (R12) is shown ONLY on re-entry with a
//     DIFFERENT selection than the recorded choice, while a touch draft exists
//   - the live preview is now the REAL OSK (mocked here the same way
//     TouchGallery.test.tsx mocks it — no iframe/KMW in jsdom), forced into
//     mobile/touch mode, swapping its injected VFS content per selected card

import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, fireEvent, cleanup } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { TouchSeedSourcePanel } from "./TouchSeedSourcePanel.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { TouchAssignment, IRGroup, IRRule, KeyboardIR, Pattern, VirtualFS } from "@keyboard-studio/contracts";
import { devLog } from "@keyboard-studio/contracts/dev-log";
import { deriveSeedLayout } from "../../lib/buildTouchLayoutJson.ts";
import type { Stage } from "../../hooks/useKeyboardArtifact.ts";
import { ASSIGN_LOOP_LEFT_PANE_PCT } from "../assignLoop/AssignLoopShell.tsx";

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
// Mock useKeyboardArtifact — capture the (baseKeyboard, scaffoldSpec,
// vfsTransform) triple passed in, same pattern as TouchGallery.test.tsx. No
// real fetch/compile/WASM runs in jsdom.
// ---------------------------------------------------------------------------

type CapturedVfsTransform = (vfs: VirtualFS, kbId: string) => { warnings: string[] };

const { capturedArtifactCallRef } = vi.hoisted(() => ({
  capturedArtifactCallRef: {
    current: null as null | {
      baseKeyboard: unknown;
      scaffoldSpec: unknown;
      vfsTransform: CapturedVfsTransform | null | undefined;
    },
  },
}));

vi.mock("../../hooks/useKeyboardArtifact.ts", () => ({
  useKeyboardArtifact: (
    baseKeyboard: unknown,
    scaffoldSpec: unknown,
    vfsTransform: CapturedVfsTransform | null | undefined,
  ) => {
    capturedArtifactCallRef.current = { baseKeyboard, scaffoldSpec, vfsTransform };
    return { stage: { kind: "idle" } as Stage, retry: vi.fn(), recompile: vi.fn() };
  },
}));

// ---------------------------------------------------------------------------
// Mock OSKFrame — no iframe / KMW environment; surface the props this panel
// is contractually required to lock (oskMode="tablet", no mode toggle).
// ---------------------------------------------------------------------------

vi.mock("../../components/OSKFrame.tsx", () => ({
  OSKFrame: ({ oskMode, stage }: { oskMode: string; stage: Stage }) => (
    <div data-testid="osk-frame" data-osk-mode={oskMode} data-stage={stage.kind}>
      osk-frame-mock
    </div>
  ),
}));

/** Invoke the most recently captured vfsTransform with a fresh VFS. */
function runCapturedVfsTransform(kbId: string): VirtualFS {
  const call = capturedArtifactCallRef.current;
  if (!call || !call.vfsTransform) {
    throw new Error("vfsTransform was not captured — useKeyboardArtifact mock not called");
  }
  const vfs = createVirtualFS([]);
  call.vfsTransform(vfs, kbId);
  return vfs;
}

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
 * spills it onto the space bar's "extras" sk[] rather than dropping it. That
 * makes it reachable, NOT a genuine data-loss case (see
 * makeUnreachableSymbolIR below for the fixture that is).
 */
function makeOverflowGroup(overflowChar: string): IRGroup {
  const rule: IRRule = {
    nodeId: "rule:overflow",
    context: [{ kind: "vkey", name: "K_oE2", modifiers: [] }],
    output: [{ kind: "char", value: overflowChar }],
  };
  return { nodeId: "group:overflow", name: "main", usingKeys: true, rules: [rule], readonly: false };
}

/** Seed baseVfs/baseIr from a fully-built KeyboardIR (bypassing makeTestIR),
 *  for fixtures that need stores/recognizedPatterns alongside groups. */
function seedBaseWithIr(ir: KeyboardIR, touchLayoutJson?: string) {
  const files = [{ path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false }];
  if (touchLayoutJson !== undefined) {
    files.push({
      path: "source/basic_kbdus.keyman-touch-layout",
      content: touchLayoutJson,
      isBinary: false,
    });
  }
  const vfs = createVirtualFS(files);
  useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });
}

/**
 * A KeyboardIR with a genuinely-unreachable rejected deadkey-successor
 * candidate: `symbol` is unrelated to the base letter it was rejected from,
 * never assigned to any vkey elsewhere, and not a numeric-layer literal — so
 * it ends up nowhere in the derived layout. Mirrors the fixture in
 * buildTouchLayoutJson.test.ts / scaffoldTouchLayout.test.ts.
 */
function makeUnreachableSymbolIR(symbol: string): KeyboardIR {
  const baseVkey = "K_E";
  const baseChar = "e";
  const bodyRule: IRRule = {
    nodeId: "rule:body",
    context: [
      { kind: "deadkey", id: 1 } as never,
      { kind: "any", storeRef: "s_base" },
    ],
    output: [{ kind: "index", storeRef: "s_out", offset: 2 }],
  };
  const baseLetterRule: IRRule = {
    nodeId: "rule:base",
    context: [{ kind: "vkey", name: baseVkey, modifiers: [] }],
    output: [{ kind: "char", value: baseChar }],
  };
  const pattern: Pattern = {
    id: "test_s02_unreachable",
    title: "Rejected candidate with no home anywhere in the layout",
    description: "Locks the TRUE data-loss diagnostic at the panel level",
    category: "desktop",
    appliesTo: [],
    strategyId: "S-02",
    origin: "recognized",
    ownedNodes: [{ nodeId: "rule:body", kind: "rule" }],
    questions: [],
    kmnFragment: "+ [K_TILDE] > dk(z)\ndk(z) + any(s_base) > index(s_out, 2)",
    tests: [],
    validatedForFamilies: [],
    sourceKeyboards: [],
    reviewedBy: "test",
    reviewDate: "2026-07-28",
  };
  return {
    ...makeTestIR(
      [{ nodeId: "group:main", name: "main", usingKeys: true, rules: [baseLetterRule, bodyRule], readonly: false }],
      [
        { nodeId: "store:base", name: "s_base", items: [{ kind: "char", value: baseChar }], isSystem: false },
        { nodeId: "store:out", name: "s_out", items: [{ kind: "char", value: symbol }], isSystem: false },
      ],
    ),
    recognizedPatterns: [pattern],
  };
}

afterEach(() => {
  cleanup();
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
  vi.clearAllMocks();
  capturedArtifactCallRef.current = null;
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

  it("states the Reseed option discards phone/desktop platforms when the base ships one", () => {
    seedBase(PHONE_AND_TABLET_JSON);
    render(<TouchSeedSourcePanel onComplete={() => undefined} onBack={() => undefined} />);

    expect(screen.getByTestId("seed-source-reseed").textContent).toContain(
      "discards the base's shipped phone/desktop touch platforms",
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
      "discards the base's shipped phone/desktop touch platforms",
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
    // No baseIr -> no artifact to build -> the OSK is never mounted.
    expect(screen.queryByTestId("osk-frame")).toBeNull();
  });

  it("sizes the preview column the same as every other live preview — the shared AssignLoopShell 45/55 split, not an unbounded full-width column", () => {
    // Fresh store -> default selection is Reseed, so this exercises the
    // reseed preview's column specifically (the regression this guards
    // against: the reseed preview stretching to ~full page width).
    const { container } = render(
      <TouchSeedSourcePanel onComplete={() => undefined} onBack={() => undefined} />,
    );

    const grid = container.querySelector(".ks-touch-seed-grid");
    expect(grid).toBeTruthy();
    // The left (choices) column is capped at ASSIGN_LOOP_LEFT_PANE_PCT — the
    // SAME left-pane share AssignLoopShell gives MechanismGallery/
    // TouchGallery's live preview — so the right (preview) column always
    // gets the matching ~`100 - ASSIGN_LOOP_LEFT_PANE_PCT`% share, never an
    // unbounded `1fr` of the whole remaining page width.
    expect((grid as HTMLElement).style.gridTemplateColumns).toBe(
      `minmax(320px, ${ASSIGN_LOOP_LEFT_PANE_PCT}%) 1fr`,
    );
  });
});

// ---------------------------------------------------------------------------
// Real OSK live preview (spec 035 R4b amendment — supersedes the homemade
// TouchLayoutPreview keycap grid). The OSK itself is mocked (no iframe/KMW in
// jsdom, same pattern as TouchGallery.test.tsx); these tests assert the
// wiring: forced tablet mode, no mode toggle, and the injected VFS
// content swapping per the currently-selected card.
// ---------------------------------------------------------------------------

describe("TouchSeedSourcePanel — real OSK preview (R4b)", () => {
  it("mounts the real OSK forced into tablet mode, with no desktop/mobile toggle on this screen", () => {
    seedBase(PHONE_ONLY_JSON);
    render(<TouchSeedSourcePanel onComplete={() => undefined} onBack={() => undefined} />);

    const osk = screen.getByTestId("osk-frame");
    expect(osk.getAttribute("data-osk-mode")).toBe("tablet");
    // This screen never renders the Desktop OSK / Mobile KB toggle.
    expect(screen.queryByTestId("osk-mode-toggle")).toBeNull();
    expect(screen.queryByText("Desktop OSK")).toBeNull();
  });

  it("feeds useKeyboardArtifact the working copy's baseKeyboard", () => {
    seedBase(PHONE_ONLY_JSON);
    render(<TouchSeedSourcePanel onComplete={() => undefined} onBack={() => undefined} />);

    expect(capturedArtifactCallRef.current?.baseKeyboard).toBe(
      useWorkingCopyStore.getState().baseKeyboard,
    );
  });

  it("injects a DIFFERENT derived .keyman-touch-layout per selected card — Import & adapt carries the base's shipped key, Reseed derives fresh", () => {
    seedBase(PHONE_ONLY_JSON); // ships a "q"/"w" phone layout -> default Import & adapt
    render(<TouchSeedSourcePanel onComplete={() => undefined} onBack={() => undefined} />);

    const importAdaptVfs = runCapturedVfsTransform("basic_kbdus");
    const importAdaptJson = importAdaptVfs.get("source/basic_kbdus.keyman-touch-layout")?.content;
    expect(typeof importAdaptJson).toBe("string");
    // Case B (raw-JSON splice) preserves the base's shipped key text verbatim.
    expect(importAdaptJson).toContain('"q"');

    fireEvent.click(screen.getByTestId("seed-source-reseed"));

    const reseedVfs = runCapturedVfsTransform("basic_kbdus");
    const reseedJson = reseedVfs.get("source/basic_kbdus.keyman-touch-layout")?.content;
    expect(typeof reseedJson).toBe("string");
    // Case A (fresh scaffold from the empty-rule test IR) does not carry the
    // base's own shipped "q" key forward — the two derivations differ.
    expect(reseedJson).not.toBe(importAdaptJson);
  });

  it("does not inject a .keyman-touch-layout entry when the seed derivation failed (graceful, no partial/stale artifact)", () => {
    seedBase(); // no baseIr issue here, but force the catch branch below
    vi.mocked(deriveSeedLayout).mockImplementationOnce(() => {
      throw new Error("simulated genuine derivation failure");
    });
    const errorSpy = vi.spyOn(devLog, "error").mockImplementation(() => undefined);

    render(<TouchSeedSourcePanel onComplete={() => undefined} onBack={() => undefined} />);

    expect(screen.queryByTestId("osk-frame")).toBeNull();
    const vfs = runCapturedVfsTransform("basic_kbdus");
    expect(vfs.get("source/basic_kbdus.keyman-touch-layout")).toBeUndefined();

    errorSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// unplacedChars is a TRUE reachability diagnostic surfaced in the live
// preview (structured data from scaffoldTouchLayoutWithDiagnostics ->
// deriveSeedLayout -> reseedResult.unplacedChars), never gating. A character
// merely spilled onto the space bar's "extras" sk[] is reachable there and
// must NOT show the advisory — only a character reachable nowhere in the
// derived layout does.
// ---------------------------------------------------------------------------

describe("TouchSeedSourcePanel — reseed extras advisory", () => {
  it("does not show the advisory note for a character spilled onto the space bar's extras sk[] — it is reachable there", () => {
    const overflowChar = "ʔ"; // LATIN LETTER GLOTTAL STOP — no compact slot, no known neighbor
    seedBase(undefined, [makeOverflowGroup(overflowChar)]); // no base layout -> default is Reseed
    render(<TouchSeedSourcePanel onComplete={() => undefined} onBack={() => undefined} />);

    expect(screen.getByTestId("seed-source-reseed").getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByTestId("seed-source-reseed-extras-note")).toBeNull();
  });

  it("does not show the reseed-extras advisory note when nothing was spilled", () => {
    seedBase(); // no groups -> no overflow characters at all
    render(<TouchSeedSourcePanel onComplete={() => undefined} onBack={() => undefined} />);

    expect(screen.queryByTestId("seed-source-reseed-extras-note")).toBeNull();
  });

  it("shows the advisory note listing a rejected deadkey-successor candidate that is genuinely unreachable elsewhere", () => {
    const symbol = "§";
    seedBaseWithIr(makeUnreachableSymbolIR(symbol)); // no base layout -> default is Reseed
    render(<TouchSeedSourcePanel onComplete={() => undefined} onBack={() => undefined} />);

    expect(screen.getByTestId("seed-source-reseed").getAttribute("aria-pressed")).toBe("true");
    const note = screen.getByTestId("seed-source-reseed-extras-note");
    expect(note).toBeTruthy();
    expect(note.textContent).toContain(symbol);
    // Honest wording — no longer claims "relocated to the space bar" for a
    // character that in fact ended up nowhere in the layout.
    expect(note.textContent).toContain("could not be placed");
    expect(note.textContent).toContain("omitted");
  });

  it("never gates either choice — both cards stay clickable when the advisory is showing", () => {
    const symbol = "§";
    seedBaseWithIr(makeUnreachableSymbolIR(symbol));
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
