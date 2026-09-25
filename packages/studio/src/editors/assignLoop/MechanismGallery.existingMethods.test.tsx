// Unit tests for MechanismGallery — existing methods: the already-produced section
// and the Existing methods SHOW-ALL list and its curation.
//
// Shared module mocks, spies, and the lifecycle hooks every suite installs:
// ../../test/mechanismGallery/mocks.tsx. Seeders and IR fixtures:
// ../../test/mechanismGallery/harness.ts.

import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, act, waitFor } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { MechanismGallery } from "./MechanismGallery.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { createVirtualFS, type IRGroup, type IRRule } from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { CharContributors } from "@keyboard-studio/engine";
import { installMechanismGalleryHooks, collectCharContributorsSpy } from "../../test/mechanismGallery/mocks.tsx";
import { seedInventory } from "../../test/mechanismGallery/harness.ts";

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
// Already-produced section
// ---------------------------------------------------------------------------

describe("MechanismGallery — already-produced section", () => {
  it("does not render the already-produced toggle when alreadyProduced is empty", async () => {
    // baseIr is null => alreadyProduced === [].
    seedInventory(["á"]);
    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });
    expect(
      screen.queryByRole("button", { name: /characters already covered/i }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// "Existing methods" SHOW-ALL — composition row + unattributed floor
// (spec follow-up: every green-badged character must render >= 1 row).
// ---------------------------------------------------------------------------

describe("MechanismGallery — Existing methods SHOW-ALL (composition + floor)", () => {
  it("a composable-but-not-directly-produced char (base + combining mark both produced) shows a GREEN, static composition row — it PRODUCES the char, it just has no single rule to delete", async () => {
    // 'U' and combining circumflex accent (U+0302) are each directly produced
    // by their own rule; precomposed 'Û' (U+00DB) is produced by neither —
    // only reachable via NFD composition of the two.
    const ruleU: IRRule = {
      nodeId: "r-U",
      context: [{ kind: "vkey", name: "K_U", modifiers: [] }],
      output: [{ kind: "char", value: "U" }],
    };
    const ruleCircumflex: IRRule = {
      nodeId: "r-circumflex",
      context: [{ kind: "vkey", name: "K_6", modifiers: ["SHIFT"] }],
      output: [{ kind: "char", value: "̂" }],
    };
    const group: IRGroup = {
      nodeId: "g-main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [ruleU, ruleCircumflex],
    };
    const seedVfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    ]);
    useWorkingCopyStore
      .getState()
      .instantiateFromBase(basicKbdus, { vfs: seedVfs, ir: makeTestIR([group]) });

    // "z" stays in lettersToAdd (not produced at all); "Û" is composable, so
    // useInventoryDiff folds it into alreadyProduced (green badge) even
    // though the base never literally produces it.
    seedInventory(["z", "Û"]);

    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    // Jump to "Û" via its char-scroll-strip chip (U+00DB) — reachable even
    // though it's outside lettersToAdd's positional walk (handleSelectDisplayChar
    // jumps to any confirmedInventory member for inspection).
    fireEvent.click(screen.getByTestId("char-scroll-chip-00DB"));

    let compositionRow: HTMLElement;
    await waitFor(() => {
      compositionRow = screen.getByText("U + ◌̂ → Û - NOT DELETABLE");
      expect(compositionRow).toBeTruthy();
    });
    // GREEN (produced), not blue — composition rows produce the character;
    // color tracks produced-vs-used, not deletability.
    expect(compositionRow!.style.color).toBe("var(--app-success-text)"); // --app-success-text token (epic #533)
    expect(compositionRow!.style.background).toBe("var(--app-success-bg)"); // GREEN_CHIP_BG shorthand (epic #533)
    // Static: a <span>, not a <button> — no delete affordance at all.
    expect(compositionRow!.tagName).toBe("SPAN");
    expect(compositionRow!.textContent).toBe("U + ◌̂ → Û - NOT DELETABLE"); // real path + suffix, no "×"
    expect(
      screen.queryByRole("button", { name: /Remove existing method/i }),
    ).toBeNull();
  });

  it("a blocked (opaque/multi-char) row is GREEN and static — it PRODUCES the char, it just can't be surgically removed", async () => {
    const ruleZ: IRRule = {
      nodeId: "r-z",
      context: [{ kind: "vkey", name: "K_Z", modifiers: [] }],
      output: [{ kind: "char", value: "z" }],
    };
    const group: IRGroup = {
      nodeId: "g-main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [ruleZ],
    };
    const seedVfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    ]);
    useWorkingCopyStore
      .getState()
      .instantiateFromBase(basicKbdus, { vfs: seedVfs, ir: makeTestIR([group]) });
    seedInventory(["y", "z"]);

    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    collectCharContributorsSpy.mockImplementationOnce(() => ({
      targetChar: "z",
      ruleNodeIds: [],
      storeSlotIds: [],
      storeSlots: [],
      locations: [],
      blocked: [{ reason: "multi-char literal output", label: "g-main / r-z" }],
      descriptors: [
        {
          kind: "blocked",
          producedChar: "z",
          producedRole: "produced",
          blockedReasonCode: "multi-char-output",
        },
      ],
    }));

    fireEvent.click(screen.getByTestId("char-scroll-chip-007A"));

    let blockedRow: HTMLElement;
    await waitFor(() => {
      blockedRow = screen.getByText("Bundled with other output — can't remove z alone - NOT DELETABLE");
      expect(blockedRow).toBeTruthy();
    });
    expect(blockedRow!.style.color).toBe("var(--app-success-text)"); // GREEN, not blue (--app-success-text token, epic #533)
    expect(blockedRow!.style.background).toBe("var(--app-success-bg)"); // GREEN_CHIP_BG shorthand (epic #533)
    expect(blockedRow!.tagName).toBe("SPAN");
    expect(
      screen.queryByRole("button", { name: /Remove existing method/i }),
    ).toBeNull();
  });

  it("a green char (directly produced) with zero enumerable methods shows the unattributed floor row, GREEN and static", async () => {
    const ruleZ: IRRule = {
      nodeId: "r-z",
      context: [{ kind: "vkey", name: "K_Z", modifiers: [] }],
      output: [{ kind: "char", value: "z" }],
    };
    const group: IRGroup = {
      nodeId: "g-main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [ruleZ],
    };
    const seedVfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    ]);
    useWorkingCopyStore
      .getState()
      .instantiateFromBase(basicKbdus, { vfs: seedVfs, ir: makeTestIR([group]) });

    // "y" stays in lettersToAdd (starting currentChar); "z" is directly
    // produced (green) via ruleZ above.
    seedInventory(["y", "z"]);

    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    // Override collectCharContributors for exactly the NEXT call (currentChar
    // switching to "z" below) — simulates an unrecognized-shape producer that
    // genuinely can't be attributed, while "z" stays green (buildProducedSet,
    // unmocked, still finds it via ruleZ).
    collectCharContributorsSpy.mockImplementationOnce(() => ({
      targetChar: "z",
      ruleNodeIds: [],
      storeSlotIds: [],
      storeSlots: [],
      locations: [],
      blocked: [],
      descriptors: [],
    }));

    fireEvent.click(screen.getByTestId("char-scroll-chip-007A"));

    let floorRow: HTMLElement;
    await waitFor(() => {
      floorRow = screen.getByText(
        "Your keyboard already produces this character. - NOT DELETABLE",
      );
      expect(floorRow).toBeTruthy();
    });
    expect(floorRow!.style.color).toBe("var(--app-success-text)"); // GREEN, not blue (--app-success-text token, epic #533)
    expect(floorRow!.style.background).toBe("var(--app-success-bg)"); // GREEN_CHIP_BG shorthand (epic #533)
    expect(floorRow!.tagName).toBe("SPAN");
    expect(
      screen.queryByRole("button", { name: /Remove existing method/i }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// "Existing methods" curation — Rule 1 (keystroke rows dropped when a
// PRODUCED store-slot row already covers the char) and Rule 2 (a
// producedRole "used" contributor renders blue and static — the ONE row kind
// that is never deletable AND never green, since it never produces the
// char at all; see the color-model describe block further below for the
// full three-state matrix).
// ---------------------------------------------------------------------------

describe("MechanismGallery — Existing methods curation (producedRole + keystroke-drop)", () => {
  function baseContributors(
    overrides: Partial<CharContributors>,
  ): CharContributors {
    return {
      targetChar: "z",
      ruleNodeIds: [],
      storeSlotIds: [],
      storeSlots: [],
      locations: [],
      blocked: [],
      descriptors: [],
      ...overrides,
    };
  }

  it("a char with a keystroke producer AND a produced store-slot: the keystroke row is dropped, the store-slot row is kept", async () => {
    const ruleZ: IRRule = {
      nodeId: "r-z",
      context: [{ kind: "vkey", name: "K_Z", modifiers: [] }],
      output: [{ kind: "char", value: "z" }],
    };
    const group: IRGroup = {
      nodeId: "g-main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [ruleZ],
    };
    const seedVfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    ]);
    useWorkingCopyStore
      .getState()
      .instantiateFromBase(basicKbdus, { vfs: seedVfs, ir: makeTestIR([group]) });
    seedInventory(["y", "z"]);

    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    collectCharContributorsSpy.mockImplementationOnce(() =>
      baseContributors({
        ruleNodeIds: ["r-z"],
        storeSlotIds: ["sid-alpha#25"],
        storeSlots: [{ slotId: "sid-alpha#25", role: "output" }],
        descriptors: [
          { kind: "keystroke", producedChar: "z", producedRole: "produced", keystrokeDisplay: "Z" },
          {
            kind: "store-slot",
            producedChar: "z",
            producedRole: "produced",
            storeDisplayName: "Alphabet",
          },
        ],
      }),
    );

    fireEvent.click(screen.getByTestId("char-scroll-chip-007A"));

    await waitFor(() => {
      expect(screen.getByText("One of your Alphabet keys → z")).toBeTruthy();
    });
    expect(screen.queryByText("Press Z → z")).toBeNull();
  });

  it("a char whose ONLY producer is a keystroke (no produced store-slot): the keystroke row is kept, GREEN, with a working delete affordance (× + click-to-remove)", async () => {
    const ruleZ: IRRule = {
      nodeId: "r-z",
      context: [{ kind: "vkey", name: "K_Z", modifiers: [] }],
      output: [{ kind: "char", value: "z" }],
    };
    const group: IRGroup = {
      nodeId: "g-main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [ruleZ],
    };
    const seedVfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    ]);
    useWorkingCopyStore
      .getState()
      .instantiateFromBase(basicKbdus, { vfs: seedVfs, ir: makeTestIR([group]) });
    seedInventory(["y", "z"]);

    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    collectCharContributorsSpy.mockImplementationOnce(() =>
      baseContributors({
        ruleNodeIds: ["r-z"],
        descriptors: [
          { kind: "keystroke", producedChar: "z", producedRole: "produced", keystrokeDisplay: "Z" },
        ],
      }),
    );

    fireEvent.click(screen.getByTestId("char-scroll-chip-007A"));

    let deleteButton: HTMLElement;
    await waitFor(() => {
      deleteButton = screen.getByRole("button", {
        name: /Remove existing method Press Z → z for z/i,
      });
      expect(deleteButton).toBeTruthy();
    });
    // GREEN, and it genuinely carries the delete affordance — the "×" glyph
    // plus a working onClick, not just the right color.
    expect(deleteButton!.style.color).toBe("var(--app-success-text)"); // --app-success-text token (epic #533)
    expect(deleteButton!.style.background).toBe("var(--app-success-bg)"); // GREEN_CHIP_BG shorthand (epic #533)
    expect(deleteButton!.textContent).toContain("×");
    fireEvent.click(deleteButton!);
    await waitFor(() => {
      expect(
        screen.queryByRole("button", {
          name: /Remove existing method Press Z → z for z/i,
        }),
      ).toBeNull();
    });
  });

  it('a producedRole "used" contributor renders BLUE and static — informational only, never a delete target', async () => {
    const ruleZ: IRRule = {
      nodeId: "r-z",
      context: [{ kind: "vkey", name: "K_Z", modifiers: [] }],
      output: [{ kind: "char", value: "z" }],
    };
    const group: IRGroup = {
      nodeId: "g-main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [ruleZ],
    };
    const seedVfs = createVirtualFS([
      { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    ]);
    useWorkingCopyStore
      .getState()
      .instantiateFromBase(basicKbdus, { vfs: seedVfs, ir: makeTestIR([group]) });
    seedInventory(["y", "z"]);

    await act(async () => {
      render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />);
    });

    collectCharContributorsSpy.mockImplementationOnce(() =>
      baseContributors({
        storeSlotIds: ["sid-dkf#0"],
        storeSlots: [{ slotId: "sid-dkf#0", role: "input" }],
        descriptors: [{ kind: "deadkey", producedChar: "z", producedRole: "used" }],
      }),
    );

    fireEvent.click(screen.getByTestId("char-scroll-chip-007A"));

    let usedRow: HTMLElement;
    await waitFor(() => {
      usedRow = screen.getByText("Part of a two-step combination → z - NOT DELETABLE");
      expect(usedRow).toBeTruthy();
    });
    // BLUE — this row only USES "z" as input (a deadkey base), it never
    // produces it, so it gets the one color reserved for "used" rows.
    expect(usedRow!.style.color).toBe("var(--app-accent-text)"); // BLUE_CHIP_TEXT (epic #533)
    expect(usedRow!.style.background).toBe("var(--app-accent-subtle)"); // BLUE_CHIP_BG shorthand (epic #533)
    expect(usedRow!.tagName).toBe("SPAN");
    // A "used" contributor is never a removal target for this char — no
    // delete button, same treatment as composition/unattributed/blocked.
    expect(
      screen.queryByRole("button", { name: /Remove existing method/i }),
    ).toBeNull();
  });
});
