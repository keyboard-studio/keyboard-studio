// Unit tests for MechanismGallery — character scroll strip: strip navigation,
// usePositionalCharNav's not-found no-op, the producer badge, and the
// UsesSequencesCard integration.
//
// Shared module mocks, spies, and the lifecycle hooks every suite installs:
// ../../test/mechanismGallery/mocks.tsx. Seeders and IR fixtures:
// ../../test/mechanismGallery/harness.ts.

import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, act, waitFor, within, renderHook } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { MechanismGallery, PATTERN_SEQUENCE, PATTERN_DEADKEY, PATTERN_SWAP } from "./MechanismGallery.tsx";
import { usePositionalCharNav } from "./usePositionalCharNav.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { createVirtualFS, type MechanismAssignment } from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { expectCurrentChar } from "../../test/currentCharChip.ts";
import { installMechanismGalleryHooks } from "../../test/mechanismGallery/mocks.tsx";
import { seedInventory, mainGroup } from "../../test/mechanismGallery/harness.ts";

vi.mock("../../lib/services.ts", () => import("../../test/mechanismGallery/mocks.tsx"));
vi.mock("../../hooks/useKeyboardArtifact.ts", () => import("../../test/mechanismGallery/mocks.tsx"));
vi.mock("@keyboard-studio/engine", async (importOriginal) =>
  (await import("../../test/mechanismGallery/mocks.tsx")).withMockedEngine(
    await importOriginal<typeof import("@keyboard-studio/engine")>(),
  ),
);
vi.mock("../../components/OSKFrame.tsx", () => import("../../test/mechanismGallery/mocks.tsx"));

installMechanismGalleryHooks();

