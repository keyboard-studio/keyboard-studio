// Unit tests for MechanismGallery — layers and modifiers: RAlt layer targeting
// (S-08), computeModifierPool gating, RAlt badge text, OSK and physical-key key
// selection, and CAPS-aware swaps.
//
// Shared module mocks, spies, and the lifecycle hooks every suite installs:
// ../../test/mechanismGallery/mocks.tsx. Seeders and IR fixtures:
// ../../test/mechanismGallery/harness.ts.

import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, act, waitFor } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { MechanismGallery } from "./MechanismGallery.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { createVirtualFS, type IRGroup } from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { changeSelectMenu, selectMenuValue, selectMenuOptionValues } from "../../test/selectMenuTestUtils.ts";
import { installMechanismGalleryHooks } from "../../test/mechanismGallery/mocks.tsx";
import { seedInventory, instantiateWorkingCopy, instantiateWithModifiersInUse } from "../../test/mechanismGallery/harness.ts";

vi.mock("../../lib/services.ts", () => import("../../test/mechanismGallery/mocks.tsx"));
vi.mock("../../hooks/useKeyboardArtifact.ts", () => import("../../test/mechanismGallery/mocks.tsx"));
vi.mock("@keyboard-studio/engine", async (importOriginal) =>
  (await import("../../test/mechanismGallery/mocks.tsx")).withMockedEngine(
    await importOriginal<typeof import("@keyboard-studio/engine")>(),
  ),
);
vi.mock("../../components/OSKFrame.tsx", () => import("../../test/mechanismGallery/mocks.tsx"));

installMechanismGalleryHooks();

// ---------------------------------------------------------------------------
// RAlt layer targeting (S-08) — Base/Shift plane choice
// ---------------------------------------------------------------------------

