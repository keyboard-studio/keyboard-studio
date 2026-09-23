// Unit tests for TouchGallery — the method chooser and Existing methods: applying, deduping, host-key options, and the color model.
//
// Shared module mocks: ../../test/touchGallery/mocks.tsx. Seeders and the
// lifecycle hooks every suite installs: ../../test/touchGallery/harness.ts.

import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, act, waitFor, within } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { TouchGallery } from "./TouchGallery.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import type { MechanismAssignment } from "@keyboard-studio/contracts";
import { CUSTOM_KEY_OPTION_VALUE } from "../../lib/keyOptions.ts";
import { expectCurrentChar } from "../../test/currentCharChip.ts";
import { changeSelectMenu, selectMenuValue } from "../../test/selectMenuTestUtils.ts";
import { PATTERN_SEQUENCE } from "./patternIds.ts";
import {
  buildTouchLayoutJsonSpy,
  enumerateTouchMethodsForCharSpy,
  originalEnumerateTouchMethodsForCharRef,
} from "../../test/touchGallery/mocks.tsx";
import {
  installTouchGalleryHooks,
  seedStore,
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
// Apply lives in the open method card (mirrors MechanismGallery's
// CardApplyRow placement contract — see that file's own describe block of
// the same name). TouchCardApplyRow renders per-card, one of
// touch-apply-longpress / touch-apply-flick / touch-apply-multitap /
// touch-apply-replace, with no shared row below the chooser anymore.
// ---------------------------------------------------------------------------

describe("TouchGallery — Apply lives in the open method card", () => {
  it("puts Apply in the open (default longpress) card, and only there", async () => {
    // "中" has no suggestion, so the chooser opens directly at its default
    // method (longpress_alternates) — see the "no suggestion goes straight
    // to chooser" describe block above.
    seedStore({ withInventory: ["中"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    expect(screen.getByTestId("touch-apply-longpress")).toBeTruthy();
    expect(screen.queryByTestId("touch-apply-flick")).toBeNull();
    expect(screen.queryByTestId("touch-apply-multitap")).toBeNull();
    expect(screen.queryByTestId("touch-apply-replace")).toBeNull();

    // Exactly one — the reason for moving it off the shared row. A second
    // Apply anywhere on screen would reintroduce "which method does this
    // commit?".
    expect(
      screen.getAllByRole("button", { name: /Apply touch method for/i }),
    ).toHaveLength(1);
  });

  it("follows the author into whichever card they open", async () => {
    seedStore({ withInventory: ["中"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });
    expect(screen.getByTestId("touch-apply-longpress")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByText(/Swipe a key \(flick\)/i));
    });
    expect(screen.getByTestId("touch-apply-flick")).toBeTruthy();
    expect(screen.queryByTestId("touch-apply-longpress")).toBeNull();
    expect(
      screen.getAllByRole("button", { name: /Apply touch method for/i }),
    ).toHaveLength(1);

    await act(async () => {
      fireEvent.click(screen.getByText(/Tap multiple times \(multitap\)/i));
    });
    expect(screen.getByTestId("touch-apply-multitap")).toBeTruthy();
    expect(screen.queryByTestId("touch-apply-flick")).toBeNull();
    expect(
      screen.getAllByRole("button", { name: /Apply touch method for/i }),
    ).toHaveLength(1);

    await act(async () => {
      fireEvent.click(screen.getByText(/Replace a key/i));
    });
    expect(screen.getByTestId("touch-apply-replace")).toBeTruthy();
    expect(screen.queryByTestId("touch-apply-multitap")).toBeNull();
    expect(
      screen.getAllByRole("button", { name: /Apply touch method for/i }),
    ).toHaveLength(1);
  });

  it("keeps the touch-apply warnings banner rendered below the chooser, not duplicated per card", async () => {
    // Force a warning from the engine so applyTouchWarnings renders — mirrors
    // the "touch assignment could not be applied" banner's own coverage
    // elsewhere in this file, just asserting it survives the Apply-row move.
    buildTouchLayoutJsonSpy.mockImplementation(() => ({
      json: JSON.stringify({ formatVersion: "1.0", platforms: [] }),
      warnings: ["could not apply for K_Z"],
    }));
    seedStore({ withInventory: ["中"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    const hostKeySelect = screen.getByRole("button", { name: /host key/i });
    await changeSelectMenu(hostKeySelect, "K_A");

    const applyBtn = screen
      .getAllByRole("button", { name: /Apply touch method for/i })
      .find((b) => !b.hasAttribute("disabled"));
    expect(applyBtn).toBeTruthy();
    await act(async () => {
      fireEvent.click(applyBtn!);
    });

    expect(screen.getAllByText(/could not apply for K_Z/i)).toHaveLength(1);
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
    expect(row!.style.color).toBe("var(--app-success-text)");
    expect(row!.style.background).toBe("var(--app-success-bg)");
    // Static: a <span>, not a <button> — no delete affordance at all.
    expect(row!.tagName).toBe("SPAN");
    expect(
      screen.queryByRole("button", {
        name: /Remove existing touch method/i,
      }),
    ).toBeNull();
  });
});