// The old "« Previous character" button (data-testid "mechanisms-prev-char")
// only ever stepped back exactly one position; it was replaced by
// CharScrollStrip (data-testid "char-scroll-strip"), which offers ONE chip
// per lettersToAdd character (data-testid "char-scroll-chip-<HEX>", where
// <HEX> is every codepoint of the grapheme, 4+-digit uppercase hex,
// hyphen-joined — see CharScrollStrip.tsx's file header) and lets the author
// jump to ANY of them, forward or backward, via handleSelectChar. These
// tests exercise that replacement contract directly rather than deleting the
// navigation coverage.
describe("MechanismGallery — character-scroll-strip navigation", () => {
  it("renders the char-scroll-strip with one chip per lettersToAdd character", async () => {
    seedInventory(["á", "é", "í"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    expect(screen.getByTestId("char-scroll-strip")).toBeTruthy();
    expect(screen.getByTestId("char-scroll-chip-00E1")).toBeTruthy();
    expect(screen.getByTestId("char-scroll-chip-00E9")).toBeTruthy();
    expect(screen.getByTestId("char-scroll-chip-00ED")).toBeTruthy();
  });

  it("orders a lowercase letter immediately before its uppercase counterpart, not in first-appearance order (spec 047 collateCompare reuse)", async () => {
    // Seeded UPPERCASE-first (the old first-appearance order the gallery
    // used to render in) — the collated display/walk order must not follow
    // it: "a" must render before "A", and "e" before "E".
    seedInventory(["A", "a", "E", "e"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
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

    // The Back/Next walk (usePositionalCharNav) reflects the same collated
    // order: mount lands on the first character in that order, "a".
    expectCurrentChar("a");
  });

  it("clicking an earlier character's chip moves back to it, ungated by intermediate implementation status", async () => {
    const onBack = vi.fn();
    seedInventory(["á", "é", "í"]);
    await act(async () => {
      render(
        <MechanismGallery selectedBaseKeyboard={basicKbdus} onBack={onBack} />,
      );
    });

    // Advance to "é" (idx 1) via Apply + Next — "í" stays untouched.
    expectCurrentChar("á");
    fireEvent.click(screen.getByRole("button", { name: /Apply method for á/i }));
    await waitFor(() => {
      const nextBtn = screen.getByRole("button", { name: /Next character/i });
      expect((nextBtn as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(nextBtn);
    });
    await waitFor(() => {
      expectCurrentChar("é");
    });

    // Click the chip for "á" (the earlier, already-implemented character)
    // while sitting on "é" — must jump straight back to it.
    fireEvent.click(screen.getByTestId("char-scroll-chip-00E1"));

    // Landed back on "á" (idx 0) — the phase was NOT exited.
    await waitFor(() => {
      expectCurrentChar("á");
    });
    expect(onBack).not.toHaveBeenCalled();
  });

  it("clicking a later character's chip moves forward to it too — the old prev-only button could never do this", async () => {
    seedInventory(["á", "é", "í"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    // Starting on "á" (idx 0) — jump straight to "í" (idx 2, the last
    // character), skipping over "é" entirely without visiting it.
    expectCurrentChar("á");
    fireEvent.click(screen.getByTestId("char-scroll-chip-00ED"));

    await waitFor(() => {
      expectCurrentChar("í");
    });
  });

  it("the char-scroll-strip stays rendered — and its chips stay clickable — when the desktop layout is locked", async () => {
    seedInventory(["á", "é", "í"]);
    await act(async () => {
      render(
        <MechanismGallery selectedBaseKeyboard={basicKbdus} onComplete={vi.fn()} />,
      );
    });
    expect(screen.getByTestId("char-scroll-strip")).toBeTruthy();

    act(() => {
      useWorkingCopyStore.getState().lockDesktop();
    });

    // Unlike the removed prev-char button (which disappeared entirely once
    // locked), the scroll strip is navigation, not editing — it must survive
    // the lock, and the locked-forward-escape button takes over the primary
    // forward slot alongside it (not in place of it).
    expect(screen.getByTestId("char-scroll-strip")).toBeTruthy();
    expect(screen.getByTestId("mechanisms-continue")).toBeTruthy();

    fireEvent.click(screen.getByTestId("char-scroll-chip-00ED"));
    await waitFor(() => {
      expectCurrentChar("í");
    });
  });
});

// ---------------------------------------------------------------------------
// usePositionalCharNav.handleSelectChar — not-found no-op (the branch the
// UI-level chip-click tests above can never reach, since CharScrollStrip
// only ever offers chips drawn from the SAME `list` handleSelectChar checks
// against). Exercised directly against the hook rather than through
// MechanismGallery/TouchGallery — there is no dedicated
// usePositionalCharNav.test.ts(x) file, so this lands beside the gallery
// suite that most directly depends on handleSelectChar's contract (the
// character-scroll-strip navigation tests immediately above).
// ---------------------------------------------------------------------------

describe("usePositionalCharNav — handleSelectChar not-found no-op", () => {
  it("leaves currentChar/currentIdx genuinely unchanged when called with a character not in `list`", () => {
    const list = ["á", "é", "í"] as const;
    let currentChar: string | null = "é";
    const setCurrentChar = vi.fn((c: string | null) => {
      currentChar = c;
    });

    const { result } = renderHook(() =>
      usePositionalCharNav({
        list,
        currentChar,
        setCurrentChar,
      }),
    );

    // Sitting on "é" (idx 1) before the no-op call.
    expect(result.current.currentIdx).toBe(1);

    act(() => {
      result.current.handleSelectChar("z"); // not present in `list`
    });

    // The guard (`if (!list.includes(char)) return;`) must fire BEFORE
    // setCurrentChar is invoked — asserting the setter was never called
    // (rather than merely re-checking currentIdx, which could stay 1 by
    // coincidence if setCurrentChar were called with the same value) is what
    // makes this fail if the not-found guard is ever removed or the
    // `!list.includes` check is inverted.
    expect(setCurrentChar).not.toHaveBeenCalled();
    // The external state this test's setter closure would have mutated is
    // still exactly what it started as — the selection genuinely did not move.
    expect(currentChar).toBe("é");
    expect(result.current.currentIdx).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Producer-count badge (CharScrollStrip Part 2) — integration coverage.
//
// CharScrollStrip.test.tsx already unit-tests the badge in isolation (a
// hand-built `assignments` prop). This closes the gap that isolation leaves:
// it proves the badge MechanismGallery actually renders is wired to THIS
// gallery's real store-backed `session.assignments` (via the same
// `sessionAssignments` prop the "apply (deadkey)" describe block above
// asserts against) and the "physical" modality — not a stray/constant array.
// A swapped `assignments` array or wrong `modality` at the
// MechanismGallery -> CharScrollStrip call site would slip past
// CharScrollStrip.test.tsx alone but must fail here.
// ---------------------------------------------------------------------------

describe("MechanismGallery — character-scroll-strip producer badge (integration)", () => {
  it("the current char's badge starts RED at 0, then GREEN at 1 after a real Apply records the assignment", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    const strip = screen.getByTestId("char-scroll-strip");
    const badgeBefore = within(strip).getByTestId("char-scroll-badge-00E1");
    expect(badgeBefore.textContent).toBe("0");
    // badge-bad/good colors are now the --app-danger/--app-success-text
    // tokens (epic #533); jsdom does not resolve custom properties, so assert
    // the token references themselves.
    expect(badgeBefore.style.color).toBe("var(--app-danger)");

    // "á" defaults to the pre-enabled deadkey method (§3c) — apply directly,
    // the same real Apply flow the "apply (deadkey)" describe block above
    // drives, so this test exercises the actual store write
    // (session.assignments), not a hand-built MechanismAssignment.
    fireEvent.click(screen.getByRole("button", { name: /Apply method for á/i }));

    await waitFor(() => {
      const badgeAfter = within(screen.getByTestId("char-scroll-strip")).getByTestId(
        "char-scroll-badge-00E1",
      );
      expect(badgeAfter.textContent).toBe("1");
      expect(badgeAfter.style.color).toBe("var(--app-success-text)");
    });
  });

  // Regression pin for the reported gap: the badge must reflect SESSION-
  // AWARE composability (useInventoryDiff's `producedSet`, augmented via
  // augmentWithComposable), not just the static base-only diff. Mirrors the
  // deadkey-byproduct fixture shape proven in
  // packages/studio/src/hooks/useInventoryDiff.test.ts's "session-aware
  // composability (symptom-2 fix)" suite and
  // packages/engine/src/pattern-apply/sessionProducedSet.test.ts, adapted to
  // the exact user-reported scenario: ezh U+0292 "ʒ" (this assignment's own
  // accented-form output) and combining caron U+030C "̌" (this SAME deadkey's
  // double-tap byproduct — never this assignment's own `target`) are each
  // produced by ONE session assignment, and the precomposed ezh-with-caron
  // "ǯ" U+01EF (whose canonical NFD is exactly ʒ + U+030C) has NO assignment
  // of its own — neither is in the base .kmn.
  //
  // A single assignment (rather than sessionProducedSet.test.ts's two-
  // assignment byproduct fixture) is deliberate here: this file's mocked
  // `getPatternByIdSync` (see the mock near the top of this file) resolves
  // PATTERN_DEADKEY to the `latinDeadkeyAcuteSingle` fixture, whose
  // kmnFragment hardcodes a single fixed deadkey-state name ("accent") with
  // no `{{deadkeyName}}` placeholder — unlike the real `deadkey_single_tap`
  // content pattern, two instances of it would collide on the same
  // `group(deadkeys)`/`deadkey(accent)` name. One assignment's own
  // baseLetters/accentedForms/accentChar list is enough to exercise the
  // byproduct path without that collision.
  it("a precomposed char composable from THIS SESSION's own assignments (ǯ from a session-produced ezh + that SAME deadkey's session-produced bare caron byproduct, neither in the base) shows a GREEN 1 badge — not a stale RED 0 — while staying in the walk", async () => {
    const seedVfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    ]);
    useWorkingCopyStore
      .getState()
      .instantiateFromBase(basicKbdus, { vfs: seedVfs, ir: makeTestIR([mainGroup()]) });

    // The base produces none of ʒ/̌/ǯ — every one of these is session-
    // introduced (or, for ǯ, only reachable by composing two that are).
    seedInventory(["ʒ", "̌", "ǯ"]);

    // One real deadkey assignment: its own accented-form output is "ʒ"
    // (base letter "z" + trigger), and its double-tap byproduct — the SAME
    // deadkey's `accentChar` — is the bare combining caron U+030C, never
    // this (or any) assignment's own `target`.
    const producesEzhAndCaronByproduct: MechanismAssignment = {
      scope: "individual",
      target: "ʒ",
      modality: "physical",
      mechanisms: [
        {
          patternId: PATTERN_DEADKEY,
          strategyId: "S-02",
          slotValues: {
            triggerKey: "K_QUOTE",
            baseLetters: "z",
            accentedForms: "ʒ",
            accentChar: "̌", // U+030C combining caron — this deadkey's double-tap byproduct
          },
        },
      ],
      source: "user",
    };

    useWorkingCopyStore.getState().recordPhase({
      phase: "C",
      answers: [],
      assignments: [producesEzhAndCaronByproduct],
    });

    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    const strip = screen.getByTestId("char-scroll-strip");

    // The bug: ǯ has no assignment of its own, so before this fix its badge
    // read straight from the STATIC base-only diff and stayed red 0 even
    // though ʒ + ̌ were both produced this session. After the fix it reads
    // from the session-aware, composable-augmented set and is green 1.
    const ezhCaronBadge = within(strip).getByTestId("char-scroll-badge-01EF");
    expect(ezhCaronBadge.textContent).toBe("1");
    expect(ezhCaronBadge.style.color).toBe("var(--app-success-text)"); // badge-good color (--app-success-text token, epic #533)

    // Walk MEMBERSHIP is untouched: ǯ carries no MechanismAssignment of its
    // own, so it must still be a real chip an author can navigate to — the
    // fix only recolors the badge, it never removes a composable char from
    // the strip/walk (the hard constraint this fix must not regress).
    fireEvent.click(within(strip).getByTestId("char-scroll-chip-01EF"));
    expectCurrentChar("ǯ");

    // Directly-produced ʒ badges green too (ordinary direct-assignment path,
    // unaffected by this fix) — sanity check the fixture actually wired a
    // real session assignment, not just inventory noise.
    const ezhBadge = within(strip).getByTestId("char-scroll-badge-0292");
    expect(ezhBadge.textContent).toBe("1");
  });

  // ---------------------------------------------------------------------------
  // Part 1 (3-signal count model) — case-table pins. Each reuses the same
  // deadkey-byproduct fixture shape as the test above (one PATTERN_DEADKEY
  // assignment whose accentedForms output is "ʒ" and whose double-tap
  // byproduct is the bare combining caron "̌") — the exact shape verified not
  // to collide inside applyAssignments' merge-by-group-name injection (see
  // that test's own doc comment for why a SECOND PATTERN_DEADKEY assignment
  // would collide on `group(deadkeys)`/`deadkey(accent)`; the own-key
  // assignment below deliberately uses PATTERN_SWAP instead so it can coexist
  // with the deadkey assignment in the same session).
  // ---------------------------------------------------------------------------

  it("a char reachable BOTH by its own key AND by composition (ǯ own-key + ʒ/caron session-composable) badges GREEN 2, with the compose marker present", async () => {
    const seedVfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    ]);
    useWorkingCopyStore
      .getState()
      .instantiateFromBase(basicKbdus, { vfs: seedVfs, ir: makeTestIR([mainGroup()]) });

    seedInventory(["ʒ", "̌", "ǯ"]);

    const producesEzhAndCaronByproduct: MechanismAssignment = {
      scope: "individual",
      target: "ʒ",
      modality: "physical",
      mechanisms: [
        {
          patternId: PATTERN_DEADKEY,
          strategyId: "S-02",
          slotValues: {
            triggerKey: "K_QUOTE",
            baseLetters: "z",
            accentedForms: "ʒ",
            accentChar: "̌",
          },
        },
      ],
      source: "user",
    };
    // ǯ's OWN key — deliberately PATTERN_SWAP (not a second PATTERN_DEADKEY,
    // which would collide with the assignment above inside applyAssignments'
    // merge-by-group-name injection — see this block's own header comment).
    // `getById`/`getPatternByIdSync` don't resolve PATTERN_SWAP in this
    // file's mocks, so it contributes a session-DIRECT mechanism (counted by
    // `directProducesCount`, which never resolves patterns) without being
    // baked into the re-parsed preview .kmn buildSessionProducedSet reads —
    // exactly what this test needs: ǯ's own-key count and its composability
    // (from the OTHER assignment) come from two independent signals.
    const ownKeyForZhCaron: MechanismAssignment = {
      scope: "individual",
      target: "ǯ",
      modality: "physical",
      mechanisms: [{ patternId: PATTERN_SWAP, slotValues: { kmnRules: "+ [K_9] > 'ǯ'" } }],
      source: "user",
    };

    useWorkingCopyStore.getState().recordPhase({
      phase: "C",
      answers: [],
      assignments: [producesEzhAndCaronByproduct, ownKeyForZhCaron],
    });

    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    const strip = screen.getByTestId("char-scroll-strip");
    const ezhCaronBadge = within(strip).getByTestId("char-scroll-badge-01EF");
    expect(ezhCaronBadge.textContent).toBe("2");
    expect(ezhCaronBadge.style.color).toBe("var(--app-success-text)"); // badge-good color (--app-success-text token, epic #533)

    // Compose marker present — ǯ IS composable (in addition to its own key).
    expect(
      within(strip).getByTestId("char-scroll-badge-compose-01EF"),
    ).toBeTruthy();
  });

  it("a character assigned to TWO independent keys (two individual-scope mechanisms, no composability) badges GREEN 2 with no compose marker", async () => {
    const seedVfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    ]);
    useWorkingCopyStore
      .getState()
      .instantiateFromBase(basicKbdus, { vfs: seedVfs, ir: makeTestIR([mainGroup()]) });

    // "ʒ" alone (no caron, no ǯ) — not NFD-decomposable, so composition can
    // never fire for it; this pins the "own-key-only" side of the case table
    // (a two-key char must read 2, not double-count into 3 or collapse to 1).
    seedInventory(["ʒ"]);

    const firstKey: MechanismAssignment = {
      scope: "individual",
      target: "ʒ",
      modality: "physical",
      mechanisms: [
        {
          patternId: PATTERN_DEADKEY,
          strategyId: "S-02",
          slotValues: { triggerKey: "K_QUOTE", baseLetters: "z", accentedForms: "ʒ" },
        },
      ],
      source: "user",
    };
    const secondKey: MechanismAssignment = {
      scope: "individual",
      target: "ʒ",
      modality: "physical",
      mechanisms: [{ patternId: PATTERN_SWAP, slotValues: { kmnRules: "+ [K_9] > 'ʒ'" } }],
      source: "user",
    };

    useWorkingCopyStore.getState().recordPhase({
      phase: "C",
      answers: [],
      assignments: [firstKey, secondKey],
    });

    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    const strip = screen.getByTestId("char-scroll-strip");
    const ezhBadge = within(strip).getByTestId("char-scroll-badge-0292");
    expect(ezhBadge.textContent).toBe("2");
    expect(ezhBadge.style.color).toBe("var(--app-success-text)"); // badge-good color (--app-success-text token, epic #533)
    expect(
      screen.queryByTestId("char-scroll-badge-compose-0292"),
    ).toBeNull();
  });

  it("the compose marker is present for a composable-only character (ǯ) and ABSENT for a plain own-key character (ʒ) in the SAME strip", async () => {
    const seedVfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    ]);
    useWorkingCopyStore
      .getState()
      .instantiateFromBase(basicKbdus, { vfs: seedVfs, ir: makeTestIR([mainGroup()]) });

    seedInventory(["ʒ", "̌", "ǯ"]);

    const producesEzhAndCaronByproduct: MechanismAssignment = {
      scope: "individual",
      target: "ʒ",
      modality: "physical",
      mechanisms: [
        {
          patternId: PATTERN_DEADKEY,
          strategyId: "S-02",
          slotValues: {
            triggerKey: "K_QUOTE",
            baseLetters: "z",
            accentedForms: "ʒ",
            accentChar: "̌",
          },
        },
      ],
      source: "user",
    };

    useWorkingCopyStore.getState().recordPhase({
      phase: "C",
      answers: [],
      assignments: [producesEzhAndCaronByproduct],
    });

    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    const strip = screen.getByTestId("char-scroll-strip");

    // ǯ: composable-only (no own-key assignment) — marker PRESENT.
    expect(
      within(strip).getByTestId("char-scroll-badge-compose-01EF"),
    ).toBeTruthy();
    expect(within(strip).getByTestId("char-scroll-badge-01EF").textContent).toBe("1");

    // ʒ: own-key only, not NFD-decomposable — marker ABSENT.
    expect(
      within(strip).queryByTestId("char-scroll-badge-compose-0292"),
    ).toBeNull();
    expect(within(strip).getByTestId("char-scroll-badge-0292").textContent).toBe("1");
  });
});

// ---------------------------------------------------------------------------
// UsesSequencesCard (Part 3) — integration coverage.
//
// UsesSequencesCard.tsx (packages/studio/src/editors/assignLoop/parts/) has
// its own render-level unit test exercising pure props in isolation. This
// closes the gap that leaves: it proves the card MechanismGallery actually
// renders is wired to THIS gallery's real store-backed `sessionAssignments`
// (recorded via the same `recordAssignments` store call the P1 coexistence
// suite above uses to simulate a Sequence-Gallery-recorded assignment) — not
// a hand-built prop or a constant. A swapped/empty assignments source at the
// MechanismGallery -> UsesSequencesCard call site would slip past a
// UsesSequencesCard-only unit test but must fail here.
//
// PRODUCES vs USES: the seeded assignment's own `target` ("ŋ", what the
// sequence PRODUCES) is deliberately a DIFFERENT character from currentChar
// ("n", the char under test) — "n" only appears as the sequence's
// `firstLetterOut` (an INPUT slot), never as the char it produces. This is
// exactly the produces-vs-uses distinction the card exists to surface.
// ---------------------------------------------------------------------------

describe("MechanismGallery — UsesSequencesCard (integration)", () => {
  it("renders the card with a row for a real recorded sequence that USES the current character as an input slot (not its produced char)", async () => {
    seedInventory(["n"]);
    useWorkingCopyStore.getState().recordAssignments([
      {
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
      },
    ]);

    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
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

  it("control: renders no uses-sequences-card for a character with no recorded using-sequence anywhere in the assignments", async () => {
    seedInventory(["x"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expectCurrentChar("x");
    expect(screen.queryByTestId("uses-sequences-card")).toBeNull();
  });
});
