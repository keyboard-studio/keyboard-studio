// Unit tests for useCharCycleKeys — the pane-level ArrowLeft/ArrowRight
// character-cycling hook shared by MechanismGallery and TouchGallery. This
// migrates the arrow-key-navigation coverage that used to live in
// CharScrollStrip.test.tsx (the handler itself has moved up to the pane —
// see this hook's file header, and CharScrollStrip.tsx's own updated
// comment, for why) and adds coverage for the new editable/open-chooser
// guards plus the actual regression this move fixes: a keydown originating
// from a non-chip element inside the pane still cycles the selection.

import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { useCharCycleKeys, stepChar } from "./useCharCycleKeys.ts";

afterEach(() => {
  cleanup();
});

// A minimal host component that wires the hook's returned handler onto a
// pane-level wrapping div, with a handful of descendants standing in for
// the real gallery's non-chip controls (a plain button) and the
// editable/open-chooser elements the guard must leave alone.
function TestPane({
  chars,
  currentChar,
  onSelectChar,
}: {
  chars: string[];
  currentChar: string | null;
  onSelectChar: (char: string) => void;
}) {
  const handleKeyDown = useCharCycleKeys({ chars, currentChar, onSelectChar });
  return (
    <div data-testid="pane" onKeyDown={handleKeyDown}>
      {/* Stands in for a non-chip control elsewhere in the gallery pane
          (e.g. a method-chooser card button) — the regression this whole
          move fixes is that an arrow keydown bubbling from HERE, not a
          CharScrollStrip chip, must still cycle the selection. */}
      <button data-testid="other-control">Other control</button>
      <input data-testid="text-input" />
      <textarea data-testid="textarea-input" />
      <select data-testid="select-input">
        <option value="a">a</option>
      </select>
      <div data-testid="contenteditable-input" contentEditable />
      <div data-testid="listbox" role="listbox">
        <span data-testid="listbox-option">option</span>
      </div>
      <div data-testid="combobox" role="combobox">
        <span data-testid="combobox-child">combo</span>
      </div>
      <div data-testid="expanded-chooser" aria-expanded="true">
        <span data-testid="expanded-child">expanded</span>
      </div>
      {/* Stands in for the touch key-editor's key grid (T064) and the
          key-edit overlay's grid/simulator mode selector (T072) — both are
          arrow-key-consuming widgets registered in SKIP_SELECTOR per
          FR-020f / R10.7. Without BOTH entries the pane handler silently
          eats one or the other's arrows (T069). */}
      <div data-testid="key-grid" role="grid">
        <span data-testid="key-grid-child">grid cell</span>
      </div>
      <div data-testid="mode-tablist" role="tablist">
        <span data-testid="mode-tablist-child">tab</span>
      </div>
    </div>
  );
}

function dispatchKeyDown(el: Element, key: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    cancelable: true,
    bubbles: true,
  });
  el.dispatchEvent(event);
  return event;
}

describe("stepChar — pure wrap-around helper", () => {
  it("steps to the next character from the middle", () => {
    expect(stepChar(["a", "b", "c"], "b", 1)).toBe("c");
  });

  it("steps to the previous character from the middle", () => {
    expect(stepChar(["a", "b", "c"], "b", -1)).toBe("a");
  });

  it("wraps forward from the last character to the first", () => {
    expect(stepChar(["a", "b", "c"], "c", 1)).toBe("a");
  });

  it("wraps backward from the first character to the last", () => {
    expect(stepChar(["a", "b", "c"], "a", -1)).toBe("c");
  });

  it("null currentChar + forward yields the first character", () => {
    expect(stepChar(["a", "b", "c"], null, 1)).toBe("a");
  });

  it("null currentChar + backward yields the last character", () => {
    expect(stepChar(["a", "b", "c"], null, -1)).toBe("c");
  });

  it("a stale currentChar not present in chars behaves the same as null (indexOf === -1)", () => {
    expect(stepChar(["a", "b", "c"], "z", 1)).toBe("a");
    expect(stepChar(["a", "b", "c"], "z", -1)).toBe("c");
  });

  it("an empty chars list returns null regardless of direction", () => {
    expect(stepChar([], null, 1)).toBeNull();
    expect(stepChar([], "a", -1)).toBeNull();
  });
});

