// Unit tests for TouchGallery — the per-character suggestion card: gating, variants, suppression, and what Accept does.
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
import { buildTouchLayoutJsonSpy } from "../../test/touchGallery/mocks.tsx";
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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
// Stay on character after accepting a suggestion (regression 4, stay-on-char)
// ---------------------------------------------------------------------------

describe("TouchGallery — accepting a suggestion stays on the same character", () => {
  it("keeps the same character current after Accept, shows the chooser, and allows adding a second method", async () => {
    // "ä" is decomposable and not in the default layout → longpress suggestion.
    seedStore({ withInventory: ["ä"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
// Suggestion card — per-character desktop-derived suggestions
// ---------------------------------------------------------------------------


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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
    });

    expect(screen.queryByText(/Suggested: replace/i)).not.toBeNull();
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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
