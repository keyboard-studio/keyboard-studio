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

import { describe, it, expect, afterEach, vi, beforeEach, beforeAll } from "vitest";
import { screen, fireEvent, act, cleanup, waitFor, within } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import {
  TouchGallery,
  buildTouchMechanismRef,
  hostKeyShortLabel,
  isCasingBearingTouchLayer,
} from "./TouchGallery.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import type {
  VirtualFS,
  MechanismAssignment,
  IRGroup,
  IRRule,
} from "@keyboard-studio/contracts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeTestIR, basicKbdus } from "@keyboard-studio/contracts/fixtures";
import type { Stage } from "../../hooks/useKeyboardArtifact.ts";
import { CUSTOM_KEY_OPTION_VALUE } from "../../lib/keyOptions.ts";
import { expectCurrentChar } from "../../test/currentCharChip.ts";
import {
  changeSelectMenu,
  selectMenuValue,
  selectMenuOptionValues,
} from "../../test/selectMenuTestUtils.ts";
import { installDialogShim } from "../../test/dialogShim.ts";
import { PATTERN_SEQUENCE } from "./patternIds.ts";

// ---------------------------------------------------------------------------
// vi.hoisted() — refs shared across mock closures and test bodies.
// ---------------------------------------------------------------------------

const { capturedVfsTransformRef, buildTouchLayoutJsonSpy, defaultBuildTouchLayoutJsonImpl } = vi.hoisted(() => {
  const capturedVfsTransformRef = {
    current: null as null | ((vfs: VirtualFS, kbId: string) => { warnings: string[] }),
  };
  // Default spy implementation: deterministic JSON including the assignments so
  // tests can assert the transform's injected content differs between edits.
  // The `phone` platform below is real parseTouchLayout-shaped JSON — one key
  // per assignment, `output` set to the assignment's target char — so the
  // FR-008 completion gate (which parses this JSON via layoutForLintAndGate
  // and runs touchCoverage against it) sees every explicitly-configured
  // character as covered, matching what the real buildTouchLayoutJson would
  // produce. Re-applied in beforeEach (see below) because vi.clearAllMocks()
  // clears call history but NOT a custom .mockImplementation() a prior test
  // installed — without the reset, a later test's coverage gate would see a
  // stale non-covering implementation left over from an earlier test in this
  // file (the bug this comment is guarding against).
  function defaultBuildTouchLayoutJsonImpl(
    _baseIr: unknown,
    assignments: Array<{ target: string; mechanisms: Array<{ patternId: string }> }>,
  ) {
    return {
      json: JSON.stringify({
        _mock: true,
        assignments,
        phone: {
          layer: [
            {
              id: "default",
              row: [
                {
                  id: 1,
                  key: assignments.map((a, i) => ({ id: `T_mock_${i}`, output: a.target })),
                },
              ],
            },
          ],
        },
      }),
      warnings: [] as string[],
    };
  }
  const buildTouchLayoutJsonSpy = vi.fn(defaultBuildTouchLayoutJsonImpl);
  return { capturedVfsTransformRef, buildTouchLayoutJsonSpy, defaultBuildTouchLayoutJsonImpl };
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
// Mock buildTouchLayoutJson — deterministic, no real engine. `deriveSeedLayout`
// is kept as the REAL implementation (via importOriginal, same pattern as the
// @keyboard-studio/engine mock below) rather than stubbed out: TouchGallery's
// detectionSeedLayout memo calls it directly to compute the "already in touch
// layout" suggestion and the FR-008 completion-gate fallback layout, and
// several tests in this file (the seed-source-aware detection suite, the
// FR-008 refusal suite) assert on that real seed-derivation behavior. Only
// `buildTouchLayoutJson` itself — the final emitted JSON, asserted via
// buildTouchLayoutJsonSpy — is replaced with the deterministic mock.
// ---------------------------------------------------------------------------

vi.mock("../../lib/buildTouchLayoutJson.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../lib/buildTouchLayoutJson.ts")>();
  return {
    ...original,
    buildTouchLayoutJson: buildTouchLayoutJsonSpy,
  };
});

// ---------------------------------------------------------------------------
// Mock engine helpers so no WASM is loaded.
// ---------------------------------------------------------------------------

vi.mock("@keyboard-studio/engine", async (importOriginal) => {
  const original = await importOriginal<typeof import("@keyboard-studio/engine")>();
  return {
    ...original,
    // emitTouchLayout is used for minimalTouchJson; return a stable string.
    emitTouchLayout: vi.fn(() => '{"_minimal":true}'),
  };
});

// ---------------------------------------------------------------------------
// Mock OSKFrame, OskModeToggle — no iframe / KMW environment.
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedStore(
  opts: {
    withInventory?: string[];
    intro?: boolean;
    /** Override the seeded desktop IR — used by the touch-layer-picker tests
     * to give the working copy real SHIFT/RALT rules so
     * `collectLayerCombosInUse` (the picker's option source) has something
     * to report beyond the always-present base layer. */
    ir?: ReturnType<typeof makeTestIR>;
  } = {},
) {
  const vfs = createVirtualFS([
    { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
  ]);
  const ir = opts.ir ?? makeTestIR([]);
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
  // spec 035 R11: these fixtures ship no base .keyman-touch-layout, so the
  // Entity-5 default (resolveTouchSeedSource) would resolve to
  // "reseed-from-desktop" (which ALWAYS emits) if left null. Existing tests
  // in this file pin the "import-adapt + empty mods + no real edit -> emit
  // nothing" row, so seed the explicit choice — mirrors an author who picked
  // Import & adapt from the fork chooser even though there is nothing to
  // import onto (TouchSeedSourcePanel allows this; it starts from an empty
  // layout).
  useSurveySessionStore.getState().setTouchSeedSource("import-adapt");
}

/** Invoke the captured vfsTransform with a fresh VFS and the given kbId. */
function runTransform(kbId: string) {
  const fn = capturedVfsTransformRef.current;
  if (!fn) throw new Error("vfsTransform was not captured — useKeyboardArtifact mock not called");
  const vfs = createVirtualFS([]);
  fn(vfs, kbId);
  return vfs;
}

// jsdom does not implement HTMLDialogElement.showModal()/close() — shared
// shim (test/dialogShim.ts); see that module for rationale. Needed here
// because the leave-warning modal (ConfirmDialog) now mounts whenever the
// FR-008 gate finds uncovered characters.
beforeAll(installDialogShim);

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup();
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
  vi.clearAllMocks();
  capturedVfsTransformRef.current = null;
});

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
  // vi.clearAllMocks() (afterEach, above) clears call history but NOT a
  // custom .mockImplementation() a prior test installed via
  // buildTouchLayoutJsonSpy.mockImplementation(...) — re-pin the covering
  // default here so every test starts from known-good behavior under the
  // FR-008 completion gate (layoutForLintAndGate parses this JSON).
  buildTouchLayoutJsonSpy.mockImplementation(defaultBuildTouchLayoutJsonImpl);
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
    const hostKeySelect = screen.queryByRole("button", { name: /host key/i });
    expect(hostKeySelect).not.toBeNull();
    await changeSelectMenu(hostKeySelect!, "K_A");

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

    const hostKeySelect = screen.queryByRole("button", { name: /host key/i });
    expect(hostKeySelect).not.toBeNull();
    await changeSelectMenu(hostKeySelect!, "K_A");

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
// R11 emission matrix — the row that USED TO return null: import-adapt with
// non-empty desktop modifications (spec 035 R3 replay) must still emit even
// when the author has made ZERO Phase E edits. Pre-035, the emission gate was
// "has real edits" only; R11 adds "OR mods non-empty".
// ---------------------------------------------------------------------------

