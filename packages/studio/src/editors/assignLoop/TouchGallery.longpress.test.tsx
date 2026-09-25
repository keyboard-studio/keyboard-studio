// Unit tests for TouchGallery — longpress: the abugida/empty-hostkey auto-suggestion guard, the sibling-accent accelerator, and the corpus host tie-breaker.
//
// Shared module mocks: ../../test/touchGallery/mocks.tsx. Seeders and the
// lifecycle hooks every suite installs: ../../test/touchGallery/harness.ts.

import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, act } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { TouchGallery } from "./TouchGallery.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import type { MechanismAssignment, PlacementMap } from "@keyboard-studio/contracts";
import { toUPlusNotation } from "@keyboard-studio/contracts";
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
  // MechanismGallery.suggestions.test.tsx's identical guard ("renders the
  // suggestion row in the green family, not ERROR_RED/ERROR_BG") for the
  // sibling gallery — this card previously shipped with ERROR_RED text on an
  // ERROR_BG card (ambient "not yet implemented" styling) even though it is a
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
    // GREEN_CHIP_BG/BORDER/TEXT (epic #533) — the SAME shared green-chip
    // tokens MechanismGallery's own suggestion row and this file's
    // chip/Accept-button treatment already use (RemovableChipRow.tsx). Never
    // the danger palette. background/border are set as SHORTHAND properties
    // (ProposalCard.tsx), and jsdom does not decompose a `var(...)` shorthand
    // into its longhand -Color sub-properties, so assert the shorthand
    // strings themselves rather than .backgroundColor/.borderColor (which
    // read back empty here even though real browsers render fine).
    expect(card.style.background).toBe("var(--app-success-bg)");
    expect(card.style.border).toBe("1px solid var(--app-success)");
    expect(card.style.background).not.toBe("var(--app-danger-bg)");
    expect(card.style.border).not.toBe("1px solid var(--app-danger)");

    const suggestionText = screen.getByText(/Suggested: long-press/i);
    expect(suggestionText.style.color).toBe("var(--app-success-text)");
    expect(suggestionText.style.color).not.toBe("var(--app-danger)");
    // This message renders through the shared ProposalCard, whose <p> sets no
    // fontWeight — plain/normal weight is intentional here, matching every
    // other ProposalCard caller (e.g. this gallery's bulk-accent summary
    // box), not a regression from the old bespoke bold (600) treatment. jsdom
    // doesn't synthesize a computed "400" for an unset inline style (it
    // reports "" — verified above), so assert the empty-inline form rather
    // than a computed value jsdom never actually produces.
    expect(suggestionText.style.fontWeight).toBe("");
    expect(suggestionText.style.fontWeight).not.toBe("600");
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