describe("MechanismGallery — RAlt layer targeting (S-08)", () => {
  it("emits a [ALT K_X] rule by default (unshifted plane, generic alt until chirality is in use)", async () => {
    instantiateWorkingCopy();
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_E");
    fireEvent.click(screen.getByRole("button", { name: /Apply method for ε/i }));

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.target).toBe("ε");
    expect(assignments[0]?.mechanisms[0]?.patternId).toBe("modifier_as_layer_switch");
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["altgrKeyList"]).toBe(
      "[ALT K_E]",
    );
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["altgrOutputList"]).toBe(
      "ε",
    );
  });

  it("emits a [SHIFT ALT K_X] rule when a second SHIFT layer is added", async () => {
    // The user is adding Ε (capital epsilon) via the shifted Alt plane of
    // K_E — Shift+Alt+E should produce Ε, not the unshifted Alt character.
    // Base slot defaults to generic ALT (no chiral alt in use); a second
    // dropdown is added and set to SHIFT.
    instantiateWorkingCopy();
    seedInventory(["Ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_E");
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    // Fallback path: with nothing in use, the second slot starts unselected
    // ("") — the author must pick before Apply. Locks in the else-branch of
    // handleAddRaltSlot's in-use default.
    const secondLayerSelect = screen.getByLabelText(
      /Layer 2 for layer-switch combo/i,
    ) as HTMLElement;
    expect(selectMenuValue(secondLayerSelect)).toBe("");
    await changeSelectMenu(secondLayerSelect, "SHIFT");
    fireEvent.click(screen.getByRole("button", { name: /Apply method for Ε/i }));

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.target).toBe("Ε");
    expect(assignments[0]?.mechanisms[0]?.patternId).toBe("modifier_as_layer_switch");
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["altgrKeyList"]).toBe(
      "[SHIFT ALT K_E]",
    );
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["altgrOutputList"]).toBe(
      "Ε",
    );
  });

  it("defaults the SECOND layer slot to SHIFT when Shift is already in use elsewhere in the working IR", async () => {
    // Slot 1 still defaults to the alt-family token (raltDefaultToken is
    // untouched by this change). The SECOND slot is what should now auto-fill
    // instead of starting unselected: seed SHIFT as already "in use" via an
    // unrelated K_W rule, then confirm the author never has to touch the
    // Layer 2 dropdown themselves for it to read SHIFT.
    instantiateWithModifiersInUse("K_W", ["SHIFT"]);
    seedInventory(["Ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_E");
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));

    // Pre-filled with SHIFT — no explicit changeSelectMenu call for slot 2.
    const secondLayerSelect = screen.getByLabelText(
      /Layer 2 for layer-switch combo/i,
    ) as HTMLElement;
    expect(selectMenuValue(secondLayerSelect)).toBe("SHIFT");

    fireEvent.click(screen.getByRole("button", { name: /Apply method for Ε/i }));

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["altgrKeyList"]).toBe(
      "[SHIFT ALT K_E]",
    );
  });

  it("never auto-fills the SECOND slot with CAPS, even when CAPS is the only in-use modifier", async () => {
    // CAPS is reported as "in use" by any keyboard with routine CAPS/NCAPS
    // case-handling rules, but it is a case/state modifier rather than a layer
    // — it must NOT auto-fill the second slot (that would surprise). It stays
    // selectable in the dropdown; the author picks it explicitly if they want.
    instantiateWithModifiersInUse("K_W", ["CAPS"]);
    seedInventory(["Ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_E");
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));

    const secondLayerSelect = screen.getByLabelText(
      /Layer 2 for layer-switch combo/i,
    ) as HTMLElement;
    // Not auto-filled with CAPS — stays unselected until the author picks.
    expect(selectMenuValue(secondLayerSelect)).toBe("");
    // ...but CAPS is still offered as an explicit choice.
    const optionValues = await selectMenuOptionValues(secondLayerSelect);
    expect(optionValues).toContain("CAPS");
  });

  it("unifies an author's Ctrl + (chiral) Alt pick to the generic [CTRL ALT K_E] (#defect: AltGr not working)", async () => {
    // The author picks slot 1 = Ctrl, slot 2 = an alt-family token — the
    // exact "Ctrl+Alt" selection reported as not working. A mixed
    // generic-ctrl + chiral-alt rule is kmcmplib-invalid
    // (KM_WARN_KMCMP_4202659) and can never be delivered by a real
    // keypress either. The picker must emit the all-generic, functional
    // [CTRL ALT K_X] rule instead.
    // LALT must already be "in use" for the pool to offer it under the new
    // gating rule (computeModifierPool).
    instantiateWithModifiersInUse("K_W", ["LALT"]);
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_E");
    await changeSelectMenu(screen.getByLabelText(/Layer 1 for layer-switch combo/i), "CTRL");
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Layer 2 for layer-switch combo/i), "LALT");
    fireEvent.click(screen.getByRole("button", { name: /Apply method for ε/i }));

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["altgrKeyList"]).toBe("[CTRL ALT K_E]");
  });

  it("unifies a Ctrl + RAlt + Caps pick to the generic [CTRL ALT CAPS K_E] (chirality unification — mixed generic+chiral is kmcmplib-invalid)", async () => {
    // Slot 1 must default to RALT for this scenario to actually exercise
    // chirality unification — under the new gating rule (computeModifierPool)
    // generic ALT is the default until a chiral alt token is already in use,
    // so seed RALT as already in use to get the RALT default here.
    instantiateWithModifiersInUse("K_W", ["RALT"]);
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_E");
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Layer 2 for layer-switch combo/i), "CTRL");
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Layer 3 for layer-switch combo/i), "CAPS");
    fireEvent.click(screen.getByRole("button", { name: /Apply method for ε/i }));

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["altgrKeyList"]).toBe(
      "[CTRL ALT CAPS K_E]",
    );
  });

  it("is not gated by mnemonic layout (unlike the S-01 Shift toggle)", async () => {
    // Adding SHIFT to the layer combo is orthogonal to &MNEMONICLAYOUT, which
    // only gates the S-01 Shift radio (shiftLayerAllowed) — the layer-combo
    // SHIFT option must stay selectable regardless.
    instantiateWorkingCopy({ mnemonic: true });
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    const secondLayerSelect = screen.getByLabelText(
      /Layer 2 for layer-switch combo/i,
    ) as HTMLButtonElement;
    expect(secondLayerSelect.disabled).toBe(false);
    await changeSelectMenu(secondLayerSelect, "SHIFT");
    expect(selectMenuValue(secondLayerSelect)).toBe("SHIFT");
  });

  it("excludes LALT from the next dropdown once RALT is chosen in an earlier slot", async () => {
    // LALT must already be "in use" for the pool to offer it at all under the
    // new gating rule (computeModifierPool) — seed it so this test still
    // exercises the exclusion (not just the gating) behavior.
    instantiateWithModifiersInUse("K_W", ["LALT"]);
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    // Slot 1 defaults to RALT; adding a second slot must not offer LALT
    // (or RALT again) — MODIFIER_EXCLUSIONS is self-inclusive + chiral.
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    const secondLayerSelect = screen.getByLabelText(
      /Layer 2 for layer-switch combo/i,
    ) as HTMLElement;
    const optionValues = await selectMenuOptionValues(secondLayerSelect);
    expect(optionValues).not.toContain("LALT");
    expect(optionValues).not.toContain("RALT");
  });

  it("excludes CAPS from the next dropdown once CAPS is chosen in an earlier slot, and never offers NCAPS at all", async () => {
    // NCAPS is not a distinct selectable S-08 layer (computeModifierPool
    // never includes it) — a rule with no caps token already matches
    // caps-off, so it must not appear in ANY slot's options, regardless of
    // what an earlier slot holds.
    instantiateWorkingCopy();
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    const firstLayerSelect = screen.getByLabelText(
      /Layer 1 for layer-switch combo/i,
    ) as HTMLElement;
    const firstOptionValues = await selectMenuOptionValues(firstLayerSelect);
    expect(firstOptionValues).not.toContain("NCAPS");

    await changeSelectMenu(firstLayerSelect, "CAPS");
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    const secondLayerSelect = screen.getByLabelText(
      /Layer 2 for layer-switch combo/i,
    ) as HTMLElement;
    const optionValues = await selectMenuOptionValues(secondLayerSelect);
    expect(optionValues).not.toContain("CAPS");
    expect(optionValues).not.toContain("NCAPS");
  });

  it("caps the layer combo at 4 dropdowns", async () => {
    instantiateWorkingCopy();
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Layer 2 for layer-switch combo/i), "CTRL");
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Layer 3 for layer-switch combo/i), "SHIFT");
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Layer 4 for layer-switch combo/i), "CAPS");

    expect(screen.queryByLabelText(/Layer 5 for layer-switch combo/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Add another layer/i })).toBeNull();
  });

  it("handleRemoveRaltSlot: removing a middle layer slot shifts later slots down and keeps their values", async () => {
    instantiateWorkingCopy();
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    // Slot 1 defaults to generic ALT (no chiral alt in use). Add slot 2
    // (CTRL) and slot 3 (SHIFT).
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Layer 2 for layer-switch combo/i), "CTRL");
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Layer 3 for layer-switch combo/i), "SHIFT");

    // Remove the middle slot (CTRL, index 1).
    fireEvent.click(screen.getByRole("button", { name: /Remove layer 2/i }));

    // Slot 3 is gone; slot 2 now holds what was slot 3's value (SHIFT) —
    // values are re-indexed by the removal, not reset to blank.
    expect(screen.queryByLabelText(/Layer 3 for layer-switch combo/i)).toBeNull();
    const layer2 = screen.getByLabelText(/Layer 2 for layer-switch combo/i) as HTMLElement;
    expect(selectMenuValue(layer2)).toBe("SHIFT");

    // Applying still produces a valid, canonically-ordered combo from the
    // remaining (ALT, SHIFT) slots — the removed CTRL is gone entirely.
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_E");
    fireEvent.click(screen.getByRole("button", { name: /Apply method for ε/i }));

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["altgrKeyList"]).toBe(
      "[SHIFT ALT K_E]",
    );
  });

  it("hides the Add-layer button until every rendered dropdown has a selection", async () => {
    instantiateWorkingCopy();
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    // Zero-layer starting state already shows the button (an empty combo is
    // vacuously "all filled").
    expect(screen.getByRole("button", { name: /Add another layer/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    // Slot 1 is pre-filled with the default alt-family token — the button
    // stays visible.
    expect(screen.getByRole("button", { name: /Add another layer/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    // Slot 2 starts unselected — the Add button must hide until it is filled.
    expect(screen.queryByRole("button", { name: /Add another layer/i })).toBeNull();

    await changeSelectMenu(screen.getByLabelText(/Layer 2 for layer-switch combo/i), "SHIFT");
    expect(screen.getByRole("button", { name: /Add another layer/i })).toBeTruthy();
  });

  it('shows "(in use)" on a modifier token already used elsewhere in the working IR', async () => {
    // A `main` group with a rule under [RALT K_W] puts RALT "in use".
    const group: IRGroup = {
      nodeId: "g-main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [
        {
          nodeId: "r-ralt-w",
          context: [{ kind: "vkey", name: "K_W", modifiers: ["RALT"] }],
          output: [{ kind: "char", value: "w" }],
        },
      ],
    };
    const seedVfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    ]);
    const ir = makeTestIR([group], []);
    useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs: seedVfs, ir });
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    const firstLayerSelect = screen.getByLabelText(
      /Layer 1 for layer-switch combo/i,
    ) as HTMLElement;
    fireEvent.click(firstLayerSelect);
    await waitFor(() => expect(firstLayerSelect.getAttribute("aria-expanded")).toBe("true"));
    // The open option list is portalled to document.body (SelectMenu), so it is
    // no longer a DOM descendant of the trigger's parent — query it via the open
    // listbox rather than the trigger's subtree.
    const raltOption = screen
      .getByRole("listbox")
      .querySelector('li[data-value="RALT"]');
    expect(raltOption?.textContent).toBe("RALT (in use)");
  });

  it("shows a desktop-only note when the combo includes CAPS", async () => {
    instantiateWorkingCopy();
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    const firstLayerSelect = screen.getByLabelText(
      /Layer 1 for layer-switch combo/i,
    ) as HTMLElement;
    await changeSelectMenu(firstLayerSelect, "CAPS");

    expect(screen.getByText(/desktop only/i)).toBeTruthy();
  });

  it("drops a now-invalid later pick when an earlier dropdown changes", async () => {
    instantiateWorkingCopy();
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    // Slot 1 starts at ALT (default); add slot 2 and pick CAPS (valid — CAPS
    // isn't excluded by ALT). Slot 1's own options are never constrained by
    // a LATER slot (options only cascade downward), so slot 1 can freely
    // switch to CAPS too — which then excludes slot 2's CAPS pick and must
    // drop it back to unselected.
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    const secondLayerSelect = screen.getByLabelText(
      /Layer 2 for layer-switch combo/i,
    ) as HTMLElement;
    await changeSelectMenu(secondLayerSelect, "CAPS");
    expect(selectMenuValue(secondLayerSelect)).toBe("CAPS");

    const firstLayerSelect = screen.getByLabelText(
      /Layer 1 for layer-switch combo/i,
    ) as HTMLElement;
    await changeSelectMenu(firstLayerSelect, "CAPS");

    expect(selectMenuValue(secondLayerSelect)).toBe("");
  });

  it("falls back to the default modifier pool (no crash) when workingIr is null but a base keyboard is selected", async () => {
    // No instantiateWorkingCopy() call — store.ir and store.baseIr both stay
    // null, so MechanismGallery's workingIr resolves to null even though
    // selectedBaseKeyboard is set. collectModifierTokensInUse must not be
    // called on a null IR; the pool must fall back to the documented
    // defaults (SHIFT/CTRL/ALT/CAPS — no RALT/LALT/LCTRL/RCTRL since nothing
    // is "in use" and neither family has surfaced its chiral options yet,
    // NCAPS is never offered) rather than crashing.
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    const firstLayerSelect = screen.getByLabelText(
      /Layer 1 for layer-switch combo/i,
    ) as HTMLElement;

    // Pre-filled with the default alt-family token (generic ALT).
    expect(selectMenuValue(firstLayerSelect)).toBe("ALT");

    const optionValues = (await selectMenuOptionValues(firstLayerSelect))
      .filter((v) => v !== "");
    expect(new Set(optionValues)).toEqual(
      new Set(["SHIFT", "CTRL", "ALT", "CAPS"]),
    );

    // Applying still works end to end against the fallback pool.
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_E");
    fireEvent.click(screen.getByRole("button", { name: /Apply method for ε/i }));

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["altgrKeyList"]).toBe("[ALT K_E]");
  });
});