describe("TouchGallery — R11 emission: mods non-empty emits even with zero configured chars", () => {
  it("injects the derived touch layout when desktop mods are non-empty, before any Phase E edit is made", async () => {
    // A Phase C simple_swap assignment for "x" derives a non-empty
    // mods.placements entry (deriveDesktopModifications extracts hostKey
    // K_X) — seedWithDesktopAssignment also pins seedSource "import-adapt".
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

    // Zero Phase E edits made — charTouch stays empty for the whole test —
    // yet the R11 matrix must still emit because import-adapt + mods
    // non-empty is an emit row, independent of hasRealEdits.
    const vfs = runTransform("basic_kbdus");
    const entry = vfs.get("source/basic_kbdus.keyman-touch-layout");
    expect(entry).not.toBeUndefined();
    expect(buildTouchLayoutJsonSpy).toHaveBeenCalled();

    const [, passedAssignments, opts] = buildTouchLayoutJsonSpy.mock.calls[0]! as [
      unknown,
      unknown[],
      { mods: { removals: string[]; placements: unknown[] } },
    ];
    // No Phase E assignments were passed (empty charTouch).
    expect(passedAssignments).toEqual([]);
    // But mods.placements carries the Phase C-derived placement.
    expect(opts.mods.placements.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Seed-source-aware detection (T015) + R11 injection from a SHIPPED layout
// (T017) — every other fixture in this file ships NO base .keyman-touch-layout
// (see seedStore's comment), so none of them can prove detection reads the
// shipped layout rather than an unconditional scaffoldTouchLayout(baseIr)
// walk. This suite ships a real touch-layout file in the base VFS.
// ---------------------------------------------------------------------------

/** Seed the store with a base that SHIPS a `.keyman-touch-layout` file (a
 * phone platform whose default layer produces `shippedChar`), plus a Phase C
 * desktop assignment (drives a non-empty `mods.placements` for the R11 check).
 */
function seedWithShippedTouchLayout(opts: {
  shippedChar: string;
  desktopAssignment: MechanismAssignment;
}) {
  const shippedLayoutJson = JSON.stringify({
    phone: {
      layer: [
        {
          id: "default",
          row: [{ id: 1, key: [{ id: "T_shipped", output: opts.shippedChar }] }],
        },
      ],
    },
  });
  const vfs = createVirtualFS([
    { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    { path: "source/basic_kbdus.keyman-touch-layout", content: shippedLayoutJson, isBinary: false },
  ]);
  const ir = makeTestIR([]);
  useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });
  useWorkingCopyStore.getState().recordPhase({
    phase: "B",
    answers: [],
    confirmedInventory: [opts.desktopAssignment.target, opts.shippedChar],
  });
  useWorkingCopyStore.getState().recordPhase({
    phase: "C",
    answers: [],
    assignments: [opts.desktopAssignment],
  });
  useWorkingCopyStore.getState().markGalleryIntroSeen("touch");
  // Explicit import-adapt choice — the shipped layout above is what makes
  // this a genuine Case B (adapt the shipped file), not the reseed fallback.
  useSurveySessionStore.getState().setTouchSeedSource("import-adapt");
}

describe("TouchGallery — seed-source-aware detection reads the shipped layout (T015) and still injects under R11 with zero Phase E edits (T017)", () => {
  it("detects a char present only in the SHIPPED touch layout as already-covered, and injects the derived seed via the R11 matrix before any Phase E edit", async () => {
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
    // "€" is planted only in the shipped phone layout — it is not part of a
    // fresh QWERTY scaffold and is not a decomposable-accented letter, so a
    // pre-T015 unconditional scaffoldTouchLayout(baseIr) walk would report it
    // as undetected (suggestion "none") instead of "already".
    seedWithShippedTouchLayout({ shippedChar: "€", desktopAssignment: swapAssignment });

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    // Inventory is ["x", "€"] — "x" (idx 0) carries the Phase C swap
    // assignment ("replace" suggestion). Skip is pure positional navigation
    // (records nothing) and works regardless of that suggestion's state.
    fireEvent.click(screen.getByRole("button", { name: /Skip this character/i }));
    await waitFor(() => {
      expectCurrentChar("€");
    });

    // The seed-source-aware detection (T015) must surface the "already"
    // suggestion for "€" because it reads the SHIPPED layout (with mods
    // replayed), not a fresh scaffold.
    expect(screen.queryByText(/is already on the touch keyboard/i)).not.toBeNull();

    // R11 emission: import-adapt + non-empty mods (the "x" placement,
    // derived from the Phase C assignment) injects the derived seed even
    // though ZERO Phase E edits have been made yet.
    const vfs = runTransform("basic_kbdus");
    expect(vfs.get("source/basic_kbdus.keyman-touch-layout")).not.toBeUndefined();
    expect(buildTouchLayoutJsonSpy).toHaveBeenCalled();
    const [, passedAssignments, opts] = buildTouchLayoutJsonSpy.mock.calls[0]! as [
      unknown,
      unknown[],
      { mods: { removals: string[]; placements: unknown[] }; baseTouchJson?: string },
    ];
    expect(passedAssignments).toEqual([]);
    expect(opts.mods.placements.length).toBeGreaterThan(0);
    // The shipped layout is what's passed through for the Case B path.
    expect(opts.baseTouchJson).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// detectionSeedLayout / layoutForLintAndGate error-fallback branches — a
// malformed shipped .keyman-touch-layout under import-adapt makes
// deriveSeedLayout's real applyDesktopModificationsToRawJson call throw a
// SyntaxError (invalid JSON); detectionSeedLayout's try/catch must swallow it
// (logging via console.error) and fall back to null rather than crashing the
// render. `deriveSeedLayout` is kept as the REAL implementation for this
// suite (see the buildTouchLayoutJson.ts mock above) so the parse failure is
// genuinely exercised rather than short-circuited by a mock.
// ---------------------------------------------------------------------------

describe("TouchGallery — detectionSeedLayout/layoutForLintAndGate fallback on malformed shipped touch layout", () => {
  it("renders without crashing when the shipped .keyman-touch-layout is malformed JSON, logging via console.error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const vfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
      // Malformed JSON — deriveSeedLayout's Case B (applyDesktopModificationsToRawJson)
      // throws SyntaxError when parsing this.
      { path: "source/basic_kbdus.keyman-touch-layout", content: "{ not json", isBinary: false },
    ]);
    const ir = makeTestIR([]);
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });
    useWorkingCopyStore.getState().recordPhase({
      phase: "B",
      answers: [],
      confirmedInventory: ["a"],
    });
    useWorkingCopyStore.getState().markGalleryIntroSeen("touch");
    // import-adapt so detectionSeedLayout takes deriveSeedLayout's Case B
    // (reads the malformed shipped file) instead of a fresh Case A scaffold.
    useSurveySessionStore.getState().setTouchSeedSource("import-adapt");

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    // Fallback path taken: the gallery still renders the character card for
    // "a" instead of crashing.
    expectCurrentChar("a");
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
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

  it("Back from character 2 returns to character 1 (positional)", async () => {
    seedStore({ withInventory: ["ä", "ö"] });
    const onBack = vi.fn();

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={onBack} />);
    });

    // Accept the suggestion for "ä" — this calls handleUseSuggestion (longpress)
    // or handleSuggestionAccept (already). Per regression 4 (stay-on-char after
    // accepting a suggestion), accepting no longer advances by itself —
    // click "Next character →" afterward to advance to "ö" (idx 1).
    const allButtons = screen.queryAllByRole("button");
    const acceptBtn = allButtons.find(
      (b) => b.textContent?.trim() === "Accept",
    ) ?? null;
    expect(acceptBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(acceptBtn!);
    });

    const nextBtn = screen.queryAllByRole("button").find(
      (b) => b.textContent?.trim() === "Next character →",
    ) ?? null;
    expect(nextBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(nextBtn!);
    });

    // Should now be on "ö" — find and click Back.
    const backBtnsAfter = screen.queryAllByRole("button", { name: /back/i });
    const backBtn = backBtnsAfter.find((b) => b.textContent?.includes("Back")) ?? null;
    expect(backBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(backBtn!);
    });

    // onBack should NOT have been called — Back moved one position back
    // within Phase E (idx 1 -> idx 0), purely positionally.
    expect(onBack).not.toHaveBeenCalled();

    // We returned to char 1 ("ä") — the per-char assignment UI (the "Touch
    // mapping" section) is showing again.
    const headings = screen.queryAllByText(/Touch mapping/i);
    expect(headings.length).toBeGreaterThan(0);
    expectCurrentChar("ä");
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
    expectCurrentChar("中");
    await changeSelectMenu(screen.getByLabelText(/Host key for long-press/i), "K_A");
    fireEvent.click(screen.getByRole("button", { name: /Apply touch method for/i }));
    await waitFor(() => {
      const nextBtn = screen.getByRole("button", { name: /Next character/i });
      expect((nextBtn as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(nextBtn);
    });
    await waitFor(() => {
      expectCurrentChar("日");
    });

    // --- Configure "日" (idx 1), then Next → "月" (idx 2, the LAST character). ---
    await changeSelectMenu(screen.getByLabelText(/Host key for long-press/i), "K_B");
    fireEvent.click(screen.getByRole("button", { name: /Apply touch method for/i }));
    await waitFor(() => {
      const nextBtn = screen.getByRole("button", { name: /Next character/i });
      expect((nextBtn as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(nextBtn);
    });
    await waitFor(() => {
      expectCurrentChar("月");
    });

    // The last character's forward button already reads "Done" (not yet
    // configured for "月", so it starts disabled).
    const doneBtn = screen.getByRole("button", { name: "Done" });
    expect((doneBtn as HTMLButtonElement).disabled).toBe(true);

    // --- Back from "月" (idx 2) lands on "日" (idx 1) — configured, not skipped. ---
    fireEvent.click(screen.getByRole("button", { name: /back to previous character/i }));
    await waitFor(() => {
      expectCurrentChar("日");
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
      expectCurrentChar("月");
    });

    // --- Back twice more: "月" → "日" → "中" (idx 0), both configured, neither skipped. ---
    fireEvent.click(screen.getByRole("button", { name: /back to previous character/i }));
    await waitFor(() => {
      expectCurrentChar("日");
    });
    fireEvent.click(screen.getByRole("button", { name: /back to previous character/i }));
    await waitFor(() => {
      expectCurrentChar("中");
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
      expectCurrentChar("日");
    });
    fireEvent.click(screen.getByRole("button", { name: /Next character/i }));
    await waitFor(() => {
      expectCurrentChar("月");
    });
    await changeSelectMenu(screen.getByLabelText(/Host key for long-press/i), "K_C");
    fireEvent.click(screen.getByRole("button", { name: /Apply touch method for/i }));
    await waitFor(() => {
      const finishBtn = screen.getByRole("button", { name: "Done" });
      expect((finishBtn as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(finishBtn);
    });
    expect(onComplete).toHaveBeenCalledOnce();
  });
});

// The old "« Previous character" button (data-testid "touch-prev-char") only
// ever stepped back exactly one position; it was replaced by CharScrollStrip
// (data-testid "char-scroll-strip"), which offers ONE chip per inventory
// character (data-testid "char-scroll-chip-<HEX>", every codepoint of the
// grapheme, 4+-digit uppercase hex, hyphen-joined — see CharScrollStrip.tsx's
// file header) and lets the author jump to ANY of them, forward or backward,
// via handleSelectChar. These tests exercise that replacement contract
// directly rather than deleting the navigation coverage. The phase-exit "←
// Back" control (handleBack, tested elsewhere in this file) is retained and
// is a separate control from the scroll strip.
describe("TouchGallery — character-scroll-strip navigation", () => {
  it("renders the char-scroll-strip with one chip per inventory character", async () => {
    seedStore({ withInventory: ["中", "日", "月"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    expect(screen.getByTestId("char-scroll-strip")).toBeTruthy();
    expect(screen.getByTestId("char-scroll-chip-4E2D")).toBeTruthy();
    expect(screen.getByTestId("char-scroll-chip-65E5")).toBeTruthy();
    expect(screen.getByTestId("char-scroll-chip-6708")).toBeTruthy();
  });

  it("clicking an earlier character's chip moves back to it, ungated by intermediate configuration status", async () => {
    const onBack = vi.fn();
    seedStore({ withInventory: ["中", "日", "月"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={onBack} />);
    });

    // Advance to "日" (idx 1) via Skip — "月" stays untouched.
    expectCurrentChar("中");
    fireEvent.click(
      screen.getByRole("button", { name: /Skip this character/i }),
    );
    await waitFor(() => {
      expectCurrentChar("日");
    });

    // Click the chip for "中" (the earlier, already-visited character) while
    // sitting on "日" — must jump straight back to it.
    fireEvent.click(screen.getByTestId("char-scroll-chip-4E2D"));

    // Landed back on "中" (idx 0) — the phase was NOT exited.
    await waitFor(() => {
      expectCurrentChar("中");
    });
    expect(onBack).not.toHaveBeenCalled();
  });

  it("clicking a later character's chip moves forward to it too — the old prev-only button could never do this", async () => {
    seedStore({ withInventory: ["中", "日", "月"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    // Starting on "中" (idx 0) — jump straight to "月" (idx 2, the last
    // character), skipping over "日" entirely without visiting it.
    expectCurrentChar("中");
    fireEvent.click(screen.getByTestId("char-scroll-chip-6708"));

    await waitFor(() => {
      expectCurrentChar("月");
    });
  });
});

// ---------------------------------------------------------------------------
// Producer-count badge (CharScrollStrip Part 2) — integration coverage.
//
// CharScrollStrip.test.tsx already unit-tests the badge in isolation. This
// closes the gap that isolation leaves for the TOUCH modality specifically:
// it proves the badge TouchGallery renders is wired to THIS gallery's real
// `charTouchAssignments` (built from the author's own charTouch edits) and
// the "touch" modality — not a constant, and not the desktop/physical count
// leaking across. A swapped `assignments` array or wrong `modality` at the
// TouchGallery -> CharScrollStrip call site would slip past
// CharScrollStrip.test.tsx alone but must fail here.
// ---------------------------------------------------------------------------

describe("TouchGallery — character-scroll-strip producer badge (integration)", () => {
  it("the current char's badge starts RED at 0, then GREEN at 1 after a real touch Apply records the mechanism", async () => {
    // "中" has no Phase C assignment and is not in the default touch layout —
    // suggestion kind = "none" (see the "multiple methods per character" describe
    // block), so the chooser shows directly with nothing to Accept/Deny first.
    seedStore({ withInventory: ["中"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    const stripBefore = screen.getByTestId("char-scroll-strip");
    const badgeBefore = within(stripBefore).getByTestId("char-scroll-badge-4E2D");
    expect(badgeBefore.textContent).toBe("0");
    expect(badgeBefore.style.color).toBe("rgb(248, 81, 73)"); // #f85149 — badge-bad color

    // Drive the real touch Apply flow (long-press K_A, the chooser's default
    // active method) — the same interaction the "multiple methods per
    // character" describe block below uses to record into charTouch, so this
    // test exercises the actual store write, not a hand-built assignment.
    const hostKeySelect = screen.getByLabelText(/Host key for long-press/i);
    await changeSelectMenu(hostKeySelect, "K_A");
    const applyBtn = screen.queryAllByRole("button").find(
      (b) => b.textContent?.trim() === "Apply method",
    ) ?? null;
    expect(applyBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(applyBtn!);
    });

    await waitFor(() => {
      const badgeAfter = within(screen.getByTestId("char-scroll-strip")).getByTestId(
        "char-scroll-badge-4E2D",
      );
      expect(badgeAfter.textContent).toBe("1");
      expect(badgeAfter.style.color).toBe("rgb(86, 211, 100)"); // #56d364 — badge-good color
    });
  });
});

// ---------------------------------------------------------------------------
// UsesSequencesCard (Part 3) — integration coverage.
//
// UsesSequencesCard.tsx (packages/studio/src/editors/assignLoop/parts/) has
// its own render-level unit test exercising pure props in isolation. This
// closes the gap that leaves for TouchGallery specifically: it proves the
// card TouchGallery renders is wired to THIS gallery's real
// `desktopAssignments` (Phase C store state, via seedWithDesktopAssignment —
// the same store-seed helper the R11 emission suite above uses to drive a
// real Phase C assignment) — not a hand-built prop or a constant. A
// swapped/empty assignments source at the TouchGallery -> UsesSequencesCard
// call site would slip past a UsesSequencesCard-only unit test but must fail
// here.
//
// PRODUCES vs USES: the seeded sequence's own `target` ("ŋ", what the
// sequence PRODUCES) is deliberately a DIFFERENT character from currentChar
// ("n", the char under test) — "n" only appears as the sequence's
// `firstLetterOut` (an INPUT slot), never as the char it produces. This is
// exactly the produces-vs-uses distinction the card exists to surface, and
// sequences are always recorded with modality "physical" even though this is
// the Touch gallery (see charMechanisms.ts's file-header comment) — this
// test is what proves that cross-modality read actually happens for real
// desktopAssignments, not just in the unit-level charMechanisms.test.ts.
// ---------------------------------------------------------------------------

describe("TouchGallery — UsesSequencesCard (integration)", () => {
  it("renders the card with a row for a real recorded Phase C sequence that USES the current character as an input slot (not its produced char)", async () => {
    const sequenceAssignment: MechanismAssignment = {
      scope: "individual",
      target: "ŋ",
      modality: "physical",
      mechanisms: [
        {
          patternId: PATTERN_SEQUENCE,
          strategyId: "S-03",
          slotValues: { firstLetterOut: "n", secondLetter: "g", collapsedChar: "ŋ" },
        },
      ],
      source: "user",
    };
    seedWithDesktopAssignment("n", sequenceAssignment);

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    expectCurrentChar("n");
    const card = await screen.findByTestId("uses-sequences-card");
    const row = within(card).getByTestId("uses-sequences-row-0");
    // The row names the sequence's own input pair and its produced char —
    // proving this is the REAL recorded sequence surfaced from real store
    // state, not a placeholder or a hardcoded row.
    expect(row.textContent).toContain("n");
    expect(row.textContent).toContain("g");
    expect(row.textContent).toContain("ŋ");
  });

  it("control: renders no uses-sequences-card for a character with no recorded using-sequence anywhere in Phase C", async () => {
    seedStore({ withInventory: ["中"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });
    expectCurrentChar("中");
    expect(screen.queryByTestId("uses-sequences-card")).toBeNull();
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
      expectCurrentChar("日");
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
      expectCurrentChar("日");
    });

    // Skipping recorded nothing, so coverage is unchanged.
    expect(screen.getByRole("status").getAttribute("aria-label")).toBe(
      "0 of 2 characters configured",
    );

    // Navigating back to the skipped-over "中": it is NOT treated as
    // configured — Next stays disabled until it is actually applied.
    fireEvent.click(screen.getByRole("button", { name: /back to previous character/i }));
    await waitFor(() => {
      expectCurrentChar("中");
    });
    const nextBtn = screen.getByRole("button", { name: /Next character/i });
    expect((nextBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("skipping the only (last) character completes the phase via onComplete", async () => {
    // "a" (not "中") — the FR-008 completion gate (T016b) re-runs touchCoverage
    // on the final layout before calling onComplete, so the char left
    // unconfigured by Skip must be one the underlying seed already covers
    // (present in the default QWERTY scaffold) for the gate to pass. This
    // still exercises the regression this test guards: Skip records no
    // assignment yet completion still fires.
    const onComplete = vi.fn();
    seedStore({ withInventory: ["a"] });
    await act(async () => {
      render(<TouchGallery onComplete={onComplete} onBack={vi.fn()} />);
    });
    fireEvent.click(screen.getByRole("button", { name: /Skip this character/i }));
    expect(onComplete).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// FR-008 completion gate — refusal branch (T016b). "中" has suggestion kind
// "none" (not present in the default scaffold, no Phase C desktop
// assignment — see the back-navigation suite above), so it stays genuinely
// uncovered until the author explicitly applies a method, unlike "a" (used
// by the skip-completes test above) which the default scaffold already covers.
// ---------------------------------------------------------------------------

describe("TouchGallery — FR-008 completion gate refusal (uncovered char)", () => {
  it("refuses to complete and surfaces an alert naming the uncovered char, without calling onComplete", async () => {
    seedStore({ withInventory: ["中"] });
    const onComplete = vi.fn();

    await act(async () => {
      render(<TouchGallery onComplete={onComplete} onBack={vi.fn()} />);
    });

    // "中" is the only (and therefore last) character — Skip is pure forward
    // navigation, so from the last position it routes into handleContinue via
    // usePositionalCharNav's onComplete, exercising the completion gate
    // without requiring any prior configuration.
    fireEvent.click(screen.getByRole("button", { name: /Skip this character/i }));

    // The gate refuses: "中" is not reachable on the derived seed layout.
    expect(onComplete).not.toHaveBeenCalled();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("has no touch mechanism");
    expect(alert.textContent).toContain("中");
  });

  it("clears the alert and completes once a method covering the character is applied", async () => {
    seedStore({ withInventory: ["中"] });
    const onComplete = vi.fn();

    await act(async () => {
      render(<TouchGallery onComplete={onComplete} onBack={vi.fn()} />);
    });

    // Trigger the refusal first (mirrors the previous test).
    fireEvent.click(screen.getByRole("button", { name: /Skip this character/i }));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();

    // Cover "中": the method chooser is already showing (suggestion kind
    // "none"), defaulted to "Long-press on a key" — pick a host key and apply.
    await changeSelectMenu(screen.getByLabelText(/Host key for long-press/i), "K_A");
    fireEvent.click(screen.getByRole("button", { name: /Apply touch method for/i }));

    // Applying the edit clears the stale alert immediately (touchKey-keyed
    // effect), before Done is even clicked.
    expect(screen.queryByRole("alert")).toBeNull();

    await waitFor(() => {
      const doneBtn = screen.getByRole("button", { name: "Done" });
      expect((doneBtn as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(doneBtn);
    });

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledOnce();
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Leave-warning modal (the same ConfirmDialog contract MechanismGallery uses,
// see MechanismGallery.test.tsx's own "leave-warning modal open/closed state"
// suite) — TouchGallery's version fires from the SAME handleContinue gate as
// the FR-008 inline-alert refusal above, so the modal and the alert always
// open together on a refused completion attempt. Queried via the native
// <dialog open> attribute rather than button presence: ConfirmDialog always
// renders both buttons regardless of `open`, so a bare button-exists query
// cannot distinguish "modal is showing" from "modal is mounted but closed".
// ---------------------------------------------------------------------------

describe("TouchGallery — leave-warning modal open/closed state", () => {
  it("does NOT open the dialog when completion succeeds with every character covered", async () => {
    const onComplete = vi.fn();
    seedStore({ withInventory: ["a"] }); // "a" is already covered by the default scaffold.
    const { container } = await act(async () =>
      render(<TouchGallery onComplete={onComplete} onBack={vi.fn()} />),
    );
    fireEvent.click(screen.getByRole("button", { name: /Skip this character/i }));
    expect(onComplete).toHaveBeenCalledOnce();
    expect(container.querySelector("dialog")?.hasAttribute("open")).not.toBe(true);
  });

  it("opens the dialog (native <dialog open> attribute) alongside the inline alert when the completion gate refuses", async () => {
    seedStore({ withInventory: ["中"] });
    const { container } = await act(async () =>
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />),
    );
    fireEvent.click(screen.getByRole("button", { name: /Skip this character/i }));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(container.querySelector("dialog")?.hasAttribute("open")).toBe(true);
  });

  it('"Go back and finish" (primary) closes the dialog and does NOT complete — the author stays in the gallery able to finish "中"', async () => {
    const onComplete = vi.fn();
    seedStore({ withInventory: ["中"] });
    const { container } = await act(async () =>
      render(<TouchGallery onComplete={onComplete} onBack={vi.fn()} />),
    );
    fireEvent.click(screen.getByRole("button", { name: /Skip this character/i }));
    expect(container.querySelector("dialog")?.hasAttribute("open")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Go back and finish/i }));

    expect(onComplete).not.toHaveBeenCalled();
    expect(container.querySelector("dialog")?.hasAttribute("open")).not.toBe(true);
    // Still on "中" — the method chooser is still available to actually cover it.
    expectCurrentChar("中");
    expect(screen.getByLabelText(/Host key for long-press/i)).toBeTruthy();
  });

  it("Escape (the native <dialog> cancel event) does NOT proceed — it stays in the gallery, same as \"Go back and finish\" (P1(a))", async () => {
    const onComplete = vi.fn();
    seedStore({ withInventory: ["中"] });
    const { container } = await act(async () =>
      render(<TouchGallery onComplete={onComplete} onBack={vi.fn()} />),
    );
    fireEvent.click(screen.getByRole("button", { name: /Skip this character/i }));
    const dialog = container.querySelector("dialog")!;
    expect(dialog.hasAttribute("open")).toBe(true);

    fireEvent(dialog, new Event("cancel", { cancelable: true }));

    expect(onComplete).not.toHaveBeenCalled();
    expect(dialog.hasAttribute("open")).not.toBe(true);
    expectCurrentChar("中");
  });

  it("the ← back to previous character control never opens the leave-warning modal, even while the current character remains uncovered", async () => {
    seedStore({ withInventory: ["中", "日"] });
    const { container } = await act(async () =>
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />),
    );
    // Advance to "日" without covering "中" — Skip is pure forward nav.
    fireEvent.click(screen.getByRole("button", { name: /Skip this character/i }));
    await waitFor(() => {
      expectCurrentChar("日");
    });
    expect(container.querySelector("dialog")?.hasAttribute("open")).not.toBe(true);

    // Back to the still-uncovered "中" — a DIFFERENT control from the forward
    // Done/Skip-on-last path that triggers the modal, and must never open it.
    fireEvent.click(screen.getByRole("button", { name: /back to previous character/i }));
    await waitFor(() => {
      expectCurrentChar("中");
    });
    expect(container.querySelector("dialog")?.hasAttribute("open")).not.toBe(true);
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
    // "longpress". Accept it — records "ä" in charTouch and stays on "ä"
    // (regression 4, stay-on-char); advancing to the next character is
    // explicit via Next, not automatic.
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

    // The "Configured" chip row should show "ä" (it was persisted). Query
    // scoped to the configured-group itself (via `within`) — a bare
    // screen-level query for a button named "ä" now also matches the
    // CharScrollStrip chip's "Go to U+00E4 ä" aria-label (the strip renders
    // one chip per inventory character, unconditionally), which would make
    // `queryByRole` throw on "found multiple elements" rather than asserting
    // what this test actually cares about — the configured-chip row.
    const configuredGroup = screen.queryByRole("group", { name: /configured characters/i });
    expect(configuredGroup).not.toBeNull();
    const chipButton = within(configuredGroup!).queryByRole("button", { name: new RegExp("ä") });
    expect(chipButton).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Multiple methods per character (regression 3, multi-method — core model change)
// ---------------------------------------------------------------------------

describe("TouchGallery — multiple methods per character", () => {
  it("applying two methods to one character produces two chips, each independently removable", async () => {
    // "中" has no Phase C assignment, is not in the default touch layout, and
    // is not decomposable, so suggestion kind = "none" — the chooser shows
    // directly and there is nothing to Accept/Deny first.
    seedStore({ withInventory: ["中"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    // Apply method 1: long-press K_A (the chooser's default active method).
    const hostKeySelect1 = screen.queryByRole("button", { name: /host key/i });
    expect(hostKeySelect1).not.toBeNull();
    await changeSelectMenu(hostKeySelect1!, "K_A");
    let applyBtn = screen.queryAllByRole("button").find(
      (b) => b.textContent?.trim() === "Apply method",
    ) ?? null;
    expect(applyBtn).not.toBeNull();
    await act(async () => { fireEvent.click(applyBtn!); });

    // Apply method 2: multitap K_B, for the SAME character (re-picking a method
    // after the first apply must not be blocked, and must not overwrite method 1).
    const multitapOption = screen.queryByText(/tap multiple times/i);
    expect(multitapOption).not.toBeNull();
    await act(async () => { fireEvent.click(multitapOption!); });

    const hostKeySelect2 = screen.queryByRole("button", { name: /host key/i });
    expect(hostKeySelect2).not.toBeNull();
    await changeSelectMenu(hostKeySelect2!, "K_B");
    applyBtn = screen.queryAllByRole("button").find(
      (b) => b.textContent?.trim() === "Apply method",
    ) ?? null;
    expect(applyBtn).not.toBeNull();
    await act(async () => { fireEvent.click(applyBtn!); });

    // Two chips now exist in the Configured group — one per mechanism.
    const configuredGroup = screen.queryByRole("group", { name: /configured characters/i });
    expect(configuredGroup).not.toBeNull();
    let chips = configuredGroup!.querySelectorAll("button");
    expect(chips.length).toBe(2);

    const draft = useWorkingCopyStore.getState().touchDraft;
    const entry = draft?.charTouchEntries.find(([c]) => c === "中");
    expect(entry?.[1]?.mechanisms.length).toBe(2);
    expect(entry?.[1]?.mechanisms.map((m) => m.patternId)).toEqual([
      "longpress_alternates",
      "multitap",
    ]);

    // Remove one mechanism — the other survives, the char entry survives.
    await act(async () => {
      fireEvent.click(chips[0]!);
    });
    const draftAfterOneRemoval = useWorkingCopyStore.getState().touchDraft;
    const entryAfterOneRemoval = draftAfterOneRemoval?.charTouchEntries.find(([c]) => c === "中");
    expect(entryAfterOneRemoval).toBeDefined();
    expect(entryAfterOneRemoval?.[1]?.mechanisms.length).toBe(1);

    chips = screen.queryByRole("group", { name: /configured characters/i })!.querySelectorAll("button");
    expect(chips.length).toBe(1);

    // Remove the last remaining mechanism — the whole char entry disappears.
    await act(async () => {
      fireEvent.click(chips[0]!);
    });
    const draftAfterAllRemoved = useWorkingCopyStore.getState().touchDraft;
    expect(draftAfterAllRemoved?.charTouchEntries.some(([c]) => c === "中")).toBe(false);
    expect(screen.queryByRole("group", { name: /configured characters/i })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Stay on character after accepting a suggestion (regression 4, stay-on-char)
// ---------------------------------------------------------------------------

describe("TouchGallery — accepting a suggestion stays on the same character", () => {
  it("keeps the same character current after Accept, shows the chooser, and allows adding a second method", async () => {
    // "ä" is decomposable and not in the default layout → longpress suggestion.
    seedStore({ withInventory: ["ä"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    const acceptBtn = screen.queryAllByRole("button").find(
      (b) => b.textContent?.trim() === "Accept",
    ) ?? null;
    expect(acceptBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(acceptBtn!);
    });

    // Still on "ä" (per-char card visible); the suggestion card is gone and the
    // chooser is now visible so the author can add another method to "ä".
    expect(screen.queryAllByText(/Touch mapping/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Suggested: long-press/i)).toBeNull();
    expect(screen.queryByText(/How to reach it on touch/i)).not.toBeNull();

    // Add a second method (flick) for the same character.
    const flickOption = screen.queryByText(/swipe a key \(flick\)/i);
    expect(flickOption).not.toBeNull();
    await act(async () => { fireEvent.click(flickOption!); });

    const hostKeySelect = screen.queryByRole("button", { name: /host key/i });
    expect(hostKeySelect).not.toBeNull();
    await changeSelectMenu(hostKeySelect!, "K_B");
    const directionSelect = screen.queryByRole("button", { name: /flick direction/i });
    expect(directionSelect).not.toBeNull();
    await changeSelectMenu(directionSelect!, "n");

    const applyBtn = screen.queryAllByRole("button").find(
      (b) => b.textContent?.trim() === "Apply method",
    ) ?? null;
    expect(applyBtn).not.toBeNull();
    await act(async () => { fireEvent.click(applyBtn!); });

    const draft = useWorkingCopyStore.getState().touchDraft;
    const entry = draft?.charTouchEntries.find(([c]) => c === "ä");
    expect(entry?.[1]?.mechanisms.length).toBe(2);
    expect(entry?.[1]?.mechanisms.map((m) => m.patternId)).toEqual([
      "longpress_alternates",
      "flick_gestures",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Back survives a remount without any persisted history (regression 2,
// back-button depth — superseded by the positional navigation model)
// ---------------------------------------------------------------------------

describe("TouchGallery — Back survives a remount", () => {
  it("steps to the previous character after remount purely from position, with no history to rehydrate", async () => {
    seedStore({ withInventory: ["ä", "ö"] });

    // Simulate a prior mount that configured "ä" and advanced to "ö", then
    // wrote the draft back to the store before unmounting — the exact state
    // a real unmount/remount (back-nav to Phase C and returning) would leave
    // behind. Note: no history stack is seeded here — the positional model
    // (idx +/- 1 in inventory) needs none; only charTouchEntries persists.
    const configuredAssignment: MechanismAssignment = {
      scope: "individual",
      target: "ä",
      modality: "touch",
      mechanisms: [{ patternId: "longpress_alternates", slotValues: { hostKey: "K_A", char: "ä" } }],
      source: "user",
    };
    useWorkingCopyStore.getState().setTouchDraft({
      charTouchEntries: [["ä", configuredAssignment]],
      suggestionResolvedChars: [],
    });

    const onBack = vi.fn();
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={onBack} />);
    });

    // "ä" is already configured, so the current-character sync lands on "ö".
    const backBtn = screen.queryAllByRole("button", { name: /back/i }).find(
      (b) => b.textContent?.includes("Back"),
    ) ?? null;
    expect(backBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(backBtn!);
    });

    // The regression this guards: the old history-stack model reset to []
    // on every mount, so Back always called onBack (exiting Phase E)
    // regardless of how many characters had actually been visited. The
    // positional model derives Back purely from currentChar's index in
    // inventory, so it steps back to "ä" (idx 0) with nothing to rehydrate.
    expect(onBack).not.toHaveBeenCalled();
    expect(screen.queryAllByText(/Touch mapping/i).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Heading — gallery-QoL rename
// ---------------------------------------------------------------------------

describe("TouchGallery — heading", () => {
  it("renders 'Touch Gallery' as the main heading with 'Touch' subheading", async () => {
    seedStore({ withInventory: ["ä"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });
    // The h1 contains both "Touch Gallery" and the "Touch" span as a child.
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toMatch(/Touch Gallery/i);
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
  // spec 035 R11 — see seedStore's comment: pin the explicit import-adapt
  // choice so these fixtures don't fall into the reseed-always-emits default.
  useSurveySessionStore.getState().setTouchSeedSource("import-adapt");
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

  it("shows a 'longpress' suggestion for a multi-token modifier_as_layer_switch combo (SHIFT+CTRL+RALT)", async () => {
    // Regression: the host-key extraction previously hardcoded a
    // /\[RALT\s+.../ regex, which silently produced no suggestion (empty
    // hostKey) for any combo other than a bare RALT bracket. A three-token
    // combo exercises the general parseKeySpec-based extraction.
    const layerSwitchAssignment: MechanismAssignment = {
      scope: "individual",
      target: "€",
      modality: "physical",
      mechanisms: [
        {
          patternId: "modifier_as_layer_switch",
          strategyId: "S-08",
          slotValues: { altgrKeyList: "[SHIFT CTRL RALT K_4]", altgrOutputList: "€" },
        },
      ],
      source: "user",
    };
    seedWithDesktopAssignment("€", layerSwitchAssignment);

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    // The suggestion names the extracted host key ("4", from K_4) — not the
    // "a key" fallback the component shows when hostKey extraction fails.
    expect(screen.queryByText(/Suggested: long-press 4 to reach/i)).not.toBeNull();
    expect(screen.queryByText(/Suggested: long-press a key to reach/i)).toBeNull();
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
      expectCurrentChar("x");
    });

    // Navigate back to "á" without ever resolving its suggestion.
    fireEvent.click(screen.getByRole("button", { name: /back to previous character/i }));
    await waitFor(() => {
      expectCurrentChar("á");
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
    // Chosen only to exercise the no-suggestion path deterministically — not a
    // CJK-support claim; v1 routes CJK input to a "not yet supported" stub
    // per spec §9/§16.
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

describe("TouchGallery — prior-QC P1 finding: dedupe / revisit invariants", () => {
  it("revisiting an already-configured character skips the suggestion and does not duplicate its mechanism", async () => {
    // "ä" is decomposable and not in the default layout → longpress suggestion,
    // derives hostKey K_A automatically so Accept records the mechanism directly.
    seedStore({ withInventory: ["ä", "ö"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    const acceptBtn = screen.queryAllByRole("button").find(
      (b) => b.textContent?.trim() === "Accept",
    ) ?? null;
    expect(acceptBtn).not.toBeNull();
    await act(async () => { fireEvent.click(acceptBtn!); });

    // Advance to "ö" (pushes "ä" onto history).
    const nextBtn = screen.queryAllByRole("button").find(
      (b) => b.textContent?.trim() === "Next character →",
    ) ?? null;
    expect(nextBtn).not.toBeNull();
    await act(async () => { fireEvent.click(nextBtn!); });

    // Back to "ä" — now a revisit of an already-configured character.
    const backBtn = screen.queryAllByRole("button", { name: /back/i }).find(
      (b) => b.textContent?.includes("Back"),
    ) ?? null;
    expect(backBtn).not.toBeNull();
    await act(async () => { fireEvent.click(backBtn!); });

    // P1 fix (a): the suggestion card must NOT reappear for a char that already
    // has a real mechanism — the chooser shows directly instead.
    expect(screen.queryByText(/Suggested: long-press/i)).toBeNull();
    expect(screen.queryByText(/How to reach it on touch/i)).not.toBeNull();

    // Configured chip count for "ä" is still exactly 1.
    let configuredGroup = screen.queryByRole("group", { name: /configured characters/i });
    expect(configuredGroup).not.toBeNull();
    expect(configuredGroup!.querySelectorAll("button").length).toBe(1);

    // P1 fix (b): even if the same method+hostKey is (re-)applied via the
    // chooser, appendMechanismToChar dedupes — no second identical chip.
    const hostKeySelect = screen.queryByRole("button", { name: /host key/i });
    expect(hostKeySelect).not.toBeNull();
    await changeSelectMenu(hostKeySelect!, "K_A");
    const applyBtn = screen.queryAllByRole("button").find(
      (b) => b.textContent?.trim() === "Apply method",
    ) ?? null;
    expect(applyBtn).not.toBeNull();
    await act(async () => { fireEvent.click(applyBtn!); });

    configuredGroup = screen.queryByRole("group", { name: /configured characters/i });
    expect(configuredGroup).not.toBeNull();
    expect(configuredGroup!.querySelectorAll("button").length).toBe(1);

    const draft = useWorkingCopyStore.getState().touchDraft;
    const entry = draft?.charTouchEntries.find(([c]) => c === "ä");
    expect(entry?.[1]?.mechanisms.length).toBe(1);
  });

  it("applying the identical method+hostKey twice yields ONE chip, not two", async () => {
    // "中" has no suggestion — the chooser shows directly.
    seedStore({ withInventory: ["中"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    const applyIdenticalLongpress = async () => {
      const hostKeySelect = screen.queryByRole("button", { name: /host key/i });
      expect(hostKeySelect).not.toBeNull();
      await changeSelectMenu(hostKeySelect!, "K_A");
      const applyBtn = screen.queryAllByRole("button").find(
        (b) => b.textContent?.trim() === "Apply method",
      ) ?? null;
      expect(applyBtn).not.toBeNull();
      await act(async () => { fireEvent.click(applyBtn!); });
    };

    // Apply longpress K_A once.
    await applyIdenticalLongpress();
    // Apply the exact same method+hostKey again (chooser stays open/reopens
    // at the default longpress method after Apply resets its inputs).
    await applyIdenticalLongpress();

    const configuredGroup = screen.queryByRole("group", { name: /configured characters/i });
    expect(configuredGroup).not.toBeNull();
    expect(configuredGroup!.querySelectorAll("button").length).toBe(1);

    const draft = useWorkingCopyStore.getState().touchDraft;
    const entry = draft?.charTouchEntries.find(([c]) => c === "中");
    expect(entry?.[1]?.mechanisms.length).toBe(1);
  });

  it("dedupes a mechanism whose existing slotValues has a different key order (mechanismRefEquals must be order-independent)", async () => {
    // Two-character inventory: "y" is left unconfigured so the sync effect
    // lands the initial currentChar there (not on the preconfigured "中",
    // idx 0). Back is purely positional (idx 1 -> idx 0), so no history needs
    // seeding to land back on "中" — mirroring how a real session would have
    // visited "中" earlier, then moved on.
    seedStore({ withInventory: ["中", "y"] });

    // Seed an existing mechanism for "中" whose slotValues key order is
    // { char, hostKey } — the reverse of what buildMechanismRef produces
    // ({ hostKey, char }). A JSON.stringify-based comparison would treat
    // this as a distinct ref and append a duplicate; the structural
    // comparison must recognize it as the same mechanism.
    useWorkingCopyStore.getState().setTouchDraft({
      charTouchEntries: [
        [
          "中",
          {
            scope: "individual",
            target: "中",
            modality: "touch",
            mechanisms: [
              { patternId: "longpress_alternates", slotValues: { char: "中", hostKey: "K_A" } },
            ],
            source: "user",
          },
        ],
      ],
      suggestionResolvedChars: [],
    });

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    // Mount lands on "y" (first unconfigured char, idx 1). Back moves one
    // position back (idx 1 -> idx 0), landing on the preconfigured
    // character — "中" has no suggestion, so the chooser (not a suggestion
    // card) shows directly.
    const backBtn = screen.queryAllByRole("button", { name: /back/i }).find(
      (b) => b.textContent?.includes("Back"),
    ) ?? null;
    expect(backBtn).not.toBeNull();
    await act(async () => { fireEvent.click(backBtn!); });

    // Apply the same method+hostKey via the chooser (default method is
    // already "longpress_alternates" — matches buildMechanismRef's key order).
    const hostKeySelect = screen.queryByRole("button", { name: /host key/i });
    expect(hostKeySelect).not.toBeNull();
    await changeSelectMenu(hostKeySelect!, "K_A");
    const applyBtn = screen.queryAllByRole("button").find(
      (b) => b.textContent?.trim() === "Apply method",
    ) ?? null;
    expect(applyBtn).not.toBeNull();
    await act(async () => { fireEvent.click(applyBtn!); });

    // Still exactly one chip / one mechanism — no duplicate from the
    // key-order mismatch.
    const configuredGroup = screen.queryByRole("group", { name: /configured characters/i });
    expect(configuredGroup).not.toBeNull();
    expect(configuredGroup!.querySelectorAll("button").length).toBe(1);

    const draftAfter = useWorkingCopyStore.getState().touchDraft;
    const entryAfter = draftAfter?.charTouchEntries.find(([c]) => c === "中");
    expect(entryAfter?.[1]?.mechanisms.length).toBe(1);
  });

  it("accepting the 'already in layout' suggestion then adding a real method leaves no stray touch_inherited (mutual exclusivity holds)", async () => {
    // "a" is present in the scaffolded default QWERTY touch layout → "already"
    // suggestion (touch_inherited).
    seedStore({ withInventory: ["a"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    const acceptBtn = screen.queryAllByRole("button").find(
      (b) => b.textContent?.trim() === "Accept",
    ) ?? null;
    expect(acceptBtn).not.toBeNull();
    await act(async () => { fireEvent.click(acceptBtn!); });

    // touch_inherited recorded; chooser now visible (suggestionDismissed forced
    // true by handleSuggestionAccept) so a real method can be added.
    let draft = useWorkingCopyStore.getState().touchDraft;
    let entry = draft?.charTouchEntries.find(([c]) => c === "a");
    expect(entry?.[1]?.mechanisms.map((m) => m.patternId)).toEqual(["touch_inherited"]);

    const hostKeySelect = screen.queryByRole("button", { name: /host key/i });
    expect(hostKeySelect).not.toBeNull();
    await changeSelectMenu(hostKeySelect!, "K_A");
    const applyBtn = screen.queryAllByRole("button").find(
      (b) => b.textContent?.trim() === "Apply method",
    ) ?? null;
    expect(applyBtn).not.toBeNull();
    await act(async () => { fireEvent.click(applyBtn!); });

    // The real method REPLACES the inherited-only placeholder — no stray
    // touch_inherited alongside it.
    draft = useWorkingCopyStore.getState().touchDraft;
    entry = draft?.charTouchEntries.find(([c]) => c === "a");
    expect(entry?.[1]?.mechanisms.map((m) => m.patternId)).toEqual(["longpress_alternates"]);
  });
});

// ---------------------------------------------------------------------------
// "Enter my own character..." custom host-key option + U+ notation —
// feature coverage for the shared host-key picker (longpress / flick /
// multitap / replace all share the same `hostKey` state).
//
// "中" has no Phase C desktop assignment, is not in the default touch
// layout, and is not decomposable-accented, so suggestion.kind === "none"
// and the method chooser is shown directly (see the
// "no suggestion goes straight to chooser" suite above) — no Deny click
// needed before reaching the host-key picker.
// ---------------------------------------------------------------------------

describe("TouchGallery — custom host-key option", () => {
  it("selecting 'Enter my own character...' reveals a custom text input", async () => {
    seedStore({ withInventory: ["中"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });
    const hostKeySelect = screen.getByRole("button", { name: /host key for long-press/i });
    await changeSelectMenu(hostKeySelect, CUSTOM_KEY_OPTION_VALUE);
    expect(
      screen.getByLabelText(/Custom character for long-press host key/i),
    ).toBeTruthy();
  });

  it("a custom literal character resolves to a vkey and Apply records it as slotValues.hostKey", async () => {
    seedStore({ withInventory: ["中"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });
    const hostKeySelect = screen.getByRole("button", { name: /host key for long-press/i });
    await changeSelectMenu(hostKeySelect, CUSTOM_KEY_OPTION_VALUE);
    fireEvent.change(screen.getByLabelText(/Custom character for long-press host key/i), {
      target: { value: "b" },
    });
    const applyBtn = screen.getByRole("button", { name: /Apply touch method/i });
    expect((applyBtn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(applyBtn);

    await waitFor(() => {
      const draft = useWorkingCopyStore.getState().touchDraft;
      const entry = draft?.charTouchEntries.find(([c]) => c === "中");
      expect(entry?.[1]?.mechanisms[0]?.patternId).toBe("longpress_alternates");
      expect(entry?.[1]?.mechanisms[0]?.slotValues?.["hostKey"]).toBe("K_B");
    });
  });

  it("custom U+ notation resolves through to the mapped key", async () => {
    seedStore({ withInventory: ["中"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });
    const hostKeySelect = screen.getByRole("button", { name: /host key for long-press/i });
    await changeSelectMenu(hostKeySelect, CUSTOM_KEY_OPTION_VALUE);
    fireEvent.change(screen.getByLabelText(/Custom character for long-press host key/i), {
      target: { value: "U+0062" },
    });
    expect(screen.getByText("U+0062 → b → K_B")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Apply touch method/i }));

    await waitFor(() => {
      const draft = useWorkingCopyStore.getState().touchDraft;
      const entry = draft?.charTouchEntries.find(([c]) => c === "中");
      expect(entry?.[1]?.mechanisms[0]?.slotValues?.["hostKey"]).toBe("K_B");
    });
  });

  it("an unmappable custom character shows an error and blocks Apply", async () => {
    seedStore({ withInventory: ["中"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });
    const hostKeySelect = screen.getByRole("button", { name: /host key for long-press/i });
    await changeSelectMenu(hostKeySelect, CUSTOM_KEY_OPTION_VALUE);
    fireEvent.change(screen.getByLabelText(/Custom character for long-press host key/i), {
      target: { value: "é" },
    });
    expect(
      screen.getByText(/Cannot map 'é' to a physical key — pick a key from the list instead\./i),
    ).toBeTruthy();
    const applyBtn = screen.getByRole("button", { name: /Apply touch method/i });
    expect((applyBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("invalid U+ notation blocks Apply", async () => {
    seedStore({ withInventory: ["中"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });
    const hostKeySelect = screen.getByRole("button", { name: /host key for long-press/i });
    await changeSelectMenu(hostKeySelect, CUSTOM_KEY_OPTION_VALUE);
    fireEvent.change(screen.getByLabelText(/Custom character for long-press host key/i), {
      target: { value: "U+ZZZZ" },
    });
    expect(screen.getByText(/Not a valid Unicode value/i)).toBeTruthy();
    const applyBtn = screen.getByRole("button", { name: /Apply touch method/i });
    expect((applyBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("the host-key custom-character input carries no placeholder attribute (Fix 1 — guidance moved out of the box)", async () => {
    seedStore({ withInventory: ["中"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });
    const hostKeySelect = screen.getByRole("button", { name: /host key for long-press/i });
    await changeSelectMenu(hostKeySelect, CUSTOM_KEY_OPTION_VALUE);
    const customInput = screen.getByLabelText(/Custom character for long-press host key/i);
    expect(customInput.getAttribute("placeholder")).toBeNull();
  });

  it("shows the shared custom-input help line only once host-key custom mode is active", async () => {
    seedStore({ withInventory: ["中"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });
    expect(
      screen.queryByText("Type a character directly, or a Unicode value like U+00E9."),
    ).toBeNull();
    const hostKeySelect = screen.getByRole("button", { name: /host key for long-press/i });
    await changeSelectMenu(hostKeySelect, CUSTOM_KEY_OPTION_VALUE);
    expect(
      screen.getByText("Type a character directly, or a Unicode value like U+00E9."),
    ).toBeTruthy();
  });

  it("reflects a literal custom host-key character bidirectionally (char → U+ → vkey)", async () => {
    seedStore({ withInventory: ["中"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });
    const hostKeySelect = screen.getByRole("button", { name: /host key for long-press/i });
    await changeSelectMenu(hostKeySelect, CUSTOM_KEY_OPTION_VALUE);
    fireEvent.change(screen.getByLabelText(/Custom character for long-press host key/i), {
      target: { value: "b" },
    });
    expect(screen.getByText("b → U+0062 → K_B")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// buildTouchMechanismRef — resolved-vkey invariant (P1 QC finding).
//
// buildMechanismRef (the component-internal closure) is a thin wrapper over
// this exported pure function — unit-testing it directly here avoids relying
// on the disabled Apply button as the sole proof the invariant holds (a
// disabled button never fires its onClick in jsdom, so driving this through
// the UI cannot exercise the null-resolvedHostKey branch at all).
// ---------------------------------------------------------------------------

describe("buildTouchMechanismRef — resolved-vkey invariant", () => {
  it("returns null when resolvedHostKey is null, for every method", () => {
    expect(buildTouchMechanismRef("longpress_alternates", null, "", "中")).toBeNull();
    expect(buildTouchMechanismRef("flick_gestures", null, "n", "中")).toBeNull();
    expect(buildTouchMechanismRef("multitap", null, "", "中")).toBeNull();
    expect(buildTouchMechanismRef("touch_key_replace", null, "", "中")).toBeNull();
  });

  it("builds the expected mechanism ref for each method when resolvedHostKey is a real vkey", () => {
    // Every ref now carries an explicit `layer` derived from the placed
    // character's case (spec 051 FR-006). "中" is caseless, so it lands on
    // "default" — the same layer these refs have always targeted, since both
    // appliers treat an absent `layer` as "default".
    expect(buildTouchMechanismRef("longpress_alternates", "K_B", "", "中")).toEqual({
      patternId: "longpress_alternates",
      slotValues: { hostKey: "K_B", char: "中", layer: "default" },
    });
    expect(buildTouchMechanismRef("flick_gestures", "K_B", "n", "中")).toEqual({
      patternId: "flick_gestures",
      slotValues: { hostKey: "K_B", direction: "n", char: "中", layer: "default" },
    });
    expect(buildTouchMechanismRef("multitap", "K_B", "", "中")).toEqual({
      patternId: "multitap",
      slotValues: { hostKey: "K_B", char: "中", layer: "default" },
    });
    expect(buildTouchMechanismRef("touch_key_replace", "K_B", "", "中")).toEqual({
      patternId: "touch_key_replace",
      slotValues: { hostKey: "K_B", char: "中", layer: "default" },
    });
  });
});

// ---------------------------------------------------------------------------
// Spec 051 US3 — case-aware touch placement (FR-006) and the shift-layer
// case-pair proposal (FR-005).
//
// Before the `layer` slot existed, case was UNREPRESENTABLE in a touch
// placement: both appliers hardcoded the phone "default" layer, so an accented
// uppercase letter landed on the lowercase layer. buildTouchMechanismRef now
// derives the layer from the placed character's case.
// ---------------------------------------------------------------------------

describe("buildTouchMechanismRef — case-derived layer (spec 051 FR-006)", () => {
  it("emits layer 'default' for a lowercase letter and 'shift' for its capital", () => {
    expect(
      buildTouchMechanismRef("longpress_alternates", "K_A", "", "a")
        ?.slotValues?.["layer"],
    ).toBe("default");
    expect(
      buildTouchMechanismRef("longpress_alternates", "K_A", "", "A")
        ?.slotValues?.["layer"],
    ).toBe("shift");
  });

  it("handles decomposable accented letters in both cases (á / Á)", () => {
    expect(
      buildTouchMechanismRef("longpress_alternates", "K_A", "", "á")
        ?.slotValues?.["layer"],
    ).toBe("default");
    // The inverse case the spec did not name: an accented UPPERCASE letter must
    // not land on the lowercase layer.
    expect(
      buildTouchMechanismRef("longpress_alternates", "K_A", "", "Á")
        ?.slotValues?.["layer"],
    ).toBe("shift");
  });

  it("puts a caseless letter on the default layer", () => {
    expect(
      buildTouchMechanismRef("multitap", "K_A", "", "ا")?.slotValues?.["layer"],
    ).toBe("default");
  });

  it("carries the layer on every method, and never encodes it into hostKey", () => {
    for (const method of [
      "longpress_alternates",
      "flick_gestures",
      "multitap",
      "touch_key_replace",
    ] as const) {
      const ref = buildTouchMechanismRef(method, "K_A", "n", "Á");
      expect(ref?.slotValues?.["layer"]).toBe("shift");
      // hostKey keeps its exact current meaning: a resolved vkey.
      expect(ref?.slotValues?.["hostKey"]).toBe("K_A");
    }
  });

  it("treats {K_A, á, default} and {K_A, Á, shift} as distinct refs", () => {
    const lower = buildTouchMechanismRef("longpress_alternates", "K_A", "", "á");
    const upper = buildTouchMechanismRef("longpress_alternates", "K_A", "", "Á");
    expect(lower).not.toEqual(upper);
    expect(lower?.slotValues?.["layer"]).not.toBe(upper?.slotValues?.["layer"]);
  });
});

describe("TouchGallery — shift-layer case-pair proposal (spec 051 US3)", () => {
  /** Apply the default long-press method on `hostKey` for the current char. */
  async function applyLongpressOn(hostKey: string) {
    const select = screen.queryByRole("button", { name: /host key/i });
    expect(select).not.toBeNull();
    await changeSelectMenu(select!, hostKey);
    const applyBtn =
      screen
        .queryAllByRole("button")
        .find((b) => b.textContent?.trim() === "Apply method") ?? null;
    expect(applyBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(applyBtn!);
    });
  }

  function touchMechanismsFor(char: string) {
    const draft = useWorkingCopyStore.getState().touchDraft;
    return (
      draft?.charTouchEntries.find(([c]) => c === char)?.[1]?.mechanisms ?? []
    );
  }

  it("a lowercase placement raises a proposal whose confirm records the capital on the shift layer", async () => {
    seedStore({ withInventory: ["θ"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await applyLongpressOn("K_A");

    expect(screen.getByText(/has an uppercase form, Θ/i)).toBeTruthy();

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /Map Θ to the shift layer of/i }),
      );
    });

    // The source placement is untouched on the default layer...
    expect(touchMechanismsFor("θ")[0]?.slotValues).toMatchObject({
      hostKey: "K_A",
      char: "θ",
      layer: "default",
    });
    // ...and the capital lands on the shift layer of the same host key.
    expect(touchMechanismsFor("Θ")[0]?.slotValues).toMatchObject({
      hostKey: "K_A",
      char: "Θ",
      layer: "shift",
    });
  });

  it("dismissing records nothing", async () => {
    seedStore({ withInventory: ["θ"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await applyLongpressOn("K_A");
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /Do not map Θ to the shift layer/i }),
      );
    });

    expect(touchMechanismsFor("Θ")).toHaveLength(0);
    expect(touchMechanismsFor("θ")).toHaveLength(1);
    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
  });

  it("a caseless letter raises no proposal", async () => {
    seedStore({ withInventory: ["中"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await applyLongpressOn("K_A");

    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
    expect(touchMechanismsFor("中")).toHaveLength(1);
  });

  it("raises no redundant proposal once the capital is already on that host key's shift layer", async () => {
    seedStore({ withInventory: ["θ"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    // First apply: propose, then confirm — Θ now sits on K_A's shift layer.
    await applyLongpressOn("K_A");
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /Map Θ to the shift layer of/i }),
      );
    });
    expect(touchMechanismsFor("Θ")).toHaveLength(1);

    // Re-applying the same placement must not re-offer a pairing that exists
    // (spec §Edge Cases, "counterpart already placed").
    await applyLongpressOn("K_A");
    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
    expect(touchMechanismsFor("Θ")).toHaveLength(1);
  });

  it("still proposes when the capital exists on a DIFFERENT host key's shift layer", async () => {
    seedStore({ withInventory: ["θ"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await applyLongpressOn("K_A");
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /Map Θ to the shift layer of/i }),
      );
    });

    // A placement on another host key is a different parallel slot, so the
    // suppression must not over-reach.
    await applyLongpressOn("K_B");
    expect(screen.queryByText(/has an uppercase form, Θ/i)).toBeTruthy();
  });

  it("does not consult or write suggestionResolved — that set governs the placement card, not this proposal", async () => {
    seedStore({ withInventory: ["θ"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    const before =
      useWorkingCopyStore.getState().touchDraft?.suggestionResolvedChars ?? [];

    await applyLongpressOn("K_A");
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /Map Θ to the shift layer of/i }),
      );
    });

    const after =
      useWorkingCopyStore.getState().touchDraft?.suggestionResolvedChars ?? [];
    // The capital never enters the placement-suggestion resolved set.
    expect(after).not.toContain("Θ");
    expect(after.filter((c) => !before.includes(c))).not.toContain("Θ");
  });

  it("stale-guard: confirming a proposal whose raising mechanism ref vanished via chip removal records nothing", async () => {
    seedStore({ withInventory: ["θ"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await applyLongpressOn("K_A");
    expect(screen.getByText(/has an uppercase form, Θ/i)).toBeTruthy();

    // Remove the just-applied mechanism for "θ" via its configured chip —
    // the in-UI equivalent of the raising ref vanishing out from under the
    // banner. handleRemoveMechanism does not proactively dismiss the
    // companion (unlike the physical/combo removal paths), so the banner
    // stays visible and confirming it below exercises handleCasePairConfirm's
    // confirm-time staleness re-check
    // (`existing.mechanisms.includes(baseRef)`) rather than a removal-time
    // dismissal.
    const configuredGroup = screen.getByRole("group", {
      name: /configured characters/i,
    });
    const chips = configuredGroup.querySelectorAll("button");
    expect(chips.length).toBe(1);
    await act(async () => {
      fireEvent.click(chips[0]!);
    });
    expect(touchMechanismsFor("θ")).toHaveLength(0);

    // Banner is still up — the component's pending-proposal state is
    // untouched by the direct chip removal.
    expect(screen.getByText(/has an uppercase form, Θ/i)).toBeTruthy();

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /Map Θ to the shift layer of/i }),
      );
    });

    // Nothing was recorded for the counterpart — the stale proposal was
    // dismissed, not applied.
    expect(touchMechanismsFor("Θ")).toHaveLength(0);
    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Touch layer picker — #1 longpress / #2 flick gain a layer option modeled
// on MechanismGallery's S-08 "Layer + key" card: options are derived from
// the working KeyboardIR (collectLayerCombosInUse), never hardcoded, and are
// ONLY the layers the desktop keyboard actually uses.
// ---------------------------------------------------------------------------

describe("buildTouchMechanismRef — explicit layer override (touch layer picker)", () => {
  it("uses the explicit layer over the case-derived default when provided", () => {
    // Lowercase "a" would otherwise fall back to "default" — the explicit
    // layer wins.
    expect(
      buildTouchMechanismRef("longpress_alternates", "K_A", "", "a", "rightalt")
        ?.slotValues?.["layer"],
    ).toBe("rightalt");
    expect(
      buildTouchMechanismRef("flick_gestures", "K_A", "n", "a", "shift")
        ?.slotValues?.["layer"],
    ).toBe("shift");
  });

  it("falls back to the case-derived layer when explicitLayer is omitted or empty", () => {
    expect(
      buildTouchMechanismRef("longpress_alternates", "K_A", "", "A", "")
        ?.slotValues?.["layer"],
    ).toBe("shift");
    expect(
      buildTouchMechanismRef("longpress_alternates", "K_A", "", "A")
        ?.slotValues?.["layer"],
    ).toBe("shift");
  });
});

// ---------------------------------------------------------------------------
// Touch layer builder fixtures — module scope so both the builder suite
// below AND the uppercase-current-char regression suite further down (which
// needs an IR that actually uses SHIFT, so the FR-006 case-derived seed is a
// combo the desktop keyboard actually uses) can share them.
// ---------------------------------------------------------------------------

/** A rule with a single vkey context element carrying `modifiers`. */
function makeVkeyRule(vkey: string, modifiers: string[], output: string): IRRule {
  return {
    nodeId: `rule:${vkey}:${modifiers.join(",") || "none"}`,
    context: [{ kind: "vkey", name: vkey, modifiers }],
    output: [{ kind: "char", value: output }],
  };
}

function makeIrGroup(rules: IRRule[]): IRGroup {
  return { nodeId: "group:main", name: "main", usingKeys: true, rules, readonly: false };
}

/** A desktop IR using the base layer, SHIFT, and RALT — the corpus
 * `collectLayerCombosInUse` reports as `[["SHIFT"], ["RALT"]]` (insertion
 * order), so the builder must offer exactly Shift + RAlt at slot 1 and
 * nothing else (e.g. no Ctrl/Caps, which this IR never uses). */
const irWithShiftAndRaltLayers = makeTestIR([
  makeIrGroup([
    makeVkeyRule("K_A", [], "a"),
    makeVkeyRule("K_A", ["SHIFT"], "A"),
    makeVkeyRule("K_E", ["RALT"], "é"),
  ]),
]);

/** A desktop IR whose ONLY layer combo is the two-token SHIFT+RALT combo —
 * no bare SHIFT and no bare RALT — so a partial ["SHIFT"] selection is
 * genuinely invalid (not itself a member of D) until RALT is added too. */
const irWithShiftRaltComboOnly = makeTestIR([
  makeIrGroup([makeVkeyRule("K_E", ["SHIFT", "RALT"], "é")]),
]);

/** A desktop IR with two 2-token combos sharing SHIFT (SHIFT+RALT,
 * SHIFT+CTRL) — used to show that, having picked SHIFT, the next slot
 * offers exactly {RALT, CTRL} and nothing else (e.g. never CAPS, which
 * appears in no combo at all). */
const irWithTwoShiftCombos = makeTestIR([
  makeIrGroup([
    makeVkeyRule("K_E", ["SHIFT", "RALT"], "é"),
    makeVkeyRule("K_U", ["SHIFT", "CTRL"], "ü"),
  ]),
]);

/** A desktop IR where SHIFT alone is already a complete valid combo, with
 * no combo extending it further — the "add" button must not appear once
 * SHIFT is chosen, since no token can legally extend the selection toward
 * ANY other combo in D. */
const irWithShiftDeadEnd = makeTestIR([
  makeIrGroup([
    makeVkeyRule("K_A", ["SHIFT"], "A"),
    makeVkeyRule("K_B", ["CTRL", "RALT"], "b"),
  ]),
]);

/** A desktop IR that never uses bare SHIFT as a layer combo at all —
 * `collectLayerCombosInUse` reports only `[["RALT"], ["CTRL"]]`. Used to
 * regression-test the case where `seedLayerTokensForChar`'s case-derived
 * `["SHIFT"]` seed for an uppercase current char is NOT itself a member of
 * D — a recoverable edge (not a crash): the note shows, Apply stays
 * disabled, and removing the seeded slot falls back to the always-valid
 * base/default combo. */
const irWithoutShiftCombo = makeTestIR([
  makeIrGroup([
    makeVkeyRule("K_E", ["RALT"], "é"),
    makeVkeyRule("K_B", ["CTRL"], "b"),
  ]),
]);

describe("TouchGallery — touch layer BUILDER (all four methods)", () => {
  /** Dismiss the auto-detected suggestion (if any) so the method chooser is
   * showing, then switch to the given card (longpress is the default method,
   * so switching there is a no-op click). */
  async function openChooser(cardText: RegExp) {
    const denyBtn =
      screen.queryAllByRole("button").find((b) => b.textContent?.trim() === "Deny") ?? null;
    if (denyBtn !== null) {
      await act(async () => {
        fireEvent.click(denyBtn);
      });
    }
    const card = screen.queryByText(cardText);
    expect(card).not.toBeNull();
    await act(async () => {
      fireEvent.click(card!);
    });
  }

  it("renders a layer builder for #1 longpress, defaulting to the base layer (no slots, add available)", async () => {
    seedStore({ withInventory: ["ä"], ir: irWithShiftAndRaltLayers });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await openChooser(/long.press on a key/i);

    // No slot dropdown yet — the base/default layer is the empty combo.
    expect(
      screen.queryByRole("button", { name: /^touch layer 1 for long-press$/i }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: /add another touch layer for long-press/i }),
    ).toBeTruthy();
    expect(screen.getByText(/Resulting layer: Base/i)).toBeTruthy();
  });

  it("renders a layer builder for #2 swipe/flick, defaulting to the base layer (no slots, add available)", async () => {
    seedStore({ withInventory: ["ä"], ir: irWithShiftAndRaltLayers });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await openChooser(/swipe a key \(flick\)/i);

    expect(
      screen.queryByRole("button", { name: /^touch layer 1 for flick$/i }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: /add another touch layer for flick/i }),
    ).toBeTruthy();
  });

  it("renders the layer builder for #3 multitap too, defaulting to the base layer", async () => {
    seedStore({ withInventory: ["ä"], ir: irWithShiftAndRaltLayers });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await openChooser(/tap multiple times \(multitap\)/i);

    expect(
      screen.queryByRole("button", { name: /^touch layer 1 for multitap$/i }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: /add another touch layer for multitap/i }),
    ).toBeTruthy();
    expect(screen.getByText(/Resulting layer: Base/i)).toBeTruthy();
  });

  it("renders the layer builder for #4 replace too, defaulting to the base layer", async () => {
    seedStore({ withInventory: ["ä"], ir: irWithShiftAndRaltLayers });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await openChooser(/replace a key/i);

    expect(
      screen.queryByRole("button", { name: /^touch layer 1 for replace$/i }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: /add another touch layer for replace/i }),
    ).toBeTruthy();
    expect(screen.getByText(/Resulting layer: Base/i)).toBeTruthy();
  });

  it("slot 1 options reflect ONLY the combos the desktop keyboard actually uses", async () => {
    seedStore({ withInventory: ["ä"], ir: irWithShiftAndRaltLayers });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await openChooser(/long.press on a key/i);

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /add another touch layer for long-press/i }),
      );
    });
    const slot1 = screen.getByRole("button", {
      name: /^touch layer 1 for long-press$/i,
    });
    const values = await selectMenuOptionValues(slot1);
    // "" is the placeholder ("— Select —"); SHIFT/RALT come from the seeded
    // IR's own rules; nothing the IR doesn't use (e.g. CAPS/CTRL) leaks in.
    expect(values).toEqual(["", "SHIFT", "RALT"]);
  });

  it("a token appearing in no combo at all is never offered, even mid-build", async () => {
    seedStore({ withInventory: ["ä"], ir: irWithTwoShiftCombos });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await openChooser(/long.press on a key/i);

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /add another touch layer for long-press/i }),
      );
    });
    const slot1 = screen.getByRole("button", {
      name: /^touch layer 1 for long-press$/i,
    });
    await changeSelectMenu(slot1, "SHIFT");

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /add another touch layer for long-press/i }),
      );
    });
    const slot2 = screen.getByRole("button", {
      name: /^touch layer 2 for long-press$/i,
    });
    const values = await selectMenuOptionValues(slot2);
    // RALT and CTRL each complete one of the two SHIFT-combos in D; CAPS
    // appears in neither and is never offered.
    expect(values).toEqual(["", "RALT", "CTRL"]);
  });

  it("hides the add button once the selection has no legal extension toward any combo in D", async () => {
    seedStore({ withInventory: ["ä"], ir: irWithShiftDeadEnd });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await openChooser(/long.press on a key/i);

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /add another touch layer for long-press/i }),
      );
    });
    const slot1 = screen.getByRole("button", {
      name: /^touch layer 1 for long-press$/i,
    });
    await changeSelectMenu(slot1, "SHIFT");

    // SHIFT alone is already a complete combo in D with no valid extension
    // (the other combo, CTRL+RALT, does not contain SHIFT) — no add button.
    expect(
      screen.queryByRole("button", { name: /add another touch layer for long-press/i }),
    ).toBeNull();
  });

  it("canApply blocks Apply on a partial combo, and applying a completed multi-token combo routes to that combined layer", async () => {
    seedStore({ withInventory: ["ä"], ir: irWithShiftRaltComboOnly });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await openChooser(/long.press on a key/i);

    const hostKeySelect = screen.getByRole("button", { name: /host key/i });
    await changeSelectMenu(hostKeySelect, "K_B");

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /add another touch layer for long-press/i }),
      );
    });
    const slot1 = screen.getByRole("button", {
      name: /^touch layer 1 for long-press$/i,
    });
    await changeSelectMenu(slot1, "SHIFT");

    const applyBtn = () =>
      screen.queryAllByRole("button").find((b) => b.textContent?.trim() === "Apply method") ??
      null;

    // Partial combo ["SHIFT"] is NOT itself a member of D (only [SHIFT,RALT]
    // is) — Apply must stay disabled.
    expect(applyBtn()?.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/Not yet a layer this keyboard uses/i)).toBeTruthy();

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /add another touch layer for long-press/i }),
      );
    });
    const slot2 = screen.getByRole("button", {
      name: /^touch layer 2 for long-press$/i,
    });
    await changeSelectMenu(slot2, "RALT");

    expect(applyBtn()?.hasAttribute("disabled")).toBe(false);
    expect(screen.getByText(/Resulting layer: Shift\+RAlt/i)).toBeTruthy();

    await act(async () => {
      fireEvent.click(applyBtn()!);
    });

    const draft = useWorkingCopyStore.getState().touchDraft;
    const mechanisms =
      draft?.charTouchEntries.find(([c]) => c === "ä")?.[1]?.mechanisms ?? [];
    // comboToTouchLayerId(["SHIFT","RALT"]) orders RALT before SHIFT
    // (TOUCH_LAYER_PRECEDENCE_ORDER) -> "rightalt-shift".
    expect(mechanisms[0]?.slotValues).toMatchObject({
      hostKey: "K_B",
      char: "ä",
      layer: "rightalt-shift",
    });
  });

  it("applying with a single-token layer selection (backward-compat with the single-select picker) routes the mechanism to that layer", async () => {
    seedStore({ withInventory: ["ä"], ir: irWithShiftAndRaltLayers });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await openChooser(/long.press on a key/i);

    const hostKeySelect = screen.getByRole("button", { name: /host key/i });
    await changeSelectMenu(hostKeySelect, "K_B");

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /add another touch layer for long-press/i }),
      );
    });
    const slot1 = screen.getByRole("button", {
      name: /^touch layer 1 for long-press$/i,
    });
    await changeSelectMenu(slot1, "RALT");

    const applyBtn =
      screen.queryAllByRole("button").find((b) => b.textContent?.trim() === "Apply method") ??
      null;
    expect(applyBtn).not.toBeNull();
    expect(applyBtn?.hasAttribute("disabled")).toBe(false);
    await act(async () => {
      fireEvent.click(applyBtn!);
    });

    const draft = useWorkingCopyStore.getState().touchDraft;
    const mechanisms =
      draft?.charTouchEntries.find(([c]) => c === "ä")?.[1]?.mechanisms ?? [];
    expect(mechanisms[0]?.slotValues).toMatchObject({
      hostKey: "K_B",
      char: "ä",
      layer: "rightalt",
    });
  });

  // Twin of the test directly above — #2 flick gets the same layer builder,
  // and a non-default selection there must route the flick mechanism onto
  // that layer too.
  it("applying flick with a single-token layer selection routes the mechanism to that layer", async () => {
    seedStore({ withInventory: ["ä"], ir: irWithShiftAndRaltLayers });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await openChooser(/swipe a key \(flick\)/i);

    const hostKeySelect = screen.getByRole("button", { name: /host key/i });
    await changeSelectMenu(hostKeySelect, "K_B");

    const directionSelect = screen.getByRole("button", {
      name: /flick direction/i,
    });
    await changeSelectMenu(directionSelect, "n");

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /add another touch layer for flick/i }),
      );
    });
    const slot1 = screen.getByRole("button", {
      name: /^touch layer 1 for flick$/i,
    });
    await changeSelectMenu(slot1, "RALT");

    const applyBtn =
      screen.queryAllByRole("button").find((b) => b.textContent?.trim() === "Apply method") ??
      null;
    expect(applyBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(applyBtn!);
    });

    const draft = useWorkingCopyStore.getState().touchDraft;
    const mechanisms =
      draft?.charTouchEntries.find(([c]) => c === "ä")?.[1]?.mechanisms ?? [];
    expect(mechanisms[0]?.slotValues).toMatchObject({
      hostKey: "K_B",
      direction: "n",
      char: "ä",
      layer: "rightalt",
    });
  });

  // Flick twin of the longpress multi-token apply test above — a completed
  // 2-token desktop combo (Shift+RAlt) must route the flick mechanism to the
  // combined layer, carrying BOTH slotValues.layer and slotValues.direction.
  it("canApply blocks flick's Apply on a partial combo, and applying a completed multi-token combo routes to that combined layer", async () => {
    seedStore({ withInventory: ["ä"], ir: irWithShiftRaltComboOnly });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await openChooser(/swipe a key \(flick\)/i);

    const hostKeySelect = screen.getByRole("button", { name: /host key/i });
    await changeSelectMenu(hostKeySelect, "K_B");

    const directionSelect = screen.getByRole("button", {
      name: /flick direction/i,
    });
    await changeSelectMenu(directionSelect, "n");

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /add another touch layer for flick/i }),
      );
    });
    const slot1 = screen.getByRole("button", {
      name: /^touch layer 1 for flick$/i,
    });
    await changeSelectMenu(slot1, "SHIFT");

    const applyBtn = () =>
      screen.queryAllByRole("button").find((b) => b.textContent?.trim() === "Apply method") ??
      null;

    // Partial combo ["SHIFT"] is NOT itself a member of D (only [SHIFT,RALT]
    // is) — Apply must stay disabled, same as the longpress case.
    expect(applyBtn()?.hasAttribute("disabled")).toBe(true);

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /add another touch layer for flick/i }),
      );
    });
    const slot2 = screen.getByRole("button", {
      name: /^touch layer 2 for flick$/i,
    });
    await changeSelectMenu(slot2, "RALT");

    expect(applyBtn()?.hasAttribute("disabled")).toBe(false);

    await act(async () => {
      fireEvent.click(applyBtn()!);
    });

    const draft = useWorkingCopyStore.getState().touchDraft;
    const mechanisms =
      draft?.charTouchEntries.find(([c]) => c === "ä")?.[1]?.mechanisms ?? [];
    // comboToTouchLayerId(["SHIFT","RALT"]) -> "rightalt-shift", same
    // TOUCH_LAYER_PRECEDENCE_ORDER as the longpress twin.
    expect(mechanisms[0]?.slotValues).toMatchObject({
      hostKey: "K_B",
      direction: "n",
      char: "ä",
      layer: "rightalt-shift",
    });
  });

  // Multitap twin of the longpress/flick multi-token apply tests above — the
  // layer builder is now shared by #3 multitap too.
  it("canApply blocks multitap's Apply on a partial combo, and applying a completed multi-token combo routes to that combined layer", async () => {
    seedStore({ withInventory: ["ä"], ir: irWithShiftRaltComboOnly });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await openChooser(/tap multiple times \(multitap\)/i);

    const hostKeySelect = screen.getByRole("button", { name: /host key/i });
    await changeSelectMenu(hostKeySelect, "K_B");

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /add another touch layer for multitap/i }),
      );
    });
    const slot1 = screen.getByRole("button", {
      name: /^touch layer 1 for multitap$/i,
    });
    await changeSelectMenu(slot1, "SHIFT");

    const applyBtn = () =>
      screen.queryAllByRole("button").find((b) => b.textContent?.trim() === "Apply method") ??
      null;

    // Partial combo ["SHIFT"] is NOT itself a member of D (only [SHIFT,RALT]
    // is) — Apply must stay disabled, same as longpress/flick.
    expect(applyBtn()?.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/Not yet a layer this keyboard uses/i)).toBeTruthy();

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /add another touch layer for multitap/i }),
      );
    });
    const slot2 = screen.getByRole("button", {
      name: /^touch layer 2 for multitap$/i,
    });
    await changeSelectMenu(slot2, "RALT");

    expect(applyBtn()?.hasAttribute("disabled")).toBe(false);

    await act(async () => {
      fireEvent.click(applyBtn()!);
    });

    const draft = useWorkingCopyStore.getState().touchDraft;
    const mechanisms =
      draft?.charTouchEntries.find(([c]) => c === "ä")?.[1]?.mechanisms ?? [];
    expect(mechanisms[0]?.slotValues).toMatchObject({
      hostKey: "K_B",
      char: "ä",
      layer: "rightalt-shift",
    });
  });

  // Replace twin of the same test — the layer builder is now shared by #4
  // replace too.
  it("canApply blocks replace's Apply on a partial combo, and applying a completed multi-token combo routes to that combined layer", async () => {
    seedStore({ withInventory: ["ä"], ir: irWithShiftRaltComboOnly });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await openChooser(/replace a key/i);

    const hostKeySelect = screen.getByRole("button", { name: /host key/i });
    await changeSelectMenu(hostKeySelect, "K_B");

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /add another touch layer for replace/i }),
      );
    });
    const slot1 = screen.getByRole("button", {
      name: /^touch layer 1 for replace$/i,
    });
    await changeSelectMenu(slot1, "SHIFT");

    const applyBtn = () =>
      screen.queryAllByRole("button").find((b) => b.textContent?.trim() === "Apply method") ??
      null;

    // Partial combo ["SHIFT"] is NOT itself a member of D (only [SHIFT,RALT]
    // is) — Apply must stay disabled, same as the other three methods.
    expect(applyBtn()?.hasAttribute("disabled")).toBe(true);

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /add another touch layer for replace/i }),
      );
    });
    const slot2 = screen.getByRole("button", {
      name: /^touch layer 2 for replace$/i,
    });
    await changeSelectMenu(slot2, "RALT");

    expect(applyBtn()?.hasAttribute("disabled")).toBe(false);

    await act(async () => {
      fireEvent.click(applyBtn()!);
    });

    const draft = useWorkingCopyStore.getState().touchDraft;
    const mechanisms =
      draft?.charTouchEntries.find(([c]) => c === "ä")?.[1]?.mechanisms ?? [];
    expect(mechanisms[0]?.slotValues).toMatchObject({
      hostKey: "K_B",
      char: "ä",
      layer: "rightalt-shift",
    });
  });

  // Defaults-first regression (spec §3c): an author who never touches the
  // builder for multitap/replace must see byte-identical behavior to before
  // this feature — the seeded layer (empty for lowercase, SHIFT for
  // uppercase) is what gets applied, exactly as buildTouchMechanismRef's own
  // touchLayerForChar fallback always produced.
  it("multitap applies on the untouched default (base) layer when the builder is left alone", async () => {
    seedStore({ withInventory: ["ä"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await openChooser(/tap multiple times \(multitap\)/i);

    const hostKeySelect = screen.getByRole("button", { name: /host key/i });
    await changeSelectMenu(hostKeySelect, "K_B");

    const applyBtn =
      screen.queryAllByRole("button").find((b) => b.textContent?.trim() === "Apply method") ??
      null;
    expect(applyBtn).not.toBeNull();
    expect(applyBtn?.hasAttribute("disabled")).toBe(false);
    await act(async () => {
      fireEvent.click(applyBtn!);
    });

    const draft = useWorkingCopyStore.getState().touchDraft;
    const mechanisms =
      draft?.charTouchEntries.find(([c]) => c === "ä")?.[1]?.mechanisms ?? [];
    expect(mechanisms[0]?.slotValues).toMatchObject({
      hostKey: "K_B",
      char: "ä",
      layer: "default",
    });
  });

  it("replace applies on the untouched default (base) layer when the builder is left alone", async () => {
    seedStore({ withInventory: ["ä"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await openChooser(/replace a key/i);

    const hostKeySelect = screen.getByRole("button", { name: /host key/i });
    await changeSelectMenu(hostKeySelect, "K_B");

    const applyBtn =
      screen.queryAllByRole("button").find((b) => b.textContent?.trim() === "Apply method") ??
      null;
    expect(applyBtn).not.toBeNull();
    expect(applyBtn?.hasAttribute("disabled")).toBe(false);
    await act(async () => {
      fireEvent.click(applyBtn!);
    });

    const draft = useWorkingCopyStore.getState().touchDraft;
    const mechanisms =
      draft?.charTouchEntries.find(([c]) => c === "ä")?.[1]?.mechanisms ?? [];
    expect(mechanisms[0]?.slotValues).toMatchObject({
      hostKey: "K_B",
      char: "ä",
      layer: "default",
    });
  });
});

// ---------------------------------------------------------------------------
// Uppercase current char — touchLayerForChar's pre-existing case-derived
// default (spec 051 FR-006) must survive the layer picker: the picker's
// initial value for an uppercase current char is "shift", not "default", and
// applying on that default layer must not raise a redundant case-pair
// proposal (casePairTouchLayer("shift") === null — there is no "more
// uppercase" layer to pair "shift" with). Closes the uppercase-path
// regression gap: the existing suite above only ever seeds a lowercase
// current char ("ä"/"θ"/"中").
// ---------------------------------------------------------------------------

describe("TouchGallery — uppercase current char (spec 051 FR-006 layer-picker regression)", () => {
  it("layer builder seeds a SHIFT slot, and applying raises no case-pair proposal", async () => {
    // "Á" is both uppercase (touchLayerForChar -> "shift") and decomposable
    // accented (isDecomposableAccented -> true, so the auto-detected
    // longpress suggestion card shows first — same shape as the "ä" tests
    // above); Deny it to reach the method chooser. Seeded with an IR that
    // actually uses SHIFT (irWithShiftAndRaltLayers) — the hard constraint
    // (D3 of this feature) requires the FR-006 case-derived seed combo to be
    // a combo the desktop keyboard actually uses, same as any other combo;
    // every real Latin-script keyboard with uppercase letters satisfies this
    // trivially (it must use SHIFT to produce them on desktop too).
    seedStore({ withInventory: ["Á"], ir: irWithShiftAndRaltLayers });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    const denyBtn =
      screen.queryAllByRole("button").find((b) => b.textContent?.trim() === "Deny") ?? null;
    expect(denyBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(denyBtn!);
    });

    // longpress_alternates is the per-char default method, so the chooser is
    // already showing its card — the layer builder's seeded slot must
    // preserve the pre-existing touchLayerForChar behavior: a single SHIFT
    // slot for an uppercase current char, not the empty (base) combo.
    const layerSelect = screen.getByRole("button", {
      name: /^touch layer 1 for long-press$/i,
    });
    expect(selectMenuValue(layerSelect)).toBe("SHIFT");
    expect(screen.getByText(/Resulting layer: Shift/i)).toBeTruthy();

    const hostKeySelect = screen.getByRole("button", { name: /host key/i });
    await changeSelectMenu(hostKeySelect, "K_A");

    const applyBtn =
      screen.queryAllByRole("button").find((b) => b.textContent?.trim() === "Apply method") ??
      null;
    expect(applyBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(applyBtn!);
    });

    // Applying at the picker's own default (shift) layer must not raise a
    // redundant case-pair proposal banner — this is already the "uppermost"
    // case layer, so there is nothing further to pair it with.
    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
    const draft = useWorkingCopyStore.getState().touchDraft;
    const mechanisms =
      draft?.charTouchEntries.find(([c]) => c === "Á")?.[1]?.mechanisms ?? [];
    expect(mechanisms[0]?.slotValues).toMatchObject({
      hostKey: "K_A",
      char: "Á",
      layer: "shift",
    });
  });

  // Recoverable-edge regression: the case-derived ["SHIFT"] seed is NOT
  // itself guaranteed to be a combo the desktop keyboard uses — seed and
  // hard-constraint are two separate mechanisms, and an IR that never uses
  // bare SHIFT as a layer (irWithoutShiftCombo) exposes that gap. This must
  // surface as the same "not yet a layer this keyboard uses" note as any
  // other invalid partial combo (never a crash), and Apply must stay
  // disabled until the author removes the seeded slot, after which the
  // empty/base combo (always valid) re-enables it.
  it("shows the not-yet-valid note when the case-derived SHIFT seed is not itself a combo the desktop uses, and Apply re-enables once the seeded slot is removed", async () => {
    seedStore({ withInventory: ["Á"], ir: irWithoutShiftCombo });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    const denyBtn =
      screen.queryAllByRole("button").find((b) => b.textContent?.trim() === "Deny") ?? null;
    expect(denyBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(denyBtn!);
    });

    // Seeded with a single SHIFT slot (touchLayerForChar("Á") === "shift"),
    // but this IR's collectLayerCombosInUse reports only [["RALT"],["CTRL"]]
    // — ["SHIFT"] is not a member of D.
    const layerSelect = screen.getByRole("button", {
      name: /^touch layer 1 for long-press$/i,
    });
    expect(selectMenuValue(layerSelect)).toBe("SHIFT");
    expect(screen.getByText(/Not yet a layer this keyboard uses/i)).toBeTruthy();

    const hostKeySelect = screen.getByRole("button", { name: /host key/i });
    await changeSelectMenu(hostKeySelect, "K_A");

    const applyBtn = () =>
      screen.queryAllByRole("button").find((b) => b.textContent?.trim() === "Apply method") ??
      null;
    expect(applyBtn()?.hasAttribute("disabled")).toBe(true);

    // Remove the seeded (invalid) slot — the builder falls back to the
    // empty/base combo, which is always valid.
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /^remove touch layer 1 for long-press$/i }),
      );
    });

    expect(screen.queryByText(/Not yet a layer this keyboard uses/i)).toBeNull();
    expect(screen.getByText(/Resulting layer: Base/i)).toBeTruthy();
    expect(applyBtn()?.hasAttribute("disabled")).toBe(false);
  });
});
// Spec 051 Phase 7 (T049/T050) — FR-012: the suggestion-Accept path
// (handleUseSuggestion) must carry an explicit `layer`, derived the same way
// every other placement path derives it (buildTouchMechanismRef /
// touchLayerForChar) — not a bare literal that silently resolves to
// "default" for every accepted suggestion, uppercase included.
// ---------------------------------------------------------------------------

