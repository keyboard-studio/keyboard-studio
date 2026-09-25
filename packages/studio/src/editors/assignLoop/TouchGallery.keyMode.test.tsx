// Unit tests for TouchGallery — the mode selector, shared progress figures, either-mode completion, and the undo affordance (spec 063).
//
// Shared module mocks: ../../test/touchGallery/mocks.tsx. Seeders and the
// lifecycle hooks every suite installs: ../../test/touchGallery/harness.ts.

import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, act, waitFor } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { TouchGallery, describeUndoTarget } from "./TouchGallery.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
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
// spec 063 T072/T073/T075/T076 — the touch step's mode selector, the propose-
// on-entry gate, the shared progress figures, and the undo affordance.
// ---------------------------------------------------------------------------

/**
 * Seeds a working copy from a SHIPPED `.keyman-touch-layout` whose single
 * "phone" platform / "default" layer contains an author-controlled key list
 * — the fixture T073's both-conditions gate needs (an "imported keyboard
 * with a broken key" scenario touch-coverage's own scaffold fixtures cannot
 * produce deterministically, since scaffoldTouchLayout's real punctuation
 * keys (e.g. `K_PERIOD`) legitimately carry no `output` field of their own
 * either — see this file's own `T_broken`/`T_cover` naming below for exactly
 * which key is "broken" and which "covers" a character, rather than relying
 * on scaffold incidental structure).
 *
 * `includeBrokenKey`: adds `T_broken` (no `output`, no decodable id, no rule
 * — genuinely "no reachable output" per `isNoOutputLetterCell`).
 * `coveringCharKey`: when set, adds a second key (`T_cover`) whose `output`
 * IS that character — used to make a character reachable while a broken key
 * still exists elsewhere in the same layout (the "broken keys but nothing
 * unplaced" control).
 */
function seedKeyModeFixture(opts: {
  inventory: string[];
  includeBrokenKey: boolean;
  coveringCharKey?: string;
}) {
  const keys: Array<Record<string, unknown>> = [];
  if (opts.includeBrokenKey) keys.push({ id: "T_broken", text: "?" });
  if (opts.coveringCharKey !== undefined) {
    keys.push({
      id: "T_cover",
      output: opts.coveringCharKey,
      text: opts.coveringCharKey,
    });
  }
  const shippedLayoutJson = JSON.stringify({
    phone: {
      layer: [{ id: "default", row: [{ id: 1, key: keys }] }],
    },
  });
  const vfs = createVirtualFS([
    { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    {
      path: "source/basic_kbdus.keyman-touch-layout",
      content: shippedLayoutJson,
      isBinary: false,
    },
  ]);
  const ir = makeTestIR([]);
  useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir });
  useWorkingCopyStore.getState().recordPhase({
    phase: "B",
    answers: [],
    confirmedInventory: opts.inventory,
  });
  useWorkingCopyStore.getState().markGalleryIntroSeen("touch");
  useSurveySessionStore.getState().setTouchSeedSource("import-adapt");
}

