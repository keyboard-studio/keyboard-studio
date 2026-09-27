// Unit tests for TouchGallery — touch layers: buildTouchMechanismRef layer resolution, the layer BUILDER, the uppercase-current-char regression, and case-pair proposals on non-default layers.
//
// Shared module mocks: ../../test/touchGallery/mocks.tsx. Seeders and the
// lifecycle hooks every suite installs: ../../test/touchGallery/harness.ts.

import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, act } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { TouchGallery, buildTouchMechanismRef } from "./TouchGallery.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import type { IRGroup, IRRule } from "@keyboard-studio/contracts";
import { irGroup, makeTestIR, vkeyRule } from "@keyboard-studio/contracts/fixtures";
import {
  changeSelectMenu,
  selectMenuValue,
  selectMenuOptionValues,
} from "../../test/selectMenuTestUtils.ts";
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
    // character's case (spec 074 FR-006). "中" is caseless, so it lands on
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
  return vkeyRule({ nodeId: `rule:${vkey}:${modifiers.join(",") || "none"}`, vkey, modifiers, output });
}

function makeIrGroup(rules: IRRule[]): IRGroup {
  return irGroup({ nodeId: "group:main", rules });
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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
// default (spec 074 FR-006) must survive the layer picker: the picker's
// initial value for an uppercase current char is "shift", not "default", and
// applying on that default layer must not raise a redundant case-pair
// proposal (casePairTouchTarget(["SHIFT"], …) === null — there is no "more
// uppercase" layer to pair a SHIFT-bearing combo with). Closes the uppercase-path
// regression gap: the existing suite above only ever seeds a lowercase
// current char ("ä"/"θ"/"中").
// ---------------------------------------------------------------------------

describe("TouchGallery — uppercase current char (spec 074 FR-006 layer-picker regression)", () => {
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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
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