describe("TouchGallery — suggestion Accept carries an explicit layer (spec 051 FR-012)", () => {
  function touchMechanismsFor(char: string) {
    const draft = useWorkingCopyStore.getState().touchDraft;
    return (
      draft?.charTouchEntries.find(([c]) => c === char)?.[1]?.mechanisms ?? []
    );
  }

  it("accepting the longpress suggestion for a lowercase decomposable letter (ă) records layer: default", async () => {
    seedStore({ withInventory: ["ă"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    const acceptBtn =
      screen
        .queryAllByRole("button")
        .find((b) => b.textContent?.trim() === "Accept") ?? null;
    expect(acceptBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(acceptBtn!);
    });

    const mechanisms = touchMechanismsFor("ă");
    expect(mechanisms).toHaveLength(1);
    expect(mechanisms[0]?.slotValues).toMatchObject({
      hostKey: "K_A",
      char: "ă",
      layer: "default",
    });
  });

  it("accepting the longpress suggestion for the uppercase counterpart (Ă) records layer: shift, not a silent default", async () => {
    seedStore({ withInventory: ["Ă"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    const acceptBtn =
      screen
        .queryAllByRole("button")
        .find((b) => b.textContent?.trim() === "Accept") ?? null;
    expect(acceptBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(acceptBtn!);
    });

    const mechanisms = touchMechanismsFor("Ă");
    expect(mechanisms).toHaveLength(1);
    expect(mechanisms[0]?.slotValues).toMatchObject({
      hostKey: "K_A",
      char: "Ă",
      layer: "shift",
    });
  });

  it("accepting a 'replace' suggestion also carries an explicit layer (nextMethod = touch_key_replace dispatch)", async () => {
    // Seed a Phase C simple_swap desktop assignment so suggestion.kind ===
    // "replace" — exercises handleUseSuggestion's touch_key_replace branch,
    // which the ă/Ă cases above (both "longpress") do not reach.
    const swapAssignment: MechanismAssignment = {
      scope: "individual",
      target: "ă",
      modality: "physical",
      mechanisms: [
        {
          patternId: "simple_swap",
          strategyId: "S-01",
          slotValues: { kmnRules: "+ [K_A] > U+0103" },
        },
      ],
      source: "user",
    };
    seedWithDesktopAssignment("ă", swapAssignment);

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    expect(screen.queryByText(/Suggested: replace/i)).not.toBeNull();

    const acceptBtn =
      screen
        .queryAllByRole("button")
        .find((b) => b.textContent?.trim() === "Accept") ?? null;
    expect(acceptBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(acceptBtn!);
    });

    const mechanisms = touchMechanismsFor("ă");
    expect(mechanisms).toHaveLength(1);
    expect(mechanisms[0]?.patternId).toBe("touch_key_replace");
    expect(mechanisms[0]?.slotValues).toMatchObject({
      hostKey: "K_A",
      char: "ă",
      layer: "default",
    });
  });
});

// ---------------------------------------------------------------------------
// Spec 051 Phase 7 (T051/T052) — FR-013: case-correct host-key labels.
//
// A Keyman vkey name carries no case of its own (`K_A` names the A key);
// case is a property of the layer a placement targets. `hostKeyShortLabel`
// takes the layer explicitly and cases the returned letter to match it.
// ---------------------------------------------------------------------------

// Every real vkey id in keyOptions.ts is already all-uppercase, so testing
// the casing decision only through hostKeyShortLabel's output cannot tell a
// correct component match from an accidental substring match — both render
// "A" for "ncaps" today. This block tests the predicate directly, so a
// regression from `components.includes("caps")` to the substring form
// `layer.includes("caps")` fails HERE (isCasingBearingTouchLayer("ncaps")
// would flip from false to true) even though hostKeyShortLabel's own output
// would stay byte-identical for every real key id.
describe("isCasingBearingTouchLayer — component match, not substring (spec 051 FR-013)", () => {
  it("is true for shift, caps, and casing-bearing compounds", () => {
    expect(isCasingBearingTouchLayer("shift")).toBe(true);
    expect(isCasingBearingTouchLayer("caps")).toBe(true);
    expect(isCasingBearingTouchLayer("rightalt-shift")).toBe(true);
    expect(isCasingBearingTouchLayer("shift-ctrl-alt")).toBe(true);
  });

  it("is false for 'ncaps' and other non-casing layer ids", () => {
    expect(isCasingBearingTouchLayer("ncaps")).toBe(false);
    expect(isCasingBearingTouchLayer("alt")).toBe(false);
    expect(isCasingBearingTouchLayer("ctrl")).toBe(false);
    expect(isCasingBearingTouchLayer("rightalt")).toBe(false);
    expect(isCasingBearingTouchLayer("rightctrl")).toBe(false);
    expect(isCasingBearingTouchLayer("leftctrl")).toBe(false);
    expect(isCasingBearingTouchLayer("default")).toBe(false);
  });
});

describe("hostKeyShortLabel — case-correct labels by layer (spec 051 FR-013)", () => {
  it("reads lowercase on the default layer and uppercase on the shift layer", () => {
    expect(hostKeyShortLabel("K_A", "default")).toBe("a");
    expect(hostKeyShortLabel("K_A", "shift")).toBe("A");
  });

  it("reads uppercase for a casing-bearing compound layer id (rightalt-shift)", () => {
    expect(hostKeyShortLabel("K_A", "rightalt-shift")).toBe("A");
  });

  it("does not mistake 'ncaps' for a caps-bearing layer (component match, not substring)", () => {
    expect(hostKeyShortLabel("K_A", "ncaps")).toBe("A");
  });

  it("leaves non-casing layer ids reading the raw uppercase vkey letter (today's floor, now pinned)", () => {
    expect(hostKeyShortLabel("K_A", "alt")).toBe("A");
    expect(hostKeyShortLabel("K_A", "ctrl")).toBe("A");
    expect(hostKeyShortLabel("K_A", "rightalt")).toBe("A");
    expect(hostKeyShortLabel("K_A", "rightctrl")).toBe("A");
    expect(hostKeyShortLabel("K_A", "leftctrl")).toBe("A");
  });
});

describe("TouchGallery — host-key label casing in the UI (spec 051 FR-013)", () => {
  it("renders the configured-mechanism chip in lowercase for a default-layer mechanism", async () => {
    seedStore({ withInventory: ["中"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    const select = screen.queryByRole("button", { name: /host key/i });
    expect(select).not.toBeNull();
    await changeSelectMenu(select!, "K_A");
    const applyBtn =
      screen
        .queryAllByRole("button")
        .find((b) => b.textContent?.trim() === "Apply method") ?? null;
    expect(applyBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(applyBtn!);
    });

    const configuredGroup = screen.getByRole("group", {
      name: /configured characters/i,
    });
    expect(configuredGroup.textContent).toContain("long-press a");
    expect(configuredGroup.textContent).not.toContain("long-press A");
  });

  it("renders the placement-suggestion text in lowercase for a lowercase placement", async () => {
    seedStore({ withInventory: ["ä"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    // "ä" is decomposable-accented and derives host key K_A (touchBehavior's
    // suggestion useMemo) — a lowercase placement, so the suggestion text
    // must read the lowercase keycap, not the raw uppercase vkey letter.
    expect(screen.getByText(/Suggested: long-press/i).textContent).toMatch(
      /long-press a to reach/i,
    );
  });
});
