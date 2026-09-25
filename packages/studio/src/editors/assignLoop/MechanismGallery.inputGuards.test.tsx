// Unit tests for MechanismGallery — input fields: the custom key option
// (S-01/S-02/S-08) and the character-box guards (delimiters, single grapheme,
// multi-token compose, lone combining marks, sentinel leaks, live-region roles, no
// in-box placeholders).
//
// Shared module mocks, spies, and the lifecycle hooks every suite installs:
// ../../test/mechanismGallery/mocks.tsx. Seeders and IR fixtures:
// ../../test/mechanismGallery/harness.ts.

import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, act } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { MechanismGallery } from "./MechanismGallery.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { CUSTOM_KEY_OPTION_VALUE } from "../../lib/keyOptions.ts";
import { changeSelectMenu, selectMenuValue } from "../../test/selectMenuTestUtils.ts";
import { installMechanismGalleryHooks } from "../../test/mechanismGallery/mocks.tsx";
import { seedInventory, instantiateWithModifiersInUse } from "../../test/mechanismGallery/harness.ts";

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
// "Enter my own character..." custom key option + U+ notation in character
// boxes — feature coverage for the key-picker dropdowns (S-01 swap, S-08
// ralt, S-02 deadkey trigger) and the deadkeyBaseLetter character box.
// ---------------------------------------------------------------------------

