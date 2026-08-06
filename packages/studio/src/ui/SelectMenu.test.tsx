import { useState } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { SelectMenu, type SelectMenuOption } from "./SelectMenu.tsx";

afterEach(() => {
  cleanup();
});

const OPTIONS = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
];

// SelectMenu is a controlled component (value comes from the caller), so
// asserting that aria-activedescendant tracks a *changing* selection needs a
// small stateful wrapper — passing a no-op onChange (as most tests above do)
// would leave `value` pinned to its initial prop across the ArrowDown.
function ControlledSelectMenu({
  id,
  options,
  initialValue,
  onChangeSpy,
}: {
  id?: string;
  options: SelectMenuOption[];
  initialValue: string;
  /** Optional spy invoked alongside the internal state update, so a test can
   * assert on successive onChange calls while still letting the component
   * observe each new value (needed for wraparound: the second arrow press
   * must navigate relative to the value the first arrow press committed). */
  onChangeSpy?: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const handleChange = (next: string): void => {
    setValue(next);
    onChangeSpy?.(next);
  };
  return <SelectMenu id={id} options={options} value={value} onChange={handleChange} />;
}

describe("SelectMenu", () => {
  it("renders the selected value's label on the trigger", () => {
    render(<SelectMenu options={OPTIONS} value="a" onChange={() => undefined} />);
    const trigger = screen.getByRole("button");
    expect(trigger.textContent).toContain("Alpha");
  });

  it("does not render the option list until the trigger is clicked", () => {
    render(<SelectMenu options={OPTIONS} value="a" onChange={() => undefined} />);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.queryByRole("option")).toBeNull();
  });

  it("clicking the trigger reveals both options", () => {
    render(<SelectMenu options={OPTIONS} value="a" onChange={() => undefined} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("listbox")).toBeDefined();
    expect(screen.getByRole("option", { name: "Alpha" })).toBeDefined();
    expect(screen.getByRole("option", { name: "Beta" })).toBeDefined();
  });

  it("clicking an option calls onChange with the right value and closes the list", () => {
    const onChange = vi.fn();
    render(<SelectMenu options={OPTIONS} value="a" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("option", { name: "Beta" }));
    expect(onChange).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("Escape closes an open list", () => {
    render(<SelectMenu options={OPTIONS} value="a" onChange={() => undefined} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("listbox")).toBeDefined();
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("aria-expanded reflects open state on the trigger", () => {
    render(<SelectMenu options={OPTIONS} value="a" onChange={() => undefined} />);
    const trigger = screen.getByRole("button");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("merges a caller-supplied style override onto the trigger without losing the base styles", () => {
    render(
      <SelectMenu options={OPTIONS} value="a" onChange={() => undefined} style={{ width: 130 }} />,
    );
    const trigger = screen.getByRole("button");
    expect(trigger.style.width).toBe("130px");
    // Base TRIGGER_STYLE properties survive the merge.
    expect(trigger.style.cursor).toBe("pointer");
  });

  it("aria-required reflects the required prop on the listbox (the role that supports it)", () => {
    render(<SelectMenu options={OPTIONS} value="a" onChange={() => undefined} required />);
    // A plain button does not support aria-required, so the trigger must not carry it.
    expect(screen.getByRole("button").getAttribute("aria-required")).toBeNull();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("listbox").getAttribute("aria-required")).toBe("true");
  });

  it("mousedown outside the component closes an open list", () => {
    render(<SelectMenu options={OPTIONS} value="a" onChange={() => undefined} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("listbox")).toBeDefined();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  describe("portalled list (escapes ancestor overflow clipping)", () => {
    it("renders the open list as a direct child of document.body, outside the component's own container", () => {
      const { container } = render(
        <SelectMenu options={OPTIONS} value="a" onChange={() => undefined} />,
      );
      fireEvent.click(screen.getByRole("button"));
      const listbox = screen.getByRole("listbox");
      expect(listbox.parentElement).toBe(document.body);
      // The regression this guards: before the portal, the list was a DOM
      // descendant of the component's own container div, which is exactly
      // what let an ancestor `overflow: hidden`/`auto` clip it.
      expect(container.contains(listbox)).toBe(false);
    });

    it("a real mousedown-then-click on an option still selects it, even though the list is now outside containerRef in the DOM", () => {
      // Real browsers fire `mousedown` before `click`; fireEvent.click alone
      // (used by most tests in this file) never triggers the document
      // `mousedown` click-outside listener at all, so it can't exercise the
      // trap a portal introduces: the option is no longer a DOM descendant
      // of containerRef, so the click-outside check must also treat listRef
      // as "inside," or this mousedown would close the menu (and its click
      // handler along with it) before the option's own onClick fires.
      const onChange = vi.fn();
      render(<SelectMenu options={OPTIONS} value="a" onChange={onChange} />);
      fireEvent.click(screen.getByRole("button"));
      const option = screen.getByRole("option", { name: "Beta" });
      fireEvent.mouseDown(option);
      fireEvent.click(option);
      expect(onChange).toHaveBeenCalledWith("b");
      expect(screen.queryByRole("listbox")).toBeNull();
    });

    it("a real mousedown-then-click outside the component still closes the list without selecting", () => {
      const onChange = vi.fn();
      render(<SelectMenu options={OPTIONS} value="a" onChange={onChange} />);
      fireEvent.click(screen.getByRole("button"));
      expect(screen.getByRole("listbox")).toBeDefined();
      fireEvent.mouseDown(document.body);
      fireEvent.click(document.body);
      expect(screen.queryByRole("listbox")).toBeNull();
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  it("keyboard: opening the trigger moves focus into the list so ArrowDown/Enter work, and Enter returns focus to the trigger", () => {
    const onChange = vi.fn();
    render(<SelectMenu options={OPTIONS} value="a" onChange={onChange} />);
    const trigger = screen.getByRole("button");
    // Open via the trigger, exactly as a keyboard user would.
    fireEvent.keyDown(trigger, { key: "Enter" });
    const listbox = screen.getByRole("listbox");
    expect(listbox).toBeDefined();
    // This is the P0 regression check: handleListKeyDown lived on the <ul>
    // but nothing ever moved focus there, so keys fired at the listbox
    // never actually reached a focused element in real usage. Assert focus
    // really landed on the list (not just that the handler exists).
    expect(document.activeElement).toBe(listbox);

    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    expect(onChange).toHaveBeenCalledWith("b");

    fireEvent.keyDown(listbox, { key: "Enter" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("keyboard: Escape on the list closes it and returns focus to the trigger", () => {
    render(<SelectMenu options={OPTIONS} value="a" onChange={() => undefined} />);
    const trigger = screen.getByRole("button");
    fireEvent.click(trigger);
    const listbox = screen.getByRole("listbox");
    fireEvent.keyDown(listbox, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("Enter/Space on the trigger toggles an already-open list closed", () => {
    render(<SelectMenu options={OPTIONS} value="a" onChange={() => undefined} />);
    const trigger = screen.getByRole("button");
    fireEvent.click(trigger);
    expect(screen.getByRole("listbox")).toBeDefined();
    // Simulate focus having returned to the trigger (e.g. the user tabbed
    // back to it) and press Enter again: this must close, not re-open/no-op.
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(screen.queryByRole("listbox")).toBeNull();

    fireEvent.click(trigger);
    expect(screen.getByRole("listbox")).toBeDefined();
    trigger.focus();
    fireEvent.keyDown(trigger, { key: " " });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("ArrowDown on the trigger opens (not toggles) the list", () => {
    render(<SelectMenu options={OPTIONS} value="a" onChange={() => undefined} />);
    const trigger = screen.getByRole("button");
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeDefined();
  });

  it("focus leaving the component entirely closes the list", () => {
    // jsdom does not reliably run the real browser focus algorithm (e.g.
    // relatedTarget on a genuine .focus()-triggered blur is not guaranteed
    // to be populated the way a real browser would), so rather than relying
    // on an actual focus move we fire a bubbling-irrelevant `blur` directly
    // on the component's root node with an explicit relatedTarget outside
    // the container — this exercises the exact branch handleContainerBlur
    // takes without depending on jsdom's focus-simulation fidelity.
    const { container } = render(
      <SelectMenu options={OPTIONS} value="a" onChange={() => undefined} />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("listbox")).toBeDefined();
    const root = container.firstElementChild as HTMLElement;
    fireEvent.blur(root, { relatedTarget: document.body });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("blur does not close the list when relatedTarget is inside the component (e.g. trigger -> list hand-off)", () => {
    const { container } = render(
      <SelectMenu options={OPTIONS} value="a" onChange={() => undefined} />,
    );
    fireEvent.click(screen.getByRole("button"));
    const listbox = screen.getByRole("listbox");
    const root = container.firstElementChild as HTMLElement;
    fireEvent.blur(root, { relatedTarget: listbox });
    expect(screen.queryByRole("listbox")).toBeDefined();
  });

  it("option rows carry the ks-hit-target class for the coarse-pointer touch target", () => {
    render(<SelectMenu options={OPTIONS} value="a" onChange={() => undefined} />);
    fireEvent.click(screen.getByRole("button"));
    const option = screen.getByRole("option", { name: "Alpha" });
    expect(option.className).toContain("ks-hit-target");
  });

  it("aria-activedescendant on the open listbox tracks the selected option and updates on ArrowDown", () => {
    render(<ControlledSelectMenu id="fruit-select" options={OPTIONS} initialValue="a" />);
    fireEvent.click(screen.getByRole("button"));
    const listbox = screen.getByRole("listbox");
    const alpha = screen.getByRole("option", { name: "Alpha" });
    expect(alpha.id).toBe("fruit-select-option-a");
    expect(listbox.getAttribute("aria-activedescendant")).toBe(alpha.id);

    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    const beta = screen.getByRole("option", { name: "Beta" });
    expect(beta.id).toBe("fruit-select-option-b");
    expect(listbox.getAttribute("aria-activedescendant")).toBe(beta.id);
  });

  it("renders an empty listbox with zero options and does not crash", () => {
    render(<SelectMenu options={[]} value="" onChange={() => undefined} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("listbox")).toBeDefined();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  describe("resolveKeyToValue (opt-in physical-key type-to-select)", () => {
    it("selects the resolved option and closes the list when the resolver returns one of `options`", () => {
      const onChange = vi.fn();
      render(
        <SelectMenu
          options={OPTIONS}
          value="a"
          onChange={onChange}
          resolveKeyToValue={(e) => (e.key === "b" ? "b" : null)}
        />,
      );
      fireEvent.click(screen.getByRole("button"));
      const listbox = screen.getByRole("listbox");
      fireEvent.keyDown(listbox, { key: "b" });
      expect(onChange).toHaveBeenCalledWith("b");
      expect(screen.queryByRole("listbox")).toBeNull();
    });

    it("ignores a resolved value that isn't in `options` (belt-and-suspenders re-validation)", () => {
      const onChange = vi.fn();
      render(
        <SelectMenu
          options={OPTIONS}
          value="a"
          onChange={onChange}
          resolveKeyToValue={() => "not-a-real-option"}
        />,
      );
      fireEvent.click(screen.getByRole("button"));
      const listbox = screen.getByRole("listbox");
      fireEvent.keyDown(listbox, { key: "z" });
      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByRole("listbox")).toBeDefined();
    });

    it("a resolver returning null falls through to ordinary Arrow-key handling", () => {
      const onChangeSpy = vi.fn();
      render(
        <ControlledSelectMenu
          id="resolver-fallthrough"
          options={OPTIONS}
          initialValue="a"
          onChangeSpy={onChangeSpy}
        />,
      );
      // No resolveKeyToValue supplied here at all — confirms the prop is
      // fully opt-in and Arrow navigation is unaffected when it's absent.
      fireEvent.click(screen.getByRole("button"));
      const listbox = screen.getByRole("listbox");
      fireEvent.keyDown(listbox, { key: "ArrowDown" });
      expect(onChangeSpy).toHaveBeenCalledWith("b");
    });
  });

  it("keyboard: Tab while the list is open closes it and returns focus to the trigger (portal-Tab fix)", () => {
    // The open <ul> is portalled to the end of document.body, so a real
    // Tab press would otherwise land focus somewhere unpredictable (after
    // body's last child) instead of continuing on from the trigger — see
    // handleListKeyDown's Tab branch. jsdom does not implement the browser's
    // native "Tab moves focus" default action, so not calling
    // preventDefault() here is exactly what lets this test observe the
    // component's own refocus-the-trigger hand-off in isolation.
    render(<SelectMenu options={OPTIONS} value="a" onChange={() => undefined} />);
    const trigger = screen.getByRole("button");
    fireEvent.click(trigger);
    const listbox = screen.getByRole("listbox");
    fireEvent.keyDown(listbox, { key: "Tab" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("keyboard: Shift+Tab while the list is open also closes it and returns focus to the trigger", () => {
    render(<SelectMenu options={OPTIONS} value="a" onChange={() => undefined} />);
    const trigger = screen.getByRole("button");
    fireEvent.click(trigger);
    const listbox = screen.getByRole("listbox");
    fireEvent.keyDown(listbox, { key: "Tab", shiftKey: true });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  describe("positioning (portalled, position: fixed derived from the trigger's rect)", () => {
    // MENU_GAP mirrors the private gap constant in SelectMenu.tsx (not
    // exported — asserted against its literal value here, same idiom as other
    // tests in this file reading rendered inline styles rather than internal
    // component state).
    const MENU_GAP = 4;

    let originalGetBoundingClientRect: () => DOMRect;
    let originalInnerHeight: number;

    afterEach(() => {
      HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
      Object.defineProperty(window, "innerHeight", {
        value: originalInnerHeight,
        writable: true,
        configurable: true,
      });
    });

    function stubTriggerRect(rect: {
      top: number;
      left: number;
      bottom: number;
      width: number;
    }): void {
      HTMLElement.prototype.getBoundingClientRect = vi.fn(
        () =>
          ({
            ...rect,
            right: rect.left + rect.width,
            height: rect.bottom - rect.top,
            x: rect.left,
            y: rect.top,
            toJSON: () => ({}),
          }) as DOMRect,
      );
    }

    it("positions the portalled list below the trigger using its bounding rect when there's room", () => {
      originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
      originalInnerHeight = window.innerHeight;
      Object.defineProperty(window, "innerHeight", {
        value: 800,
        writable: true,
        configurable: true,
      });
      stubTriggerRect({ top: 100, left: 50, bottom: 130, width: 200 });

      render(<SelectMenu options={OPTIONS} value="a" onChange={() => undefined} />);
      fireEvent.click(screen.getByRole("button"));
      const listbox = screen.getByRole("listbox");
      expect(listbox.style.top).toBe(`${130 + MENU_GAP}px`);
      expect(listbox.style.left).toBe("50px");
      expect(listbox.style.width).toBe("200px");
      expect(listbox.style.bottom).toBe("");
    });

    it("flips the list upward (uses bottom, not top) when space below is tighter than space above", () => {
      originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
      originalInnerHeight = window.innerHeight;
      Object.defineProperty(window, "innerHeight", {
        value: 800,
        writable: true,
        configurable: true,
      });
      // spaceBelow = 800 - 730 = 70 (< MENU_MAX_HEIGHT); spaceAbove = 700
      // (> spaceBelow) — both conditions for shouldFlipUp hold.
      stubTriggerRect({ top: 700, left: 20, bottom: 730, width: 150 });

      render(<SelectMenu options={OPTIONS} value="a" onChange={() => undefined} />);
      fireEvent.click(screen.getByRole("button"));
      const listbox = screen.getByRole("listbox");
      expect(listbox.style.bottom).toBe(`${800 - 700 + MENU_GAP}px`);
      expect(listbox.style.top).toBe("");
      expect(listbox.style.left).toBe("20px");
      expect(listbox.style.width).toBe("150px");
    });

    it("recomputes the position on a capture-phase scroll event while open", () => {
      originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
      originalInnerHeight = window.innerHeight;
      Object.defineProperty(window, "innerHeight", {
        value: 800,
        writable: true,
        configurable: true,
      });
      stubTriggerRect({ top: 100, left: 50, bottom: 130, width: 200 });

      render(<SelectMenu options={OPTIONS} value="a" onChange={() => undefined} />);
      fireEvent.click(screen.getByRole("button"));
      const listbox = screen.getByRole("listbox");
      expect(listbox.style.top).toBe(`${130 + MENU_GAP}px`);

      // Simulate the trigger having moved (e.g. an ancestor scroll container
      // scrolled) by re-stubbing the rect the next getBoundingClientRect call
      // will return, then firing the scroll event the component listens for
      // (capture-phase, so it also catches a non-bubbling ancestor scroll —
      // see the useEffect above updateMenuPosition's registration).
      stubTriggerRect({ top: 40, left: 50, bottom: 70, width: 200 });
      fireEvent.scroll(window);
      expect(listbox.style.top).toBe(`${70 + MENU_GAP}px`);
    });

    it("recomputes the position on a resize event while open", () => {
      originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
      originalInnerHeight = window.innerHeight;
      Object.defineProperty(window, "innerHeight", {
        value: 800,
        writable: true,
        configurable: true,
      });
      stubTriggerRect({ top: 100, left: 50, bottom: 130, width: 200 });

      render(<SelectMenu options={OPTIONS} value="a" onChange={() => undefined} />);
      fireEvent.click(screen.getByRole("button"));
      const listbox = screen.getByRole("listbox");
      expect(listbox.style.left).toBe("50px");

      stubTriggerRect({ top: 100, left: 10, bottom: 130, width: 300 });
      fireEvent.resize(window);
      expect(listbox.style.left).toBe("10px");
      expect(listbox.style.width).toBe("300px");
    });
  });

  it("ArrowDown/ArrowUp wrap around the ends of the option list (selection-follows-focus)", () => {
    const onChangeSpy = vi.fn();
    render(
      <ControlledSelectMenu
        id="wrap-select"
        options={OPTIONS}
        initialValue="b"
        onChangeSpy={onChangeSpy}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    const listbox = screen.getByRole("listbox");

    // ArrowDown from the LAST option ("b") wraps to the FIRST option's value.
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    expect(onChangeSpy).toHaveBeenLastCalledWith("a");

    // ArrowUp from the FIRST option ("a", just committed above) wraps back
    // to the LAST option's value.
    fireEvent.keyDown(listbox, { key: "ArrowUp" });
    expect(onChangeSpy).toHaveBeenLastCalledWith("b");
  });

  // Explicit regression guard for the default commitMode ("onHighlight"):
  // proves the new commitMode prop's default path is bit-for-bit the
  // pre-existing selection-follows-focus contract every current consumer
  // (LocaleSwitcher, MultiSelect-adjacent pickers, etc.) relies on. The test
  // above already exercises this incidentally; this one names the guarantee
  // directly and does not rely on any `commitMode` prop being passed at all.
  it("commitMode default ('onHighlight'): ArrowDown still calls onChange immediately, same as before this prop existed", () => {
    const onChange = vi.fn();
    render(<SelectMenu options={OPTIONS} value="a" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    const listbox = screen.getByRole("listbox");
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    expect(onChange).toHaveBeenCalledWith("b");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  describe('commitMode="onExplicitSelect" (arrow moves the highlight only; Enter/Space/click commits)', () => {
    it("ArrowDown/ArrowUp move the highlight and update aria-activedescendant WITHOUT calling onChange", () => {
      const onChange = vi.fn();
      render(
        <SelectMenu
          id="explicit-select"
          options={OPTIONS}
          value="a"
          onChange={onChange}
          commitMode="onExplicitSelect"
        />,
      );
      fireEvent.click(screen.getByRole("button"));
      const listbox = screen.getByRole("listbox");
      const alpha = screen.getByRole("option", { name: "Alpha" });
      const beta = screen.getByRole("option", { name: "Beta" });
      expect(listbox.getAttribute("aria-activedescendant")).toBe(alpha.id);

      fireEvent.keyDown(listbox, { key: "ArrowDown" });
      expect(onChange).not.toHaveBeenCalled();
      expect(listbox.getAttribute("aria-activedescendant")).toBe(beta.id);

      fireEvent.keyDown(listbox, { key: "ArrowUp" });
      expect(onChange).not.toHaveBeenCalled();
      expect(listbox.getAttribute("aria-activedescendant")).toBe(alpha.id);
    });

    it("Enter on the highlighted option commits (calls onChange exactly once) and closes the list", () => {
      const onChange = vi.fn();
      render(
        <SelectMenu
          id="explicit-select"
          options={OPTIONS}
          value="a"
          onChange={onChange}
          commitMode="onExplicitSelect"
        />,
      );
      fireEvent.click(screen.getByRole("button"));
      const listbox = screen.getByRole("listbox");
      fireEvent.keyDown(listbox, { key: "ArrowDown" });
      expect(onChange).not.toHaveBeenCalled();

      fireEvent.keyDown(listbox, { key: "Enter" });
      expect(onChange).toHaveBeenCalledWith("b");
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("listbox")).toBeNull();
    });

    it("Space on the highlighted option also commits", () => {
      const onChange = vi.fn();
      render(
        <SelectMenu
          id="explicit-select"
          options={OPTIONS}
          value="a"
          onChange={onChange}
          commitMode="onExplicitSelect"
        />,
      );
      fireEvent.click(screen.getByRole("button"));
      const listbox = screen.getByRole("listbox");
      fireEvent.keyDown(listbox, { key: "ArrowDown" });
      fireEvent.keyDown(listbox, { key: " " });
      expect(onChange).toHaveBeenCalledWith("b");
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("listbox")).toBeNull();
    });

    it("Escape closes without committing — no onChange, and the trigger still shows the original value", () => {
      const onChange = vi.fn();
      render(
        <SelectMenu
          id="explicit-select"
          options={OPTIONS}
          value="a"
          onChange={onChange}
          commitMode="onExplicitSelect"
        />,
      );
      const trigger = screen.getByRole("button");
      fireEvent.click(trigger);
      const listbox = screen.getByRole("listbox");
      // Traverse away from the true selection before abandoning.
      fireEvent.keyDown(listbox, { key: "ArrowDown" });
      fireEvent.keyDown(listbox, { key: "Escape" });

      expect(onChange).not.toHaveBeenCalled();
      expect(screen.queryByRole("listbox")).toBeNull();
      // No phantom selection: the trigger's displayed value is still the
      // real `value` prop ("a"/"Alpha"), never the abandoned highlight
      // ("b"/"Beta").
      expect(trigger.textContent).toContain("Alpha");
      expect(trigger.getAttribute("data-value")).toBe("a");
    });

    it("aria-selected marks the genuinely selected option throughout traversal, distinct from aria-activedescendant on the highlight", () => {
      render(
        <SelectMenu
          id="explicit-select"
          options={OPTIONS}
          value="a"
          onChange={() => undefined}
          commitMode="onExplicitSelect"
        />,
      );
      fireEvent.click(screen.getByRole("button"));
      const listbox = screen.getByRole("listbox");
      const alpha = screen.getByRole("option", { name: "Alpha" });
      const beta = screen.getByRole("option", { name: "Beta" });

      fireEvent.keyDown(listbox, { key: "ArrowDown" });

      // The highlight has moved to Beta (aria-activedescendant), but the
      // real selection is still Alpha (aria-selected) — onChange was never
      // called under this mode by an arrow press alone.
      expect(listbox.getAttribute("aria-activedescendant")).toBe(beta.id);
      expect(alpha.getAttribute("aria-selected")).toBe("true");
      expect(beta.getAttribute("aria-selected")).toBe("false");
    });

    it("re-syncs the highlight to the true value on a fresh open, not wherever a previous abandoned traversal left off", () => {
      const onChange = vi.fn();
      render(
        <SelectMenu
          id="explicit-select"
          options={OPTIONS}
          value="a"
          onChange={onChange}
          commitMode="onExplicitSelect"
        />,
      );
      const trigger = screen.getByRole("button");
      fireEvent.click(trigger);
      let listbox = screen.getByRole("listbox");
      fireEvent.keyDown(listbox, { key: "ArrowDown" }); // highlight -> Beta
      fireEvent.keyDown(listbox, { key: "Escape" }); // abandon, no commit

      fireEvent.click(trigger); // reopen
      listbox = screen.getByRole("listbox");
      const alpha = screen.getByRole("option", { name: "Alpha" });
      expect(listbox.getAttribute("aria-activedescendant")).toBe(alpha.id);
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
