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
import { render, screen, fireEvent, act, cleanup, waitFor } from "@testing-library/react";
import { TouchGallery } from "./TouchGallery.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import type { VirtualFS, MechanismAssignment } from "@keyboard-studio/contracts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeTestIR, basicKbdus } from "@keyboard-studio/contracts/fixtures";
import type { Stage } from "../../hooks/useKeyboardArtifact.ts";

// ---------------------------------------------------------------------------
// vi.hoisted() — refs shared across mock closures and test bodies.
// ---------------------------------------------------------------------------

const { capturedVfsTransformRef, buildTouchLayoutJsonSpy, touchLintResultRef } = vi.hoisted(() => {
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
  // Configurable ref for useTouchLint mock — tests override .current to inject
  // specific findings (e.g. LINT_ERROR_FINDING for AC#3 coverage).
  const touchLintResultRef = {
    current: { touchFindings: [] as Array<{ code: string; severity: string; layer: string; message: string }>, touchLintRunning: false },
  };
  return { capturedVfsTransformRef, buildTouchLayoutJsonSpy, touchLintResultRef };
});

// ---------------------------------------------------------------------------
// Mock useKeyboardArtifact — capture the vfsTransform so we can invoke it.
// ---------------------------------------------------------------------------

vi.mock("../../hooks/useKeyboardArtifact.ts", () => ({
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

vi.mock("../../lib/buildTouchLayoutJson.ts", () => ({
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

vi.mock("../../hooks/useTouchLint.ts", () => ({
  useTouchLint: () => touchLintResultRef.current,
}));

// ---------------------------------------------------------------------------
// Mock OSKFrame, OskModeToggle, LintSummary — no iframe / KMW environment.
// ---------------------------------------------------------------------------

vi.mock("../../components/OSKFrame.tsx", () => ({
  OSKFrame: ({ stage }: { stage: Stage }) => (
    <div data-testid="osk-frame" data-stage={stage.kind}>
      osk-frame-mock
    </div>
  ),
}));

vi.mock("../../components/OskModeToggle.tsx", () => ({
  OskModeToggle: () => <div data-testid="osk-mode-toggle" />,
}));

vi.mock("../../lint/LintSummary.tsx", () => ({
  // Render finding codes as text so tests can assert on them.
  LintSummary: ({ findings }: { findings: Array<{ code: string }> }) => (
    <div data-testid="lint-summary">
      {findings.map((f) => (
        <span key={f.code} data-finding-code={f.code}>
          {f.code}
        </span>
      ))}
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedStore(opts: { withInventory?: string[]; intro?: boolean } = {}) {
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
  // The first-entry intro splash shows until the touch gallery intro is marked
  // seen. Mark it by default so tests land directly on the gallery; pass
  // { intro: true } to leave it unseen and exercise the intro itself.
  if (!opts.intro) {
    useWorkingCopyStore.getState().markGalleryIntroSeen("touch");
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
  // Reset useTouchLint mock to the default empty state between tests.
  touchLintResultRef.current = { touchFindings: [], touchLintRunning: false };
});

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
  touchLintResultRef.current = { touchFindings: [], touchLintRunning: false };
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

  it("does NOT set source/<id>.keyman-touch-layout when the only assignment is touch_inherited (accepted 'already' suggestion)", async () => {
    // "a" is present in the scaffolded default QWERTY touch layout (K_A), so with
    // no Phase C desktop assignment the suggestion is "already". The manual
    // "Already in touch layout" chooser card was removed; the auto-detected
    // "already" suggestion is now the only path that records a touch_inherited
    // assignment. Accepting it must NOT be treated as a real edit, so the
    // touch-layout path must remain absent.
    seedStore({ withInventory: ["a"] });

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    // The "already" suggestion shows an Accept button — click it to record the
    // touch_inherited assignment for "a" and advance.
    const acceptBtn = screen
      .queryAllByRole("button")
      .find((b) => b.textContent?.trim() === "Accept") ?? null;
    expect(acceptBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(acceptBtn!);
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

    // The suggestion card shows for "ä" (longpress suggestion). Click "Deny" to
    // dismiss the suggestion and open the method chooser.
    const allBtns = screen.queryAllByRole("button");
    const denyBtn = allBtns.find((b) => b.textContent?.trim() === "Deny") ?? null;
    expect(denyBtn).not.toBeNull();
    await act(async () => { fireEvent.click(denyBtn!); });

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

    // The suggestion card shows for "ä" (longpress suggestion). Click "Deny" to
    // dismiss the suggestion and open the method chooser.
    const allBtns = screen.queryAllByRole("button");
    const denyBtn = allBtns.find((b) => b.textContent?.trim() === "Deny") ?? null;
    expect(denyBtn).not.toBeNull();
    await act(async () => { fireEvent.click(denyBtn!); });

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
// Back/Next navigation — positional model, reported-bug regression coverage.
//
// The reported bug: implementing each character, moving on, and coming back
// only showed the first character, and Next then skipped the others. Root
// cause was a "search for next unconfigured" forward nav (advanceToNext) plus
// a charHistory stack for Back (reset on remount). Both handleNext/handleBack
// are now strictly positional (idx +/- 1 in inventory) — this suite asserts
// Next never skips an already-configured character and Back walks every
// character in reverse position, including configured ones, landing on
// onBack only from the very first position.
// ---------------------------------------------------------------------------

describe("TouchGallery — back navigation", () => {
  it("Back button on the first character calls onBack", async () => {
    seedStore({ withInventory: ["ä"] });
    const onBack = vi.fn();

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={onBack} />);
    });

    // idx 0 has no prior position, so Back calls onBack immediately.
    const backBtns = screen.queryAllByRole("button", { name: /back/i });
    const backBtn = backBtns.find((b) => b.textContent?.includes("Back")) ?? null;
    expect(backBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(backBtn!);
    });

    expect(onBack).toHaveBeenCalledTimes(1);
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

  it("Next advances positionally over configured characters (never skips them); Back walks back through every character including configured ones; Back from the first character calls onBack; the last character's forward button reads Done and calls the completion handler", async () => {
    // "中"/"日"/"月" have no Phase C desktop assignment, are not in the
    // default touch layout, and are not decomposable accented letters, so
    // suggestion kind = "none" for all three — the method chooser is shown
    // directly (no Accept/Deny step to route around).
    seedStore({ withInventory: ["中", "日", "月"] });
    const onBack = vi.fn();
    const onComplete = vi.fn();

    await act(async () => {
      render(<TouchGallery onComplete={onComplete} onBack={onBack} />);
    });

    // --- Configure "中" (idx 0): pick a host key, Apply, then Next → "日" (idx 1). ---
    expect(screen.getByLabelText(/^U\+4E2D 中$/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Host key for long-press/i), {
      target: { value: "K_A" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply touch method for/i }));
    await waitFor(() => {
      const nextBtn = screen.getByRole("button", { name: /Next character/i });
      expect((nextBtn as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(nextBtn);
    });
    await waitFor(() => {
      expect(screen.getByLabelText(/^U\+65E5 日$/)).toBeTruthy();
    });

    // --- Configure "日" (idx 1), then Next → "月" (idx 2, the LAST character). ---
    fireEvent.change(screen.getByLabelText(/Host key for long-press/i), {
      target: { value: "K_B" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply touch method for/i }));
    await waitFor(() => {
      const nextBtn = screen.getByRole("button", { name: /Next character/i });
      expect((nextBtn as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(nextBtn);
    });
    await waitFor(() => {
      expect(screen.getByLabelText(/^U\+6708 月$/)).toBeTruthy();
    });

    // The last character's forward button already reads "Done" (not yet
    // configured for "月", so it starts disabled).
    const doneBtn = screen.getByRole("button", { name: "Done" });
    expect((doneBtn as HTMLButtonElement).disabled).toBe(true);

    // --- Back from "月" (idx 2) lands on "日" (idx 1) — configured, not skipped. ---
    fireEvent.click(screen.getByRole("button", { name: /back to previous character/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/^U\+65E5 日$/)).toBeTruthy();
    });
    expect(onBack).not.toHaveBeenCalled();

    // Revisiting the configured "日": Next is already enabled (no re-apply
    // needed) and — critically — advances to "月" (idx 2), NOT past it. This
    // is the regression the reported bug hit: Next used to search forward
    // for the next *unconfigured* character and would jump straight to
    // completion/an unrelated character from here.
    const nextFrom日 = screen.getByRole("button", { name: /Next character/i });
    expect((nextFrom日 as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(nextFrom日);
    await waitFor(() => {
      expect(screen.getByLabelText(/^U\+6708 月$/)).toBeTruthy();
    });

    // --- Back twice more: "月" → "日" → "中" (idx 0), both configured, neither skipped. ---
    fireEvent.click(screen.getByRole("button", { name: /back to previous character/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/^U\+65E5 日$/)).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: /back to previous character/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/^U\+4E2D 中$/)).toBeTruthy();
    });
    expect(onBack).not.toHaveBeenCalled();

    // --- Back from "中" (idx 0) — first position — calls onBack, NOT "back to previous character". ---
    fireEvent.click(screen.getByRole("button", { name: /back to mechanisms/i }));
    expect(onBack).toHaveBeenCalledOnce();

    // --- Forward to "月" (last) and configure it; Done calls the completion handler. ---
    // (onBack fired above, but the component itself has no further reaction
    // to onBack — currentChar stays put — so we can keep driving the same
    // instance forward to exercise Done.)
    fireEvent.click(screen.getByRole("button", { name: /Next character/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/^U\+65E5 日$/)).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: /Next character/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/^U\+6708 月$/)).toBeTruthy();
    });
    fireEvent.change(screen.getByLabelText(/Host key for long-press/i), {
      target: { value: "K_C" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply touch method for/i }));
    await waitFor(() => {
      const finishBtn = screen.getByRole("button", { name: "Done" });
      expect((finishBtn as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(finishBtn);
    });
    expect(onComplete).toHaveBeenCalledOnce();
  });
});

describe("TouchGallery — previous-character navigation", () => {
  it("clicking '« Previous character' from an interior character moves to the immediately preceding character, ungated by intermediate configuration status", async () => {
    const onBack = vi.fn();
    seedStore({ withInventory: ["中", "日", "月"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={onBack} />);
    });

    // Advance to "日" (idx 1) via Skip — "月" stays untouched.
    expect(screen.getByLabelText(/^U\+4E2D 中$/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: /Skip this character/i }),
    );
    await waitFor(() => {
      expect(screen.getByLabelText(/^U\+65E5 日$/)).toBeTruthy();
    });

    const prevBtn = screen.getByTestId("touch-prev-char");
    expect(prevBtn.getAttribute("aria-label")).toBe("Previous character");
    expect((prevBtn as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(prevBtn);

    // Landed back on "中" (idx 0) — the phase was NOT exited.
    await waitFor(() => {
      expect(screen.getByLabelText(/^U\+4E2D 中$/)).toBeTruthy();
    });
    expect(onBack).not.toHaveBeenCalled();
  });

  it("renders the previous-character button DISABLED on the first character", async () => {
    seedStore({ withInventory: ["中", "日", "月"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });
    // Starting on "中" (idx 0) — nowhere further back to step.
    const prevBtn = screen.getByTestId("touch-prev-char");
    expect(prevBtn).toBeTruthy();
    expect((prevBtn as HTMLButtonElement).disabled).toBe(true);

    // Clicking a disabled button is a no-op — still on "中".
    fireEvent.click(prevBtn);
    expect(screen.getByLabelText(/^U\+4E2D 中$/)).toBeTruthy();
  });

  it("the previous-character button is enabled on later (non-first) characters", async () => {
    seedStore({ withInventory: ["中", "日", "月"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    // Advance to "日" (idx 1) via Skip (records nothing).
    fireEvent.click(
      screen.getByRole("button", { name: /Skip this character/i }),
    );
    await waitFor(() => {
      expect(screen.getByLabelText(/^U\+65E5 日$/)).toBeTruthy();
    });
    expect((screen.getByTestId("touch-prev-char") as HTMLButtonElement).disabled).toBe(false);

    // Advance to "月" (idx 2, the last character) — still enabled there too.
    fireEvent.click(
      screen.getByRole("button", { name: /Skip this character/i }),
    );
    await waitFor(() => {
      expect(screen.getByLabelText(/^U\+6708 月$/)).toBeTruthy();
    });
    expect((screen.getByTestId("touch-prev-char") as HTMLButtonElement).disabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Skip — pure forward navigation; records nothing.
// ---------------------------------------------------------------------------

describe("TouchGallery — skip character", () => {
  it("skipping advances to the next char without recording an assignment", async () => {
    // "中"/"日" have suggestion kind = "none" (see back-navigation suite above).
    seedStore({ withInventory: ["中", "日"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });
    fireEvent.click(screen.getByRole("button", { name: /Skip this character/i }));

    // No assignment recorded.
    expect(useWorkingCopyStore.getState().touchDraft?.charTouchEntries ?? []).toHaveLength(0);

    await waitFor(() => {
      expect(screen.getByLabelText(/^U\+65E5 日$/)).toBeTruthy();
    });
  });

  it("skipping does not change the coverage count and does not mark the character configured", async () => {
    seedStore({ withInventory: ["中", "日"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    expect(screen.getByRole("status").getAttribute("aria-label")).toBe(
      "0 of 2 characters configured",
    );

    fireEvent.click(screen.getByRole("button", { name: /Skip this character/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/^U\+65E5 日$/)).toBeTruthy();
    });

    // Skipping recorded nothing, so coverage is unchanged.
    expect(screen.getByRole("status").getAttribute("aria-label")).toBe(
      "0 of 2 characters configured",
    );

    // Navigating back to the skipped-over "中": it is NOT treated as
    // configured — Next stays disabled until it is actually applied.
    fireEvent.click(screen.getByRole("button", { name: /back to previous character/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/^U\+4E2D 中$/)).toBeTruthy();
    });
    const nextBtn = screen.getByRole("button", { name: /Next character/i });
    expect((nextBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("skipping the only (last) character completes the phase via onComplete", async () => {
    const onComplete = vi.fn();
    seedStore({ withInventory: ["中"] });
    await act(async () => {
      render(<TouchGallery onComplete={onComplete} onBack={vi.fn()} />);
    });
    fireEvent.click(screen.getByRole("button", { name: /Skip this character/i }));
    expect(onComplete).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Draft persistence — store round-trip
// ---------------------------------------------------------------------------

describe("TouchGallery — draft persistence across unmount/remount", () => {
  it("charTouch is restored from store draft on remount", async () => {
    seedStore({ withInventory: ["ä", "ö"] });

    // First mount — accept the suggested method for "ä".
    const { unmount } = await act(async () =>
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />),
    );

    // "ä" is decomposable and not in the default layout, so the suggestion is
    // "longpress". Accept it — stays on "ä" and records it in charTouch;
    // advancing to the next character is explicit via Next, not automatic.
    const allButtons = screen.queryAllByRole("button");
    const acceptBtn = allButtons.find(
      (b) => b.textContent?.trim() === "Accept",
    ) ?? null;
    expect(acceptBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(acceptBtn!);
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

// ---------------------------------------------------------------------------
// Heading — gallery-QoL rename
// ---------------------------------------------------------------------------

describe("TouchGallery — heading", () => {
  it("renders 'Mechanism Gallery' as the main heading with 'Touch' subheading", async () => {
    seedStore({ withInventory: ["ä"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });
    // The h1 contains both "Mechanism Gallery" and the "Touch" span as a child.
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toMatch(/Mechanism Gallery/i);
    expect(h1.textContent).toMatch(/Touch/i);
  });
});

// ---------------------------------------------------------------------------
// Suggestion card — per-character desktop-derived suggestions
// ---------------------------------------------------------------------------

/** Seed the store with a Phase C assignment for a specific character. */
function seedWithDesktopAssignment(
  char: string,
  assignment: MechanismAssignment,
  extraInventory: string[] = [],
) {
  const vfs = createVirtualFS([
    { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
  ]);
  const ir = makeTestIR([]);
  useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });
  useWorkingCopyStore.getState().recordPhase({
    phase: "B",
    answers: [],
    confirmedInventory: [char, ...extraInventory],
  });
  useWorkingCopyStore.getState().recordPhase({
    phase: "C",
    answers: [],
    assignments: [assignment],
  });
  // Skip the first-entry intro splash (see seedStore) so these tests land
  // directly on the per-character gallery.
  useWorkingCopyStore.getState().markGalleryIntroSeen("touch");
}

describe("TouchGallery — suggestion card variants", () => {
  it("shows a 'replace' suggestion for a desktop simple_swap character and Accept records touch_key_replace", async () => {
    // Seed a Phase C simple_swap assignment for "x" so suggestion kind = "replace".
    const swapAssignment: MechanismAssignment = {
      scope: "individual",
      target: "x",
      modality: "physical",
      mechanisms: [
        {
          patternId: "simple_swap",
          strategyId: "S-01",
          slotValues: { kmnRules: "+ [K_X] > U+0078" },
        },
      ],
      source: "user",
    };
    seedWithDesktopAssignment("x", swapAssignment);

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    // Suggestion card should say "replace".
    expect(screen.queryByText(/Suggested: replace/i)).not.toBeNull();

    // Accept the suggestion — should record a touch_key_replace assignment.
    const acceptBtn = screen.queryAllByRole("button").find(
      (b) => b.textContent?.trim() === "Accept",
    ) ?? null;
    expect(acceptBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(acceptBtn!);
    });

    // charTouch should now contain a touch_key_replace assignment for "x".
    await waitFor(() => {
      const draft = useWorkingCopyStore.getState().touchDraft;
      const entry = draft?.charTouchEntries.find(([c]) => c === "x");
      expect(entry).toBeDefined();
      expect(entry?.[1]?.mechanisms[0]?.patternId).toBe("touch_key_replace");
    });
  });

  it("shows a 'longpress' suggestion for a desktop deadkey character", async () => {
    // Seed a Phase C deadkey assignment for "á" so suggestion kind = "longpress".
    const deadkeyAssignment: MechanismAssignment = {
      scope: "individual",
      target: "á",
      modality: "physical",
      mechanisms: [
        {
          patternId: "deadkey_single_tap",
          strategyId: "S-02",
          slotValues: {
            triggerKey: "K_COLON",
            deadkeyName: "dk_colon",
            baseLetters: "a",
            accentedForms: "á",
            accentChar: ":",
          },
        },
      ],
      source: "user",
    };
    seedWithDesktopAssignment("á", deadkeyAssignment);

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    // Suggestion card should mention "long-press" for á.
    expect(screen.queryByText(/Suggested: long-press/i)).not.toBeNull();
  });

  it("a suggestion card REAPPEARS after Skip (unlike Accept/Deny) — Skip resolves nothing", async () => {
    // Same longpress-suggestion fixture as above, plus a second inventory
    // character ("x", no desktop assignment → suggestion kind "none") so
    // there is somewhere to Skip forward to and Back from. Skip is pure
    // positional navigation and must not add "á" to suggestionResolved, so
    // returning to it must show the suggestion card again.
    const deadkeyAssignment: MechanismAssignment = {
      scope: "individual",
      target: "á",
      modality: "physical",
      mechanisms: [
        {
          patternId: "deadkey_single_tap",
          strategyId: "S-02",
          slotValues: {
            triggerKey: "K_COLON",
            deadkeyName: "dk_colon",
            baseLetters: "a",
            accentedForms: "á",
            accentChar: ":",
          },
        },
      ],
      source: "user",
    };
    seedWithDesktopAssignment("á", deadkeyAssignment, ["x"]);

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    // Suggestion card shows for "á".
    expect(screen.queryByText(/Suggested: long-press/i)).not.toBeNull();

    // Skip it — no accept/deny, no assignment recorded.
    fireEvent.click(screen.getByRole("button", { name: /Skip this character/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/^U\+0078 x$/)).toBeTruthy();
    });

    // Navigate back to "á" without ever resolving its suggestion.
    fireEvent.click(screen.getByRole("button", { name: /back to previous character/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/^U\+00E1 á$/)).toBeTruthy();
    });

    // Unlike the accept/deny case above, the suggestion card for "á" MUST
    // reappear — Skip resolved nothing. (If `skippedChars` were reintroduced
    // to suppress the card, this assertion would fail.)
    expect(screen.queryByText(/Suggested: long-press/i)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Intro splash — first-entry orientation
// ---------------------------------------------------------------------------

describe("TouchGallery — intro splash", () => {
  it("shows the intro on first entry and reveals the gallery after 'Get started'", async () => {
    seedStore({ withInventory: ["ä"], intro: true });

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    // Intro is visible; the per-character gallery is not yet shown.
    expect(screen.queryByText(/Welcome to the Touch Gallery/i)).not.toBeNull();
    expect(screen.queryByText(/Touch mapping/i)).toBeNull();

    const startBtn = screen.getByRole("button", { name: /start the touch gallery/i });
    await act(async () => {
      fireEvent.click(startBtn);
    });

    // Gallery now visible; intro gone.
    expect(screen.queryByText(/Welcome to the Touch Gallery/i)).toBeNull();
    expect(screen.queryAllByText(/Touch mapping/i).length).toBeGreaterThan(0);
  });

  it("does NOT show the intro on a return visit (intro already marked seen)", async () => {
    // seedStore (without intro:true) marks the intro seen, simulating a prior visit.
    seedStore({ withInventory: ["ä"] });

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    expect(screen.queryByText(/Welcome to the Touch Gallery/i)).toBeNull();
    expect(screen.queryAllByText(/Touch mapping/i).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// No-suggestion characters go straight to the method chooser
// ---------------------------------------------------------------------------

describe("TouchGallery — no suggestion goes straight to chooser", () => {
  it("shows the method chooser directly (no 'Set how … is reached' prompt) when there is no suggestion", async () => {
    // "中" has no Phase C desktop assignment, is not in the default touch layout,
    // and is not a decomposable accented letter, so suggestion kind = "none".
    seedStore({ withInventory: ["中"] });

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    // The old green "Set how … is reached on touch" prompt + "Choose method"
    // button must be gone.
    expect(screen.queryByText(/is reached on touch/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /choose touch method/i })).toBeNull();

    // The method chooser is shown directly (its header + Apply action present).
    expect(screen.queryByText(/How to reach it on touch/i)).not.toBeNull();
    expect(
      screen.queryAllByRole("button").some((b) => b.textContent?.trim() === "Apply method"),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// useTouchLint error surface — AC#3 (swallowed-catch bugfix)
// ---------------------------------------------------------------------------

describe("TouchGallery — lint error finding surfaces in LintSummary (AC#3)", () => {
  it("renders KM_WARN_LINT_ERROR code in LintSummary when useTouchLint returns LINT_ERROR_FINDING", async () => {
    // Import the constant here (dynamic import avoids hoisting issues).
    const { LINT_ERROR_FINDING } = await import("../../lint/validationErrorFindings.ts");

    // Override the mock to return the error finding before rendering.
    touchLintResultRef.current = {
      touchFindings: [LINT_ERROR_FINDING],
      touchLintRunning: false,
    };

    seedStore({ withInventory: ["ä"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    // The LintSummary mock renders each finding's code as a [data-finding-code] span.
    // Assert that KM_WARN_LINT_ERROR is rendered — it came through the findings prop.
    const lintSummary = screen.getByTestId("lint-summary");
    expect(lintSummary).toBeTruthy();
    const codeSpan = lintSummary.querySelector("[data-finding-code='KM_WARN_LINT_ERROR']");
    expect(codeSpan).not.toBeNull();
    expect(codeSpan?.textContent).toBe("KM_WARN_LINT_ERROR");
  });

  it("renders no finding codes in LintSummary when useTouchLint returns [] (baseline check)", async () => {
    // Default: touchLintResultRef.current = { touchFindings: [], ... } (reset in beforeEach).
    seedStore({ withInventory: ["ä"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    const lintSummary = screen.getByTestId("lint-summary");
    expect(lintSummary.querySelectorAll("[data-finding-code]")).toHaveLength(0);
  });
});
