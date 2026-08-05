// Unit tests for useKeyCommands (spec 058 T094; FR-029, US4 AS1).
//
// Coverage:
//   1. `buildAddKeyAfterOutcome` (the pure decision both invocation routes
//      share) proposes `U_FFFD` — never `T_new_<n>` — with `position: "after"`
//      addressed at the anchor, and no rule required.
//   2. An in-layer collision (a second unassigned added key) is rejected,
//      never silently retried with a different id (FR-045).
//   3. An unparseable anchor address is rejected defensively.
//   4. The hook: Insert (no modifiers) and the command descriptor's `run()`
//      both invoke `onAddKeyAfter` with an IDENTICAL outcome — the "one
//      requirement" this file's module doc names.
//   5. Insert is ignored with any modifier held (Shift/Ctrl/Alt/Meta) and
//      when nothing is selected.
//   6. The command descriptor's `enabled` flag reflects selection state.
//   7. `composeAddKeyAfterLabel` renders the English source text with no
//      `i18n` instance supplied.

import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { TouchKeyIR, TouchLayoutIR } from "@keyboard-studio/contracts";
import { touchKeyAddress } from "@keyboard-studio/engine";
import type { KeyGridAnnotationCounts, KeyGridCellViewModel } from "./keyGridViewModel.ts";
import {
  buildAddKeyAfterOutcome,
  composeAddKeyAfterLabel,
  useKeyCommands,
  type AddKeyAfterOutcome,
} from "./useKeyCommands.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EMPTY_ANNOTATIONS: KeyGridAnnotationCounts = { longpress: 0, multitap: 0, flick: 0 };

function makeCell(id: string, overrides: Partial<KeyGridCellViewModel> = {}): KeyGridCellViewModel {
  return {
    address: touchKeyAddress("phone", "default", id),
    id,
    keycap: id,
    sp: 0,
    padPct: 15,
    widthPct: 100,
    producedChars: [],
    annotations: EMPTY_ANNOTATIONS,
    findings: [],
    ...overrides,
  };
}

function makeTouchKey(id: string, overrides: Partial<TouchKeyIR> = {}): TouchKeyIR {
  return { nodeId: `node_${id}`, id, ...overrides };
}

function makeLayout(keys: readonly TouchKeyIR[]): TouchLayoutIR {
  return {
    platforms: [{ id: "phone", layers: [{ id: "default", rows: [{ keys: [...keys] }] }] }],
    nodeIds: [],
  };
}

// ---------------------------------------------------------------------------
// buildAddKeyAfterOutcome — the pure decision
// ---------------------------------------------------------------------------

describe("buildAddKeyAfterOutcome", () => {
  it("proposes U_FFFD (never T_new_<n>) with no rule required", () => {
    const anchor = makeCell("K_A");
    const layout = makeLayout([makeTouchKey("K_A")]);

    const outcome = buildAddKeyAfterOutcome(anchor, layout);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error("expected ok outcome");
    expect(outcome.result.proposal.id).toBe("U_FFFD");
    expect(outcome.result.proposal.id).not.toMatch(/^T_new_/);
    expect(outcome.result.proposal.ruleRequired).toBe(false);
    expect(outcome.result.proposal.path).toBe("unicode-default");
  });

  it("builds an 'add' op positioned AFTER the anchor, addressed at it, with no authored geometry", () => {
    const anchor = makeCell("K_A");
    const layout = makeLayout([makeTouchKey("K_A")]);

    const outcome = buildAddKeyAfterOutcome(anchor, layout);
    if (!outcome.ok) throw new Error("expected ok outcome");

    expect(outcome.result.op).toEqual({
      address: anchor.address,
      kind: "add",
      position: "after",
      key: { id: "U_FFFD", text: "", sp: 0 },
    });
  });

  it("rejects an in-layer id collision rather than silently minting a different id (FR-045)", () => {
    const anchor = makeCell("K_A");
    // A key already carries the same U_FFFD placeholder in this layer — the
    // "second unassigned added key" edge case (spec.md Edge Cases: "Adding a
    // key that collides with an existing id in the same layer... Must be
    // rejected at edit time").
    const layout = makeLayout([makeTouchKey("K_A"), makeTouchKey("U_FFFD")]);

    const outcome = buildAddKeyAfterOutcome(anchor, layout);

    expect(outcome).toEqual({ ok: false, reason: "duplicate-in-layer" });
  });

  it("does not reject against a same-id key on a DIFFERENT layer (legitimate idiom, not a collision)", () => {
    const anchor = makeCell("K_A");
    const layout: TouchLayoutIR = {
      platforms: [
        {
          id: "phone",
          layers: [
            { id: "default", rows: [{ keys: [makeTouchKey("K_A")] }] },
            { id: "shift", rows: [{ keys: [makeTouchKey("U_FFFD")] }] },
          ],
        },
      ],
      nodeIds: [],
    };

    const outcome = buildAddKeyAfterOutcome(anchor, layout);

    expect(outcome.ok).toBe(true);
  });

  it("rejects defensively when the anchor's address does not parse", () => {
    const anchor = makeCell("K_A", { address: "not-a-valid-address" });
    const layout = makeLayout([makeTouchKey("K_A")]);

    const outcome = buildAddKeyAfterOutcome(anchor, layout);

    expect(outcome).toEqual({ ok: false, reason: "malformed" });
  });
});