describe("TouchGallery — mode selector as an APG tabs pattern (T072, FR-035)", () => {
  it("renders a tablist with two tabs, 'By character' selected by default", async () => {
    seedStore({ withInventory: ["ä"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    const tablist = screen.getByTestId("touch-mode-tabs");
    expect(tablist.getAttribute("role")).toBe("tablist");
    const charTab = screen.getByTestId("touch-mode-tab-character");
    const keyTab = screen.getByTestId("touch-mode-tab-key");
    expect(charTab.getAttribute("role")).toBe("tab");
    expect(keyTab.getAttribute("role")).toBe("tab");
    expect(charTab.getAttribute("aria-selected")).toBe("true");
    expect(keyTab.getAttribute("aria-selected")).toBe("false");
  });

  it("clicking the 'By key' tab switches to the editable schematic grid, labelled 'for editing', with the live preview gone; clicking back returns to the character walk and brings it back", async () => {
    seedStore({ withInventory: ["ä"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    // Character mode's own per-char surface is showing.
    expect(screen.getByText("Touch mapping")).toBeTruthy();
    expect(screen.queryByTestId("touch-key-mode-back")).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-mode-tab-key"));
    });

    // The grid pane still names itself "for editing" (FR-020h/FR-035).
    expect(screen.getByTestId("touch-key-mode-back")).toBeTruthy();
    expect(screen.getByText(/for editing/i)).toBeTruthy();

    // But the "for testing" OSK preview is GONE, not merely relabelled —
    // spec 065 FR-024/T037: key mode uses the full pane width and does not
    // render the live preview. Spec 063's version of this test asserted the
    // preview was still there beside the grid, headed "for testing"; that
    // pairing was the point then and is withdrawn now. The two-distinct-verbs
    // concern it protected does not survive the change either, since there is
    // no second surface left to confuse the grid with.
    expect(screen.queryByText(/for testing/i)).toBeNull();
    // The per-character surface is gone entirely, not just hidden alongside it.
    expect(screen.queryByText("Touch mapping")).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-mode-tab-character"));
    });
    expect(screen.getByText("Touch mapping")).toBeTruthy();
    expect(screen.queryByTestId("touch-key-mode-back")).toBeNull();
    // Character mode gets its preview back — the switch is lossless in both
    // directions (FR-025). Its heading is "Touch preview", NOT "for testing":
    // the latter was `editor.assignLoop.touch.keyMode.previewHeading`, a
    // key-mode-only string that spec 065 T037 made unreachable and T038
    // removed along with the surface that carried it.
    expect(screen.getByText("Touch preview")).toBeTruthy();
  });

  it("ArrowRight on the tablist moves AND selects the next tab (APG automatic activation)", async () => {
    seedStore({ withInventory: ["ä"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await act(async () => {
      fireEvent.keyDown(screen.getByTestId("touch-mode-tabs"), {
        key: "ArrowRight",
      });
    });

    expect(
      screen.getByTestId("touch-mode-tab-key").getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByTestId("touch-key-mode-back")).toBeTruthy();

    // End/Home wrap correctly too — Home from the key tab returns to character.
    await act(async () => {
      fireEvent.keyDown(screen.getByTestId("touch-mode-tabs"), {
        key: "Home",
      });
    });
    expect(
      screen
        .getByTestId("touch-mode-tab-character")
        .getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("switching modes twice loses nothing from the by-character draft (FR-036a/b spot check)", async () => {
    seedStore({ withInventory: ["中", "日"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    // Configure "中" via long-press K_A.
    await changeSelectMenu(
      screen.getByLabelText(/Host key for long-press/i),
      "K_A",
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Apply touch method for/i }),
    );
    await waitFor(() => {
      expect(
        useWorkingCopyStore.getState().touchDraft?.charTouchEntries,
      ).toHaveLength(1);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-mode-tab-key"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-mode-tab-character"));
    });

    // The character-mode draft survived the round trip untouched.
    expect(useWorkingCopyStore.getState().touchDraft?.charTouchEntries).toHaveLength(1);
  });
});

describe("TouchGallery — one shared, derived set of progress figures (T075, FR-036d)", () => {
  it("reports the same 'characters still unplaced' / 'keys with no letter' figures the propose gate reads, and both move together off ONE commit — they cannot independently disagree", async () => {
    seedKeyModeFixture({ inventory: ["ñ"], includeBrokenKey: true });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    expect(screen.getByTestId("touch-progress-unplaced").textContent).toBe(
      "1 character still unplaced",
    );
    expect(
      screen.getByTestId("touch-progress-no-output-keys").textContent,
    ).toBe("1 key with no letter");

    // A single store commit — via the key-edit overlay, the mechanism this
    // feature's key mode is built around — gives the broken key real output
    // for the exact unplaced character. If these were two independently
    // maintained counters, nothing would guarantee they'd both notice.
    await act(async () => {
      useWorkingCopyStore.getState().commitKeyEdit({
        address: "phone:default:T_broken",
        kind: "set",
        fields: { output: "ñ" },
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("touch-progress-unplaced").textContent).toBe(
        "0 characters still unplaced",
      );
    });
    expect(
      screen.getByTestId("touch-progress-no-output-keys").textContent,
    ).toBe("0 keys with no letter");
  });

  it("the figures are visible — and read the same values — in both modes", async () => {
    seedKeyModeFixture({ inventory: ["ñ"], includeBrokenKey: true });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    const beforeUnplaced = screen.getByTestId("touch-progress-unplaced").textContent;
    const beforeNoOutput = screen.getByTestId("touch-progress-no-output-keys").textContent;

    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-mode-tab-key"));
    });

    expect(screen.getByTestId("touch-progress-unplaced").textContent).toBe(
      beforeUnplaced,
    );
    expect(
      screen.getByTestId("touch-progress-no-output-keys").textContent,
    ).toBe(beforeNoOutput);
  });
});

// ---------------------------------------------------------------------------
// T120 (FR-036e) — "either mode MUST be able to complete the step". Three
// distinct claims, each asserted rather than argued:
//
//   1. Completing from the KEY pane works at all — the Continue control there
//      routes into the same gate and calls onComplete.
//   2. That gate is coverage-only and mode-blind: it audits the OVERLAY-FOLDED
//      layout, so a coverage gap the author fixed with a key edit counts. This
//      is the regression that matters: gating on the unfolded layout would
//      refuse a keyboard the key view already shows as complete, i.e. force a
//      mode switch to move on.
//   3. When it refuses, it says so IN THE PANE THE AUTHOR PRESSED — a gate that
//      only explains itself in the other view is a mode switch by another name.
// ---------------------------------------------------------------------------

describe("TouchGallery — either mode completes the step (T120, FR-036e)", () => {
  it("Continue in the KEY pane completes the step when coverage passes", async () => {
    seedKeyModeFixture({ inventory: ["a"], includeBrokenKey: false, coveringCharKey: "a" });
    const onComplete = vi.fn();
    await act(async () => {
      render(<TouchGallery onComplete={onComplete} onBack={vi.fn()} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-mode-tab-key"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-key-mode-continue"));
    });

    // No mode switch was required, and nothing about which view was active
    // entered the decision.
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("credits a coverage gap fixed through the key-edit OVERLAY — the gate audits the folded layout, not the unfolded one", async () => {
    // "ñ" is unreachable on the shipped layout: T_broken types nothing.
    seedKeyModeFixture({ inventory: ["ñ"], includeBrokenKey: true });
    const onComplete = vi.fn();
    await act(async () => {
      render(<TouchGallery onComplete={onComplete} onBack={vi.fn()} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-mode-tab-key"));
    });

    // Before the fix, the gate refuses — from the key pane.
    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-key-mode-continue"));
    });
    expect(onComplete).not.toHaveBeenCalled();

    // The author fixes it the by-key way: one overlay commit gives the broken
    // key real output. The overlay is the ONLY place several key commands write
    // (useKeyCommands' add/remove/suppress), so this is exactly the work a gate
    // reading the unfolded layout would fail to see.
    await act(async () => {
      useWorkingCopyStore.getState().commitKeyEdit({
        address: "phone:default:T_broken",
        kind: "set",
        fields: { output: "ñ" },
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId("touch-progress-unplaced").textContent).toBe(
        "0 characters still unplaced",
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-key-mode-continue"));
    });

    // Completed from the key pane, on by-key work alone — never sent back to
    // the character walk to re-do it there.
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("states its refusal inside the key pane, naming the uncovered character", async () => {
    seedKeyModeFixture({ inventory: ["ñ"], includeBrokenKey: true });
    const onComplete = vi.fn();
    await act(async () => {
      render(<TouchGallery onComplete={onComplete} onBack={vi.fn()} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-mode-tab-key"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-key-mode-continue"));
    });

    expect(onComplete).not.toHaveBeenCalled();
    // The character-mode pane is not rendered at all in key mode (see the
    // T072 view-swap test), so an alert found here is the key pane's own.
    const alerts = screen.getAllByRole("alert");
    const text = alerts.map((a) => a.textContent ?? "").join(" ");
    expect(text).toContain("has no touch mechanism");
    expect(text).toContain("ñ");
  });

  it("does not clear either in-progress surface on completion — the by-character draft is emitted and the key-edit overlay survives", async () => {
    seedKeyModeFixture({ inventory: ["a"], includeBrokenKey: true, coveringCharKey: "a" });
    const onComplete = vi.fn();
    await act(async () => {
      render(<TouchGallery onComplete={onComplete} onBack={vi.fn()} />);
    });

    await act(async () => {
      useWorkingCopyStore.getState().commitKeyEdit({
        address: "phone:default:T_broken",
        kind: "set",
        fields: { text: "x" },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-mode-tab-key"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-key-mode-continue"));
    });

    expect(onComplete).toHaveBeenCalledOnce();
    // "neither is silently discarded": the overlay is still there after the
    // step completes. Dropping it here is precisely the tidy-up someone adds
    // later, and it would throw away the author's by-key work.
    expect(useWorkingCopyStore.getState().keyEditOverlay.ops).toHaveLength(1);
  });
});

describe("TouchGallery — undo affordance states what it will undo (T076, FR-036g)", () => {
  it("reads 'Nothing to undo' and is disabled when the shared stack is empty", async () => {
    seedStore({ withInventory: ["ä"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    const undoBtn = screen.getByTestId(
      "touch-undo-button",
    ) as HTMLButtonElement;
    expect(undoBtn.disabled).toBe(true);
    expect(undoBtn.getAttribute("aria-label")).toBe("Nothing to undo");
  });

  it("names a deleted touch method (character-mode work) when that is the top of the stack", async () => {
    seedStore({ withInventory: ["ä"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await act(async () => {
      useWorkingCopyStore
        .getState()
        .deleteTouchKey("phone:default:K_A");
    });

    await waitFor(() => {
      const undoBtn = screen.getByTestId(
        "touch-undo-button",
      ) as HTMLButtonElement;
      expect(undoBtn.disabled).toBe(false);
      expect(undoBtn.getAttribute("aria-label")).toContain("K_A");
    });
  });

  it("names the key edit (key-mode work) instead, once that becomes the top of the stack after a mode switch — a silent cross-mode undo would read as a defect", async () => {
    seedStore({ withInventory: ["ä"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await act(async () => {
      useWorkingCopyStore.getState().deleteTouchKey("phone:default:K_A");
    });
    await waitFor(() => {
      expect(
        screen.getByTestId("touch-undo-button").getAttribute("aria-label"),
      ).toContain("K_A");
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-mode-tab-key"));
    });
    await act(async () => {
      useWorkingCopyStore.getState().commitKeyEdit({
        address: "phone:default:K_B",
        kind: "suppress",
        spClass: 9,
        sentinelId: "T_none",
      });
    });

    await waitFor(() => {
      const label = screen
        .getByTestId("touch-undo-button")
        .getAttribute("aria-label");
      expect(label).toContain("K_B");
      expect(label).not.toContain("K_A");
    });
  });

  it("clicking Undo pops the shared stack via the store's existing undoDelete", async () => {
    seedStore({ withInventory: ["ä"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
    });

    await act(async () => {
      useWorkingCopyStore.getState().deleteTouchKey("phone:default:K_A");
    });
    await waitFor(() => {
      expect(useWorkingCopyStore.getState().undoStack).toHaveLength(1);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-undo-button"));
    });

    expect(useWorkingCopyStore.getState().undoStack).toHaveLength(0);
    expect(useWorkingCopyStore.getState().isTouchKeyDeleted("phone:default:K_A")).toBe(false);
  });

  // T057 (FR-040): every new spec-065 edit kind — `move`, the four newly
  // editable fields (all committed as `kind: "set"`), and every gesture edit
  // (`setSubKey` / `removeSubKey`) — rides the SAME `commitKeyEdit` seam
  // `describeUndoTarget` already reads generically by `op.kind`, so each one
  // both names itself in the affordance and pops via the one undo button.
  it.each([
    { opKind: "move" as const, op: { address: "phone:default:K_B", kind: "move" as const, direction: "left" as const } },
    { opKind: "set" as const, op: { address: "phone:default:K_B", kind: "set" as const, fields: { hint: "alt" } } },
    { opKind: "set" as const, op: { address: "phone:default:K_B", kind: "set" as const, fields: { width: 120 } } },
    { opKind: "set" as const, op: { address: "phone:default:K_B", kind: "set" as const, fields: { pad: 5 } } },
    { opKind: "set" as const, op: { address: "phone:default:K_B", kind: "set" as const, fields: { layer: "shift" } } },
    {
      opKind: "setSubKey" as const,
      op: {
        address: "phone:default:K_B",
        kind: "setSubKey" as const,
        sub: { kind: "flick" as const, id: "ne" },
        fields: { id: "ne", text: "É" },
      },
    },
    {
      opKind: "removeSubKey" as const,
      op: {
        address: "phone:default:K_B",
        kind: "removeSubKey" as const,
        sub: { kind: "sk" as const, id: "T_ks_1" },
      },
    },
  ])(
    "names and undoes a '$opKind' key edit through the shared stack",
    async ({ opKind, op }) => {
      seedStore({ withInventory: ["ä"] });
      await act(async () => {
        render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />);
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId("touch-mode-tab-key"));
      });
      await act(async () => {
        useWorkingCopyStore.getState().commitKeyEdit(op);
      });

      await waitFor(() => {
        const undoBtn = screen.getByTestId(
          "touch-undo-button",
        ) as HTMLButtonElement;
        expect(undoBtn.disabled).toBe(false);
        const label = undoBtn.getAttribute("aria-label") ?? "";
        expect(label).toContain(opKind);
        expect(label).toContain("K_B");
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId("touch-undo-button"));
      });

      expect(useWorkingCopyStore.getState().undoStack).toHaveLength(0);
      expect(useWorkingCopyStore.getState().keyEditOverlay.ops).toHaveLength(0);
    },
  );
});

describe("describeUndoTarget — pure structural description of the undo stack's top entry (T076)", () => {
  it("returns null for an empty stack", () => {
    expect(describeUndoTarget(undefined, [])).toBeNull();
  });

  it("describes a node deletion", () => {
    expect(describeUndoTarget({ k: "n", id: "node-1" }, [])).toEqual({
      kind: "node",
      id: "node-1",
    });
  });

  it("describes an item deletion", () => {
    expect(describeUndoTarget({ k: "i", id: "item-1" }, [])).toEqual({
      kind: "item",
      id: "item-1",
    });
  });

  it("describes a batch cascade by its total count", () => {
    expect(
      describeUndoTarget(
        { k: "batch", nodeIds: ["n1", "n2"], itemIds: ["i1"] },
        [],
      ),
    ).toEqual({ kind: "batch", count: 3 });
  });

  it("describes a touch-method deletion by its parsed key id", () => {
    expect(
      describeUndoTarget({ k: "t", id: "phone:default:K_A" }, []),
    ).toEqual({ kind: "touchKey", keyId: "K_A" });
  });

  it("describes a key edit by looking up the matching op via seq, naming its kind and key id", () => {
    const ops = [
      { seq: 0, address: "phone:default:K_A", kind: "suppress", spClass: 9 as const, sentinelId: "T_none" },
      { seq: 1, address: "phone:default:K_B", kind: "rename", toId: "K_C" },
    ];
    expect(describeUndoTarget({ k: "k", seq: 1 }, ops)).toEqual({
      kind: "keyEdit",
      keyId: "K_B",
      opKind: "rename",
    });
  });

  it("returns null for a 'k' entry whose op has already been evicted", () => {
    expect(describeUndoTarget({ k: "k", seq: 5 }, [])).toBeNull();
  });

  // spec 065 T057 (FR-040): the move op, the four newly-editable `set` fields
  // (hint/width/pad/layer), and the two gesture-edit kinds all commit through
  // the same choke point as suppress/rename above — these four cases confirm
  // describeUndoTarget names each of them correctly too, not just the two
  // kinds spec 063 originally covered.

  it("describes a move edit by its direction and key id", () => {
    const ops = [
      { seq: 0, address: "phone:default:K_A", kind: "move", direction: "right" as const },
    ];
    expect(describeUndoTarget({ k: "k", seq: 0 }, ops)).toEqual({
      kind: "keyEdit",
      keyId: "K_A",
      opKind: "move",
    });
  });

  it("describes a set edit carrying one of the four spec 065 fields (hint/width/pad/layer)", () => {
    const ops = [
      { seq: 0, address: "phone:default:K_A", kind: "set", fields: { hint: "alt" } },
    ];
    expect(describeUndoTarget({ k: "k", seq: 0 }, ops)).toEqual({
      kind: "keyEdit",
      keyId: "K_A",
      opKind: "set",
    });
  });

  it("describes a gesture text edit (setSubKey) by its parent key id", () => {
    const ops = [
      {
        seq: 0,
        address: "phone:default:K_A",
        kind: "setSubKey",
        sub: { kind: "flick" as const, id: "n" },
        fields: { text: "̀" },
      },
    ];
    expect(describeUndoTarget({ k: "k", seq: 0 }, ops)).toEqual({
      kind: "keyEdit",
      keyId: "K_A",
      opKind: "setSubKey",
    });
  });

  it("describes a gesture removal (removeSubKey) by its parent key id", () => {
    const ops = [
      {
        seq: 0,
        address: "phone:default:K_A",
        kind: "removeSubKey",
        sub: { kind: "flick" as const, id: "n" },
      },
    ];
    expect(describeUndoTarget({ k: "k", seq: 0 }, ops)).toEqual({
      kind: "keyEdit",
      keyId: "K_A",
      opKind: "removeSubKey",
    });
  });
});
