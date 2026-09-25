// Unit tests for TouchGallery — completion: coverage signals, the Done button, mark-for-later-review, the FR-008 gate, and the no-modal rule.
//
// Shared module mocks: ../../test/touchGallery/mocks.tsx. Seeders and the
// lifecycle hooks every suite installs: ../../test/touchGallery/harness.ts.

import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, act, waitFor, within } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { TouchGallery } from "./TouchGallery.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import type { MechanismAssignment } from "@keyboard-studio/contracts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
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
// No modal — replaces the old ConfirmDialog leave-warning contract
// (mechanism-gallery-progression; see MechanismGallery.progression.test.tsx's matching
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