// ---------------------------------------------------------------------------
// composeAddKeyAfterLabel — no i18n instance supplied falls back to the
// English source text (same convention as useModeContextCarry.ts's
// composeCarryKindLabel test).
// ---------------------------------------------------------------------------

describe("composeAddKeyAfterLabel", () => {
  it("renders the English source text with no i18n instance", () => {
    expect(composeAddKeyAfterLabel()).toBe("Add key after");
  });
});

// ---------------------------------------------------------------------------
// useKeyCommands — Insert and the command descriptor share ONE
// implementation
// ---------------------------------------------------------------------------

describe("useKeyCommands", () => {
  function renderHost(selectedCell: KeyGridCellViewModel | null, layout: TouchLayoutIR) {
    const onAddKeyAfter = vi.fn<(outcome: AddKeyAfterOutcome) => void>();
    const { result } = renderHook(() =>
      useKeyCommands({ selectedCell, layout, onAddKeyAfter }),
    );
    return { result, onAddKeyAfter };
  }

  it("Insert (no modifiers) invokes onAddKeyAfter with the same outcome buildAddKeyAfterOutcome computes", () => {
    const anchor = makeCell("K_A");
    const layout = makeLayout([makeTouchKey("K_A")]);
    const { result, onAddKeyAfter } = renderHost(anchor, layout);

    const preventDefault = vi.fn();
    result.current.handleKeyDown({
      key: "Insert",
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      preventDefault,
    } as unknown as Parameters<typeof result.current.handleKeyDown>[0]);

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(onAddKeyAfter).toHaveBeenCalledOnce();
    expect(onAddKeyAfter).toHaveBeenCalledWith(buildAddKeyAfterOutcome(anchor, layout));
  });

  it("the command descriptor's run() invokes onAddKeyAfter with the SAME outcome Insert produces — one implementation, two routes", () => {
    const anchor = makeCell("K_A");
    const layout = makeLayout([makeTouchKey("K_A")]);
    const { result, onAddKeyAfter } = renderHost(anchor, layout);

    const addCommand = result.current.commands.find((c) => c.id === "add-key-after");
    if (addCommand === undefined) throw new Error("expected an add-key-after command");
    addCommand.run();

    const viaInsert = vi.fn<(outcome: AddKeyAfterOutcome) => void>();
    const { result: insertResult } = renderHook(() =>
      useKeyCommands({ selectedCell: anchor, layout, onAddKeyAfter: viaInsert }),
    );
    insertResult.current.handleKeyDown({
      key: "Insert",
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      preventDefault: () => {},
    } as unknown as Parameters<typeof insertResult.current.handleKeyDown>[0]);

    expect(onAddKeyAfter).toHaveBeenCalledOnce();
    expect(viaInsert).toHaveBeenCalledOnce();
    expect(onAddKeyAfter.mock.calls[0]?.[0]).toEqual(viaInsert.mock.calls[0]?.[0]);
  });

  it.each(["shiftKey", "ctrlKey", "altKey", "metaKey"] as const)(
    "ignores Insert when %s is held (reserved for a future binding)",
    (modifier) => {
      const anchor = makeCell("K_A");
      const layout = makeLayout([makeTouchKey("K_A")]);
      const { result, onAddKeyAfter } = renderHost(anchor, layout);

      const preventDefault = vi.fn();
      result.current.handleKeyDown({
        key: "Insert",
        shiftKey: false,
        ctrlKey: false,
        altKey: false,
        metaKey: false,
        [modifier]: true,
        preventDefault,
      } as unknown as Parameters<typeof result.current.handleKeyDown>[0]);

      expect(preventDefault).not.toHaveBeenCalled();
      expect(onAddKeyAfter).not.toHaveBeenCalled();
    },
  );

  it("ignores a non-Insert key", () => {
    const anchor = makeCell("K_A");
    const layout = makeLayout([makeTouchKey("K_A")]);
    const { result, onAddKeyAfter } = renderHost(anchor, layout);

    result.current.handleKeyDown({
      key: "Delete",
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      preventDefault: vi.fn(),
    } as unknown as Parameters<typeof result.current.handleKeyDown>[0]);

    expect(onAddKeyAfter).not.toHaveBeenCalled();
  });

  it("Insert is a no-op when nothing is selected, and the command is disabled", () => {
    const layout = makeLayout([makeTouchKey("K_A")]);
    const { result, onAddKeyAfter } = renderHost(null, layout);

    const addCommand = result.current.commands.find((c) => c.id === "add-key-after");
    expect(addCommand?.enabled).toBe(false);

    result.current.handleKeyDown({
      key: "Insert",
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      preventDefault: vi.fn(),
    } as unknown as Parameters<typeof result.current.handleKeyDown>[0]);

    expect(onAddKeyAfter).not.toHaveBeenCalled();
  });

  it("the command descriptor is enabled when a key is selected", () => {
    const anchor = makeCell("K_A");
    const layout = makeLayout([makeTouchKey("K_A")]);
    const { result } = renderHost(anchor, layout);

    const addCommand = result.current.commands.find((c) => c.id === "add-key-after");
    expect(addCommand?.enabled).toBe(true);
    expect(addCommand?.shortcutKey).toBe("Insert");
    expect(addCommand?.label).toBe("Add key after");
  });
});

