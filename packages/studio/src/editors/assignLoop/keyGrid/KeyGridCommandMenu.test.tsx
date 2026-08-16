// Unit tests for KeyGridCommandMenu (spec 063 T111; FR-021, FR-020b).
//
// Coverage:
//   1. APG menu structure — role="menu" with one role="menuitem" per command,
//      each showing its keybinding hint (the visible proof that every pointer
//      command also has a keyboard route).
//   2. Focus opens on the first ENABLED command, not merely the first one.
//   3. ArrowUp/ArrowDown/Home/End move the roving tabindex, wrapping at both
//      ends, and DO land on disabled items (the deliberate APG relaxation —
//      see the component's module doc).
//   4. Escape closes and does not bubble (FR-020b gives Escape a different
//      meaning at the grid).
//   5. Running an enabled command invokes it and closes; a disabled one does
//      neither.
//   6. A click outside closes.
//   7. The pointer anchor positions the menu; a keyboard invocation (no
//      anchor) renders in normal flow instead.

import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../../../test/renderWithI18n.tsx";
import { KeyGridCommandMenu } from "./KeyGridCommandMenu.tsx";
import type { KeyGridCommandDescriptor } from "./useKeyCommands.ts";

afterEach(() => {
  cleanup();
});

function makeCommand(
  overrides: Partial<KeyGridCommandDescriptor> & { id: string },
): KeyGridCommandDescriptor {
  return {
    id: overrides.id,
    label: overrides.label ?? overrides.id,
    enabled: overrides.enabled ?? true,
    run: overrides.run ?? vi.fn(),
    ...(overrides.shortcutKey !== undefined ? { shortcutKey: overrides.shortcutKey } : {}),
  };
}

/** The realistic three-command set useKeyCommands produces, with the middle one inapplicable. */
function makeCommands(runs: Record<string, () => void> = {}) {
  return [
    makeCommand({
      id: "add-key-after",
      label: "Add key after",
      shortcutKey: "Insert",
      ...(runs["add-key-after"] ? { run: runs["add-key-after"] } : {}),
    }),
    makeCommand({
      id: "follow-next-layer",
      label: "Go to this key's layer",
      shortcutKey: "Ctrl+Enter",
      enabled: false,
      ...(runs["follow-next-layer"] ? { run: runs["follow-next-layer"] } : {}),
    }),
    makeCommand({
      id: "open-command-menu",
      label: "More commands",
      shortcutKey: "ContextMenu",
      ...(runs["open-command-menu"] ? { run: runs["open-command-menu"] } : {}),
    }),
  ];
}

describe("KeyGridCommandMenu — APG menu structure", () => {
  it("renders role=menu with one role=menuitem per command, each showing its keybinding hint", () => {
    render(<KeyGridCommandMenu commands={makeCommands()} onClose={vi.fn()} />);

    expect(screen.getByRole("menu")).not.toBeNull();
    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.textContent)).toEqual([
      "Add key afterInsert",
      "Go to this key's layerCtrl+Enter",
      "More commandsContextMenu",
    ]);
  });

  it("marks an inapplicable command aria-disabled rather than removing it — the command stays discoverable", () => {
    render(<KeyGridCommandMenu commands={makeCommands()} onClose={vi.fn()} />);

    expect(
      screen.getByTestId("key-grid-command-follow-next-layer").getAttribute("aria-disabled"),
    ).toBe("true");
    // Not the `disabled` attribute — that would make it unfocusable and
    // silent to a screen reader.
    expect(
      screen.getByTestId("key-grid-command-follow-next-layer").hasAttribute("disabled"),
    ).toBe(false);
    expect(
      screen.getByTestId("key-grid-command-add-key-after").getAttribute("aria-disabled"),
    ).toBe("false");
  });

  it("opens with focus on the first ENABLED command, not merely the first one", () => {
    const commands = [
      makeCommand({ id: "disabled-first", enabled: false }),
      makeCommand({ id: "enabled-second" }),
    ];
    render(<KeyGridCommandMenu commands={commands} onClose={vi.fn()} />);

    const second = screen.getByTestId("key-grid-command-enabled-second");
    expect(document.activeElement).toBe(second);
    expect(second.getAttribute("tabindex")).toBe("0");
    expect(
      screen.getByTestId("key-grid-command-disabled-first").getAttribute("tabindex"),
    ).toBe("-1");
  });

  it("keeps exactly one item in the Tab order at a time (roving tabindex)", () => {
    render(<KeyGridCommandMenu commands={makeCommands()} onClose={vi.fn()} />);

    const tabbable = screen
      .getAllByRole("menuitem")
      .filter((i) => i.getAttribute("tabindex") === "0");
    expect(tabbable).toHaveLength(1);
  });
});