// ---------------------------------------------------------------------------
// computeModifierPool — pool-gating scenarios (product rule: default to
// GENERIC ONLY for a family until the keyboard already uses a chiral L/R
// token for that family — at which point BOTH chiral options are offered
// and the generic is dropped. No always-on exception for AltGr (RALT);
// applies symmetrically to Alt and Ctrl.)
// ---------------------------------------------------------------------------

async function firstLayerOptionValues(): Promise<Set<string>> {
  fireEvent.click(screen.getByText(/Assign to a key/i));
  fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
  const firstLayerSelect = screen.getByLabelText(
    /Layer 1 for layer-switch combo/i,
  ) as HTMLElement;
  return new Set(
    (await selectMenuOptionValues(firstLayerSelect)).filter((v) => v !== ""),
  );
}

describe("MechanismGallery — computeModifierPool gating", () => {
  it("(i) no alt/ctrl in use: alt pool is [ALT] only (no RALT/LALT), ctrl pool is [CTRL] only (no LCTRL/RCTRL)", async () => {
    instantiateWorkingCopy();
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    const options = await firstLayerOptionValues();
    expect(options).toEqual(new Set(["SHIFT", "CTRL", "ALT", "CAPS"]));
  });

  it("(ii) RALT in use: alt pool becomes both chiral options [RALT,LALT] — generic ALT drops (CHANGE: RALT-in-use now also surfaces LALT)", async () => {
    instantiateWithModifiersInUse("K_W", ["RALT"]);
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    const options = await firstLayerOptionValues();
    expect(options).toEqual(new Set(["SHIFT", "CTRL", "RALT", "LALT", "CAPS"]));
  });

  it("(iii) LALT in use: alt pool becomes both chiral options [RALT,LALT] — generic ALT drops", async () => {
    instantiateWithModifiersInUse("K_W", ["LALT"]);
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    const options = await firstLayerOptionValues();
    expect(options).toEqual(new Set(["SHIFT", "CTRL", "RALT", "LALT", "CAPS"]));
  });

  it("(iv) RCTRL in use: ctrl pool becomes both chiral options [LCTRL,RCTRL] — generic CTRL drops", async () => {
    instantiateWithModifiersInUse("K_W", ["RCTRL"]);
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    const options = await firstLayerOptionValues();
    expect(options).toEqual(
      new Set(["SHIFT", "LCTRL", "RCTRL", "ALT", "CAPS"]),
    );
  });

  it("(v) LCTRL in use: ctrl pool becomes both chiral options [LCTRL,RCTRL] — generic CTRL drops", async () => {
    instantiateWithModifiersInUse("K_W", ["LCTRL"]);
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    const options = await firstLayerOptionValues();
    expect(options).toEqual(
      new Set(["SHIFT", "LCTRL", "RCTRL", "ALT", "CAPS"]),
    );
  });

  it("(vi) generic ALT already in use (no chiral alt): alt pool stays generic-only [ALT] — a bare generic token in use does not trigger chiral options", async () => {
    instantiateWithModifiersInUse("K_W", ["ALT"]);
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    const options = await firstLayerOptionValues();
    expect(options).toEqual(new Set(["SHIFT", "CTRL", "ALT", "CAPS"]));
  });
});