// ---------------------------------------------------------------------------
// T111's two keyboard routes (FR-021, FR-020b) — the keyboard half of the
// pointer commands KeyGridCell.tsx owns. See useKeyCommands.ts's module doc,
// "T111's two keyboard routes", for why these bindings and not Alt+Arrow.
// ---------------------------------------------------------------------------

describe("useKeyCommands — T111's keyboard routes", () => {
  function renderHost(
    selectedCell: KeyGridCellViewModel | null,
    layout: TouchLayoutIR,
  ) {
    const onAddKeyAfter = vi.fn<(outcome: AddKeyAfterOutcome) => void>();
    const onOpenCommandMenu = vi.fn();
    const onFollowNextLayer = vi.fn();
    const { result } = renderHook(() =>
      useKeyCommands({
        selectedCell,
        layout,
        onAddKeyAfter,
        onOpenCommandMenu,
        onFollowNextLayer,
      }),
    );
    return { result, onAddKeyAfter, onOpenCommandMenu, onFollowNextLayer };
  }

  /** Fire one synthetic keydown through the hook's handler. */
  function press(
    result: { current: ReturnType<typeof useKeyCommands> },
    key: string,
    modifiers: Partial<Record<"shiftKey" | "ctrlKey" | "altKey" | "metaKey", boolean>> = {},
  ) {
    const preventDefault = vi.fn();
    result.current.handleKeyDown({
      key,
      shiftKey: modifiers.shiftKey ?? false,
      ctrlKey: modifiers.ctrlKey ?? false,
      altKey: modifiers.altKey ?? false,
      metaKey: modifiers.metaKey ?? false,
      preventDefault,
    } as unknown as Parameters<typeof result.current.handleKeyDown>[0]);
    return { preventDefault };
  }

  it("ContextMenu opens the command menu with NO anchor — a keyboard invocation has no pointer position", () => {
    const anchor = makeCell("K_A");
    const layout = makeLayout([makeTouchKey("K_A")]);
    const { result, onOpenCommandMenu } = renderHost(anchor, layout);

    const { preventDefault } = press(result, "ContextMenu");

    expect(onOpenCommandMenu).toHaveBeenCalledTimes(1);
    expect(onOpenCommandMenu).toHaveBeenCalledWith(anchor);
    expect(preventDefault).toHaveBeenCalled();
  });

  it("Shift+F10 is the second, equivalent route to the same menu", () => {
    const anchor = makeCell("K_A");
    const layout = makeLayout([makeTouchKey("K_A")]);
    const { result, onOpenCommandMenu } = renderHost(anchor, layout);

    press(result, "F10", { shiftKey: true });

    expect(onOpenCommandMenu).toHaveBeenCalledWith(anchor);
  });

  it("bare F10 is NOT claimed — only Shift+F10 is the menu binding", () => {
    const anchor = makeCell("K_A");
    const layout = makeLayout([makeTouchKey("K_A")]);
    const { result, onOpenCommandMenu } = renderHost(anchor, layout);

    const { preventDefault } = press(result, "F10");

    expect(onOpenCommandMenu).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("Ctrl+Enter follows the selected key's nextlayer, and claims the event so the native <button> activation cannot also re-select", () => {
    const anchor = makeCell("K_A", { nextlayer: "shift" });
    const layout = makeLayout([makeTouchKey("K_A")]);
    const { result, onFollowNextLayer } = renderHost(anchor, layout);

    const { preventDefault } = press(result, "Enter", { ctrlKey: true });

    expect(onFollowNextLayer).toHaveBeenCalledTimes(1);
    expect(onFollowNextLayer).toHaveBeenCalledWith(anchor, "shift");
    expect(preventDefault).toHaveBeenCalled();
  });

  it("Ctrl+Enter does nothing for a key that switches nowhere", () => {
    const anchor = makeCell("K_A");
    const layout = makeLayout([makeTouchKey("K_A")]);
    const { result, onFollowNextLayer } = renderHost(anchor, layout);

    press(result, "Enter", { ctrlKey: true });

    expect(onFollowNextLayer).not.toHaveBeenCalled();
  });

  it("plain Enter is NOT claimed — FR-020b gives it to the inspector, a different surface", () => {
    const anchor = makeCell("K_A", { nextlayer: "shift" });
    const layout = makeLayout([makeTouchKey("K_A")]);
    const { result, onFollowNextLayer } = renderHost(anchor, layout);

    const { preventDefault } = press(result, "Enter");

    expect(onFollowNextLayer).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("does NOT claim Alt+ArrowRight — useGridNav.ts claims arrows regardless of modifiers, so an Alt+Arrow binding here would double-fire (see module doc)", () => {
    const anchor = makeCell("K_A", { nextlayer: "shift" });
    const layout = makeLayout([makeTouchKey("K_A")]);
    const { result, onFollowNextLayer, onOpenCommandMenu, onAddKeyAfter } =
      renderHost(anchor, layout);

    const { preventDefault } = press(result, "ArrowRight", { altKey: true });

    expect(onFollowNextLayer).not.toHaveBeenCalled();
    expect(onOpenCommandMenu).not.toHaveBeenCalled();
    expect(onAddKeyAfter).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("neither route fires when nothing is selected", () => {
    const layout = makeLayout([makeTouchKey("K_A")]);
    const { result, onOpenCommandMenu, onFollowNextLayer } = renderHost(null, layout);

    press(result, "ContextMenu");
    press(result, "Enter", { ctrlKey: true });

    expect(onOpenCommandMenu).not.toHaveBeenCalled();
    expect(onFollowNextLayer).not.toHaveBeenCalled();
  });

  it("exposes both commands as descriptors carrying their keybinding hints", () => {
    const anchor = makeCell("K_A", { nextlayer: "shift" });
    const layout = makeLayout([makeTouchKey("K_A")]);
    const { result } = renderHost(anchor, layout);

    const menu = result.current.commands.find((c) => c.id === "open-command-menu");
    expect(menu?.enabled).toBe(true);
    expect(menu?.shortcutKey).toBe("ContextMenu");
    expect(menu?.label).toBe("More commands");

    const follow = result.current.commands.find((c) => c.id === "follow-next-layer");
    expect(follow?.enabled).toBe(true);
    expect(follow?.shortcutKey).toBe("Ctrl+Enter");
    expect(follow?.label).toBe("Go to this key's layer");
  });

  it("keeps 'follow next layer' in the list but DISABLED for a key with no nextlayer — discoverable, not omitted", () => {
    const anchor = makeCell("K_A");
    const layout = makeLayout([makeTouchKey("K_A")]);
    const { result } = renderHost(anchor, layout);

    const follow = result.current.commands.find((c) => c.id === "follow-next-layer");
    expect(follow).toBeDefined();
    expect(follow?.enabled).toBe(false);
  });

  it("a descriptor's run() is the SAME implementation the keyboard route uses", () => {
    const anchor = makeCell("K_A", { nextlayer: "shift" });
    const layout = makeLayout([makeTouchKey("K_A")]);
    const { result, onOpenCommandMenu, onFollowNextLayer } = renderHost(anchor, layout);

    result.current.commands.find((c) => c.id === "open-command-menu")?.run();
    result.current.commands.find((c) => c.id === "follow-next-layer")?.run();

    expect(onOpenCommandMenu).toHaveBeenCalledWith(anchor);
    expect(onFollowNextLayer).toHaveBeenCalledWith(anchor, "shift");
  });
});
