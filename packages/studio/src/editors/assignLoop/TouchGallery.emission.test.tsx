// Unit tests for TouchGallery — Phase E "touch mechanisms" assignment loop:
// the vfsTransform / touch-layout emission suites.
//
// Defect A regression guard:
//   - vfsTransform passed to useKeyboardArtifact contains a
//     .keyman-touch-layout entry that reflects the author's edits.
//   - Two successive distinct edits produce two DIFFERENT injected JSON strings
//     (guards against the frozen-preview defect where the transform was memoized
//     on [minimalTouchJson] and never updated when charTouch changed).
//
// Defect B regression is covered in StudioShell.test.tsx.
//
// Shared module mocks: ../../test/touchGallery/mocks.tsx. Seeders and the
// lifecycle hooks every suite installs: ../../test/touchGallery/harness.ts.

import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, act, waitFor } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { TouchGallery } from "./TouchGallery.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import type { MechanismAssignment } from "@keyboard-studio/contracts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { expectCurrentChar } from "../../test/currentCharChip.ts";
import { changeSelectMenu } from "../../test/selectMenuTestUtils.ts";
import { buildTouchLayoutJsonSpy } from "../../test/touchGallery/mocks.tsx";
import {
  installTouchGalleryHooks,
  seedStore,
  runTransform,
  seedWithDesktopAssignment,
} from "../../test/touchGallery/harness.ts";

vi.mock("../../hooks/useKeyboardArtifact.ts", () => import("../../test/touchGallery/mocks.tsx"));
vi.mock("../../lib/buildTouchLayoutJson.ts", async (importOriginal) =>
  (await import("../../test/touchGallery/mocks.tsx")).withMockedBuildTouchLayoutJson(
    await importOriginal<typeof import("../../lib/buildTouchLayoutJson.ts")>(),
  ),
);
vi.mock("@keyboard-studio/engine", async (importOriginal) =>
  (await import("../../test/touchGallery/mocks.tsx")).withMockedEngine(
    await importOriginal<typeof import("@keyboard-studio/engine")>(),
  ),
);
vi.mock("../../components/OSKFrame.tsx", () => import("../../test/touchGallery/mocks.tsx"));
vi.mock("../../components/OskModeToggle.tsx", () => import("../../test/touchGallery/mocks.tsx"));

installTouchGalleryHooks();

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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
    });

    // Fallback path taken: the gallery still renders the character card for
    // "a" instead of crashing.
    expectCurrentChar("a");
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});
