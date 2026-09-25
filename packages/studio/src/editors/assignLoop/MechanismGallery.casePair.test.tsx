// Unit tests for MechanismGallery — case-pair companions: the companion proposal,
// its identity tracking and bcp47 plumbing, the shared case-pair affordance, the
// S-02/S-03 parallel-combo proposals, and the counterpart-already-placed
// suppression.
//
// Shared module mocks, spies, and the lifecycle hooks every suite installs:
// ../../test/mechanismGallery/mocks.tsx. Seeders and IR fixtures:
// ../../test/mechanismGallery/harness.ts.

import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, act, within } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { MechanismGallery, PATTERN_SEQUENCE, PATTERN_DEADKEY } from "./MechanismGallery.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { changeSelectMenu } from "../../test/selectMenuTestUtils.ts";
import { installMechanismGalleryHooks } from "../../test/mechanismGallery/mocks.tsx";
import { seedInventory, instantiateWorkingCopy, getPhaseCPhysicalAssignments } from "../../test/mechanismGallery/harness.ts";

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
// Case-pair companion proposal (propose-then-confirm, spec v1.3.1 §3c)
// ---------------------------------------------------------------------------

describe("MechanismGallery — case-pair companion proposal", () => {
  it("shows the companion prompt for θ and records Θ on the shift layer on confirm", async () => {
    instantiateWorkingCopy();
    seedInventory(["θ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_Q");
    fireEvent.click(screen.getByRole("button", { name: /Apply method for θ/i }));

    expect(screen.getByText(/has an uppercase form, Θ/i)).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: /Map Θ to the shift layer of the q key/i }),
    );

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments).toHaveLength(2);
    const companion = assignments.find((a) => a.target === "Θ");
    expect(companion).toBeDefined();
    expect(companion?.mechanisms[0]?.patternId).toBe("simple_swap");
    expect(companion?.mechanisms[0]?.slotValues?.["kmnRules"]).toBe(
      "+ [SHIFT K_Q] > U+0398",
    );

    // Prompt is dismissed after confirm.
    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
  });

  it("records nothing additional when the companion prompt is declined", async () => {
    instantiateWorkingCopy();
    seedInventory(["θ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_Q");
    fireEvent.click(screen.getByRole("button", { name: /Apply method for θ/i }));

    fireEvent.click(
      screen.getByRole("button", { name: /Do not map Θ to the shift layer/i }),
    );

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.target).toBe("θ");
    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
  });

  it("does not show the companion prompt for a caseless character", async () => {
    instantiateWorkingCopy();
    seedInventory(["ا"]); // Arabic alef — caseless (\p{Lo}), no case counterpart
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_Q");
    fireEvent.click(screen.getByRole("button", { name: /Apply method for ا/i }));

    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
  });

  it("does not show the companion prompt when the keyboard is mnemonic (shift unavailable)", async () => {
    instantiateWorkingCopy({ mnemonic: true });
    seedInventory(["θ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_Q");
    fireEvent.click(screen.getByRole("button", { name: /Apply method for θ/i }));

    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// P1/P2 regression — companion proposal tracked by assignment identity, not
// by re-matching target/scope, and invalidated when the base assignment it
// refers to is removed. Reproduces: swap-assign a caps-handling key (banner
// up) -> apply a SECOND, unrelated mechanism for the same char -> confirm
// must replace the ORIGINAL base swap, not the second mechanism, and must
// not leave two assignments emitting conflicting [CAPS K_Q] lines.
//
// NOTE: reads Phase C assignments directly (mirrors the component's own
// `sessionAssignments`, see the comment at its definition) rather than the
// store's merged `session.assignments` view — the merge is last-wins per
// (modality, scope, target) and would collapse the two coexisting θ
// mechanisms these tests need to distinguish.
// ---------------------------------------------------------------------------

describe("MechanismGallery — companion proposal identity tracking (P1/P2 regression)", () => {
  it("confirming the companion after a second mechanism was applied replaces only the original base swap", async () => {
    instantiateWorkingCopy({ caps: true });
    seedInventory(["θ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    // 1. Apply the base swap on the CAPS-handling key K_Q — raises the
    //    companion banner and records the NCAPS/CAPS base pair.
    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_Q");
    fireEvent.click(screen.getByRole("button", { name: /Apply method for θ/i }));
    expect(screen.getByText(/has an uppercase form, Θ/i)).toBeTruthy();

    // 2. Apply a SECOND, unrelated mechanism for the same char (θ) while the
    //    banner is still up — a layer-combo (default generic Alt, no chiral
    //    alt in use) assignment on a different key. The card is already
    //    selected/reset to "swap" with zero layers (resetMethodState ran
    //    after step 1's Apply) — adding a layer is what turns THIS Apply
    //    into the S-08 write path instead of a second simple_swap.
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_W");
    fireEvent.click(screen.getByRole("button", { name: /Apply method for θ/i }));

    // Banner must still be up — applying an unrelated mechanism does not
    // touch the pending companion proposal.
    expect(screen.getByText(/has an uppercase form, Θ/i)).toBeTruthy();

    // 3. Confirm the companion.
    fireEvent.click(
      screen.getByRole("button", { name: /Map Θ to the shift layer of the q key/i }),
    );

    const assignments = getPhaseCPhysicalAssignments();

    // Exactly two assignments survive: the RAlt mechanism (untouched) and the
    // combined CAPS-as-case-inverter quad (replacing the original base swap).
    // If Finding 1 regressed, the RAlt assignment would be the one replaced
    // (or a third, extra assignment would appear).
    expect(assignments).toHaveLength(2);

    const raltAssignment = assignments.find(
      (a) => a.mechanisms[0]?.patternId === "modifier_as_layer_switch",
    );
    expect(raltAssignment).toBeDefined();
    expect(raltAssignment?.target).toBe("θ");
    expect(raltAssignment?.mechanisms[0]?.slotValues?.["altgrKeyList"]).toBe(
      "[ALT K_W]",
    );

    const quadAssignment = assignments.find(
      (a) => a.mechanisms[0]?.patternId === "simple_swap",
    );
    expect(quadAssignment).toBeDefined();
    expect(quadAssignment?.target).toBe("θ");
    expect(quadAssignment?.mechanisms[0]?.slotValues?.["kmnRules"]).toBe(
      [
        "+ [NCAPS K_Q] > U+03B8",
        "+ [NCAPS SHIFT K_Q] > U+0398",
        "+ [CAPS K_Q] > U+0398",
        "+ [CAPS SHIFT K_Q] > U+03B8",
      ].join("\n"),
    );

    // No two recorded assignments emit conflicting [CAPS K_Q] lines — exactly
    // one assignment's kmnRules mentions "[CAPS K_Q]" at all (the quad).
    const withConflictingCapsLine = assignments.filter((a) =>
      (a.mechanisms[0]?.slotValues?.["kmnRules"] ?? "").includes("[CAPS K_Q]"),
    );
    expect(withConflictingCapsLine).toHaveLength(1);
  });

  it("removing the base swap while the banner is up dismisses the companion proposal", async () => {
    instantiateWorkingCopy({ caps: true });
    seedInventory(["θ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_Q");
    fireEvent.click(screen.getByRole("button", { name: /Apply method for θ/i }));
    expect(screen.getByText(/has an uppercase form, Θ/i)).toBeTruthy();

    // Remove the just-applied base swap via its per-method badge.
    const removeBadge = screen.getByRole("button", { name: /^Remove method/i });
    fireEvent.click(removeBadge);

    // The companion banner must be gone — a dead proposal is not offered.
    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Map Θ to the shift layer/i }),
    ).toBeNull();

    expect(getPhaseCPhysicalAssignments()).toHaveLength(0);
  });

  it("stale-guard: confirming a companion whose base assignment vanished via an unaudited mutation path records nothing", async () => {
    instantiateWorkingCopy({ caps: true });
    seedInventory(["θ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_Q");
    fireEvent.click(screen.getByRole("button", { name: /Apply method for θ/i }));
    expect(screen.getByText(/has an uppercase form, Θ/i)).toBeTruthy();

    // Simulate a hypothetical future mutation path that touches
    // sessionAssignments WITHOUT going through handleRemoveCovered /
    // handleRemoveMechanism (which proactively dismiss the banner) — direct
    // store mutation bypassing the component's own handlers entirely. The
    // component's pendingCompanion state is untouched by this, so the banner
    // remains visible in the DOM, exercising the confirm-time staleness
    // re-check (handleCompanionConfirm) rather than the removal-time
    // dismissal.
    await act(async () => {
      useWorkingCopyStore.getState().recordAssignments([]);
    });
    expect(screen.getByText(/has an uppercase form, Θ/i)).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: /Map Θ to the shift layer of the q key/i }),
    );

    // Nothing was recorded — the stale proposal was dismissed, not applied.
    expect(getPhaseCPhysicalAssignments()).toHaveLength(0);
    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// P1.5 — bcp47 plumbing for the case-pair companion proposal
// ---------------------------------------------------------------------------

describe("MechanismGallery — companion proposal bcp47 plumbing", () => {
  it("proposes İ (U+0130) for 'i' under the 'tr' identity bcp47 tag", async () => {
    instantiateWorkingCopy();
    // instantiateFromBase resets identity to null — set it explicitly.
    useWorkingCopyStore.getState().setIdentity({ bcp47: "tr" });
    seedInventory(["i"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_Q");
    fireEvent.click(screen.getByRole("button", { name: /Apply method for i/i }));

    expect(screen.getByText(/has an uppercase form, İ/i)).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: /Map İ to the shift layer of the q key/i }),
    );

    const companion = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical")
      .find((a) => a.target === "İ");
    expect(companion?.mechanisms[0]?.slotValues?.["kmnRules"]).toBe(
      "+ [SHIFT K_Q] > U+0130",
    );
  });

  it("does not crash on a malformed identity bcp47 tag — the companion still proposes via the locale-insensitive fallback", async () => {
    instantiateWorkingCopy();
    useWorkingCopyStore.getState().setIdentity({ bcp47: "not a tag!!" });
    seedInventory(["θ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_Q");
    expect(() => {
      fireEvent.click(screen.getByRole("button", { name: /Apply method for θ/i }));
    }).not.toThrow();

    expect(screen.getByText(/has an uppercase form, Θ/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Spec 074 — the case-pair proposal now comes from the SHARED hook + banner
// (useCasePairCompanion / CasePairProposalBanner). The existing companion
// cases above are the behaviour-preservation gate (SC-005); these two pin the
// contract's identity surface that the extraction makes load-bearing.
// ---------------------------------------------------------------------------

describe("MechanismGallery — shared case-pair affordance (spec 074)", () => {
  it("renders the proposal through the shared banner's role/aria-label contract (FR-011)", async () => {
    instantiateWorkingCopy();
    seedInventory(["θ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_Q");
    fireEvent.click(screen.getByRole("button", { name: /Apply method for θ/i }));

    const banner = screen.getByRole("note", {
      name: /Case-pair companion proposal/i,
    });
    expect(banner).toBeTruthy();
    // Exactly two controls, Confirm and Dismiss — no third button, no
    // "apply to all" (bulk actions are out of scope).
    expect(within(banner).getAllByRole("button")).toHaveLength(2);
  });

  it("confirming applies to the RAISING swap when the same character carries two swap assignments (FR-008)", async () => {
    instantiateWorkingCopy();
    seedInventory(["θ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    // 1. First swap on K_Q — raises a proposal for K_Q.
    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_Q");
    fireEvent.click(screen.getByRole("button", { name: /Apply method for θ/i }));
    expect(
      screen.getByRole("button", { name: /Map Θ to the shift layer of the q key/i }),
    ).toBeTruthy();

    // 2. Second swap for the SAME character on K_W — at most one proposal is
    //    pending, so this replaces the first.
    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_W");
    fireEvent.click(screen.getByRole("button", { name: /Apply method for θ/i }));

    // 3. Confirm — must pair with K_W (the raising placement), not K_Q. An
    //    index/target scan would grab the first θ assignment and emit K_Q.
    fireEvent.click(
      screen.getByRole("button", { name: /Map Θ to the shift layer of the w key/i }),
    );

    const assignments = getPhaseCPhysicalAssignments();
    const companion = assignments.find((a) => a.target === "Θ");
    expect(companion?.mechanisms[0]?.slotValues?.["kmnRules"]).toBe(
      "+ [SHIFT K_W] > U+0398",
    );
    // Both base swaps survive untouched (non-CAPS key → append, not replace).
    expect(assignments.filter((a) => a.target === "θ")).toHaveLength(2);
  });

  // "Stale base removed before confirm records nothing" is already pinned by
  // the two shipping cases above — "removing the base swap while the banner is
  // up dismisses the companion proposal" (the gallery's own removal paths
  // dismiss proactively) and "stale-guard: confirming a companion whose base
  // assignment vanished via an unaudited mutation path records nothing" (the
  // confirm-time backstop). Both still pass unedited after the extraction, so
  // they are not restated here.
});

// ---------------------------------------------------------------------------
// Spec 074 US2 — S-02 parallel combo (uppercase base letter -> uppercase output)
//
// The case-shifted elements are the BASE LETTER and the OUTPUT. The trigger
// key, its deadkey name, and the accent character are carried across
// unchanged: a dead key is an accent selector, not a letter.
// ---------------------------------------------------------------------------

describe("MechanismGallery — S-02 parallel-combo proposal (spec 074 US2)", () => {
  it("a dead-key apply producing a lowercase accented letter raises a proposal", async () => {
    instantiateWorkingCopy();
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    // "á" defaults to the pre-enabled deadkey method (§3c).
    fireEvent.click(screen.getByRole("button", { name: /Apply method for á/i }));

    expect(screen.getByText(/has an uppercase form, Á/i)).toBeTruthy();
  });

  it("confirming records a parallel deadkey ref: trigger unchanged, base letter and output case-shifted", async () => {
    instantiateWorkingCopy();
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByRole("button", { name: /Apply method for á/i }));

    const source = getPhaseCPhysicalAssignments().find((a) => a.target === "á");
    const sourceSlots = source?.mechanisms[0]?.slotValues ?? {};

    fireEvent.click(
      screen.getByRole("button", { name: /Map Á to the shift layer of/i }),
    );

    const companion = getPhaseCPhysicalAssignments().find(
      (a) => a.target === "Á",
    );
    expect(companion?.mechanisms[0]?.patternId).toBe(PATTERN_DEADKEY);
    expect(companion?.mechanisms[0]?.strategyId).toBe("S-02");

    const slots = companion?.mechanisms[0]?.slotValues ?? {};
    // Unchanged across the pair.
    expect(slots["triggerKey"]).toBe(sourceSlots["triggerKey"]);
    expect(slots["deadkeyName"]).toBe(sourceSlots["deadkeyName"]);
    expect(slots["accentChar"]).toBe(sourceSlots["accentChar"]);
    // Case-shifted.
    expect(sourceSlots["baseLetters"]).toBe("a");
    expect(slots["baseLetters"]).toBe("A");
    expect(slots["accentedForms"]).toBe("Á");

    // The source combo survives untouched.
    expect(
      getPhaseCPhysicalAssignments().find((a) => a.target === "á"),
    ).toBeDefined();
  });

  it("dismissing the S-02 proposal records nothing", async () => {
    instantiateWorkingCopy();
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByRole("button", { name: /Apply method for á/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /Do not map Á to the shift layer/i }),
    );

    const assignments = getPhaseCPhysicalAssignments();
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.target).toBe("á");
    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
  });

  it("a caseless output raises no S-02 proposal", async () => {
    instantiateWorkingCopy();
    // Arabic alef with hamza below — caseless, so no confident capital.
    seedInventory(["إ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    fireEvent.click(screen.getByRole("button", { name: /Apply method for إ/i }));

    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
  });

  it("stale-guard: confirming a parallel-combo proposal whose raising deadkey assignment vanished via an unaudited mutation path records nothing", async () => {
    instantiateWorkingCopy();
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    // "á" defaults to the pre-enabled deadkey method (§3c) — apply directly.
    fireEvent.click(screen.getByRole("button", { name: /Apply method for á/i }));
    expect(screen.getByText(/has an uppercase form, Á/i)).toBeTruthy();

    // Simulate a hypothetical future mutation path that removes the raising
    // deadkey assignment WITHOUT going through the gallery's own removal
    // handlers (which proactively dismiss the banner) — direct store
    // mutation bypassing the component's handlers entirely, the same
    // technique the physical stale-guard test above uses. The component's
    // pendingCompanion state is untouched by this, so the banner remains
    // visible in the DOM, exercising confirmComboCompanion's confirm-time
    // staleness re-check (`sessionAssignments.includes(proposal.baseAssignment)`)
    // rather than any removal-time dismissal.
    await act(async () => {
      useWorkingCopyStore.getState().recordAssignments([]);
    });
    expect(screen.getByText(/has an uppercase form, Á/i)).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: /Map Á to the shift layer of/i }),
    );

    // Nothing was recorded for the counterpart — the stale proposal was
    // dismissed, not applied.
    expect(
      getPhaseCPhysicalAssignments().find((a) => a.target === "Á"),
    ).toBeUndefined();
    expect(getPhaseCPhysicalAssignments()).toHaveLength(0);
    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Spec 074 US2 — S-03 parallel combo. The proposal is raised in the gallery
// (which owns the one hook and the one banner) from the sequence panel's
// onApplied seam; the panel renders no banner of its own.
// ---------------------------------------------------------------------------

describe("MechanismGallery — S-03 parallel-combo proposal (spec 074 US2)", () => {
  async function applySequence(content: string, indicator: string) {
    fireEvent.click(screen.getByText(/Type a sequence/i));
    fireEvent.change(screen.getByTestId("sequences-content"), {
      target: { value: content },
    });
    fireEvent.change(screen.getByTestId("sequences-indicator"), {
      target: { value: indicator },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("sequences-apply"));
    });
  }

  it("a sequence whose content is a single cased character raises a proposal", async () => {
    instantiateWorkingCopy();
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    await applySequence("a", "s");

    expect(screen.getByText(/has an uppercase form, Á/i)).toBeTruthy();
  });

  it("confirming records a parallel sequence: indicator unchanged, content and collapse target case-shifted", async () => {
    instantiateWorkingCopy();
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    await applySequence("a", "s");
    fireEvent.click(
      screen.getByRole("button", { name: /Map Á to the shift layer of/i }),
    );

    const assignments = getPhaseCPhysicalAssignments();

    const source = assignments.find((a) => a.target === "á");
    expect(source?.mechanisms[0]?.slotValues).toMatchObject({
      firstLetterOut: "a",
      secondLetter: "s",
      collapsedChar: "á",
    });

    const companion = assignments.find((a) => a.target === "Á");
    expect(companion?.mechanisms[0]?.patternId).toBe(PATTERN_SEQUENCE);
    expect(companion?.mechanisms[0]?.strategyId).toBe("S-03");
    expect(companion?.mechanisms[0]?.slotValues).toMatchObject({
      // Case-shifted.
      firstLetterOut: "A",
      collapsedChar: "Á",
      // Unchanged — the indicator is a physical key by construction.
      secondLetter: "s",
    });
  });

  it("multi-character content ('ng') raises no proposal", async () => {
    instantiateWorkingCopy();
    seedInventory(["ŋ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    await applySequence("ng", "y");

    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();
    expect(getPhaseCPhysicalAssignments()).toHaveLength(1);
  });

  it("confirming twice is a no-op under the existing (firstLetterOut, secondLetter) dedup", async () => {
    instantiateWorkingCopy();
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    await applySequence("a", "s");
    fireEvent.click(
      screen.getByRole("button", { name: /Map Á to the shift layer of/i }),
    );

    // Re-apply the identical source sequence: the panel's own dedup makes it a
    // no-op and hands back no payload, so no second proposal is raised.
    await applySequence("a", "s");
    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();

    const companion = getPhaseCPhysicalAssignments().find(
      (a) => a.target === "Á",
    );
    expect(companion?.mechanisms).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Spec 074 P1 fix — "counterpart already placed" (spec §Edge Cases), wired to
// the physical (S-01) and combo (S-02/S-03) mechanisms. The touch mechanism
// already had this wired (TouchGallery.tsx); these lock the other two.
// ---------------------------------------------------------------------------

describe("MechanismGallery — 'counterpart already placed' suppression (spec 074 P1 fix)", () => {
  it("physical (S-01): no companion prompt when the counterpart is already on the shift layer of the same key", async () => {
    instantiateWorkingCopy();
    seedInventory(["θ"]);
    // Θ already recorded on the shift layer of K_Q — the exact slot a
    // base-layer θ swap on K_Q would otherwise propose.
    useWorkingCopyStore.getState().recordAssignments([
      {
        scope: "individual",
        target: "Θ",
        modality: "physical",
        mechanisms: [
          {
            patternId: "simple_swap",
            strategyId: "S-01",
            slotValues: { kmnRules: "+ [SHIFT K_Q] > U+0398" },
          },
        ],
        source: "user",
      },
    ]);

    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_Q");
    fireEvent.click(screen.getByRole("button", { name: /Apply method for θ/i }));

    // No proposal — the parallel slot already produces the counterpart.
    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();

    const assignments = getPhaseCPhysicalAssignments();
    // Only the pre-seeded Θ assignment plus the new θ swap — nothing added
    // for a redundant companion.
    expect(assignments).toHaveLength(2);
    expect(assignments.filter((a) => a.target === "Θ")).toHaveLength(1);
  });

  it("combo S-02: no parallel-combo prompt when the counterpart already has a PATTERN_DEADKEY mechanism on the same trigger key", async () => {
    instantiateWorkingCopy();
    seedInventory(["á"]);
    // Á already has a deadkey mechanism on the default trigger key (K_COLON,
    // MechanismGallery's initial triggerKey state) — the parallel combo this
    // apply would otherwise propose.
    useWorkingCopyStore.getState().recordAssignments([
      {
        scope: "individual",
        target: "Á",
        modality: "physical",
        mechanisms: [
          {
            patternId: PATTERN_DEADKEY,
            strategyId: "S-02",
            slotValues: {
              triggerKey: "K_COLON",
              deadkeyName: "dead0",
              baseLetters: "A",
              accentedForms: "Á",
              accentChar: ";",
            },
          },
        ],
        source: "user",
      },
    ]);

    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    // "á" defaults to the pre-enabled deadkey method (§3c) on K_COLON.
    fireEvent.click(screen.getByRole("button", { name: /Apply method for á/i }));

    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();

    const assignments = getPhaseCPhysicalAssignments();
    expect(assignments.filter((a) => a.target === "Á")).toHaveLength(1);
  });

  it("combo S-03: no parallel-combo prompt when the counterpart already has a PATTERN_SEQUENCE mechanism on the same indicator key", async () => {
    instantiateWorkingCopy();
    seedInventory(["á"]);
    // Á already has a sequence mechanism keyed on the same indicator ("s")
    // the new á sequence below will use.
    useWorkingCopyStore.getState().recordAssignments([
      {
        scope: "individual",
        target: "Á",
        modality: "physical",
        mechanisms: [
          {
            patternId: PATTERN_SEQUENCE,
            strategyId: "S-03",
            slotValues: { firstLetterOut: "A", secondLetter: "s", collapsedChar: "Á" },
          },
        ],
        source: "user",
      },
    ]);

    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    fireEvent.click(screen.getByText(/Type a sequence/i));
    fireEvent.change(screen.getByTestId("sequences-content"), {
      target: { value: "a" },
    });
    fireEvent.change(screen.getByTestId("sequences-indicator"), {
      target: { value: "s" },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("sequences-apply"));
    });

    expect(screen.queryByText(/has an uppercase form/i)).toBeNull();

    const assignments = getPhaseCPhysicalAssignments();
    expect(assignments.filter((a) => a.target === "Á")).toHaveLength(1);
    expect(assignments.find((a) => a.target === "á")).toBeDefined();
  });
});