describe("useCharCycleKeys — ArrowLeft/ArrowRight cycle selection at the pane level", () => {
  it("ArrowRight from a middle character selects the NEXT character", () => {
    const onSelectChar = vi.fn();
    render(<TestPane chars={["a", "b", "c"]} currentChar="b" onSelectChar={onSelectChar} />);

    dispatchKeyDown(screen.getByTestId("pane"), "ArrowRight");

    expect(onSelectChar).toHaveBeenCalledTimes(1);
    expect(onSelectChar).toHaveBeenCalledWith("c");
  });

  it("ArrowRight on the LAST character wraps around to the FIRST character", () => {
    const onSelectChar = vi.fn();
    render(<TestPane chars={["a", "b", "c"]} currentChar="c" onSelectChar={onSelectChar} />);

    dispatchKeyDown(screen.getByTestId("pane"), "ArrowRight");

    expect(onSelectChar).toHaveBeenCalledTimes(1);
    expect(onSelectChar).toHaveBeenCalledWith("a");
  });

  it("ArrowLeft on the FIRST character wraps around to the LAST character", () => {
    const onSelectChar = vi.fn();
    render(<TestPane chars={["a", "b", "c"]} currentChar="a" onSelectChar={onSelectChar} />);

    dispatchKeyDown(screen.getByTestId("pane"), "ArrowLeft");

    expect(onSelectChar).toHaveBeenCalledTimes(1);
    expect(onSelectChar).toHaveBeenCalledWith("c");
  });

  it("ArrowLeft from a middle character selects the PREVIOUS character", () => {
    const onSelectChar = vi.fn();
    render(<TestPane chars={["a", "b", "c"]} currentChar="b" onSelectChar={onSelectChar} />);

    dispatchKeyDown(screen.getByTestId("pane"), "ArrowLeft");

    expect(onSelectChar).toHaveBeenCalledTimes(1);
    expect(onSelectChar).toHaveBeenCalledWith("a");
  });

  it("ArrowRight with currentChar === null selects the FIRST character", () => {
    const onSelectChar = vi.fn();
    render(<TestPane chars={["a", "b", "c"]} currentChar={null} onSelectChar={onSelectChar} />);

    dispatchKeyDown(screen.getByTestId("pane"), "ArrowRight");

    expect(onSelectChar).toHaveBeenCalledTimes(1);
    expect(onSelectChar).toHaveBeenCalledWith("a");
  });

  it("ArrowLeft with currentChar === null selects the LAST character", () => {
    const onSelectChar = vi.fn();
    render(<TestPane chars={["a", "b", "c"]} currentChar={null} onSelectChar={onSelectChar} />);

    dispatchKeyDown(screen.getByTestId("pane"), "ArrowLeft");

    expect(onSelectChar).toHaveBeenCalledTimes(1);
    expect(onSelectChar).toHaveBeenCalledWith("c");
  });

  it("an arrow key on an EMPTY chars list is a no-op — no onSelectChar call, no throw", () => {
    const onSelectChar = vi.fn();
    render(<TestPane chars={[]} currentChar={null} onSelectChar={onSelectChar} />);

    expect(() => dispatchKeyDown(screen.getByTestId("pane"), "ArrowRight")).not.toThrow();

    expect(onSelectChar).not.toHaveBeenCalled();
  });

  it("a non-arrow key (Enter) does NOT call onSelectChar", () => {
    const onSelectChar = vi.fn();
    render(<TestPane chars={["a", "b", "c"]} currentChar="b" onSelectChar={onSelectChar} />);

    dispatchKeyDown(screen.getByTestId("pane"), "Enter");

    expect(onSelectChar).not.toHaveBeenCalled();
  });

  it("a non-arrow key (a plain letter) does NOT call onSelectChar", () => {
    const onSelectChar = vi.fn();
    render(<TestPane chars={["a", "b", "c"]} currentChar="b" onSelectChar={onSelectChar} />);

    dispatchKeyDown(screen.getByTestId("pane"), "a");

    expect(onSelectChar).not.toHaveBeenCalled();
  });

  it("calls preventDefault on a handled ArrowRight, but not on an unhandled key", () => {
    const onSelectChar = vi.fn();
    render(<TestPane chars={["a", "b", "c"]} currentChar="b" onSelectChar={onSelectChar} />);
    const pane = screen.getByTestId("pane");

    const arrowEvent = dispatchKeyDown(pane, "ArrowRight");
    expect(arrowEvent.defaultPrevented).toBe(true);

    const enterEvent = dispatchKeyDown(pane, "Enter");
    expect(enterEvent.defaultPrevented).toBe(false);
  });

  it("does NOT call preventDefault on an arrow key when chars is empty (no-op stays a true no-op)", () => {
    const onSelectChar = vi.fn();
    render(<TestPane chars={[]} currentChar={null} onSelectChar={onSelectChar} />);

    const event = dispatchKeyDown(screen.getByTestId("pane"), "ArrowRight");

    expect(event.defaultPrevented).toBe(false);
  });

  describe("regression coverage: cycling works from ANY element in the pane, not just a chip button", () => {
    // This is the actual bug this hook's pane-level attachment fixes: the
    // old CharScrollStrip-scoped handler only fired while DOM focus (and
    // therefore the keydown's bubble path) was inside the strip itself. A
    // keydown dispatched from an unrelated control elsewhere in the pane
    // (e.g. TouchGallery's method chooser, which can pull focus off the
    // strip on every character change) must still cycle the selection.
    it("an ArrowRight keydown originating from a plain, non-chip button in the pane still cycles the selection", () => {
      const onSelectChar = vi.fn();
      render(<TestPane chars={["a", "b", "c"]} currentChar="b" onSelectChar={onSelectChar} />);

      dispatchKeyDown(screen.getByTestId("other-control"), "ArrowRight");

      expect(onSelectChar).toHaveBeenCalledTimes(1);
      expect(onSelectChar).toHaveBeenCalledWith("c");
    });
  });

  describe("guards: editable / open-chooser targets pass ArrowLeft/ArrowRight through untouched", () => {
    it.each([
      ["an <input>", "text-input"],
      ["a <textarea>", "textarea-input"],
      ["a <select>", "select-input"],
      ["a contenteditable element", "contenteditable-input"],
      ["an open listbox (role=listbox)", "listbox"],
      ["a descendant of an open listbox", "listbox-option"],
      ["an open combobox (role=combobox)", "combobox"],
      ["a descendant of an open combobox", "combobox-child"],
      ["an element with aria-expanded=true", "expanded-chooser"],
      ["a descendant of an aria-expanded=true element", "expanded-child"],
      ["a role=grid element (the touch key grid)", "key-grid"],
      ["a descendant of a role=grid element", "key-grid-child"],
      ["a role=tablist element (the mode selector)", "mode-tablist"],
      ["a descendant of a role=tablist element", "mode-tablist-child"],
    ])("does not cycle or preventDefault when the keydown originates from %s", (_label, testId) => {
      const onSelectChar = vi.fn();
      render(<TestPane chars={["a", "b", "c"]} currentChar="b" onSelectChar={onSelectChar} />);

      const event = dispatchKeyDown(screen.getByTestId(testId), "ArrowRight");

      expect(onSelectChar).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    });
  });

  describe("T069 regression: BOTH role=grid and role=tablist must be registered — one without the other is the exact defect", () => {
    it("a role=grid descendant's ArrowLeft is left alone (grid's own horizontal nav is not eaten)", () => {
      const onSelectChar = vi.fn();
      render(<TestPane chars={["a", "b", "c"]} currentChar="b" onSelectChar={onSelectChar} />);

      const event = dispatchKeyDown(screen.getByTestId("key-grid-child"), "ArrowLeft");

      expect(onSelectChar).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    });

    it("a role=tablist descendant's ArrowRight is left alone (the mode selector's own tab nav is not eaten)", () => {
      const onSelectChar = vi.fn();
      render(<TestPane chars={["a", "b", "c"]} currentChar="b" onSelectChar={onSelectChar} />);

      const event = dispatchKeyDown(screen.getByTestId("mode-tablist-child"), "ArrowRight");

      expect(onSelectChar).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    });

    it("an ordinary (non-grid, non-tablist) descendant's ArrowRight is STILL cycled by the pane handler", () => {
      const onSelectChar = vi.fn();
      render(<TestPane chars={["a", "b", "c"]} currentChar="b" onSelectChar={onSelectChar} />);

      dispatchKeyDown(screen.getByTestId("other-control"), "ArrowRight");

      expect(onSelectChar).toHaveBeenCalledTimes(1);
      expect(onSelectChar).toHaveBeenCalledWith("c");
    });
  });
});
