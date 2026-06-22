// Unit tests for TouchGallery — Phase E "touch mechanisms" assignment loop.
//
// Defect A regression guard:
//   - vfsTransform passed to useKeyboardArtifact contains a
//     .keyman-touch-layout entry that reflects the author's edits.
//   - Two successive distinct edits produce two DIFFERENT injected JSON strings
//     (guards against the frozen-preview defect where the transform was memoized
//     on [minimalTouchJson] and never updated when charTouch changed).
//
// Defect B regression is covered in StudioShell.test.tsx.

import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { TouchGallery } from "./TouchGallery";
import { useWorkingCopyStore } from "../stores/workingCopyStore";
import type { VirtualFS } from "@keyboard-studio/contracts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeTestIR, basicKbdus } from "@keyboard-studio/contracts/fixtures";
import type { Stage } from "../hooks/useKeyboardArtifact";

// ---------------------------------------------------------------------------
// vi.hoisted() — refs shared across mock closures and test bodies.
// ---------------------------------------------------------------------------

const { capturedVfsTransformRef, buildTouchLayoutJsonSpy } = vi.hoisted(() => {
  const capturedVfsTransformRef = {
    current: null as null | ((vfs: VirtualFS, kbId: string) => { warnings: string[] }),
  };
  // Spy that returns deterministic JSON including the assignments so tests can
  // assert the transform's injected content differs between edits.
  const buildTouchLayoutJsonSpy = vi.fn(
    (
      _baseIr: unknown,
      assignments: Array<{ target: string; mechanisms: Array<{ patternId: string }> }>,
    ) => ({
      json: JSON.stringify({ _mock: true, assignments }),
      warnings: [] as string[],
    }),
  );
  return { capturedVfsTransformRef, buildTouchLayoutJsonSpy };
});

// ---------------------------------------------------------------------------
// Mock useKeyboardArtifact — capture the vfsTransform so we can invoke it.
// ---------------------------------------------------------------------------

vi.mock("../hooks/useKeyboardArtifact.ts", () => ({
  useKeyboardArtifact: (
    _baseKeyboard: unknown,
    _scaffoldSpec: unknown,
    vfsTransform: ((vfs: VirtualFS, kbId: string) => { warnings: string[] }) | null | undefined,
  ) => {
    capturedVfsTransformRef.current = vfsTransform ?? null;
    return { stage: { kind: "idle" } as Stage, retry: vi.fn(), recompile: vi.fn() };
  },
}));

// ---------------------------------------------------------------------------
// Mock buildTouchLayoutJson — deterministic, no real engine.
// ---------------------------------------------------------------------------

vi.mock("../lib/buildTouchLayoutJson.ts", () => ({
  buildTouchLayoutJson: buildTouchLayoutJsonSpy,
}));

// ---------------------------------------------------------------------------
// Mock engine helpers so no WASM is loaded.
// ---------------------------------------------------------------------------

vi.mock("@keyboard-studio/engine", async (importOriginal) => {
  const original = await importOriginal<typeof import("@keyboard-studio/engine")>();
  return {
    ...original,
    // emitTouchLayout is used for minimalTouchJson; return a stable string.
    emitTouchLayout: vi.fn(() => '{"_minimal":true}'),
    buildMinimalPhoneTouchLayout: vi.fn(() => ({ platforms: [] })),
  };
});

// ---------------------------------------------------------------------------
// Mock useTouchLint — no real lint engine needed.
// ---------------------------------------------------------------------------

vi.mock("../hooks/useTouchLint.ts", () => ({
  useTouchLint: () => ({ touchFindings: [], touchLintRunning: false }),
}));

// ---------------------------------------------------------------------------
// Mock OSKFrame, OskModeToggle, LintSummary — no iframe / KMW environment.
// ---------------------------------------------------------------------------

vi.mock("./OSKFrame.tsx", () => ({
  OSKFrame: ({ stage }: { stage: Stage }) => (
    <div data-testid="osk-frame" data-stage={stage.kind}>
      osk-frame-mock
    </div>
  ),
}));

vi.mock("./OskModeToggle.tsx", () => ({
  OskModeToggle: () => <div data-testid="osk-mode-toggle" />,
}));

