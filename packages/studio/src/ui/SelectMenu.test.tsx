import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { SelectMenu } from "./SelectMenu.tsx";

afterEach(() => {
  cleanup();
});

const OPTIONS = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
];

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

  it("mousedown outside the component closes an open list", () => {
    render(<SelectMenu options={OPTIONS} value="a" onChange={() => undefined} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("listbox")).toBeDefined();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
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
});