// ---------------------------------------------------------------------------
// Covered-chip badge text — methodLabel render-level assertions (S-08 layers)
// ---------------------------------------------------------------------------

describe("MechanismGallery — covered-chip badge text for RAlt/Shift+RAlt (methodLabel)", () => {
  it('shows "RAlt: K_E" on the badge for an unshifted RAlt assignment', async () => {
    // RALT must already be "in use" for the pool (and therefore the slot-1
    // default) to lead with RALT rather than generic ALT — see
    // computeModifierPool's new generic-until-chiral-then-both gating rule.
    instantiateWithModifiersInUse("K_W", ["RALT"]);
    seedInventory(["ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_E");
    fireEvent.click(screen.getByRole("button", { name: /Apply method for ε/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Remove method RAlt: K_E for ε/i }),
      ).toBeTruthy();
    });
  });

  it('shows "Shift+RAlt: K_E" on the badge for a shifted RAlt assignment', async () => {
    // Seed RALT in use so slot 1 defaults to RALT rather than generic ALT
    // (computeModifierPool).
    instantiateWithModifiersInUse("K_W", ["RALT"]);
    seedInventory(["Ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_E");
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Layer 2 for layer-switch combo/i), "SHIFT");
    fireEvent.click(screen.getByRole("button", { name: /Apply method for Ε/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Remove method Shift\+RAlt: K_E for Ε/i }),
      ).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// OSK key-tap → base key selection while RAlt method + Shift+RAlt layer is
// active (handleKeyTap wiring, covers the keycap-mislabel fix's companion
// authoring path: picking the base key via the OSK rather than the dropdown).
// ---------------------------------------------------------------------------

describe("MechanismGallery — OSK key-tap selects the RAlt base key", () => {
  it("tapping the OSK sets the base key and Apply emits [SHIFT RALT <tappedKey>] when Shift+RAlt is selected", async () => {
    // Seed a chiral alt token as already in use (on a different key) so the
    // slot-1 default leads with RALT rather than generic ALT
    // (computeModifierPool's generic-until-chiral-then-both gating rule).
    instantiateWithModifiersInUse("K_W", ["RALT"]);
    seedInventory(["Ε"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
      // Flush the patterns-loading microtasks so GalleryPreviewWithPatterns
      // (and the mocked OSKFrame's tap button) mounts.
      await new Promise((r) => setTimeout(r, 0));
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Layer 2 for layer-switch combo/i), "SHIFT");

    // Tap the OSK mock (always taps "K_E") to pick the base key instead of
    // using the dropdown.
    fireEvent.click(screen.getByRole("button", { name: "tap-K_E" }));

    fireEvent.click(screen.getByRole("button", { name: /Apply method for Ε/i }));

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["altgrKeyList"]).toBe(
      "[SHIFT RALT K_E]",
    );
  });
});

// ---------------------------------------------------------------------------
// Physical-key type-to-select while a KeyPickerField dropdown is open
// (SelectMenu's opt-in resolveKeyToValue, wired by KeyPickerField via
// keyOptions.ts's charToVkey) — the physical-keyboard companion to the OSK
// tap-to-select coverage above.
// ---------------------------------------------------------------------------

describe("MechanismGallery — physical-key type-to-select in an open key picker", () => {
  it("pressing M while the Assign-to-a-key picker is open selects K_M and Apply uses it", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    const trigger = screen.getByLabelText(/Physical key for Assign to a key/i);
    fireEvent.click(trigger);
    await waitFor(() => expect(trigger.getAttribute("aria-expanded")).toBe("true"));

    // Physical keydown on the open listbox — not a click on an <li> option.
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "m" });

    expect(selectMenuValue(trigger)).toBe("K_M");
    expect(screen.queryByRole("listbox")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Apply method for á/i }));
    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["kmnRules"]).toBe(
      "+ [K_M] > U+00E1",
    );
  });

  it("a modifier-held keydown (Ctrl+M) is ignored — does not select K_M", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    const trigger = screen.getByLabelText(/Physical key for Assign to a key/i);
    fireEvent.click(trigger);
    await waitFor(() => expect(trigger.getAttribute("aria-expanded")).toBe("true"));

    fireEvent.keyDown(screen.getByRole("listbox"), { key: "m", ctrlKey: true });

    // Still open, still unselected — the keydown was ignored, not consumed.
    expect(screen.getByRole("listbox")).toBeDefined();
    expect(selectMenuValue(trigger)).toBe("");
  });

  it("a modifier-held keydown (Alt+M) is ignored — does not select K_M", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    const trigger = screen.getByLabelText(/Physical key for Assign to a key/i);
    fireEvent.click(trigger);
    await waitFor(() => expect(trigger.getAttribute("aria-expanded")).toBe("true"));

    fireEvent.keyDown(screen.getByRole("listbox"), { key: "m", altKey: true });

    // Still open, still unselected — the keydown was ignored, not consumed.
    expect(screen.getByRole("listbox")).toBeDefined();
    expect(selectMenuValue(trigger)).toBe("");
  });

  it("a modifier-held keydown (Meta+M) is ignored — does not select K_M", async () => {
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    const trigger = screen.getByLabelText(/Physical key for Assign to a key/i);
    fireEvent.click(trigger);
    await waitFor(() => expect(trigger.getAttribute("aria-expanded")).toBe("true"));

    fireEvent.keyDown(screen.getByRole("listbox"), { key: "m", metaKey: true });

    // Still open, still unselected — the keydown was ignored, not consumed.
    expect(screen.getByRole("listbox")).toBeDefined();
    expect(selectMenuValue(trigger)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// P0 — base-layer swap on a CAPS-handling key (scenario C/D)
// ---------------------------------------------------------------------------

describe("MechanismGallery — CAPS-aware base-layer swap (P0)", () => {
  it("scenario C: base swap only on a CAPS-handling key emits the NCAPS+CAPS pair", async () => {
    instantiateWorkingCopy({ caps: true });
    seedInventory(["θ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_Q");
    fireEvent.click(screen.getByRole("button", { name: /Apply method for θ/i }));

    // Decline the companion so only the base swap is recorded.
    fireEvent.click(
      screen.getByRole("button", { name: /Do not map Θ to the shift layer/i }),
    );

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["kmnRules"]).toBe(
      "+ [NCAPS K_Q] > U+03B8\n+ [CAPS K_Q] > U+03B8",
    );
  });

  it("scenario D: base swap + confirmed companion on a CAPS-handling key replaces the base assignment with the full quad", async () => {
    instantiateWorkingCopy({ caps: true });
    seedInventory(["θ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_Q");
    fireEvent.click(screen.getByRole("button", { name: /Apply method for θ/i }));

    fireEvent.click(
      screen.getByRole("button", { name: /Map Θ to the shift layer of the q key/i }),
    );

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    // The companion REPLACES the base assignment (one combined rule set) —
    // no separate second assignment, and no conflicting duplicate [CAPS K_Q].
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.target).toBe("θ");
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["kmnRules"]).toBe(
      [
        "+ [NCAPS K_Q] > U+03B8",
        "+ [NCAPS SHIFT K_Q] > U+0398",
        "+ [CAPS K_Q] > U+0398",
        "+ [CAPS SHIFT K_Q] > U+03B8",
      ].join("\n"),
    );
  });
});

// ---------------------------------------------------------------------------
// Bare-SHIFT layer combo (spec §10 Check #10 regression) — a combo whose
// ONLY modifier is SHIFT is the merged card's sole remaining route to the
// shift plane (the old Base/Shift radio is gone). Apply must route it
// through the SAME CAPS-aware builder (planShiftAssignment +
// buildShiftRuleLines) the 0-layer base path and the pre-merge Shift radio
// used — never the store-based S-08 write path, which never consults
// keyHasCapsHandling.
// ---------------------------------------------------------------------------

describe("MechanismGallery — bare-SHIFT layer combo is CAPS-aware (spec §10 Check #10)", () => {
  it("bare SHIFT layer on a plain key emits a simple_swap [SHIFT K_X] rule", async () => {
    instantiateWorkingCopy();
    seedInventory(["θ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_Q");
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Layer 1 for layer-switch combo/i), "SHIFT");
    fireEvent.click(screen.getByRole("button", { name: /Apply method for θ/i }));

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.target).toBe("θ");
    expect(assignments[0]?.mechanisms[0]?.patternId).toBe("simple_swap");
    expect(assignments[0]?.mechanisms[0]?.strategyId).toBe("S-01");
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["kmnRules"]).toBe(
      "+ [SHIFT K_Q] > U+03B8",
    );

    // Bare-SHIFT apply proposes no case-pair companion — mirrors the old
    // Shift radio, which only proposed a companion from the base-layer apply.
    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
  });

  it("bare SHIFT layer on a CAPS-handling key emits the NCAPS+CAPS sibling pair, not a bare rule", async () => {
    instantiateWorkingCopy({ caps: true });
    seedInventory(["θ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_Q");
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Layer 1 for layer-switch combo/i), "SHIFT");
    fireEvent.click(screen.getByRole("button", { name: /Apply method for θ/i }));

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.mechanisms[0]?.patternId).toBe("simple_swap");
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["kmnRules"]).toBe(
      "+ [NCAPS SHIFT K_Q] > U+03B8\n+ [CAPS SHIFT K_Q] > U+03B8",
    );
  });
});
