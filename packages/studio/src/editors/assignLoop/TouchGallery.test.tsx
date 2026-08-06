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
  describeUndoTarget,
} from "./TouchGallery.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import type {
  VirtualFS,
  MechanismAssignment,
  IRGroup,
  IRRule,
  PlacementMap,
} from "@keyboard-studio/contracts";
import { createVirtualFS, toUPlusNotation } from "@keyboard-studio/contracts";
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

const {
  capturedVfsTransformRef,
  buildTouchLayoutJsonSpy,
  defaultBuildTouchLayoutJsonImpl,
  enumerateTouchMethodsForCharSpy,
  originalEnumerateTouchMethodsForCharRef,
} = vi.hoisted(() => {
  const capturedVfsTransformRef = {
    current: null as null | ((vfs: VirtualFS, kbId: string) => { warnings: string[] }),
  };
  // Spy over the real `enumerateTouchMethodsForChar` — the color-model test
  // below overrides it for exactly one, otherwise-unused target character
  // (never colliding with any other test's inventory in this file) so it can
  // assert a "layer-switch" row's rendering without constructing a real
  // `.keyman-touch-layout` fixture. Every other call (any other character)
  // falls through to the real implementation, captured via
  // `originalEnumerateTouchMethodsForCharRef` in the `@keyboard-studio/engine`
  // mock factory below — same "wrap by default" pattern MechanismGallery.
  // test.tsx uses for `collectCharContributorsSpy`.
  const originalEnumerateTouchMethodsForCharRef = {
    current: null as
      | null
      | ((...args: unknown[]) => unknown),
  };
  const enumerateTouchMethodsForCharSpy = vi.fn();
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
  return {
    capturedVfsTransformRef,
    buildTouchLayoutJsonSpy,
    defaultBuildTouchLayoutJsonImpl,
    enumerateTouchMethodsForCharSpy,
    originalEnumerateTouchMethodsForCharRef,
  };
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
  originalEnumerateTouchMethodsForCharRef.current = original.enumerateTouchMethodsForChar as (
    ...args: unknown[]
  ) => unknown;
  enumerateTouchMethodsForCharSpy.mockImplementation(original.enumerateTouchMethodsForChar);
  return {
    ...original,
    // emitTouchLayout is used for minimalTouchJson; return a stable string.
    emitTouchLayout: vi.fn(() => '{"_minimal":true}'),
    enumerateTouchMethodsForChar: enumerateTouchMethodsForCharSpy,
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

  it("does NOT set source/<id>.keyman-touch-layout when the only assignment is touch_inherited", async () => {
    // "a" is present in the scaffolded default QWERTY touch layout (K_A), so
    // it is auto-detected as already reachable and shown read-only — there
    // is no "already" suggestion card / Accept click that records
    // touch_inherited anymore (see the "read-only existing implementation
    // display" suite below). A touch_inherited entry can still reach
    // charTouch via a persisted draft from a PRIOR mount that had one (the
    // pattern-apply engine still understands the patternId, and back-nav
    // must not resurrect a stray real-edit signal from it) — seed the draft
    // directly, the way "Back survives a remount" (above) seeds a
    // prior-mount draft, and assert accepting it is still not treated as a
    // real edit.
    seedStore({ withInventory: ["a"] });
    const inheritedAssignment: MechanismAssignment = {
      scope: "individual",
      target: "a",
      modality: "touch",
      mechanisms: [{ patternId: "touch_inherited" }],
      source: "user",
    };
    useWorkingCopyStore.getState().setTouchDraft({
      charTouchEntries: [["a", inheritedAssignment]],
      suggestionResolvedChars: ["a"],
    });

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    const vfs = runTransform("basic_kbdus");
    expect(vfs.get("source/basic_kbdus.keyman-touch-layout")).toBeUndefined();
    // buildTouchLayoutJson must NOT have been called (only inherited assignments).
    expect(buildTouchLayoutJsonSpy).not.toHaveBeenCalled();
  });

  it("shows a character already on the seed layout read-only (no confirm card, no Accept) and lets the author advance with no click", async () => {
    // "a" is present in the scaffolded default QWERTY touch layout (K_A) —
    // no Phase C desktop assignment, so it is auto-detected as already
    // reachable and surfaced read-only via the "Existing methods" section;
    // there must be no green confirm card and no Accept button for it.
    seedStore({ withInventory: ["a"] });

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    // The old "Keep it as is?" confirm prompt is gone.
    expect(screen.queryByText(/Keep it as is/i)).toBeNull();
    // No Accept/Deny pair for it — nothing to click to "keep" a char that was
    // never at risk of removal.
    expect(
      screen.queryAllByRole("button").some((b) => b.textContent?.trim() === "Accept"),
    ).toBe(false);

    // P1 regression guard: a character already detected on the seed layout
    // must enable the primary forward button (Next/Done) with NO click (spec
    // v1.3.1 §3c: "you shouldn't have to click anything to keep it"). "a" is
    // the only inventory char here, so the button reads "Done".
    const doneBtn = screen.getByRole("button", { name: "Done" });
    expect((doneBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it("entry-parity: an already-detected character is excluded from the walk entirely — the author lands directly on the genuinely unresolved one, and the forward button is HIDDEN (not just enabled) when inspecting the detected one via its chip", async () => {
    // "a" (idx 0 in confirmedInventory) is present in the default touch
    // layout (K_A) — detected, with no Phase C suggestion of its own — so it
    // is excluded from the walk (touchLettersToAdd) entirely: the author
    // never lands on it or steps through it via Back/Next/Skip. "中" has
    // suggestion kind "none" too (not in the default layout, not a
    // decomposable accented letter — same fixture precedent as the "Next
    // advances positionally" test above) but is NOT detected, so it is the
    // walk's only member and the entry point.
    seedStore({ withInventory: ["a", "中"] });

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    // Entry parity with MechanismGallery: land directly on the one
    // actionable character, not on the detected one first.
    expectCurrentChar("中");
    expect(screen.getByText("Character 1 of 1")).toBeTruthy();
    const doneBtn = screen.getByRole("button", { name: "Done" });
    expect((doneBtn as HTMLButtonElement).disabled).toBe(true);

    // "a" is still inspectable via its CharScrollStrip chip (SHOW-ALL
    // display, mirrors MechanismGallery's handleSelectDisplayChar) — but once
    // selected this way, the forward Next/Done button is HIDDEN entirely
    // (not rendered disabled), since it is outside the walk and this isn't a
    // "global Next" for it.
    fireEvent.click(screen.getByTestId("char-scroll-chip-0061"));
    await waitFor(() => {
      expectCurrentChar("a");
    });
    expect(screen.queryByTestId("touch-continue")).toBeNull();
  });

  it("entry-parity: the Back button is likewise HIDDEN (not just dead) when inspecting a detected out-of-walk character via its chip — usePositionalCharNav's handleBack is a no-op at currentIdx === -1, so a visible Back would look live but do nothing", async () => {
    // Same fixture/setup as the forward-hidden test above: "a" is detected
    // (excluded from the walk), "中" is the walk's only member and entry point.
    seedStore({ withInventory: ["a", "中"] });

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    expectCurrentChar("中");

    // On the walk's own entry point, Back is present (it's currentIdx 0 of
    // the walk, so Back still resolves to "back to mechanisms" / onBack).
    const backBtnsOnWalk = screen.queryAllByRole("button", { name: /back/i });
    expect(backBtnsOnWalk.find((b) => b.textContent?.includes("Back"))).not.toBeUndefined();

    // Inspect "a" via its CharScrollStrip chip — outside touchLettersToAdd,
    // so currentIdx becomes -1 in usePositionalCharNav and handleBack is a
    // no-op. The Back button must be hidden entirely here, not merely dead.
    fireEvent.click(screen.getByTestId("char-scroll-chip-0061"));
    await waitFor(() => {
      expectCurrentChar("a");
    });
    const backBtnsInspecting = screen.queryAllByRole("button", { name: /back/i });
    expect(backBtnsInspecting.find((b) => b.textContent?.includes("Back"))).toBeUndefined();
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

    // Inventory is ["x", "€"] — collated for display (spec 047's
    // collateCompare puts "€" before the letter "x"), but only "x" carries a
    // Phase C swap assignment ("replace" suggestion), so it is the walk's
    // entry point regardless of display order (an actionable suggestion, even
    // for a detected char, is never excluded — see touchLettersToAdd's
    // desktopSuggestionTargets carve-out). "€" is detected ONLY via the
    // shipped layout, with no Phase C suggestion of its own, so it is
    // excluded from the walk entirely (entry-parity fix) — it is still
    // reachable for inspection via its CharScrollStrip chip
    // (handleSelectDisplayChar), not via Skip/Next.
    expectCurrentChar("x");
    fireEvent.click(screen.getByTestId("char-scroll-chip-20AC"));
    await waitFor(() => {
      expectCurrentChar("€");
    });

    // The seed-source-aware detection (T015) reads the SHIPPED layout (with
    // mods replayed), not a fresh scaffold, so "€" is recognized as already
    // reachable and surfaced read-only via the "Existing methods" section.
    expect(screen.queryByText(/Existing methods/i)).not.toBeNull();

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

  it("renders the char-scroll-strip ABOVE the per-char editing block, matching MechanismGallery's real placement (regression guard)", async () => {
    seedStore({ withInventory: ["中", "日", "月"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    const strip = screen.getByTestId("char-scroll-strip");
    // "Touch mapping" is the eyebrow label unique to the per-char editing
    // block. DOCUMENT_POSITION_FOLLOWING (4): the per-char block comes AFTER
    // the strip in DOM order — i.e. the strip renders near the top of the
    // pane, above the per-char block, not after it (the CHANGE-1 regression
    // this test guards against).
    const perCharEyebrow = screen.getByText("Touch mapping");
    expect(
      strip.compareDocumentPosition(perCharEyebrow) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("orders a lowercase letter immediately before its uppercase counterpart, not in first-appearance order (spec 047 collateCompare reuse)", async () => {
    // Seeded UPPERCASE-first (the old first-appearance order the gallery
    // used to render in) — the collated display order must not follow it:
    // "a" must render before "A", and "e" before "E".
    seedStore({ withInventory: ["A", "a", "E", "e"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    const strip = screen.getByTestId("char-scroll-strip");
    const chipOrder = within(strip)
      .getAllByRole("button")
      .map((btn) => btn.getAttribute("data-testid"));

    const lowerAIdx = chipOrder.indexOf("char-scroll-chip-0061"); // "a"
    const upperAIdx = chipOrder.indexOf("char-scroll-chip-0041"); // "A"
    const lowerEIdx = chipOrder.indexOf("char-scroll-chip-0065"); // "e"
    const upperEIdx = chipOrder.indexOf("char-scroll-chip-0045"); // "E"
    expect(lowerAIdx).toBeGreaterThanOrEqual(0);
    expect(upperAIdx).toBeGreaterThanOrEqual(0);
    expect(lowerEIdx).toBeGreaterThanOrEqual(0);
    expect(upperEIdx).toBeGreaterThanOrEqual(0);
    expect(lowerAIdx).toBeLessThan(upperAIdx);
    expect(lowerEIdx).toBeLessThan(upperEIdx);

    // No current-character assertion here: a/A/e/E are all reachable on the
    // seed QWERTY layout and carry no Phase C suggestion, so the entry-parity
    // walk list (touchLettersToAdd) excludes all four and there is no selected
    // chip. The walk consumes this same collated order when it is non-empty —
    // it is the `inventory` derivation both the strip and usePositionalCharNav
    // read; the display order asserted above is the observable half.
  });

  it("clicking an earlier character's chip moves back to it, ungated by intermediate configuration status", async () => {
    const onBack = vi.fn();
    seedStore({ withInventory: ["中", "日", "月"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={onBack} />);
    });

    // Advance to "日" (idx 1) via Mark-then-Next — "月" stays untouched.
    expectCurrentChar("中");
    fireEvent.click(
      screen.getByRole("button", { name: /Mark U\+4E2D 中 for later review/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Next character/i }));
    await waitFor(() => {
      expectCurrentChar("日");
    });

    // Click the chip for "中" (the earlier, already-visited character) while
    // sitting on "日" — must jump straight back to it.
    fireEvent.click(screen.getByTestId("char-scroll-chip-4E2D"));

    // Landed back on "中" (idx 0) — the phase was NOT exited.
    await waitFor(() => {
      expectCurrentChar("中", { marked: true });
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
// Compose marker (CharScrollStrip Part 1, 3-signal count model) — integration
// coverage for the TOUCH modality specifically.
//
// MechanismGallery.test.tsx already pins the compose marker's render-level
// contract (data-testid `char-scroll-badge-compose-<HEX>`) for the desktop/
// physical path. The touch path is MORE complex — its composition signal
// (`directTouchProducedSet`, charMechanisms.ts's `getProducerBadge` signal
// (c) input) folds a cross-modality union of `desktopDirectProducedSet`
// (this session's desktop physical assignments, via
// `selectDesktopAssignments`) and this session's own touch coverage (via
// `computeTouchCoverage(layoutForLintAndGate, inventory)`) — see the
// `directTouchProducedSet` memo's own doc comment in TouchGallery.tsx. That
// fold had no render-level pin before this suite. Seeds touch assignments
// directly via `setTouchDraft` (the same store-seed precedent the rest of
// this file uses, e.g. the "does NOT set ... touch_inherited" test above)
// rather than driving the method-chooser UI twice — the fixture under test is
// the composability FOLD, not the Apply flow itself (already covered by the
// "Producer-count badge" suite above).
// ---------------------------------------------------------------------------

describe("TouchGallery — character-scroll-strip compose marker (integration)", () => {
  it("a composable-only touch character (ǯ, reachable only via NFD composition of its own-key-produced ʒ + combining caron) shows the compose marker, badged 1", async () => {
    seedStore({ withInventory: ["ʒ", "̌", "ǯ"] });
    const ezhAssignment: MechanismAssignment = {
      scope: "individual",
      target: "ʒ",
      modality: "touch",
      mechanisms: [{ patternId: "touch_key_replace", slotValues: { hostKey: "K_Z", char: "ʒ", layer: "default" } }],
      source: "user",
    };
    const caronAssignment: MechanismAssignment = {
      scope: "individual",
      target: "̌",
      modality: "touch",
      mechanisms: [{ patternId: "touch_key_replace", slotValues: { hostKey: "K_QUOTE", char: "̌", layer: "default" } }],
      source: "user",
    };
    useWorkingCopyStore.getState().setTouchDraft({
      charTouchEntries: [
        ["ʒ", ezhAssignment],
        ["̌", caronAssignment],
      ],
      suggestionResolvedChars: [],
    });

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    const strip = screen.getByTestId("char-scroll-strip");
    // ǯ (U+01EF): no own-key touch assignment — its NFD components (ʒ,
    // combining caron) are BOTH directly touch-produced this session, so it
    // badges GREEN 1 via composition alone, with the compose marker present.
    expect(within(strip).getByTestId("char-scroll-badge-compose-01EF")).toBeTruthy();
    expect(within(strip).getByTestId("char-scroll-badge-01EF").textContent).toBe("1");
  });

  it("a plain own-key touch character (ʒ, not NFD-decomposable) shows NO compose marker", async () => {
    seedStore({ withInventory: ["ʒ", "̌", "ǯ"] });
    const ezhAssignment: MechanismAssignment = {
      scope: "individual",
      target: "ʒ",
      modality: "touch",
      mechanisms: [{ patternId: "touch_key_replace", slotValues: { hostKey: "K_Z", char: "ʒ", layer: "default" } }],
      source: "user",
    };
    const caronAssignment: MechanismAssignment = {
      scope: "individual",
      target: "̌",
      modality: "touch",
      mechanisms: [{ patternId: "touch_key_replace", slotValues: { hostKey: "K_QUOTE", char: "̌", layer: "default" } }],
      source: "user",
    };
    useWorkingCopyStore.getState().setTouchDraft({
      charTouchEntries: [
        ["ʒ", ezhAssignment],
        ["̌", caronAssignment],
      ],
      suggestionResolvedChars: [],
    });

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    const strip = screen.getByTestId("char-scroll-strip");
    // ʒ (U+0292) itself has its own touch key and is not NFD-decomposable, so
    // composition can never fire for it — marker ABSENT, badge reflects the
    // direct assignment only (1), not inflated by a phantom composition bonus.
    expect(within(strip).queryByTestId("char-scroll-badge-compose-0292")).toBeNull();
    expect(within(strip).getByTestId("char-scroll-badge-0292").textContent).toBe("1");
  });
});

// ---------------------------------------------------------------------------
// Suggestion card — gated on the current character's producer badge (bug
// fix: a char already GREEN purely via composition must not ALSO show a
// stale "suggested" proposal card).
// ---------------------------------------------------------------------------

describe("TouchGallery — suggestion card gated on the current char's producer badge", () => {
  it("hides the suggestion for a composition-covered character (ǯ, badge isComposable) and shows it for a plain uncovered character (x) with its own desktop assignment, in the same session", async () => {
    seedStore({ withInventory: ["ʒ", "̌", "ǯ", "x"] });

    // Desktop (Phase C, physical) assignments for BOTH "ǯ" and "x" — each has
    // its own simple_swap mechanism, so the suggestion computation's `da`
    // branch fires for both, proposing a "replace" card (extractMechanismHostKey).
    const zhCaronDesktopAssignment: MechanismAssignment = {
      scope: "individual",
      target: "ǯ",
      modality: "physical",
      mechanisms: [{ patternId: "simple_swap", slotValues: { kmnRules: "+ [K_9] > 'ǯ'" } }],
      source: "user",
    };
    const xDesktopAssignment: MechanismAssignment = {
      scope: "individual",
      target: "x",
      modality: "physical",
      mechanisms: [{ patternId: "simple_swap", slotValues: { kmnRules: "+ [K_X] > 'x'" } }],
      source: "user",
    };
    useWorkingCopyStore.getState().recordPhase({
      phase: "C",
      answers: [],
      assignments: [zhCaronDesktopAssignment, xDesktopAssignment],
    });

    // "ʒ" and the bare combining caron each have their OWN explicit touch
    // key (same fixture shape as the compose-marker suite above) — this
    // makes "ǯ" composable (both its NFD components are directly
    // touch-produced this session) even though "ǯ" itself has no touch
    // assignment of its own.
    const ezhTouchAssignment: MechanismAssignment = {
      scope: "individual",
      target: "ʒ",
      modality: "touch",
      mechanisms: [{ patternId: "touch_key_replace", slotValues: { hostKey: "K_Z", char: "ʒ", layer: "default" } }],
      source: "user",
    };
    const caronTouchAssignment: MechanismAssignment = {
      scope: "individual",
      target: "̌",
      modality: "touch",
      mechanisms: [{ patternId: "touch_key_replace", slotValues: { hostKey: "K_QUOTE", char: "̌", layer: "default" } }],
      source: "user",
    };
    useWorkingCopyStore.getState().setTouchDraft({
      charTouchEntries: [
        ["ʒ", ezhTouchAssignment],
        ["̌", caronTouchAssignment],
      ],
      suggestionResolvedChars: [],
    });

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    const strip = screen.getByTestId("char-scroll-strip");

    // "ǯ" — composable (badge isComposable, no own touch assignment): the
    // desktop assignment WOULD otherwise raise a "replace" suggestion card,
    // but it must NOT render.
    fireEvent.click(within(strip).getByTestId("char-scroll-chip-01EF"));
    await waitFor(() => {
      expectCurrentChar("ǯ");
    });
    expect(screen.queryByText(/Suggested: replace/i)).toBeNull();

    // "x" — plain (not NFD-decomposable, no composability): the SAME kind of
    // desktop-assignment-derived suggestion DOES render.
    fireEvent.click(within(strip).getByTestId("char-scroll-chip-0078"));
    await waitFor(() => {
      expectCurrentChar("x");
    });
    expect(screen.getByText(/Suggested: replace/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Forward button — forced visible/enabled once the whole inventory is
// covered, even when currentChar is outside touchLettersToAdd's walk (bug
// fix).
// ---------------------------------------------------------------------------

/**
 * Seed a base that SHIPS a `.keyman-touch-layout` file producing
 * `shippedChar` (same shape as `seedWithShippedTouchLayout` above — a
 * character detected purely via the SEED layout, with NO desktop assignment
 * of its own, is the one reliable way to land a character outside
 * `touchLettersToAdd`'s walk: `desktopSuggestionTargets` keeps ANY character
 * with an actionable Phase C suggestion in the walk regardless of detection,
 * so a detected-but-suggestion-free character is the only kind that actually
 * leaves it — see touchLettersToAdd's own doc comment), plus a Phase C
 * desktop assignment for `swappedChar` (mirrored onto the touch seed too,
 * badging it covered via signal (a) with zero explicit touch action), plus
 * an optional third, wholly UNCOVERED character for the negative case.
 */
function seedShippedPlusSwapped(opts: {
  shippedChar: string;
  swappedChar: string;
  extraUncoveredChar?: string;
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
  const swapAssignment: MechanismAssignment = {
    scope: "individual",
    target: opts.swappedChar,
    modality: "physical",
    mechanisms: [
      {
        patternId: "simple_swap",
        strategyId: "S-01",
        slotValues: { kmnRules: `+ [K_X] > '${opts.swappedChar}'` },
      },
    ],
    source: "user",
  };
  useWorkingCopyStore.getState().recordPhase({
    phase: "B",
    answers: [],
    confirmedInventory: [
      opts.swappedChar,
      opts.shippedChar,
      ...(opts.extraUncoveredChar !== undefined ? [opts.extraUncoveredChar] : []),
    ],
  });
  useWorkingCopyStore.getState().recordPhase({
    phase: "C",
    answers: [],
    assignments: [swapAssignment],
  });
  useWorkingCopyStore.getState().markGalleryIntroSeen("touch");
  useSurveySessionStore.getState().setTouchSeedSource("import-adapt");
}

// ---------------------------------------------------------------------------
// touchBaseDirectSet — LIVE base-direct signal (a) regression (P1 bug fix,
// km-validator finding: "touch base-direct staleness"). Before the fix,
// `baseTouchCoveredSet` (signal (a)'s source, frozen at `detectionSeedLayout`
// — which deliberately EXCLUDES this session's own `charTouch` edits, see
// that memo's own doc comment) kept a seed-only character reading covered
// FOREVER, even once a "replace" action this session overwrote the touch
// key that used to be its only producer — disagreeing with the live
// completion gate (`handleContinue`'s own
// `touchCoverage(layoutForLintAndGate, ...)`, which correctly saw the
// overwrite). Symptom: the badge stayed GREEN and Done stayed FORCE-SHOWN,
// but a Done click still got refused/nagged by the live gate. The fix
// sources signal (a) from `touchBaseDirectSet` (LIVE, derived from
// `directTouchProducedSet` — itself built from `layoutForLintAndGate`, which
// DOES bake in every `charTouch` edit) so all three (badge, Done visibility,
// live gate) agree.
//
// This suite's mocked `buildTouchLayoutJson` (see this file's own module
// header) rebuilds the rendered layer purely from `assignments` once ANY
// edit exists — it does not model "which specific physical key a replace
// overwrote" the way the real engine does. That is a harness limitation,
// not a gap in the property under test: it still proves the intended
// contract — signal (a) reacting LIVE to a same-session touch edit, vs. the
// old frozen set which never reacted to one at all — and the two assertions
// below (the seed-only character's badge, and the Done button's visibility)
// both flip against a reverted (frozen) `baseTouchCoveredSet` source, so this
// is a genuine regression pin, not a tautology.
// ---------------------------------------------------------------------------

describe("TouchGallery — touch base-direct signal (a) is LIVE, not frozen (P1 regression)", () => {
  it("a character reachable ONLY via a seed touch key reads UNCOVERED (badge 0) and Done is NOT force-shown once this session's 'replace' action overwrites a touch key — agreeing with the live completion gate", async () => {
    // "€" is reachable ONLY via the SHIPPED seed key — no Phase C desktop
    // assignment of its own, so it is excluded from touchLettersToAdd's walk
    // entirely (entry-parity fix) and starts covered purely via signal (a)
    // BASE-DIRECT.
    const shippedLayoutJson = JSON.stringify({
      phone: {
        layer: [
          {
            id: "default",
            row: [{ id: 1, key: [{ id: "K_1", output: "€" }] }],
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
      // "中" has no desktop assignment and is not present anywhere in the
      // seed — suggestion kind "none" (same fixture the "Producer-count
      // badge" suite above uses), so it is the walk's only entry.
      confirmedInventory: ["€", "中"],
    });
    useWorkingCopyStore.getState().markGalleryIntroSeen("touch");
    useSurveySessionStore.getState().setTouchSeedSource("import-adapt");

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    expectCurrentChar("中");
    const stripBefore = screen.getByTestId("char-scroll-strip");
    // "€" starts GREEN (1) — covered purely via the seed, zero session edits.
    expect(within(stripBefore).getByTestId("char-scroll-badge-20AC").textContent).toBe("1");
    // "中" starts RED (0) — the walk's own uncovered target.
    expect(within(stripBefore).getByTestId("char-scroll-badge-4E2D").textContent).toBe("0");

    // Drive the real "Replace a key" method (manual chooser, mirrors the
    // "Producer-count badge" suite's longpress flow above) to record a
    // touch_key_replace mechanism for "中" this session.
    const replaceCard = screen.queryByText(/Replace a key/i);
    expect(replaceCard).not.toBeNull();
    await act(async () => {
      fireEvent.click(replaceCard!);
    });
    const hostKeySelect = screen.getByLabelText(/Host key to replace/i);
    await changeSelectMenu(hostKeySelect, "K_1");
    const applyBtn = screen.queryAllByRole("button").find(
      (b) => b.textContent?.trim() === "Apply method",
    ) ?? null;
    expect(applyBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(applyBtn!);
    });

    // (i) "€"'s badge must now read UNCOVERED (0) — its only producer (the
    // seed key) was live-overwritten this session; the frozen
    // `baseTouchCoveredSet` this fix replaces never saw that overwrite.
    await waitFor(() => {
      const badgeAfter = within(screen.getByTestId("char-scroll-strip")).getByTestId(
        "char-scroll-badge-20AC",
      );
      expect(badgeAfter.textContent).toBe("0");
    });
    // "中" is now covered by its own new key (signal (b) SESSION-DIRECT) —
    // NOT double-counted with the now-live signal (a) (see touchBaseDirectSet's
    // own doc comment for why the two stay disjoint).
    expect(
      within(screen.getByTestId("char-scroll-strip")).getByTestId("char-scroll-badge-4E2D")
        .textContent,
    ).toBe("1");

    // (ii) Whole-inventory coverage must agree: "€" reads uncovered, so
    // `allCharsCovered` is false and Done is NOT force-shown for a currentChar
    // OUTSIDE the walk (touchLettersToAdd) — matching the live completion
    // gate rather than disagreeing with it. Navigate to "€" itself (its
    // walk-excluded SHOW-ALL chip) — "中" being the walk's own last/only
    // entry would otherwise show its own ordinary walk-completion Done
    // regardless of "€", which is not the property under test here (see the
    // "Done button forced visible" suite below for that ALLCOVERED-forced
    // case specifically).
    fireEvent.click(within(screen.getByTestId("char-scroll-strip")).getByTestId(
      "char-scroll-chip-20AC",
    ));
    await waitFor(() => {
      expectCurrentChar("€");
    });
    expect(screen.queryByTestId("touch-continue")).toBeNull();
  });
});

// This suite pins TWO independent, OR-ed reasons the Done button can be
// force-shown for a currentChar outside touchLettersToAdd's walk:
//   (a) `allCovered` — the producer-badge signal, exercised by the two tests
//       below (a harness-only divergence from `unaccountedTouchChars` here —
//       see the middle test's own comment);
//   (b) `unaccountedTouchChars.length === 0` — the mark-aware signal, added
//       by the mechanism-gallery-progression follow-up and exercised by the
//       third test below (a marked, still-unimplemented character elsewhere
//       in the walk, reached from an unrelated already-covered out-of-walk
//       character). See TouchGallery.tsx's `touchForwardButton` top-priority
//       branch doc comment for the full reconciliation between the two.
describe("TouchGallery — Done button forced visible when the whole inventory is covered", () => {
  it("shows an ENABLED Done button when every inventory character has count >= 1, even navigated to an already-detected character outside touchLettersToAdd (previously hidden)", async () => {
    // "x" carries a desktop swap assignment (mirrored onto the touch seed —
    // badge count via signal (a), and it stays IN touchLettersToAdd as an
    // actionable suggestion target). "€" is detected purely via the SHIPPED
    // touch layout, with no desktop assignment of its own — it is excluded
    // from touchLettersToAdd's walk entirely (entry-parity fix), the exact
    // scenario that previously hid the forward button. Both are already
    // covered (count >= 1) with zero explicit author action.
    seedShippedPlusSwapped({ shippedChar: "€", swappedChar: "x" });

    const onComplete = vi.fn();
    await act(async () => {
      render(<TouchGallery onComplete={onComplete} onBack={vi.fn()} />);
    });

    expectCurrentChar("x");

    // Navigate to "€" via the SHOW-ALL strip — outside touchLettersToAdd.
    fireEvent.click(screen.getByTestId("char-scroll-chip-20AC"));
    await waitFor(() => {
      expectCurrentChar("€");
    });

    // The Done button is FORCED visible and enabled — the whole inventory
    // (both "x" and "€") is covered per the producer badge, even though
    // currentChar ("€") is outside touchLettersToAdd's walk. (The completion
    // round-trip itself — whether clicking Done actually calls onComplete —
    // is FR-008's own gate, re-deriving coverage from this file's mocked
    // `buildTouchLayoutJson`, which does not reflect shipped/mirrored
    // content; that gate is exercised by its own existing test suite, not
    // this one — the property under test here is button visibility/state.)
    const doneBtn = screen.getByTestId("touch-continue");
    expect(doneBtn.textContent).toMatch(/Done/i);
    expect((doneBtn as HTMLButtonElement).disabled).toBe(false);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("does NOT force-show the Done button when at least one character is still count === 0, even when navigated to an already-detected character outside touchLettersToAdd", async () => {
    // Same "x"/"€" pair as above, PLUS "w" — wholly uncovered (no shipped
    // layout entry, no desktop assignment, no touch config at all) — so the
    // inventory is NOT fully covered.
    seedShippedPlusSwapped({ shippedChar: "€", swappedChar: "x", extraUncoveredChar: "w" });

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    // Navigate to "€" — detected-only, outside touchLettersToAdd.
    fireEvent.click(screen.getByTestId("char-scroll-chip-20AC"));
    await waitFor(() => {
      expectCurrentChar("€");
    });

    // Not fully covered ("w" is still count 0, and not marked either) — the
    // forward button stays hidden entirely, exactly as before this fix.
    expect(screen.queryByTestId("touch-continue")).toBeNull();
  });

  it("force-shows an ENABLED Done button via the mark-aware unaccountedTouchChars signal when a DIFFERENT, unimplemented-but-MARKED character remains elsewhere in the walk (mechanism-gallery-progression follow-up)", async () => {
    // "a" is base-covered by the default scaffold fall-through with no
    // unresolved suggestion, so it is excluded from touchLettersToAdd
    // entirely (entry-parity fix) — the SHOW-ALL-only character this test
    // navigates to. "中" has no base coverage and no desktop assignment
    // (suggestion kind "none"), so it is the walk's sole entry. Neither
    // triggers a Phase C desktop-mods replay or a Phase E touch edit, so
    // `layoutForLintAndGate` resolves to the REAL (non-mocked)
    // `detectionSeedLayout` here — this test deliberately avoids the
    // shipped/mirrored-content shape the two tests above use, so it isolates
    // the NEW `unaccountedTouchChars`-driven branch from the pre-existing,
    // harness-limited `allCovered` branch.
    seedStore({ withInventory: ["a", "中"] });

    const onComplete = vi.fn();
    await act(async () => {
      render(<TouchGallery onComplete={onComplete} onBack={vi.fn()} />);
    });

    expectCurrentChar("中");
    // Mark "中" instead of implementing it — its producer badge stays 0
    // forever (marks are authoring metadata, never a MechanismAssignment),
    // so `allCovered` over the whole inventory is FALSE for the rest of this
    // test — the property under test is that Done still force-shows via
    // `unaccountedTouchChars` alone.
    fireEvent.click(
      screen.getByRole("button", { name: /Mark U\+4E2D 中 for later review/i }),
    );

    // Navigate to "a" via the SHOW-ALL strip — outside touchLettersToAdd,
    // and NOT the marked character itself (a marked-but-unimplemented
    // character is never excluded from the walk, so it can never be "the
    // out-of-walk char" on its own — see this suite's header comment).
    fireEvent.click(screen.getByTestId("char-scroll-chip-0061"));
    await waitFor(() => {
      expectCurrentChar("a");
    });

    // Every character is implemented ("a") or marked ("中") —
    // `unaccountedTouchChars` is empty even though `allCovered` (badge) is
    // false — Done force-shows, ENABLED, from this out-of-walk character.
    const doneBtn = screen.getByTestId("touch-continue");
    expect(doneBtn.textContent).toMatch(/Done/i);
    expect((doneBtn as HTMLButtonElement).disabled).toBe(false);

    // Unlike the badge-only tests above, clicking here is expected to
    // actually complete: `unaccountedTouchChars.length === 0` is the exact
    // condition `handleContinue` itself checks, so "visible" and "clicking
    // works" agree on this path — no harness caveat needed.
    fireEvent.click(doneBtn);
    expect(onComplete).toHaveBeenCalledOnce();
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

    // "n" is a plain Latin letter — detected via the OS-default physical
    // fall-through (spec 040) — and the sequence assignment above targets
    // "ŋ", not "n" itself, so "n" carries no suggestion of its own and is
    // excluded from the walk (entry-parity fix). It is still reachable for
    // inspection via its CharScrollStrip chip.
    fireEvent.click(screen.getByTestId("char-scroll-chip-006E"));
    await waitFor(() => {
      expectCurrentChar("n");
    });
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
// Mark for later review — replaces the old "Skip this character" escape
// (mechanism-gallery-progression). A pure per-character TOGGLE: it records
// nothing in the working copy, but satisfies canGoNext so the existing
// Next/Done control (not a second navigation control) can advance.
// ---------------------------------------------------------------------------

describe("TouchGallery — mark for later review", () => {
  it("marking the current character records no touch assignment, then Next advances", async () => {
    // "中"/"日" have suggestion kind = "none" (see back-navigation suite above).
    seedStore({ withInventory: ["中", "日"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Mark U\+4E2D 中 for later review/i }),
    );

    // No assignment recorded.
    expect(useWorkingCopyStore.getState().touchDraft?.charTouchEntries ?? []).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /Next character/i }));
    await waitFor(() => {
      expectCurrentChar("日");
    });
  });

  it("marking does not change the coverage count, and enables Next without treating the character as configured", async () => {
    seedStore({ withInventory: ["中", "日"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    expect(screen.getByRole("status").getAttribute("aria-label")).toBe(
      "0 of 2 characters configured",
    );

    const nextBtn = () => screen.getByRole("button", { name: /Next character/i });
    expect((nextBtn() as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(
      screen.getByRole("button", { name: /Mark U\+4E2D 中 for later review/i }),
    );
    await waitFor(() => {
      expect((nextBtn() as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.click(nextBtn());
    await waitFor(() => {
      expectCurrentChar("日");
    });

    // Marking recorded nothing, so coverage is unchanged.
    expect(screen.getByRole("status").getAttribute("aria-label")).toBe(
      "0 of 2 characters configured",
    );

    // Navigating back to the marked "中": Next stays enabled (it is
    // accounted for), even though it is still not counted as configured.
    fireEvent.click(screen.getByRole("button", { name: /back to previous character/i }));
    await waitFor(() => {
      expectCurrentChar("中", { marked: true });
    });
    expect((nextBtn() as HTMLButtonElement).disabled).toBe(false);
  });

  it("completes via Done with no marking needed when the only inventory char is already covered (entry-parity fix)", async () => {
    // "a" is present in the default QWERTY scaffold, so it is excluded from
    // the walk entirely (entry-parity fix) — touchLettersToAdd is empty and
    // the gallery lands directly on the all-caught-up panel with its own
    // Done control, rather than requiring a Skip click to reach a completable
    // state. The FR-008 completion gate (T016b) re-runs touchCoverage on the
    // final layout before calling onComplete, which "a" (already covered)
    // passes.
    const onComplete = vi.fn();
    seedStore({ withInventory: ["a"] });
    await act(async () => {
      render(<TouchGallery onComplete={onComplete} onBack={vi.fn()} />);
    });
    fireEvent.click(screen.getByTestId("touch-continue"));
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
  it("shows the alert naming the uncovered char PROACTIVELY on mount, with Done disabled, and never calls onComplete", async () => {
    seedStore({ withInventory: ["中"] });
    const onComplete = vi.fn();

    await act(async () => {
      render(<TouchGallery onComplete={onComplete} onBack={vi.fn()} />);
    });

    // "中" is the only (and therefore last) character. Mark-aware
    // `unaccountedTouchChars` (mechanism-gallery-progression) is computed
    // LIVE off `layoutForLintAndGate`, which itself settles asynchronously —
    // so the alert and the disabled Done control are both present WITHOUT a
    // click, but may take a tick to appear; wrapped in waitFor rather than
    // asserted synchronously right after the initial render.
    const alert = await waitFor(() => {
      const found = screen.getByRole("alert");
      expect(found.textContent).toContain("has no touch mechanism");
      return found;
    });
    expect(alert.textContent).toContain("中");
    expect(
      (screen.getByRole("button", { name: "Done" }) as HTMLButtonElement).disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("clears the alert and enables Done once a method covering the character is applied", async () => {
    seedStore({ withInventory: ["中"] });
    const onComplete = vi.fn();

    await act(async () => {
      render(<TouchGallery onComplete={onComplete} onBack={vi.fn()} />);
    });
    expect(screen.getByRole("alert")).toBeTruthy();

    // Cover "中": the method chooser is already showing (suggestion kind
    // "none"), defaulted to "Long-press on a key" — pick a host key and apply.
    await changeSelectMenu(screen.getByLabelText(/Host key for long-press/i), "K_A");
    fireEvent.click(screen.getByRole("button", { name: /Apply touch method for/i }));

    // Applying the edit clears the stale alert immediately (live
    // `unaccountedTouchChars` recompute), before Done is even clicked.
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

  it("marking the uncovered char also clears the alert and enables Done, without recording a touch assignment", async () => {
    seedStore({ withInventory: ["中"] });
    const onComplete = vi.fn();

    await act(async () => {
      render(<TouchGallery onComplete={onComplete} onBack={vi.fn()} />);
    });
    expect(screen.getByRole("alert")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: /Mark U\+4E2D 中 for later review/i }),
    );

    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
    expect(useWorkingCopyStore.getState().touchDraft?.charTouchEntries ?? []).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onComplete).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Physical-key type-to-select in an open key picker (SelectMenu's opt-in
// resolveKeyToValue, wired by KeyPickerField via keyOptions.ts's
// charToVkey) — same mechanism MechanismGallery covers, exercised here
// against TouchGallery's long-press host-key picker.
// ---------------------------------------------------------------------------

describe("TouchGallery — physical-key type-to-select in an open key picker", () => {
  it("pressing A while the long-press host-key picker is open selects K_A", async () => {
    seedStore({ withInventory: ["中"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    // Suggestion kind "none" for "中" (no desktop assignment / touch layout /
    // decomposable form) — the method chooser is already showing, defaulted
    // to "Long-press on a key".
    const trigger = screen.getByLabelText(/Host key for long-press/i);
    fireEvent.click(trigger);
    await waitFor(() => expect(trigger.getAttribute("aria-expanded")).toBe("true"));

    fireEvent.keyDown(screen.getByRole("listbox"), { key: "a" });

    expect(selectMenuValue(trigger)).toBe("K_A");
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// No modal — replaces the old ConfirmDialog leave-warning contract
// (mechanism-gallery-progression; see MechanismGallery.test.tsx's matching
// "Done-blocked inline hint (no modal)" suite). TouchGallery renders no
// <dialog> element at all now; Done is simply disabled while
// `unaccountedTouchChars` is non-empty, with the FR-008 alert explaining why.
// ---------------------------------------------------------------------------

describe("TouchGallery — no modal, ever", () => {
  it("does NOT render a dialog when completion succeeds with every character covered", async () => {
    const onComplete = vi.fn();
    // "a" is already covered by the default scaffold, so it is excluded from
    // the walk (entry-parity fix) and the gallery lands on the all-caught-up
    // panel's own Done control directly.
    seedStore({ withInventory: ["a"] });
    const { container } = await act(async () =>
      render(<TouchGallery onComplete={onComplete} onBack={vi.fn()} />),
    );
    fireEvent.click(screen.getByTestId("touch-continue"));
    expect(onComplete).toHaveBeenCalledOnce();
    expect(container.querySelector("dialog")).toBeNull();
  });

  it("does NOT render a dialog even while the completion gate refuses (Done is disabled instead)", async () => {
    seedStore({ withInventory: ["中"] });
    const { container } = await act(async () =>
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />),
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(container.querySelector("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(container.querySelector("dialog")).toBeNull();
    // Still on "中" — the method chooser is still available to actually cover it.
    expectCurrentChar("中");
    expect(screen.getByLabelText(/Host key for long-press/i)).toBeTruthy();
  });

  it("the ← back to previous character control never renders a dialog, even while the current character remains uncovered", async () => {
    seedStore({ withInventory: ["中", "日"] });
    const { container } = await act(async () =>
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />),
    );
    // Mark "中" (so Next is enabled) and advance without covering it.
    fireEvent.click(
      screen.getByRole("button", { name: /Mark U\+4E2D 中 for later review/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Next character/i }));
    await waitFor(() => {
      expectCurrentChar("日");
    });
    expect(container.querySelector("dialog")).toBeNull();

    // Back to the still-uncovered (but marked) "中" — a DIFFERENT control
    // from the forward Done path, and must never render a dialog either.
    fireEvent.click(screen.getByRole("button", { name: /back to previous character/i }));
    await waitFor(() => {
      expectCurrentChar("中", { marked: true });
    });
    expect(container.querySelector("dialog")).toBeNull();
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
// Abugida-safe gate + empty-hostkey guard on the decomposable-accented
// longpress auto-suggestion (km-domain ruling / km-triage finding #3)
// ---------------------------------------------------------------------------

describe("TouchGallery — abugida gate and empty-hostkey guard on the longpress auto-suggestion", () => {
  it("does NOT offer a longpress auto-suggestion for a decomposable char when scriptClass is abugida", async () => {
    // "ä" (a + U+0308, Mn) is predicate-matching and has a Latin base — with
    // no gate this always suggests longpress (see the "Latin base" case
    // below); with scriptClass = abugida the suggestion must not fire.
    seedStore({ withInventory: ["ä"] });
    useWorkingCopyStore.getState().setIrAxes({ scriptClass: "abugida" });

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    expect(screen.queryByText(/Suggested: long-press/i)).toBeNull();
    // Falls straight to the method chooser instead of a suggestion card.
    expect(screen.queryByText(/How to reach it on touch/i)).not.toBeNull();
  });

  it("skips the longpress suggestion (no vacuous card) when the derived host key is empty (non-Latin base)", async () => {
    // "ӝ" (ж U+0436 + U+0308 Mn) decomposes to a Cyrillic base letter, which
    // the `/^[a-zA-Z]$/` host-key extraction cannot map to a K_ key — before
    // this guard the component fell back to rendering "Suggested: long-press
    // a key to reach...", a vacuous card naming no real target key.
    seedStore({ withInventory: ["ӝ"] });

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    expect(screen.queryByText(/Suggested: long-press/i)).toBeNull();
    expect(screen.queryByText(/Suggested: long-press a key to reach/i)).toBeNull();
    // Falls straight to the method chooser — no vacuous suggestion card.
    expect(screen.queryByText(/How to reach it on touch/i)).not.toBeNull();
  });

  it("still offers the longpress auto-suggestion for a decomposable char with a Latin base (scriptClass alphabetic / undefined)", async () => {
    seedStore({ withInventory: ["ä"] });
    useWorkingCopyStore.getState().setIrAxes({ scriptClass: "alphabetic" });

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    expect(screen.queryByText(/Suggested: long-press/i)).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // Style — the suggestion card is GREEN, not red (product decision). Mirrors
  // MechanismGallery.test.tsx's identical guard ("renders the suggestion row
  // in the green family, not ERROR_RED/ERROR_BG") for the sibling gallery —
  // this card previously shipped with ERROR_RED text on an ERROR_BG card
  // (ambient "not yet implemented" styling) even though it is a
  // proposal/affordance the author can accept or deny, not an error state.
  // -------------------------------------------------------------------------

  it("renders the suggestion card in the green family, not ERROR_RED/ERROR_BG", async () => {
    seedStore({ withInventory: ["ä"] });
    useWorkingCopyStore.getState().setIrAxes({ scriptClass: "alphabetic" });

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    const card = screen.getByRole("note", {
      name: /Touch access method suggestion/i,
    });
    // #0d2218 / #238636 — the SAME green pair MechanismGallery's own
    // suggestion row (and this file's chip/Accept-button treatment) already
    // use. Never the old ERROR_RED (#f85149) / ERROR_BG (#2a0a0a).
    expect(card.style.backgroundColor).toBe("rgb(13, 34, 24)"); // #0d2218
    expect(card.style.borderColor).toBe("rgb(35, 134, 54)"); // #238636
    expect(card.style.backgroundColor).not.toBe("rgb(42, 10, 10)"); // #2a0a0a
    expect(card.style.borderColor).not.toBe("rgb(248, 81, 73)"); // #f85149

    const suggestionText = screen.getByText(/Suggested: long-press/i);
    expect(suggestionText.style.color).toBe("rgb(86, 211, 100)"); // #56d364
    expect(suggestionText.style.color).not.toBe("rgb(248, 81, 73)"); // #f85149
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

  it("a suggestion card REAPPEARS after marking for later review (unlike Accept/Deny) — marking resolves nothing", async () => {
    // Same longpress-suggestion fixture as above, plus a second inventory
    // character ("中", no desktop assignment, not in the default scaffold, not
    // decomposable-accented → suggestion kind "none" AND not detected — same
    // fixture precedent used throughout this file for a genuinely unresolved
    // character) so there is somewhere to advance forward to and Back from
    // WITHOUT that second character being excluded from the walk itself
    // (entry-parity fix — a plain Latin letter like "x" would be detected via
    // the OS-default physical fall-through and excluded). Marking is a
    // separate toggle from suggestionResolved and must not add "á" to it, so
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
    seedWithDesktopAssignment("á", deadkeyAssignment, ["中"]);

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    // Suggestion card shows for "á".
    expect(screen.queryByText(/Suggested: long-press/i)).not.toBeNull();

    // Mark it, then advance — no accept/deny, no assignment recorded.
    fireEvent.click(
      screen.getByRole("button", { name: /Mark U\+00E1 á for later review/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Next character/i }));
    await waitFor(() => {
      expectCurrentChar("中");
    });

    // Navigate back to "á" without ever resolving its suggestion.
    fireEvent.click(screen.getByRole("button", { name: /back to previous character/i }));
    await waitFor(() => {
      expectCurrentChar("á", { marked: true });
    });

    // Unlike the accept/deny case above, the suggestion card for "á" MUST
    // reappear — marking resolved nothing about the suggestion itself.
    expect(screen.queryByText(/Suggested: long-press/i)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suggestion gate — already-reachable-on-touch suppresses the redundant
// suggestion card.
//
// Bug: a "re-seed from desktop" reseed can place a character directly onto a
// longpress sub-key (engine/src/pattern-apply/applyDesktopModifications.ts's
// placement pass — a Phase C letter whose host key is already occupied lands
// as an `sk[]` alternate). The `suggestion` memo's desktop-assignment (`da`)
// branch returned a longpress/replace suggestion unconditionally whenever a
// Phase C assignment existed for the character, with NO check at all against
// whether the character already has a working touch method — unlike the
// no-desktop-assignment branch below it, which at least checked
// `detectedChars`. Fix: gate on `enumerateTouchMethodsForChar` against the
// CURRENT effective touch layout (layoutForLintAndGate — reflects the
// reseed's own placement plus any Phase E edits already recorded), applied
// before either branch runs.
// ---------------------------------------------------------------------------

describe("TouchGallery — suggestion suppressed when the char already has a touch method", () => {
  it("does NOT show a suggestion card when the current touch layout already has a longpress producing the char", async () => {
    // Seed a Phase C simple_swap assignment for "x" — on its own this drives
    // the `da` branch straight to a "replace" suggestion (see "shows a
    // 'replace' suggestion..." above). Override the (mocked)
    // buildTouchLayoutJson so the CURRENT touch layout already carries a
    // longpress sub-key producing "x" off K_A — modelling the reseed's own
    // auto-placed longpress that the real buildTouchLayoutJson this spy
    // stands in for would have produced via applyDesktopModifications.
    buildTouchLayoutJsonSpy.mockImplementation(() => ({
      json: JSON.stringify({
        phone: {
          layer: [
            {
              id: "default",
              row: [
                {
                  id: 1,
                  key: [{ id: "K_A", text: "a", sk: [{ id: "U_0078", text: "x" }] }],
                },
              ],
            },
          ],
        },
      }),
      warnings: [] as string[],
    }));

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

    // No suggestion card at all — "x" already has a working method.
    expect(screen.queryByText(/Suggested:/i)).toBeNull();
    // The method chooser shows directly instead — same shape as the
    // "no suggestion goes straight to chooser" case above.
    expect(screen.queryByText(/How to reach it on touch/i)).not.toBeNull();
  });

  it("still shows the suggestion card for a character with NO existing touch method (control)", async () => {
    // Same Phase C assignment as above, but WITHOUT overriding
    // buildTouchLayoutJson: the default mock (defaultBuildTouchLayoutJsonImpl,
    // re-pinned in beforeEach) maps only the CURRENT charTouch entries, which
    // start empty, so "x" has no touch method yet. Proves the gate above is
    // genuinely reachability-driven, not a blanket suppression of the `da`
    // branch.
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

    expect(screen.queryByText(/Suggested: replace/i)).not.toBeNull();
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
    // Two-character inventory. The gallery's walk is collated (spec 047's
    // collateCompare): the Latin letter "y" is detected via the OS-default
    // physical fall-through (same precedent as the "x" fixture elsewhere in
    // this file) and so is excluded from touchLettersToAdd's walk entirely
    // (entry-parity fix) — "中" is the walk's only entry, and the initial
    // sync effect lands currentChar there directly.
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

    // Mount lands directly on "中" (the walk's only entry) — it has no
    // suggestion, so the chooser (not a suggestion card) shows directly.
    expectCurrentChar("中");

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

  it("a real method REPLACES a persisted touch_inherited-only placeholder, leaving no stray touch_inherited (mutual exclusivity holds)", async () => {
    // "a" is present in the scaffolded default QWERTY touch layout, so it is
    // auto-detected as already reachable — that no longer surfaces an
    // Accept-able suggestion card (see the "read-only existing
    // implementation" suite), but a touch_inherited-only entry can still
    // exist from a prior mount's persisted draft (see the
    // vfsTransform-inject-only-when-real-edits suite's own touch_inherited
    // test for the same seeding idiom). appendMechanismToChar's mutual-
    // exclusivity rule (a real method REPLACES an inherited-only
    // placeholder) is exercised here via the chooser, which is shown
    // directly (suggestionDismissed is forced true once charTouch already
    // has an entry for "a" — see `suggestionDismissed`'s derivation).
    seedStore({ withInventory: ["a"] });
    const inheritedAssignment: MechanismAssignment = {
      scope: "individual",
      target: "a",
      modality: "touch",
      mechanisms: [{ patternId: "touch_inherited" }],
      source: "user",
    };
    useWorkingCopyStore.getState().setTouchDraft({
      charTouchEntries: [["a", inheritedAssignment]],
      suggestionResolvedChars: ["a"],
    });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    // "a" is excluded from the walk (entry-parity fix — detected, no Phase C
    // suggestion of its own), so currentChar starts null; select it via its
    // CharScrollStrip chip to reach the chooser (mirrors MechanismGallery's
    // handleSelectDisplayChar precedent).
    fireEvent.click(screen.getByTestId("char-scroll-chip-0061"));
    await waitFor(() => {
      expectCurrentChar("a");
    });

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
// "Existing methods" color model — touch side (mirrors MechanismGallery's
// desktop suite). Touch method descriptors carry no "used" concept at all
// (unlike desktop's storeSlot rows), so every non-deletable touch row —
// including a layer-switch main key, which still PRODUCES the character, it
// just also switches layers — is GREEN, never blue.
// ---------------------------------------------------------------------------

describe("TouchGallery — Existing methods color model (produced vs. used)", () => {
  it("a layer-switch existing touch method renders GREEN and static — it produces the char, so it is never blue, and it has no delete affordance", async () => {
    // A unique target char, never used by another test in this file, so this
    // persistent conditional override can never affect anything else here.
    const targetChar = "☃";
    enumerateTouchMethodsForCharSpy.mockImplementation(
      (layout: unknown, ch: string) => {
        if (ch !== targetChar) {
          return originalEnumerateTouchMethodsForCharRef.current!(layout, ch);
        }
        return [
          {
            id: "layer-switch:snowman",
            kind: "tap",
            host: "4",
            producedChar: targetChar,
            platform: "phone",
            layer: "default",
            deletable: false,
            reasonCode: "layer-switch",
          },
        ];
      },
    );

    seedStore({ withInventory: [targetChar] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    let row: HTMLElement;
    await waitFor(() => {
      row = screen.getByText(`Tap [4] → ${targetChar} - NOT DELETABLE`);
      expect(row).toBeTruthy();
    });
    // GREEN (produced), not blue — a layer-switch key still produces the
    // char; color tracks produced-vs-used, not deletability.
    expect(row!.style.color).toBe("rgb(86, 211, 100)"); // #56d364
    expect(row!.style.backgroundColor).toBe("rgb(13, 34, 24)"); // #0d2218
    // Static: a <span>, not a <button> — no delete affordance at all.
    expect(row!.tagName).toBe("SPAN");
    expect(
      screen.queryByRole("button", {
        name: /Remove existing touch method/i,
      }),
    ).toBeNull();
  });
});

// Touch layer picker — #1 longpress / #2 flick gain a layer option modeled
// on MechanismGallery's merged "Assign to a key" card's S-08 layer-combo
// picker: options are derived from the working KeyboardIR
// (collectLayerCombosInUse), never hardcoded, and are ONLY the layers the
// desktop keyboard actually uses.
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

/** A desktop IR using BOTH bare RALT and the SHIFT+RALT combo — so an author
 * can select the RAlt layer (bare RALT is a valid combo) AND that layer has a
 * casing parallel the keyboard actually defines (`rightalt-shift`). The
 * fixture the compound case-pair proposal needs; `irWithShiftAndRaltLayers`
 * deliberately lacks the SHIFT+RALT combo and is used for the negative. */
const irWithRaltAndShiftRalt = makeTestIR([
  makeIrGroup([
    makeVkeyRule("K_E", ["RALT"], "é"),
    makeVkeyRule("K_E", ["SHIFT", "RALT"], "É"),
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
// proposal (casePairTouchTarget(["SHIFT"], …) === null — there is no "more
// uppercase" layer to pair a SHIFT-bearing combo with). Closes the uppercase-path
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

// ---------------------------------------------------------------------------
// Case-pair proposal on a NON-DEFAULT touch layer.
//
// `casePairTouchTarget` used to be keyed on the flattened layer id and mapped
// exactly `"default"` -> `"shift"`, so an author editing any other layer got
// no case-pair proposal at all — silently, with the companion layer perfectly
// derivable. Reachable on a base with an AltGr/RAlt layer, which is common
// (French, EuroLatin). The rule is now keyed on the modifier COMBO ("this
// combo plus SHIFT"), which composes with the builder's open vocabulary.
// ---------------------------------------------------------------------------

describe("TouchGallery — case-pair proposal on a non-default touch layer", () => {
  /** Deny the auto-detected suggestion card if one is showing. */
  async function denyAnySuggestion() {
    const denyBtn =
      screen.queryAllByRole("button").find((b) => b.textContent?.trim() === "Deny") ?? null;
    if (denyBtn !== null) {
      await act(async () => {
        fireEvent.click(denyBtn!);
      });
    }
  }

  /** Add one layer slot and set it to `token`. */
  async function selectLayerToken(token: string) {
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /add another touch layer for long-press/i }),
      );
    });
    await changeSelectMenu(
      screen.getByRole("button", { name: /^touch layer 1 for long-press$/i }),
      token,
    );
  }

  async function applyOnHostKey(hostKey: string) {
    await changeSelectMenu(screen.getByRole("button", { name: /host key/i }), hostKey);
    const applyBtn =
      screen.queryAllByRole("button").find((b) => b.textContent?.trim() === "Apply method") ??
      null;
    expect(applyBtn).not.toBeNull();
    expect(applyBtn!.hasAttribute("disabled")).toBe(false);
    await act(async () => {
      fireEvent.click(applyBtn!);
    });
  }

  function touchMechanismsFor(char: string) {
    const draft = useWorkingCopyStore.getState().touchDraft;
    return draft?.charTouchEntries.find(([c]) => c === char)?.[1]?.mechanisms ?? [];
  }

  it("offers the capital on the combo-plus-SHIFT layer when editing the RAlt layer", async () => {
    seedStore({ withInventory: ["θ"], ir: irWithRaltAndShiftRalt });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await denyAnySuggestion();
    await selectLayerToken("RALT");
    expect(screen.getByText(/Resulting layer: RAlt/i)).toBeTruthy();
    await applyOnHostKey("K_A");

    // The proposal is raised at all — under the id-keyed rule this banner never
    // appeared for any layer but the base one.
    expect(screen.getByText(/has an uppercase form, Θ/i)).toBeTruthy();
    // ...and it NAMES the layer the confirm will actually write to. A banner
    // saying "the shift layer" here would misdescribe the write (it lands on
    // rightalt-shift), so the label is asserted, not just the presence.
    expect(screen.getByText(/Map Θ to the Shift\+RAlt layer as well\?/i)).toBeTruthy();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /Map Θ to the Shift\+RAlt layer of the a key/i }),
      );
    });

    // Source placement stays on the layer the author was editing...
    expect(touchMechanismsFor("θ")[0]?.slotValues).toMatchObject({
      hostKey: "K_A",
      char: "θ",
      layer: "rightalt",
    });
    // ...and the capital lands on that layer's casing parallel — NOT on the
    // plain "shift" layer, and not on "default".
    expect(touchMechanismsFor("Θ")[0]?.slotValues).toMatchObject({
      hostKey: "K_A",
      char: "Θ",
      layer: "rightalt-shift",
    });
  });

  it("raises no proposal when the combo-plus-SHIFT layer is one the keyboard never uses", async () => {
    // irWithShiftAndRaltLayers uses bare SHIFT and bare RALT but never
    // SHIFT+RALT — so the RAlt layer is selectable, yet its casing parallel is
    // a layer this keyboard has no combo for. Raise nothing rather than
    // propose a placement onto a layer that isn't there.
    seedStore({ withInventory: ["θ"], ir: irWithShiftAndRaltLayers });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await denyAnySuggestion();
    await selectLayerToken("RALT");
    await applyOnHostKey("K_A");

    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
    // The source placement itself still lands normally.
    expect(touchMechanismsFor("θ")[0]?.slotValues).toMatchObject({
      hostKey: "K_A",
      char: "θ",
      layer: "rightalt",
    });
    expect(touchMechanismsFor("Θ")).toHaveLength(0);
  });

  it("still offers the plain shift layer from the base layer (no regression)", async () => {
    // The base-layer path is the one that worked before; it must keep working
    // even on a keyboard whose combos-in-use do not include bare SHIFT,
    // because the shift layer always exists (scaffolder's fixed buckets).
    seedStore({ withInventory: ["θ"], ir: irWithoutShiftCombo });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await denyAnySuggestion();
    await applyOnHostKey("K_A"); // no layer slot -> base/default layer

    expect(screen.getByText(/has an uppercase form, Θ/i)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Map Θ to the shift layer of/i }));
    });
    expect(touchMechanismsFor("Θ")[0]?.slotValues).toMatchObject({
      hostKey: "K_A",
      char: "Θ",
      layer: "shift",
    });
  });

  // -------------------------------------------------------------------------
  // The SECOND call site — the suggestion-Accept path (handleUseSuggestion).
  //
  // It carried the same id-keyed bug (it landed on main after this branch
  // opened) and now shares `casePairTouchTarget(assembledLayerCombo, …)` with
  // Apply. What the UI can drive it to is narrower than Apply, by
  // construction: the suggestion card and the layer builder are mutually
  // exclusive (`showChooser = suggestionDismissed || suggestion.kind ===
  // "none"`), and `layerTokens` is re-seeded from
  // `seedLayerTokensForChar(currentChar)` on every character change. So at the
  // instant Accept fires, the assembled combo is ALWAYS the case-derived seed
  // — `[]` (base) or `["SHIFT"]`, the only two values that function returns.
  // The compound RAlt -> Shift+RAlt case the Apply tests above cover is
  // therefore not reachable through this path today; the last test in this
  // block pins the exclusivity that makes that true, so if the builder is ever
  // rendered alongside the card, this suite fails rather than going quietly
  // stale on the compound case.
  // -------------------------------------------------------------------------

  async function acceptSuggestion() {
    const acceptBtn =
      screen.queryAllByRole("button").find((b) => b.textContent?.trim() === "Accept") ?? null;
    expect(acceptBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(acceptBtn!);
    });
  }

  it("Accept offers the plain shift layer even on a keyboard that never uses a bare SHIFT combo", async () => {
    // The ungated plain-SHIFT candidate, pinned on the Accept path rather than
    // Apply's. irWithoutShiftCombo's combos-in-use are only [["RALT"],
    // ["CTRL"]], so gating this candidate through `isLayerComboInUse` — the way
    // the compound candidates ARE gated — would silently drop the proposal
    // here. The shift layer always exists (scaffolder's fixed buckets), so the
    // asymmetry is deliberate and both call sites must honour it.
    seedStore({ withInventory: ["ă"], ir: irWithoutShiftCombo });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await acceptSuggestion();

    expect(screen.getByText(/has an uppercase form, Ă/i)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Map Ă to the shift layer of/i }));
    });
    expect(touchMechanismsFor("Ă")[0]?.slotValues).toMatchObject({
      hostKey: "K_A",
      char: "Ă",
      layer: "shift",
    });
  });

  it("Accept on the case-derived SHIFT seed raises no redundant proposal", async () => {
    // An uppercase current char seeds the builder with ["SHIFT"], so this is
    // the one non-default combo the Accept path can actually see. Seeded with
    // irWithShiftAndRaltLayers, which DOES use bare SHIFT — so what suppresses
    // the proposal is the already-uppercase arm of the combo rule, not the
    // availability gate. (The FR-012 suite below pins the recorded layer on the
    // default IR; the case-pair half is what is asserted here.)
    seedStore({ withInventory: ["Ă"], ir: irWithShiftAndRaltLayers });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await acceptSuggestion();

    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
    expect(touchMechanismsFor("Ă")[0]?.slotValues).toMatchObject({
      hostKey: "K_A",
      char: "Ă",
      layer: "shift",
    });
  });

  it("the suggestion card and the layer builder never coexist, so Accept only ever sees the seeded combo", async () => {
    // The reachability invariant behind the block comment above. Not a
    // behavioural assertion about case pairing — a tripwire: the moment an
    // author can assemble a combo while the suggestion card is still up, the
    // compound Accept case becomes real and needs its own coverage here.
    seedStore({ withInventory: ["ă"], ir: irWithRaltAndShiftRalt });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    const acceptBtn = () =>
      screen.queryAllByRole("button").find((b) => b.textContent?.trim() === "Accept") ?? null;
    const addLayerBtn = () =>
      screen.queryByRole("button", { name: /add another touch layer for long-press/i });

    expect(acceptBtn()).not.toBeNull();
    expect(addLayerBtn()).toBeNull();

    await denyAnySuggestion();

    expect(addLayerBtn()).not.toBeNull();
    expect(acceptBtn()).toBeNull();
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
// Longpress accelerator (sibling accents) — accepting a longpress suggestion
// for one accented letter offers the rest of its diacritic family, both
// cases, in one confirm.
// ---------------------------------------------------------------------------

describe("TouchGallery — longpress accelerator (sibling accents)", () => {
  function touchMechanismsFor(char: string) {
    const draft = useWorkingCopyStore.getState().touchDraft;
    return (
      draft?.charTouchEntries.find(([c]) => c === char)?.[1]?.mechanisms ?? []
    );
  }
  function bulkGroups() {
    return useWorkingCopyStore.getState().touchDraft?.bulkAccentGroups ?? [];
  }
  /** Jump the gallery's positional walk directly to `char` via its
   *  CharScrollStrip chip (ungated by covered/configured status — see
   *  usePositionalCharNav's handleSelectChar) — the gallery's walk is now
   *  collated (spec 047's collateCompare), so a breve letter like "ă" sorts
   *  AFTER its grave/acute-accented siblings and is no longer reliably the
   *  first (idx 0) character these fixtures used to land on by construction.
   *  Single-codepoint BMP chars only (matches CharScrollStrip.tsx's charHex). */
  function gotoChar(char: string) {
    const hex = (char.codePointAt(0) ?? 0)
      .toString(16)
      .toUpperCase()
      .padStart(4, "0");
    fireEvent.click(screen.getByTestId(`char-scroll-chip-${hex}`));
  }
  async function acceptSuggestion() {
    const acceptBtn =
      screen
        .queryAllByRole("button")
        .find((b) => b.textContent?.trim() === "Accept") ?? null;
    expect(acceptBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(acceptBtn!);
    });
  }
  async function confirmBanner() {
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", {
          name: /Add the related accented letters to K_A/i,
        }),
      );
    });
  }
  /** The Configured-row remove chip for `char` (aria-label "Remove <notation>
   *  <char> …"), or undefined. Deliberately excludes the bulk box's "Remove
   *  all …" control and the Skip/Accept buttons (which also name the current
   *  char) so callers test the per-mechanism chip specifically. */
  function individualChipFor(char: string) {
    return screen.queryAllByRole("button").find((b) => {
      const label = b.getAttribute("aria-label") ?? "";
      return (
        label.startsWith("Remove ") &&
        !label.startsWith("Remove all") &&
        label.includes(char)
      );
    });
  }

  it("accepting the longpress suggestion for ă raises the sibling-accent banner", async () => {
    // Inventory holds only the a-family accents the language uses.
    seedStore({ withInventory: ["ă", "à", "á", "À", "Á"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });
    // "ă" (breve) sorts after à/á/À/Á under the collated walk — jump to it
    // directly rather than relying on mount's first-uncovered default.
    gotoChar("ă");

    await acceptSuggestion();

    // "ă" itself is recorded directly (unaffected by the accelerator).
    expect(touchMechanismsFor("ă")).toHaveLength(1);
    expect(screen.getByText(/is part of a family of accented letters/i)).toBeTruthy();

    // Nothing is placed yet — propose-then-confirm, never a silent auto-insert.
    expect(touchMechanismsFor("à")).toHaveLength(0);
    expect(touchMechanismsFor("À")).toHaveLength(0);
  });

  it("CHANGE 5: the proposal banner renders at the TOP — before the Configured chip row, in the same region the accepted bulk box later occupies", async () => {
    seedStore({ withInventory: ["ă", "à", "á", "À", "Á"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await acceptSuggestion();
    const proposalBanner = screen.getByRole("note", {
      name: /Related accented letters suggestion/i,
    });
    const configuredHeading = screen.getByText("Configured");
    // DOCUMENT_POSITION_FOLLOWING (4): configuredHeading comes AFTER the
    // banner — i.e. the banner renders above/before the Configured chip row,
    // not lower down near it (the pre-CHANGE-5 position).
    expect(
      proposalBanner.compareDocumentPosition(configuredHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Confirm the bulk proposal — its accepted, removable summary box now
    // occupies the SAME region the proposal banner just did, still above the
    // Configured chip row.
    await confirmBanner();
    const summaryBox = screen.getByText(/Added .* as long-press/i);
    const configuredHeadingAfter = screen.getByText("Configured");
    expect(
      summaryBox.compareDocumentPosition(configuredHeadingAfter) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("Accept places only INVENTORY siblings — lowercase on default, uppercase on shift — in one click", async () => {
    // The language uses à á and their capitals, but NOT â ä ã å etc.
    seedStore({ withInventory: ["ă", "à", "á", "À", "Á"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await acceptSuggestion();
    await confirmBanner();

    for (const lower of ["à", "á"]) {
      const mechanisms = touchMechanismsFor(lower);
      expect(mechanisms).toHaveLength(1);
      expect(mechanisms[0]?.patternId).toBe("longpress_alternates");
      expect(mechanisms[0]?.slotValues).toMatchObject({
        hostKey: "K_A",
        char: lower,
        layer: "default",
      });
    }
    for (const upper of ["À", "Á"]) {
      expect(touchMechanismsFor(upper)[0]?.slotValues).toMatchObject({
        hostKey: "K_A",
        char: upper,
        layer: "shift",
      });
    }

    // "extras" NOT in the inventory are never added.
    for (const extra of ["â", "ä", "ã", "å", "Â"]) {
      expect(touchMechanismsFor(extra)).toHaveLength(0);
    }

    // The banner is gone after Accept.
    expect(screen.queryByText(/is part of a family of accented letters/i)).toBeNull();
  });

  it("the batch appears as ONE bulk box (not per-sibling chips) and deletes them all at once", async () => {
    seedStore({ withInventory: ["ă", "à", "á", "À", "Á"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });
    gotoChar("ă");

    await acceptSuggestion();
    await confirmBanner();

    // One summary box, one Remove-all control.
    expect(screen.getByText(/Added .* as long-press/i)).toBeTruthy();
    const removeAll = screen.getByRole("button", { name: /Remove all/i });
    expect(removeAll).toBeTruthy();
    expect(bulkGroups()).toHaveLength(1);
    expect(bulkGroups()[0]?.members).toEqual(["à", "á", "À", "Á"]);

    // The siblings are NOT rendered as individual Configured chips — only the
    // base "ă" keeps its own chip.
    expect(individualChipFor("à")).toBeUndefined();
    expect(individualChipFor("À")).toBeUndefined();
    expect(individualChipFor("ă")).toBeTruthy();

    // Remove-all clears every sibling in one click; the box disappears.
    await act(async () => {
      fireEvent.click(removeAll);
    });
    for (const c of ["à", "á", "À", "Á"]) {
      expect(touchMechanismsFor(c)).toHaveLength(0);
    }
    expect(bulkGroups()).toHaveLength(0);
    expect(screen.queryByText(/Added .* as long-press/i)).toBeNull();
    // The base longpress the author accepted directly is untouched.
    expect(touchMechanismsFor("ă")).toHaveLength(1);
  });

  it("the bulk box rehydrates from a persisted draft (survives unmount/remount)", async () => {
    seedStore({ withInventory: ["ă", "à", "À"] });
    const lp = (char: string, layer: string): MechanismAssignment => ({
      scope: "individual",
      target: char,
      modality: "touch",
      mechanisms: [
        {
          patternId: "longpress_alternates",
          slotValues: { hostKey: "K_A", char, layer },
        },
      ],
      source: "user",
    });
    useWorkingCopyStore.getState().setTouchDraft({
      charTouchEntries: [
        ["à", lp("à", "default")],
        ["À", lp("À", "shift")],
      ],
      suggestionResolvedChars: [],
      bulkAccentGroups: [
        { id: "ă:K_A", hostKey: "K_A", baseChar: "ă", members: ["à", "À"] },
      ],
    });

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    // The summary box is present on first paint, driven by the persisted group.
    expect(screen.getByText(/Added .* as long-press/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Remove all/i })).toBeTruthy();
    // Still not individual chips.
    expect(individualChipFor("à")).toBeUndefined();
  });

  it("Decline discards the proposal and places nothing", async () => {
    seedStore({ withInventory: ["ă", "à", "á"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });
    gotoChar("ă");

    await acceptSuggestion();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", {
          name: /Do not add the related accented letters/i,
        }),
      );
    });

    expect(screen.queryByText(/is part of a family of accented letters/i)).toBeNull();
    expect(touchMechanismsFor("à")).toHaveLength(0);
    expect(bulkGroups()).toHaveLength(0);
    // "ă" itself is untouched by declining the accelerator.
    expect(touchMechanismsFor("ă")).toHaveLength(1);
  });

  it("does not fire for a 'replace' suggestion accept (desktop simple_swap, not an accent family)", async () => {
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

    await acceptSuggestion();
    expect(screen.queryByText(/is part of a family of accented letters/i)).toBeNull();
  });

  it("CHANGE 3: a 'replace' suggestion accept (no bulk possible) still raises the simple case-pair companion — not just the manual chooser's Apply", async () => {
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
    await acceptSuggestion();

    // No bulk banner (a "replace" suggestion is never a bulk trigger), but
    // the simple companion DOES fire — this is the CHANGE 3 fix: previously
    // only the manual chooser's Apply (handleApply) raised it.
    expect(screen.queryByText(/is part of a family of accented letters/i)).toBeNull();
    expect(screen.getByText(/has an uppercase form, Ă/i)).toBeTruthy();

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /Map Ă to the shift layer of/i }),
      );
    });
    expect(touchMechanismsFor("Ă")[0]?.slotValues).toMatchObject({
      hostKey: "K_A",
      char: "Ă",
      layer: "shift",
    });
  });

  it("CHANGE 4: a bulk proposal that includes the accepted char's OWN uppercase counterpart pre-empts the simple companion — denying the bulk then falls back to it", async () => {
    // "à"'s own uppercase counterpart is "À", which IS among "à"'s inventory
    // siblings here — so the bulk proposal (offering á/À) already covers it.
    seedStore({ withInventory: ["à", "á", "À"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });
    // The collated walk puts "á" (acute) ahead of "à" (grave), so jump to "à"
    // rather than relying on mount's first-uncovered default — "à" is the char
    // whose own uppercase counterpart is among the bulk siblings.
    gotoChar("à");

    await acceptSuggestion();

    // Bulk banner shown; simple companion DEFERRED (not shown alongside it —
    // showing both would prompt placing À twice).
    expect(screen.getByText(/is part of a family of accented letters/i)).toBeTruthy();
    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();

    // Deny the bulk proposal — the deferred simple companion is raised now,
    // as the fallback.
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", {
          name: /Do not add the related accented letters/i,
        }),
      );
    });
    expect(screen.queryByText(/is part of a family of accented letters/i)).toBeNull();
    expect(screen.getByText(/has an uppercase form, À/i)).toBeTruthy();

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /Map À to the shift layer of/i }),
      );
    });
    // "À" was placed via the SIMPLE companion path, not the bulk one — no
    // bulk group was ever recorded (the bulk was denied).
    expect(bulkGroups()).toHaveLength(0);
    expect(touchMechanismsFor("À")).toHaveLength(1);
    expect(touchMechanismsFor("À")[0]?.slotValues).toMatchObject({
      hostKey: "K_A",
      char: "À",
      layer: "shift",
    });
  });

  it("CHANGE 4: confirming the bulk proposal (which already placed the uppercase) never subsequently raises the simple companion", async () => {
    seedStore({ withInventory: ["à", "á", "À"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });
    // Collated walk order puts "á" first — see the deny/fallback test above.
    gotoChar("à");

    await acceptSuggestion();
    await confirmBanner();

    // The uppercase was placed via the bulk group — the deferred simple
    // companion is discarded, never shown.
    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
    expect(bulkGroups()).toHaveLength(1);
    expect(bulkGroups()[0]?.members).toEqual(["á", "À"]);
  });

  it("navigating away with an OPEN, UNDECIDED bulk proposal abandons BOTH the bulk proposal and its deferred simple companion — neither resurfaces on the new char", async () => {
    // Same setup as the CHANGE 4 deny/confirm tests above: "à"'s own
    // uppercase counterpart "À" is among the bulk siblings, so accepting the
    // suggestion defers the simple companion behind the (still open) bulk
    // banner.
    seedStore({ withInventory: ["à", "á", "À"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });
    // Collated walk order puts "á" first — see the deny/fallback test above.
    gotoChar("à");

    await acceptSuggestion();
    expect(screen.getByText(/is part of a family of accented letters/i)).toBeTruthy();
    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();

    // Navigate away WITHOUT confirming or dismissing the bulk banner ("à"
    // already has its own directly-accepted mechanism, so the Next control
    // is enabled here).
    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-continue"));
    });

    // Both proposals are abandoned, not carried forward or silently
    // resolved: no bulk banner, no deferred-companion fallback banner, and
    // no bulk group was ever recorded.
    expect(screen.queryByText(/is part of a family of accented letters/i)).toBeNull();
    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
    expect(bulkGroups()).toHaveLength(0);
    // Neither sibling was placed by the abandoned bulk proposal.
    expect(touchMechanismsFor("á")).toHaveLength(0);
    expect(touchMechanismsFor("À")).toHaveLength(0);
  });

  it("skips a sibling already produced on that host key's layer (not counted in the bulk group)", async () => {
    // "à" is pre-seeded as already configured on K_A's default layer. Accepting
    // "ă" must dedupe against it rather than double-placing — and since it was
    // not NEWLY placed, it is not a member of this confirm's bulk group.
    seedStore({ withInventory: ["ă", "à", "á"] });
    const existingAssignment: MechanismAssignment = {
      scope: "individual",
      target: "à",
      modality: "touch",
      mechanisms: [
        {
          patternId: "longpress_alternates",
          slotValues: { hostKey: "K_A", char: "à", layer: "default" },
        },
      ],
      source: "user",
    };
    useWorkingCopyStore.getState().setTouchDraft({
      charTouchEntries: [["à", existingAssignment]],
      suggestionResolvedChars: [],
    });

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });
    gotoChar("ă");

    await acceptSuggestion();
    await confirmBanner();

    // "à" still carries exactly its pre-existing mechanism — not duplicated.
    expect(touchMechanismsFor("à")).toHaveLength(1);
    // "á" is newly placed by this batch.
    expect(touchMechanismsFor("á")).toHaveLength(1);
    expect(bulkGroups()[0]?.members).toEqual(["á"]);
  });

  it("removing the base chip after confirm removes ONLY the base, not the whole batch", async () => {
    seedStore({ withInventory: ["ă", "à", "À"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });
    gotoChar("ă");

    await acceptSuggestion();
    await confirmBanner();

    expect(touchMechanismsFor("ă")).toHaveLength(1);
    expect(touchMechanismsFor("à")).toHaveLength(1);
    expect(bulkGroups()).toHaveLength(1);

    // Remove the base "ă"'s chip via the Configured row.
    const removeBase = individualChipFor("ă");
    expect(removeBase).toBeTruthy();
    await act(async () => {
      fireEvent.click(removeBase!);
    });

    // Only the base is gone. The siblings are independent long-press alternates
    // of the same key and stay put — deleting one rule must not delete the
    // batch (that is what "Remove all" is for).
    expect(touchMechanismsFor("ă")).toHaveLength(0);
    expect(touchMechanismsFor("à")).toHaveLength(1);
    expect(touchMechanismsFor("À")).toHaveLength(1);
    expect(bulkGroups()).toHaveLength(1);
    // The bulk box still shows (current char "ă" is still in the a-family).
    expect(screen.getByText(/Added .* as long-press/i)).toBeTruthy();
  });

  it("clears an OPEN proposal when the base chip is removed before confirming", async () => {
    seedStore({ withInventory: ["ă", "à"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });
    gotoChar("ă");

    await acceptSuggestion();
    expect(touchMechanismsFor("ă")).toHaveLength(1);
    expect(screen.getByText(/is part of a family of accented letters/i)).toBeTruthy();

    const removeBase = individualChipFor("ă");
    expect(removeBase).toBeTruthy();
    await act(async () => {
      fireEvent.click(removeBase!);
    });

    expect(touchMechanismsFor("ă")).toHaveLength(0);
    expect(screen.queryByText(/is part of a family of accented letters/i)).toBeNull();
    expect(touchMechanismsFor("à")).toHaveLength(0);
  });

  it("shows only the bulk box for the current character's family, not other families' boxes", async () => {
    // Two persisted groups on different host keys (a-family and e-family).
    // The gallery's walk is collated (spec 047's collateCompare), so "à"
    // (not "è") is the first (idx 0) character regardless of the seed
    // array's own order — jump to "è" explicitly via its chip.
    seedStore({ withInventory: ["è", "à"] });
    const lp = (
      char: string,
      hostKey: string,
      layer: string,
    ): MechanismAssignment => ({
      scope: "individual",
      target: char,
      modality: "touch",
      mechanisms: [
        { patternId: "longpress_alternates", slotValues: { hostKey, char, layer } },
      ],
      source: "user",
    });
    useWorkingCopyStore.getState().setTouchDraft({
      charTouchEntries: [
        ["é", lp("é", "K_E", "default")], // e-family base chip
        ["ê", lp("ê", "K_E", "default")], // e-family sibling (in box)
        ["á", lp("á", "K_A", "default")], // a-family base chip
        ["â", lp("â", "K_A", "default")], // a-family sibling (in box)
      ],
      suggestionResolvedChars: [],
      bulkAccentGroups: [
        { id: "é:K_E", hostKey: "K_E", baseChar: "é", members: ["ê"] },
        { id: "á:K_A", hostKey: "K_A", baseChar: "á", members: ["â"] },
      ],
    });

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });
    gotoChar("è");

    // Current char "è" is in the e-family (host key K_E): only the e box shows.
    expect(screen.getByText(/to e as long-press/i)).toBeTruthy();
    expect(screen.queryByText(/to a as long-press/i)).toBeNull();
    // The a-family base chip is also hidden while editing an e-family char;
    // the e-family base chip is shown. (Siblings ê/â are always in the box.)
    expect(individualChipFor("á")).toBeUndefined();
    expect(individualChipFor("é")).toBeTruthy();
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

// ---------------------------------------------------------------------------
// spec 058 T072/T073/T075/T076 — the touch step's mode selector, the propose-
// on-entry gate, the shared progress figures, and the undo affordance.
// ---------------------------------------------------------------------------

/**
 * Seeds a working copy from a SHIPPED `.keyman-touch-layout` whose single
 * "phone" platform / "default" layer contains an author-controlled key list
 * — the fixture T073's both-conditions gate needs (an "imported keyboard
 * with a broken key" scenario touch-coverage's own scaffold fixtures cannot
 * produce deterministically, since scaffoldTouchLayout's real punctuation
 * keys (e.g. `K_PERIOD`) legitimately carry no `output` field of their own
 * either — see this file's own `T_broken`/`T_cover` naming below for exactly
 * which key is "broken" and which "covers" a character, rather than relying
 * on scaffold incidental structure).
 *
 * `includeBrokenKey`: adds `T_broken` (no `output`, no decodable id, no rule
 * — genuinely "no reachable output" per `isNoOutputLetterCell`).
 * `coveringCharKey`: when set, adds a second key (`T_cover`) whose `output`
 * IS that character — used to make a character reachable while a broken key
 * still exists elsewhere in the same layout (the "broken keys but nothing
 * unplaced" control).
 */
function seedKeyModeFixture(opts: {
  inventory: string[];
  includeBrokenKey: boolean;
  coveringCharKey?: string;
}) {
  const keys: Array<Record<string, unknown>> = [];
  if (opts.includeBrokenKey) keys.push({ id: "T_broken", text: "?" });
  if (opts.coveringCharKey !== undefined) {
    keys.push({
      id: "T_cover",
      output: opts.coveringCharKey,
      text: opts.coveringCharKey,
    });
  }
  const shippedLayoutJson = JSON.stringify({
    phone: {
      layer: [{ id: "default", row: [{ id: 1, key: keys }] }],
    },
  });
  const vfs = createVirtualFS([
    { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    {
      path: "source/basic_kbdus.keyman-touch-layout",
      content: shippedLayoutJson,
      isBinary: false,
    },
  ]);
  const ir = makeTestIR([]);
  useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });
  useWorkingCopyStore.getState().recordPhase({
    phase: "B",
    answers: [],
    confirmedInventory: opts.inventory,
  });
  useWorkingCopyStore.getState().markGalleryIntroSeen("touch");
  useSurveySessionStore.getState().setTouchSeedSource("import-adapt");
}

describe("TouchGallery — mode selector as an APG tabs pattern (T072, FR-035)", () => {
  it("renders a tablist with two tabs, 'By character' selected by default", async () => {
    seedStore({ withInventory: ["ä"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    const tablist = screen.getByTestId("touch-mode-tabs");
    expect(tablist.getAttribute("role")).toBe("tablist");
    const charTab = screen.getByTestId("touch-mode-tab-character");
    const keyTab = screen.getByTestId("touch-mode-tab-key");
    expect(charTab.getAttribute("role")).toBe("tab");
    expect(keyTab.getAttribute("role")).toBe("tab");
    expect(charTab.getAttribute("aria-selected")).toBe("true");
    expect(keyTab.getAttribute("aria-selected")).toBe("false");
  });

  it("clicking the 'By key' tab switches to the editable schematic grid, labelled 'for editing', while the live preview is labelled 'for testing'; clicking back returns to the character walk", async () => {
    seedStore({ withInventory: ["ä"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    // Character mode's own per-char surface is showing.
    expect(screen.getByText("Touch mapping")).toBeTruthy();
    expect(screen.queryByTestId("touch-key-mode-back")).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-mode-tab-key"));
    });

    // Two visually/verbally distinct surfaces (FR-020h/FR-035): the grid
    // pane names itself "for editing"; the OSK preview pane (still rendered,
    // via the mocked OSKFrame) is now headed "for testing" — never the same
    // verb, never reading as two ways to do the same thing.
    expect(screen.getByTestId("touch-key-mode-back")).toBeTruthy();
    expect(screen.getByText(/for editing/i)).toBeTruthy();
    expect(screen.getByText(/for testing/i)).toBeTruthy();
    // The per-character surface is gone entirely, not just hidden alongside it.
    expect(screen.queryByText("Touch mapping")).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-mode-tab-character"));
    });
    expect(screen.getByText("Touch mapping")).toBeTruthy();
    expect(screen.queryByTestId("touch-key-mode-back")).toBeNull();
  });

  it("ArrowRight on the tablist moves AND selects the next tab (APG automatic activation)", async () => {
    seedStore({ withInventory: ["ä"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await act(async () => {
      fireEvent.keyDown(screen.getByTestId("touch-mode-tabs"), {
        key: "ArrowRight",
      });
    });

    expect(
      screen.getByTestId("touch-mode-tab-key").getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByTestId("touch-key-mode-back")).toBeTruthy();

    // End/Home wrap correctly too — Home from the key tab returns to character.
    await act(async () => {
      fireEvent.keyDown(screen.getByTestId("touch-mode-tabs"), {
        key: "Home",
      });
    });
    expect(
      screen
        .getByTestId("touch-mode-tab-character")
        .getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("switching modes twice loses nothing from the by-character draft (FR-036a/b spot check)", async () => {
    seedStore({ withInventory: ["中", "日"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    // Configure "中" via long-press K_A.
    await changeSelectMenu(
      screen.getByLabelText(/Host key for long-press/i),
      "K_A",
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Apply touch method for/i }),
    );
    await waitFor(() => {
      expect(
        useWorkingCopyStore.getState().touchDraft?.charTouchEntries,
      ).toHaveLength(1);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-mode-tab-key"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-mode-tab-character"));
    });

    // The character-mode draft survived the round trip untouched.
    expect(useWorkingCopyStore.getState().touchDraft?.charTouchEntries).toHaveLength(1);
  });
});

describe("TouchGallery — one shared, derived set of progress figures (T075, FR-036d)", () => {
  it("reports the same 'characters still unplaced' / 'keys with no letter' figures the propose gate reads, and both move together off ONE commit — they cannot independently disagree", async () => {
    seedKeyModeFixture({ inventory: ["ñ"], includeBrokenKey: true });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    expect(screen.getByTestId("touch-progress-unplaced").textContent).toBe(
      "1 character still unplaced",
    );
    expect(
      screen.getByTestId("touch-progress-no-output-keys").textContent,
    ).toBe("1 key with no letter");

    // A single store commit — via the key-edit overlay, the mechanism this
    // feature's key mode is built around — gives the broken key real output
    // for the exact unplaced character. If these were two independently
    // maintained counters, nothing would guarantee they'd both notice.
    await act(async () => {
      useWorkingCopyStore.getState().commitKeyEdit({
        address: "phone:default:T_broken",
        kind: "set",
        fields: { output: "ñ" },
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("touch-progress-unplaced").textContent).toBe(
        "0 characters still unplaced",
      );
    });
    expect(
      screen.getByTestId("touch-progress-no-output-keys").textContent,
    ).toBe("0 keys with no letter");
  });

  it("the figures are visible — and read the same values — in both modes", async () => {
    seedKeyModeFixture({ inventory: ["ñ"], includeBrokenKey: true });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    const beforeUnplaced = screen.getByTestId("touch-progress-unplaced").textContent;
    const beforeNoOutput = screen.getByTestId("touch-progress-no-output-keys").textContent;

    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-mode-tab-key"));
    });

    expect(screen.getByTestId("touch-progress-unplaced").textContent).toBe(
      beforeUnplaced,
    );
    expect(
      screen.getByTestId("touch-progress-no-output-keys").textContent,
    ).toBe(beforeNoOutput);
  });
});

// ---------------------------------------------------------------------------
// T120 (FR-036e) — "either mode MUST be able to complete the step". Three
// distinct claims, each asserted rather than argued:
//
//   1. Completing from the KEY pane works at all — the Continue control there
//      routes into the same gate and calls onComplete.
//   2. That gate is coverage-only and mode-blind: it audits the OVERLAY-FOLDED
//      layout, so a coverage gap the author fixed with a key edit counts. This
//      is the regression that matters: gating on the unfolded layout would
//      refuse a keyboard the key view already shows as complete, i.e. force a
//      mode switch to move on.
//   3. When it refuses, it says so IN THE PANE THE AUTHOR PRESSED — a gate that
//      only explains itself in the other view is a mode switch by another name.
// ---------------------------------------------------------------------------

describe("TouchGallery — either mode completes the step (T120, FR-036e)", () => {
  it("Continue in the KEY pane completes the step when coverage passes", async () => {
    seedKeyModeFixture({ inventory: ["a"], includeBrokenKey: false, coveringCharKey: "a" });
    const onComplete = vi.fn();
    await act(async () => {
      render(<TouchGallery onComplete={onComplete} onBack={vi.fn()} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-mode-tab-key"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-key-mode-continue"));
    });

    // No mode switch was required, and nothing about which view was active
    // entered the decision.
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("credits a coverage gap fixed through the key-edit OVERLAY — the gate audits the folded layout, not the unfolded one", async () => {
    // "ñ" is unreachable on the shipped layout: T_broken types nothing.
    seedKeyModeFixture({ inventory: ["ñ"], includeBrokenKey: true });
    const onComplete = vi.fn();
    await act(async () => {
      render(<TouchGallery onComplete={onComplete} onBack={vi.fn()} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-mode-tab-key"));
    });

    // Before the fix, the gate refuses — from the key pane.
    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-key-mode-continue"));
    });
    expect(onComplete).not.toHaveBeenCalled();

    // The author fixes it the by-key way: one overlay commit gives the broken
    // key real output. The overlay is the ONLY place several key commands write
    // (useKeyCommands' add/remove/suppress), so this is exactly the work a gate
    // reading the unfolded layout would fail to see.
    await act(async () => {
      useWorkingCopyStore.getState().commitKeyEdit({
        address: "phone:default:T_broken",
        kind: "set",
        fields: { output: "ñ" },
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId("touch-progress-unplaced").textContent).toBe(
        "0 characters still unplaced",
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-key-mode-continue"));
    });

    // Completed from the key pane, on by-key work alone — never sent back to
    // the character walk to re-do it there.
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("states its refusal inside the key pane, naming the uncovered character", async () => {
    seedKeyModeFixture({ inventory: ["ñ"], includeBrokenKey: true });
    const onComplete = vi.fn();
    await act(async () => {
      render(<TouchGallery onComplete={onComplete} onBack={vi.fn()} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-mode-tab-key"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-key-mode-continue"));
    });

    expect(onComplete).not.toHaveBeenCalled();
    // The character-mode pane is not rendered at all in key mode (see the
    // T072 view-swap test), so an alert found here is the key pane's own.
    const alerts = screen.getAllByRole("alert");
    const text = alerts.map((a) => a.textContent ?? "").join(" ");
    expect(text).toContain("has no touch mechanism");
    expect(text).toContain("ñ");
  });

  it("does not clear either in-progress surface on completion — the by-character draft is emitted and the key-edit overlay survives", async () => {
    seedKeyModeFixture({ inventory: ["a"], includeBrokenKey: true, coveringCharKey: "a" });
    const onComplete = vi.fn();
    await act(async () => {
      render(<TouchGallery onComplete={onComplete} onBack={vi.fn()} />);
    });

    await act(async () => {
      useWorkingCopyStore.getState().commitKeyEdit({
        address: "phone:default:T_broken",
        kind: "set",
        fields: { text: "x" },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-mode-tab-key"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-key-mode-continue"));
    });

    expect(onComplete).toHaveBeenCalledOnce();
    // "neither is silently discarded": the overlay is still there after the
    // step completes. Dropping it here is precisely the tidy-up someone adds
    // later, and it would throw away the author's by-key work.
    expect(useWorkingCopyStore.getState().keyEditOverlay.ops).toHaveLength(1);
  });
});

describe("TouchGallery — undo affordance states what it will undo (T076, FR-036g)", () => {
  it("reads 'Nothing to undo' and is disabled when the shared stack is empty", async () => {
    seedStore({ withInventory: ["ä"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    const undoBtn = screen.getByTestId(
      "touch-undo-button",
    ) as HTMLButtonElement;
    expect(undoBtn.disabled).toBe(true);
    expect(undoBtn.getAttribute("aria-label")).toBe("Nothing to undo");
  });

  it("names a deleted touch method (character-mode work) when that is the top of the stack", async () => {
    seedStore({ withInventory: ["ä"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await act(async () => {
      useWorkingCopyStore
        .getState()
        .deleteTouchKey("phone:default:K_A");
    });

    await waitFor(() => {
      const undoBtn = screen.getByTestId(
        "touch-undo-button",
      ) as HTMLButtonElement;
      expect(undoBtn.disabled).toBe(false);
      expect(undoBtn.getAttribute("aria-label")).toContain("K_A");
    });
  });

  it("names the key edit (key-mode work) instead, once that becomes the top of the stack after a mode switch — a silent cross-mode undo would read as a defect", async () => {
    seedStore({ withInventory: ["ä"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await act(async () => {
      useWorkingCopyStore.getState().deleteTouchKey("phone:default:K_A");
    });
    await waitFor(() => {
      expect(
        screen.getByTestId("touch-undo-button").getAttribute("aria-label"),
      ).toContain("K_A");
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-mode-tab-key"));
    });
    await act(async () => {
      useWorkingCopyStore.getState().commitKeyEdit({
        address: "phone:default:K_B",
        kind: "suppress",
        spClass: 9,
        sentinelId: "T_none",
      });
    });

    await waitFor(() => {
      const label = screen
        .getByTestId("touch-undo-button")
        .getAttribute("aria-label");
      expect(label).toContain("K_B");
      expect(label).not.toContain("K_A");
    });
  });

  it("clicking Undo pops the shared stack via the store's existing undoDelete", async () => {
    seedStore({ withInventory: ["ä"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await act(async () => {
      useWorkingCopyStore.getState().deleteTouchKey("phone:default:K_A");
    });
    await waitFor(() => {
      expect(useWorkingCopyStore.getState().undoStack).toHaveLength(1);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-undo-button"));
    });

    expect(useWorkingCopyStore.getState().undoStack).toHaveLength(0);
    expect(useWorkingCopyStore.getState().isTouchKeyDeleted("phone:default:K_A")).toBe(false);
  });
});

describe("describeUndoTarget — pure structural description of the undo stack's top entry (T076)", () => {
  it("returns null for an empty stack", () => {
    expect(describeUndoTarget(undefined, [])).toBeNull();
  });

  it("describes a node deletion", () => {
    expect(describeUndoTarget({ k: "n", id: "node-1" }, [])).toEqual({
      kind: "node",
      id: "node-1",
    });
  });

  it("describes an item deletion", () => {
    expect(describeUndoTarget({ k: "i", id: "item-1" }, [])).toEqual({
      kind: "item",
      id: "item-1",
    });
  });

  it("describes a batch cascade by its total count", () => {
    expect(
      describeUndoTarget(
        { k: "batch", nodeIds: ["n1", "n2"], itemIds: ["i1"] },
        [],
      ),
    ).toEqual({ kind: "batch", count: 3 });
  });

  it("describes a touch-method deletion by its parsed key id", () => {
    expect(
      describeUndoTarget({ k: "t", id: "phone:default:K_A" }, []),
    ).toEqual({ kind: "touchKey", keyId: "K_A" });
  });

  it("describes a key edit by looking up the matching op via seq, naming its kind and key id", () => {
    const ops = [
      { seq: 0, address: "phone:default:K_A", kind: "suppress", spClass: 9 as const, sentinelId: "T_none" },
      { seq: 1, address: "phone:default:K_B", kind: "rename", toId: "K_C" },
    ];
    expect(describeUndoTarget({ k: "k", seq: 1 }, ops)).toEqual({
      kind: "keyEdit",
      keyId: "K_B",
      opKind: "rename",
    });
  });

  it("returns null for a 'k' entry whose op has already been evicted", () => {
    expect(describeUndoTarget({ k: "k", seq: 5 }, [])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Corpus longpress-host tie-breaker (placement-priors v2's PlacementMap.touch)
// —  fires ONLY when the NFD-decomposition path finds nothing; NFD stays
// authoritative. See touchCorpusFallbackHostKey in TouchGallery.tsx.
// ---------------------------------------------------------------------------

describe("TouchGallery — corpus longpress-host tie-breaker (placement-priors v2)", () => {
  it("fires a longpress suggestion for a plain, non-decomposable char with no desktop assignment, when placementMap.touch attests a host", async () => {
    // "中" has no Phase C desktop assignment, is not in the default touch
    // layout, and is not decomposable-accented — the NFD path finds nothing,
    // so today (no placementMap) it goes straight to the method chooser (see
    // the "custom host-key option" describe block above). With a
    // placementMap carrying a `touch` entry for its codepoint, the tie-
    // breaker now surfaces a longpress suggestion instead.
    seedStore({ withInventory: ["中"] });
    const placementMap: PlacementMap = {
      entries: [],
      touch: [
        {
          codepoint: toUPlusNotation("中"),
          hosts: [{ vkey: "K_A", layerClass: "default", priorCount: 3 }],
        },
      ],
    };
    await act(async () => {
      render(
        <TouchGallery onComplete={vi.fn()} onBack={vi.fn()} placementMap={placementMap} />,
      );
    });

    expect(screen.getByText(/Suggested: long-press/i)).toBeTruthy();
  });

  it("accepting the corpus tie-breaker suggestion records a longpress_alternates mechanism on the corpus-attested host", async () => {
    seedStore({ withInventory: ["中"] });
    const placementMap: PlacementMap = {
      entries: [],
      touch: [
        {
          codepoint: toUPlusNotation("中"),
          hosts: [{ vkey: "K_A", layerClass: "default", priorCount: 3 }],
        },
      ],
    };
    await act(async () => {
      render(
        <TouchGallery onComplete={vi.fn()} onBack={vi.fn()} placementMap={placementMap} />,
      );
    });

    const acceptBtn =
      screen.queryAllByRole("button").find((b) => b.textContent?.trim() === "Accept") ?? null;
    expect(acceptBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(acceptBtn!);
    });

    const draft = useWorkingCopyStore.getState().touchDraft;
    const entry = draft?.charTouchEntries.find(([c]) => c === "中");
    expect(entry?.[1]?.mechanisms.map((m) => m.patternId)).toEqual([
      "longpress_alternates",
    ]);
    expect(entry?.[1]?.mechanisms[0]?.slotValues?.["hostKey"]).toBe("K_A");
  });

  it("NFD stays authoritative: a decomposable-accented char ignores the corpus host and keeps its own NFD-derived host", async () => {
    // "ä" decomposes to base "a" -> K_A (see the FR-013 casing suite above).
    // A placementMap.touch entry offering a DIFFERENT host (K_Z) for the SAME
    // codepoint must be ignored — NFD wins whenever it resolves.
    seedStore({ withInventory: ["ä"] });
    const placementMap: PlacementMap = {
      entries: [],
      touch: [
        {
          codepoint: toUPlusNotation("ä"),
          hosts: [{ vkey: "K_Z", layerClass: "default", priorCount: 9 }],
        },
      ],
    };
    await act(async () => {
      render(
        <TouchGallery onComplete={vi.fn()} onBack={vi.fn()} placementMap={placementMap} />,
      );
    });

    expect(screen.getByText(/Suggested: long-press/i).textContent).toMatch(
      /long-press a to reach/i,
    );
    expect(screen.getByText(/Suggested: long-press/i).textContent).not.toMatch(
      /long-press z to reach/i,
    );
  });

  it("no suggestion when placementMap has no touch entry for the current codepoint", async () => {
    seedStore({ withInventory: ["中"] });
    const placementMap: PlacementMap = {
      entries: [],
      touch: [
        {
          codepoint: toUPlusNotation("x"),
          hosts: [{ vkey: "K_X", layerClass: "default", priorCount: 3 }],
        },
      ],
    };
    await act(async () => {
      render(
        <TouchGallery onComplete={vi.fn()} onBack={vi.fn()} placementMap={placementMap} />,
      );
    });

    expect(screen.queryByText(/Suggested: long-press/i)).toBeNull();
    // Falls through to the method chooser directly, same as no placementMap.
    expect(screen.queryByRole("button", { name: /host key/i })).not.toBeNull();
  });

  it("no suggestion when placementMap is absent (unchanged baseline behavior)", async () => {
    seedStore({ withInventory: ["中"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    expect(screen.queryByText(/Suggested: long-press/i)).toBeNull();
  });
});