describe("KeyGridCommandMenu — keyboard navigation", () => {
  it("ArrowDown moves to the next item INCLUDING a disabled one (the deliberate APG relaxation)", () => {
    render(<KeyGridCommandMenu commands={makeCommands()} onClose={vi.fn()} />);
    const menu = screen.getByRole("menu");

    // Opens on "add-key-after" (index 0); the next item is the DISABLED one.
    fireEvent.keyDown(menu, { key: "ArrowDown" });

    expect(document.activeElement).toBe(
      screen.getByTestId("key-grid-command-follow-next-layer"),
    );
  });

  it("ArrowDown wraps from the last item to the first", () => {
    render(<KeyGridCommandMenu commands={makeCommands()} onClose={vi.fn()} />);
    const menu = screen.getByRole("menu");

    fireEvent.keyDown(menu, { key: "End" });
    expect(document.activeElement).toBe(
      screen.getByTestId("key-grid-command-open-command-menu"),
    );

    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(
      screen.getByTestId("key-grid-command-add-key-after"),
    );
  });

  it("ArrowUp wraps from the first item to the last", () => {
    render(<KeyGridCommandMenu commands={makeCommands()} onClose={vi.fn()} />);

    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowUp" });

    expect(document.activeElement).toBe(
      screen.getByTestId("key-grid-command-open-command-menu"),
    );
  });

  it("Home and End jump to the first and last items", () => {
    render(<KeyGridCommandMenu commands={makeCommands()} onClose={vi.fn()} />);
    const menu = screen.getByRole("menu");

    fireEvent.keyDown(menu, { key: "End" });
    expect(document.activeElement).toBe(
      screen.getByTestId("key-grid-command-open-command-menu"),
    );

    fireEvent.keyDown(menu, { key: "Home" });
    expect(document.activeElement).toBe(
      screen.getByTestId("key-grid-command-add-key-after"),
    );
  });

  it("Escape closes the menu and does NOT bubble — FR-020b gives Escape a different meaning at the grid", () => {
    const onClose = vi.fn();
    const onOuterKeyDown = vi.fn();
    render(
      <div onKeyDown={onOuterKeyDown}>
        <KeyGridCommandMenu commands={makeCommands()} onClose={onClose} />
      </div>,
    );

    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onOuterKeyDown).not.toHaveBeenCalled();
  });

  it("ignores keys it does not own, leaving them to bubble", () => {
    const onClose = vi.fn();
    const onOuterKeyDown = vi.fn();
    render(
      <div onKeyDown={onOuterKeyDown}>
        <KeyGridCommandMenu commands={makeCommands()} onClose={onClose} />
      </div>,
    );

    fireEvent.keyDown(screen.getByRole("menu"), { key: "a" });

    expect(onClose).not.toHaveBeenCalled();
    expect(onOuterKeyDown).toHaveBeenCalled();
  });
});

describe("KeyGridCommandMenu — running and dismissing", () => {
  it("runs an enabled command and then closes", () => {
    const run = vi.fn();
    const onClose = vi.fn();
    render(
      <KeyGridCommandMenu
        commands={makeCommands({ "add-key-after": run })}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByTestId("key-grid-command-add-key-after"));

    expect(run).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("neither runs nor closes for an aria-disabled command — the DOM-level click must not fire it", () => {
    const run = vi.fn();
    const onClose = vi.fn();
    render(
      <KeyGridCommandMenu
        commands={makeCommands({ "follow-next-layer": run })}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByTestId("key-grid-command-follow-next-layer"));

    expect(run).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on a mousedown outside the menu", () => {
    const onClose = vi.fn();
    render(<KeyGridCommandMenu commands={makeCommands()} onClose={onClose} />);

    fireEvent.mouseDown(document.body);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on a mousedown INSIDE the menu", () => {
    const onClose = vi.fn();
    render(<KeyGridCommandMenu commands={makeCommands()} onClose={onClose} />);

    fireEvent.mouseDown(screen.getByTestId("key-grid-command-add-key-after"));

    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("KeyGridCommandMenu — positioning", () => {
  it("pins itself to the pointer anchor when one is supplied", () => {
    render(
      <KeyGridCommandMenu
        commands={makeCommands()}
        anchor={{ x: 123, y: 456 }}
        onClose={vi.fn()}
      />,
    );

    const menu = screen.getByRole("menu");
    expect(menu.style.position).toBe("fixed");
    expect(menu.style.left).toBe("123px");
    expect(menu.style.top).toBe("456px");
  });

  it("renders in normal flow for a keyboard invocation, which has no pointer position", () => {
    render(<KeyGridCommandMenu commands={makeCommands()} onClose={vi.fn()} />);

    const menu = screen.getByRole("menu");
    expect(menu.style.position).toBe("static");
    expect(menu.style.left).toBe("");
  });
});