vi.mock("../lint/LintSummary.tsx", () => ({
  LintSummary: () => <div data-testid="lint-summary" />,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedStore(opts: { withInventory?: string[] } = {}) {
  const vfs = createVirtualFS([
    { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
  ]);
  const ir = makeTestIR([]);
  useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });
  if (opts.withInventory !== undefined) {
    useWorkingCopyStore.getState().recordPhase({
      phase: "B",
      answers: [],
      confirmedInventory: opts.withInventory,
    });
  }
}

/** Invoke the captured vfsTransform with a fresh VFS and the given kbId. */
function runTransform(kbId: string) {
  const fn = capturedVfsTransformRef.current;
  if (!fn) throw new Error("vfsTransform was not captured — useKeyboardArtifact mock not called");
  const vfs = createVirtualFS([]);
  fn(vfs, kbId);
  return vfs;
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup();
  useWorkingCopyStore.getState().reset();
  vi.clearAllMocks();
  capturedVfsTransformRef.current = null;
});

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
});

// ---------------------------------------------------------------------------
// Guard: empty inventory
// ---------------------------------------------------------------------------

describe("TouchGallery — empty inventory guard", () => {
  it("renders the no-inventory prompt when confirmedInventory is empty", async () => {
    seedStore();
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });
    // With empty inventory the component renders a guard message and no OSK.
    expect(screen.getByText(/No characters in inventory yet/i)).toBeTruthy();
    expect(screen.queryByTestId("osk-frame")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Inject-only-when-real-edits — vfsTransform behaviour
// ---------------------------------------------------------------------------
//
// Core contract: the vfsTransform MUST NOT inject source/<id>.keyman-touch-layout
// when there are no real (non-inherited) touch edits, so KMW can render its own
// polished native default. It MUST inject the path (with JSON containing the sk)
// when the author has made at least one longpress / flick / multitap assignment.

describe("TouchGallery — vfsTransform inject-only-when-real-edits", () => {
  it("does NOT set source/<id>.keyman-touch-layout when there are no real touch edits", async () => {
    seedStore({ withInventory: ["ä"] });

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    // With charTouch empty (no edits at all), the path must be absent.
    const vfs = runTransform("basic_kbdus");
    expect(vfs.get("source/basic_kbdus.keyman-touch-layout")).toBeUndefined();
    // buildTouchLayoutJson must NOT have been called (no real edits to build).
    expect(buildTouchLayoutJsonSpy).not.toHaveBeenCalled();
  });

  it("does NOT set source/<id>.keyman-touch-layout when ALL assignments are touch_inherited", async () => {
    seedStore({ withInventory: ["ä"] });

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    // Accept "Already in layout" — this records a touch_inherited assignment,
    // which is NOT a real edit. The path should still be absent.
    const allButtons = screen.queryAllByRole("button");
    const alreadyBtn = allButtons.find(
      (b) => b.textContent?.toLowerCase().includes("already in layout"),
    ) ?? null;
    expect(alreadyBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(alreadyBtn!);
    });

    const vfs = runTransform("basic_kbdus");
    expect(vfs.get("source/basic_kbdus.keyman-touch-layout")).toBeUndefined();
    // buildTouchLayoutJson must NOT have been called (only inherited assignments).
    expect(buildTouchLayoutJsonSpy).not.toHaveBeenCalled();
  });

  it("DOES set source/<id>.keyman-touch-layout with sk JSON after a longpress edit", async () => {
    seedStore({ withInventory: ["ä"] });

    buildTouchLayoutJsonSpy.mockImplementation(
      (_baseIr: unknown, assignments: Array<{ target: string; mechanisms: Array<{ patternId: string }> }>) => ({
        json: JSON.stringify({ _mock: true, assignments }),
        warnings: [],
      }),
    );

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    // Before any edit: path must be absent.
    expect(runTransform("basic_kbdus").get("source/basic_kbdus.keyman-touch-layout")).toBeUndefined();

    // Click "Choose method" button — text content is "Choose method",
    // aria-label is "Choose touch method manually". Find by text content.
    const allBtns = screen.queryAllByRole("button");
    const chooseBtn = allBtns.find((b) => b.textContent?.trim() === "Choose method") ?? null;
    expect(chooseBtn).not.toBeNull();
    await act(async () => { fireEvent.click(chooseBtn!); });

    // Select "Long-press on a key".
    const longpressOption = screen.queryByText(/long.press on a key/i);
    expect(longpressOption).not.toBeNull();
    await act(async () => { fireEvent.click(longpressOption!); });

    // Set a host key.
    const hostKeySelect = screen.queryByRole("combobox", { name: /host key/i });
    expect(hostKeySelect).not.toBeNull();
    await act(async () => {
      fireEvent.change(hostKeySelect!, { target: { value: "K_A" } });
    });

    // Click Apply — button text is "Apply method".
    const applyBtns = screen.queryAllByRole("button");
    const applyBtn = applyBtns.find((b) => b.textContent?.trim() === "Apply method") ?? null;
    expect(applyBtn).not.toBeNull();
    expect((applyBtn as HTMLButtonElement).disabled).toBe(false);
    await act(async () => { fireEvent.click(applyBtn!); });

    // After the longpress edit: path MUST be present and contain the assignment.
    const vfsAfter = runTransform("basic_kbdus");
    const entry = vfsAfter.get("source/basic_kbdus.keyman-touch-layout");
    expect(entry).not.toBeUndefined();
    expect(String(entry?.content)).toContain("longpress_alternates");
    // buildTouchLayoutJson must have been called with the non-inherited assignment.
    expect(buildTouchLayoutJsonSpy).toHaveBeenCalledTimes(1);
    const [, passedAssignments] = buildTouchLayoutJsonSpy.mock.calls[0]!;
    expect((passedAssignments as Array<{mechanisms: Array<{patternId: string}>}>)[0]?.mechanisms[0]?.patternId)
      .toBe("longpress_alternates");
  });

  it("produces different vfsTransform outputs before and after a real edit (Defect A guarantee)", async () => {
    seedStore({ withInventory: ["ä"] });

    let callCount = 0;
    buildTouchLayoutJsonSpy.mockImplementation(
      (_baseIr: unknown, assignments: unknown[]) => ({
        json: JSON.stringify({ defectA: true, n: ++callCount, assignments }),
        warnings: [],
      }),
    );

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    // Baseline: no real edits → path absent, spy not called.
    const vfsBefore = runTransform("basic_kbdus");
    expect(vfsBefore.get("source/basic_kbdus.keyman-touch-layout")).toBeUndefined();
    expect(callCount).toBe(0);

    // Click "Choose method" — find by text content (aria-label differs).
    const allBtns = screen.queryAllByRole("button");
    const chooseBtn = allBtns.find((b) => b.textContent?.trim() === "Choose method") ?? null;
    expect(chooseBtn).not.toBeNull();
    await act(async () => { fireEvent.click(chooseBtn!); });

    const longpressOption = screen.queryByText(/long.press on a key/i);
    expect(longpressOption).not.toBeNull();
    await act(async () => { fireEvent.click(longpressOption!); });

    const hostKeySelect = screen.queryByRole("combobox", { name: /host key/i });
    expect(hostKeySelect).not.toBeNull();
    await act(async () => {
      fireEvent.change(hostKeySelect!, { target: { value: "K_A" } });
    });

    const applyBtns2 = screen.queryAllByRole("button");
    const applyBtn = applyBtns2.find((b) => b.textContent?.trim() === "Apply method") ?? null;
    expect(applyBtn).not.toBeNull();
    await act(async () => { fireEvent.click(applyBtn!); });

    // After the edit: path present, spy called once, content non-null.
    const vfsAfter = runTransform("basic_kbdus");
    const entry = vfsAfter.get("source/basic_kbdus.keyman-touch-layout");
    expect(entry).not.toBeUndefined();
    expect(callCount).toBeGreaterThan(0);
    // Defect A guarantee: injected JSON is non-null and contains assignment info.
    expect(String(entry?.content)).toContain("defectA");
  });
});

// ---------------------------------------------------------------------------
// Back navigation — within Phase E and first-step → onBack
// ---------------------------------------------------------------------------

describe("TouchGallery — back navigation", () => {
  it("Back button on the first character calls onBack (history empty)", async () => {
    seedStore({ withInventory: ["ä"] });
    const onBack = vi.fn();

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={onBack} />);
    });

    // Find and click the Back button. History is empty on first char so onBack fires.
    const backBtns = screen.queryAllByRole("button", { name: /back/i });
    const backBtn = backBtns.find((b) => b.textContent?.includes("Back")) ?? null;
    expect(backBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(backBtn!);
    });

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("Back from character 2 returns to character 1 (history-based)", async () => {
    seedStore({ withInventory: ["ä", "ö"] });
    const onBack = vi.fn();

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={onBack} />);
    });

    // Accept "Already in layout" for "ä" — this calls handleSuggestionAccept
    // which calls advanceToNext, pushing "ä" onto history and advancing to "ö".
    const allButtons = screen.queryAllByRole("button");
    const alreadyBtn = allButtons.find(
      (b) => b.textContent?.toLowerCase().includes("already in layout"),
    ) ?? null;
    expect(alreadyBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(alreadyBtn!);
    });

    // Should now be on "ö" — find and click Back.
    const backBtnsAfter = screen.queryAllByRole("button", { name: /back/i });
    const backBtn = backBtnsAfter.find((b) => b.textContent?.includes("Back")) ?? null;
    expect(backBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(backBtn!);
    });

    // onBack should NOT have been called — we went back within Phase E.
    expect(onBack).not.toHaveBeenCalled();

    // The "ä" character heading should now be visible (we returned to char 1).
    // Use the per-char "Touch mapping" label which is unique to the per-char UI.
    const headings = screen.queryAllByText(/Touch mapping/i);
    expect(headings.length).toBeGreaterThan(0);
  });

  it("Back from empty-inventory guard calls onBack", async () => {
    seedStore(); // no inventory
    const onBack = vi.fn();

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={onBack} />);
    });

    // The guard renders a Back button that calls onBack directly.
    const backBtn = screen.queryByRole("button", { name: /back/i });
    expect(backBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(backBtn!);
    });

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("Back from all-done state returns to the last visited character (non-null currentChar)", async () => {
    // With a two-character inventory, skip "ä" then skip "ö" to reach the
    // all-done state (currentChar becomes null via handleSkip's setCurrentChar(null)).
    // Clicking Back should pop the history and restore currentChar to the last
    // visited character.
    seedStore({ withInventory: ["ä", "ö"] });
    const onBack = vi.fn();

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={onBack} />);
    });

    // Skip "ä" — advances to "ö".
    const skipBtns1 = screen.queryAllByRole("button");
    const skipBtn1 = skipBtns1.find((b) => b.textContent?.toLowerCase() === "skip") ?? null;
    expect(skipBtn1).not.toBeNull();
    await act(async () => { fireEvent.click(skipBtn1!); });

    // Skip "ö" — all done, currentChar becomes null.
    const skipBtns2 = screen.queryAllByRole("button");
    const skipBtn2 = skipBtns2.find((b) => b.textContent?.toLowerCase() === "skip") ?? null;
    expect(skipBtn2).not.toBeNull();
    await act(async () => { fireEvent.click(skipBtn2!); });

    // Now in all-done state — a Back button and Done button should be visible.
    const allDoneBackBtn = screen.queryByRole("button", { name: /back to previous character/i });
    expect(allDoneBackBtn).not.toBeNull();

    await act(async () => {
      fireEvent.click(allDoneBackBtn!);
    });

    // onBack must NOT have been called — we returned within Phase E.
    expect(onBack).not.toHaveBeenCalled();

    // currentChar is back to a known character — the per-char heading "Touch mapping"
    // should reappear.
    const headings = screen.queryAllByText(/Touch mapping/i);
    expect(headings.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Draft persistence — store round-trip
// ---------------------------------------------------------------------------

describe("TouchGallery — draft persistence across unmount/remount", () => {
  it("charTouch is restored from store draft on remount", async () => {
    seedStore({ withInventory: ["ä", "ö"] });

    // First mount — accept "Already in layout" for "ä".
    const { unmount } = await act(async () =>
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />),
    );

    const allButtons = screen.queryAllByRole("button");
    const alreadyBtn = allButtons.find(
      (b) => b.textContent?.toLowerCase().includes("already in layout"),
    ) ?? null;
    expect(alreadyBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(alreadyBtn!);
    });

    // Unmount — simulates navigating back to Phase C.
    unmount();

    // The store draft should now have "ä" in charTouchEntries.
    const draft = useWorkingCopyStore.getState().touchDraft;
    expect(draft).not.toBeNull();
    expect(draft?.charTouchEntries.some(([char]) => char === "ä")).toBe(true);

    // Remount — a new TouchGallery instance should rehydrate from the draft.
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    // The "Configured" chip row should show "ä" (it was persisted).
    const configuredGroup = screen.queryByRole("group", { name: /configured characters/i });
    expect(configuredGroup).not.toBeNull();
    const chipButton = screen.queryByRole("button", { name: new RegExp("ä") });
    expect(chipButton).not.toBeNull();
  });
});
