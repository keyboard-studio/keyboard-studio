// Unit tests for TouchGallery — navigation: Back, the character-scroll strip (badges, compose marker), and draft/position survival across remounts.
//
// Shared module mocks: ../../test/touchGallery/mocks.tsx. Seeders and the
// lifecycle hooks every suite installs: ../../test/touchGallery/harness.ts.

import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, act, waitFor, within } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { TouchGallery } from "./TouchGallery.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import type { MechanismAssignment } from "@keyboard-studio/contracts";
import { expectCurrentChar } from "../../test/currentCharChip.ts";
import { changeSelectMenu } from "../../test/selectMenuTestUtils.ts";
import { installTouchGalleryHooks, seedStore } from "../../test/touchGallery/harness.ts";

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
    // badge-bad color is now the --app-danger token (epic #533); jsdom does not
    // resolve custom properties, so assert the token reference itself.
    expect(badgeBefore.style.color).toBe("var(--app-danger)");

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
      expect(badgeAfter.style.color).toBe("var(--app-success-text)");
    });
  });
});

// ---------------------------------------------------------------------------
// Compose marker (CharScrollStrip Part 1, 3-signal count model) — integration
// coverage for the TOUCH modality specifically.
//
// MechanismGallery.charStrip.test.tsx already pins the compose marker's
// render-level contract (data-testid `char-scroll-badge-compose-<HEX>`) for the desktop/
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