describe("MechanismGallery — custom key option (S-01 swap)", () => {
  it("selecting 'Enter my own character...' reveals a custom text input", async () => {
    seedInventory(["ẑ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), CUSTOM_KEY_OPTION_VALUE);
    expect(
      screen.getByLabelText(/Custom character for the assigned key/i),
    ).toBeTruthy();
  });

  it("a custom literal character resolves to a vkey and Apply records the mapped key", async () => {
    seedInventory(["ẑ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), CUSTOM_KEY_OPTION_VALUE);
    fireEvent.change(screen.getByLabelText(/Custom character for the assigned key/i), {
      target: { value: "z" },
    });
    const addBtn = screen.getByRole("button", { name: /Apply method for ẑ/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(addBtn);

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["kmnRules"]).toBe(
      "+ [K_Z] > U+1E91",
    );
  });

  it("custom U+ notation resolves through to the mapped key and shows the resolved character", async () => {
    seedInventory(["ẑ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), CUSTOM_KEY_OPTION_VALUE);
    fireEvent.change(screen.getByLabelText(/Custom character for the assigned key/i), {
      target: { value: "U+007A" },
    });
    // Feedback line shows the raw notation, the resolved char, and the vkey.
    expect(screen.getByText("U+007A → z → K_Z")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Apply method for ẑ/i }));

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["kmnRules"]).toBe(
      "+ [K_Z] > U+1E91",
    );
  });

  it("an unmappable custom character shows an error and blocks Apply", async () => {
    seedInventory(["ẑ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), CUSTOM_KEY_OPTION_VALUE);
    fireEvent.change(screen.getByLabelText(/Custom character for the assigned key/i), {
      target: { value: "é" },
    });
    expect(
      screen.getByText(/Cannot map 'é' to a physical key — pick a key from the list instead\./i),
    ).toBeTruthy();
    const addBtn = screen.getByRole("button", { name: /Apply method for ẑ/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("invalid U+ notation blocks Apply", async () => {
    seedInventory(["ẑ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), CUSTOM_KEY_OPTION_VALUE);
    fireEvent.change(screen.getByLabelText(/Custom character for the assigned key/i), {
      target: { value: "U+ZZZZ" },
    });
    expect(screen.getByText(/Not a valid Unicode value/i)).toBeTruthy();
    const addBtn = screen.getByRole("button", { name: /Apply method for ẑ/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("tapping a key in the OSK preview while custom mode is active exits custom mode and clears the stale custom text", async () => {
    seedInventory(["ẑ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
      // Flush the patterns-loading microtasks so GalleryPreviewWithPatterns
      // (and the mocked OSKFrame's tap button) mounts.
      await new Promise((r) => setTimeout(r, 0));
    });
    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), CUSTOM_KEY_OPTION_VALUE);
    expect(
      screen.getByLabelText(/Custom character for the assigned key/i),
    ).toBeTruthy();

    // Type some (possibly-invalid) custom text before the tap — this is the
    // stale state that must NOT survive a tap-to-select.
    fireEvent.change(screen.getByLabelText(/Custom character for the assigned key/i), {
      target: { value: "zz" },
    });

    // The OSKFrame mock's "tap-K_E" button simulates an OSK key tap.
    fireEvent.click(screen.getByRole("button", { name: "tap-K_E" }));

    // Custom mode is exited — the select now shows K_E and the custom input
    // is gone.
    expect(
      screen.queryByLabelText(/Custom character for the assigned key/i),
    ).toBeNull();
    expect(
      selectMenuValue(screen.getByLabelText(/Physical key for Assign to a key/i)),
    ).toBe("K_E");

    // Re-opening "Enter my own character..." starts clean — the paired
    // custom-char state was cleared by the tap, not left stale from before.
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), CUSTOM_KEY_OPTION_VALUE);
    expect(
      (screen.getByLabelText(/Custom character for the assigned key/i) as HTMLInputElement).value,
    ).toBe("");
  });
});

describe("MechanismGallery — custom key option (S-02 deadkey trigger)", () => {
  it("a custom trigger character maps to its vkey, and deadkeyName/accentChar never fall back to 'dead0'", async () => {
    // "a" is not one of the 4 built-in DEADKEY_OPTIONS trigger keys, so this
    // exercises the custom-trigger path exclusively — deadkeyNameFor(triggerKey)
    // would otherwise return the "dead0" fallback for an unrecognised key id.
    seedInventory(["ā"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    await changeSelectMenu(screen.getByLabelText(/Trigger key for deadkey/i), CUSTOM_KEY_OPTION_VALUE);
    fireEvent.change(screen.getByLabelText(/Custom trigger character for deadkey/i), {
      target: { value: "a" },
    });
    fireEvent.change(screen.getByLabelText(/Base letter for deadkey/i), {
      target: { value: "a" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply method for ā/i }));

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    const slotValues = assignments[0]?.mechanisms[0]?.slotValues;
    expect(slotValues?.["triggerKey"]).toBe("K_A");
    expect(slotValues?.["deadkeyName"]).toBe("0061");
    expect(slotValues?.["accentChar"]).toBe("a");
    expect(slotValues?.["deadkeyName"]).not.toBe("dead0");
  });
});

describe("MechanismGallery — custom key option (S-08 ralt)", () => {
  it("a custom base character resolves to its vkey and Apply records the resolved key, never the '__custom__' sentinel", async () => {
    // RALT must already be a chosen family option in the modifier pool for
    // "Layer 1 for layer-switch combo" to offer it as a <select> value — see
    // computeModifierPool. Seed a distinct vkey (K_Q) so it never collides
    // with the K_W the custom character below resolves to.
    instantiateWithModifiersInUse("K_Q", ["RALT"]);
    seedInventory(["ŵ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Assign to a key/i));
    fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), CUSTOM_KEY_OPTION_VALUE);
    fireEvent.change(
      screen.getByLabelText(/Custom character for the assigned key/i),
      { target: { value: "w" } },
    );
    await changeSelectMenu(screen.getByLabelText(/Layer 1 for layer-switch combo/i), "RALT");

    const addBtn = screen.getByRole("button", { name: /Apply method for ŵ/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(addBtn);

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments[0]?.mechanisms[0]?.patternId).toBe("modifier_as_layer_switch");
    const altgrKeyList = assignments[0]?.mechanisms[0]?.slotValues?.["altgrKeyList"];
    // Non-vacuity: the resolved vkey for custom char "w" must appear (proving
    // the assertion actually depends on resolution, not just that Apply
    // fired), and the raw "__custom__" sentinel must never leak through —
    // that leak is exactly the bug this regression test guards against.
    expect(altgrKeyList).toBe("[RALT K_W]");
    expect(altgrKeyList).not.toContain(CUSTOM_KEY_OPTION_VALUE);
  });
});

// ---------------------------------------------------------------------------
// Delimiter guard (P0) — ASCII straight quotes can't be resolved output
// characters in deadkeyBaseLetter or the deadkey-trigger custom character
// (both substitute into an unescaped KMN string literal or JSON block). The
// SWAP/RALT custom-character key pickers are unaffected — they resolve only
// to a K_ vkey id. (The sequence method's own Content/Indicator boxes carry
// the SAME delimiter guard — see SequenceBuilderPanel.tsx's
// SEQ_CONTENT_RESOLVE_OPTIONS/buildSeqIndicatorResolveOptions — but live in
// the right pane now, not this gallery's own MethodChooser; see "apply
// (sequence)" above for their coverage.)
// ---------------------------------------------------------------------------

describe("MechanismGallery — delimiter guard (straight quotes)", () => {
  it("blocks Apply when the deadkey base-letter box resolves to a straight apostrophe", async () => {
    seedInventory(["ā"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    fireEvent.change(screen.getByLabelText(/Base letter for deadkey/i), {
      target: { value: "'" },
    });
    const addBtn = screen.getByRole("button", { name: /Apply method for ā/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("blocks Apply and shows the steer-to-U+02BC message when the deadkey CUSTOM TRIGGER character resolves to a straight quote", async () => {
    seedInventory(["ā"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    await changeSelectMenu(screen.getByLabelText(/Trigger key for deadkey/i), CUSTOM_KEY_OPTION_VALUE);
    fireEvent.change(screen.getByLabelText(/Custom trigger character for deadkey/i), {
      target: { value: '"' },
    });
    fireEvent.change(screen.getByLabelText(/Base letter for deadkey/i), {
      target: { value: "a" },
    });
    expect(
      screen.getByText(/Straight quotes \(' or "\) can't be typed here\. For a glottal stop or saltillo, use U\+02BC or U\+2019\./i),
    ).toBeTruthy();
    const addBtn = screen.getByRole("button", { name: /Apply method for ā/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("a straight apostrophe in the SWAP custom-character picker still maps to K_QUOTE and is NOT blocked", async () => {
    seedInventory(["ẑ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), CUSTOM_KEY_OPTION_VALUE);
    fireEvent.change(screen.getByLabelText(/Custom character for the assigned key/i), {
      target: { value: "'" },
    });
    // Bidirectional reflection (Fix 2): a literal custom key char now also
    // shows its U+ value, ahead of the resolved vkey.
    expect(screen.getByText("' → U+0027 → K_QUOTE")).toBeTruthy();
    const addBtn = screen.getByRole("button", { name: /Apply method for ẑ/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(addBtn);

    const assignments = useWorkingCopyStore
      .getState()
      .session.assignments.filter((a) => a.modality === "physical");
    expect(assignments[0]?.mechanisms[0]?.slotValues?.["kmnRules"]).toBe(
      "+ [K_QUOTE] > U+1E91",
    );
  });
});

// ---------------------------------------------------------------------------
// NFC normalization (P1) — a decomposed paste collapses to its precomposed
// form before it lands in slotValues, matching the deadkey patterns' NFC
// convention.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Single-grapheme guard (P1) -- deadkeyBaseLetter accepts exactly one
// grapheme cluster. (The sequence builder's own Content/Indicator boxes have
// their own resolve-options coverage in SequenceBuilderPanel's own module —
// this section is scoped to the deadkey base-letter box only.)
// ---------------------------------------------------------------------------

describe("MechanismGallery — single-grapheme guard on character boxes", () => {
  it("rejects a two-character literal paste in the deadkey base-letter box with the 'coming later' reason", async () => {
    seedInventory(["ā"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    fireEvent.change(screen.getByLabelText(/Base letter for deadkey/i), {
      target: { value: "ab" },
    });
    expect(
      screen.getByText(
        "Enter one base character. (Covering several base letters with one dead key is coming later.)",
      ),
    ).toBeTruthy();
    const addBtn = screen.getByRole("button", { name: /Apply method for ā/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("accepts a base+combining sequence with a precomposed NFC form (n + U+0303 -> ñ) in the deadkey base-letter box", async () => {
    seedInventory(["ā"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    // "n" + U+0303 COMBINING TILDE precomposes under NFC to the single code
    // point U+00F1 (ñ) — one grapheme either way.
    fireEvent.change(screen.getByLabelText(/Base letter for deadkey/i), {
      target: { value: "ñ" },
    });
    const addBtn = screen.getByRole("button", { name: /Apply method for ā/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Multi-token compose (deadkeyBaseLetter) -- space-separated tokens are each
// independently resolved, then concatenated + NFC-normalized. This section is
// scoped to the deadkey base-letter box only; the sequence builder's own
// Content box has its own resolve-options coverage in
// SequenceBuilderPanel.tsx.
// ---------------------------------------------------------------------------

describe("MechanismGallery — multi-token compose (deadkey base-letter box)", () => {
  it("accepts a U+-composed single grapheme in the deadkey base-letter box", async () => {
    seedInventory(["ā"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    fireEvent.change(screen.getByLabelText(/Base letter for deadkey/i), {
      target: { value: "U+006E U+0303" }, // composes to one grapheme: "n with tilde"
    });
    const addBtn = screen.getByRole("button", { name: /Apply method for ā/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it("rejects a two-token compose that does NOT collapse to one grapheme in the deadkey base-letter box", async () => {
    seedInventory(["ā"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    fireEvent.change(screen.getByLabelText(/Base letter for deadkey/i), {
      target: { value: "a b" }, // two independent tokens, two graphemes
    });
    expect(
      screen.getByText(
        "Enter one base character. (Covering several base letters with one dead key is coming later.)",
      ),
    ).toBeTruthy();
    const addBtn = screen.getByRole("button", { name: /Apply method for ā/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Lone-combining-mark caution (P1) — warns but does not block.
// ---------------------------------------------------------------------------

describe("MechanismGallery — lone combining mark caution on the deadkey base-letter box", () => {
  it("shows a caution (does not block Apply) when the base letter is a bare combining mark", async () => {
    seedInventory(["ā"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    fireEvent.change(screen.getByLabelText(/Base letter for deadkey/i), {
      target: { value: "́" }, // bare COMBINING ACUTE ACCENT
    });
    expect(
      screen.getByText(
        /That looks like a combining mark on its own — the base letter is usually a plain letter\./i,
      ),
    ).toBeTruthy();
    const addBtn = screen.getByRole("button", { name: /Apply method for ā/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not show the caution for a plain base letter", async () => {
    seedInventory(["ā"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    fireEvent.change(screen.getByLabelText(/Base letter for deadkey/i), {
      target: { value: "a" },
    });
    expect(
      screen.queryByText(/That looks like a combining mark on its own/i),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Sentinel leak in preview text (P1 QC finding) — the raw "__custom__"
// sentinel must never be interpolated into "Press X, then Y" when the
// deadkey trigger picker is in custom mode but not yet resolved.
// ---------------------------------------------------------------------------

describe("MechanismGallery — no sentinel leak in the deadkey preview line", () => {
  it("shows a neutral placeholder instead of the raw '__custom__' sentinel when custom trigger mode is unresolved", async () => {
    seedInventory(["ā"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    await changeSelectMenu(screen.getByLabelText(/Trigger key for deadkey/i), CUSTOM_KEY_OPTION_VALUE);
    // No custom character typed yet — customChar is empty, so
    // resolveKeyPickerSelection resolves to customError, not customOk.
    expect(screen.queryByText(/__custom__/)).toBeNull();
    expect(screen.getByText(/Press \[trigger key\], then/i)).toBeTruthy();
  });

  it("shows a neutral placeholder when the custom trigger character is unmappable (customError)", async () => {
    seedInventory(["ā"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    await changeSelectMenu(screen.getByLabelText(/Trigger key for deadkey/i), CUSTOM_KEY_OPTION_VALUE);
    fireEvent.change(screen.getByLabelText(/Custom trigger character for deadkey/i), {
      target: { value: "é" },
    });
    expect(screen.queryByText(/__custom__/)).toBeNull();
    expect(screen.getByText(/Press \[trigger key\], then/i)).toBeTruthy();
  });

  it("shows the resolved character (not the sentinel or placeholder) once the custom trigger resolves", async () => {
    seedInventory(["ā"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    await changeSelectMenu(screen.getByLabelText(/Trigger key for deadkey/i), CUSTOM_KEY_OPTION_VALUE);
    fireEvent.change(screen.getByLabelText(/Custom trigger character for deadkey/i), {
      target: { value: "a" },
    });
    expect(screen.queryByText(/__custom__/)).toBeNull();
    expect(screen.queryByText(/\[trigger key\]/)).toBeNull();
    expect(screen.getByText(/Press a, then/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Accessible feedback — live-region roles on custom-input validation
// feedback (P1 QC finding). Screen-reader users must hear an error/success
// hint when it appears while focus stays in the input.
// ---------------------------------------------------------------------------

describe("MechanismGallery — accessible live-region roles on validation feedback", () => {
  it("marks the lone-combining-mark caution as a polite status region (deadkey base-letter box)", async () => {
    seedInventory(["ā"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    fireEvent.change(screen.getByLabelText(/Base letter for deadkey/i), {
      target: { value: "́" }, // bare COMBINING ACUTE ACCENT
    });
    const caution = screen.getByText(
      /That looks like a combining mark on its own — the base letter is usually a plain letter\./i,
    );
    expect(caution.getAttribute("role")).toBe("status");
    expect(caution.getAttribute("aria-live")).toBe("polite");
  });

  it("marks the KeyPickerField custom-resolution reflection as a polite status region (SWAP custom key)", async () => {
    seedInventory(["ẑ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), CUSTOM_KEY_OPTION_VALUE);
    fireEvent.change(screen.getByLabelText(/Custom character for the assigned key/i), {
      target: { value: "z" },
    });
    // Bidirectional reflection (Fix 2): a literal custom key char now also
    // shows its U+ value, ahead of the resolved vkey.
    const hint = screen.getByText("z → U+007A → K_Z");
    expect(hint.getAttribute("role")).toBe("status");
    expect(hint.getAttribute("aria-live")).toBe("polite");
  });

  it("marks the KeyPickerField custom-resolution error as an alert region (SWAP custom key)", async () => {
    seedInventory(["ẑ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), CUSTOM_KEY_OPTION_VALUE);
    fireEvent.change(screen.getByLabelText(/Custom character for the assigned key/i), {
      target: { value: "é" },
    });
    const error = screen.getByText(
      /Cannot map 'é' to a physical key — pick a key from the list instead\./i,
    );
    expect(error.getAttribute("role")).toBe("alert");
  });
});

// ---------------------------------------------------------------------------
// No in-box placeholders (Fix 1) — placeholder text was distracting inside
// the character boxes and the KeyPickerField custom-character inputs.
// Guidance now lives OUTSIDE the box: one caption near the method chooser
// (character boxes) and one line inside KeyPickerField shown only while its
// custom-input mode is active.
// ---------------------------------------------------------------------------

describe("MechanismGallery — no in-box placeholders (Fix 1)", () => {
  it("the deadkey base-letter box carries no placeholder attribute", async () => {
    seedInventory(["ā"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    expect(screen.getByLabelText(/Base letter for deadkey/i).getAttribute("placeholder")).toBeNull();
  });

  it("the SWAP custom key input carries no placeholder attribute", async () => {
    seedInventory(["ẑ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), CUSTOM_KEY_OPTION_VALUE);
    const input = screen.getByLabelText(/Custom character for the assigned key/i);
    expect(input.getAttribute("placeholder")).toBeNull();
  });

  it("the RALT custom key input carries no placeholder attribute", async () => {
    seedInventory(["ẑ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Assign to a key/i));
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), CUSTOM_KEY_OPTION_VALUE);
    const input = screen.getByLabelText(/Custom character for the assigned key/i);
    expect(input.getAttribute("placeholder")).toBeNull();
  });

  it("the deadkey trigger custom input carries no placeholder attribute", async () => {
    seedInventory(["ā"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Tap a trigger key, then a letter/i));
    await changeSelectMenu(screen.getByLabelText(/Trigger key for deadkey/i), CUSTOM_KEY_OPTION_VALUE);
    const input = screen.getByLabelText(/Custom trigger character for deadkey/i);
    expect(input.getAttribute("placeholder")).toBeNull();
  });

  it("shows a single character-box help caption near the method chooser, not repeated per box", async () => {
    seedInventory(["x"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expect(
      screen.getAllByText(
        "Type a character, or a Unicode value like U+00E9. Combine composed parts with spaces, e.g. U+006E U+0303.",
      ),
    ).toHaveLength(1);
  });

  it("shows the unrelated KeyPickerField custom-input help line only once custom mode is active (SWAP key)", async () => {
    // Fix 1's method-chooser caption (CHAR_BOX_HELP_TEXT) and KeyPickerField's
    // own custom-input help line (CUSTOM_INPUT_HELP_TEXT) are two DIFFERENT
    // constants with different copy since the sequence/deadkey character
    // boxes were relaxed to multi-token/multi-character — only the
    // KeyPickerField line (unaffected: the key-picker custom-char path stays
    // single-character) should appear once custom mode activates.
    seedInventory(["ẑ"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    fireEvent.click(screen.getByText(/Assign to a key/i));
    expect(
      screen.queryByText("Type a character directly, or a Unicode value like U+00E9."),
    ).toBeNull();
    await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), CUSTOM_KEY_OPTION_VALUE);
    expect(
      screen.getAllByText("Type a character directly, or a Unicode value like U+00E9."),
    ).toHaveLength(1);
  });
});
